"""Genuine N-ATLaS inference on Kaggle's free GPUs (2x T4), no credit card needed.

Paste this whole file into ONE Kaggle notebook cell and run it.
Notebook settings: Accelerator = "GPU T4 x2", Internet = On (needs phone verification).
Kaggle Secrets (Add-ons > Secrets): HF_TOKEN, ATLAS_UPSTREAM_KEY, ATLAS_ADMIN_KEY (from .env.local).

Runs NCAIR1/N-ATLaS at full F16 precision (no quantisation) split across both GPUs with
llama.cpp's OpenAI-compatible server (4 parallel slots x 4096 tokens), exposes it through a
Cloudflare tunnel, sends one warm-up request, then registers the tunnel URL with the Atlas One
gateway so nothing needs to be pasted anywhere. The cell keeps running to keep the server up.
"""

import os
import re
import subprocess
import sys
import json
import time
import urllib.request

from kaggle_secrets import UserSecretsClient

MODEL_ID = "NCAIR1/N-ATLaS"
MODEL_REVISION = "e294476928aca9030e924ca27bb8e085e8581273"  # pinned for provenance
LLAMA_TAG = "b11552"  # pinned llama.cpp release (prebuilt CUDA 12.8 binaries)
ALIAS = "n-atlas-8b"
PORT = 8000
WORK = "/tmp/atlas"
LLAMA = f"{WORK}/llama.cpp"  # source checkout, only for the HF -> GGUF converter
BIN = f"{WORK}/bin"
GGUF = f"{WORK}/n-atlas-{MODEL_REVISION[:8]}-f16.gguf"
RELEASE = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}"
ATLAS_ONE_URL = "https://atlas-one.collins-coordinator-worker.workers.dev"
SLOTS, SLOT_CTX = 4, 4096
IDLE_SLEEP_MIN = 20  # stop after this long without any inference, to protect the free GPU quota

# Set by Atlas One when it wakes this notebook through Kaggle's API: a single-use, 30-minute token that is
# traded once for the keys below. Kaggle secrets are unavailable to API-started runs, and notebook versions
# are kept forever, so no long-lived key is ever written into this file.
BOOTSTRAP_TOKEN = None


def load_keys():
    """Kaggle secrets when run by hand; the bootstrap exchange when Atlas One started the run."""
    try:
        secrets = UserSecretsClient()
        hf, up = secrets.get_secret("HF_TOKEN"), secrets.get_secret("ATLAS_UPSTREAM_KEY")
        try:
            admin = secrets.get_secret("ATLAS_ADMIN_KEY")
        except Exception:
            admin = None  # server still runs; registration is skipped with a clear message
        return hf, up, admin
    except Exception as e:
        if not BOOTSTRAP_TOKEN:
            raise SystemExit(f"Kaggle secrets unavailable ({e}) and no bootstrap token: add the secrets to this notebook.")
        req = urllib.request.Request(
            f"{ATLAS_ONE_URL}/api/upstream/bootstrap",
            data=json.dumps({"token": BOOTSTRAP_TOKEN}).encode(),
            headers={"content-type": "application/json", "user-agent": "atlas-one-kaggle/1.0"},
        )
        keys = json.loads(urllib.request.urlopen(req, timeout=30).read())
        print("[atlas] keys received from Atlas One via single-use bootstrap token", flush=True)
        return keys["hf_token"], keys["upstream_key"], keys["admin_key"]


HF_TOKEN, UPSTREAM_KEY, ADMIN_KEY = load_keys()
os.makedirs(WORK, exist_ok=True)


def step(msg):
    print(f"\n[atlas] {msg}", flush=True)


def run(cmd, **kw):
    subprocess.run(cmd, shell=isinstance(cmd, str), check=True, **kw)


def report(stage, detail=""):
    """Tells Atlas One what is really happening, so users see live progress instead of a silent wait."""
    if not ADMIN_KEY:
        return
    try:
        urllib.request.urlopen(urllib.request.Request(
            f"{ATLAS_ONE_URL}/api/upstream/progress",
            data=json.dumps({"stage": stage, "detail": detail}).encode(),
            # Cloudflare rejects Python-urllib's default User-Agent with error 1010; identify ourselves.
            headers={"authorization": f"Bearer {ADMIN_KEY}", "content-type": "application/json",
                     "user-agent": "atlas-one-kaggle/1.0"},
        ), timeout=15).read()
    except Exception as e:  # progress is best effort; never stop the server for it
        print(f"  [progress] {stage} not reported: {e}", flush=True)


report("notebook_started", "Kaggle session running")

