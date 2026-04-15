# Zen Stock Folio

A Vite + React + TypeScript stock portfolio app with AI portfolio analysis powered by Google Gemini.

## Tech stack

- Vite
- React
- TypeScript
- Tailwind CSS + shadcn/ui
- Vercel Serverless Functions (`/api`)

## Local development

```sh
npm install
npm run dev
```

If you run the frontend with Vite, the app expects the serverless API to be available separately.

- Recommended: run the project through `vercel dev` so both the frontend and `/api/*` routes are available together.
- Alternative: set `VITE_API_BASE_URL` to the origin serving `/api`, for example `http://localhost:3000`.

Without the API, the dashboard will still render sample data, but live prices and AI analysis will be unavailable.

## Build

```sh
npm run build
```

## Environment variables

Required:

- `GOOGLE_API_KEY` — Google Gemini API key used by `/api/ai`.
- `VITE_SUPABASE_URL` — Supabase project URL used by the login flow.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/publishable key used by the login flow.

The login screen uses Supabase email/password auth. You need at least one valid user in your Supabase project's Authentication users list.

### Configure in Vercel

1. Open your project in Vercel.
2. Go to **Settings → Environment Variables**.
3. Add a new variable:
   - Name: `GOOGLE_API_KEY`
   - Value: `<your_google_api_key>`
4. Apply it to Production (and Preview/Development if needed).
5. Redeploy the project.

## Runtime flow

Browser → React frontend → `/api/ai` (Vercel serverless function) → Google Gemini API → response returned to UI.
