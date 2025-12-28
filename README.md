
# AI Blog Enhancer

AI Blog Enhancer is a small end-to-end system that:

1) seeds a database with the **5 oldest** BeyondChats blog posts,
2) gathers external references for each post, rewrites the content with an LLM, and publishes an **updated version** linked to the original,
3) provides a React UI to extract + review originals vs updated content **side-by-side**.

This repository is structured as three phases: **Scraping**, **Automation**, and **Frontend**.

## Problem statement

Many blog repositories contain older posts that are outdated, missing references, or poorly structured for readability.

The goal of this project is to automate a safe, repeatable workflow to:

- identify target posts (starting with the oldest),
- collect supporting sources,
- produce an updated version while tracking provenance (original ↔ updated),
- and review the results clearly in a UI.

## Phase-wise breakdown

### Phase 1 — Scraping (seed data)

**Objective:** Fetch the **5 oldest** posts from `https://beyondchats.com/blogs/` and store them as "original" articles.

Key behaviors:

- Finds the last blog listing page, then walks backward to collect the oldest posts.
- Deduplicates by slug / URL so re-runs do not create duplicates.
- Re-runs are safe: if the oldest originals already exist in MongoDB, scraping skips duplicates and avoids inserting again.

Code lives mainly in:

- [backend/src/scripts/scrapeOldestBlogs.js](backend/src/scripts/scrapeOldestBlogs.js)

### Phase 2 — Automation (search → scrape → rewrite → publish)

**Objective:** For each original article, generate an updated version backed by external references.

Pipeline stages:

1) Fetch originals from the backend API
2) Search the web (Google/Serper) for relevant sources
3) Scrape external pages for usable reference content
4) Rewrite the post using an LLM (OpenRouter)
5) Publish the updated article back to the backend, linked to the original

Important rules enforced:

- Requires a minimum number of usable references before rewriting/publishing.
- Blocks known low-quality / disallowed domains (e.g., `researchgate.net`).
- Skips originals that already have an updated version.

Code lives mainly in:

- [automation/](automation/)

### Phase 3 — Frontend (review & comparison)

**Objective:** Provide a simple UI to:

- trigger extraction of the 5 oldest posts via the backend API,
- show only those extracted originals and their updated counterparts,
- view **Original vs Updated** side-by-side in a detail view,
- render images inline (not just URLs) and preserve their relative position where possible.

Behavior details:

- The extracted selection is persisted in `localStorage`, so users don’t need to re-extract after navigating back from a detail page.

Code lives mainly in:

- [frontend/src/pages/ArticlesList.jsx](frontend/src/pages/ArticlesList.jsx)
- [frontend/src/pages/ArticleDetail.jsx](frontend/src/pages/ArticleDetail.jsx)

## System architecture

At a high level:

- **Frontend (React/Vite)** calls the **Backend API** to extract and display articles.
- **Backend (Express)** exposes CRUD endpoints and an extraction endpoint, and persists articles in **MongoDB**.
- **Automation scripts (Node.js)** orchestrate search + scraping + LLM rewrite, then publish updated versions back to the backend.

Data model (conceptual):

- An `Article` can be an **original** or an **updated** version.
- Updated articles store `originalArticleId` to link back to the original.
- The UI uses this link to pair and compare versions.

## Tech stack

**Backend**

- Node.js + Express
- MongoDB + Mongoose
- dotenv
- axios, cheerio (scraping)

**Automation**

- Node.js scripts
- Google search via Serper API
- LLM rewrite via OpenRouter

**Frontend**

- React (Vite)
- Plain CSS (global stylesheet)

## Edge cases handled

- **Idempotent extraction:** if the 5 oldest originals are already present, the extractor returns them from DB.
- **Duplicate avoidance:** skips inserting duplicates by slug/URL.
- **Already-updated originals:** automation avoids reprocessing originals that already have an updated version.
- **Reference quality gating:** requires a minimum number of references before rewriting.
- **Blocked domains:** excludes disallowed domains such as `researchgate.net`.
- **Content readability:** converts raw HTML content to human-readable text and removes common boilerplate.
- **Image handling:** renders images and aligns updated-side images to match original positions.
- **UX persistence:** extracted selection is saved in `localStorage` so navigating back does not force re-extraction.

## How to run locally

### Prerequisites

- Node.js 18+ recommended
- MongoDB running locally (or a hosted MongoDB URI)

### 1) Backend setup

From the repository root:

1. Create a `.env` file (in `backend/` if your backend reads env there; otherwise at repo root depending on your setup).
2. Configure at minimum:

- `MONGODB_URI` (MongoDB connection string)
- `PORT` (backend port, e.g. `3000`)
- `FRONTEND_ORIGIN` (for CORS, e.g. `http://localhost:5173`)

Run the backend (example):

- `cd backend`
- `npm install`
- `node server.js`

### 2) Frontend setup

- `cd frontend`
- `npm install`
- `npm run dev`

Open `http://localhost:5173`.

### 3) Scrape the 5 oldest posts

Use the UI button **"Extract 5 oldest from website"** (this calls a backend extraction endpoint).

Alternatively, you can call the API directly:

- `POST http://localhost:<PORT>/api/articles/extract-oldest`

### 4) Run the automation pipeline

Set required keys in your environment (commonly in `.env`):

- `SERPER_API_KEY`
- `OPENROUTER_API_KEY`

Then run:

- `npm run pipeline`

This runs the scripts in [automation/](automation/) to create updated versions.

## Future improvements

- Replace the simple in-app routing with a real router (e.g. React Router) to avoid full page reloads.
- Add a job queue (BullMQ / RabbitMQ) so the automation pipeline can run reliably with retries and progress reporting.
- Add better reference scoring (domain trust, recency, duplicate source detection).
- Add automated tests for scraping heuristics and content-cleaning utilities.
- Add observability: structured logs and basic metrics for extraction and pipeline runs.
- Add an approval workflow in UI (review → approve → publish).