# 1. Prebuilt llama.cpp CUDA binaries + CUDA runtime libs (no compiling), pinned release.
if not os.path.isdir(BIN):
    report("fetching_runtime", f"llama.cpp {LLAMA_TAG}")
    step(f"Fetching llama.cpp {LLAMA_TAG} CUDA binaries")
    os.makedirs(BIN)
    for name in (f"llama-{LLAMA_TAG}-bin-ubuntu-cuda-12.8-x64.tar.gz",
                 f"cudart-llama-{LLAMA_TAG}-bin-ubuntu-cuda-12.8-x64.tar.gz"):
        run(f"wget -q {RELEASE}/{name} -O - | tar -xz -C {BIN}")

SERVER_BIN = next(os.path.join(d, "llama-server") for d, _, files in os.walk(BIN) if "llama-server" in files)
lib_dirs = sorted({d for d, _, files in os.walk(BIN) if any(".so" in f for f in files)})
os.environ["LD_LIBRARY_PATH"] = ":".join(lib_dirs + [os.environ.get("LD_LIBRARY_PATH", "")])

# Fail fast, before the 16 GB download, if llama.cpp can't see the GPUs.
devices = subprocess.run([SERVER_BIN, "--list-devices"], capture_output=True, text=True)
print(devices.stdout + devices.stderr)
if "CUDA" not in devices.stdout + devices.stderr:
    raise SystemExit("No CUDA devices visible to llama.cpp. Is Accelerator set to 'GPU T4 x2'?")

# 2. Pinned N-ATLaS weights -> one F16 GGUF file.
#    Fast path: a ready GGUF cached in YOUR private Hugging Face repo (skips the source checkout and the
#    ~2.5 min conversion). Slow path (first run): convert from NCAIR1/N-ATLaS, then upload the GGUF to
#    that private repo in the background so every later session takes the fast path. The cache is
#    private and only for running your own server; the N-ATLaS terms still apply to it.
from huggingface_hub import HfApi, hf_hub_download

hf = HfApi(token=HF_TOKEN)
CACHE_REPO = f"{hf.whoami()['name']}/n-atlas-gguf-cache"
GGUF_NAME = os.path.basename(GGUF)
cache_upload = None

if not os.path.exists(GGUF):
    report("downloading_model", f"{MODEL_ID}@{MODEL_REVISION[:8]}, about 16 GB")
    try:
        step(f"Fetching cached GGUF {CACHE_REPO}/{GGUF_NAME} (~16 GB, no conversion needed)")
        hf_hub_download(CACHE_REPO, GGUF_NAME, token=HF_TOKEN, local_dir=WORK)
    except Exception as e:
        print(f"  no usable cache yet ({type(e).__name__}); converting from {MODEL_ID}")
        from huggingface_hub import snapshot_download

        run(f"rm -rf {LLAMA}")
        run(f"git clone -q --depth 1 --branch {LLAMA_TAG} https://github.com/ggml-org/llama.cpp {LLAMA}")
        step(f"Downloading {MODEL_ID}@{MODEL_REVISION[:8]} (~16 GB)")
        src = snapshot_download(MODEL_ID, revision=MODEL_REVISION, token=HF_TOKEN, local_dir=f"{WORK}/hf")
        step("Converting to GGUF F16 (full precision)")
        run([sys.executable, f"{LLAMA}/convert_hf_to_gguf.py", src, "--outtype", "f16", "--outfile", GGUF],
            env={**os.environ, "PYTHONPATH": f"{LLAMA}/gguf-py"})
        run(f"rm -rf {WORK}/hf")  # free disk; the GGUF is all we serve

        def upload_cache():
            try:
                hf.create_repo(CACHE_REPO, private=True, exist_ok=True)
                hf.upload_file(path_or_fileobj=GGUF, path_in_repo=GGUF_NAME, repo_id=CACHE_REPO,
                               commit_message=f"F16 GGUF of {MODEL_ID}@{MODEL_REVISION} (llama.cpp {LLAMA_TAG})")
                print(f"\n[atlas] cache saved to private repo {CACHE_REPO}: next restarts skip conversion", flush=True)
            except Exception as err:  # never take the server down for a cache problem
                print(f"\n[atlas] cache upload skipped: {err}", flush=True)

        import threading

        cache_upload = threading.Thread(target=upload_cache, daemon=True)
        cache_upload.start()

# 3. OpenAI-compatible server. 4 slots x 4k context, all layers on GPU, model's own chat template.
step("Starting N-ATLaS server")
server = subprocess.Popen(
    [SERVER_BIN, "-m", GGUF, "--alias", ALIAS, "--host", "0.0.0.0", "--port", str(PORT),
     "-ngl", "99", "-c", str(SLOTS * SLOT_CTX), "-np", str(SLOTS), "--jinja", "--metrics",
     "--api-key", UPSTREAM_KEY],
    stdout=open(f"{WORK}/server.log", "w"), stderr=subprocess.STDOUT,
)

# 4. Public HTTPS URL (free Cloudflare quick tunnel, no account).
if not os.path.exists("/tmp/cloudflared"):
    run("wget -q -O /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/"
        "cloudflared-linux-amd64 && chmod +x /tmp/cloudflared")
