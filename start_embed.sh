#!/bin/bash
set -euo pipefail

: "${VLLM_API_KEY:?VLLM_API_KEY must be set}"
: "${EMBED_MODEL:=BAAI/bge-base-en-v1.5}"
: "${EMBED_GPU_MEM_UTIL:=0.25}"
: "${EMBED_MAX_MODEL_LEN:=512}"

exec python -m vllm.entrypoints.openai.api_server \
  --model "$EMBED_MODEL" \
  --host 0.0.0.0 \
  --port 8003 \
  --task embed \
  --dtype float16 \
  --gpu-memory-utilization "$EMBED_GPU_MEM_UTIL" \
  --max-model-len "$EMBED_MAX_MODEL_LEN" \
  --served-model-name bge-base-en-v1.5 \
  --api-key "$VLLM_API_KEY" \
  --trust-remote-code