"""Step 5 — hybrid retrieval: graph traversal + semantic search, fused.

The retrieval recipe:

1. Entity linking — find which graph nodes the question mentions (seeds).
2. Graph expansion — collect every fact within N hops of the seeds. This is
   what makes multi-hop questions answerable: the chain
   Menabrea -[WROTE]-> paper <-[TRANSLATED]- Lovelace
   is two hops, and no single text chunk contains both ends.
3. Fact scoring — rank the subgraph's facts by lexical affinity with the
   question (predicate matches weigh most: "who TRANSLATED..." should
   surface TRANSLATED edges).
4. Vector search — top-k chunks as narrative context alongside the facts.
"""

from __future__ import annotations

from dataclasses import dataclass

from .extract import Entity, Triple
from .graph_store import InMemoryGraphStore
from .ingest import Chunk
from .vector_store import VectorStore, tokenize


@dataclass
class RetrievalResult:
    question: str
    seeds: list[Entity]
    facts: list[tuple[Triple, float]]  # scored, best first
    chunks: list[tuple[Chunk, float]]  # scored, best first


class HybridRetriever:
    def __init__(self, graph: InMemoryGraphStore, vectors: VectorStore, settings):
        self.graph = graph
        self.vectors = vectors
        self.settings = settings

    def retrieve(self, question: str) -> RetrievalResult:
        seeds = self.graph.find_entities(question)
        subgraph = self.graph.neighborhood(
            [s.entity_id for s in seeds], hops=self.settings.graph_hops
        )
        question_tokens = set(tokenize(question))
        facts = sorted(
            ((t, self._score(question_tokens, t)) for t in subgraph),
            key=lambda pair: pair[1],
            reverse=True,
        )
        chunks = self.vectors.search(question, k=self.settings.vector_top_k)
        return RetrievalResult(
            question=question, seeds=seeds, facts=facts, chunks=chunks
        )

    def _score(self, question_tokens: set[str], triple: Triple) -> float:
        """Lexical affinity between the question and one fact.

        Predicate overlap dominates (x3): the verb of the question is the
        strongest signal for which edge type answers it. Entity-name overlap
        adds a smaller boost so facts about mentioned entities rank above
        facts about strangers.
        """
        predicate_tokens = set(triple.predicate.lower().split("_"))
        name_tokens: set[str] = set()
        for entity_id in (triple.subject, triple.obj):
            entity = self.graph.entities.get(entity_id)
            if entity:
                name_tokens.update(tokenize(entity.name))
        score = 3.0 * len(question_tokens & predicate_tokens)
        score += 1.0 * len(question_tokens & name_tokens)
        return score
