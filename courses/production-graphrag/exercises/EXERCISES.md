# Exercises

Consolidated from the lessons, roughly in order of effort. Solutions are
deliberately not provided — every exercise is verifiable by running the
tests or reading a `:why` trace.

## Warm-ups (lessons 1–2)

1. **Refusal behavior.** Ask the chatbot something outside the corpus and
   confirm it declines instead of inventing. Find the code that makes this
   happen (`generate.py`, `_vector_fallback`).
2. **Manual extraction.** Extract triples by hand from the Science Museum
   sentence in `charles_babbage.md`; compare with the gold annotations.
   Note every judgment call you had to make — each one is a schema decision.

## Core (lessons 3–5)

3. **Extend the corpus.** Add an article about Mary Somerville to
   `data/corpus/`, annotate 4–6 triples (with evidence quotes!) in
   `data/annotations/triples.json`, re-run `python tests/test_pipeline.py`,
   then ask a question only answerable through your new edges.
4. **Schema evolution.** Add a `BORN_IN` predicate and birth-year facts.
   What does the fact scorer do with a predicate whose tokens rarely
   appear in questions? Propose a fix (hint: predicate synonyms).
5. **Hops as a dial.** Re-ask the Menabrea question with `--hops 1` and
   explain the failure from the trace. Then set hops to 4 and count how
   many irrelevant facts enter the candidate pool.
6. **Direction-aware traversal.** Make `neighborhood()` follow only
   outgoing edges; watch which tests fail and explain why reverse
   traversal is essential for `<-[TRANSLATED]-`-shaped questions.
7. **Cypher fluency.** Write and (Neo4j track) run:
   a. all machines Babbage designed;
   b. the 2-hop path from Menabrea to Lovelace;
   c. every fact whose provenance includes `analytical_engine.md#1`.

## Advanced (lessons 6–7)

8. **Path rendering.** Change `ExtractiveAnswerer` to print the seed →
   answer path (e.g., `Menabrea —WROTE→ paper ←TRANSLATED— Lovelace`)
   instead of a flat fact list.
9. **Graph-first fusion.** Return only the chunks cited in the top-5
   facts' provenance instead of independent vector top-k. Measure context
   shrinkage on the five test questions.
10. **Extractor evaluation (live track).** Run `LLMExtractor` over the
    corpus and score precision/recall against the gold annotations. Which
    predicates does the LLM miss? Which does it invent?
11. **Incremental updates.** Implement `remove_source(chunk_id)` on the
    graph store: strip that chunk from all provenance lists and delete
    edges left with none. Verify the double-provenance TRANSLATED edge
    survives removing one of its two sources.

## Capstone

12. **Your domain.** Pick 3–5 documents you know well. Design a schema
    (types + predicates driven by the questions you'd actually ask),
    annotate ~20 gold triples, adapt the five-question test pattern, and
    get it passing. Then, live track: swap in the LLM extractor and
    measure it against your gold set. This loop — schema, extraction,
    gold set, eval — is the transferable skill.
