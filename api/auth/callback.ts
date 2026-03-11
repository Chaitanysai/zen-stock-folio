// api/auth/callback.ts
// Upstox redirects here after login with ?code=XXXX
// This exchanges the code for an access token and displays it

export default async function handler(req: any, res: any) {
  const code = req.query?.code as string;

  if (!code) {
    return res.status(400).send("No code in URL");
  }

  const apiKey    = process.env.UPSTOX_API_KEY;
  const apiSecret = process.env.UPSTOX_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).send("UPSTOX_API_KEY or UPSTOX_API_SECRET not configured in Vercel");
  }

  try {
    const body = new URLSearchParams({
      code,
      client_id:     apiKey,
      client_secret: apiSecret,
      redirect_uri:  "https://zen-stock-folio.vercel.app/api/auth/callback",
      grant_type:    "authorization_code",
    });

    const tokenRes = await fetch("https://api.upstox.com/v2/login/authorization/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok || !data?.access_token) {
      return res.status(400).send(`
        <h2>Token exchange failed</h2>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `);
    }

    // Show the token so user can copy it to Vercel
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Upstox Token</title>
        <style>
          body { font-family: sans-serif; max-width: 700px; margin: 60px auto; padding: 20px; }
          .token { background: #f0f0f0; padding: 16px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 13px; }
          .step { background: #fff3cd; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
          button { background: #e55a00; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; }
        </style>
      </head>
      <body>
        <h2>✅ Access Token Generated!</h2>
        <p>Copy this token and update <strong>UPSTOX_ACCESS_TOKEN</strong> in Vercel:</p>
        <div class="token" id="token">${data.access_token}</div>
        <br/>
        <button onclick="navigator.clipboard.writeText(document.getElementById('token').innerText)">
          Copy Token
        </button>
        <br/><br/>
        <div class="step">
          <strong>Steps:</strong><br/>
          1. Copy the token above<br/>
          2. Go to <a href="https://vercel.com" target="_blank">Vercel</a> → Settings → Environment Variables<br/>
          3. Update <code>UPSTOX_ACCESS_TOKEN</code> with the new token<br/>
          4. Click Save → Redeploy
        </div>
        <p style="color:#888; font-size:12px">Token expires at market close (3:30 AM IST next day). Repeat this process daily.</p>
      </body>
      </html>
    `);

  } catch (e: any) {
    return res.status(500).send(`Error: ${e.message}`);
  }
}
