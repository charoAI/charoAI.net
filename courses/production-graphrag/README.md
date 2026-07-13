# Production GraphRAG: Build Explainable LLM Apps with Knowledge Graphs

A full rebuild of the Packt Publishing live workshop of the same name
(Eventbrite, Saturday 11 July 2026, 1:30–5:00 PM UTC), reconstructed from
the published course description as self-paced material with a complete,
runnable codebase.

> **What the original covered** (from the listing): creating knowledge
> graphs from unstructured text by extracting entities and relationships;
> combining graph retrieval and semantic search for more accurate
> retrieval; how GraphRAG answers complex multi-hop questions across
> connected data; and building LLM chatbots that deliver grounded,
> explainable, context-aware responses — a hands-on build of a
> production-ready GraphRAG pipeline from raw text to a working chatbot.
> This rebuild covers the same ground: text → triples → graph → query →
> grounded generation.

## Quick start (60 seconds, no dependencies)

```bash
cd courses/production-graphrag
python tests/test_pipeline.py                    # "All tests passed."
python -m graphrag.chatbot --ask \
  "Who translated the paper that Luigi Menabrea wrote?"
```

The pipeline runs fully offline by default — deterministic extraction,
bag-of-words embeddings, extractive answers — so you can study every stage
without API keys. Set `OPENAI_API_KEY` and the same code switches to live
LLM extraction, real embeddings, and fluent cited generation. See
[SETUP.md](SETUP.md).

## Syllabus (mirrors the ~4-hour workshop arc)

| # | Lesson | Segment |
|---|--------|---------|
| 1 | [Why RAG, and where vanilla RAG breaks](lessons/01-why-rag-and-where-it-breaks.md) | demo + motivation |
| 2 | [Knowledge graphs and the GraphRAG architecture](lessons/02-knowledge-graphs-and-graphrag-architecture.md) | the reframe |
| 3 | [Entity and relationship extraction](lessons/03-entity-and-relationship-extraction.md) | hands-on block 1 |
| 4 | [Building the knowledge graph](lessons/04-building-the-knowledge-graph.md) | graph + Cypher + Neo4j |
| 5 | [Hybrid retrieval: graph + vector](lessons/05-hybrid-retrieval.md) | hands-on block 2 |
| 6 | [Grounded generation and the chatbot](lessons/06-grounded-generation-and-the-chatbot.md) | the finished product |
| 7 | [Production concerns](lessons/07-production-concerns.md) | scale, eval, security |

Exercises for every lesson: [exercises/EXERCISES.md](exercises/EXERCISES.md).

## The tech stack

| Concern | Course implementation (offline) | Production swap-in (live track) |
|---|---|---|
| Language | Python 3.10+, stdlib only | same |
| Corpus | 3 Wikipedia-style articles (Victorian computing) | your documents / Wikipedia API |
| Extraction | gold annotations replayed deterministically | OpenAI JSON-mode, schema-constrained (`gpt-4o-mini`) |
| Graph store | in-memory property graph | Neo4j 5 via Cypher export / driver (`docker-compose.yml`) |
| Embeddings | bag-of-words + cosine | `text-embedding-3-small` |
| Retrieval | entity linking → k-hop expansion → scored facts, fused with vector top-k | same code, better components |
| Generation | extractive, typed-answer selection | LLM with enforced inline citations |

The offline/live split is the point: every interface is identical across
tracks, so you learn the *architecture* first and swap in heavyweight
components later.

## Repository layout

```
courses/production-graphrag/
├── README.md, SETUP.md          you are here / environment guide
├── lessons/01…07-*.md           the course material
├── exercises/EXERCISES.md       per-lesson exercises + capstone
├── graphrag/                    the pipeline package
│   ├── ingest.py                chunking
│   ├── extract.py               triples (annotations | LLM)
│   ├── graph_store.py           property graph + Cypher + Neo4j adapter
│   ├── vector_store.py          embeddings + cosine search
│   ├── retrieve.py              hybrid retrieval
│   ├── generate.py              grounded answers + explanation traces
│   ├── pipeline.py              wiring; --stats, --dump-cypher
│   └── chatbot.py               the REPL; :why shows the audit trace
├── data/corpus/                 the source articles
├── data/annotations/            gold triples (offline extraction + eval set)
├── tests/test_pipeline.py       end-to-end tests, no dependencies
└── docker-compose.yml           Neo4j 5 for the production track
```

## What can't be rebuilt

The original ticket included a session recording, a certificate, and
community access — those were properties of attending live. The source
code, slides-equivalent lesson notes, architecture diagrams, and setup
guides are all here.
