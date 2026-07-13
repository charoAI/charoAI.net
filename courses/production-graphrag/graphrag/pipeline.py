"""Wires the whole system together: ingest → extract → graph + vectors → QA.

    from graphrag.config import Settings
    from graphrag import pipeline

    rag = pipeline.build(Settings())
    answer = rag.ask("Who translated the paper that Luigi Menabrea wrote?")
    print(answer.text)

Run ``python -m graphrag.pipeline --stats`` for graph statistics or
``python -m graphrag.pipeline --dump-cypher > graph.cypher`` to export the
graph for Neo4j.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

from .config import CORPUS_DIR, Settings
from .extract import get_extractor
from .generate import Answer, get_answerer
from .graph_store import InMemoryGraphStore
from .ingest import Chunk, load_corpus
from .retrieve import HybridRetriever, RetrievalResult
from .vector_store import VectorStore, get_embedder


@dataclass
class GraphRAG:
    settings: Settings
    chunks: list[Chunk]
    graph: InMemoryGraphStore
    vectors: VectorStore
    retriever: HybridRetriever
    answerer: object
    last_retrieval: RetrievalResult | None = None

    def ask(self, question: str) -> Answer:
        self.last_retrieval = self.retriever.retrieve(question)
        return self.answerer.answer(self.last_retrieval)


def build(settings: Settings | None = None) -> GraphRAG:
    settings = settings or Settings()

    chunks = load_corpus(CORPUS_DIR, max_chars=settings.chunk_max_chars)

    extractor = get_extractor(settings)
    graph = InMemoryGraphStore()
    for chunk in chunks:
        result = extractor.extract(chunk)
        for entity in result.entities:
            graph.add_entity(entity)
        for triple in result.triples:
            graph.add_triple(triple)

    embedder = get_embedder(settings)
    vectors = VectorStore(embedder)
    for chunk in chunks:
        vectors.add(chunk)

    retriever = HybridRetriever(graph, vectors, settings)
    answerer = get_answerer(graph, settings)
    return GraphRAG(
        settings=settings,
        chunks=chunks,
        graph=graph,
        vectors=vectors,
        retriever=retriever,
        answerer=answerer,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the GraphRAG pipeline")
    parser.add_argument("--stats", action="store_true", help="print graph statistics")
    parser.add_argument(
        "--dump-cypher", action="store_true", help="print the graph as Cypher"
    )
    parser.add_argument(
        "--offline", action="store_true", help="force the offline track"
    )
    args = parser.parse_args()

    settings = Settings()
    if args.offline:
        settings.offline = True
    rag = build(settings)

    if args.dump_cypher:
        print(rag.graph.to_cypher())
        return
    stats = rag.graph.stats()
    print(f"Chunks:        {len(rag.chunks)}")
    print(f"Entities:      {stats['entities']}")
    print(f"Relationships: {stats['relationships']}")
    print(f"Entity types:  {', '.join(stats['entity_types'])}")
    print(f"Predicates:    {', '.join(stats['predicates'])}")


if __name__ == "__main__":
    main()
