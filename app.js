// ================================================================
//  VR MovieDB — app.js
// ================================================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwoje62vCYjzEjls-k8IYEL9Xrt2--MN_3-gimrEfxHg7nkt86DXqD0fb6vosK9rZpZTA/exec';

const COL_MAP = {
  title:0,originalTitle:1,type:2,year:3,releaseDate:4,certification:5,
  languages:6,genres:7,subGenre:8,runtime:9,plot:10,imdbRating:11,
  vrRating:12,totalVotes:13,cast:14,directors:15,writers:16,
  streamingLogo1:17,streamingLogo2:18,streamingLogo3:19,
  streaming1:20,streaming2:21,streaming3:22,
  poster:23,url:24,dateRated:25,const:26,
  decade:27,ratingDiff:28,voteCategory:29,episodes:30,
};

// ── State ────────────────────────────────────────────────────────
let filtered    = [];
let currentView = 'grid';
let activeTab   = 'all';
let activeSort  = '';
let sessionAuth = false; // PIN verified this session
const PAGE_SIZE = 60;
let page = 0, isLoading = false;
let currentItem = null;

// ── Theme ────────────────────────────────────────────────────────
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
let isDark = localStorage.getItem('vr-theme') !== 'light';
html.setAttribute('data-theme', isDark ? 'dark' : 'light');
themeToggle.textContent = isDark ? '🌙' : '☀️';
themeToggle.addEventListener('click', () => {
  isDark = !isDark;
  html.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('vr-theme', isDark ? 'dark' : 'light');
  themeToggle.textContent = isDark ? '🌙' : '☀️';
  if (document.getElementById('statsOverlay').style.display !== 'none') renderStats();
});

// ── Platform helpers (dynamic from sheet) ────────────────────────
function getPlatforms() { return window.PLATFORMS_DATA || []; }

function platformColor(name) {
  const p = getPlatforms().find(p => p.name === name);
  return p ? p.color : '#888';
}

function resolveLogoUrl(name, sheetUrl) {
  if (sheetUrl && sheetUrl.trim()) return sheetUrl.trim();
  const p = getPlatforms().find(p => p.name === name);
  return p ? p.logoUrl : null;
}

function getStreamingBadge(name, sheetLogoUrl = '') {
  if (!name) return '';
  const color   = platformColor(name);
  const logoUrl = resolveLogoUrl(name, sheetLogoUrl);
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${name}" class="stream-logo-img"
         onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'stream-dot',style:'background:${color}'}))"> `
    : `<span class="stream-dot" style="background:${color}"></span>`;
  return `<span class="badge stream" style="border-color:${color}40;background:${color}18;">${logoHtml}${name}</span>`;
}

// ── DOM refs ─────────────────────────────────────────────────────
const gallery         = document.getElementById('gallery');
const searchInput     = document.getElementById('searchInput');
const genreFilter     = document.getElementById('genreFilter');
const langFilter      = document.getElementById('langFilter');
const yearFilter      = document.getElementById('yearFilter');
const streamingFilter = document.getElementById('streamingFilter');
const ratingFilter    = document.getElementById('ratingFilter');
const sortSelect      = document.getElementById('sortSelect');
const clearBtn        = document.getElementById('clearBtn');
const resultCount     = document.getElementById('resultCount');
const headerStats     = document.getElementById('headerStats');

// ── Tabs ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    applyFilters();
  });
});
sortSelect.addEventListener('change', () => { activeSort = sortSelect.value; applyFilters(); });

// ── Init Filters ─────────────────────────────────────────────────
function initFilters() {
  const data   = MOVIES_DATA;
  const genres = [...new Set(data.flatMap(r => r.genres.split(',').map(g=>g.trim())))].filter(Boolean).sort();
  const langs  = [...new Set(data.flatMap(r => r.languages.split(',').map(l=>l.trim())))].filter(Boolean).sort();
  const years  = [...new Set(data.map(r=>r.year).filter(Boolean))].sort((a,b)=>b-a);
  const plats  = [...new Set(data.flatMap(r=>[r.streaming1,r.streaming2,r.streaming3]).filter(Boolean))].sort();

  genres.forEach(g => { if (![...genreFilter.options].some(o=>o.value===g)) genreFilter.add(new Option(g,g)); });
  langs.forEach(l  => { if (![...langFilter.options].some(o=>o.value===l))  langFilter.add(new Option(l,l)); });
  years.forEach(y  => { if (![...yearFilter.options].some(o=>o.value===y))  yearFilter.add(new Option(y,y)); });
  plats.forEach(p  => { if (![...streamingFilter.options].some(o=>o.value===p)) streamingFilter.add(new Option(p,p)); });

  const movies = data.filter(r=>r.type==='Movie').length;
  const series = data.filter(r=>r.type!=='Movie').length;
  headerStats.textContent = `${data.length.toLocaleString()} titles · ${movies} Movies · ${series} Series`;

  const params = new URLSearchParams(window.location.search);
  const deepId = params.get('id');
  if (deepId) { const item = MOVIES_DATA.find(r=>r.const===deepId); if (item) setTimeout(()=>openModal(item),400); }
}

