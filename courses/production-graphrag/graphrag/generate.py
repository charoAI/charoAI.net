"""Step 6 — grounded generation: answer only from retrieved evidence.

Both answerers return an ``Answer`` carrying the exact facts and chunks the
reply rests on, plus a human-readable explanation trace. That trace is the
"explainable" in explainable GraphRAG: every claim can be walked back to a
graph edge, its evidence quote, and the source chunk it was extracted from.

* ``ExtractiveAnswerer`` (offline) does no text generation at all — it picks
  the best answer entity from the retrieved subgraph and presents the facts.
* ``LLMAnswerer`` (live) writes fluent prose but is instructed to use ONLY
  the supplied context and to cite fact/chunk ids inline.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .extract import Triple
from .graph_store import InMemoryGraphStore
from .ingest import Chunk
from .retrieve import RetrievalResult

# Maps a question's wh-phrase to the entity types that can answer it.
# "Who ..." wants a Person; "what machine ..." wants a Machine. Typed nodes
# are one of the quiet superpowers of graph retrieval — a vector index has
# no idea what a Person is.
TYPE_NOUNS = {
    "who": "Person",
    "person": "Person",
    "professor": "Person",
    "mathematician": "Person",
    "engineer": "Person",
    "machine": "Machine",
    "device": "Machine",
    "computer": "Machine",
    "document": "Document",
    "paper": "Document",
    "note": "Document",
    "institution": "Institution",
    "university": "Institution",
    "museum": "Institution",
}


def expected_types(question: str) -> set[str] | None:
    tokens = re.findall(r"[a-z]+", question.lower())
    for i, token in enumerate(tokens):
        if token == "who" or token == "whom":
            return {"Person"}
        if token in ("what", "which"):
            for hint in tokens[i + 1 : i + 3]:
                if hint in TYPE_NOUNS:
                    return {TYPE_NOUNS[hint]}
            return None
    return None


@dataclass
class Answer:
    text: str
    facts: list[Triple] = field(default_factory=list)
    chunks: list[Chunk] = field(default_factory=list)
    explanation: str = ""


def humanize(triple: Triple, graph: InMemoryGraphStore) -> str:
    subject = graph.entities[triple.subject].name
    obj = graph.entities[triple.obj].name
    relation = triple.predicate.replace("_", " ").lower()
    return f"{subject} — {relation} → {obj}"


class ExtractiveAnswerer:
    """Offline answerer: selection over the subgraph, zero generation."""

    def __init__(self, graph: InMemoryGraphStore, settings):
        self.graph = graph
        self.settings = settings

    def answer(self, retrieval: RetrievalResult) -> Answer:
        facts = [
            (t, s)
            for t, s in retrieval.facts[: self.settings.max_facts_in_context]
            if s > 0
        ]
        top_chunks = [c for c, _ in retrieval.chunks[:1]]

        if not facts:
            return self._vector_fallback(retrieval, top_chunks)

        candidate = self._best_answer_entity(retrieval, facts)
        lines = []
        if candidate:
            lines.append(f"**{self.graph.entities[candidate].name}**")
            supporting = [t for t, _ in facts if candidate in (t.subject, t.obj)]
        else:
            supporting = [t for t, _ in facts[:3]]
        for t in supporting[:3]:
            lines.append(f"- {humanize(t, self.graph)}")

        used = supporting[:3] or [t for t, _ in facts[:3]]
        return Answer(
            text="\n".join(lines),
            facts=used,
            chunks=top_chunks,
            explanation=self._trace(retrieval, facts),
        )

    def _best_answer_entity(self, retrieval, facts) -> str | None:
        """The answer to a wh-question is usually an entity that (a) sits in
        the retrieved subgraph, (b) is NOT mentioned in the question, and
        (c) has the type the wh-phrase asks for. Sum each candidate's fact
        scores and take the best."""
        wanted = expected_types(retrieval.question)
        seed_ids = {s.entity_id for s in retrieval.seeds}
        scores: dict[str, float] = {}
        for triple, score in facts:
            for entity_id in (triple.subject, triple.obj):
                if entity_id in seed_ids:
                    continue
                entity = self.graph.entities.get(entity_id)
                if entity is None:
                    continue
                if wanted and entity.entity_type not in wanted:
                    continue
                scores[entity_id] = scores.get(entity_id, 0.0) + score
        if not scores:
            return None
        return max(scores, key=scores.get)

    def _vector_fallback(self, retrieval, top_chunks) -> Answer:
        if not top_chunks:
            return Answer(text="I have no grounded evidence to answer that.")
        chunk = top_chunks[0]
        return Answer(
            text=(
                "No graph facts matched, falling back to semantic search. "
                f"Closest passage ({chunk.chunk_id}):\n> {chunk.text[:300]}..."
            ),
            chunks=top_chunks,
            explanation="No seed entities were linked in the question, so "
            "graph expansion returned nothing — vector search only.",
        )

    def _trace(self, retrieval, facts) -> str:
        lines = [
            f"Question: {retrieval.question}",
            "Seed entities (linked in question): "
            + (", ".join(s.name for s in retrieval.seeds) or "none"),
            f"Graph expansion: {self.settings.graph_hops} hops → "
            f"{len(retrieval.facts)} candidate facts, top scored:",
        ]
        for triple, score in facts[:5]:
            key = (triple.subject, triple.predicate, triple.obj)
            sources = ", ".join(self.graph.provenance.get(key, [triple.provenance]))
            lines.append(
                f"  [{score:>4.1f}] {humanize(triple, self.graph)}"
                f'  — evidence: "{triple.evidence}" ({sources})'
            )
        lines.append(
            "Vector search top chunks: "
            + ", ".join(f"{c.chunk_id} ({s:.2f})" for c, s in retrieval.chunks)
        )
        return "\n".join(lines)


GENERATION_SYSTEM_PROMPT = """\
You answer questions using ONLY the numbered facts and passages provided.
Rules:
- Every claim must cite its support inline, like [F2] or [C1].
- If the context does not contain the answer, say so plainly. Never guess.
- Prefer facts (F#) for relationships and passages (C#) for descriptions.
- Be concise: one short paragraph.
"""


class LLMAnswerer:
    """Live answerer: fluent generation, hard-grounded in the context."""

    def __init__(self, graph: InMemoryGraphStore, settings):
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - live track only
            raise RuntimeError(
                "The live track needs the openai package: pip install openai"
            ) from exc
        self._client = OpenAI()
        self.graph = graph
        self.settings = settings

    def answer(self, retrieval: RetrievalResult) -> Answer:
        facts = [
            t
            for t, s in retrieval.facts[: self.settings.max_facts_in_context]
            if s > 0
        ]
        chunks = [c for c, _ in retrieval.chunks]

        context_lines = ["Facts from the knowledge graph:"]
        for i, t in enumerate(facts, 1):
            context_lines.append(
                f'F{i}. {humanize(t, self.graph)} (evidence: "{t.evidence}")'
            )
        context_lines.append("\nPassages:")
        for i, c in enumerate(chunks, 1):
            context_lines.append(f"C{i} ({c.chunk_id}): {c.text}")
        context_lines.append(f"\nQuestion: {retrieval.question}")

        response = self._client.chat.completions.create(
            model=self.settings.llm_model,
            messages=[
                {"role": "system", "content": GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": "\n".join(context_lines)},
            ],
            temperature=0,
        )
        return Answer(
            text=response.choices[0].message.content,
            facts=facts,
            chunks=chunks,
            explanation="LLM generation grounded in the cited facts/passages above.",
        )


def get_answerer(graph: InMemoryGraphStore, settings):
    if settings.offline:
        return ExtractiveAnswerer(graph, settings)
    return LLMAnswerer(graph, settings)
