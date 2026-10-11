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

secrets = UserSecretsClient()
HF_TOKEN = secrets.get_secret("HF_TOKEN")
UPSTREAM_KEY = secrets.get_secret("ATLAS_UPSTREAM_KEY")
try:
    ADMIN_KEY = secrets.get_secret("ATLAS_ADMIN_KEY")
except Exception:
    ADMIN_KEY = None  # server still runs; registration is skipped with a clear message
os.makedirs(WORK, exist_ok=True)


def step(msg):
    print(f"\n[atlas] {msg}", flush=True)


def run(cmd, **kw):
    subprocess.run(cmd, shell=isinstance(cmd, str), check=True, **kw)


# 1. Prebuilt llama.cpp CUDA binaries + CUDA runtime libs (no compiling), pinned release.
if not os.path.isdir(BIN):
    step(f"Fetching llama.cpp {LLAMA_TAG} CUDA binaries")
    os.makedirs(BIN)
    for name in (f"llama-{LLAMA_TAG}-bin-ubuntu-cuda-12.8-x64.tar.gz",
                 f"cudart-llama-{LLAMA_TAG}-bin-ubuntu-cuda-12.8-x64.tar.gz"):
        run(f"wget -q {RELEASE}/{name} -O - | tar -xz -C {BIN}")
    run(f"rm -rf {LLAMA}")  # clear any earlier partial checkout
    run(f"git clone -q --depth 1 --branch {LLAMA_TAG} https://github.com/ggml-org/llama.cpp {LLAMA}")

SERVER_BIN = next(os.path.join(d, "llama-server") for d, _, files in os.walk(BIN) if "llama-server" in files)
lib_dirs = sorted({d for d, _, files in os.walk(BIN) if any(".so" in f for f in files)})
os.environ["LD_LIBRARY_PATH"] = ":".join(lib_dirs + [os.environ.get("LD_LIBRARY_PATH", "")])

# Fail fast, before the 16 GB download, if llama.cpp can't see the GPUs.
devices = subprocess.run([SERVER_BIN, "--list-devices"], capture_output=True, text=True)
print(devices.stdout + devices.stderr)
if "CUDA" not in devices.stdout + devices.stderr:
    raise SystemExit("No CUDA devices visible to llama.cpp. Is Accelerator set to 'GPU T4 x2'?")

# 2. Pinned N-ATLaS weights -> one F16 GGUF file.
if not os.path.exists(GGUF):
    from huggingface_hub import snapshot_download

    step(f"Downloading {MODEL_ID}@{MODEL_REVISION[:8]} (~16 GB)")
    src = snapshot_download(MODEL_ID, revision=MODEL_REVISION, token=HF_TOKEN, local_dir=f"{WORK}/hf")
    step("Converting to GGUF F16 (full precision)")
    run([sys.executable, f"{LLAMA}/convert_hf_to_gguf.py", src, "--outtype", "f16", "--outfile", GGUF],
        env={**os.environ, "PYTHONPATH": f"{LLAMA}/gguf-py"})
    run(f"rm -rf {WORK}/hf")  # free disk; the GGUF is all we serve

# 3. OpenAI-compatible server. 4 slots x 4k context, all layers on GPU, model's own chat template.
step("Starting N-ATLaS server")
server = subprocess.Popen(
    [SERVER_BIN, "-m", GGUF, "--alias", ALIAS, "--host", "0.0.0.0", "--port", str(PORT),
     "-ngl", "99", "-c", str(SLOTS * SLOT_CTX), "-np", str(SLOTS), "--jinja", "--api-key", UPSTREAM_KEY],
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
while health() != 200:
    if server.poll() is not None:
        raise SystemExit("llama-server exited:\n" + open(f"{WORK}/server.log").read()[-3000:])
    time.sleep(3)

# First request after load pays CUDA warm-up (~19s observed); pay it here, not in a user's request.
step("Warming up (one throwaway request)")
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

while True:
    time.sleep(60)
    if server.poll() is not None or tunnel.poll() is not None:
        raise SystemExit("Server or tunnel stopped. Re-run the cell (URL will change).")
    print(f"[atlas] {time.strftime('%H:%M:%S')} up, health={health()}", flush=True)
