"""Genuine N-ATLaS on Modal: the same runtime as inference/kaggle_serve.py, on a stable URL that scales to zero.

    modal deploy inference/modal_serve.py

Runs NCAIR1/N-ATLaS at the pinned revision, full F16 (no quantisation), with llama.cpp's OpenAI-compatible
server: 4 slots x 4096 tokens, the model's own chat template, protected by the gateway's upstream key.
One 24 GB GPU: Modal takes the first available of L4 and A10G, so a shortage of one type does not stop it.
The 16 GB weights are copied once from the private GGUF cache (made by kaggle_serve.py) into a Modal Volume;
later cold starts only load them (about 1-2 minutes). Idle for 15 minutes, the container stops (no cost).

Modal secret "atlas-one" must hold HF_TOKEN (read access to the GGUF cache) and ATLAS_UPSTREAM_KEY.
After the first deploy, register the URL with Atlas One once (it is stable): see docs/ARCHITECTURE.md.
"""

import os
import subprocess

import modal

MODEL_ID = "NCAIR1/N-ATLaS"
MODEL_REVISION = "e294476928aca9030e924ca27bb8e085e8581273"  # pinned for provenance, as on Kaggle
LLAMA_TAG = "b11552"  # pinned llama.cpp release (prebuilt CUDA 12.8 binaries), as on Kaggle
ALIAS = "n-atlas-8b"
PORT = 8000
SLOTS, SLOT_CTX = 4, 4096
GGUF_NAME = f"n-atlas-{MODEL_REVISION[:8]}-f16.gguf"
CACHE_REPO = "Agapemiteu/n-atlas-gguf-cache"
WEIGHTS = "/weights"
RELEASE = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}"

image = (
    # Plain Ubuntu: the pinned llama.cpp release ships its own CUDA runtime libraries and Modal provides the driver,
    # so a multi-GB CUDA base image would only slow every cold start.
    modal.Image.from_registry("ubuntu:24.04", add_python="3.12")
    .apt_install("wget", "ca-certificates", "libgomp1", "libcurl4")
    .pip_install("huggingface_hub==0.36.0")
    .run_commands(
        "mkdir -p /opt/llama",
        f"wget -q {RELEASE}/llama-{LLAMA_TAG}-bin-ubuntu-cuda-12.8-x64.tar.gz -O - | tar -xz -C /opt/llama",
        f"wget -q {RELEASE}/cudart-llama-{LLAMA_TAG}-bin-ubuntu-cuda-12.8-x64.tar.gz -O - | tar -xz -C /opt/llama",
    )
)
weights = modal.Volume.from_name("n-atlas-weights", create_if_missing=True)
app = modal.App("atlas-one-n-atlas", image=image)


def _server_binary() -> str:
    return next(os.path.join(d, "llama-server") for d, _, files in os.walk("/opt/llama") if "llama-server" in files)


@app.function(
    gpu=["L4", "A10G"],
    volumes={WEIGHTS: weights},
    secrets=[modal.Secret.from_name("atlas-one")],
    scaledown_window=15 * 60,
    timeout=24 * 60 * 60,
    max_containers=1,
)
@modal.concurrent(max_inputs=SLOTS * 2)
@modal.web_server(port=PORT, startup_timeout=15 * 60)
def serve():
    gguf = f"{WEIGHTS}/{GGUF_NAME}"
    if not os.path.exists(gguf):
        from huggingface_hub import hf_hub_download

        hf_hub_download(CACHE_REPO, GGUF_NAME, token=os.environ["HF_TOKEN"], local_dir=WEIGHTS)
        weights.commit()
    libs = sorted({d for d, _, files in os.walk("/opt/llama") if any(".so" in f for f in files)})
    env = {**os.environ, "LD_LIBRARY_PATH": ":".join(libs + [os.environ.get("LD_LIBRARY_PATH", "")])}
    subprocess.Popen(
        [_server_binary(), "-m", gguf, "--alias", ALIAS, "--host", "0.0.0.0", "--port", str(PORT),
         "-ngl", "99", "-c", str(SLOTS * SLOT_CTX), "-np", str(SLOTS), "--jinja", "--metrics",
         "--api-key", os.environ["ATLAS_UPSTREAM_KEY"]],
        env=env,
    )
