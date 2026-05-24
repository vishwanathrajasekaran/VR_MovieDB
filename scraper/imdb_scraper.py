"""
imdb_scraper.py  —  Scrapes a single IMDB title by ID.
Uses Selenium (Chrome) for ALL page fetching.
Injects IMDB cookies for certified/region-aware data.
"""
import json
import os
import re
import time
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
}

# ── Streaming XPaths ───────────────────────────────────────────────────────

LOGO_XPATH = (
    '//div[@data-testid="tm-box-woc-text" and '
    '(text()="STREAMING" or text()="PREFERRED" or text()="RENT/BUY")]'
    '/parent::div//img'
)
ROW_ICON_XPATH = '//div[@data-testid="tm-box-update-row"]//img'

# ── Streaming platform mapping — URL UUID fragment → Name ──────────────────

STREAMING_PLATFORMS = {
    "57468654-5122-4714-aa5b-b078ac2899e7": "Aha",
    "9306872f-f453-4ecb-87f5-8dfd5876d58b": "Apple TV+",
    "c73cd5d4-affa-4d2a-aea1-995da4a78798": "ErosNow",
    "1ab96b2d-c7d9-4f10-b3b0-5762151c59d3": "Jio Hotstar",
    "a9b565b6-c699-4724-b75d-949043824a84": "Mubi",
    "3e4fb1b4-b3de-45a4-9faf-d48aa606264f": "MX Player",
    "9516b142-0c88-4475-a39b-97c06546cdc5": "Netflix",
    "75f35a85-7a6e-4f1f-bf8b-e4c8556bc4e4": "Prime Video",
    "566c1905-5f54-4a1a-9a84-b4dec2818d06": "SonyLIV",
    "e3844785-e8eb-4d56-817b-ef5f3cdf88b2": "Sun NXT",
    "09fccdd8-b0c4-485b-ac50-a1a8398fa830": "Zee 5",
    "844404b0-6591-4870-95a2-0865f3dde638": "BBC iPlayer",
    "d2520a58-e4ee-4adb-94e7-374c372499e7": "Fawesome",
    "0437c3fd-c8fb-4722-980b-a1faeb5583a4": "Plex Movies",
    "youtube":                               "YouTube",
}


def _match_platform_name(url: str) -> str:
    """Match a logo URL to a platform name using UUID fragment."""
    for fragment, name in STREAMING_PLATFORMS.items():
        if fragment in url:
            return name
    return ""


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
    options.binary_location = "/usr/bin/google-chrome"
    service = Service("/usr/bin/chromedriver")
    return webdriver.Chrome(service=service, options=options)


def _inject_cookies(driver: webdriver.Chrome) -> None:
    """Load IMDB cookies from GitHub Secret into the browser session."""
    raw = os.environ.get("IMDB_COOKIES", "").strip()
    if not raw:
        print("  ⚠️  No IMDB_COOKIES secret found — scraping without login")
        return
    try:
        cookies = json.loads(raw)
        driver.get("https://www.imdb.com")
        time.sleep(2)
        for cookie in cookies:
            c = {
                "name":   cookie["name"],
                "value":  cookie["value"],
                "domain": cookie.get("domain", ".imdb.com"),
                "path":   cookie.get("path", "/"),
                "secure": cookie.get("secure", False),
            }
            if "expirationDate" in cookie:
                c["expiry"] = int(cookie["expirationDate"])
            try:
                driver.add_cookie(c)
            except Exception:
                pass
        print(f"  → Injected {len(cookies)} cookies")
    except Exception as e:
        print(f"  ⚠️  Cookie injection failed: {e}")


def _get_soup(driver: webdriver.Chrome, url: str) -> BeautifulSoup:
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


# ── Certification ──────────────────────────────────────────────────────────

