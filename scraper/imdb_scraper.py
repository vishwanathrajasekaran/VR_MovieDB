"""
imdb_scraper.py  —  Scrapes a single IMDB title by ID.
Returns a dict with keys matching COL in config.py.
Uses requests+BeautifulSoup for main page data (fast, stable).
Uses Selenium only for streaming platform names (JS-rendered).
"""
import json
import re
import time
import requests
from bs4 import BeautifulSoup
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
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
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
    # Use system Chrome on GitHub Actions runner
    options.binary_location = "/usr/bin/google-chrome"
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)


# ── Main page scrape (requests + BS4) ─────────────────────────────────────

def _get_soup(imdb_id: str) -> BeautifulSoup:
    url = f"{IMDB_BASE_URL}{imdb_id}/"
    session = requests.Session()
    session.headers.update(HEADERS)
    # Prime session with a homepage visit first
    try:
        session.get("https://www.imdb.com/", timeout=SCRAPE_TIMEOUT)
    except Exception:
        pass
    resp = session.get(url, timeout=SCRAPE_TIMEOUT)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "lxml")


def _extract_json_ld(soup: BeautifulSoup) -> dict:
    tag = soup.find("script", {"type": "application/ld+json"})
    if tag:
        try:
            return json.loads(tag.string)
        except Exception:
            pass
    return {}


def _scrape_main(imdb_id: str) -> dict:
    soup = _get_soup(imdb_id)
    jld  = _extract_json_ld(soup)
    print(f"  → JSON-LD keys found: {list(jld.keys())}")
    print(f"  → Page title tag: {soup.title.string if soup.title else 'NO TITLE TAG'}")
    d    = {}

    # Title
    d["TITLE"]          = jld.get("name", "")
    d["ORIGINAL_TITLE"] = jld.get("alternateName", d["TITLE"])

    # Type
    type_map = {
        "Movie": "Movie", "TVSeries": "TV Series",
        "TVMiniSeries": "TV Mini Series", "TVMovie": "TV Movie",
        "TVEpisode": "TV Episode", "Short": "Short",
        "VideoGame": "Video Game", "Video": "Video",
    }
    d["TITLE_TYPE"] = type_map.get(jld.get("@type", "Movie"), jld.get("@type", "Movie"))

    # Year & Release Date
    date_pub        = jld.get("datePublished", "")
    d["RELEASE_DATE"] = date_pub
    d["YEAR"]         = date_pub[:4] if date_pub else ""

    # Genres
    genres = jld.get("genre", [])
    if isinstance(genres, str):
        genres = [genres]
    d["GENRES"] = ", ".join(genres)

    # Runtime → minutes
    duration = jld.get("duration", "")
    if duration:
        m = re.search(r"PT(?:(\d+)H)?(?:(\d+)M)?", duration)
        if m:
            h = int(m.group(1) or 0)
            mn = int(m.group(2) or 0)
            d["RUNTIME"] = str(h * 60 + mn)
        else:
            d["RUNTIME"] = ""
    else:
        d["RUNTIME"] = ""

    # Plot
    d["PLOT"] = jld.get("description", "")

    # Ratings
    agg = jld.get("aggregateRating", {})
    d["IMDB_RATING"] = str(agg.get("ratingValue", ""))
    d["TOTAL_VOTES"] = str(agg.get("ratingCount", ""))

    # Directors
    directors = jld.get("director", [])
    if isinstance(directors, dict):
        directors = [directors]
    d["DIRECTORS"] = ", ".join(x.get("name", "") for x in directors)

    # Writers
    creators = jld.get("creator", [])
    if isinstance(creators, dict):
        creators = [creators]
    d["WRITERS"] = ", ".join(
        x.get("name", "") for x in creators if x.get("@type") == "Person"
    )

    # Cast (top 5)
    actors = jld.get("actor", [])
    if isinstance(actors, dict):
        actors = [actors]
    d["CAST"] = ", ".join(x.get("name", "") for x in actors[:5])

    # Poster
    d["POSTER"] = jld.get("image", "")

    # Languages
    try:
        lang_li = soup.find("li", {"data-testid": "title-details-languages"})
        if lang_li:
            d["LANGUAGES"] = ", ".join(a.get_text(strip=True) for a in lang_li.find_all("a"))
        else:
            d["LANGUAGES"] = ""
    except Exception:
        d["LANGUAGES"] = ""

    # Episodes (TV only)
    d["EPISODES"] = ""
    if d["TITLE_TYPE"] not in ("Movie", "TV Movie", "Short", "Video"):
        try:
            ep_el = soup.find("span", {"data-testid": "episodes-header"})
            if not ep_el:
                ep_el = soup.find("a", href=re.compile(r"/episodes"))
            if ep_el:
                nums = re.findall(r"\d+", ep_el.get_text())
                if nums:
                    d["EPISODES"] = nums[-1]
        except Exception:
            pass

    d["CONST"] = imdb_id
    return d


# ── Certification (parental guide page) ────────────────────────────────────

def _scrape_cert(imdb_id: str) -> str:
    try:
        url  = f"{IMDB_BASE_URL}{imdb_id}/parentalguide"
        soup = BeautifulSoup(
            requests.get(url, headers=HEADERS, timeout=SCRAPE_TIMEOUT).text, "lxml"
        )
        # Prefer US cert
        section = soup.find("section", {"id": "certificates"})
        if not section:
            return ""
        for li in section.find_all("li"):
            text = li.get_text(" ", strip=True)
            if "United States" in text:
                parts = text.split(":")
                if len(parts) > 1:
                    return parts[-1].strip().split()[0]
        # Fallback — first cert
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

        # Primary: JustWatch / streaming providers section
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

        # Fallback: any lockup image with alt text in the page
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
    """
    Scrape a single IMDB title. Returns dict with COL keys.
    Raises ValueError for invalid ID, Exception for scrape failures.
    """
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

    # Streaming logo URLs — left empty; your Apps Script / platforms sheet handles these
    data["STREAMING_LOGO1"] = ""
    data["STREAMING_LOGO2"] = ""
    data["STREAMING_LOGO3"] = ""

    # Fields filled manually by you — leave blank, sheet.py won't overwrite them
    data.setdefault("VR_RATING",  "")
    data.setdefault("SUB_GENRE",  "")
    data.setdefault("DATE_RATED", "")

    return data
