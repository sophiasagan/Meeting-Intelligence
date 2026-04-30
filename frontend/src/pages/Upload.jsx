import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { uploadMeeting } from "../api";

const ACCEPTED = [".mp3", ".mp4", ".m4a", ".wav"];
const MAX_BYTES = 500 * 1024 * 1024;

const MEETING_TYPES = [
  { value: "board", label: "Board Meeting" },
  { value: "alm_committee", label: "ALM Committee" },
  { value: "loan_committee", label: "Loan Committee" },
  { value: "department_standup", label: "Department Stand-up" },
  { value: "other", label: "Other" },
];

const PHASE_LABELS = {
  uploading: { text: "Uploading…", pct: null },
  transcribing: { text: "Transcribing audio… (1–3 min)", pct: 40 },
  analyzing: { text: "Analyzing with AI… (~30 s)", pct: 75 },
  done: { text: "Done!", pct: 100 },
};

export default function Upload() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({
    title: "",
    meeting_type: "board",
    date: new Date().toISOString().slice(0, 16),
  });
  const [progress, setProgress] = useState(null); // null = idle
  const [error, setError] = useState(null);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const acceptFile = useCallback((f) => {
    if (!f) return;
    const ext = "." + f.name.split(".").pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setError(`Unsupported format. Use: ${ACCEPTED.join(", ")}`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File exceeds 500 MB limit.");
      return;
    }
    setError(null);
    setFile(f);
    if (!form.title) setField("title", f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  }, [form.title]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files[0]);
  };

  const onFileInput = (e) => acceptFile(e.target.files[0]);

  const canSubmit = file && form.title.trim() && form.date && !progress;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const fd = new FormData();
    fd.append("audio", file);
    fd.append("title", form.title.trim());
    fd.append("meeting_type", form.meeting_type);
    fd.append("date", new Date(form.date).toISOString());

    try {
      setProgress({ phase: "uploading", pct: 0 });
      const result = await uploadMeeting(fd, ({ phase, pct }) => {
        if (phase === "uploading") {
          const displayPct = Math.round(pct * 35); // uploading = 0–35%
          setProgress({ phase: "uploading", pct: displayPct });
          if (pct >= 1) setProgress({ phase: "transcribing", pct: 40 });
        }
      });
      setProgress({ phase: "analyzing", pct: 75 });
      // Small delay so user sees "Analyzing" before redirect
      await new Promise((r) => setTimeout(r, 600));
      setProgress({ phase: "done", pct: 100 });
      await new Promise((r) => setTimeout(r, 400));
      navigate(`/meetings/${result.meeting_id}`);
    } catch (err) {
      setProgress(null);
      setError(err.message || "Upload failed.");
    }
  };

  const phaseInfo = progress ? PHASE_LABELS[progress.phase] : null;

  return (
    <main className="page">
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Upload Meeting Recording
      </h1>

      <div className="card">
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Drop zone */}
          <div
            className={`dropzone${dragOver ? " over" : ""}${file ? " has-file" : ""}`}
            onClick={() => !progress && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              style={{ display: "none" }}
              onChange={onFileInput}
            />
            {file ? (
              <div>
                <div style={{ fontWeight: 600, marginBottom: ".25rem" }}>{file.name}</div>
                <div style={{ fontSize: ".8rem", color: "var(--gray-600)" }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 600, marginBottom: ".5rem" }}>
                  Drop audio file here or click to browse
                </div>
                <div style={{ fontSize: ".8rem", color: "var(--gray-600)" }}>
                  MP3, MP4, M4A, WAV · max 500 MB
                </div>
              </div>
            )}
          </div>

          {/* Form fields */}
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>Meeting Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="e.g. April Board Meeting"
                disabled={!!progress}
              />
            </div>
            <div className="form-group">
              <label>Meeting Type *</label>
              <select
                value={form.meeting_type}
                onChange={(e) => setField("meeting_type", e.target.value)}
                disabled={!!progress}
              >
                {MEETING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date &amp; Time *</label>
              <input
                type="datetime-local"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                disabled={!!progress}
              />
            </div>
          </div>

          {/* Progress */}
          {progress && (
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".875rem", color: "var(--gray-700)" }}>
                <div className="spinner" />
                {phaseInfo.text}
              </div>
              <div className="progress-bar-wrap">
                <div
                  className="progress-bar"
                  style={{ width: `${phaseInfo.pct ?? progress.pct}%` }}
                />
              </div>
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn-primary btn"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {progress ? "Processing…" : "Upload & Analyze"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
