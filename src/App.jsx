import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_YEAR = String(new Date().getFullYear());

const getDayNumbers = (year) => {
  const totalDays = Number(year) === 2025 ? 12 : 25;
  return Array.from({ length: totalDays }, (_, i) => String(i + 1));
};

const formatCompletionTime = (timestamp) => {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleString();
};

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

const findDefaultPlayerId = (leaderboard) => {
  const players = Object.values(leaderboard?.members ?? {}).map((member) => ({
    id: String(member.id),
    name: member.name || `Anonymous #${member.id}`,
  }));

  players.sort((a, b) => a.name.localeCompare(b.name));
  return players[0]?.id ?? "";
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

const buildPlayerSubmissions = (leaderboard, playerId, dayNumbers) => {
  if (!leaderboard || !playerId) return [];
  const player = Object.values(leaderboard.members ?? {}).find(
    (member) => String(member.id) === String(playerId)
  );
  if (!player) return [];

  const rows = [];

  dayNumbers.forEach((day) => {
    [1, 2].forEach((part) => {
      const completion = player.completion_day_level?.[day]?.[String(part)];
      rows.push({
        day,
        part: String(part),
        completedAt: completion
          ? formatCompletionTime(completion.get_star_ts)
          : "Not completed",
      });
    });
  });

  return rows;
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
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [viewMode, setViewMode] = useState("days");
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cacheRef = useRef({});

  const dayNumbers = useMemo(() => getDayNumbers(year), [year]);

  const availability = useMemo(
    () => computePartAvailability(leaderboard),
    [leaderboard]
  );

  const leaderboardRows = useMemo(
    () => buildLeaderboard(leaderboard, selectedDay, selectedPart),
    [leaderboard, selectedDay, selectedPart]
  );

  const players = useMemo(() => {
    if (!leaderboard) return [];

    return Object.values(leaderboard.members ?? {})
      .map((member) => ({
        id: String(member.id),
        name: member.name || `Anonymous #${member.id}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [leaderboard]);

  const playerSubmissions = useMemo(
    () => buildPlayerSubmissions(leaderboard, selectedPlayerId, dayNumbers),
    [leaderboard, selectedPlayerId, dayNumbers]
  );

  useEffect(() => {
    if (!leaderboard) return;
    setSelectedPlayerId(
      (current) => current || findDefaultPlayerId(leaderboard)
    );
  }, [leaderboard]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!leaderboardCode.trim() || !sessionToken.trim()) {
      setError(
        "Please enter both the private leaderboard code and your AoC session token."
      );
      return;
    }

    const proceed = window.confirm(
      "The Advent of Code API asks clients to avoid hitting this endpoint more than once every 15 minutes. Continue?"
    );
    if (!proceed) return;

    setLoading(true);
    setLeaderboard(null);

    try {
      const cacheKey = `${year}:${leaderboardCode}`;
      const cached = cacheRef.current[cacheKey];
      const FIFTEEN_MIN = 15 * 60 * 1000;

      if (cached && Date.now() - cached.fetchedAt < FIFTEEN_MIN) {
        const defaults = findDefaultSelection(cached.data);
        setLeaderboard(cached.data);
        setSelectedDay(defaults.day);
        setSelectedPart(defaults.part);
        setSelectedPlayerId(findDefaultPlayerId(cached.data));
        return;
      }

      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, leaderboardCode, sessionToken }),
      });

      if (!response.ok) {
        throw new Error(
          `Unable to load leaderboard (status ${response.status}). ` +
            "Ensure you are signed in to Advent of Code and have access to this board."
        );
      }

      const json = await response.json();
      const defaults = findDefaultSelection(json);
      cacheRef.current[cacheKey] = { data: json, fetchedAt: Date.now() };
      setLeaderboard(json);
      setSelectedDay(defaults.day);
      setSelectedPart(defaults.part);
      setSelectedPlayerId(findDefaultPlayerId(json));
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

  const selectedPlayerName =
    players.find((player) => player.id === selectedPlayerId)?.name ??
    (selectedPlayerId ? `Player #${selectedPlayerId}` : "");

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Advent of Code Insights</p>
          <h1>Aoclytic</h1>
          <p className="lede">
            Explore your private leaderboard by day or by player. Enter a year
            and code to see per-part rankings or every submission for a player.
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
            {loading ? "Loading..." : "Load leaderboard"}
          </button>
        </form>
        <p className="hint">
          Paste the <code>session</code> token from your adventofcode.com
          cookies so the request can authenticate to the private board. The
          value stays in this page only.
        </p>
        {error && <div className="error">{error}</div>}
      </section>

      <section className="card view-toggle">
        <div className="card-header">
          <h2>View</h2>
          <p>Switch between day rankings and per-player submissions.</p>
        </div>
        <div className="toggle-buttons">
          <button
            type="button"
            className={`toggle ${viewMode === "days" ? "active" : ""}`}
            onClick={() => setViewMode("days")}
          >
            Days
          </button>
          <button
            type="button"
            className={`toggle ${viewMode === "players" ? "active" : ""}`}
            onClick={() => setViewMode("players")}
          >
            Players
          </button>
        </div>
      </section>

      {viewMode === "days" && (
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
                        {(availability[day][1] ? "★" : "✦") +
                          " Part 1 / " +
                          (availability[day][2] ? "★" : "✦") +
                          " Part 2"}
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
                Day {selectedDay} / Part {selectedPart}
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
      )}

      {viewMode === "players" && (
        <section className="layout players-layout">
          <div className="card players">
            <div className="card-header">
              <h2>Players</h2>
              <p>Select a player to see all their submissions.</p>
            </div>
            {!leaderboard && <p className="muted">Load a leaderboard first.</p>}
            {leaderboard && players.length === 0 && (
              <p className="muted">No players found.</p>
            )}
            {leaderboard && players.length > 0 && (
              <div className="player-grid">
                {players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={`player-tile ${
                      selectedPlayerId === player.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedPlayerId(player.id)}
                  >
                    <span className="player-name">{player.name}</span>
                    <span className="player-id">#{player.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card submissions">
            <div className="card-header">
              <h2>Submissions</h2>
              <p>
                {selectedPlayerId
                  ? `All parts for ${selectedPlayerName}`
                  : "Pick a player to see their completions."}
              </p>
            </div>
            {selectedPlayerId && playerSubmissions.length === 0 && (
              <p className="muted">No submissions for this player.</p>
            )}
            {!selectedPlayerId && (
              <p className="muted">Select a player to view their stars.</p>
            )}
            {playerSubmissions.length > 0 && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Part</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerSubmissions.map((row) => (
                      <tr key={`${row.day}-${row.part}`}>
                        <td>Day {row.day}</td>
                        <td>Part {row.part}</td>
                        <td>{row.completedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
