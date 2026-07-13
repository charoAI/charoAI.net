# Lesson 6 — Grounded Generation and the Explainable Chatbot

> Workshop segment: ~40 minutes — assembling retrieval into a chatbot whose
> every claim can be audited.

## Context assembly: give the model labeled evidence

`graphrag/generate.py` builds the prompt from two labeled sections:

```text
Facts from the knowledge graph:
F1. Ada Lovelace — translated → Sketch of the Analytical Engine
    (evidence: "Lovelace translated Menabrea's paper into English under the title")
F2. Luigi Menabrea — wrote → Sketch of the Analytical Engine (evidence: "...")

Passages:
C1 (ada_lovelace.md#1): In 1842 the Italian engineer Luigi Menabrea...

Question: Who translated the paper that Luigi Menabrea wrote?
```

Numbered ids are the trick: they give the model something concrete to cite,
and they give *you* a machine-checkable link from each claim back to its
evidence.

## The grounding contract

The system prompt (`GENERATION_SYSTEM_PROMPT`) imposes three rules:

1. **Answer ONLY from the provided facts and passages.** The model is a
   reader of evidence, not an oracle — the whole point of RAG, made
   explicit.
2. **Cite inline** — every claim carries `[F2]` or `[C1]`.
3. **Refuse when the context is insufficient.** "The context does not
   contain the answer" is a *success mode*, not a failure. An honest "I
   don't know" beats a fluent hallucination in every production setting.

Rule 3 deserves the emphasis the workshop gave it: most RAG failures in the
wild are not retrieval failures but generation failures — the retriever
returned nothing useful and the model answered anyway. You must
*instruct* the refusal, and you should *test* it (our test suite asks about
unladen swallows and asserts the system declines).

## The offline answerer: selection instead of generation

`ExtractiveAnswerer` demonstrates that "generation" is the least essential
part of the pipeline. It answers wh-questions with zero text generation:

1. Determine the **expected answer type** from the wh-phrase: "who" →
   `Person`, "what machine" → `Machine`. (Typed nodes paying off again.)
2. Collect candidate entities from the scored facts, **excluding entities
   mentioned in the question** — the answer to "who translated X?" is never
   X or the asker's other referents.
3. Sum fact scores per candidate; the winner plus its supporting facts *is*
   the answer.

It's crude, but it's honest: everything it says is a fact from the graph
with provenance attached. When you enable the live track, the LLM adds
fluency — the *grounding* is unchanged.

## The explanation trace

Every `Answer` carries an `explanation` — the full retrieval audit:

```text
Question: Who translated the paper that Luigi Menabrea wrote?
Seed entities (linked in question): Luigi Menabrea
Graph expansion: 2 hops → 4 candidate facts, top scored:
  [ 5.0] Ada Lovelace — translated → Sketch of the Analytical Engine
         — evidence: "Lovelace translated Menabrea's paper into English..."
         (ada_lovelace.md#1, analytical_engine.md#1)
  [ 5.0] Luigi Menabrea — wrote → Sketch of the Analytical Engine ...
Vector search top chunks: ada_lovelace.md#1 (0.30), ...
```

This is the "explainable" of the course title, concretely: **seeds → hops →
scored facts → evidence quotes → source chunks.** When a user (or a
regulator) asks "why did it say that?", this trace is the answer. In the
REPL it's one command away: `:why`.

## The chat loop

`graphrag/chatbot.py` is deliberately thin — build the pipeline once, then
per question: retrieve → answer → render with grounding. The rendering
always shows the evidence quotes and sources under the answer. A production
UI would make each citation a click-through to the source document; the
data to do that is already on every edge.

```bash
python -m graphrag.chatbot
you> Who invented the Jacquard loom?
you> What machine inspired the input mechanism of the Analytical Engine?
you> :why
you> :quit
```

## Exercises

1. Ask all five test questions (see `tests/test_pipeline.py`) and read the
   `:why` trace for each. For which is the margin between the top two
   candidate entities smallest? Why?
2. Break the grounding on purpose (live track): remove rule 1 from the
   system prompt and ask about something not in the corpus. Compare
   behavior with the rule in place.
3. Add a `:graph` REPL command that prints `graph.stats()`.
4. The extractive answerer shows at most 3 supporting facts. Make it show
   the *path* connecting seed → answer instead (walk `_adjacency` from a
   seed to the answer entity).
