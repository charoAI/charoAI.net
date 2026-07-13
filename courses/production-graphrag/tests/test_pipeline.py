"""End-to-end tests for the offline track. No dependencies — run with:

    python tests/test_pipeline.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from graphrag import pipeline
from graphrag.config import Settings


def main() -> None:
    rag = pipeline.build(Settings(offline=True))
    stats = rag.graph.stats()

    # -- construction ------------------------------------------------------
    assert len(rag.chunks) >= 6, f"too few chunks: {len(rag.chunks)}"
    assert stats["entities"] >= 18, f"too few entities: {stats['entities']}"
    assert stats["relationships"] >= 20, f"too few edges: {stats['relationships']}"

    # Every annotated triple must have found a home chunk (evidence strings
    # must stay in sync with the corpus).
    predicates = set(stats["predicates"])
    assert "TRANSLATED" in predicates and "INPUT_INSPIRED_BY" in predicates

    # The same fact from two documents becomes one edge, two provenances.
    key = ("ada_lovelace", "TRANSLATED", "menabrea_paper")
    assert len(rag.graph.provenance[key]) == 2, rag.graph.provenance[key]

    # -- entity linking ------------------------------------------------------
    seeds = {e.entity_id for e in rag.graph.find_entities("What did Menabrea write?")}
    assert "luigi_menabrea" in seeds

    # -- multi-hop question answering (the workshop's demo questions) -------
    cases = [
        ("Who translated the paper that Luigi Menabrea wrote?", "Ada Lovelace"),
        ("What machine inspired the input mechanism of the Analytical Engine?", "Jacquard loom"),
        ("Which professor at Cambridge designed the machine that Ada Lovelace wrote about?", "Charles Babbage"),
        ("Who invented the Jacquard loom?", "Joseph Marie Jacquard"),
        ("Who tutored Ada Lovelace?", "Mary Somerville"),
    ]
    for question, expected in cases:
        answer = rag.ask(question)
        assert expected in answer.text, (
            f"\nQ: {question}\nexpected: {expected}\ngot:\n{answer.text}"
            f"\ntrace:\n{answer.explanation}"
        )
        assert answer.facts, f"answer to {question!r} carries no grounding facts"

    # -- explainability ------------------------------------------------------
    answer = rag.ask("Who translated the paper that Luigi Menabrea wrote?")
    assert "evidence" in answer.explanation
    assert "ada_lovelace.md" in answer.explanation

    # -- graceful degradation -------------------------------------------------
    answer = rag.ask("What is the airspeed velocity of an unladen swallow?")
    assert "no graph facts" in answer.text.lower() or "no grounded" in answer.text.lower()

    # -- Cypher export ---------------------------------------------------------
    cypher = rag.graph.to_cypher()
    assert "MERGE (n:Person {id: 'ada_lovelace'})" in cypher
    assert "MERGE (a)-[r:TRANSLATED]->(b)" in cypher

    print("All tests passed.")
    print(f"  chunks={len(rag.chunks)} entities={stats['entities']} "
          f"relationships={stats['relationships']}")


if __name__ == "__main__":
    main()
