# Private Meeting Notes App (Local-First) — Architecture Proposal

## Goals

Build a meeting assistant that:

1. Runs on your own hardware with **local models** for privacy.
2. Listens to meetings and creates:
   - transcript
   - speaker-separated dialogue (Speaker A, Speaker B, etc.)
   - structured notes
   - action items / due-outs
   - decisions / risks / follow-ups
3. Sends structured output to your **executive assistant agent** for:
   - Obsidian vault updates
   - calendar actions
   - task management

---

## Recommended Stack (Practical + Local)

### Audio capture
- **Platform capture**:
  - macOS: BlackHole / Loopback virtual audio device
  - Windows: WASAPI loopback
  - Linux: PulseAudio / PipeWire monitor source
- Optional microphone channel for your own voice if needed.

### Speech-to-text (local)
- **Primary choice:** `faster-whisper` with Whisper large-v3 or distil-large-v3.
- Why:
  - high quality
  - robust against accents/noisy calls
  - strong community support

### Speaker diarization (who spoke when)
- **Primary choice:** `pyannote.audio` diarization pipeline run locally.
- Alternative: `NVIDIA NeMo` diarization if you need more tuning at scale.
- Output speaker IDs as anonymized labels (`spk_0`, `spk_1`, ...).

### Note generation + summarization (local LLM)
- Run a local model server with one of:
  - **Ollama** (easiest ops)
  - **vLLM** or **llama.cpp** (if you want more control/perf)
- Suggested models:
  - 7B–14B instruction model for normal summarization
  - 30B+ only if hardware allows and you need stronger reasoning

### Orchestration layer
- Python service (FastAPI) with pipeline stages:
  1. ingest audio chunks
  2. transcribe
  3. diarize + align timestamps
  4. incremental note extraction
  5. final post-meeting synthesis
  6. emit JSON payload to assistant agent webhook

### Storage
- SQLite or Postgres for metadata.
- Local object storage path for raw audio and transcript artifacts.

---

## Core Features You Requested (and how to implement)

### 1) Private local inference
- Keep all inference local by default.
- Add **network egress guardrails** in runtime config to prevent accidental cloud calls.
- Encrypt local data at rest if device may leave your office.

### 2) Convert sound to text + useful notes
Create a fixed schema for deterministic downstream automation.

Example output schema:

```json
{
  "meeting": {
    "id": "uuid",
    "started_at": "ISO8601",
    "ended_at": "ISO8601"
  },
  "speakers": ["spk_0", "spk_1", "spk_2"],
  "transcript": [
    {
      "start": 12.1,
      "end": 18.4,
      "speaker": "spk_1",
      "text": "We should launch the pilot by March 20."
    }
  ],
  "notes": {
    "summary": "...",
    "decisions": ["..."],
    "action_items": [
      {
        "task": "Prepare pilot launch checklist",
        "owner": "spk_0",
        "due_date": "2026-03-15",
        "priority": "high"
      }
    ],
    "risks": ["..."],
    "open_questions": ["..."],
    "follow_ups": ["..."]
  }
}
```

### 3) Speaker distinction
- Use diarization labels only (you map names later).
- Keep a quick relabel map UI later (`spk_1 -> Alex`) without changing raw transcript.

### 4) Send to executive assistant agent
- Publish signed JSON to your agent endpoint/webhook.
- Suggested contract:
  - `meeting_finalized` event with full structured payload.
  - Optional `meeting_live_update` event every N minutes.
- Assistant agent then:
  - writes markdown note to Obsidian
  - creates/updates tasks
  - proposes calendar events for due-outs

---

## Additional High-Value Features

1. **Live running notes mode** during meeting.
2. **Confidence scoring** per transcript segment and action item.
3. **“Evidence links”**: each action item links to transcript timestamps.
4. **Decision register** extracted across all meetings.
5. **Cross-meeting memory** (local vector DB) for “last time we agreed…” queries.
6. **Redaction mode** for sensitive entities before sharing notes externally.
7. **Quality dashboard**: WER estimate, diarization purity, dropped audio alerts.

---

## Suggested Rollout Plan

### Phase 1 (MVP, 2–3 weeks)
- Record/import audio.
- Whisper transcription.
- Basic diarization.
- End-of-meeting summary + action items JSON.
- Webhook to assistant agent.

### Phase 2
- Real-time incremental notes.
- Better diarization alignment.
- Obsidian templates + task sync.

### Phase 3
- Calendar automation with approval flow.
- Cross-meeting memory and semantic search.
- Governance and audit reports.

---

## Risks and Mitigations

- **Diarization mistakes** in overlapping speech:
  - Mitigate with chunk overlap + post-alignment + manual relabel UI.
- **Local compute constraints**:
  - Start with distil Whisper and 7B summarizer; scale up later.
- **Automation errors for calendar/tasks**:
  - Require “human approval” mode before assistant executes.

---

## Integration Pattern for Obsidian + Task/Calendar Agent

Use event-driven handoff:

1. Meeting app creates structured JSON + markdown rendering.
2. Pushes to assistant agent queue/webhook.
3. Assistant agent executes tools with policy checks:
   - Obsidian write/update
   - task manager create/update
   - calendar draft events
4. Assistant returns execution report linked to meeting ID.

---

## Recommendation

Yes — this is very feasible, and your privacy requirement is realistic today with local STT + local LLMs. The most important design decision is to enforce a **strict output schema** so your executive assistant agent can reliably automate downstream systems (Obsidian, tasks, calendar) without brittle parsing.

