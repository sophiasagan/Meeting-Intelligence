import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { format, isPast, parseISO } from "date-fns";
import { getMeetings, getMeeting, patchAction } from "../api";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_BADGE = { high: "badge-red", medium: "badge-yellow", low: "badge-gray" };

export default function ActionItems() {
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState(new Set());

  const [ownerFilter, setOwnerFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState("due_date");
  const [sortDir, setSortDir] = useState("asc");

  const [allMeetingsLoaded, setAllMeetingsLoaded] = useState(false);
  const [fullActions, setFullActions] = useState([]);

  useEffect(() => {
    // Fetch up to 100 meetings and collect all open action items
    getMeetings({ page_size: 100 })
      .then(async (data) => {
        const items = data.items || [];
        const details = await Promise.all(items.map((m) => getMeeting(m.id)));
        const actions = [];
        for (const m of details) {
          for (const a of m.action_items) {
            if (!a.completed) {
              actions.push({ ...a, meeting_id: m.id, meeting_title: m.title });
            }
          }
        }
        setFullActions(actions);
        setAllMeetingsLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);

  const owners = useMemo(() => {
    const s = new Set(fullActions.map((a) => a.owner).filter(Boolean));
    return Array.from(s).sort();
  }, [fullActions]);

  const filtered = useMemo(() => {
    let items = [...fullActions];
    if (ownerFilter) items = items.filter((a) => a.owner === ownerFilter);
    if (overdueOnly) {
      items = items.filter((a) => {
        if (!a.due_date) return false;
        try { return isPast(parseISO(a.due_date)); } catch { return false; }
      });
    }
    items.sort((a, b) => {
      let av, bv;
      if (sortKey === "priority") {
        av = PRIORITY_ORDER[a.priority] ?? 99;
        bv = PRIORITY_ORDER[b.priority] ?? 99;
      } else if (sortKey === "due_date") {
        av = a.due_date || "9999";
        bv = b.due_date || "9999";
      } else if (sortKey === "owner") {
        av = (a.owner || "").toLowerCase();
        bv = (b.owner || "").toLowerCase();
      } else if (sortKey === "meeting") {
        av = (a.meeting_title || "").toLowerCase();
        bv = (b.meeting_title || "").toLowerCase();
      } else {
        av = a[sortKey] ?? "";
        bv = b[sortKey] ?? "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [fullActions, ownerFilter, overdueOnly, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortArrow = (key) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const toggleComplete = async (action) => {
    setCompleting((s) => new Set(s).add(action.id));
    try {
      await patchAction(action.id, true);
      setFullActions((prev) => prev.filter((a) => a.id !== action.id));
    } finally {
      setCompleting((s) => { const n = new Set(s); n.delete(action.id); return n; });
    }
  };

  const isOverdue = (due_date) => {
    if (!due_date) return false;
    try { return isPast(parseISO(due_date)); } catch { return false; }
  };

  if (!allMeetingsLoaded) return (
    <main className="page">
      <div className="empty"><div className="spinner" style={{ margin: "0 auto" }} /><div style={{ marginTop: ".75rem" }}>Loading action items…</div></div>
    </main>
  );

  if (error) return <main className="page"><div className="error-msg">{error}</div></main>;

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".75rem" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
          Open Action Items
          {filtered.length > 0 && <span style={{ fontWeight: 400, color: "var(--gray-600)", fontSize: "1rem", marginLeft: ".5rem" }}>({filtered.length})</span>}
        </h1>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="">All owners</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: ".4rem", fontSize: ".875rem", cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Overdue only
          </label>
        </div>
      </div>

      {fullActions.length === 0 ? (
        <div className="empty">No open action items. Great work!</div>
      ) : filtered.length === 0 ? (
        <div className="empty">No items match the current filters.</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th onClick={() => toggleSort("task")}>Task{sortArrow("task")}</th>
                  <th onClick={() => toggleSort("owner")}>Owner{sortArrow("owner")}</th>
                  <th onClick={() => toggleSort("due_date")}>Due Date{sortArrow("due_date")}</th>
                  <th onClick={() => toggleSort("priority")}>Priority{sortArrow("priority")}</th>
                  <th onClick={() => toggleSort("meeting")}>Meeting{sortArrow("meeting")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const overdue = isOverdue(a.due_date);
                  return (
                    <tr key={a.id}>
                      <td>{a.task}</td>
                      <td style={{ color: "var(--gray-600)" }}>{a.owner || "—"}</td>
                      <td style={{ color: overdue ? "var(--red)" : "var(--gray-600)", fontWeight: overdue ? 600 : 400 }}>
                        {a.due_date
                          ? (() => { try { return format(parseISO(a.due_date), "MMM d, yyyy"); } catch { return a.due_date; } })()
                          : "—"}
                        {overdue && <span className="badge badge-red" style={{ marginLeft: ".4rem" }}>overdue</span>}
                      </td>
                      <td>
                        <span className={`badge ${PRIORITY_BADGE[a.priority] ?? "badge-gray"}`}>{a.priority}</span>
                      </td>
                      <td>
                        <Link to={`/meetings/${a.meeting_id}`} style={{ color: "var(--blue)", fontSize: ".875rem" }}>
                          {a.meeting_title}
                        </Link>
                      </td>
                      <td>
                        <button
                          className="btn btn-green btn-sm"
                          disabled={completing.has(a.id)}
                          onClick={() => toggleComplete(a)}
                        >
                          {completing.has(a.id) ? "…" : "Complete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
