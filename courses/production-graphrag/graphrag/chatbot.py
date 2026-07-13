"""Step 7 — the finished product: an explainable GraphRAG chatbot.

    python -m graphrag.chatbot                 # interactive REPL
    python -m graphrag.chatbot --ask "..."     # one-shot question

In the REPL, ``:why`` prints the full retrieval trace for the last answer —
seeds, hops, scored facts with evidence quotes and source chunks. That
trace, not the prose, is what makes the system auditable.
"""

from __future__ import annotations

import argparse

from . import pipeline
from .config import Settings


def render(answer, graph) -> str:
    lines = [answer.text, ""]
    if answer.facts:
        lines.append("Grounded in:")
        for t in answer.facts:
            key = (t.subject, t.predicate, t.obj)
            sources = ", ".join(graph.provenance.get(key, [t.provenance]))
            lines.append(f'  • "{t.evidence}" — {sources}')
    if answer.chunks:
        lines.append(
            "Context passages: " + ", ".join(c.chunk_id for c in answer.chunks)
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Explainable GraphRAG chatbot")
    parser.add_argument("--ask", help="ask one question and exit")
    parser.add_argument("--offline", action="store_true", help="force offline track")
    parser.add_argument("--hops", type=int, help="graph expansion hops (default 2)")
    parser.add_argument("--top-k", type=int, help="vector search results (default 3)")
    args = parser.parse_args()

    settings = Settings()
    if args.offline:
        settings.offline = True
    if args.hops:
        settings.graph_hops = args.hops
    if args.top_k:
        settings.vector_top_k = args.top_k

    rag = pipeline.build(settings)
    stats = rag.graph.stats()
    mode = "offline (deterministic)" if settings.offline else "live (LLM)"
    print(
        f"GraphRAG ready — {stats['entities']} entities, "
        f"{stats['relationships']} relationships, {len(rag.chunks)} chunks, "
        f"mode: {mode}"
    )

    if args.ask:
        answer = rag.ask(args.ask)
        print()
        print(render(answer, rag.graph))
        return

    print("Ask a question, or :why for the last retrieval trace, :quit to exit.\n")
    last_answer = None
    while True:
        try:
            question = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not question:
            continue
        if question in (":quit", ":q", "exit"):
            break
        if question == ":why":
            if last_answer is None:
                print("Nothing answered yet.")
            else:
                print(last_answer.explanation or "No trace available.")
            continue
        last_answer = rag.ask(question)
        print()
        print(render(last_answer, rag.graph))
        print()


if __name__ == "__main__":
    main()
