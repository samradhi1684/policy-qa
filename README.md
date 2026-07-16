# ChatAI — System & Deployment Reference

This document describes how the system is put together and how to stand it back up from scratch. It is deliberately backend/infra-heavy — the frontend is covered only enough to point at where it lives and how it talks to the backend.

---

## 1. High-level architecture

Five services, wired together with a single `docker-compose.yml` at the repo root:

| Service    | Container name    | Port | Image built from       | GPU? |
|------------|--------------------|------|-------------------------|------|
| `backend`  | `chatai-backend`   | 8080 | `backend/Dockerfile.backend` | No |
| `llm`      | `chatai-llm`       | 8000 | `Dockerfile.llm`        | Yes |
| `embedder` | `chatai-embedder`  | 8003 | `Dockerfile.embed`      | Yes |
| `reranker` | `chatai-reranker`  | 8001 | `Dockerfile.reranker`   | Yes |
| `postgres` | `chatai-postgres`  | 5432 | `postgres:16` (stock image) | No |

All five sit on one Docker network, `chatai-net`. The frontend (Next.js) is **not** in `docker-compose.yml` — it's run separately (see §7).

```
Browser ──> Next.js frontend (dev server / Vercel)
              │  NEXT_PUBLIC_BACKEND_URL
              ▼
        FastAPI backend  :8080  ── depends_on ──▶ postgres :5432
              │
              ├──▶ llm       :8000   (vLLM, Qwen2.5-32B-Instruct-AWQ, OpenAI-compatible)
              ├──▶ embedder  :8003   (vLLM, BAAI/bge-base-en-v1.5, --task embed)
              └──▶ reranker  :8001   (FastAPI + sentence-transformers CrossEncoder, BAAI/bge-reranker-v2-m3)
```

The `llm`, `embedder`, and `reranker` containers all require an NVIDIA GPU (`docker-compose.yml` reserves `driver: nvidia, capabilities: [gpu]` for each). `backend` and `postgres` do not need a GPU.

---

## 2. Repository layout (key paths only)

```
.
├── docker-compose.yml           # orchestrates all 5 backend-side services
├── .env                         # shared env file, loaded by every service via env_file
├── Dockerfile.llm               # vLLM chat-completions server image
├── Dockerfile.embed             # vLLM embeddings server image
├── Dockerfile.reranker          # reranker FastAPI server image
├── start_llm.sh                 # vLLM entrypoint (chat model)
├── start_embed.sh               # vLLM entrypoint (embedding model)
├── reranker_server.py           # reranker FastAPI app (/v1/rerank, /v1/score)
├── README-docker.md             # existing ops doc for llm+reranker (calling them from outside, security notes)
│
├── backend/
│   ├── Dockerfile.backend
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/                 # DB migrations
│   ├── app/
│   │   ├── main.py              # FastAPI app entrypoint, mounts all routers
│   │   ├── core/
│   │   │   ├── config.py        # pydantic Settings — reads backend/.env
│   │   │   ├── database.py      # async SQLAlchemy engine/session
│   │   │   └── security.py      # JWT helpers
│   │   ├── adapters/
│   │   │   ├── llm_client.py    # LLMClient / EmbeddingClient / RerankerClient — HTTP clients for the 3 GPU services
│   │   │   ├── embedder.py      # LOCAL sentence-transformers embedder (legacy path, see §6)
│   │   │   └── retriever.py     # LOCAL numpy cosine-sim retriever (legacy path, see §6)
│   │   ├── api/
│   │   │   ├── chats.py         # /chats — the actual chat/RAG endpoints the frontend uses
│   │   │   ├── document.py      # /document — serves raw source .md files
│   │   │   └── query.py         # /query — legacy single-shot endpoint (see §6)
│   │   ├── routers/auth.py      # /auth — register/login/me
│   │   ├── services/
│   │   │   ├── new_pipeline/pipeline.py   # ACTIVE RAG pipeline used by /chats
│   │   │   ├── rag_pipeline.py            # legacy RAG pipeline used by /query
│   │   │   ├── document_retriever.py, chat_service.py, message_service.py,
│   │   │   │   format_service.py, format_detector.py, file_generator.py,
│   │   │   │   download_service.py, memory_manager.py, planner.py,
│   │   │   │   prompt_builder.py, title_service.py, web_search.py, auth_service.py
│   │   ├── models/               # SQLAlchemy models: user.py, chat.py, message.py, source.py
│   │   ├── schemas/              # Pydantic request/response schemas
│   │   └── answering/            # entity-based retrieval indices (joblib) + build scripts
│   ├── scripts/index_documents.py   # builds storage/chunks.json + storage/embeddings.npy (legacy path)
│   ├── storage/                     # chunks.json + embeddings.npy consumed by app/adapters/retriever.py
│   ├── documents/                   # source .md documents served by /document/{id}
│   └── generated/                   # output files (PDF/DOCX/etc.) written by file_generator.py, served at /downloads
│
└── frontend/
    ├── app/                      # Next.js App Router pages (chat, signin, signup, onboarding)
    ├── components/
    ├── lib/api.ts                # all backend calls; reads NEXT_PUBLIC_BACKEND_URL
    ├── context/AuthContext.tsx
    ├── .env.local                # NEXT_PUBLIC_BACKEND_URL
    └── package.json
```

