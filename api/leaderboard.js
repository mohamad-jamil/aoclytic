export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).end();

  const { year, leaderboardCode, sessionToken } = req.body || {};
  if (!year || !leaderboardCode || !sessionToken) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const upstream = await fetch(
      `https://adventofcode.com/${year}/leaderboard/private/view/${leaderboardCode}.json`,
      {
        headers: {
          cookie: `session=${sessionToken}`,
          accept: "application/json",
          "user-agent": "Aoclytic (Vercel proxy)",
        },
      }
    );

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: `Upstream status ${upstream.status}` });
    }

    const data = await upstream.json();
    res.setHeader("Access-Control-Allow-Origin", "*"); // tighten to your domain if you prefer
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Fetch failed" });
  }
}
