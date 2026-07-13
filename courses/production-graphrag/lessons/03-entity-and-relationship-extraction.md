# Lesson 3 — Entity and Relationship Extraction

> Workshop segment: ~45 minutes, first big hands-on block — turning prose
> into triples with an LLM.

Extraction is where GraphRAG is won or lost. The graph can only ever be as
good as the triples that built it.

## The closed schema: the one decision that matters most

Open `graphrag/extract.py` and look at `ENTITY_TYPES` and `RELATION_SCHEMA`
before anything else. Extraction is **schema-constrained**: the extractor
may only emit entity types and predicates from a fixed vocabulary.

Why? Ask an unconstrained LLM to extract relations from three documents and
you'll get `WROTE`, `AUTHORED`, `IS_THE_AUTHOR_OF`, `PENNED`, and
`CREATED_TEXT` — five spellings of one relationship. Every downstream query
now needs to know all five. The graph fragments into an unqueryable pile of
strings.

Designing the schema is a data-modeling exercise, done *before* extraction:

- **Entity types** answer "what kinds of things exist in this domain?"
  Ours: `Person, Machine, Document, Concept, Component, Institution, Place`.
- **Predicates** answer "what questions will users ask?" We include
  `TRANSLATED` because "who translated X" is a question our users ask; we
  do not include `BORN_IN_YEAR` because our questions never need it.
  Retrieval requirements drive the schema, not completeness for its own sake.

## The extraction prompt

The live extractor (`LLMExtractor`) sends each chunk with this contract
(abridged — full text in `extract.py`):

```text
- Entity "type" MUST be one of: Person, Machine, Document, ...
- Triple "predicate" MUST be one of: WROTE, TRANSLATED, DESIGNED, ...
- Only extract facts stated in the passage. Do not use outside knowledge.
- "evidence" MUST be a short verbatim quote from the passage.
```

Three production techniques hiding in those four lines:

1. **JSON mode + temperature 0** — structured output you can parse,
   deterministic enough to cache.
2. **"Only facts stated in the passage"** — extraction hallucination is
   real; the model happily "extracts" facts it knows from training. This
   instruction plus the evidence quote requirement suppresses it.
3. **The evidence quote** — the model must point at the sentence it read.
   This becomes the `evidence` property on every edge, which becomes the
   explanation the chatbot shows the user. Provenance is built in at birth;
   you cannot bolt it on later.

And one in the parsing code: anything outside the schema is **discarded,
not repaired**. A triple with a novel predicate or an unknown entity is
dropped. Silent schema drift is worse than lost recall.

## Chunking interacts with extraction

The extractor sees one chunk at a time. If the chunker splits "Lovelace
translated Menabrea's paper" across two chunks, that edge is never
extracted. Hence `ingest.py` splits on paragraph boundaries only —
paragraphs are the smallest unit that reliably keeps a stated relationship
intact.

## Entity resolution: the hard part

"Ada Lovelace", "Lovelace", "Augusta Ada King" — one person, three surface
forms, and if they become three nodes your graph is silently broken: paths
that should connect don't.

The course code does a first pass — `slugify()` normalizes names into ids,
and the store merges alias lists (`add_entity`). The gold annotations carry
curated alias lists per entity. Production systems go further:

- alias tables and canonical-name dictionaries,
- embedding similarity between candidate duplicate nodes,
- an LLM adjudication pass ("are these the same entity?"),
- blocking rules (only compare nodes of the same type).

Under-merging fragments paths; over-merging (two John Smiths become one)
corrupts facts. Bias toward under-merging — it's recoverable.

## The offline trick: gold annotations as a test harness

The offline `AnnotationExtractor` replays hand-curated triples from
`data/annotations/triples.json`. Each carries the exact evidence substring;
a triple attaches to whichever chunk contains its evidence, so provenance
survives any chunker configuration.

This isn't just an offline-mode convenience — it's the **evaluation set**
for the live extractor. Run the LLM extractor over the same corpus and diff
against the annotations: missing triples are recall failures, novel ones
are precision failures (or genuinely new facts — inspect them). You cannot
improve an extractor you cannot score.

## Try it

```bash
python -m graphrag.pipeline --stats          # what got extracted
python - <<'EOF'
from graphrag import pipeline
from graphrag.config import Settings
rag = pipeline.build(Settings(offline=True))
for t in rag.graph.triples():
    print(f"{t.subject:>22} -{t.predicate}-> {t.obj}")
EOF
```

## Exercises

1. Add a fourth article to `data/corpus/` (e.g., about Mary Somerville) and
   annotate 4–6 triples for it in `triples.json`. Re-run the tests.
2. The schema has no `BORN_IN` predicate. Add it, annotate birth facts, and
   ask "Who was born in 1815?" — observe what the retriever does with a
   predicate whose tokens don't appear in questions ("born" does, "in"
   is a stopword). Scoring is lesson 5's topic.
3. (Live track) Run the LLM extractor and diff its output against the gold
   annotations. Compute precision and recall on the `TRANSLATED` edges.
