import os

# ── Google Sheets ──────────────────────────────────────────────────────────
SHEET_ID   = os.environ["SHEET_ID"]
SHEET_NAME = os.environ.get("SHEET_NAME", "MasterSheet")
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]

# ── IMDB ───────────────────────────────────────────────────────────────────
IMDB_BASE_URL = "https://www.imdb.com/title/"
HEADLESS      = os.environ.get("HEADLESS", "true").lower() == "true"
SCRAPE_TIMEOUT = int(os.environ.get("SCRAPE_TIMEOUT", "30"))

# ── Sheet column indices ───────────────────────────────────────────────────
# Must match COL in google-sheets-loader.js exactly
# Row 1 = headers, data starts row 2
# Col index is 0-based (used internally); gspread append uses order below

COL = {
    "TITLE":           0,
    "ORIGINAL_TITLE":  1,
    "TITLE_TYPE":      2,
    "YEAR":            3,
    "RELEASE_DATE":    4,
    "CERTIFICATION":   5,
    "LANGUAGES":       6,
    "GENRES":          7,
    "SUB_GENRE":       8,
    "RUNTIME":         9,
    "PLOT":           10,
    "IMDB_RATING":    11,
    "VR_RATING":      12,
    "TOTAL_VOTES":    13,
    "CAST":           14,
    "DIRECTORS":      15,
    "WRITERS":        16,
    "STREAMING_LOGO1":17,
    "STREAMING_LOGO2":18,
    "STREAMING_LOGO3":19,
    "LOGO_NAME1":     20,
    "LOGO_NAME2":     21,
    "LOGO_NAME3":     22,
    "POSTER":         23,
    "URL":            24,
    "DATE_RATED":     25,
    "CONST":          26,
    "DECADE":         27,
    "RATING_DIFF":    28,
    "VOTE_CATEGORY":  29,
    "EPISODES":       30,
}

# Total number of columns in the sheet
TOTAL_COLS = 31

# Header row — must match your sheet row 1 exactly
SHEET_HEADERS = [
    "Title", "Original Title", "Title Type", "Year", "Release Date",
    "Certification", "Languages", "Genres", "Sub-Genre", "Runtime (mins)",
    "Plot", "IMDb Rating", "VR Rating", "Total Votes",
    "Cast", "Directors", "Writers",
    "StreamingLogo1", "StreamingLogo2", "StreamingLogo3",
    "LogoName_1", "LogoName_2", "LogoName_3",
    "Poster", "URL", "Date Rated", "Const",
    "Decade", "RatingDiff", "VoteCategory", "Episodes",
]
