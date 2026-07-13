"""Production GraphRAG — course companion package.

A complete, runnable GraphRAG pipeline: raw text -> triples -> knowledge
graph -> hybrid retrieval -> grounded, explainable answers.

The package has two tracks:

* Offline track (default): zero dependencies beyond the standard library.
  Extraction replays curated gold annotations, embeddings are bag-of-words
  vectors, and answers are extractive. Everything is deterministic so the
  course can be followed without API keys.
* Live track: set OPENAI_API_KEY to switch extraction, embeddings, and
  generation to real LLM calls, and use the Neo4j adapter for a production
  graph store.
"""

__version__ = "1.0.0"
