const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function uploadMeeting(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/meetings/upload`);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress?.({ phase: "uploading", pct: e.loaded / e.total });
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.send(formData);
  });
}

export const getMeetings = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
  ).toString();
  return request(`/meetings${qs ? `?${qs}` : ""}`);
};

export const getMeeting = (id) => request(`/meetings/${id}`);

export const patchAction = (id, completed) =>
  request(`/actions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });

export const searchMeetings = (q) =>
  request(`/search?q=${encodeURIComponent(q)}`);
