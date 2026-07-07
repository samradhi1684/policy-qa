#!/bin/bash
# start_llm.sh — vLLM entrypoint inside the container.
# venv is already on PATH via the image, no `source` needed here.
set -euo pipefail

: "${VLLM_API_KEY:?VLLM_API_KEY must be set (env var or .env file)}"
: "${VLLM_MODEL:=Qwen/Qwen2.5-32B-Instruct-AWQ}"
: "${VLLM_GPU_MEM_UTIL:=0.88}"
: "${VLLM_MAX_MODEL_LEN:=8192}"

exec python -m vllm.entrypoints.openai.api_server \
  --model "$VLLM_MODEL" \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype float16 \
  --quantization awq_marlin \
  --gpu-memory-utilization "$VLLM_GPU_MEM_UTIL" \
  --max-model-len "$VLLM_MAX_MODEL_LEN" \
  --served-model-name qwen-rag \
  --api-key "$VLLM_API_KEY" \
  --trust-remote-code \
  --enable-prefix-caching \
  --enforce-eager
