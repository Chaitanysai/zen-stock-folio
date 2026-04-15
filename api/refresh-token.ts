// GET /api/refresh-token
// Call this once a day to get a fresh access token
// Usage: visit https://zen-stock-folio.vercel.app/api/refresh-token in browser

export default async function handler(req: any, res: any) {
  const apiKey    = process.env.UPSTOX_API_KEY;
  const apiSecret = process.env.UPSTOX_API_SECRET;
  const token     = process.env.UPSTOX_ACCESS_TOKEN;

  if (!apiKey || !apiSecret || !token) {
    return res.status(500).json({ error: "Missing Upstox env variables" });
  }

  try {
    const body = new URLSearchParams({
      code:          token,
      client_id:     apiKey,
      client_secret: apiSecret,
      redirect_uri:  "https://zen-stock-folio.vercel.app/api/auth/callback",
      grant_type:    "authorization_code",
    });

    const r = await fetch("https://api.upstox.com/v2/login/authorization/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await r.json();

    if (!r.ok || !data?.access_token) {
      return res.status(400).json({
        error: "Token refresh failed",
        detail: data,
        hint: "Access token may have expired. Re-login at developer.upstox.com and update UPSTOX_ACCESS_TOKEN in Vercel."
      });
    }

    return res.status(200).json({
      message: "✅ Token refreshed! Update UPSTOX_ACCESS_TOKEN in Vercel with the new token below.",
      new_access_token: data.access_token,
      expires_in: data.expires_in,
    });

  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}