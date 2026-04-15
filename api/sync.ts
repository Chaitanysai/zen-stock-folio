type SnapshotPayload = {
  stocks: unknown[];
  trades: unknown[];
  watchlist: unknown[];
  alerts: unknown[];
};

const getRedisConfig = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
};

const getKeyName = (syncId: string) => `zen-stock-folio:sync:${syncId}`;

async function getSnapshotFromRedis(syncId: string) {
  const config = getRedisConfig();
  if (!config) {
    return { status: 503, body: { error: "Cloud sync is not configured on server" } };
  }

  const response = await fetch(`${config.url}/get/${encodeURIComponent(getKeyName(syncId))}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });

  if (!response.ok) {
    return { status: 502, body: { error: "Failed to fetch cloud snapshot" } };
  }

  const data = await response.json();
  if (!data?.result) {
    return { status: 404, body: { error: "No cloud snapshot found for this Sync ID" } };
  }

  return { status: 200, body: { snapshot: data.result as SnapshotPayload } };
}

async function saveSnapshotToRedis(syncId: string, snapshot: SnapshotPayload) {
  const config = getRedisConfig();
  if (!config) {
    return { status: 503, body: { error: "Cloud sync is not configured on server" } };
  }

  const response = await fetch(`${config.url}/set/${encodeURIComponent(getKeyName(syncId))}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) {
    return { status: 502, body: { error: "Failed to save cloud snapshot" } };
  }

  return { status: 200, body: { ok: true } };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "GET") {
      const syncId = req.query?.syncId;
      if (!syncId || typeof syncId !== "string") {
        return res.status(400).json({ error: "syncId is required" });
      }

      const result = await getSnapshotFromRedis(syncId);
      return res.status(result.status).json(result.body);
    }

    if (req.method === "POST") {
      const { syncId, snapshot } = req.body ?? {};
      if (!syncId || typeof syncId !== "string") {
        return res.status(400).json({ error: "syncId is required" });
      }
      if (!snapshot || typeof snapshot !== "object") {
        return res.status(400).json({ error: "snapshot is required" });
      }

      const result = await saveSnapshotToRedis(syncId, snapshot as SnapshotPayload);
      return res.status(result.status).json(result.body);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Sync API error:", error);
    return res.status(500).json({ error: "Unexpected sync error" });
  }
}
