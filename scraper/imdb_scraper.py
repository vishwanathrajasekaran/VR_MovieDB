"""
imdb_scraper.py  —  Scrapes a single IMDB title by ID.
Uses Selenium (Chrome) for ALL page fetching — bypasses IMDB bot blocks.
requests is blocked by IMDB on GitHub Actions; Chrome is not.
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
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    # Use system Chrome — already installed on ubuntu-latest
    options.binary_location = "/usr/bin/google-chrome"
    # Use system chromedriver — avoid webdriver-manager bug
    service = Service("/usr/bin/chromedriver")
    return webdriver.Chrome(service=service, options=options)


def _get_soup_selenium(driver: webdriver.Chrome, url: str) -> BeautifulSoup:
    driver.get(url)
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "main"))
        )
    except Exception:
        time.sleep(5)
    return BeautifulSoup(driver.page_source, "lxml")


# ── JSON-LD extractor ──────────────────────────────────────────────────────

def _extract_json_ld(soup: BeautifulSoup) -> dict:
    tag = soup.find("script", {"type": "application/ld+json"})
    if tag:
        try:
            return json.loads(tag.string)
        except Exception:
            pass
    return {}


# ── Main scrape ────────────────────────────────────────────────────────────

def _scrape_main(driver: webdriver.Chrome, imdb_id: str) -> dict:
    url  = f"{IMDB_BASE_URL}{imdb_id}/"
    soup = _get_soup_selenium(driver, url)
    jld  = _extract_json_ld(soup)

    print(f"  → JSON-LD keys: {list(jld.keys())}")

    d = {}
    d["TITLE"]          = jld.get("name", "")
    d["ORIGINAL_TITLE"] = jld.get("alternateName", d["TITLE"])

    type_map = {
        "Movie": "Movie", "TVSeries": "TV Series",
        "TVMiniSeries": "TV Mini Series", "TVMovie": "TV Movie",
        "TVEpisode": "TV Episode", "Short": "Short",
        "VideoGame": "Video Game", "Video": "Video",
    }
    d["TITLE_TYPE"] = type_map.get(jld.get("@type", "Movie"), jld.get("@type", "Movie"))

    date_pub        = jld.get("datePublished", "")
    d["RELEASE_DATE"] = date_pub
    d["YEAR"]         = date_pub[:4] if date_pub else ""

    genres = jld.get("genre", [])
    if isinstance(genres, str):
        genres = [genres]
    d["GENRES"] = ", ".join(genres)

    duration = jld.get("duration", "")
    if duration:
        m = re.search(r"PT(?:(\d+)H)?(?:(\d+)M)?", duration)
        if m:
            h  = int(m.group(1) or 0)
            mn = int(m.group(2) or 0)
            d["RUNTIME"] = str(h * 60 + mn)
        else:
            d["RUNTIME"] = ""
    else:
        d["RUNTIME"] = ""

    d["PLOT"] = jld.get("description", "")

    agg = jld.get("aggregateRating", {})
    d["IMDB_RATING"] = str(agg.get("ratingValue", ""))
    d["TOTAL_VOTES"] = str(agg.get("ratingCount", ""))

    directors = jld.get("director", [])
    if isinstance(directors, dict):
        directors = [directors]
    d["DIRECTORS"] = ", ".join(x.get("name", "") for x in directors)

    creators = jld.get("creator", [])
    if isinstance(creators, dict):
        creators = [creators]
    d["WRITERS"] = ", ".join(
        x.get("name", "") for x in creators if x.get("@type") == "Person"
    )

    actors = jld.get("actor", [])
    if isinstance(actors, dict):
        actors = [actors]
    d["CAST"] = ", ".join(x.get("name", "") for x in actors[:5])

    d["POSTER"] = jld.get("image", "")

    try:
        lang_li = soup.find("li", {"data-testid": "title-details-languages"})
        d["LANGUAGES"] = ", ".join(
            a.get_text(strip=True) for a in lang_li.find_all("a")
        ) if lang_li else ""
    except Exception:
        d["LANGUAGES"] = ""

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


# ── Certification ──────────────────────────────────────────────────────────

def _scrape_cert(driver: webdriver.Chrome, imdb_id: str) -> str:
    try:
        url  = f"{IMDB_BASE_URL}{imdb_id}/parentalguide"
        driver.get(url)
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "main"))
            )
        except Exception:
            time.sleep(3)
        soup = BeautifulSoup(driver.page_source, "lxml")

        # Try new IMDB layout first
        for li in soup.find_all("li", {"data-testid": re.compile(r"cert")}):
            text = li.get_text(" ", strip=True)
            if "United States" in text or "US" in text:
                cert = re.search(r":\s*(\S+)", text)
                if cert:
                    return cert.group(1)

        # Fallback — old layout
        section = soup.find("section", {"id": "certificates"})
        if section:
            for li in section.find_all("li"):
                text = li.get_text(" ", strip=True)
                if "United States" in text:
                    parts = text.split(":")
                    if len(parts) > 1:
                        return parts[-1].strip().split()[0]
            first = section.find("a")
            if first:
                return first.get_text(strip=True).split(":")[-1].strip()

        # Last resort — look for rating badge
        badge = soup.find("span", {"class": re.compile(r"certificate")})
        if badge:
            return badge.get_text(strip=True)

    except Exception as e:
        print(f"  ⚠️  Cert scrape error: {e}")
    return ""

# ── Streaming platforms ────────────────────────────────────────────────────

def _scrape_streaming(driver: webdriver.Chrome, imdb_id: str) -> list[str]:
    names = []
    try:
        # Go back to main page
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

        print(f"  → Streaming found: {names}")

    except Exception as e:
        print(f"  ⚠️  Streaming scrape error: {e}")

    return names[:3]


# ── Public entry point ─────────────────────────────────────────────────────

def scrape(imdb_id: str) -> dict:
    imdb_id = imdb_id.strip()
    if not re.match(r"^tt\d+$", imdb_id):
        raise ValueError(f"Invalid IMDB ID: {imdb_id}")

    driver = None
    try:
        driver = _build_driver()

        print(f"  → Scraping main page …")
        data = _scrape_main(driver, imdb_id)
        print(f"  → Title found: {data.get('TITLE', 'EMPTY')}")

        print(f"  → Scraping certification …")
        data["CERTIFICATION"] = _scrape_cert(driver, imdb_id)

        print(f"  → Scraping streaming platforms …")
        # Reuse the already-loaded main page for streaming
        data["LOGO_NAME1"] = ""
        data["LOGO_NAME2"] = ""
        data["LOGO_NAME3"] = ""
        streaming = _scrape_streaming(driver, imdb_id)
        data["LOGO_NAME1"] = streaming[0] if len(streaming) > 0 else ""
        data["LOGO_NAME2"] = streaming[1] if len(streaming) > 1 else ""
        data["LOGO_NAME3"] = streaming[2] if len(streaming) > 2 else ""

        data["STREAMING_LOGO1"] = ""
        data["STREAMING_LOGO2"] = ""
        data["STREAMING_LOGO3"] = ""

        data.setdefault("VR_RATING",  "")
        data.setdefault("SUB_GENRE",  "")
        data.setdefault("DATE_RATED", "")

    finally:
        if driver:
            driver.quit()

    return data
