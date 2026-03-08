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

## Build

```sh
npm run build
```

## Environment variables

Required:

- `GOOGLE_API_KEY` — Google Gemini API key used by `/api/ai`.

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
