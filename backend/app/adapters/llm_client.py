import requests
import logging
import json

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(
        self,
        model: str = "qwen-rag",
        host: str = "http://llm:8000",
        api_key: str = "chatai-llm-key-2026",
    ):
        self.model   = model
        self.host    = host.rstrip("/")
        self.api_key = api_key
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        })

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

    def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 512,
    ):
        """
        Same request as generate(), but with stream=True. vLLM's
        OpenAI-compatible server emits Server-Sent-Events lines like:

            data: {"choices":[{"delta":{"content":"Hello"}, ...}]}
            data: {"choices":[{"delta":{"content":" world"}, ...}]}
            data: [DONE]

        This yields just the text deltas, in order, as they arrive.
        """
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

