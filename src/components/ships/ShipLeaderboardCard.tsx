import { SHIP_LEADERBOARD } from "../../data";

export function ShipLeaderboardCard() {
  return (
    <section className="panel leaderboard-card" aria-labelledby="leaderboard-title">
      <div className="panel-head">
        <h2 id="leaderboard-title">Crew Leaderboard</h2>
        <span className="panel-tag">Discipline only</span>
      </div>
      <p className="panel-intro">
        We rank habits, never profit. There are no P/L leaderboards aboard.
      </p>
      <ul className="leaderboard-list">
        {SHIP_LEADERBOARD.map((row) => (
          <li key={row.id} className="leaderboard-item">
            <span className="leaderboard-category">{row.category}</span>
            <span className="leaderboard-leader">{row.leader}</span>
            <span className="leaderboard-detail">{row.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
