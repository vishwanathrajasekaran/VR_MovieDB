"""
imdb_scraper.py  —  Scrapes a single IMDB title by ID.
Uses Selenium (Chrome) for ALL page fetching.
Injects IMDB cookies for certified/region-aware data.
Streaming: stores logo URLs only — names resolved via sheet lookup formula.
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

def _scrape_streaming(driver: webdriver.Chrome, imdb_id: str) -> list[str]:
    """
    Returns list of all streaming logo URLs found on the page.
    Uses original XPath approach — logos + row icons combined.
    """
    srcs = []
    try:
        driver.get(f"{IMDB_BASE_URL}{imdb_id}/")

        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.XPATH, LOGO_XPATH))
            )
        except Exception:
            pass

        logos = driver.find_elements(By.XPATH, LOGO_XPATH)
        row   = driver.find_elements(By.XPATH, ROW_ICON_XPATH)

        for img in logos + row:
            src = img.get_attribute("src")
            if src and src not in srcs:
                srcs.append(src)

        print(f"  → Streaming URLs found: {len(srcs)}")
        for s in srcs:
            print(f"     {s}")

    except Exception as e:
        print(f"  ⚠️  Streaming scrape error: {e}")

    return srcs


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

        # Streaming — store URLs only, names handled by sheet lookup
        print(f"  → Scraping streaming platforms …")
        streaming = _scrape_streaming(driver, imdb_id)

        data["STREAMING_LOGO1"] = streaming[0] if len(streaming) > 0 else ""
        data["STREAMING_LOGO2"] = streaming[1] if len(streaming) > 1 else ""
        data["STREAMING_LOGO3"] = streaming[2] if len(streaming) > 2 else ""

        # Names left empty — resolved by sheet VLOOKUP formula
        data["LOGO_NAME1"] = ""
        data["LOGO_NAME2"] = ""
        data["LOGO_NAME3"] = ""

        data.setdefault("VR_RATING",  "")
        data.setdefault("SUB_GENRE",  "")
        data.setdefault("DATE_RATED", "")

    finally:
        if driver:
            driver.quit()

    return data