tunnel_log = f"{WORK}/tunnel.log"
tunnel = subprocess.Popen(["/tmp/cloudflared", "tunnel", "--no-autoupdate", "--url", f"http://localhost:{PORT}"],
                          stdout=open(tunnel_log, "w"), stderr=subprocess.STDOUT)

url = None
for _ in range(60):
    found = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", open(tunnel_log).read())
    if found:
        url = found.group(0)
        break
    time.sleep(1)
if not url:
    raise SystemExit("Cloudflare tunnel did not start; see " + tunnel_log)


def health():
    try:
        return urllib.request.urlopen(f"http://localhost:{PORT}/health", timeout=5).status
    except Exception as e:
        return getattr(e, "code", None)


step("Loading weights onto both GPUs")
report("loading_weights", "both T4 GPUs")
while health() != 200:
    if server.poll() is not None:
        raise SystemExit("llama-server exited:\n" + open(f"{WORK}/server.log").read()[-3000:])
    time.sleep(3)

# First request after load pays CUDA warm-up (~19s observed); pay it here, not in a user's request.
step("Warming up (one throwaway request)")
report("warming_up")
warm = urllib.request.Request(
    f"http://localhost:{PORT}/v1/chat/completions",
    data=json.dumps({"model": ALIAS, "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 8}).encode(),
    headers={"authorization": f"Bearer {UPSTREAM_KEY}", "content-type": "application/json"},
)
urllib.request.urlopen(warm, timeout=300).read()


def register():
    """Tells the Atlas One gateway where this session's server is (URL changes every session)."""
    if not ADMIN_KEY:
        print("  [register] skipped: add the ATLAS_ADMIN_KEY Kaggle secret to auto-register.")
        return False
    req = urllib.request.Request(
        f"{ATLAS_ONE_URL}/api/upstream/register",
        data=json.dumps({"url": url, "model_id": MODEL_ID, "model_revision": MODEL_REVISION,
                         "runtime": f"llama.cpp@{LLAMA_TAG} f16"}).encode(),
        # Cloudflare rejects Python-urllib's default User-Agent with error 1010; identify ourselves.
        headers={"authorization": f"Bearer {ADMIN_KEY}", "content-type": "application/json",
                 "user-agent": "atlas-one-kaggle/1.0"},
    )
    # The tunnel's public DNS can take a few seconds to resolve for the gateway; retry briefly.
    for attempt in range(6):
        try:
            print("  [register]", urllib.request.urlopen(req, timeout=30).read().decode())
            return True
        except Exception as e:
            detail = e.read().decode()[:300] if hasattr(e, "read") else e
            print(f"  [register] attempt {attempt + 1} failed: {detail}")
            time.sleep(10)
    return False


step("Registering with Atlas One")
register()

step("READY")
print(f"  ATLAS_UPSTREAM_URL={url}")
print(f"  model={ALIAS}  weights={MODEL_ID}@{MODEL_REVISION}  runtime=llama.cpp@{LLAMA_TAG} f16")
print("  Keep this cell running. Stopping it (or the session ending) takes the server offline.")

def tokens_served():
    """Total tokens llama.cpp has generated (Prometheus counter from --metrics); None if unreadable."""
    try:
        text = urllib.request.urlopen(urllib.request.Request(
            f"http://localhost:{PORT}/metrics", headers={"authorization": f"Bearer {UPSTREAM_KEY}"}), timeout=5).read().decode()
        found = re.search(r"^llamacpp:tokens_predicted_total\s+([0-9.e+]+)", text, re.M)
        return float(found.group(1)) if found else None
    except Exception:
        return None


# Keep serving; go to sleep after IDLE_SLEEP_MIN minutes with no generated tokens (Atlas One wakes it
# again on demand). Never sleep while the model cache is still uploading.
last_tokens, last_activity = tokens_served(), time.time()
while True:
    time.sleep(60)
    if server.poll() is not None or tunnel.poll() is not None:
        report("failed", "server or tunnel stopped")
        raise SystemExit("Server or tunnel stopped. Re-run the cell (URL will change).")
    now_tokens = tokens_served()
    if now_tokens is not None and now_tokens != last_tokens:
        last_tokens, last_activity = now_tokens, time.time()
    idle_min = (time.time() - last_activity) / 60
    print(f"[atlas] {time.strftime('%H:%M:%S')} up, health={health()}, idle {idle_min:.0f} min", flush=True)
    if idle_min >= IDLE_SLEEP_MIN and not (cache_upload and cache_upload.is_alive()):
        report("sleeping", f"idle {IDLE_SLEEP_MIN} min")
        server.terminate()
        tunnel.terminate()
        step(f"Sleeping after {IDLE_SLEEP_MIN} idle minutes. Atlas One wakes N-ATLaS again on demand.")
        break
