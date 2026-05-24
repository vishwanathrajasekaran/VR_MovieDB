"""
main.py  —  VR Movie DB nightly scrape pipeline
---------------------------------------------------
1. Reads Google Sheet (MasterSheet)
2. Finds rows where Const = tt... but Title is empty (pending scrape)
3. Scrapes each IMDB ID
4. Writes enriched data back to the same row
5. Leaves manual fields (VR Rating, Sub-Genre, Date Rated) untouched
"""
import sys
import time

# Must set sys.path so config/sheets/imdb_scraper are importable
import os
sys.path.insert(0, os.path.dirname(__file__))

from sheets import get_pending_ids, write_scraped_row
from imdb_scraper import scrape


def run():
    print("=" * 60)
    print("VR Movie DB — Nightly IMDB Scrape Pipeline")
    print("=" * 60)

    # ── 1. Find pending rows ───────────────────────────────────────
    print("\n📋 Reading sheet for pending IMDB IDs …")
    try:
        pending = get_pending_ids()
    except Exception as e:
        print(f"❌ Failed to read sheet: {e}")
        sys.exit(1)

    if not pending:
        print("✅ No pending titles found. Sheet is up to date.")
        return

    print(f"🎬 Found {len(pending)} pending title(s):\n")
    for p in pending:
        print(f"   Row {p['row_number']:>4}  →  {p['imdb_id']}")

    # ── 2. Scrape each one ─────────────────────────────────────────
    success = 0
    failed  = []

    for i, item in enumerate(pending, 1):
        imdb_id    = item["imdb_id"]
        row_number = item["row_number"]

        print(f"\n[{i}/{len(pending)}] Scraping {imdb_id} (row {row_number}) …")

        try:
            data = scrape(imdb_id)
            write_scraped_row(row_number, data)
            print(f"  ✅ Done — {data.get('TITLE', imdb_id)}")
            success += 1
        except Exception as e:
            print(f"  ❌ Failed — {e}")
            failed.append({"imdb_id": imdb_id, "row": row_number, "error": str(e)})

        # Polite delay between scrapes — avoid rate limiting
        if i < len(pending):
            print("  ⏳ Waiting 3 seconds …")
            time.sleep(3)

    # ── 3. Summary ─────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"Pipeline complete — {success} succeeded, {len(failed)} failed")

    if failed:
        print("\nFailed titles:")
        for f in failed:
            print(f"  Row {f['row']:>4}  {f['imdb_id']}  →  {f['error']}")
        # Exit with error code so GitHub Actions marks the run as failed
        sys.exit(1)


if __name__ == "__main__":
    run()