// ── Filters + Sort ───────────────────────────────────────────────
function applyFilters() {
  const q         = searchInput.value.toLowerCase().trim();
  const genre     = genreFilter.value;
  const lang      = langFilter.value;
  const year      = yearFilter.value;
  const stream    = streamingFilter.value;
  const minRating = ratingFilter.value ? parseFloat(ratingFilter.value) : null;

  filtered = MOVIES_DATA.filter(r => {
    if (activeTab !== 'all' && r.type !== activeTab) return false;
    if (q && !r.title.toLowerCase().includes(q) && !r.cast.toLowerCase().includes(q) &&
        !r.directors.toLowerCase().includes(q) && !r.originalTitle.toLowerCase().includes(q)) return false;
    if (genre  && !r.genres.includes(genre)) return false;
    if (lang   && !r.languages.includes(lang)) return false;
    if (year   && r.year !== year) return false;
    if (stream && r.streaming1!==stream && r.streaming2!==stream && r.streaming3!==stream) return false;
    if (minRating !== null && parseFloat(r.vrRating) < minRating) return false;
    return true;
  });

  if (activeSort) {
    filtered = [...filtered].sort((a,b) => {
      switch(activeSort) {
        case 'vr_desc':      return (parseFloat(b.vrRating)||0)-(parseFloat(a.vrRating)||0);
        case 'vr_asc':       return (parseFloat(a.vrRating)||0)-(parseFloat(b.vrRating)||0);
        case 'imdb_desc':    return (parseFloat(b.imdbRating)||0)-(parseFloat(a.imdbRating)||0);
        case 'year_desc':    return (parseInt(b.year)||0)-(parseInt(a.year)||0);
        case 'year_asc':     return (parseInt(a.year)||0)-(parseInt(b.year)||0);
        case 'runtime_desc': return (parseInt(b.runtime)||0)-(parseInt(a.runtime)||0);
        case 'title_asc':    return a.title.localeCompare(b.title);
        case 'date_desc':    return new Date(normDate(b.dateRated)||0)-new Date(normDate(a.dateRated)||0);
        default: return 0;
      }
    });
  }

  page = 0; gallery.innerHTML = '';
  resultCount.textContent = `${filtered.length.toLocaleString()} titles`;
  renderPage();
}

// ── Render ───────────────────────────────────────────────────────
function renderPage() {
  if (filtered.length === 0 && page === 0) {
    gallery.innerHTML = `<div class="empty"><div class="empty-icon">🎬</div><div>No titles found</div></div>`;
    return;
  }
  filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).forEach(item => gallery.appendChild(createCard(item)));
  page++; isLoading = false;
}

