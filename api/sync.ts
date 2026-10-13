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

const getKeyName = (userId: string) => `zen-stock-folio:sync:user:${userId}`;

/**
 * Resolves the caller's Supabase user id from the `Authorization: Bearer`
 * access token. Returns null when the token is missing or invalid.
 *
 * This endpoint used to key snapshots on a caller-supplied `syncId`, with no
 * authentication at all, which made any portfolio readable and overwritable by
 * guessing an id. The key is now derived from the verified token only and the
 * client-supplied id is ignored.
 */
async function getAuthenticatedUserId(req: any): Promise<string | null> {
  const header: string = req.headers?.authorization ?? req.headers?.Authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const apiKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!url || !apiKey) return null;

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

async function getSnapshotFromRedis(userId: string) {
  const config = getRedisConfig();
  if (!config) {
    return { status: 503, body: { error: "Cloud sync is not configured on server" } };
  }

  const response = await fetch(`${config.url}/get/${encodeURIComponent(getKeyName(userId))}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });

  if (!response.ok) {
    return { status: 502, body: { error: "Failed to fetch cloud snapshot" } };
  }

  const data = await response.json();
  if (!data?.result) {
    return { status: 404, body: { error: "No cloud snapshot found for this account" } };
  }

  return { status: 200, body: { snapshot: data.result as SnapshotPayload } };
}

async function saveSnapshotToRedis(userId: string, snapshot: SnapshotPayload) {
  const config = getRedisConfig();
  if (!config) {
    return { status: 503, body: { error: "Cloud sync is not configured on server" } };
  }

  const response = await fetch(`${config.url}/set/${encodeURIComponent(getKeyName(userId))}`, {
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
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Every snapshot is bound to the authenticated Supabase user.
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (req.method === "GET") {
      const result = await getSnapshotFromRedis(userId);
      return res.status(result.status).json(result.body);
    }

    const { snapshot } = req.body ?? {};
    if (!snapshot || typeof snapshot !== "object") {
      return res.status(400).json({ error: "snapshot is required" });
    }

    const result = await saveSnapshotToRedis(userId, snapshot as SnapshotPayload);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Sync API error:", error);
    return res.status(500).json({ error: "Unexpected sync error" });
  }
}
