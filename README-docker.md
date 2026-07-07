# chatai-container — Usage Guide

Your GPU server exposes two OpenAI-compatible-ish HTTP APIs, running as Docker
containers:

| Service   | Port | Purpose                          | Docs           |
|-----------|------|-----------------------------------|----------------|
| LLM       | 8000 | Qwen2.5-32B-Instruct-AWQ chat/completions | `/docs` (Swagger) |
| Reranker  | 8001 | BGE reranker — `/v1/rerank`, `/v1/score`  | — |

Both are already running via `docker compose` in `/root/chatai-container`.
This doc covers how to **call them from another machine/app** (e.g. your
CustomRAG application) rather than local debugging — see the earlier setup
notes for build/troubleshooting history.

---

## 1. Find your server's reachable address

```bash
# On the GPU server:
curl -4 ifconfig.me        # public IP, if this box has one directly reachable
ip addr show                # private/VPN IP, if you're calling from inside the same network
```

Use whichever address your client application can actually route to. If the
server is behind a VPC/VPN, use the private IP. If it's a bare cloud box with
a public IP, you'll want to lock it down first — see **Security** below
before opening it to "anywhere."

## 2. Open the ports (firewall)

Docker punches through `ufw`/`iptables` by default in unusual ways — always
verify explicitly rather than assuming:

```bash
# ufw example
ufw allow 8000/tcp
ufw allow 8001/tcp
ufw status
```

If you're on a cloud provider (AWS/GCP/Azure/etc.), you also need a
security-group / firewall rule at the provider level for ports 8000 and 8001,
independent of the OS firewall.

## 3. Confirm both services are up

```bash
cd /root/chatai-container
docker compose ps
```

Both `chatai-llm` and `chatai-reranker` should show `Up` (and `healthy` once
past their startup grace period).

---

## 4. Calling the LLM endpoint

The LLM server speaks the standard **OpenAI Chat Completions** schema, so any
OpenAI-compatible client library works if you just point it at your server.

### curl

```bash
curl -s http://YOUR_SERVER_IP:8000/v1/chat/completions \
  -H "Authorization: Bearer devansh-qwen-test" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-rag",
    "messages": [{"role": "user", "content": "Summarize retrieval-augmented generation in one sentence."}],
    "max_tokens": 200,
    "temperature": 0.3
  }'
```

### Python (openai SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://YOUR_SERVER_IP:8000/v1",
    api_key="devansh-qwen-test",  # matches VLLM_API_KEY in .env
)

resp = client.chat.completions.create(
    model="qwen-rag",
    messages=[{"role": "user", "content": "Explain vector search briefly."}],
    max_tokens=200,
)
print(resp.choices[0].message.content)
```

### Python (plain requests, no SDK)

```python
import requests

resp = requests.post(
    "http://YOUR_SERVER_IP:8000/v1/chat/completions",
    headers={"Authorization": "Bearer devansh-qwen-test"},
    json={
        "model": "qwen-rag",
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 100,
    },
)
print(resp.json()["choices"][0]["message"]["content"])
```

Streaming works too — pass `"stream": true` and iterate over the
server-sent-events response, exactly as with OpenAI's API.

---

## 5. Calling the reranker endpoint

Two routes: `/v1/score` (pairwise relevance score) and `/v1/rerank`
(rank a list of documents against a query).

### Rerank documents against a query

```bash
curl -s http://YOUR_SERVER_IP:8001/v1/rerank \
  -H "Authorization: Bearer devansh-qwen-test" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bge-reranker",
    "query": "What is the capital of France?",
    "documents": [
      "Paris is the capital and largest city of France.",
      "Berlin is the capital of Germany.",
      "The Eiffel Tower is in Paris."
    ],
    "top_k": 2,
    "return_documents": true
  }'
```

### Score a single query against multiple candidates

```bash
curl -s http://YOUR_SERVER_IP:8001/v1/score \
  -H "Authorization: Bearer devansh-qwen-test" \
  -H "Content-Type: application/json" \
  -d '{
    "text_1": "What is the deadline for submitting Form XYZ?",
    "text_2": [
      "Form XYZ must be submitted by March 31st.",
      "The cafeteria is closed on Sundays."
    ]
  }'
