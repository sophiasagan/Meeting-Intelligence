import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { getMeetings, searchMeetings } from "../api";

const TYPE_LABELS = {
  board: "Board",
  alm_committee: "ALM Committee",
  loan_committee: "Loan Committee",
  department_standup: "Stand-up",
  other: "Other",
};

const MEETING_TYPES = [
  { value: "", label: "All types" },
  { value: "board", label: "Board" },
  { value: "alm_committee", label: "ALM Committee" },
  { value: "loan_committee", label: "Loan Committee" },
  { value: "department_standup", label: "Stand-up" },
  { value: "other", label: "Other" },
];

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function MeetingList() {
  const [meetings, setMeetings] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const debouncedSearch = useDebounce(searchQ, 350);

  const PAGE_SIZE = 20;

  const loadMeetings = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = {
      meeting_type: typeFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      has_open_actions: openOnly ? true : undefined,
      page,
      page_size: PAGE_SIZE,
    };
    getMeetings(params)
      .then((data) => { setMeetings(data.items); setTotal(data.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [typeFilter, dateFrom, dateTo, openOnly, page]);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    searchMeetings(debouncedSearch)
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, [debouncedSearch]);

  const resetFilters = () => {
    setTypeFilter(""); setDateFrom(""); setDateTo(""); setOpenOnly(false); setPage(1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const showSearch = debouncedSearch.length >= 2;

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: ".75rem" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Meetings</h1>
        <Link to="/upload" className="btn btn-primary btn-sm">+ Upload Recording</Link>
      </div>

      {/* Search bar */}
      <div className="form-group" style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Search transcripts…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
      </div>

      {/* Search results */}
      {showSearch && (
        <div style={{ marginBottom: "1.5rem" }}>
          {searching && <div style={{ fontSize: ".875rem", color: "var(--gray-600)" }}>Searching…</div>}
          {!searching && searchResults !== null && (
            searchResults.length === 0 ? (
              <div className="empty" style={{ padding: "1rem" }}>No matches found.</div>
            ) : (
              <div className="card">
                <div style={{ padding: ".5rem 0" }}>
                  {searchResults.map((r) => (
                    <Link key={r.meeting_id} to={`/meetings/${r.meeting_id}`} style={{ display: "block", padding: ".75rem 1.25rem", borderBottom: "1px solid var(--gray-100)" }}>
                      <div style={{ display: "flex", gap: ".5rem", marginBottom: ".3rem", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: ".875rem" }}>{r.title}</span>
                        <span className="badge badge-blue">{TYPE_LABELS[r.meeting_type] ?? r.meeting_type}</span>
                        <span style={{ fontSize: ".8rem", color: "var(--gray-600)", marginLeft: "auto" }}>
                          {format(new Date(r.date), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div style={{ fontSize: ".8rem", color: "var(--gray-600)", lineHeight: 1.5 }}>{r.snippet}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Filters */}
      {!showSearch && (
        <>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1.25rem" }}>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label>Type</label>
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>From</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="form-group">
              <label>To</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: ".4rem", fontSize: ".875rem", cursor: "pointer", userSelect: "none", paddingBottom: ".1rem" }}>
              <input type="checkbox" checked={openOnly} onChange={(e) => { setOpenOnly(e.target.checked); setPage(1); }} />
              Open actions only
            </label>
            {(typeFilter || dateFrom || dateTo || openOnly) && (
              <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Clear filters</button>
            )}
          </div>

          {error && <div className="error-msg" style={{ marginBottom: "1rem" }}>{error}</div>}

          <div className="card">
            {loading ? (
              <div className="empty"><div className="spinner" style={{ margin: "0 auto" }} /></div>
            ) : meetings.length === 0 ? (
              <div className="empty">No meetings found.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Duration</th>
                      <th>Open Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meetings.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <Link to={`/meetings/${m.id}`} style={{ color: "var(--blue)", fontWeight: 500 }}>{m.title}</Link>
                        </td>
                        <td><span className="badge badge-blue">{TYPE_LABELS[m.meeting_type] ?? m.meeting_type}</span></td>
                        <td style={{ color: "var(--gray-600)" }}>{format(new Date(m.date), "MMM d, yyyy")}</td>
                        <td style={{ color: "var(--gray-600)" }}>
                          {Math.floor(m.duration_seconds / 60)}m {Math.round(m.duration_seconds % 60)}s
                        </td>
                        <td>
                          {m.open_action_count > 0
                            ? <span className="badge badge-red">{m.open_action_count}</span>
                            : <span style={{ color: "var(--gray-400)" }}>—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: ".5rem", marginTop: "1rem", alignItems: "center" }}>
              <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span style={{ fontSize: ".875rem", color: "var(--gray-600)" }}>Page {page} of {totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
