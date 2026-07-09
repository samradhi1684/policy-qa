import requests
import httpx
import logging
import json

logger = logging.getLogger(__name__)


class LLMClient:
    """
    HTTP client for the vLLM OpenAI-compatible server.

    - generate() / generate_stream_sync() : blocking, use only from a
      thread (run_in_threadpool) or from non-async code paths (title
      generation, doc-title generation, etc.).
    - agenerate() / generate_stream() : native async, safe to call
      directly from an `async def` FastAPI route. Uses a shared
      httpx.AsyncClient with connection pooling so many concurrent
      requests can be in flight at once without blocking the event
      loop or each other.
    """

    def __init__(
        self,
        model: str = "qwen-rag",
        host: str = "http://llm:8000",
        api_key: str = "chatai-llm-key-2026",
    ):
        self.model   = model
        self.host    = host.rstrip("/")
        self.api_key = api_key

        # Sync session — used only for blocking call sites that are
        # already isolated in a worker thread.
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        })

        # Shared async client — reused across requests so concurrent
        # users share one connection pool instead of opening a new
        # TCP/TLS connection per request. Created lazily so importing
        # this module never requires a running event loop.
        self._async_client: httpx.AsyncClient | None = None

    def _get_async_client(self) -> httpx.AsyncClient:
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
                timeout=httpx.Timeout(300.0),
                limits=httpx.Limits(
                    max_connections=100,
                    max_keepalive_connections=50,
                ),
            )
        return self._async_client

    async def aclose(self):
        if self._async_client is not None:
            await self._async_client.aclose()
            self._async_client = None

    # ------------------------------------------------------------------
    # Blocking API (call only from a thread / threadpool)
    # ------------------------------------------------------------------

    def generate(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 512,
    ) -> str:
        response = self._session.post(
            f"{self.host}/v1/chat/completions",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            timeout=300,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()

    def generate_stream_sync(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 512,
    ):
        """Blocking generator. Only safe to iterate from inside a worker
        thread (e.g. via run_in_threadpool) — iterating it directly on
        the event loop will stall every other concurrent request."""
        with self._session.post(
            f"{self.host}/v1/chat/completions",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True,
            },
            timeout=300,
            stream=True,
        ) as response:
            response.raise_for_status()

            for line in response.iter_lines():
                if not line:
                    continue

                decoded = line.decode("utf-8")

                if not decoded.startswith("data: "):
                    continue

                data = decoded[len("data: "):].strip()

                if data == "[DONE]":
                    break

                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    logger.warning(f"Skipping malformed stream chunk: {data!r}")
                    continue

                delta = (
                    chunk.get("choices", [{}])[0]
                    .get("delta", {})
                    .get("content")
                )

                if delta:
                    yield delta

    # ------------------------------------------------------------------
    # Async API (safe to call directly from `async def` routes)
    # ------------------------------------------------------------------

    async def agenerate(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 512,
    ) -> str:
        client = self._get_async_client()
        response = await client.post(
            f"{self.host}/v1/chat/completions",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()

    async def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 512,
    ):
        """
        Native async generator. Awaiting/iterating this yields control
        back to the event loop between chunks, so other concurrent
        requests (other users' streams, other routes) keep making
        progress while this one waits on network I/O from vLLM.

        vLLM itself does continuous batching, so multiple concurrent
        generate_stream() calls will genuinely interleave token
        generation on the GPU side too — this just stops the backend
        from serializing them artificially in front of that.
        """
        client = self._get_async_client()
        async with client.stream(
            "POST",
            f"{self.host}/v1/chat/completions",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True,
            },
        ) as response:
            response.raise_for_status()

            async for line in response.aiter_lines():
                if not line:
                    continue

                if not line.startswith("data: "):
                    continue

                data = line[len("data: "):].strip()

                if data == "[DONE]":
                    break

                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    logger.warning(f"Skipping malformed stream chunk: {data!r}")
                    continue

                delta = (
                    chunk.get("choices", [{}])[0]
                    .get("delta", {})
                    .get("content")
                )

                if delta:
                    yield delta


class EmbeddingClient:
    """
    HTTP client for an OpenAI-compatible /v1/embeddings endpoint
    (served via vLLM --task embed). Drop-in replacement for the
    local SentenceTransformer encode() call.
    """

    def __init__(
        self,
        model: str = "bge-base-en-v1.5",
        host: str = "http://embedder:8003",
        api_key: str = "chatai-embed-key-2026",
    ):
        self.model   = model
        self.host    = host.rstrip("/")
        self.api_key = api_key
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        })

    def embed(self, text: str) -> list[float]:
        return self.embed_batch([text])[0]

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            response = self._session.post(
                f"{self.host}/v1/embeddings",
                json={"model": self.model, "input": texts},
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()["data"]
            data.sort(key=lambda x: x["index"])
            return [item["embedding"] for item in data]
        except Exception as e:
            logger.error(f"EmbeddingClient.embed_batch failed: {e}")
            raise


class RerankerClient:
    """
    HTTP client for the BGE reranker server running on port 8001.
    Drop-in replacement for the local CrossEncoder.
    """

    def __init__(
        self,
        host: str = "http://reranker:8001",
        api_key: str = "chatai-reranker-key-2026",
        batch_size: int = 32,
    ):
        self.host       = host.rstrip("/")
        self.batch_size = batch_size
        self._session   = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        })

    def predict(self, pairs: list[list[str]]) -> list[float]:
        """
        Same interface as CrossEncoder.predict(pairs).
        pairs: [[query, doc], [query, doc], ...]
        Returns a list of float scores in the same order.
        """
        if not pairs:
            return []

        query = pairs[0][0]
        docs  = [p[1] for p in pairs]

        try:
            response = self._session.post(
                f"{self.host}/v1/score",
                json={
                    "model":      "bge-reranker",
                    "text_1":     query,
                    "text_2":     docs,
                    "batch_size": self.batch_size,
                },
                timeout=120,
            )
            response.raise_for_status()

            data = response.json()["data"]

            data.sort(key=lambda x: x["index"])

            return [item["score"] for item in data]
        except Exception as e:
            logger.error(f"RerankerClient.predict failed: {e}")
            raise

    def rerank(
        self,
        query: str,
        documents: list[str],
        top_k: int | None = None,
        batch_size: int | None = None,
    ) -> list[dict]:
        """
        Calls /v1/rerank and returns results sorted by score descending.
        Each result: {"index": int, "score": float, "document": str}
        """
        response = self._session.post(
            f"{self.host}/v1/rerank",
            json={
                "model":            "bge-reranker",
                "query":            query,
                "documents":        documents,
                "top_k":            top_k,
                "batch_size":       batch_size or self.batch_size,
                "return_documents": True,
            },
            timeout=120,
        )
        response.raise_for_status()
        return response.json()["results"]