import { useMemo, useState } from "react";

const TOTAL_DAYS = 25;
const DEFAULT_YEAR = String(new Date().getFullYear());

const dayNumbers = Array.from({ length: TOTAL_DAYS }, (_, i) => String(i + 1));

const formatCompletionTime = (timestamp) =>
  new Date(timestamp * 1000).toLocaleString();

const findDefaultSelection = (leaderboard) => {
  const members = Object.values(leaderboard?.members ?? {});
  const allDays = members.flatMap((member) =>
    Object.keys(member.completion_day_level ?? {})
  );

  const firstDay =
    allDays
      .map(Number)
      .sort((a, b) => a - b)[0]
      ?.toString() ?? "1";

  const hasPart2 = members.some(
    (member) => member.completion_day_level?.[firstDay]?.["2"]
  );
  const hasPart1 = members.some(
    (member) => member.completion_day_level?.[firstDay]?.["1"]
  );

  return {
    day: firstDay,
    part: hasPart2 ? "2" : hasPart1 ? "1" : "1",
  };
};

const buildLeaderboard = (leaderboard, day, part) => {
  if (!leaderboard) return [];

  const members = Object.values(leaderboard.members ?? {});
  const rows = [];

  members.forEach((member) => {
    const completion = member.completion_day_level?.[day]?.[part];
    if (!completion) return;

    rows.push({
      id: member.id,
      name: member.name || `Anonymous #${member.id}`,
      completedAt: formatCompletionTime(completion.get_star_ts),
      timestamp: completion.get_star_ts,
    });
  });

  return rows
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((row, index) => ({ ...row, rank: index + 1 }));
};

const computePartAvailability = (leaderboard) => {
  const availability = {};

  Object.values(leaderboard?.members ?? {}).forEach((member) => {
    Object.entries(member.completion_day_level ?? {}).forEach(
      ([day, parts]) => {
        availability[day] ??= { 1: false, 2: false };
        if (parts["1"]) availability[day][1] = true;
        if (parts["2"]) availability[day][2] = true;
      }
    );
  });

  return availability;
};

export default function App() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [leaderboardCode, setLeaderboardCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [selectedDay, setSelectedDay] = useState("1");
  const [selectedPart, setSelectedPart] = useState("1");
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const availability = useMemo(
    () => computePartAvailability(leaderboard),
    [leaderboard]
  );

  const leaderboardRows = useMemo(
    () => buildLeaderboard(leaderboard, selectedDay, selectedPart),
    [leaderboard, selectedDay, selectedPart]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!leaderboardCode.trim() || !sessionToken.trim()) {
      setError(
        "Please enter both the private leaderboard code and your AoC session token."
      );
      return;
    }

    setLoading(true);
    setLeaderboard(null);

    try {
      const response = await fetch(
        `/aoc/${year}/leaderboard/private/view/${leaderboardCode}.json`,
        {
          headers: {
            Accept: "application/json",
            "X-Aoc-Session": sessionToken.trim(),
          },
          credentials: "omit",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Unable to load leaderboard (status ${response.status}). ` +
            "Ensure you are signed in to Advent of Code and have access to this board."
        );
      }

      const json = await response.json();
      const defaults = findDefaultSelection(json);
      setLeaderboard(json);
      setSelectedDay(defaults.day);
      setSelectedPart(defaults.part);
    } catch (err) {
      setError(err.message || "Something went wrong while loading data.");
    } finally {
      setLoading(false);
    }
  };

  const handlePartSelect = (day, part) => {
    setSelectedDay(day);
    setSelectedPart(part);
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Advent of Code Insights</p>
          <h1>Aoclytic</h1>
          <p className="lede">
            Explore your private leaderboard by day and part. Enter a year and
            code to see per-part rankings with completion times.
          </p>
        </div>
      </header>

      <section className="card">
        <form className="load-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Year</span>
            <input
              type="number"
              min="2015"
              max={new Date().getFullYear()}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Private leaderboard code</span>
            <input
              type="text"
              placeholder="e.g. 123456"
              value={leaderboardCode}
              onChange={(e) => setLeaderboardCode(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Session token</span>
            <input
              type="password"
              placeholder="Paste your adventofcode.com session token"
              value={sessionToken}
              onChange={(e) => setSessionToken(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Loading…" : "Load leaderboard"}
          </button>
        </form>
        <p className="hint">
          Paste the <code>session</code> token from your adventofcode.com
          cookies so the request can authenticate to the private board. The
          value stays in this page only.
        </p>
        {error && <div className="error">{error}</div>}
      </section>

      <section className="layout">
        <div className="card days">
          <div className="card-header">
            <h2>Days</h2>
            <p>Select a day and part to view its ranking.</p>
          </div>
          <div className="day-grid">
            {dayNumbers.map((day) => {
              const dayHasData = availability[day];
              return (
                <div key={day} className="day-tile">
                  <div className="day-title">Day {day}</div>
                  <div className="part-buttons">
                    {[1, 2].map((part) => {
                      const isSelected =
                        selectedDay === day && selectedPart === String(part);
                      const hasCompletions = dayHasData?.[part];

                      return (
                        <button
                          key={part}
                          type="button"
                          className={`part-button ${
                            isSelected ? "active" : ""
                          } ${hasCompletions ? "has-data" : ""}`}
                          onClick={() => handlePartSelect(day, String(part))}
                        >
                          Part {part}
                        </button>
                      );
                    })}
                  </div>
                  {availability[day] && (
                    <p className="availability">
                      {availability[day][1] || availability[day][2]
                        ? `${availability[day][1] ? "★" : "✦"} Part 1 · ${
                            availability[day][2] ? "★" : "✦"
                          } Part 2`
                        : "No completions yet"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card leaderboard">
          <div className="card-header">
            <h2>
              Day {selectedDay} · Part {selectedPart}
            </h2>
            <p>Rankings by completion time.</p>
          </div>
          {!leaderboard && (
            <p className="muted">
              Load a leaderboard to see per-part rankings here.
            </p>
          )}
          {leaderboard && leaderboardRows.length === 0 && (
            <p className="muted">No completions yet for this part.</p>
          )}
          {leaderboard && leaderboardRows.length > 0 && (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Participant</th>
                    <th>ID</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardRows.map((row) => (
                    <tr key={`${row.id}-${row.rank}`}>
                      <td>{row.rank}</td>
                      <td>{row.name}</td>
                      <td>{row.id}</td>
                      <td>{row.completedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
