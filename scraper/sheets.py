"""
sheets.py  —  Google Sheets read / write via gspread
Columns match google-sheets-loader.js COL indices exactly.
"""
import json
import gspread
from google.oauth2.service_account import Credentials
from config import (
    SHEET_ID, SHEET_NAME, GOOGLE_SERVICE_ACCOUNT_JSON,
    COL, TOTAL_COLS, SHEET_HEADERS,
)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


def _client() -> gspread.Client:
    sa = GOOGLE_SERVICE_ACCOUNT_JSON.strip()
    if sa.startswith("{"):
        creds = Credentials.from_service_account_info(json.loads(sa), scopes=SCOPES)
    else:
        creds = Credentials.from_service_account_file(sa, scopes=SCOPES)
    return gspread.authorize(creds)


def _sheet() -> gspread.Worksheet:
    return _client().open_by_key(SHEET_ID).worksheet(SHEET_NAME)


# ── Read ───────────────────────────────────────────────────────────────────

def get_all_rows() -> list[list]:
    """Returns all rows including header row."""
    ws = _sheet()
    return ws.get_all_values()


def get_pending_ids() -> list[dict]:
    """
    Returns rows where:
      - CONST column (col 26) has a value starting with 'tt'
      - TITLE column (col 0) is EMPTY  ← means not yet scraped
    Returns list of {"row_number": int, "imdb_id": str}
    Row numbers are 1-based (row 1 = header, data starts row 2).
    """
    rows = get_all_rows()
    pending = []
    for i, row in enumerate(rows[1:], start=2):  # skip header
        # Pad row if shorter than expected
        while len(row) < TOTAL_COLS:
            row.append("")

        imdb_id = row[COL["CONST"]].strip()
        title   = row[COL["TITLE"]].strip()

        if imdb_id.startswith("tt") and not title:
            pending.append({"row_number": i, "imdb_id": imdb_id})

    return pending


# ── Write ──────────────────────────────────────────────────────────────────

def write_scraped_row(row_number: int, data: dict) -> None:
    """
    Updates an existing row in the sheet with scraped data.
    row_number is 1-based. data keys match COL keys.
    Preserves any existing values (e.g. VR Rating, Sub-Genre, Date Rated)
    that were manually filled in.
    """
    ws = _sheet()

    # Fetch the existing row first to preserve manual fields
    existing = ws.row_values(row_number)
    while len(existing) < TOTAL_COLS:
        existing.append("")

    # Build updated row — only overwrite fields that the scraper provides
    # Manual fields (VR_RATING, SUB_GENRE, DATE_RATED) are left as-is
    MANUAL_FIELDS = {"VR_RATING", "SUB_GENRE", "DATE_RATED"}

    updated = existing[:]
    for key, col_idx in COL.items():
        if key in MANUAL_FIELDS:
            continue  # Don't overwrite manual fields
        if key in data and data[key]:
        val = data[key]
    # Store numeric fields as numbers, not strings (prevents Sheets apostrophe)
    NUMERIC_FIELDS = {"YEAR", "RUNTIME", "IMDB_RATING", "TOTAL_VOTES", "RATING_DIFF", "EPISODES"}
    if key in NUMERIC_FIELDS:
        try:
            updated[col_idx] = int(val) if str(val).isdigit() else float(val)
        except Exception:
            updated[col_idx] = str(val)
    else:
        updated[col_idx] = str(val)

    # Compute derived fields
    updated[COL["URL"]]    = f"https://www.imdb.com/title/{data.get('CONST', '')}"
    updated[COL["DECADE"]] = _decade(data.get("YEAR", ""))

    vr  = _safe_float(existing[COL["VR_RATING"]])
    imdb = _safe_float(data.get("IMDB_RATING", ""))
    if vr is not None and imdb is not None:
        diff = round(vr - imdb, 1)
        updated[COL["RATING_DIFF"]] = str(diff)

    votes = _safe_int(data.get("TOTAL_VOTES", ""))
    updated[COL["VOTE_CATEGORY"]] = _vote_category(votes)

    ws.update(f"A{row_number}", [updated])
    print(f"  ✅ Row {row_number} updated — {data.get('TITLE', '')}")


# ── Helpers ────────────────────────────────────────────────────────────────

def _decade(year: str) -> str:
    try:
        y = int(year)
        return str((y // 10) * 10)
    except Exception:
        return ""

def _safe_float(val) -> float | None:
    try:
        return float(str(val).strip())
    except Exception:
        return None


def _safe_int(val) -> int | None:
    try:
        return int(str(val).replace(",", "").strip())
    except Exception:
        return None


def _vote_category(votes: int | None) -> str:
    if votes is None:
        return ""
    if votes >= 1_000_000:
        return "Blockbuster"
    if votes >= 500_000:
        return "Popular"
    if votes >= 100_000:
        return "Well Known"
    if votes >= 10_000:
        return "Niche"
    return "Obscure"
