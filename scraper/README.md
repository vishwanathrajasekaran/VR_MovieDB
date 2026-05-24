# VR Movie DB — Nightly Scrape Pipeline

Automatically scrapes IMDB data for any title you add to the MasterSheet.

---

## How it works

1. You open Google Sheet → add a new row with **only the IMDB ID** in the `Const` column (e.g. `tt1234567`)
2. Every night at **midnight UTC (5:30 AM IST)** GitHub Actions runs the pipeline
3. The pipeline finds every row where `Const` has a `tt...` ID but `Title` is empty
4. It scrapes IMDB for each pending title and fills in all columns
5. Hard refresh your website — the new title appears

You can also trigger it **manually** anytime from the GitHub Actions tab → "VR Movie DB — Nightly IMDB Scrape" → "Run workflow".

---

## What gets scraped automatically

| Field | Source |
|---|---|
| Title | IMDB JSON-LD |
| Original Title | IMDB JSON-LD |
| Title Type | IMDB JSON-LD |
| Year | IMDB JSON-LD |
| Release Date | IMDB JSON-LD |
| Certification | IMDB Parental Guide page |
| Languages | IMDB page HTML |
| Genres | IMDB JSON-LD |
| Runtime (mins) | IMDB JSON-LD |
| Plot | IMDB JSON-LD |
| IMDb Rating | IMDB JSON-LD |
| Total Votes | IMDB JSON-LD |
| Cast (top 5) | IMDB JSON-LD |
| Directors | IMDB JSON-LD |
| Writers | IMDB JSON-LD |
| LogoName_1/2/3 | IMDB page (Selenium) |
| Poster URL | IMDB JSON-LD |
| URL | Auto-built |
| Decade | Calculated from Year |
| VoteCategory | Calculated from Total Votes |

## What you fill in manually (pipeline never overwrites these)

- **VR Rating** — your personal rating
- **Sub-Genre** — your custom sub-genre tag
- **Date Rated** — when you watched it

---

## One-time setup

### Step 1 — Google Service Account (free)

1. Go to https://console.cloud.google.com
2. Create a new project (e.g. `vr-movie-db`)
3. Enable **Google Sheets API** and **Google Drive API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Name it anything (e.g. `vr-scraper`) → click Done
6. Click the service account → **Keys → Add Key → JSON** → Download
7. Open your Google Sheet → **Share** → paste the service account email → give **Editor** access

### Step 2 — Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these 3 secrets:

| Secret name | Value |
|---|---|
| `SHEET_ID` | The long ID from your Google Sheet URL |
| `SHEET_NAME` | `MasterSheet` (or your tab name) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the **entire contents** of the downloaded JSON file |

Your Sheet ID is here:
```
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit
```

### Step 3 — Push to GitHub

```bash
git add .github/workflows/nightly-scrape.yml scraper/
git commit -m "feat: add nightly IMDB scrape pipeline"
git push
```

That's it. The pipeline runs automatically every midnight.

---

## Adding a title

1. Open your Google Sheet → go to `MasterSheet` tab
2. Add a new row
3. Put the IMDB ID in the **Const column** (column 27, header `Const`), e.g. `tt0816692`
4. Leave all other columns empty
5. Wait for midnight — or manually trigger the pipeline from GitHub Actions

---

## Manual trigger

1. Go to your repo on GitHub
2. Click **Actions** tab
3. Click **"VR Movie DB — Nightly IMDB Scrape"**
4. Click **"Run workflow"** → **"Run workflow"**
5. Watch the logs — takes ~15 seconds per title

---

## Folder structure added to VR_MovieDB repo

```
VR_MovieDB/
├── .github/
│   └── workflows/
│       └── nightly-scrape.yml   ← GitHub Actions cron job
├── scraper/
│   ├── main.py                  ← Pipeline entry point
│   ├── imdb_scraper.py          ← IMDB scraping logic
│   ├── sheets.py                ← Google Sheets read/write
│   ├── config.py                ← Column mapping + settings
│   └── requirements.txt         ← Python dependencies
└── ... (existing frontend files untouched)
```
