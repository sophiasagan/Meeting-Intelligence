import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { getMeeting, patchAction } from "../api";

const TYPE_LABELS = {
  board: "Board",
  alm_committee: "ALM Committee",
  loan_committee: "Loan Committee",
  department_standup: "Stand-up",
  other: "Other",
};

const PRIORITY_BADGE = {
  high: "badge-red",
  medium: "badge-yellow",
  low: "badge-gray",
};

const SENTIMENT_BADGE = {
  positive: "badge-green",
  neutral: "badge-gray",
  negative: "badge-red",
  mixed: "badge-yellow",
};

function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function highlight(text, query) {
  if (!query) return text;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(re);
  return parts.map((p, i) =>
    re.test(p) ? <mark key={i} className="highlight">{p}</mark> : p
  );
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MeetingDetail() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("summary");
  const [searchQ, setSearchQ] = useState("");
  const [completing, setCompleting] = useState(new Set());

  useEffect(() => {
    getMeeting(id)
      .then(setMeeting)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const toggleAction = async (actionId, currentCompleted) => {
    setCompleting((s) => new Set(s).add(actionId));
    try {
      const updated = await patchAction(actionId, !currentCompleted);
      setMeeting((m) => ({
        ...m,
        action_items: m.action_items.map((a) => (a.id === updated.id ? updated : a)),
      }));
    } finally {
      setCompleting((s) => { const n = new Set(s); n.delete(actionId); return n; });
    }
  };

  if (loading) return <main className="page"><div className="empty"><div className="spinner" style={{ margin: "0 auto" }} /></div></main>;
  if (error) return <main className="page"><div className="error-msg">{error}</div></main>;
  if (!meeting) return null;

  const analysis = meeting.summary_data || {};
  const openCount = meeting.action_items.filter((a) => !a.completed).length;

  return (
    <main className="page">
      {/* Back */}
      <Link to="/" style={{ fontSize: ".875rem", color: "var(--gray-600)", display: "inline-block", marginBottom: "1rem" }}>
        ← All Meetings
      </Link>

      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", flexWrap: "wrap", marginBottom: ".5rem" }}>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, flex: 1 }}>{meeting.title}</h1>
          <span className={`badge badge-blue`}>{TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type}</span>
          {analysis.sentiment && (
            <span className={`badge ${SENTIMENT_BADGE[analysis.sentiment] ?? "badge-gray"}`}>
              {analysis.sentiment}
            </span>
          )}
          {analysis.requires_followup && (
            <span className="badge badge-yellow">Follow-up required</span>
          )}
        </div>
        <div style={{ fontSize: ".875rem", color: "var(--gray-600)", display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
          <span>{format(new Date(meeting.date), "MMM d, yyyy 'at' h:mm a")}</span>
          <span>{fmtDuration(meeting.duration_seconds)}</span>
          <span>{meeting.audio_filename}</span>
          {openCount > 0 && <span style={{ color: "var(--red)" }}>{openCount} open action{openCount !== 1 ? "s" : ""}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {["summary", "actions", "decisions", "transcript"].map((t) => (
          <button key={t} className={`tab-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "summary" ? "Summary" : t === "actions" ? `Action Items (${meeting.action_items.length})` : t === "decisions" ? `Decisions (${meeting.decisions.length})` : "Transcript"}
          </button>
        ))}
      </div>

      {/* Summary tab */}
      {tab === "summary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {analysis.executive_summary && (
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: ".875rem", fontWeight: 600, marginBottom: ".5rem", color: "var(--gray-700)" }}>Executive Summary</h3>
                <p style={{ fontSize: ".9rem", lineHeight: 1.6 }}>{analysis.executive_summary}</p>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "1fr 1fr" }}>
            {analysis.topics?.length > 0 && (
              <div className="card">
                <div className="card-body">
                  <h3 style={{ fontSize: ".875rem", fontWeight: 600, marginBottom: ".75rem", color: "var(--gray-700)" }}>Topics Covered</h3>
                  <ul style={{ paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: ".3rem" }}>
                    {analysis.topics.map((t, i) => <li key={i} style={{ fontSize: ".875rem" }}>{t}</li>)}
                  </ul>
                </div>
              </div>
            )}
            {analysis.attendees?.length > 0 && (
              <div className="card">
                <div className="card-body">
                  <h3 style={{ fontSize: ".875rem", fontWeight: 600, marginBottom: ".75rem", color: "var(--gray-700)" }}>Attendees</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
                    {analysis.attendees.map((a, i) => <span key={i} className="badge badge-gray">{a}</span>)}
                  </div>
                </div>
              </div>
            )}
          </div>
          {!analysis.executive_summary && !analysis.topics && (
            <div className="empty">No summary available for this meeting.</div>
          )}
        </div>
      )}

      {/* Action Items tab */}
      {tab === "actions" && (
        <div className="card">
          {meeting.action_items.length === 0 ? (
            <div className="empty">No action items recorded.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Task</th>
                    <th>Owner</th>
                    <th>Due Date</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {meeting.action_items.map((a) => (
                    <tr key={a.id} style={{ opacity: a.completed ? 0.5 : 1 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={a.completed}
                          disabled={completing.has(a.id)}
                          onChange={() => toggleAction(a.id, a.completed)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ textDecoration: a.completed ? "line-through" : "none" }}>{a.task}</td>
                      <td style={{ color: "var(--gray-600)" }}>{a.owner || "—"}</td>
                      <td style={{ color: "var(--gray-600)" }}>{a.due_date || "—"}</td>
                      <td>
                        <span className={`badge ${PRIORITY_BADGE[a.priority] ?? "badge-gray"}`}>
                          {a.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Decisions tab */}
      {tab === "decisions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          {meeting.decisions.length === 0 ? (
            <div className="empty">No decisions recorded.</div>
          ) : meeting.decisions.map((d) => (
            <div key={d.id} className="card">
              <div className="card-body">
                <p style={{ fontWeight: 600, marginBottom: ".4rem" }}>{d.decision_text}</p>
                {d.context && <p style={{ fontSize: ".875rem", color: "var(--gray-600)", marginBottom: ".4rem" }}>{d.context}</p>}
                {d.decided_by && <span className="badge badge-blue">{d.decided_by}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transcript tab */}
      {tab === "transcript" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="form-group">
            <input
              type="text"
              placeholder="Search transcript…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
          {meeting.segments?.length > 0 ? (
            <div className="card">
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
                {meeting.segments
                  .filter((s) => !searchQ || s.text.toLowerCase().includes(searchQ.toLowerCase()))
                  .map((seg, i) => (
                    <div key={i} style={{ display: "flex", gap: ".75rem", fontSize: ".875rem" }}>
                      <span style={{ color: "var(--gray-400)", fontVariantNumeric: "tabular-nums", flexShrink: 0, paddingTop: ".1rem" }}>
                        {fmtTime(seg.start)}
                      </span>
                      <span style={{ lineHeight: 1.6 }}>{highlight(seg.text, searchQ)}</span>
                    </div>
                  ))}
                {searchQ && meeting.segments.filter((s) => s.text.toLowerCase().includes(searchQ.toLowerCase())).length === 0 && (
                  <div className="empty" style={{ padding: "1rem" }}>No matches for "{searchQ}"</div>
                )}
              </div>
            </div>
          ) : meeting.transcript ? (
            <div className="card">
              <div className="card-body" style={{ fontSize: ".875rem", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {highlight(meeting.transcript, searchQ)}
              </div>
            </div>
          ) : (
            <div className="empty">No transcript available.</div>
          )}
        </div>
      )}
    </main>
  );
}
