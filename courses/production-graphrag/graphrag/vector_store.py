"""Step 4 — semantic search over chunks.

GraphRAG does not replace vector search; it complements it. The graph
answers "how are things connected?", the vector index answers "which passage
sounds most like this question?". Production systems run both and fuse.

Offline the embedder is a bag-of-words term-frequency vector with cosine
similarity — deterministic, dependency-free, and good enough to demonstrate
the retrieval mechanics. The live track swaps in OpenAI embeddings without
changing any other code.
"""

from __future__ import annotations

import math
import re
from collections import Counter

from .ingest import Chunk

STOPWORDS = frozenset(
    "a an and are as at be by did for from had has he her his in is it its of "
    "on or she that the this to was were what when which who whom with".split()
)


def tokenize(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOPWORDS]


class BagOfWordsEmbedder:
    """Deterministic offline embedder: sparse term-frequency vectors."""

    def embed(self, text: str) -> dict[str, float]:
        return dict(Counter(tokenize(text)))


class OpenAIEmbedder:
    """Live embedder backed by the OpenAI embeddings API."""

    def __init__(self, model: str):
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - live track only
            raise RuntimeError(
                "The live track needs the openai package: pip install openai"
            ) from exc
        self._client = OpenAI()
        self._model = model

    def embed(self, text: str) -> list[float]:
        response = self._client.embeddings.create(model=self._model, input=text)
        return response.data[0].embedding


def cosine(a, b) -> float:
    if isinstance(a, dict):
        shared = set(a) & set(b)
        dot = sum(a[t] * b[t] for t in shared)
        norm_a = math.sqrt(sum(v * v for v in a.values()))
        norm_b = math.sqrt(sum(v * v for v in b.values()))
    else:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class VectorStore:
    def __init__(self, embedder):
        self._embedder = embedder
        self._items: list[tuple[Chunk, object]] = []

    def add(self, chunk: Chunk) -> None:
        self._items.append((chunk, self._embedder.embed(chunk.text)))

    def search(self, query: str, k: int = 3) -> list[tuple[Chunk, float]]:
        query_vec = self._embedder.embed(query)
        scored = [(chunk, cosine(query_vec, vec)) for chunk, vec in self._items]
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored[:k]


def get_embedder(settings):
    if settings.offline:
        return BagOfWordsEmbedder()
    return OpenAIEmbedder(settings.embedding_model)
