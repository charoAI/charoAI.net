"""Step 1 — ingestion: turn raw documents into retrieval-sized chunks.

Chunks are the unit both tracks share: the extractor pulls triples out of
each chunk, the vector store embeds each chunk, and every fact in the graph
carries the id of the chunk it came from (its provenance).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Chunk:
    chunk_id: str  # "<file name>#<index>" — stable across runs
    source: str  # file the text came from
    text: str


def load_corpus(corpus_dir: Path, max_chars: int = 900) -> list[Chunk]:
    """Read every .md article and split it into paragraph-aligned chunks.

    Paragraphs are the unit of meaning in prose, so a chunk never splits a
    paragraph; adjacent paragraphs are merged until ``max_chars`` is reached.
    Splitting mid-sentence is the classic way to lose the relationship an
    extractor needs to see in one piece.
    """
    chunks: list[Chunk] = []
    for path in sorted(corpus_dir.glob("*.md")):
        paragraphs = [
            p.strip()
            for p in path.read_text(encoding="utf-8").split("\n\n")
            if p.strip() and not p.strip().startswith("#")
        ]
        merged: list[str] = []
        current = ""
        for para in paragraphs:
            if current and len(current) + len(para) + 2 > max_chars:
                merged.append(current)
                current = para
            else:
                current = f"{current}\n\n{para}" if current else para
        if current:
            merged.append(current)
        for index, text in enumerate(merged):
            chunks.append(
                Chunk(chunk_id=f"{path.name}#{index}", source=path.name, text=text)
            )
    return chunks