function createCard(item) {
  const card   = document.createElement('div');
  card.className = 'card';
  const isTV    = item.type && item.type !== 'Movie';
  const typeBadge = isTV ? `<span class="card-type-badge">${item.type.replace('TV ','')}</span>` : '';
  const epBadge   = (isTV && item.episodes) ? `<span class="card-episodes-badge">${item.episodes} ep</span>` : '';
  const platformDots = [item.streaming1,item.streaming2,item.streaming3].filter(Boolean)
    .map(s=>`<span class="hover-platform-dot" style="background:${platformColor(s)}" title="${s}"></span>`).join('');

  card.innerHTML = `
    ${typeBadge}${epBadge}
    ${item.poster
      ? `<img class="card-poster" src="${item.poster}" alt="${escHtml(item.title)}" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-poster-placeholder',textContent:'🎬'}))">`
      : `<div class="card-poster-placeholder">🎬</div>`}
    <div class="card-hover-preview">
      ${item.plot?`<div class="hover-plot">${escHtml(item.plot)}</div>`:''}
      <div class="hover-platforms">${platformDots}</div>
    </div>
    <div class="card-info">
      <div class="card-title">${escHtml(item.title)}</div>
      <div class="card-meta"><span>${item.year||'—'}</span><span class="card-vr">${item.vrRating?'★ '+item.vrRating:''}</span></div>
    </div>`;
  card.addEventListener('click', () => openModal(item));
  return card;
}

// ── Detail Modal ─────────────────────────────────────────────────
function openModal(item) {
  currentItem = item;
  const streamBadges = [
    [item.streaming1,item.streamingLogo1],[item.streaming2,item.streamingLogo2],[item.streaming3,item.streamingLogo3],
  ].filter(([n])=>n).map(([n,l])=>getStreamingBadge(n,l)).join('');

  const langBadges  = item.languages.split(',').filter(l=>l.trim()).map(l=>`<span class="badge lang">${l.trim()}</span>`).join('');
  const genreBadges = item.genres.split(',').filter(g=>g.trim()).map(g=>`<span class="badge genre">${g.trim()}</span>`).join('');
  const subGenreBadges = item.subGenre ? item.subGenre.split(',').filter(s=>s.trim()).map(s=>`<span class="badge subgenre">${s.trim()}</span>`).join('') : '';

  const details = [
    ['Type',item.type],['Release Date',item.releaseDate],['Certification',item.certification],
    ['Runtime',item.runtime?item.runtime+' mins':null],['Episodes',item.episodes||null],
    ['Decade',item.decade],['Total Votes',item.totalVotes?parseInt(item.totalVotes).toLocaleString():null],
    ['Cast',item.cast],
    ['Directors',item.directors?[...new Set(item.directors.split(',').map(d=>d.trim()))].join(', '):null],
    ['Writers',item.writers?[...new Set(item.writers.split(',').map(w=>w.trim()))].join(', '):null],
    ['Rated On',item.dateRated||null],['Vote Category',item.voteCategory],
  ].filter(([,v])=>v).map(([l,v])=>`
    <div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${escHtml(String(v))}</span></div>`).join('');

  const rd=parseFloat(item.ratingDiff);
  const diffText=!isNaN(rd)?(rd>0?`+${rd}`:`${rd}`):'';
  const diffColor=rd>0?'#7ae87a':rd<0?'#e87a7a':'#888';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-top">
      ${item.poster
        ?`<img class="modal-poster" src="${item.poster}" alt="${escHtml(item.title)}"
             onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'modal-poster-placeholder',textContent:'🎬'}))">`
        :`<div class="modal-poster-placeholder">🎬</div>`}
      <div class="modal-header">
        <div class="modal-title">${escHtml(item.title)}</div>
        ${item.originalTitle&&item.originalTitle!==item.title?`<div class="modal-subtitle">${escHtml(item.originalTitle)}</div>`:''}
        <div class="modal-ratings">
          ${item.vrRating?`<div class="rating-pill"><span class="val">${item.vrRating}</span><span class="lbl">VR Rating</span></div>`:''}
          ${item.imdbRating?`<div class="rating-pill"><span class="val">${item.imdbRating}</span><span class="lbl">IMDb</span></div>`:''}
          ${diffText?`<div class="rating-pill"><span class="val" style="color:${diffColor}">${diffText}</span><span class="lbl">Diff</span></div>`:''}
          ${item.episodes?`<div class="rating-pill"><span class="val" style="color:#4be8b8">${item.episodes}</span><span class="lbl">Episodes</span></div>`:''}
        </div>
        ${streamBadges?`<div class="modal-section-label">🎬 Streaming On</div><div class="modal-badges stream-badges">${streamBadges}</div>`:''}
      </div>
    </div>
    ${item.plot?`<div class="modal-plot">${escHtml(item.plot)}</div>`:''}
    ${langBadges?`<div class="modal-badge-section"><div class="modal-section-label">🌐 Languages</div><div class="modal-badges">${langBadges}</div></div>`:''}
    ${genreBadges?`<div class="modal-badge-section"><div class="modal-section-label">🎭 Genres</div><div class="modal-badges">${genreBadges}</div></div>`:''}
    ${subGenreBadges?`<div class="modal-badge-section"><div class="modal-section-label">🏷️ Sub-Genres</div><div class="modal-badges">${subGenreBadges}</div></div>`:''}
    <div class="modal-details">${details}</div>
    <div class="modal-actions">
      ${item.url?`<a class="btn btn-imdb" href="${item.url}" target="_blank" rel="noopener">⭐ IMDb</a>`:''}
      <button class="btn btn-edit" id="editBtn">✏️ Edit</button>
      <button class="btn btn-share" onclick="shareTitle('${item.const||''}','${escHtml(item.title)}')">🔗 Share</button>
    </div>`;

  document.getElementById('editBtn').addEventListener('click', () => requirePin(() => openEditModal(currentItem)));

  document.getElementById('modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  document.body.style.overflow = '';
}

// ── Share ────────────────────────────────────────────────────────
function shareTitle(constId, title) {
  const url = `${location.origin}${location.pathname}${constId?'?id='+constId:''}`;
  navigator.clipboard.writeText(url).then(() => showToast(`🔗 Link copied for "${title}"`));
}

// ── PIN Auth ─────────────────────────────────────────────────────
function requirePin(onSuccess) {
  if (sessionAuth) { onSuccess(); return; }

  // Build PIN overlay
  const overlay = document.createElement('div');
  overlay.className = 'pin-overlay';
  overlay.id = 'pinOverlay';
  overlay.innerHTML = `
    <div class="pin-box">
      <div class="pin-title">🔐 Enter PIN</div>
      <div class="pin-subtitle">Enter your 6-digit PIN to continue</div>
      <div class="pin-dots" id="pinDots">
        ${[0,1,2,3,4,5].map(i=>`<div class="pin-dot" id="dot${i}"></div>`).join('')}
      </div>
      <div class="pin-error" id="pinError"></div>
      <div class="pin-numpad">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => k===''
          ? `<div></div>`
          : `<button class="pin-key" data-key="${k}">${k}</button>`
        ).join('')}
      </div>
      <button class="btn btn-cancel pin-cancel" id="pinCancel">Cancel</button>
    </div>`;
  document.body.appendChild(overlay);

  let entered = '';

  function updateDots() {
    for (let i=0;i<6;i++) {
      const dot = document.getElementById(`dot${i}`);
      dot.classList.toggle('filled', i < entered.length);
    }
  }

  async function submitPin() {
    const errorEl = document.getElementById('pinError');
    errorEl.textContent = 'Verifying…';
    try {
      // Use GET with pin as query param — avoids no-cors limitation entirely
      const res  = await fetch(`${APPS_SCRIPT_URL}?action=verifyPin&pin=${encodeURIComponent(entered)}`);
      const data = await res.json();
      if (data.success) {
        sessionAuth = true;
        closePinOverlay();
        onSuccess();
      } else {
        errorEl.textContent = '❌ Wrong PIN. Try again.';
        entered = '';
        updateDots();
      }
    } catch(e) {
      errorEl.textContent = '❌ Network error. Try again.';
      entered = '';
      updateDots();
    }
  }

  overlay.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key;
      if (k === '⌫') { entered = entered.slice(0,-1); }
      else if (entered.length < 6) { entered += k; }
      updateDots();
      if (entered.length === 6) submitPin();
    });
  });

  document.getElementById('pinCancel').addEventListener('click', closePinOverlay);
  overlay.addEventListener('click', e => { if (e.target===overlay) closePinOverlay(); });
}

function closePinOverlay() {
  const el = document.getElementById('pinOverlay');
  if (el) el.remove();
}

// ── Edit Modal ───────────────────────────────────────────────────
function openEditModal(item) {
  if (!item) return;
  closeModal();

  const platformOpts = getPlatforms().map(p =>
    `<option value="${escHtml(p.name)}" ${p.name===item.streaming1?'selected':''}>${escHtml(p.name)}</option>`
  ).join('');
  const p2opts = getPlatforms().map(p =>
    `<option value="${escHtml(p.name)}" ${p.name===item.streaming2?'selected':''}>${escHtml(p.name)}</option>`
  ).join('');
  const p3opts = getPlatforms().map(p =>
    `<option value="${escHtml(p.name)}" ${p.name===item.streaming3?'selected':''}>${escHtml(p.name)}</option>`
  ).join('');

  document.getElementById('editModalContent').innerHTML = `
    <div class="edit-form-title">✏️ Edit — ${escHtml(item.title)}</div>
    <div class="edit-form" id="editForm">
      ${ef('Title','title',item.title,'text')}
      ${ef('Original Title','originalTitle',item.originalTitle,'text')}
      ${ef('Type','type',item.type,'select',['Movie','TV Series','TV Mini Series','TV Movie','Video','Short'])}
      ${ef('Year','year',item.year,'text')}
      ${ef('Release Date','releaseDate',item.releaseDate,'date')}
      ${ef('Certification','certification',item.certification,'text')}
      ${ef('Languages','languages',item.languages,'text')}
      ${ef('Genres','genres',item.genres,'text')}
      ${ef('Sub Genre','subGenre',item.subGenre,'text')}
      ${ef('Runtime (mins)','runtime',item.runtime,'text')}
      ${ef('Episodes','episodes',item.episodes,'text')}
      ${ef('IMDb Rating','imdbRating',item.imdbRating,'text')}
      ${ef('VR Rating','vrRating',item.vrRating,'text')}
      ${ef('Decade','decade',item.decade,'text')}
      <div class="edit-group">
        <label class="edit-label">Streaming 1</label>
        <select class="edit-select" data-field="streaming1"><option value="">None</option>${platformOpts}</select>
      </div>
      <div class="edit-group">
        <label class="edit-label">Streaming 2</label>
        <select class="edit-select" data-field="streaming2"><option value="">None</option>${p2opts}</select>
      </div>
      <div class="edit-group">
        <label class="edit-label">Streaming 3</label>
        <select class="edit-select" data-field="streaming3"><option value="">None</option>${p3opts}</select>
      </div>
      ${ef('Cast','cast',item.cast,'textarea')}
      ${ef('Directors','directors',item.directors,'textarea')}
      ${ef('Writers','writers',item.writers,'textarea')}
      ${ef('Plot','plot',item.plot,'textarea')}
      ${ef('Poster URL','poster',item.poster,'text')}
      ${ef('IMDb URL','url',item.url,'text')}
      ${ef('Date Rated','dateRated',item.dateRated,'date')}
      <div class="edit-actions">
        <button class="btn btn-save" onclick="saveEdit('${item.const}','edit')">💾 Save to Sheet</button>
        <button class="btn btn-cancel" onclick="closeEditModal()">Cancel</button>
        <div class="edit-saving" id="editSaving"><div class="saving-spinner"></div> Saving…</div>
      </div>
    </div>`;

  document.getElementById('editModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function ef(label, field, value, type, options=[]) {
  const fullClass = ['cast','directors','writers','plot'].includes(field)?'full':'';
  const val = escHtml(value||'');
  if (type==='textarea') return `<div class="edit-group ${fullClass}"><label class="edit-label">${label}</label><textarea class="edit-textarea" data-field="${field}">${val}</textarea></div>`;
  if (type==='select') {
    const opts = options.map(o=>`<option value="${o}" ${o===value?'selected':''}>${o}</option>`).join('');
    return `<div class="edit-group ${fullClass}"><label class="edit-label">${label}</label><select class="edit-select" data-field="${field}">${opts}</select></div>`;
  }
  if (type==='date') {
    // Convert existing value to YYYY-MM-DD for the native date picker
    const isoVal = toInputDate(value||'');
    return `<div class="edit-group ${fullClass}"><label class="edit-label">${label}</label><input class="edit-input edit-date" data-field="${field}" data-datepicker="true" type="date" value="${isoVal}"/></div>`;
  }
  return `<div class="edit-group ${fullClass}"><label class="edit-label">${label}</label><input class="edit-input" data-field="${field}" type="text" value="${val}"/></div>`;
}

async function saveEdit(constId, action='edit') {
  const form   = document.getElementById('editForm');
  const saving = document.getElementById('editSaving');
  saving.classList.add('visible');

  const updates = {};
  form.querySelectorAll('[data-field]').forEach(el => {
    const colIdx = COL_MAP[el.dataset.field];
    if (colIdx !== undefined) {
      // Date picker returns YYYY-MM-DD — convert to M/D/YYYY for sheet
      updates[colIdx] = el.dataset.datepicker ? toSheetDate(el.value) : el.value;
    }
  });

  // Sync streaming logo URLs from PLATFORMS_DATA when platform name changes
  ['streaming1','streaming2','streaming3'].forEach((field, i) => {
    const nameEl  = form.querySelector(`[data-field="${field}"]`);
    if (!nameEl) return;
    const name    = nameEl.value;
    const p       = getPlatforms().find(p => p.name === name);
    const logoField = `streamingLogo${i+1}`;
    const logoIdx = COL_MAP[logoField];
    if (logoIdx !== undefined) updates[logoIdx] = p ? p.logoUrl : '';
  });

  // Patch in-memory immediately
  const itemIdx = MOVIES_DATA.findIndex(r => r.const === constId);
  if (itemIdx !== -1) {
    Object.entries(updates).forEach(([colIdx, val]) => {
      const field = Object.keys(COL_MAP).find(k => COL_MAP[k]===parseInt(colIdx));
      if (field) MOVIES_DATA[itemIdx][field] = val;
    });
  }

  try {
    await fetch(APPS_SCRIPT_URL, {
      method:'POST', mode:'no-cors', cache:'no-store',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({ action:'editRow', const: constId, updates }),
    });
    saving.classList.remove('visible');
    closeEditModal();
    showToast('✅ Saved to Google Sheets!');
    applyFilters();
  } catch(err) {
    saving.classList.remove('visible');
    showToast(`❌ Error: ${err.message}`);
  }
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  document.body.style.overflow = '';
}

// ── Add Title Modal ───────────────────────────────────────────────
function openAddModal() {
  document.getElementById('editModalContent').innerHTML = `
    <div class="edit-form-title">➕ Add New Title</div>
    <p style="color:var(--muted);font-size:13px;margin:0 0 20px;line-height:1.5;">
      Enter the IMDb ID below and save. The nightly pipeline will automatically
      scrape all details and populate the database by the next morning.
    </p>
    <div class="edit-form" id="editForm">
      <div class="edit-group full">
        <label class="edit-label">IMDb ID (tt…) <span style="color:#e6b800">*</span></label>
        <input
          class="edit-input"
          data-field="const"
          type="text"
          placeholder="e.g. tt0816692"
          style="font-size:18px;letter-spacing:1px;"
          autocomplete="off"
          spellcheck="false"
        />
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">
          Find it in the IMDb URL: imdb.com/title/<strong>tt0816692</strong>/
        </div>
      </div>
      <div class="edit-actions">
        <button class="btn btn-save" id="addSaveBtn">➕ Add to Sheet</button>
        <button class="btn btn-cancel" onclick="closeEditModal()">Cancel</button>
        <div class="edit-saving" id="editSaving"><div class="saving-spinner"></div> Saving…</div>
      </div>
    </div>`;

  // Allow Enter key to submit
  document.querySelector('[data-field="const"]').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveAdd();
  });

  document.getElementById('addSaveBtn').addEventListener('click', saveAdd);
  document.getElementById('editModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Auto-focus the input
  setTimeout(() => document.querySelector('[data-field="const"]')?.focus(), 100);
}

async function saveAdd() {
  const form    = document.getElementById('editForm');
  const saving  = document.getElementById('editSaving');
  const constEl = form.querySelector('[data-field="const"]');

  const imdbId = constEl.value.trim();

  // Validate — only IMDB ID required now
  if (!imdbId) {
    showToast('❌ IMDb ID is required');
    constEl.focus();
    return;
  }
  if (!imdbId.startsWith('tt') || !/^tt\d+$/.test(imdbId)) {
    showToast('❌ Must be a valid IMDb ID, e.g. tt0816692');
    constEl.focus();
    return;
  }

  // Check for duplicates in current in-memory data
  if (MOVIES_DATA.some(r => r.const === imdbId)) {
    showToast('⚠️ This IMDb ID already exists in your database');
    constEl.focus();
    return;
  }

  saving.classList.add('visible');

  // Build a minimal row — only the Const column (col 26) is set
  // All other fields are left blank for the nightly scraper to fill
  const rowData = {};
  rowData[COL_MAP.const] = imdbId;

  try {
    await fetch(APPS_SCRIPT_URL, {
      method:'POST', mode:'no-cors', cache:'no-store',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({ action:'addRow', rowData }),
    });

    // Add a placeholder entry to in-memory data so the UI reflects it
    // The scraper will fill the real data overnight
    const placeholder = {};
    Object.keys(COL_MAP).forEach(k => placeholder[k] = '');
    placeholder.const = imdbId;
    placeholder.title = `⏳ Pending — ${imdbId}`;
    MOVIES_DATA.unshift(placeholder);

    saving.classList.remove('visible');
    closeEditModal();
    showToast(`✅ ${imdbId} queued! Nightly pipeline will scrape details.`);
    applyFilters();
  } catch(err) {
    saving.classList.remove('visible');
    showToast(`❌ Error: ${err.message}`);
  }
}

// ── Infinite Scroll ──────────────────────────────────────────────
window.addEventListener('scroll', () => {
  if (isLoading) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) {
    if (page * PAGE_SIZE < filtered.length) { isLoading = true; setTimeout(renderPage, 100); }
  }
});

// ── Events ───────────────────────────────────────────────────────
let debounce;
searchInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(applyFilters, 250); });
[genreFilter,langFilter,yearFilter,streamingFilter,ratingFilter].forEach(s => s.addEventListener('change', applyFilters));
clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  [genreFilter,langFilter,yearFilter,streamingFilter,ratingFilter].forEach(s=>s.value='');
  updateFilterDot();
  applyFilters();
});
// ── Filter Toggle (bottom sheet on mobile, no-op on desktop) ────
const filterToggleBtn = document.getElementById('filterToggleBtn');
const filtersBar      = document.getElementById('filtersBar');
const filterBackdrop  = document.getElementById('filterBackdrop');
const filterCloseBtn  = document.getElementById('filterCloseBtn');

function openFilters() {
  filtersBar.classList.add('open');
  filterBackdrop.classList.add('visible');
  document.body.style.overflow = 'hidden';
}
function closeFilters() {
  filtersBar.classList.remove('open');
  filterBackdrop.classList.remove('visible');
  document.body.style.overflow = '';
}
function updateFilterDot() {
  const hasActive = genreFilter.value || langFilter.value || yearFilter.value ||
    streamingFilter.value || ratingFilter.value || searchInput.value.trim();
  filterToggleBtn.classList.toggle('has-filters', !!hasActive);
}

filterToggleBtn.addEventListener('click', () => {
  filtersBar.classList.contains('open') ? closeFilters() : openFilters();
});
filterBackdrop.addEventListener('click', closeFilters);
filterCloseBtn.addEventListener('click', () => { closeFilters(); applyFilters(); });

// Update dot whenever filters change
[genreFilter,langFilter,yearFilter,streamingFilter,ratingFilter].forEach(s =>
  s.addEventListener('change', updateFilterDot)
);
searchInput.addEventListener('input', updateFilterDot);

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', e => { if(e.target===document.getElementById('modal')) closeModal(); });
document.getElementById('editModalClose').addEventListener('click', closeEditModal);
document.getElementById('editModal').addEventListener('click', e => { if(e.target===document.getElementById('editModal')) closeEditModal(); });
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeModal(); closeEditModal(); closePinOverlay(); closeCalDayModal();
    ['statsOverlay','timelineOverlay','calendarOverlay'].forEach(id=>{ document.getElementById(id).style.display='none'; }); }
});

document.getElementById('gridViewBtn').addEventListener('click', () => {
  currentView='grid'; gallery.className='grid-view';
  document.getElementById('gridViewBtn').classList.add('active');
  document.getElementById('listViewBtn').classList.remove('active');
  page=0; gallery.innerHTML=''; renderPage();
});
document.getElementById('listViewBtn').addEventListener('click', () => {
  currentView='list'; gallery.className='list-view';
  document.getElementById('listViewBtn').classList.add('active');
  document.getElementById('gridViewBtn').classList.remove('active');
  page=0; gallery.innerHTML=''; renderPage();
});

document.getElementById('statsBtn').addEventListener('click',    ()=>{ openPanel('statsOverlay');    renderStats(); });
document.getElementById('timelineBtn').addEventListener('click', ()=>{ openPanel('timelineOverlay'); renderTimeline(); });
document.getElementById('calendarBtn').addEventListener('click', ()=>{ openPanel('calendarOverlay'); renderCalendar(); });
document.getElementById('addBtn').addEventListener('click', () => requirePin(openAddModal));
document.getElementById('refreshBtn').addEventListener('click', hardRefresh);

['statsClose','timelineClose','calendarClose'].forEach(id => {
  document.getElementById(id).addEventListener('click', ()=>document.getElementById(id.replace('Close','Overlay')).style.display='none');
});
['statsOverlay','timelineOverlay','calendarOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e=>{ if(e.target===document.getElementById(id)) document.getElementById(id).style.display='none'; });
});

function openPanel(id) {
  ['statsOverlay','timelineOverlay','calendarOverlay'].forEach(p=>document.getElementById(p).style.display='none');
  if (id) document.getElementById(id).style.display='block';
}

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}

// ── Hard Refresh ─────────────────────────────────────────────────
async function hardRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '⏳';
  btn.disabled = true;

  // 1. Clear all SW caches
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }

  // 2. Unregister service worker so it re-installs fresh
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  }

  showToast('🔄 Cache cleared — reloading…');

  // 3. Hard reload bypassing browser cache
  setTimeout(() => window.location.reload(true), 800);
}

// ── Utils ────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function topN(map,n=12) {
  return Object.entries(map).filter(([k])=>k&&k!=='undefined').sort((a,b)=>b[1]-a[1]).slice(0,n);
}
function normDate(raw) {
  if (!raw) return '';
  raw = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return '';
}

// Convert any date to YYYY-MM-DD for <input type="date"> value
function toInputDate(raw) {
  return normDate(raw); // normDate already returns YYYY-MM-DD
}

// Convert YYYY-MM-DD (from date picker) back to M/D/YYYY (sheet format)
function toSheetDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

// ================================================================
//  STATS
// ================================================================
const chartInstances = {};
function destroyChart(id) { if(chartInstances[id]){chartInstances[id].destroy();delete chartInstances[id];} }
function chartColors(n) {
  const base=['#e8b84b','#e85b4b','#4be8b8','#4b8be8','#b84be8','#e84bb8','#b8e84b','#4be84b','#e8984b','#4bdde8','#e84b6f','#8be84b'];
  const out=[]; for(let i=0;i<n;i++) out.push(base[i%base.length]); return out;
}
function typeColorMap(types){const c=chartColors(types.length),m={};types.forEach((t,i)=>m[t]=c[i]);return m;}
function chartDefaults(){return{textColor:isDark?'#e8e8f0':'#111118',mutedColor:isDark?'#888':'#666',gridColor:isDark?'#2a2a3a':'#d0d0de',bgColor:isDark?'#13131a':'#ffffff'};}

function computeStats() {
  const data=MOVIES_DATA,types=[...new Set(data.map(r=>r.type).filter(Boolean))].sort();
  const totalTitles=data.length,totalMovies=data.filter(r=>r.type==='Movie').length,totalSeries=data.filter(r=>r.type!=='Movie').length;
  const totalEpisodes=data.reduce((s,r)=>s+(parseInt(r.episodes)||0),0);
  const totalMins=data.reduce((s,r)=>{const rt=parseInt(r.runtime)||0,ep=parseInt(r.episodes)||1;return s+rt*(r.type!=='Movie'?ep:1);},0);
  const withRating=data.filter(r=>r.vrRating);
  const avgRating=withRating.length?(withRating.reduce((s,r)=>s+parseFloat(r.vrRating),0)/withRating.length).toFixed(1):'—';
  const typeCounts={},genreCounts={},streamCounts={},bingeMins={},yearTypes={},ratingBuckets={},langCounts={},langByType={};
  for(let i=1;i<=10;i++) ratingBuckets[i]={};
  data.forEach(r=>{
    if(r.type){typeCounts[r.type]=(typeCounts[r.type]||0)+1;bingeMins[r.type]=(bingeMins[r.type]||0)+(parseInt(r.runtime)||0)*(r.type!=='Movie'?(parseInt(r.episodes)||1):1);}
    r.genres.split(',').map(g=>g.trim()).filter(Boolean).forEach(g=>{genreCounts[g]=(genreCounts[g]||0)+1;});
    [r.streaming1,r.streaming2,r.streaming3].filter(Boolean).forEach(s=>{streamCounts[s]=(streamCounts[s]||0)+1;});
    if(r.year){if(!yearTypes[r.year])yearTypes[r.year]={};yearTypes[r.year][r.type]=(yearTypes[r.year][r.type]||0)+1;}
    const vr=Math.round(parseFloat(r.vrRating));if(vr>=1&&vr<=10){if(!ratingBuckets[vr])ratingBuckets[vr]={};ratingBuckets[vr][r.type]=(ratingBuckets[vr][r.type]||0)+1;}
    r.languages.split(',').map(l=>l.trim()).filter(Boolean).forEach(l=>{langCounts[l]=(langCounts[l]||0)+1;if(!langByType[l])langByType[l]={};langByType[l][r.type]=(langByType[l][r.type]||0)+1;});
  });
  const seriesEp=data.filter(r=>r.type!=='Movie'&&r.episodes).map(r=>({title:r.title,ep:parseInt(r.episodes)||0})).sort((a,b)=>b.ep-a.ep).slice(0,15);
  const years=Object.keys(yearTypes).sort();
  const topLangs=topN(langCounts,12).map(([l])=>l);
  return{kpis:{totalTitles,totalMovies,totalSeries,totalEpisodes,totalHrs:Math.round(totalMins/60),avgRating},
    types,typeCounts,genreCounts,streamCounts,bingeMins,seriesEp,years,yearTypes,ratingBuckets,topLangs,langByType};
}

function renderStats() {
  const S=computeStats(),d=chartDefaults(),tc=typeColorMap(S.types);
  Chart.defaults.color=d.textColor;Chart.defaults.font.family="'DM Sans', sans-serif";Chart.defaults.font.size=11;
  document.getElementById('kpiRow').innerHTML=`
    <div class="kpi-card"><div class="kpi-value">${S.kpis.totalTitles.toLocaleString()}</div><div class="kpi-label">Total Titles</div></div>
    <div class="kpi-card"><div class="kpi-value blue">${S.kpis.totalMovies.toLocaleString()}</div><div class="kpi-label">Movies</div></div>
    <div class="kpi-card"><div class="kpi-value green">${S.kpis.totalSeries.toLocaleString()}</div><div class="kpi-label">Series</div></div>
    <div class="kpi-card"><div class="kpi-value purple">${S.kpis.totalEpisodes.toLocaleString()}</div><div class="kpi-label">Episodes</div></div>
    <div class="kpi-card"><div class="kpi-value red">${S.kpis.totalHrs.toLocaleString()}</div><div class="kpi-label">Hours Binged</div></div>
    <div class="kpi-card"><div class="kpi-value">${S.kpis.avgRating}</div><div class="kpi-label">Avg VR Rating</div></div>`;
  const mkHBar=(id,labels,data,color,opts={})=>{destroyChart(id);chartInstances[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:[{data,backgroundColor:color,borderRadius:5,borderWidth:0}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:d.gridColor},ticks:{color:d.mutedColor,...(opts.xTick||{})}},y:{grid:{display:false},ticks:{color:d.textColor,font:{size:10}}}}}});};
  const mkDonut=(id,labels,data,bgs,borders)=>{destroyChart(id);chartInstances[id]=new Chart(document.getElementById(id),{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:bgs||chartColors(labels.length),borderColor:borders,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:d.textColor,boxWidth:12,padding:8}}}}});};
  const mkStacked=(id,labels,types,dataFn,opts={})=>{destroyChart(id);chartInstances[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:types.map(t=>({label:t,data:dataFn(t),backgroundColor:tc[t]+'cc',borderColor:tc[t],borderWidth:1,borderRadius:3}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:d.textColor,boxWidth:12,padding:10}}},scales:{x:{stacked:true,grid:{color:d.gridColor},ticks:{color:d.mutedColor,...(opts.xTick||{})}},y:{stacked:true,grid:{color:d.gridColor},ticks:{color:d.mutedColor}}}}});};
  const mkStackedH=(id,labels,types,dataFn)=>{destroyChart(id);chartInstances[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:types.map(t=>({label:t,data:dataFn(t),backgroundColor:tc[t]+'cc',borderColor:tc[t],borderWidth:1,borderRadius:3}))},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:d.textColor,boxWidth:12,padding:10}}},scales:{x:{stacked:true,grid:{color:d.gridColor},ticks:{color:d.mutedColor}},y:{stacked:true,grid:{display:false},ticks:{color:d.textColor}}}}});};

  mkDonut('chartType',Object.keys(S.typeCounts),Object.values(S.typeCounts));
  const bKeys=Object.keys(S.bingeMins),bHrs=bKeys.map(k=>+(S.bingeMins[k]/60).toFixed(1));
  mkHBar('chartBinge',bKeys,bHrs,chartColors(bKeys.length),{xTick:{callback:v=>v+'h'}});
  const tg=topN(S.genreCounts,15);mkHBar('chartGenre',tg.map(([g])=>g),tg.map(([,c])=>c),chartColors(tg.length));
  const ts=topN(S.streamCounts,10);mkDonut('chartStream',ts.map(([s])=>s),ts.map(([,c])=>c),ts.map(([s])=>platformColor(s)+'cc'),ts.map(([s])=>platformColor(s)));
  mkHBar('chartEpisodes',S.seriesEp.map(s=>s.title.length>22?s.title.slice(0,20)+'…':s.title),S.seriesEp.map(s=>s.ep),'#4be8b8cc');
  mkStacked('chartYear',S.years,S.types,t=>S.years.map(y=>(S.yearTypes[y]&&S.yearTypes[y][t])||0),{xTick:{maxRotation:45,maxTicksLimit:20}});
  destroyChart('chartRating');chartInstances['chartRating']=new Chart(document.getElementById('chartRating'),{type:'bar',data:{labels:['1','2','3','4','5','6','7','8','9','10'],datasets:S.types.map(t=>({label:t,data:[1,2,3,4,5,6,7,8,9,10].map(r=>(S.ratingBuckets[r]&&S.ratingBuckets[r][t])||0),backgroundColor:tc[t]+'bb',borderColor:tc[t],borderWidth:1,borderRadius:4}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:d.textColor,boxWidth:12,padding:10}}},scales:{x:{grid:{color:d.gridColor},ticks:{color:d.textColor}},y:{grid:{color:d.gridColor},ticks:{color:d.mutedColor}}}}});
  mkStackedH('chartLang',S.topLangs,S.types,t=>S.topLangs.map(l=>(S.langByType[l]&&S.langByType[l][t])||0));
}

// ================================================================
//  TIMELINE
// ================================================================
function renderTimeline() {
  const container = document.getElementById('timelineContent');
  const dateCounts={};
  MOVIES_DATA.forEach(r=>{const nd=normDate(r.dateRated);if(nd)dateCounts[nd]=(dateCounts[nd]||0)+1;});
  const bulkDate=Object.entries(dateCounts).sort((a,b)=>b[1]-a[1])[0];
  const bulkDateStr=(bulkDate&&bulkDate[1]>=10)?bulkDate[0]:null;
  const pre=MOVIES_DATA.filter(r=>!normDate(r.dateRated)||normDate(r.dateRated)===bulkDateStr);
  const real=MOVIES_DATA.filter(r=>r.dateRated&&normDate(r.dateRated)!==bulkDateStr)
    .sort((a,b)=>new Date(normDate(b.dateRated))-new Date(normDate(a.dateRated)));
  const grouped={};
  real.forEach(r=>{
    const nd=normDate(r.dateRated);const d=new Date(nd);if(isNaN(d))return;
    const y=d.getFullYear(),m=d.getMonth();
    if(!grouped[y])grouped[y]={};if(!grouped[y][m])grouped[y][m]=[];
    grouped[y][m].push(r);
  });
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let html='';
  if(pre.length) html+=`<div class="timeline-pre2020"><div class="timeline-pre2020-icon">📼</div><div class="timeline-pre2020-text"><h3>Pre-tracking Collection — ${pre.length} titles</h3><p>Watched before your IMDb tracking started.</p></div></div>`;
  Object.keys(grouped).sort((a,b)=>b-a).forEach(year=>{
    html+=`<div class="timeline-year-group"><div class="timeline-year-label">${year} · ${Object.values(grouped[year]).flat().length} titles</div><div class="timeline-months">`;
    Object.keys(grouped[year]).sort((a,b)=>b-a).forEach(m=>{
      const items=grouped[year][m];
      html+=`<div class="timeline-month"><div class="timeline-month-label">${MONTHS[m]}</div><div class="timeline-month-items">
        ${items.map(r=>`<div class="timeline-chip" data-const="${escHtml(r.const||'')}">
          <span>${escHtml(r.title.length>30?r.title.slice(0,28)+'…':r.title)}</span>
          ${r.vrRating?`<span class="timeline-chip-rating">★${r.vrRating}</span>`:''}
          ${r.type!=='Movie'?`<span class="timeline-chip-type">${r.type.replace('TV ','')}</span>`:''}
        </div>`).join('')}
      </div></div>`;
    });
    html+=`</div></div>`;
  });
  container.innerHTML=html;
  container.addEventListener('click',e=>{
    const chip=e.target.closest('.timeline-chip');if(!chip)return;
    const item=MOVIES_DATA.find(r=>r.const===chip.dataset.const);
    if(item){document.getElementById('timelineOverlay').style.display='none';openModal(item);}
  });
}

// ================================================================
//  BINGE CALENDAR
// ================================================================
function renderCalendar() {
  const container=document.getElementById('calendarContent');
  const dateCounts={};
  MOVIES_DATA.forEach(r=>{const nd=normDate(r.dateRated);if(nd)dateCounts[nd]=(dateCounts[nd]||0)+1;});
  const sorted=Object.entries(dateCounts).sort((a,b)=>b[1]-a[1]);
  const bulkDate=sorted.length&&sorted[0][1]>=10?sorted[0][0]:null;
  const realDates={};
  Object.entries(dateCounts).forEach(([d,c])=>{if(d!==bulkDate)realDates[d]=c;});
  if(!Object.keys(realDates).length){container.innerHTML='<div style="color:var(--muted);padding:24px;">No date data available.</div>';return;}
  const allYears=[...new Set(Object.keys(realDates).map(d=>new Date(d).getFullYear()))].filter(y=>!isNaN(y)).sort((a,b)=>b-a);
  const preCount=bulkDate?(dateCounts[bulkDate]||0):0;
  let html='';
  if(preCount) html+=`<div class="cal-note">📼 <span>${preCount} titles from pre-tracking era (${bulkDate}) excluded.</span></div>`;
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  allYears.forEach(year=>{
    html+=`<div class="cal-year-section"><div class="cal-year-label">${year}</div>`;
    const jan1=new Date(year,0,1),dec31=new Date(year,11,31);
    const startDow=jan1.getDay(),totalDays=Math.round((dec31-jan1)/86400000)+1;
    const numCols=Math.ceil((startDow+totalDays)/7);
    const monthCols={};
    for(let mo=0;mo<12;mo++){const d=new Date(year,mo,1);const col=Math.floor((startDow+Math.round((d-jan1)/86400000))/7);if(!monthCols[col])monthCols[col]=MONTHS[mo];}
    let monthRow=`<div class="cal-month-labels" style="grid-template-columns:repeat(${numCols},14px)">`;
    for(let c=0;c<numCols;c++) monthRow+=`<div class="cal-month-lbl">${monthCols[c]||''}</div>`;
    monthRow+='</div>';
    let gridHtml=`<div class="cal-grid" style="grid-template-columns:repeat(${numCols},14px);">`;
    for(let c=0;c<numCols;c++){for(let r=0;r<7;r++){
      const dayIndex=c*7+r-startDow;
      if(dayIndex<0||dayIndex>=totalDays){gridHtml+=`<div class="cal-cell"></div>`;continue;}
      const d=new Date(year,0,1+dayIndex);
      const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const count=realDates[dateStr]||0;
      const level=count===0?0:count===1?1:count<=2?2:count<=3?3:count<=5?4:5;
      gridHtml+=`<div class="cal-cell ${level>0?`level-${level} has-data`:''}" title="${dateStr}${count>0?`: ${count} title${count>1?'s':''}`  :''}" data-date="${dateStr}" data-count="${count}"></div>`;
    }}
    gridHtml+='</div>';
    html+=monthRow+`<div class="cal-grid-wrap">${gridHtml}</div>`;
    html+=`<div class="cal-legend"><span>Less</span>${[0,1,2,3,4,5].map(l=>`<div class="cal-legend-cell ${l>0?'level-'+l:''}" style="${l===0?'background:var(--surface2)':''}"></div>`).join('')}<span>More</span></div></div>`;
  });
  container.innerHTML=html;
  container.addEventListener('click',e=>{
    const cell=e.target.closest('.cal-cell.has-data');if(!cell)return;
    openCalDayModal(cell.dataset.date);
  });
}

function openCalDayModal(dateStr) {
  const titles=MOVIES_DATA.filter(r=>normDate(r.dateRated)===dateStr);
  if(!titles.length)return;
  const d=new Date(dateStr);
  const dayLabel=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const items=titles.map(r=>`
    <div class="cal-day-item" data-const="${r.const||''}">
      ${r.poster?`<img class="cal-day-poster" src="${r.poster}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cal-day-poster-ph',textContent:'🎬'}))">`:`<div class="cal-day-poster-ph">🎬</div>`}
      <div class="cal-day-info">
        <div class="cal-day-title">${escHtml(r.title)}</div>
        <div class="cal-day-meta">${r.year||''}${r.type&&r.type!=='Movie'?` · ${r.type.replace('TV ','')}`:''} ${r.vrRating?`<span class="cal-day-rating">★ ${r.vrRating}</span>`:''}</div>
      </div>
      <div class="cal-day-arrow">›</div>
    </div>`).join('');
  const overlay=document.createElement('div');
  overlay.className='cal-day-overlay';overlay.id='calDayOverlay';
  overlay.innerHTML=`<div class="cal-day-box">
    <div class="cal-day-header">
      <div><div class="cal-day-date">${dayLabel}</div><div class="cal-day-count">${titles.length} title${titles.length>1?'s':''} watched</div></div>
      <button class="cal-day-close" id="calDayClose">✕</button>
    </div>
    <div class="cal-day-list">${items}</div>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('calDayClose').addEventListener('click',closeCalDayModal);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeCalDayModal();});
  overlay.querySelectorAll('.cal-day-item').forEach(item=>{
    item.addEventListener('click',()=>{
      const movie=MOVIES_DATA.find(r=>r.const===item.dataset.const);
      if(movie){closeCalDayModal();document.getElementById('calendarOverlay').style.display='none';openModal(movie);}
    });
  });
}

function closeCalDayModal() { const el=document.getElementById('calDayOverlay');if(el)el.remove(); }
