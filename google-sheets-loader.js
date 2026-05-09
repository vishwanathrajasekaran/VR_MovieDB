/**
 * google-sheets-loader.js
 * Loads MasterSheet data + Platforms from Google Sheets / Apps Script
 */

const SHEETS_CONFIG = {
  API_KEY:    'AIzaSyDJWVKQHTfNHPHTsJRZGOHJ3LSq4uGzRTw',
  SHEET_ID:   '1-U-WVdUzW_Jw44alwYN-917WlHXmirx3bGJPIljKoSI',
  SHEET_NAME: 'MasterSheet',
};

const APPS_SCRIPT_BASE = 'https://script.google.com/macros/s/AKfycbwoje62vCYjzEjls-k8IYEL9Xrt2--MN_3-gimrEfxHg7nkt86DXqD0fb6vosK9rZpZTA/exec';
const SHEETS_URL    = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.SHEET_NAME}?key=${SHEETS_CONFIG.API_KEY}`;
const PLATFORMS_URL = `${APPS_SCRIPT_BASE}?action=platforms`;

const COL = {
  TITLE: 0, ORIGINAL_TITLE: 1, TITLE_TYPE: 2, YEAR: 3, RELEASE_DATE: 4,
  CERTIFICATION: 5, LANGUAGES: 6, GENRES: 7, SUB_GENRE: 8, RUNTIME: 9,
  PLOT: 10, IMDB_RATING: 11, VR_RATING: 12, TOTAL_VOTES: 13,
  CAST: 14, DIRECTORS: 15, WRITERS: 16,
  STREAMING_LOGO1: 17, STREAMING_LOGO2: 18, STREAMING_LOGO3: 19,
  LOGO_NAME1: 20, LOGO_NAME2: 21, LOGO_NAME3: 22,
  POSTER: 23, URL: 24, DATE_RATED: 25, CONST: 26,
  DECADE: 27, RATING_DIFF: 28, VOTE_CATEGORY: 29, EPISODES: 30,
};

function rowToMovie(row) {
  return {
    title: row[COL.TITLE] || '', originalTitle: row[COL.ORIGINAL_TITLE] || '',
    type: row[COL.TITLE_TYPE] || '', year: row[COL.YEAR] || '',
    releaseDate: row[COL.RELEASE_DATE] || '', certification: row[COL.CERTIFICATION] || '',
    languages: row[COL.LANGUAGES] || '', genres: row[COL.GENRES] || '',
    subGenre: row[COL.SUB_GENRE] || '', runtime: row[COL.RUNTIME] || '',
    plot: row[COL.PLOT] || '', imdbRating: row[COL.IMDB_RATING] || '',
    vrRating: row[COL.VR_RATING] || '', totalVotes: row[COL.TOTAL_VOTES] || '',
    cast: row[COL.CAST] || '', directors: row[COL.DIRECTORS] || '',
    writers: row[COL.WRITERS] || '',
    streamingLogo1: row[COL.STREAMING_LOGO1] || '',
    streamingLogo2: row[COL.STREAMING_LOGO2] || '',
    streamingLogo3: row[COL.STREAMING_LOGO3] || '',
    streaming1: row[COL.LOGO_NAME1] || '',
    streaming2: row[COL.LOGO_NAME2] || '',
    streaming3: row[COL.LOGO_NAME3] || '',
    poster: row[COL.POSTER] || '', url: row[COL.URL] || '',
    dateRated: row[COL.DATE_RATED] || '', const: row[COL.CONST] || '',
    decade: row[COL.DECADE] || '', ratingDiff: row[COL.RATING_DIFF] || '',
    voteCategory: row[COL.VOTE_CATEGORY] || '', episodes: row[COL.EPISODES] || '',
  };
}

function showLoadingState() {
  const hs = document.getElementById('headerStats');
  if (hs) hs.textContent = 'Loading...';
  const gallery = document.getElementById('gallery');
  if (gallery) gallery.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading your entertainment database…</p></div>';
}

function showErrorState(msg) {
  const hs = document.getElementById('headerStats');
  if (hs) hs.textContent = '⚠️ Failed to load';
  const gallery = document.getElementById('gallery');
  if (gallery) gallery.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div>
    <div style="font-size:.9rem;max-width:400px;margin:0 auto;line-height:1.6">
      <strong>Could not load data</strong><br><br>${msg}</div></div>`;
}

async function loadFromGoogleSheets() {
  showLoadingState();
  try {
    // Load movies + platforms in parallel
    const [moviesResp, platformsResp] = await Promise.all([
      fetch(SHEETS_URL),
      fetch(PLATFORMS_URL).catch(() => null),
    ]);

    if (moviesResp.status === 403) { showErrorState('Sheet is restricted. Set sharing to "Anyone with link".'); return; }
    if (!moviesResp.ok) { showErrorState(`API error ${moviesResp.status}`); return; }

    const moviesData = await moviesResp.json();
    if (!moviesData.values || moviesData.values.length < 2) { showErrorState('No data in MasterSheet.'); return; }

    window.MOVIES_DATA = moviesData.values.slice(1).filter(r => r[COL.TITLE]).map(rowToMovie);

    // Load platforms — app.js will use window.PLATFORMS_DATA
    if (platformsResp && platformsResp.ok) {
      try {
        const pData = await platformsResp.json();
        if (pData.success && pData.platforms) {
          window.PLATFORMS_DATA = pData.platforms;
          console.log(`✅ Loaded ${pData.platforms.length} platforms from sheet`);
        }
      } catch(e) { /* non-fatal */ }
    }
    if (!window.PLATFORMS_DATA) window.PLATFORMS_DATA = [];

    console.log(`✅ Loaded ${window.MOVIES_DATA.length} titles`);
    initFilters();
    applyFilters();

  } catch (err) {
    showErrorState(`Network error: ${err.message}`);
  }
}

document.addEventListener('DOMContentLoaded', loadFromGoogleSheets);