```

### Python example (typical RAG rerank step)

```python
import requests

def rerank(query: str, documents: list[str], top_k: int = 5) -> list[dict]:
    resp = requests.post(
        "http://YOUR_SERVER_IP:8001/v1/rerank",
        headers={"Authorization": "Bearer devansh-qwen-test"},
        json={"query": query, "documents": documents, "top_k": top_k, "return_documents": True},
    )
    resp.raise_for_status()
    return resp.json()["results"]  # sorted best-first, each: {index, score, document}
```

---

## 6. Wiring this into CustomRAG

A typical RAG call sequence against this stack:

1. Embed + retrieve candidate chunks from your vector store (unrelated to
   this server — that's your own retrieval layer).
2. POST the query + candidate chunks to `http://YOUR_SERVER_IP:8001/v1/rerank`
   to get the best-ordered subset.
3. Build your prompt with the top-`k` reranked chunks and POST to
   `http://YOUR_SERVER_IP:8000/v1/chat/completions` for the final answer.

Point your CustomRAG app's config at:

```
LLM_BASE_URL=http://YOUR_SERVER_IP:8000/v1
LLM_API_KEY=devansh-qwen-test
RERANKER_BASE_URL=http://YOUR_SERVER_IP:8001
RERANKER_API_KEY=devansh-qwen-test
```

If CustomRAG (or its underlying client lib) expects a strictly OpenAI-shaped
base URL, `http://YOUR_SERVER_IP:8000/v1` is the correct target — the `/v1`
suffix matters, most OpenAI-compatible clients append `/chat/completions`
themselves.

---

## Security — read this before exposing to "anywhere"

Right now, both services are protected only by a **static bearer token**
(`devansh-qwen-test`) sent in plaintext over **unencrypted HTTP**. That's
fine for testing on a private network. It is **not safe to expose directly
to the public internet as-is** — anyone who sniffs the traffic or guesses/
leaks the token gets full access to your GPU compute. Before calling this
"from anywhere":

1. **Put a reverse proxy with TLS in front of it** (nginx, Caddy, or
   Traefik) so traffic is encrypted, and only expose 443 externally —
   keep 8000/8001 bound to localhost or a private network, not `0.0.0.0`
   on the public interface. Caddy is the simplest for this (auto-TLS via
   Let's Encrypt).
2. **Rotate the API keys** in `.env` from the placeholder
   `devansh-qwen-test` to long random secrets before going beyond your own
   testing.
3. **Restrict by IP/firewall** if you know which machines will call this
   (your CustomRAG app's server IP, your office IP, etc.) rather than
   opening 8000/8001 to `0.0.0.0/0`.
4. Consider rate limiting at the proxy layer — nothing here currently
   throttles requests, and a 32B model on one GPU can only serve so much
   concurrent load (roughly 10x concurrency at 8192 tokens/request, per the
   startup log: `Maximum concurrency for 8192 tokens per request: 10.71x`).

If you want, I can set up the Caddy reverse-proxy container next — it's a
small addition to `docker-compose.yml` and gets you `https://your-domain`
with real TLS in about 10 lines of config.

---

## Everyday operations

```bash
cd /root/chatai-container

docker compose ps                 # status
docker compose logs -f llm        # tail LLM logs
docker compose logs -f reranker   # tail reranker logs

docker compose restart llm        # restart just the LLM
docker compose down               # stop everything
docker compose up -d              # start everything (weights already cached, fast)

docker compose build llm          # rebuild after a Dockerfile.llm change
docker compose up -d llm          # relaunch with the new image
```

Weights persist in the `chatai-hf-cache` Docker volume — `docker compose down`
does **not** delete them; only `docker volume rm chatai-hf-cache` would.

## Known-working pinned versions (for reference)

These were pinned after hitting real driver/library incompatibilities during
setup — don't casually bump them without re-testing:

- Base image: `nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04`
- `vllm==0.7.3`
- `transformers==4.48.3`
- Host driver: 575.51.03 (CUDA 12.9)