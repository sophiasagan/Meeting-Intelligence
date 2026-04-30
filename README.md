# CU Meeting Intelligence

> AI-powered meeting analysis for credit unions — audio in, insights out.

![Demo](docs/demo.gif)

*Replace `docs/demo.gif` with a screen recording of the upload → detail flow.*

---

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-Opus_4.7-CC785C?logo=anthropic&logoColor=white)
![Whisper](https://img.shields.io/badge/OpenAI_Whisper-base%2Fsmall-412991?logo=openai&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What it does

Upload an audio recording of any credit union meeting. The app:

1. **Transcribes** the audio with Whisper (OpenAI) — timestamped segments, language detection
2. **Analyzes** the transcript with Claude Opus 4.7 — executive summary, action items with owners, key decisions, attendees, topics, sentiment
3. **Stores** everything in SQLite with full-text search across all transcripts
4. **Surfaces** insights in a React dashboard — per-meeting detail, cross-meeting action item tracker

Meeting types with tailored AI prompts: **Board**, **ALM Committee**, **Loan Committee**, **Department Stand-up**, **Other**.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│                                                             │
│  MeetingList  ──►  Upload  ──►  MeetingDetail               │
│      │                              │                        │
│   ActionItems ◄────────────────────┘                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / XHR
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI  (api/main.py)                     │
│                                                             │
│  POST /meetings/upload                                      │
│    │                                                        │
│    ├─► api/transcriber.py ──► Whisper (base / small)        │
│    │        pydub + librosa (16kHz mono WAV)                │
│    │        audio deleted immediately after transcription   │
│    │                                                        │
│    └─► api/analyzer.py ───► Claude Opus 4.7                 │
│             adaptive thinking + prompt caching              │
│             structured JSON output (output_config.format)   │
│                                                             │
│  GET  /meetings          (paginated, filtered)              │
│  GET  /meetings/:id      (full detail + segments)           │
│  PATCH /actions/:id      (mark complete)                    │
│  GET  /search?q=         (FTS5 full-text search)            │
└──────────────────────────┬──────────────────────────────────┘
                           │ SQLAlchemy 2.x
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    SQLite  (meetings.db)                      │
│                                                             │
│  meetings ──┬── transcripts  (full_text + segments_json)    │
│             ├── action_items (task, owner, due_date, prio)  │
│             └── decisions    (text, context, decided_by)    │
│                                                             │
│  transcripts_fts  (FTS5 virtual table, auto-synced          │
│                    via INSERT/UPDATE/DELETE triggers)        │
└─────────────────────────────────────────────────────────────┘
```

### Key design decisions

| Decision | Rationale |
|---|---|
| Audio deleted after transcription | Never persist member audio — privacy + storage |
| Whisper `base` → `small` on GPU | Fast enough on CPU; `small` auto-selected when CUDA available |
| Claude structured JSON output | `output_config.format` guarantees parseable response, no post-processing |
| Prompt caching on base system prompt | Stable prompt block cached; per-meeting-type guidance block uncached |
| SQLite FTS5 with triggers | Fast full-text search without a separate search service |
| XHR for upload | `fetch()` doesn't expose upload progress; XHR does |

---

## Project structure

```
cu_meeting_intel/
├── api/
│   ├── main.py          # FastAPI app + all endpoints
│   ├── transcriber.py   # Whisper audio → transcript + segments
│   ├── analyzer.py      # Claude → summary, actions, decisions
│   └── database.py      # SQLAlchemy models + FTS5 setup
├── frontend/
│   └── src/
│       ├── api.js                   # API client (fetch + XHR)
│       ├── App.jsx                  # Router + nav shell
│       └── pages/
│           ├── MeetingList.jsx      # Paginated list + transcript search
│           ├── Upload.jsx           # Drag-drop upload + progress
│           ├── MeetingDetail.jsx    # 4-tab detail view
│           └── ActionItems.jsx      # Cross-meeting action dashboard
├── requirements.txt
└── .env                 # ANTHROPIC_API_KEY (never committed)
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node 18+
- An [Anthropic API key](https://console.anthropic.com/)
- `ffmpeg` on PATH (required by pydub for MP3/MP4/M4A conversion)

### API

```bash
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install openai-whisper torch librosa soundfile pydub

echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

uvicorn api.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Set `VITE_API_URL` in `frontend/.env.local` if the API runs on a different host/port:

```
VITE_API_URL=http://localhost:8000
```

---

## Supported audio formats

| Format | Notes |
|---|---|
| `.mp3` | Converted via pydub → WAV |
| `.mp4` | Audio track extracted via pydub |
| `.m4a` | Converted via pydub → WAV |
| `.wav` | Used directly |

Max upload size: **500 MB** (frontend limit — adjust `MAX_BYTES` in `Upload.jsx` as needed).

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key |
| `DATABASE_URL` | No | `sqlite:///./meetings.db` | SQLAlchemy DB URL |
| `VITE_API_URL` | No | `http://localhost:8000` | API base URL (frontend) |