---

## 3. Environment variables

### 3.1 `/.env` (repo root — used by `docker-compose.yml`, shared into every backend-side container via `env_file: .env`)

```
LLM_API_KEY=<bearer token the backend uses to call the llm service>
EMBEDDING_API_KEY=<bearer token the backend uses to call the embedder service>
RERANKER_API_KEY=<bearer token the backend uses to call the reranker service>

POSTGRES_USER=<postgres username>
POSTGRES_PASSWORD=<postgres password>
POSTGRES_DB=<postgres db name>
DATABASE_URL=postgresql+asyncpg://<user>:<password>@postgres:5432/<db>

JWT_SECRET_KEY=<random secret, HS256 signing key>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

> ⚠️ The `.env` shipped in this bundle has real-looking key/secret values committed to it. **Rotate every one of these** (`LLM_API_KEY`, `EMBEDDING_API_KEY`, `RERANKER_API_KEY`, `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`) before any non-local deployment, and make sure `.env` is git-ignored going forward.

**Variables referenced in code but absent from `.env` — must be added if those features are used:**

| Variable | Used in | Purpose |
|---|---|---|
| `TAVILY_API_KEY` | `backend/app/services/web_search.py` | Tavily web-search integration |
| `OPENAI_API_KEY` | `backend/app/answering/z_entity_query.py` | OpenAI API calls for entity-based answering |
| `GOOGLE_CLIENT_ID` | `backend/app/core/config.py` (optional field, defaults to `None`) | Google OAuth, if enabled |

**Optional overrides consumed by the vLLM entrypoints** (`start_llm.sh`, `start_embed.sh`) — not required, each has a default:

| Variable | Default | Service |
|---|---|---|
| `VLLM_MODEL` | `Qwen/Qwen2.5-32B-Instruct-AWQ` | llm |
| `VLLM_GPU_MEM_UTIL` | `0.88` | llm |
| `VLLM_MAX_MODEL_LEN` | `8192` | llm |
| `EMBED_MODEL` | `BAAI/bge-base-en-v1.5` | embedder |
| `EMBED_GPU_MEM_UTIL` | `0.25` | embedder |
| `EMBED_MAX_MODEL_LEN` | `512` | embedder |
| `RERANKER_MODEL` | `BAAI/bge-reranker-v2-m3` | reranker |
| `RERANKER_BATCH_SIZE` | `8` | reranker |
| `RERANKER_MAX_LENGTH` | `1024` | reranker |
| `RERANKER_DEVICE` | `cuda` if available else `cpu` | reranker |

### 3.2 `backend/.env`

Loaded directly by `app/core/config.py` (`pydantic-settings`, `env_file=".env"`) when running the backend **outside** Docker Compose (e.g. local dev with `uvicorn` run from inside `backend/`). Must contain at minimum: `DATABASE_URL`, `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`.

### 3.3 `frontend/.env.local`

```
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

