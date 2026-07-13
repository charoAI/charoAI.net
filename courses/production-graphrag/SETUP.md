# Setup Guide

## Offline track (recommended start) — zero dependencies

Requirements: Python 3.10+. Nothing else — no API keys, no services, no
`pip install`.

```bash
cd courses/production-graphrag

python tests/test_pipeline.py        # verify: "All tests passed."
python -m graphrag.pipeline --stats  # inspect the built graph
python -m graphrag.chatbot           # chat; :why shows the retrieval trace
```

Everything is deterministic: extraction replays gold annotations,
embeddings are bag-of-words vectors, answers are extractive.

## Live track — real LLM calls

```bash
pip install openai
export OPENAI_API_KEY=sk-...
python -m graphrag.chatbot           # auto-detects the key and goes live
```

With the key set: extraction uses schema-constrained JSON-mode LLM calls,
embeddings use `text-embedding-3-small`, and answers are generated with
inline `[F#]`/`[C#]` citations. Override models via `GRAPHRAG_LLM_MODEL` /
`GRAPHRAG_EMBEDDING_MODEL`. Force offline anytime with `--offline`.

## Neo4j track — production graph store

```bash
docker compose up -d                 # Neo4j 5 with APOC
pip install neo4j
```

Browser UI: http://localhost:7474 — login `neo4j` / `graphrag-course`.

Load the course graph:

```bash
python - <<'EOF'
from graphrag import pipeline
from graphrag.config import Settings
from graphrag.graph_store import Neo4jGraphStore

rag = pipeline.build(Settings(offline=True))
neo = Neo4jGraphStore("bolt://localhost:7687", "neo4j", "graphrag-course")
neo.load(rag.graph)
neo.close()
print("Loaded", rag.graph.stats())
EOF
```

Or export standalone Cypher: `python -m graphrag.pipeline --dump-cypher > graph.cypher`.

## Troubleshooting

- **`ModuleNotFoundError: graphrag`** — run commands from
  `courses/production-graphrag/` (the package lives there).
- **Chatbot answers look terse** — that's the offline extractive answerer
  by design; the live track generates fluent prose. The grounding is
  identical either way.
- **Neo4j auth failure** — the password is set in `docker-compose.yml`
  (`NEO4J_AUTH`); if you changed it, change the `Neo4jGraphStore` call too.
- **Port 7687 busy** — another Neo4j/bolt service is running; edit the port
  mapping in `docker-compose.yml`.
