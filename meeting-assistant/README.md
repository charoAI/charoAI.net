# Local Meeting Assistant (Starter App)

This is a dockerizable, cross-platform starter app that includes:

- FastAPI backend service.
- First-time setup walkthrough UI at `/setup` with Mac/Windows selection.
- Config fields for notes destination and optional integration keys.
- Stub endpoint showing how post-processing output can be shaped for assistant-agent handoff.

## Is this design or actual app code?

- `meeting-notes-app-architecture.md` is the **design/layout document**.
- This `meeting-assistant/` folder is **actual runnable app code** you can extend.

## Run locally (without Docker)

```bash
cd meeting-assistant
python -m venv .venv
source .venv/bin/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

Then open:
- `http://localhost:8080/setup`

## Run with Docker

```bash
cd meeting-assistant
docker compose up --build
```

Then open:
- `http://localhost:8080/setup`

## Suggested next steps

1. Add local STT (`faster-whisper`) and diarization (`pyannote.audio`) in `/meetings/process`.
2. Add local LLM summarization stage and strict JSON schema output.
3. Add a webhook sender to your executive assistant agent.
4. Save rendered markdown notes directly to your Obsidian vault path.
