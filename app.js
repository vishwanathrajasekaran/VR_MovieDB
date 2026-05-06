// ===== STATE =====
let filtered = [];
let currentView = 'grid';
const PAGE_SIZE = 60;
let page = 0;
let isLoading = false;

// ===== THEME =====
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
let isDark = true;

// Load saved preference
const savedTheme = localStorage.getItem('vr-theme');
if (savedTheme) {
  isDark = savedTheme === 'dark';
  html.setAttribute('data-theme', savedTheme);
  themeToggle.textContent = isDark ? '🌙' : '☀️';
}

themeToggle.addEventListener('click', () => {
  isDark = !isDark;
  const theme = isDark ? 'dark' : 'light';
  html.setAttribute('data-theme', theme);
  localStorage.setItem('vr-theme', theme);
  themeToggle.textContent = isDark ? '🌙' : '☀️';
  // Re-render charts if panel is open
  if (document.getElementById('statsOverlay').style.display !== 'none') {
    renderStats();
  }
});

// ===== STREAMING PLATFORM CONFIG =====
// Brand colors per platform
const PLATFORM_COLORS = {
  'Netflix':     '#E50914',
  'Prime Video': '#00A8E1',
  'Jio Hotstar': '#1F80E0',
  'Apple TV+':   '#888888',
  'SonyLIV':     '#003087',
  'Zee 5':       '#8B2FC9',
  'Sun NXT':     '#FF6B00',
  'Aha':         '#F5A623',
  'MX Player':   '#FF6600',
  'ErosNow':     '#F01C33',
  'Mubi':        '#FF1F1F',
};

// Tier-2 fallback logos: reliable hosted URLs per platform name
// Used when the sheet row has a platform name but no logo URL filled in
const PLATFORM_FALLBACK_LOGOS = {
  'Netflix':     'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/120px-Netflix_2015_logo.svg.png',
  'Prime Video': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Amazon_Prime_Video_logo.svg/120px-Amazon_Prime_Video_logo.svg.png',
  'Jio Hotstar': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Jio_Hotstar_logo.svg/120px-Jio_Hotstar_logo.svg.png',
  'Apple TV+':   'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Apple_TV_Plus_Logo.svg/120px-Apple_TV_Plus_Logo.svg.png',
  'SonyLIV':     'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/SonyLIV.svg/120px-SonyLIV.svg.png',
  'Zee 5':       'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Zee5_logo.svg/120px-Zee5_logo.svg.png',
  'Sun NXT':     'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Sun_NXT_logo.png/120px-Sun_NXT_logo.png',
  'Aha':         'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Aha_ott_logo.png/120px-Aha_ott_logo.png',
  'MX Player':   'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/MX_Player_Logo.png/120px-MX_Player_Logo.png',
  'Mubi':        'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Mubi_logo_2017.svg/120px-Mubi_logo_2017.svg.png',
};

function platformColor(name) {
  return PLATFORM_COLORS[name] || '#888';
}

/**
 * Resolve logo URL with 3-tier priority:
 *   1. URL from sheet column (streamingLogoN) — most up-to-date
 *   2. Hardcoded fallback for known platforms   — handles missing sheet URLs
 *   3. null → caller renders colored dot        — unknown platforms
 */
function resolveLogoUrl(name, sheetLogoUrl) {
  if (sheetLogoUrl && sheetLogoUrl.trim()) return sheetLogoUrl.trim();
  if (PLATFORM_FALLBACK_LOGOS[name])       return PLATFORM_FALLBACK_LOGOS[name];
  return null;
}

/**
 * Build a streaming badge.
 * @param {string} name        — Platform name (e.g. "Netflix")
 * @param {string} sheetLogoUrl — Raw logo URL from sheet column (may be empty)
 */
function getStreamingBadge(name, sheetLogoUrl = '') {
  if (!name) return '';
  const color   = platformColor(name);
  const logoUrl = resolveLogoUrl(name, sheetLogoUrl);

  const logoHtml = logoUrl
    ? `<img
         src="${logoUrl}"
         alt="${name}"
         class="stream-logo-img"
         onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'stream-dot',style:'background:${color}'}))"
       >`
    : `<span class="stream-dot" style="background:${color}"></span>`;

  return `<span class="badge stream" style="border-color:${color}40;background:${color}18;">
    ${logoHtml}${name}
  </span>`;
}

