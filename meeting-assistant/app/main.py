from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
SETTINGS_PATH = DATA_DIR / "settings.json"

app = FastAPI(title="Local Meeting Assistant", version="0.1.0")


class SetupRequest(BaseModel):
    machine_type: Literal["mac", "windows"] = Field(
        description="User-selected host operating system"
    )
    notes_path: str = Field(description="Where processed notes should be stored")
    assistant_webhook_url: str | None = Field(
        default=None,
        description="Optional endpoint for executive assistant automation",
    )
    calendar_api_key: str | None = None
    task_api_key: str | None = None


class MeetingProcessRequest(BaseModel):
    meeting_title: str
    transcript: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/setup")
def setup_page() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "setup.html")


@app.get("/setup/options")
def setup_options() -> dict:
    return {
        "machine_types": [
            {
                "id": "mac",
                "label": "Mac",
                "notes": "Use BlackHole for virtual audio capture and local model acceleration with Metal.",
            },
            {
                "id": "windows",
                "label": "Windows",
                "notes": "Use WASAPI loopback for virtual audio capture and CUDA when available.",
            },
        ],
        "storage": {
            "default_notes_subdir": "meeting-notes",
            "supports_custom_path": True,
        },
        "integrations": [
            "executive_assistant_webhook",
            "calendar_provider_api_key",
            "task_provider_api_key",
        ],
    }


@app.get("/setup/current")
def get_setup() -> dict:
    if not SETTINGS_PATH.exists():
        return {"configured": False, "settings": None}

    return {"configured": True, "settings": json.loads(SETTINGS_PATH.read_text())}


@app.post("/setup/save")
def save_setup(payload: SetupRequest) -> dict:
    SETTINGS_PATH.write_text(payload.model_dump_json(indent=2))
    return {"saved": True, "path": str(SETTINGS_PATH)}


@app.post("/meetings/process")
def process_meeting(payload: MeetingProcessRequest) -> dict:
    if not SETTINGS_PATH.exists():
        raise HTTPException(
            status_code=400,
            detail="Run setup first by calling /setup/save or using /setup",
        )

    transcript_lines = [line.strip() for line in payload.transcript.split("\n") if line.strip()]
    action_candidates = [line for line in transcript_lines if line.lower().startswith(("todo:", "action:"))]

    return {
        "meeting_title": payload.meeting_title,
        "summary": transcript_lines[0] if transcript_lines else "No transcript content provided.",
        "speakers": ["spk_0", "spk_1"],
        "action_items": action_candidates,
        "next_step": "Replace this stub with local STT + diarization + local LLM pipeline.",
    }