> ⚠️ **Mismatch to check**: the backend container listens on **8080** (see `Dockerfile.backend` `EXPOSE 8080` and its uvicorn `CMD`), but `frontend/.env.local` defaults to **8000** (which is actually the `llm` service's port). Set this to the correct backend URL/port for your environment before running the frontend, e.g. `http://127.0.0.1:8080`.

---

## 4. Bringing the GPU-backed services up (llm, embedder, reranker, postgres, backend)

Run from the repo root, where `docker-compose.yml` lives.

```bash
# 1. Copy/verify the root .env file exists with rotated secrets (see §3.1)

# 2. Build all images
docker compose build

# 3. Start everything in the background
docker compose up -d

# 4. Check status — all 5 should show "Up", and the GPU services "healthy" after their start-period
docker compose ps
```

Requirements before step 2/3 succeed:
- Docker with the **NVIDIA Container Toolkit** installed (`nvidia-smi` must work inside a test container) — `llm`, `embedder`, `reranker` each request 1 GPU via `deploy.resources.reservations.devices`.
- Enough VRAM for all three GPU services simultaneously (32B AWQ chat model + embedding model + reranker). GPU memory fractions are controlled by `VLLM_GPU_MEM_UTIL` / `EMBED_GPU_MEM_UTIL` (see §3.1) — tune down if you hit OOM.
- Model weights are pulled from Hugging Face on first boot and cached in the named volume `chatai-hf-cache` (mounted at `/root/.cache/huggingface` in `llm`, `embedder`, `reranker`). First boot will be slow; subsequent `docker compose up` should be fast since weights persist. `docker compose down` does **not** delete this volume — only `docker volume rm chatai-hf-cache` does.
- Postgres data persists in the named volume `chatai-pgdata`.

### 4.1 Everyday operations

```bash
docker compose ps                 # status
docker compose logs -f llm        # tail a specific service's logs
docker compose logs -f backend

docker compose restart backend    # restart one service
docker compose down               # stop everything (volumes persist)
docker compose up -d              # bring it back up

docker compose build backend      # rebuild after a Dockerfile/code change
docker compose up -d backend      # relaunch just that service with the new image
```

### 4.2 Known-working pinned versions

Pinned after hitting real driver/library incompatibilities — don't bump casually without re-testing:

- Base image for GPU services: `nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04` (llm, embedder); reranker uses `nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04`
- `vllm==0.7.3`
- `transformers==4.48.3`
- Host NVIDIA driver: 575.51.03 (CUDA 12.9)

### 4.3 Health checks

Every container defines a `HEALTHCHECK`:

| Service | Check |
|---|---|
| `backend` | `curl -sf http://localhost:8080/health` |
| `llm` | `curl -sf -H "Authorization: Bearer $VLLM_API_KEY" http://localhost:8000/v1/models` (start-period 240s — the 32B model takes a while to load) |
| `embedder` | same pattern on port 8003 (start-period 120s) |
| `reranker` | `curl -sf http://localhost:8001/health` (start-period 60s) |

---

## 5. Database migrations (Alembic)

`backend/alembic/env.py` reads `DATABASE_URL` from `app.core.config.settings` (so it respects whatever `.env` the backend is using) and converts it from the async driver to a sync one for migration purposes:

```python
sync_db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
```

`backend/alembic.ini` ships with a placeholder `sqlalchemy.url` (`postgresql://postgres:postgres@localhost:5432/qa_system`) — this is **overridden at runtime** by `env.py`, so it's safe to leave as-is; don't hand-edit it expecting it to take effect.

Run migrations from inside `backend/` (either locally with the venv active, or via `docker compose exec backend`):

```bash
cd backend
alembic upgrade head        # apply all migrations
alembic revision --autogenerate -m "message"   # generate a new migration after model changes
```

Two migrations currently exist: `caade6268d59_initial_schema.py` and `c01f2afdae89_add_onboarding_fields.py`.

Models registered against `Base.metadata` (imported explicitly in `alembic/env.py`, so any new model must be imported there too or autogenerate won't see it): `User`, `Chat`, `Message`, `Source`.

---

## 6. Two retrieval pipelines exist — know which is live

The codebase contains **two parallel RAG implementations**. Only one is wired into the endpoint the frontend actually calls.

| | Legacy path | Active path |
|---|---|---|
| Endpoint | `POST /query` (`app/api/query.py`) | `POST /chats/{chat_id}/query` and `/query/stream` (`app/api/chats.py`) |
| Pipeline class | `RAGPipeline` (`app/services/rag_pipeline.py`) | `pipeline` singleton in `app/services/new_pipeline/pipeline.py` |
| Embedding | Local `sentence-transformers/all-MiniLM-L6-v2` via `app/adapters/embedder.py` | Remote call to the `embedder` GPU service via `EmbeddingClient` |
| Reranking | none | Remote call to the `reranker` GPU service via `RerankerClient` |
| Generation | — | Remote call to the `llm` GPU service via `LLMClient` |
| Data source | `backend/storage/chunks.json` + `backend/storage/embeddings.npy` | `backend/app/answering/indices/*.joblib` (`Z_chunk_index.joblib`, `Z_entity_index.joblib`) |
| Built by | `backend/scripts/index_documents.py` | `backend/app/answering/z_entity_create.py` (and related scripts in `app/answering/`) |

**The frontend talks to `/chats/...`, so `new_pipeline/pipeline.py` is what actually runs in production.** `/query` and `rag_pipeline.py` appear to be an earlier iteration kept in the repo — verify with whoever owns the project before assuming it's dead code, but do not assume changes to `rag_pipeline.py`/`retriever.py`/`embedder.py` affect live behavior.

### 6.1 Rebuilding the active indices

Index paths are configurable via env vars (defaults shown), read by `app/services/new_pipeline/pipeline.py`:

```
CHUNK_INDEX_PATH=/app/app/answering/indices/Z_chunk_index.joblib
ENTITY_INDEX_PATH=/app/app/answering/indices/Z_entity_index.joblib
```

These are built from source `.md` files in `backend/documents/` — check `backend/app/answering/z_entity_create.py` for the build script and rerun it whenever `backend/documents/` content changes. Note in `docker-compose.yml` the host path `./backend/app/answering/indices` is bind-mounted into the container at `/app/app/answering/indices`, so rebuilding indices on the host and restarting the container (no rebuild needed) picks up new indices.

### 6.2 Rebuilding the legacy index (only relevant if `/query` is still used)

```bash
cd backend
python scripts/index_documents.py
```

This reads `backend/documents/*.md`, chunks with `tiktoken` (`cl100k_base`, chunk size 250 tokens / 50 overlap), embeds with the local `Embedder`, and writes `storage/chunks.json` + `storage/embeddings.npy`.

> ⚠️ `tiktoken` is imported by `scripts/index_documents.py` but is **not listed in `backend/requirements.txt`** — install it separately (`pip install tiktoken`) if you need to run this script.

---

## 7. Running the backend without Docker (local dev)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# ensure backend/.env exists with DATABASE_URL, JWT_SECRET_KEY, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
# ensure a reachable Postgres instance matches DATABASE_URL
alembic upgrade head

uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

The `llm`, `embedder`, and `reranker` services still need to be reachable at whatever hosts/ports the `.env` / default client constructors point to (`http://llm:8000`, `http://embedder:8003`, `http://reranker:8001` by default in `app/adapters/llm_client.py` — these are Docker Compose service names, so for local-backend/Docker-GPU-services hybrid setups, override with `localhost` and the mapped ports, or run everything via Compose).

---

## 8. Frontend

```bash
cd frontend
npm install
npm run dev      # next dev --webpack, default port 3000
```

- Set `NEXT_PUBLIC_BACKEND_URL` in `frontend/.env.local` to the backend's actual reachable URL (see the port mismatch warning in §3.3).
- `frontend/lib/api.ts` is the single place all backend calls are made from — check there for the exact endpoint contracts if the backend API changes.
- `npm run build && npm run start` for a production build; `npm run lint` for eslint.
- Stack: Next.js 16 (App Router), React 19, Tailwind 4, `react-markdown` for rendering chat responses.

---

## 9. Backend API surface (for reference)

| Prefix | Router file | Notes |
|---|---|---|
| `/auth` | `app/routers/auth.py` | `POST /register`, `POST /login`, `GET /me` |
| `/chats` | `app/api/chats.py` | `POST /`, `GET /`, `GET /search`, `GET /{chat_id}`, `POST /{chat_id}/query`, `POST /{chat_id}/query/stream`, `GET /{chat_id}/messages`, `POST /transcribe`, `DELETE /{chat_id}`, `GET /{chat_id}/export`, `POST /{chat_id}/regenerate` — **this is the live chat/RAG surface** |
| `/document` | `app/api/document.py` | `GET /{document_id}` — serves raw source `.md` from `backend/documents/` |
| `/query` | `app/api/query.py` | Legacy single-shot RAG endpoint — see §6 |
| `/downloads` | static mount (`app/main.py`) | Serves files written to `backend/generated/` (PDF/DOCX exports built by `file_generator.py`) |
| `/health`, `/` | `app/main.py` | Liveness / root info |

CORS is currently wide open (`allow_origins=["*"]`, `app/main.py`) — tighten before production.

---

## 10. Calling the GPU services directly (debugging)

See `README-docker.md` at the repo root for full curl/Python examples against the `llm` (`:8000`, OpenAI-compatible `/v1/chat/completions`) and `reranker` (`:8001`, `/v1/rerank` + `/v1/score`) services, plus a security section on why the current bearer-token-over-HTTP setup is not safe to expose to the public internet as-is (put a TLS reverse proxy in front, rotate keys, restrict by IP).

The `embedder` service (`:8003`) follows the same OpenAI-compatible pattern as `llm` but exposes `/v1/embeddings` instead of `/v1/chat/completions` (it's the same vLLM server, run with `--task embed`).

---

## 11. Known gaps / things to verify before deploying

- [ ] Rotate all secrets in root `.env` (see §3.1).
- [ ] Add `TAVILY_API_KEY` and `OPENAI_API_KEY` to `.env` if web-search / entity-answering features are used.
- [ ] Fix `frontend/.env.local` port mismatch (8000 → 8080, or whatever the backend is actually reachable at).
- [ ] Add `tiktoken` to `backend/requirements.txt` if `scripts/index_documents.py` / the legacy pipeline is still in use.
- [ ] Confirm whether `/query` + `rag_pipeline.py` (legacy pipeline) can be deleted, or is still needed.
- [ ] Restrict CORS (`app/main.py`) before production.
- [ ] Confirm GPU VRAM budget: 32B AWQ chat model + embedding model + reranker all resident at once, each with its own `GPU_MEM_UTIL` fraction.
# test
