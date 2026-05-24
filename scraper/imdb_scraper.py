"""
imdb_scraper.py  —  Scrapes a single IMDB title by ID.
Uses cinemagoer (IMDbPY) — bypasses IP blocks on GitHub Actions.
Uses Selenium only for streaming platform names (JS-rendered).
"""
import re
import time
import requests
from bs4 import BeautifulSoup
from imdb import Cinemagoer
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from config import IMDB_BASE_URL, HEADLESS, SCRAPE_TIMEOUT

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


# ── Selenium driver ────────────────────────────────────────────────────────

def _build_driver() -> webdriver.Chrome:
    options = Options()
    if HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(f"user-agent={HEADERS['User-Agent']}")
    options.add_argument("--lang=en-US")
    options.binary_location = "/usr/bin/google-chrome"
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)


# ── Main page scrape (cinemagoer) ──────────────────────────────────────────

def _scrape_main(imdb_id: str) -> dict:
    ia = Cinemagoer()
    numeric_id = imdb_id.lstrip("t")
    movie = ia.get_movie(numeric_id, info=['main', 'plot', 'vote details'])
    print(f"  → Raw movie data keys: {list(movie.keys())}")

    d = {}
    d["TITLE"]          = movie.get("title", "")
    d["ORIGINAL_TITLE"] = movie.get("original title", d["TITLE"])

    kind_map = {
        "movie":          "Movie",
        "tv series":      "TV Series",
        "tv mini series": "TV Mini Series",
        "tv movie":       "TV Movie",
        "tv episode":     "TV Episode",
        "short":          "Short",
        "video":          "Video",
        "video game":     "Video Game",
    }
    d["TITLE_TYPE"] = kind_map.get(movie.get("kind", "movie"), "Movie")

    d["YEAR"]         = str(movie.get("year", ""))
    d["RELEASE_DATE"] = str(movie.get("original air date", movie.get("year", "")))
    d["GENRES"]       = ", ".join(movie.get("genres", []))

    runtimes   = movie.get("runtimes", [])
    d["RUNTIME"] = runtimes[0] if runtimes else ""

    plots    = movie.get("plot", [])
    d["PLOT"] = plots[0].split("::")[0] if plots else ""

    d["IMDB_RATING"] = str(movie.get("rating", ""))
    d["TOTAL_VOTES"] = str(movie.get("votes", ""))

    d["DIRECTORS"] = ", ".join(p["name"] for p in movie.get("directors", [])[:3])
    d["WRITERS"]   = ", ".join(p["name"] for p in movie.get("writers", [])[:3])
    d["CAST"]      = ", ".join(p["name"] for p in movie.get("cast", [])[:5])
    d["POSTER"]    = movie.get("full-size cover url", movie.get("cover url", ""))
    d["LANGUAGES"] = ", ".join(movie.get("languages", []))

    d["EPISODES"] = ""
    if d["TITLE_TYPE"] not in ("Movie", "TV Movie", "Short", "Video"):
        try:
            ia.update(movie, "episodes")
            eps   = movie.get("episodes", {})
            total = sum(len(s) for s in eps.values())
            d["EPISODES"] = str(total) if total else ""
        except Exception:
            pass

    d["CONST"] = imdb_id
    print(f"  → Title found: {d['TITLE']}")
    return d


# ── Certification (parental guide page) ────────────────────────────────────

def _scrape_cert(imdb_id: str) -> str:
    try:
        url  = f"{IMDB_BASE_URL}{imdb_id}/parentalguide"
        soup = BeautifulSoup(
            requests.get(url, headers=HEADERS, timeout=SCRAPE_TIMEOUT).text, "lxml"
        )
        section = soup.find("section", {"id": "certificates"})
        if not section:
            return ""
        for li in section.find_all("li"):
            text = li.get_text(" ", strip=True)
            if "United States" in text:
                parts = text.split(":")
                if len(parts) > 1:
                    return parts[-1].strip().split()[0]
        first = section.find("a")
        if first:
            return first.get_text(strip=True).split(":")[-1].strip()
    except Exception:
        pass
    return ""


# ── Streaming platforms (Selenium — JS rendered) ───────────────────────────

def _scrape_streaming(imdb_id: str) -> list[str]:
    driver = None
    names  = []
    try:
        driver = _build_driver()
        driver.get(f"{IMDB_BASE_URL}{imdb_id}/")
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "main"))
            )
        except Exception:
            time.sleep(5)

        soup = BeautifulSoup(driver.page_source, "lxml")

        for testid in [
            "titleMainStreamingBuyProviders",
            "titleMainFreeProviders",
            "titleMainAllProviders",
        ]:
            section = soup.find("div", {"data-testid": testid})
            if section:
                for img in section.find_all("img"):
                    alt = img.get("alt", "").strip()
                    if alt and alt not in names:
                        names.append(alt)
                if names:
                    break

        if not names:
            for a in soup.find_all("a", class_=re.compile(r"ipc-lockup")):
                img = a.find("img")
                if img:
                    alt = img.get("alt", "").strip()
                    if alt and alt not in names:
                        names.append(alt)

    except Exception as e:
        print(f"  ⚠️  Streaming scrape error for {imdb_id}: {e}")
    finally:
        if driver:
            driver.quit()

    return names[:3]


# ── Public entry point ─────────────────────────────────────────────────────

def scrape(imdb_id: str) -> dict:
    imdb_id = imdb_id.strip()
    if not re.match(r"^tt\d+$", imdb_id):
        raise ValueError(f"Invalid IMDB ID: {imdb_id}")

    print(f"  → Scraping main page …")
    data = _scrape_main(imdb_id)

    print(f"  → Scraping certification …")
    data["CERTIFICATION"] = _scrape_cert(imdb_id)

    print(f"  → Scraping streaming platforms …")
    streaming = _scrape_streaming(imdb_id)
    data["LOGO_NAME1"] = streaming[0] if len(streaming) > 0 else ""
    data["LOGO_NAME2"] = streaming[1] if len(streaming) > 1 else ""
    data["LOGO_NAME3"] = streaming[2] if len(streaming) > 2 else ""

    data["STREAMING_LOGO1"] = ""
    data["STREAMING_LOGO2"] = ""
    data["STREAMING_LOGO3"] = ""

    data.setdefault("VR_RATING",  "")
    data.setdefault("SUB_GENRE",  "")
    data.setdefault("DATE_RATED", "")

    return data