def _scrape_cert(soup: BeautifulSoup) -> str:
    """
    Extract certification from already-loaded main page.
    Logged-in Indian account → gets Indian cert (UA, UA13+, UA16+, A)
    No login / US context → gets US cert (PG-13, R, G etc.)
    """
    try:
        # Method 1 — parentalguide link text (most reliable)
        el = soup.find("a", {"href": re.compile(r"parentalguide")})
        if el:
            cert = el.get_text(strip=True)
            if cert and cert not in ("See all certifications",):
                return cert

        # Method 2 — contentRating from JSON-LD
        jld  = _extract_json_ld(soup)
        cert = jld.get("contentRating", "")
        if cert:
            return cert

        # Method 3 — certification badge near runtime
        for li in soup.find_all("li", {"class": re.compile(r"ipc-inline-list")}):
            text = li.get_text(strip=True)
            if re.match(
                r"^(G|PG|PG-13|R|NC-17|U|UA|UA12\+|UA13\+|UA16\+|A|TV-Y|TV-G|TV-PG|TV-14|TV-MA)$",
                text
            ):
                return text

    except Exception as e:
        print(f"  ⚠️  Cert extraction error: {e}")
    return ""


# ── Main page scrape ───────────────────────────────────────────────────────

def _scrape_main(driver: webdriver.Chrome, imdb_id: str) -> dict:
    url  = f"{IMDB_BASE_URL}{imdb_id}/"
    soup = _get_soup(driver, url)
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

    date_pub          = jld.get("datePublished", "")
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

    d["CERTIFICATION"] = _scrape_cert(soup)
    print(f"  → Certification: {d['CERTIFICATION']}")

    d["CONST"] = imdb_id
    return d


# ── Streaming platforms ────────────────────────────────────────────────────

def _scrape_streaming(driver: webdriver.Chrome, imdb_id: str) -> list[dict]:
    """
    Returns list of dicts: [{"url": "...", "name": "..."}, ...]
    Max 3 platforms.
    """
    results = []
    try:
        driver.get(f"{IMDB_BASE_URL}{imdb_id}/")

        # Wait for streaming section to appear
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.XPATH, LOGO_XPATH))
            )
        except Exception:
            pass  # Section may not exist for this title

        logos = driver.find_elements(By.XPATH, LOGO_XPATH)
        row   = driver.find_elements(By.XPATH, ROW_ICON_XPATH)

        seen_urls = []
        for img in logos + row:
            src = img.get_attribute("src")
            if src and src not in seen_urls:
                seen_urls.append(src)
                name = _match_platform_name(src)
                results.append({"url": src, "name": name})
            if len(results) >= 3:
                break

        print(f"  → Streaming found: {[r['name'] or 'Unknown' for r in results]}")

    except Exception as e:
        print(f"  ⚠️  Streaming scrape error: {e}")

    return results[:3]


# ── Public entry point ─────────────────────────────────────────────────────

def scrape(imdb_id: str) -> dict:
    imdb_id = imdb_id.strip()
    if not re.match(r"^tt\d+$", imdb_id):
        raise ValueError(f"Invalid IMDB ID: {imdb_id}")

    driver = None
    try:
        driver = _build_driver()

        # Inject cookies FIRST — before loading any IMDB page
        _inject_cookies(driver)

        # Scrape main page
        print(f"  → Scraping main page …")
        data = _scrape_main(driver, imdb_id)
        print(f"  → Title: {data.get('TITLE', 'EMPTY')}")

        # Streaming — separate page load with XPath wait
        print(f"  → Scraping streaming platforms …")
        streaming = _scrape_streaming(driver, imdb_id)

        data["STREAMING_LOGO1"] = streaming[0]["url"]  if len(streaming) > 0 else ""
        data["STREAMING_LOGO2"] = streaming[1]["url"]  if len(streaming) > 1 else ""
        data["STREAMING_LOGO3"] = streaming[2]["url"]  if len(streaming) > 2 else ""
        data["LOGO_NAME1"]      = streaming[0]["name"] if len(streaming) > 0 else ""
        data["LOGO_NAME2"]      = streaming[1]["name"] if len(streaming) > 1 else ""
        data["LOGO_NAME3"]      = streaming[2]["name"] if len(streaming) > 2 else ""

        data.setdefault("VR_RATING",  "")
        data.setdefault("SUB_GENRE",  "")
        data.setdefault("DATE_RATED", "")

    finally:
        if driver:
            driver.quit()

    return data
