import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Upload from "./pages/Upload";
import MeetingList from "./pages/MeetingList";
import MeetingDetail from "./pages/MeetingDetail";
import ActionItems from "./pages/ActionItems";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav>
          <span className="logo">CU Meeting Intel</span>
          <NavLink to="/" end className={({ isActive }) => isActive ? "active" : ""}>Meetings</NavLink>
          <NavLink to="/upload" className={({ isActive }) => isActive ? "active" : ""}>Upload</NavLink>
          <NavLink to="/actions" className={({ isActive }) => isActive ? "active" : ""}>Action Items</NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<MeetingList />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/meetings/:id" element={<MeetingDetail />} />
          <Route path="/actions" element={<ActionItems />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