// ===== DOM =====
const gallery        = document.getElementById('gallery');
const searchInput    = document.getElementById('searchInput');
const typeFilter     = document.getElementById('typeFilter');
const genreFilter    = document.getElementById('genreFilter');
const langFilter     = document.getElementById('langFilter');
const yearFilter     = document.getElementById('yearFilter');
const streamingFilter= document.getElementById('streamingFilter');
const ratingFilter   = document.getElementById('ratingFilter');
const clearBtn       = document.getElementById('clearBtn');
const resultCount    = document.getElementById('resultCount');
const modal          = document.getElementById('modal');
const modalContent   = document.getElementById('modalContent');
const modalClose     = document.getElementById('modalClose');
const gridViewBtn    = document.getElementById('gridViewBtn');
const listViewBtn    = document.getElementById('listViewBtn');
const headerStats    = document.getElementById('headerStats');
const statsBtn       = document.getElementById('statsBtn');
const statsOverlay   = document.getElementById('statsOverlay');
const statsClose     = document.getElementById('statsClose');

// ===== STATS PANEL =====
statsBtn.addEventListener('click', () => {
  statsOverlay.style.display = 'block';
  renderStats();
});
statsClose.addEventListener('click', () => { statsOverlay.style.display = 'none'; });
statsOverlay.addEventListener('click', e => { if (e.target === statsOverlay) statsOverlay.style.display = 'none'; });

// ===== INIT FILTERS =====
function initFilters() {
  const types = [...new Set(MOVIES_DATA.map(r => r.type).filter(Boolean))].sort();
  const genres = [...new Set(MOVIES_DATA.flatMap(r => r.genres.split(',').map(g => g.trim())))].filter(Boolean).sort();
  const langs  = [...new Set(MOVIES_DATA.flatMap(r => r.languages.split(',').map(l => l.trim())))].filter(Boolean).sort();
  const years  = [...new Set(MOVIES_DATA.map(r => r.year).filter(Boolean))].sort((a,b) => b-a);
  const plats  = [...new Set(MOVIES_DATA.flatMap(r => [r.streaming1, r.streaming2, r.streaming3]).filter(Boolean))].sort();

  // Only add options that don't exist yet (safe for re-init)
  types.forEach(t => { if (![...typeFilter.options].some(o=>o.value===t)) typeFilter.add(new Option(t,t)); });
  genres.forEach(g => { if (![...genreFilter.options].some(o=>o.value===g)) genreFilter.add(new Option(g,g)); });
  langs.forEach(l  => { if (![...langFilter.options].some(o=>o.value===l)) langFilter.add(new Option(l,l)); });
  years.forEach(y  => { if (![...yearFilter.options].some(o=>o.value===y)) yearFilter.add(new Option(y,y)); });
  plats.forEach(p  => { if (![...streamingFilter.options].some(o=>o.value===p)) streamingFilter.add(new Option(p,p)); });

  const movies = MOVIES_DATA.filter(r => r.type === 'Movie').length;
  const series = MOVIES_DATA.filter(r => r.type !== 'Movie').length;
  headerStats.textContent = `${MOVIES_DATA.length.toLocaleString()} titles · ${movies} Movies · ${series} Series`;
}

// ===== FILTER LOGIC =====
function applyFilters() {
  const q        = searchInput.value.toLowerCase().trim();
  const type     = typeFilter.value;
  const genre    = genreFilter.value;
  const lang     = langFilter.value;
  const year     = yearFilter.value;
  const stream   = streamingFilter.value;
  const minRating = ratingFilter.value ? parseFloat(ratingFilter.value) : null;

  filtered = MOVIES_DATA.filter(r => {
    if (q && !r.title.toLowerCase().includes(q) &&
        !r.cast.toLowerCase().includes(q) &&
        !r.directors.toLowerCase().includes(q) &&
        !r.originalTitle.toLowerCase().includes(q)) return false;
    if (type   && r.type !== type) return false;
    if (genre  && !r.genres.includes(genre)) return false;
    if (lang   && !r.languages.includes(lang)) return false;
    if (year   && r.year !== year) return false;
    if (stream && r.streaming1 !== stream && r.streaming2 !== stream && r.streaming3 !== stream) return false;
    if (minRating !== null && (parseFloat(r.vrRating) < minRating)) return false;
    return true;
  });

  page = 0;
  gallery.innerHTML = '';
  resultCount.textContent = `${filtered.length.toLocaleString()} titles`;
  renderPage();
}

