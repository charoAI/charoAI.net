"""Runtime configuration for the course pipeline.

Everything defaults to fully-offline operation so the whole course can be
run without API keys or services. Setting OPENAI_API_KEY upgrades
extraction, embeddings, and generation to live LLM calls.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

COURSE_ROOT = Path(__file__).resolve().parent.parent
CORPUS_DIR = COURSE_ROOT / "data" / "corpus"
ANNOTATIONS_PATH = COURSE_ROOT / "data" / "annotations" / "triples.json"


def _default_offline() -> bool:
    return "OPENAI_API_KEY" not in os.environ


@dataclass
class Settings:
    """Tunable knobs for the pipeline, overridable from the CLI."""

    offline: bool = field(default_factory=_default_offline)
    llm_model: str = field(
        default_factory=lambda: os.environ.get("GRAPHRAG_LLM_MODEL", "gpt-4o-mini")
    )
    embedding_model: str = field(
        default_factory=lambda: os.environ.get(
            "GRAPHRAG_EMBEDDING_MODEL", "text-embedding-3-small"
        )
    )
    chunk_max_chars: int = 900
    vector_top_k: int = 3
    graph_hops: int = 2
    max_facts_in_context: int = 8
