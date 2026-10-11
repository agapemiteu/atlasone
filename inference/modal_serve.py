"""Genuine N-ATLaS inference on Modal (Phase A).

Serves NCAIR1/N-ATLaS through vLLM's OpenAI-compatible server on one L4 GPU.
Scales to zero when idle, so it runs inside Modal's free monthly credit.

    modal deploy inference/serve.py

Requires two Modal secrets:
    huggingface    HF_TOKEN=<read token with N-ATLaS access>
    atlas-upstream ATLAS_UPSTREAM_KEY=<random string; only the Atlas One gateway holds it>
"""

import modal

MODEL_ID = "NCAIR1/N-ATLaS"
# Pinned weights revision: provenance for every response we attribute to N-ATLaS.
MODEL_REVISION = "e294476928aca9030e924ca27bb8e085e8581273"
SERVED_NAME = "n-atlas-8b"
PORT = 8000

image = (
    modal.Image.from_registry("nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .uv_pip_install("vllm==0.21.0")
    .env({"HF_XET_HIGH_PERFORMANCE": "1"})
)

hf_cache = modal.Volume.from_name("huggingface-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("vllm-cache", create_if_missing=True)

app = modal.App("atlas-one-inference")


@app.server(
    image=image,
    gpu="L4",  # 24 GB: fits 8B BF16 weights (~16 GB) plus KV cache for 8k context.
    scaledown_window=300,
    startup_timeout=900,
    volumes={"/root/.cache/huggingface": hf_cache, "/root/.cache/vllm": vllm_cache},
    secrets=[
        modal.Secret.from_name("huggingface"),
        modal.Secret.from_name("atlas-upstream"),
    ],
    port=PORT,
    unauthenticated=True,  # Auth is enforced by vLLM's --api-key below.
)
class Server:
    @modal.enter()
    def start(self):
        import os
        import subprocess

        cmd = [
            "vllm", "serve", MODEL_ID,
            "--revision", MODEL_REVISION,
            "--served-model-name", SERVED_NAME,
            "--host", "0.0.0.0",
            "--port", str(PORT),
            "--max-model-len", "8192",
            "--api-key", os.environ["ATLAS_UPSTREAM_KEY"],
        ]
        self.process = subprocess.Popen(cmd)

    @modal.exit()
    def stop(self):
        self.process.terminate()
