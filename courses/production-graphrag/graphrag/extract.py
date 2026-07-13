"""Step 2 — extraction: pull (entity, relation, entity) triples out of text.

Two interchangeable extractors implement the same interface:

* ``AnnotationExtractor`` (offline) replays curated gold annotations against
  the corpus. It exists so the course runs deterministically with no API
  key, and doubles as the evaluation ground truth for the live extractor.
* ``LLMExtractor`` (live) prompts an LLM to emit schema-constrained JSON.

The single most important design decision here is the CLOSED SCHEMA: a fixed
vocabulary of entity types and predicates. Free-form extraction fragments
one relationship across dozens of spellings (wrote / authored / penned /
is_author_of), and a graph you cannot query consistently is just an
expensive pile of strings.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .ingest import Chunk

ENTITY_TYPES = [
    "Person",
    "Machine",
    "Document",
    "Concept",
    "Component",
    "Institution",
    "Place",
]

RELATION_SCHEMA = [
    "DAUGHTER_OF",
    "TUTORED_BY",
    "STUDIED_WITH",
    "COLLABORATED_WITH",
    "PROFESSOR_AT",
    "WROTE",
    "TRANSLATED",
    "DESCRIBES",
    "CONTAINS_PROGRAM_FOR",
    "REGARDED_AS",
    "DESIGNED",
    "FUNDED",
    "BUILT",
    "INVENTED_BY",
    "INPUT_INSPIRED_BY",
    "USED",
    "HAS_COMPONENT",
]


@dataclass(frozen=True)
class Entity:
    entity_id: str
    name: str
    entity_type: str
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True)
class Triple:
    subject: str  # entity_id
    predicate: str  # UPPER_SNAKE relation from RELATION_SCHEMA
    obj: str  # entity_id
    evidence: str  # the text fragment that supports the fact
    provenance: str  # chunk_id the fact was extracted from


@dataclass
class ExtractionResult:
    entities: list[Entity]
    triples: list[Triple]


def slugify(name: str) -> str:
    """Normalise an entity name into a stable id (a crude first pass at
    entity resolution — see lesson 3 for why production needs more)."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


class AnnotationExtractor:
    """Offline extractor: replays gold annotations against the corpus.

    Each annotated triple carries the exact evidence substring that supports
    it. A triple is attributed to whichever chunk of the right source file
    contains that evidence — so provenance stays correct no matter how the
    chunker is configured.
    """

    def __init__(self, annotations_path: Path):
        data = json.loads(annotations_path.read_text(encoding="utf-8"))
        self._entities = {
            e["id"]: Entity(
                entity_id=e["id"],
                name=e["name"],
                entity_type=e["type"],
                aliases=tuple(e.get("aliases", [])),
            )
            for e in data["entities"]
        }
        self._annotations = data["triples"]

    def extract(self, chunk: Chunk) -> ExtractionResult:
        text = chunk.text.lower()
        triples = [
            Triple(
                subject=a["subject"],
                predicate=a["predicate"],
                obj=a["object"],
                evidence=a["evidence"],
                provenance=chunk.chunk_id,
            )
            for a in self._annotations
            if a["source"] == chunk.source and a["evidence"].lower() in text
        ]
        seen_ids = {t.subject for t in triples} | {t.obj for t in triples}
        entities = [self._entities[eid] for eid in seen_ids if eid in self._entities]
        return ExtractionResult(entities=entities, triples=triples)


EXTRACTION_PROMPT = """\
You are an information-extraction system. From the passage below, extract
entities and relationships as JSON.

Rules:
- Entity "type" MUST be one of: {entity_types}
- Triple "predicate" MUST be one of: {relations}
- Only extract facts stated in the passage. Do not use outside knowledge.
- "evidence" MUST be a short verbatim quote from the passage supporting the fact.
- Use the entity's most complete name mentioned in the passage.

Return exactly this JSON shape:
{{"entities": [{{"name": "...", "type": "..."}}],
  "triples": [{{"subject": "...", "predicate": "...", "object": "...", "evidence": "..."}}]}}

Passage:
{passage}
"""


class LLMExtractor:
    """Live extractor: prompts an LLM for schema-constrained JSON triples."""

    def __init__(self, model: str):
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - live track only
            raise RuntimeError(
                "The live track needs the openai package: pip install openai"
            ) from exc
        self._client = OpenAI()
        self._model = model

    def extract(self, chunk: Chunk) -> ExtractionResult:
        prompt = EXTRACTION_PROMPT.format(
            entity_types=", ".join(ENTITY_TYPES),
            relations=", ".join(RELATION_SCHEMA),
            passage=chunk.text,
        )
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        payload = json.loads(response.choices[0].message.content)

        entities: list[Entity] = []
        for raw in payload.get("entities", []):
            name = raw.get("name", "").strip()
            etype = raw.get("type", "Concept")
            if name and etype in ENTITY_TYPES:
                entities.append(
                    Entity(entity_id=slugify(name), name=name, entity_type=etype)
                )
        known = {e.entity_id for e in entities}

        triples: list[Triple] = []
        for raw in payload.get("triples", []):
            subject = slugify(raw.get("subject", ""))
            obj = slugify(raw.get("object", ""))
            predicate = raw.get("predicate", "")
            # Drop anything outside the schema or referencing unknown
            # entities — malformed output is discarded, not repaired.
            if predicate in RELATION_SCHEMA and subject in known and obj in known:
                triples.append(
                    Triple(
                        subject=subject,
                        predicate=predicate,
                        obj=obj,
                        evidence=raw.get("evidence", ""),
                        provenance=chunk.chunk_id,
                    )
                )
        return ExtractionResult(entities=entities, triples=triples)


def get_extractor(settings) -> AnnotationExtractor | LLMExtractor:
    from .config import ANNOTATIONS_PATH

    if settings.offline:
        return AnnotationExtractor(ANNOTATIONS_PATH)
    return LLMExtractor(settings.llm_model)
