/**
 * google-sheets-loader.js
 * Loads VR MovieDB data from Google Sheets API
 */

const SHEETS_CONFIG = {
  API_KEY: 'AIzaSyDJWVKQHTfNHPHTsJRZGOHJ3LSq4uGzRTw'
  SHEET_ID: '1-U-WVdUzW_Jw44alwYN-917WlHXmirx3bGJPIljKoSI'
  //API_KEY:    'AIzaSyDJWVKQHTfNHPHTsJRZGOHJ3LSq4uGzRTw',
  //SHEET_ID:   '1-U-WVdUzW_Jw44alwYN-917WlHXmirx3bGJPIljKoSI',
  SHEET_NAME: 'MasterSheet',
};

const SHEETS_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.SHEET_NAME}?key=${SHEETS_CONFIG.API_KEY}`;

const COL = {
  TITLE: 0, ORIGINAL_TITLE: 1, TITLE_TYPE: 2, YEAR: 3, RELEASE_DATE: 4,
  CERTIFICATION: 5, LANGUAGES: 6, GENRES: 7, SUB_GENRE: 8, RUNTIME: 9,
  PLOT: 10, IMDB_RATING: 11, VR_RATING: 12, TOTAL_VOTES: 13,
  CAST: 14, DIRECTORS: 15, WRITERS: 16,
  STREAMING_LOGO1: 17, STREAMING_LOGO2: 18, STREAMING_LOGO3: 19,
  LOGO_NAME1: 20, LOGO_NAME2: 21, LOGO_NAME3: 22,
  POSTER: 23, URL: 24, DATE_RATED: 25, CONST: 26,
  DECADE: 27, RATING_DIFF: 28, VOTE_CATEGORY: 29,
  EPISODES: 30,
};

function rowToMovie(row) {
  return {
    title:          row[COL.TITLE]          || '',
    originalTitle:  row[COL.ORIGINAL_TITLE] || '',
    type:           row[COL.TITLE_TYPE]     || '',
    year:           row[COL.YEAR]           || '',
    releaseDate:    row[COL.RELEASE_DATE]   || '',
    certification:  row[COL.CERTIFICATION] || '',
    languages:      row[COL.LANGUAGES]      || '',
    genres:         row[COL.GENRES]         || '',
    subGenre:       row[COL.SUB_GENRE]      || '',
    runtime:        row[COL.RUNTIME]        || '',
    plot:           row[COL.PLOT]           || '',
    imdbRating:     row[COL.IMDB_RATING]    || '',
    vrRating:       row[COL.VR_RATING]      || '',
    totalVotes:     row[COL.TOTAL_VOTES]    || '',
    cast:           row[COL.CAST]           || '',
    directors:      row[COL.DIRECTORS]      || '',
    writers:        row[COL.WRITERS]        || '',
    streamingLogo1: row[COL.STREAMING_LOGO1]|| '',
    streamingLogo2: row[COL.STREAMING_LOGO2]|| '',
    streamingLogo3: row[COL.STREAMING_LOGO3]|| '',
    streaming1:     row[COL.LOGO_NAME1]     || '',
    streaming2:     row[COL.LOGO_NAME2]     || '',
    streaming3:     row[COL.LOGO_NAME3]     || '',
    poster:         row[COL.POSTER]         || '',
    url:            row[COL.URL]            || '',
    dateRated:      row[COL.DATE_RATED]     || '',
    const:          row[COL.CONST]          || '',   // IMDb ttXXXXXX — unique ID
    decade:         row[COL.DECADE]         || '',
    ratingDiff:     row[COL.RATING_DIFF]    || '',
    voteCategory:   row[COL.VOTE_CATEGORY]  || '',
    episodes:       row[COL.EPISODES]       || '',   // NEW: episode count for series
  };
}

function showLoadingState() {
  const hs = document.getElementById('headerStats');
  if (hs) hs.textContent = 'Loading from Google Sheets...';
  const gallery = document.getElementById('gallery');
  if (gallery) gallery.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading your entertainment database…</p></div>';
}

function showErrorState(message) {
  const hs = document.getElementById('headerStats');
  if (hs) hs.textContent = '⚠️ Failed to load data';
  const gallery = document.getElementById('gallery');
  if (gallery) gallery.innerHTML = `
    <div class="empty">
      <div class="empty-icon">⚠️</div>
      <div style="font-size:0.9rem;max-width:400px;margin:0 auto;line-height:1.6;">
        <strong>Could not load from Google Sheets</strong><br><br>${message}<br><br>
        <strong>Fix:</strong> Sheet → Share → Anyone with the link → Viewer
      </div>
    </div>`;
}

async function loadFromGoogleSheets() {
  showLoadingState();
  try {
    const resp = await fetch(SHEETS_URL);
    if (resp.status === 403) { showErrorState('Sheet is set to "Restricted". Make it publicly viewable.'); return; }
    if (!resp.ok) { showErrorState(`API error ${resp.status}: ${resp.statusText}`); return; }

    const data = await resp.json();
    if (!data.values || data.values.length < 2) { showErrorState('Sheet returned no data. Check sheet name is "MasterSheet".'); return; }

    window.MOVIES_DATA = data.values.slice(1).filter(row => row[COL.TITLE]).map(rowToMovie);
    console.log(`✅ Loaded ${window.MOVIES_DATA.length} titles`);

    initFilters();
    applyFilters();
  } catch (err) {
    showErrorState(`Network error: ${err.message}`);
  }
}

document.addEventListener('DOMContentLoaded', loadFromGoogleSheets);
