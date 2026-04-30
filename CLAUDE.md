cu_meeting_intel/
├── api/
│ ├── main.py
│ ├── transcriber.py # Whisper audio → transcript
│ ├── analyzer.py # Claude → summary, actions, decisions
│ ├── database.py # SQLAlchemy models + session
│ └── search.py # Full-text search across transcripts
├── frontend/
│ └── src/
│ ├── pages/
│ │ ├── Upload.jsx
│ │ ├── MeetingDetail.jsx
│ │ └── ActionItems.jsx
│ └── components/
├── requirements.txt
└── railway.json

# cu_meeting_intel — Claude Code Context
## Project
AI meeting intelligence: audio → Whisper transcript → Claude analysis → React
dashboard.
## Commands
- Run API: uvicorn api.main:app --reload
- Run frontend: cd frontend && npm run dev
- Process test: python -c "from api.transcriber import transcribe;
print(transcribe('test.mp3'))"
## Whisper model
Default: base (fast, good enough for clear audio)
Upgrade to "small" for accented speakers or poor audio quality

## Conventions
- Never store audio files permanently — delete after transcription
- Transcripts stored in DB — audio is transient
- Action items: owner extracted by name mention near task — may need manual
correction