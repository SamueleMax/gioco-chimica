import { Link, Route, Routes } from "react-router-dom";
import HomePage from "./pages/Home";
import MatchPage from "./pages/Match";
import LeaderboardPage from "./pages/Leaderboard";
import AdminPage from "./pages/Admin";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <Link to="/">Missione pH</Link>
        </div>
        <nav className="nav">
          <Link className="nav-link" to="/">Home</Link>
          <Link className="nav-link" to="/classifica">Classifica</Link>
          <Link className="nav-link" to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/match" element={<MatchPage />} />
          <Route path="/classifica" element={<LeaderboardPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