// ===== RENDER =====
function renderPage() {
  if (filtered.length === 0 && page === 0) {
    gallery.innerHTML = `<div class="empty"><div class="empty-icon">🎬</div><div>No titles found</div></div>`;
    return;
  }
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  slice.forEach(item => gallery.appendChild(createCard(item)));
  page++;
  isLoading = false;
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const isTV = item.type && item.type !== 'Movie';
  const typeBadge = isTV ? `<span class="card-type-badge">${item.type.replace('TV ','')}</span>` : '';
  const epBadge   = (isTV && item.episodes) ? `<span class="card-episodes-badge">${item.episodes} ep</span>` : '';

  card.innerHTML = `
    ${typeBadge}${epBadge}
    ${item.poster
      ? `<img class="card-poster" src="${item.poster}" alt="${escHtml(item.title)}" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-poster-placeholder',textContent:'🎬'}))">`
      : `<div class="card-poster-placeholder">🎬</div>`}
    <div class="card-info">
      <div class="card-title">${escHtml(item.title)}</div>
      <div class="card-meta">
        <span>${item.year || '—'}</span>
        <span class="card-vr">${item.vrRating ? '★ ' + item.vrRating : ''}</span>
      </div>
    </div>
  `;

  card.addEventListener('click', () => openModal(item));
  return card;
}

// ===== MODAL =====
function openModal(item) {
  const streamBadges = [
    [item.streaming1, item.streamingLogo1],
    [item.streaming2, item.streamingLogo2],
    [item.streaming3, item.streamingLogo3],
  ].filter(([name]) => name).map(([name, logo]) => getStreamingBadge(name, logo)).join('');
  const langBadges  = item.languages.split(',').filter(l=>l.trim()).map(l=>`<span class="badge lang">${l.trim()}</span>`).join('');
  const genreBadges = item.genres.split(',').filter(g=>g.trim()).map(g=>`<span class="badge genre">${g.trim()}</span>`).join('');
  const subGenreBadges = item.subGenre ? item.subGenre.split(',').filter(sg=>sg.trim()).map(sg=>`<span class="badge subgenre">${sg.trim()}</span>`).join('') : '';

  const details = [
    ['Type',          item.type],
    ['Release Date',  item.releaseDate],
    ['Certification', item.certification],
    ['Runtime',       item.runtime ? item.runtime + ' mins' : null],
    ['Episodes',      item.episodes || null],
    ['Decade',        item.decade],
    ['Total Votes',   item.totalVotes ? parseInt(item.totalVotes).toLocaleString() : null],
    ['Cast',          item.cast],
    ['Directors',     item.directors ? [...new Set(item.directors.split(',').map(d=>d.trim()))].join(', ') : null],
    ['Writers',       item.writers   ? [...new Set(item.writers.split(',').map(w=>w.trim()))].join(', ')   : null],
    ['Vote Category', item.voteCategory],
  ].filter(([,v]) => v).map(([l,v]) => `
    <div class="detail-row">
      <span class="detail-label">${l}</span>
      <span class="detail-value">${escHtml(String(v))}</span>
    </div>`).join('');

  const rd = parseFloat(item.ratingDiff);
  const diffText  = !isNaN(rd) ? (rd > 0 ? `+${rd}` : `${rd}`) : '';
  const diffColor = rd > 0 ? '#7ae87a' : rd < 0 ? '#e87a7a' : '#888';

  modalContent.innerHTML = `
    <div class="modal-top">
      ${item.poster
        ? `<img class="modal-poster" src="${item.poster}" alt="${escHtml(item.title)}"
             onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'modal-poster-placeholder',textContent:'🎬'}))">`
        : `<div class="modal-poster-placeholder">🎬</div>`}
      <div class="modal-header">
        <div class="modal-title">${escHtml(item.title)}</div>
        ${item.originalTitle && item.originalTitle !== item.title
          ? `<div class="modal-subtitle">${escHtml(item.originalTitle)}</div>` : ''}
        <div class="modal-ratings">
          ${item.vrRating  ? `<div class="rating-pill"><span class="val">${item.vrRating}</span><span class="lbl">VR Rating</span></div>` : ''}
          ${item.imdbRating? `<div class="rating-pill"><span class="val">${item.imdbRating}</span><span class="lbl">IMDb</span></div>` : ''}
          ${diffText       ? `<div class="rating-pill"><span class="val" style="color:${diffColor}">${diffText}</span><span class="lbl">Diff</span></div>` : ''}
          ${item.episodes  ? `<div class="rating-pill"><span class="val" style="color:#4be8b8">${item.episodes}</span><span class="lbl">Episodes</span></div>` : ''}
        </div>
        ${streamBadges ? `
          <div class="modal-section-label">🎬 Streaming On</div>
          <div class="modal-badges stream-badges">${streamBadges}</div>` : ''}
      </div>
    </div>

    ${item.plot ? `<div class="modal-plot">${escHtml(item.plot)}</div>` : ''}

    ${langBadges ? `<div class="modal-badge-section"><div class="modal-section-label">🌐 Languages</div><div class="modal-badges">${langBadges}</div></div>` : ''}
    ${genreBadges ? `<div class="modal-badge-section"><div class="modal-section-label">🎭 Genres</div><div class="modal-badges">${genreBadges}</div></div>` : ''}
    ${subGenreBadges ? `<div class="modal-badge-section"><div class="modal-section-label">🏷️ Sub-Genres</div><div class="modal-badges">${subGenreBadges}</div></div>` : ''}

    <div class="modal-details">${details}</div>
    ${item.url ? `<a class="imdb-link" href="${item.url}" target="_blank" rel="noopener">⭐ View on IMDb</a>` : ''}
  `;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

// ===== INFINITE SCROLL =====
window.addEventListener('scroll', () => {
  if (isLoading) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) {
    if (page * PAGE_SIZE < filtered.length) {
      isLoading = true;
      setTimeout(renderPage, 100);
    }
  }
});

// ===== EVENTS =====
let debounce;
searchInput.addEventListener('input',   () => { clearTimeout(debounce); debounce = setTimeout(applyFilters, 250); });
typeFilter.addEventListener('change',   applyFilters);
genreFilter.addEventListener('change',  applyFilters);
langFilter.addEventListener('change',   applyFilters);
yearFilter.addEventListener('change',   applyFilters);
streamingFilter.addEventListener('change', applyFilters);
ratingFilter.addEventListener('change', applyFilters);
clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  [typeFilter, genreFilter, langFilter, yearFilter, streamingFilter, ratingFilter].forEach(s => s.value = '');
  applyFilters();
});
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); statsOverlay.style.display='none'; } });

gridViewBtn.addEventListener('click', () => {
  currentView = 'grid';
  gallery.className = 'grid-view';
  gridViewBtn.classList.add('active');
  listViewBtn.classList.remove('active');
  page = 0; gallery.innerHTML = ''; renderPage();
});
listViewBtn.addEventListener('click', () => {
  currentView = 'list';
  gallery.className = 'list-view';
  listViewBtn.classList.add('active');
  gridViewBtn.classList.remove('active');
  page = 0; gallery.innerHTML = ''; renderPage();
});

// ===== UTILS =====
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function topN(map, n = 12) {
  return Object.entries(map)
    .filter(([k]) => k && k !== 'undefined')
    .sort((a,b) => b[1]-a[1])
    .slice(0, n);
}

function getCSS(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

// ===== CHART REGISTRY (destroy before re-creating) =====
const chartInstances = {};
function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }

// ===== STATS ENGINE =====
function computeStats() {
  const data = MOVIES_DATA;
  const types = [...new Set(data.map(r=>r.type).filter(Boolean))].sort();

  // --- KPIs ---
  const totalTitles   = data.length;
  const totalMovies   = data.filter(r=>r.type==='Movie').length;
  const totalSeries   = data.filter(r=>r.type!=='Movie').length;
  const totalEpisodes = data.reduce((s,r) => s + (parseInt(r.episodes)||0), 0);
  const totalMins     = data.reduce((s,r) => {
    const rt = parseInt(r.runtime) || 0;
    const ep = parseInt(r.episodes) || 1;
    return s + rt * (r.type !== 'Movie' ? ep : 1);
  }, 0);
  const totalHrs = (totalMins / 60).toFixed(0);
  const avgRating = (data.filter(r=>r.vrRating).reduce((s,r)=>s+parseFloat(r.vrRating),0) /
                     data.filter(r=>r.vrRating).length).toFixed(1);

  // --- Title Type counts ---
  const typeCounts = {};
  data.forEach(r => { if (r.type) typeCounts[r.type] = (typeCounts[r.type]||0) + 1; });

  // --- Genre (top 15, primary genre per title) ---
  const genreCounts = {};
  data.forEach(r => {
    r.genres.split(',').map(g=>g.trim()).filter(Boolean).forEach(g => {
      genreCounts[g] = (genreCounts[g]||0) + 1;
    });
  });

  // --- Genre by type (stacked) top 12 ---
  const genreByType = {}; // { genre: { type: count } }
  data.forEach(r => {
    r.genres.split(',').map(g=>g.trim()).filter(Boolean).forEach(g => {
      if (!genreByType[g]) genreByType[g] = {};
      genreByType[g][r.type] = (genreByType[g][r.type]||0) + 1;
    });
  });

  // --- Streaming ---
  const streamCounts = {};
  data.forEach(r => {
    [r.streaming1, r.streaming2, r.streaming3].filter(Boolean).forEach(s => {
      streamCounts[s] = (streamCounts[s]||0) + 1;
    });
  });

  // --- Episodes per series (top 15) ---
  const seriesEp = data
    .filter(r => r.type !== 'Movie' && r.episodes)
    .map(r => ({ title: r.title, ep: parseInt(r.episodes)||0 }))
    .sort((a,b) => b.ep - a.ep)
    .slice(0, 15);

  // --- Binge time by type (hours) ---
  const bingeMins = {};
  data.forEach(r => {
    const rt = parseInt(r.runtime) || 0;
    const ep = parseInt(r.episodes) || 1;
    const mins = rt * (r.type !== 'Movie' ? ep : 1);
    bingeMins[r.type] = (bingeMins[r.type]||0) + mins;
  });

  // --- Year by type ---
  const yearTypes = {}; // { year: { type: count } }
  data.forEach(r => {
    if (!r.year) return;
    if (!yearTypes[r.year]) yearTypes[r.year] = {};
    yearTypes[r.year][r.type] = (yearTypes[r.year][r.type]||0) + 1;
  });
  const years = Object.keys(yearTypes).sort();

  // --- VR Rating by type ---
  const ratingBuckets = {};
  for (let i=1; i<=10; i++) ratingBuckets[i] = {};
  data.forEach(r => {
    const vr = Math.round(parseFloat(r.vrRating));
    if (vr >= 1 && vr <= 10) {
      if (!ratingBuckets[vr]) ratingBuckets[vr] = {};
      ratingBuckets[vr][r.type] = (ratingBuckets[vr][r.type]||0) + 1;
    }
  });

  // --- Language by type (top 12) ---
  const langCounts = {};
  const langByType  = {}; // { lang: { type: count } }
  data.forEach(r => {
    r.languages.split(',').map(l=>l.trim()).filter(Boolean).forEach(l => {
      langCounts[l] = (langCounts[l]||0) + 1;
      if (!langByType[l]) langByType[l] = {};
      langByType[l][r.type] = (langByType[l][r.type]||0) + 1;
    });
  });
  const topLangs = topN(langCounts, 12).map(([l]) => l);

  return {
    kpis: { totalTitles, totalMovies, totalSeries, totalEpisodes, totalHrs, avgRating },
    types, typeCounts, genreCounts, genreByType,
    streamCounts, seriesEp, bingeMins,
    years, yearTypes, ratingBuckets, topLangs, langByType
  };
}

// ===== CHART HELPERS =====
function chartColors(n) {
  const base = ['#e8b84b','#e85b4b','#4be8b8','#4b8be8','#b84be8','#e84bb8','#b8e84b','#4be84b','#e8984b','#4bdde8','#e84b6f','#8be84b'];
  const out = [];
  for (let i=0; i<n; i++) out.push(base[i % base.length]);
  return out;
}

function typeColorMap(types) {
  const colors = chartColors(types.length);
  const map = {};
  types.forEach((t,i) => map[t] = colors[i]);
  return map;
}

function chartDefaults() {
  const dark = isDark;
  return {
    textColor:  dark ? '#e8e8f0' : '#111118',
    mutedColor: dark ? '#888'    : '#666',
    gridColor:  dark ? '#2a2a3a' : '#d0d0de',
    bgColor:    dark ? '#13131a' : '#ffffff',
  };
}

// ===== RENDER STATS =====
function renderStats() {
  const S = computeStats();
  const d = chartDefaults();
  const tcMap = typeColorMap(S.types);

  Chart.defaults.color = d.textColor;
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.font.size   = 11;

  // ---- KPIs ----
  const kpiRow = document.getElementById('kpiRow');
  kpiRow.innerHTML = `
    <div class="kpi-card"><div class="kpi-value">${S.kpis.totalTitles.toLocaleString()}</div><div class="kpi-label">Total Titles</div></div>
    <div class="kpi-card"><div class="kpi-value blue">${S.kpis.totalMovies.toLocaleString()}</div><div class="kpi-label">Movies</div></div>
    <div class="kpi-card"><div class="kpi-value green">${S.kpis.totalSeries.toLocaleString()}</div><div class="kpi-label">Series / Shows</div></div>
    <div class="kpi-card"><div class="kpi-value purple">${parseInt(S.kpis.totalEpisodes).toLocaleString()}</div><div class="kpi-label">Total Episodes</div></div>
    <div class="kpi-card"><div class="kpi-value red">${parseInt(S.kpis.totalHrs).toLocaleString()}</div><div class="kpi-label">Hours Binged</div></div>
    <div class="kpi-card"><div class="kpi-value">${S.kpis.avgRating}</div><div class="kpi-label">Avg VR Rating</div></div>
  `;

  // ---- 1. Title Type (donut) ----
  destroyChart('chartType');
  chartInstances['chartType'] = new Chart(document.getElementById('chartType'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(S.typeCounts),
      datasets: [{ data: Object.values(S.typeCounts), backgroundColor: chartColors(Object.keys(S.typeCounts).length), borderWidth: 2, borderColor: d.bgColor }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: d.textColor, boxWidth: 12, padding: 10 } } }
    }
  });

  // ---- 2. Binge Time by Type (horizontal bar) ----
  destroyChart('chartBinge');
  const bingeLabels = Object.keys(S.bingeMins);
  const bingeHrs    = bingeLabels.map(k => +(S.bingeMins[k]/60).toFixed(1));
  chartInstances['chartBinge'] = new Chart(document.getElementById('chartBinge'), {
    type: 'bar',
    data: {
      labels: bingeLabels,
      datasets: [{ data: bingeHrs, backgroundColor: chartColors(bingeLabels.length), borderRadius: 6, borderWidth: 0 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: d.gridColor }, ticks: { color: d.mutedColor, callback: v => v+'h' } },
        y: { grid: { display: false }, ticks: { color: d.textColor } }
      }
    }
  });

  // ---- 3. Top Genres (horizontal bar) ----
  destroyChart('chartGenre');
  const topGenres = topN(S.genreCounts, 15);
  chartInstances['chartGenre'] = new Chart(document.getElementById('chartGenre'), {
    type: 'bar',
    data: {
      labels: topGenres.map(([g]) => g),
      datasets: [{ data: topGenres.map(([,c]) => c), backgroundColor: chartColors(topGenres.length), borderRadius: 6, borderWidth: 0 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: d.gridColor }, ticks: { color: d.mutedColor } },
        y: { grid: { display: false }, ticks: { color: d.textColor } }
      }
    }
  });

  // ---- 4. Streaming Platforms (donut) ----
  destroyChart('chartStream');
  const topStreams = topN(S.streamCounts, 10);
  chartInstances['chartStream'] = new Chart(document.getElementById('chartStream'), {
    type: 'doughnut',
    data: {
      labels: topStreams.map(([s]) => s),
      datasets: [{
        data: topStreams.map(([,c]) => c),
        backgroundColor: topStreams.map(([s]) => platformColor(s) + 'cc'),
        borderColor:     topStreams.map(([s]) => platformColor(s)),
        borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: d.textColor, boxWidth: 12, padding: 8 } } }
    }
  });

  // ---- 5. Top Series by Episodes (bar) ----
  destroyChart('chartEpisodes');
  chartInstances['chartEpisodes'] = new Chart(document.getElementById('chartEpisodes'), {
    type: 'bar',
    data: {
      labels: S.seriesEp.map(s => s.title.length > 20 ? s.title.slice(0,18)+'…' : s.title),
      datasets: [{ data: S.seriesEp.map(s=>s.ep), backgroundColor: '#4be8b8cc', borderRadius: 6, borderWidth: 0 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: d.gridColor }, ticks: { color: d.mutedColor, stepSize: 1 } },
        y: { grid: { display: false }, ticks: { color: d.textColor, font: { size: 10 } } }
      }
    }
  });

  // ---- 6. Release Year (stacked bar by type) ----
  destroyChart('chartYear');
  const yearDatasets = S.types.map(t => ({
    label: t,
    data: S.years.map(y => (S.yearTypes[y] && S.yearTypes[y][t]) || 0),
    backgroundColor: tcMap[t] + 'cc',
    borderColor: tcMap[t],
    borderWidth: 1,
    borderRadius: 3,
  }));
  chartInstances['chartYear'] = new Chart(document.getElementById('chartYear'), {
    type: 'bar',
    data: { labels: S.years, datasets: yearDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: d.textColor, boxWidth: 12, padding: 10 } } },
      scales: {
        x: { stacked: true, grid: { color: d.gridColor }, ticks: { color: d.mutedColor, maxRotation: 45, maxTicksLimit: 20 } },
        y: { stacked: true, grid: { color: d.gridColor }, ticks: { color: d.mutedColor } }
      }
    }
  });

  // ---- 7. VR Rating distribution (grouped by type) ----
  destroyChart('chartRating');
  const ratingLabels = ['1','2','3','4','5','6','7','8','9','10'];
  const ratingDatasets = S.types.map(t => ({
    label: t,
    data: ratingLabels.map(r => (S.ratingBuckets[parseInt(r)] && S.ratingBuckets[parseInt(r)][t]) || 0),
    backgroundColor: tcMap[t] + 'bb',
    borderColor: tcMap[t],
    borderWidth: 1,
    borderRadius: 4,
  }));
  chartInstances['chartRating'] = new Chart(document.getElementById('chartRating'), {
    type: 'bar',
    data: { labels: ratingLabels, datasets: ratingDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: d.textColor, boxWidth: 12, padding: 10 } } },
      scales: {
        x: { grid: { color: d.gridColor }, ticks: { color: d.textColor } },
        y: { grid: { color: d.gridColor }, ticks: { color: d.mutedColor } }
      }
    }
  });

  // ---- 8. Top Languages stacked by type ----
  destroyChart('chartLang');
  const langDatasets = S.types.map(t => ({
    label: t,
    data: S.topLangs.map(l => (S.langByType[l] && S.langByType[l][t]) || 0),
    backgroundColor: tcMap[t] + 'cc',
    borderColor: tcMap[t],
    borderWidth: 1,
    borderRadius: 3,
  }));
  chartInstances['chartLang'] = new Chart(document.getElementById('chartLang'), {
    type: 'bar',
    data: { labels: S.topLangs, datasets: langDatasets },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: d.textColor, boxWidth: 12, padding: 10 } } },
      scales: {
        x: { stacked: true, grid: { color: d.gridColor }, ticks: { color: d.mutedColor } },
        y: { stacked: true, grid: { display: false }, ticks: { color: d.textColor } }
      }
    }
  });
}

// ===== START =====
initFilters();
applyFilters();
