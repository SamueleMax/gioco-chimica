import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/Home";
import MatchPage from "./pages/Match";
import LeaderboardPage from "./pages/Leaderboard";
import AdminPage from "./pages/Admin";

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/match" element={<MatchPage />} />
        <Route path="/classifica" element={<LeaderboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}