# Lesson 4 — Building the Knowledge Graph

> Workshop segment: ~30 minutes — from a list of triples to a queryable
> graph, in memory and in Neo4j.

## The property graph store

`graphrag/graph_store.py` implements the whole store in ~100 lines. The
data structures are worth internalizing because every graph database is a
scaled-up version of the same three ideas:

```python
self.entities:  dict[str, Entity]              # id -> typed node
self._triples:  dict[(subj, pred, obj), Triple] # edge identity = the triple
self._adjacency: dict[str, set[TripleKey]]      # node id -> incident edges
```

- **Edge identity is the triple itself.** Adding `(ada, TRANSLATED, paper)`
  twice creates one edge. When the same fact is extracted from two
  different documents, the store appends to the edge's *provenance list*
  instead of duplicating: corroboration, not duplication. (Our corpus
  states the translation fact in two articles — inspect
  `rag.graph.provenance[("ada_lovelace", "TRANSLATED", "menabrea_paper")]`
  and you'll find two chunk ids.)
- **The adjacency index** maps each node to its incident edges. This is
  what makes k-hop expansion O(edges touched) instead of O(all edges) —
  the difference between a graph and a list of facts.

## Querying: two primitives power everything

1. `find_entities(text)` — **entity linking**: word-boundary alias matching
   from free text to nodes. This anchors a user's question to the graph.
2. `neighborhood(seed_ids, hops)` — **k-hop expansion**: breadth-first
   collection of every edge within `hops` of the seeds. The retrieved
   subgraph is the candidate pool for answering.

Everything in lesson 5 composes these two calls.

## Cypher: the production query language

In production the store is a graph database, and the lingua franca is
Cypher. The mental model: **draw the pattern in ASCII art**.

```cypher
// Who translated the paper that Menabrea wrote?
MATCH (m:Person {name: "Luigi Menabrea"})-[:WROTE]->(paper)<-[:TRANSLATED]-(who:Person)
RETURN who.name, paper.name

// Everything within 2 hops of Ada Lovelace (our neighborhood() call):
MATCH (a:Person {name: "Ada Lovelace"})-[r*1..2]-(other)
RETURN a, r, other

// Aggregation that defeated vector RAG in lesson 1:
MATCH (b:Person {name: "Charles Babbage"})-[:DESIGNED]->(m:Machine)
RETURN collect(m.name)
```

`()` is a node, `[]` an edge, `->` direction, `*1..2` a path length range.
The first query *is* our multi-hop demo question, expressed declaratively.

## Round-tripping to Neo4j

The in-memory store exports itself as idempotent Cypher:

```bash
python -m graphrag.pipeline --dump-cypher > graph.cypher
```

Output looks like:

```cypher
MERGE (n:Person {id: 'ada_lovelace'}) SET n.name = 'Ada Lovelace';
MATCH (a {id: 'ada_lovelace'}), (b {id: 'menabrea_paper'})
  MERGE (a)-[r:TRANSLATED]->(b)
  SET r.evidence = '...', r.sources = ['ada_lovelace.md#1', 'analytical_engine.md#1'];
```

`MERGE` (not `CREATE`) makes the script re-runnable — match-or-create is
the idempotency primitive that makes incremental rebuilds safe.

To run it for real:

```bash
docker compose up -d          # Neo4j 5 at bolt://localhost:7687 (see docker-compose.yml)
pip install neo4j
python - <<'EOF'
from graphrag import pipeline
from graphrag.config import Settings
from graphrag.graph_store import Neo4jGraphStore

rag = pipeline.build(Settings(offline=True))
neo = Neo4jGraphStore("bolt://localhost:7687", "neo4j", "graphrag-course")
neo.load(rag.graph)
neo.close()
EOF
```

Then open http://localhost:7474 and run the Cypher queries above against
your own graph. Neo4j 5 also has native vector indexes, which is why it's
the default choice for hybrid GraphRAG: one database serves both retrieval
substrates.

## Provenance as a first-class citizen

Notice what our edges carry: `evidence` (the supporting quote) and
`sources` (chunk ids). This is the load-bearing design decision of the
whole course. When the chatbot answers in lesson 6, its "Grounded in:"
section is read *directly off the edges*. Explainability isn't a feature
added at the end — it's a property of the data model.

## Exercises

1. Write the Cypher for: "What machine did the inventor of the Jacquard
   loom's punched cards influence?" (Follow `INVENTED_BY` backwards, then
   `INPUT_INSPIRED_BY` backwards.)
2. `neighborhood()` treats edges as undirected when expanding. Make it
   direction-aware (only follow outgoing edges) and watch test case 1 in
   `tests/test_pipeline.py` fail. Why does the Menabrea question *need*
   reverse traversal?
3. (Neo4j track) Load the graph and run
   `MATCH (n) RETURN labels(n)[0] AS type, count(*) ORDER BY count(*) DESC`.
   Compare with `python -m graphrag.pipeline --stats`.
