# Univest Card Studio

Browser-based creative production tool for sale cards, homepage banners, and bulk card generation.

## What This App Does

- Build sale cards from uploaded PNG backgrounds and SVG/PNG logos.
- Edit offer text, pricing, colors, font sizes, and exact element positions.
- Save cards into folders with previews, tags, search, and export actions.
- Generate homepage banners on a fixed 1440 x 280 canvas.
- Bulk-generate many cards from CSV/XLSX data plus logo ZIP files.
- Export PNG/JPEG files and ZIP packages.

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js native HTTP server
- Export tooling: html2canvas, JSZip, Canvas API
- Spreadsheet import: XLSX browser library
- Optional AI banner art: `@google/genai`
- QA: Playwright

## Local Run

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:5511/Mr.%20Card%20Arora.html
```

## GitHub Pages Hosting

GitHub Pages is static hosting. The app works publicly as a static design/export tool, but these backend features are disabled:

- Shared server library sync
- Gemini banner image generation
- Server JSON backups

In static mode, designs are saved in each user's browser `localStorage`.

### Build Static Files

```bash
node scripts/build-pages.js
```

This creates a `dist/` folder with only public files:

- `index.html`
- `app.js`
- `styles.css`
- logo ZIP assets
- `sale data 22 April.xlsx`

Sensitive/runtime files such as `.env`, `server-data/`, `node_modules/`, and backend logs are not included.

### Verify Locally

```bash
npm run verify
```

This checks JavaScript syntax and rebuilds the static GitHub Pages output.

### Browser QA

```bash
npm run qa
```

This starts the local Node server, runs the main Playwright regression script, and stops the server afterward.

Other targeted QA commands:

```bash
npm run qa:feature
npm run qa:folder
npm run qa:offer
npm run qa:transform
npm run qa:all
```

### Deploy

Before running the workflow, enable Pages for GitHub Actions:

1. Open repository `Settings`.
2. Go to `Pages`.
3. Set source to `GitHub Actions`.

Then push the repository to GitHub on the `main` or `master` branch. The included GitHub Actions workflow deploys `dist/` to GitHub Pages automatically.

Your public URL will look like:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

## Full Backend Deployment

If you need shared folders, server backups, or Gemini banner generation publicly, deploy the Node server on a backend host such as Render, Railway, Fly.io, or a VPS instead of GitHub Pages.

Required environment variables:

```text
PORT=5511
HOST=0.0.0.0
GEMINI_API_KEY=your_key_here
GEMINI_BANNER_MODEL=imagen-4.0-generate-001
NODE_ENV=production
```

## Security Notes

- Never commit `.env`.
- Never commit `server-data/` backups if they contain private campaign assets.
- GitHub Pages build publishes only `dist/`.
- Backend server blocks sensitive files when running locally or on a Node host.
