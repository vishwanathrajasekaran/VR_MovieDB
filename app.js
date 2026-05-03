// ===== STATE =====
let filtered = [];
let currentView = 'grid';
const PAGE_SIZE = 60;
let page = 0;
let isLoading = false;

// ===== DOM =====
const gallery = document.getElementById('gallery');
const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const genreFilter = document.getElementById('genreFilter');
const langFilter = document.getElementById('langFilter');
const yearFilter = document.getElementById('yearFilter');
const streamingFilter = document.getElementById('streamingFilter');
const ratingFilter = document.getElementById('ratingFilter');
const clearBtn = document.getElementById('clearBtn');
const resultCount = document.getElementById('resultCount');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const headerStats = document.getElementById('headerStats');

// ===== INIT FILTERS =====
function initFilters() {
  const types = [...new Set(MOVIES_DATA.map(r => r.type).filter(Boolean))].sort();
  const genres = [...new Set(MOVIES_DATA.flatMap(r => r.genres.split(',').map(g => g.trim())))].filter(Boolean).sort();
  const langs = [...new Set(MOVIES_DATA.flatMap(r => r.languages.split(',').map(l => l.trim())))].filter(Boolean).sort();
  const years = [...new Set(MOVIES_DATA.map(r => r.year).filter(Boolean))].sort((a,b) => b-a);
  const platforms = [...new Set(MOVIES_DATA.flatMap(r => [r.streaming1, r.streaming2, r.streaming3]).filter(Boolean))].sort();

  types.forEach(t => typeFilter.add(new Option(t, t)));
  genres.forEach(g => genreFilter.add(new Option(g, g)));
  langs.forEach(l => langFilter.add(new Option(l, l)));
  years.forEach(y => yearFilter.add(new Option(y, y)));
  platforms.forEach(p => streamingFilter.add(new Option(p, p)));

  const movies = MOVIES_DATA.filter(r => r.type === 'Movie').length;
  const series = MOVIES_DATA.filter(r => r.type === 'TV Series' || r.type === 'TV Mini Series').length;
  headerStats.textContent = `${MOVIES_DATA.length.toLocaleString()} titles · ${movies} Movies · ${series} Series`;
}

// ===== FILTER LOGIC =====
function applyFilters() {
  const q = searchInput.value.toLowerCase().trim();
  const type = typeFilter.value;
  const genre = genreFilter.value;
  const lang = langFilter.value;
  const year = yearFilter.value;
  const stream = streamingFilter.value;
  const minRating = ratingFilter.value ? parseFloat(ratingFilter.value) : null;

  filtered = MOVIES_DATA.filter(r => {
    if (q && !r.title.toLowerCase().includes(q) &&
        !r.cast.toLowerCase().includes(q) &&
        !r.directors.toLowerCase().includes(q) &&
        !r.originalTitle.toLowerCase().includes(q)) return false;
    if (type && r.type !== type) return false;
    if (genre && !r.genres.includes(genre)) return false;
    if (lang && !r.languages.includes(lang)) return false;
    if (year && r.year !== year) return false;
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

  const isList = currentView === 'list';
  const typeBadge = item.type && item.type !== 'Movie' ? `<span class="card-type-badge">${item.type.replace('TV ', '')}</span>` : '';

  card.innerHTML = `
    ${typeBadge}
    ${item.poster
      ? `<img class="card-poster" src="${item.poster}" alt="${escHtml(item.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-poster-placeholder',textContent:'🎬'}))">`
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
  const streamBadges = [item.streaming1, item.streaming2, item.streaming3]
    .filter(Boolean)
    .map(s => `<span class="badge stream">${s}</span>`).join('');

  const langBadges = item.languages.split(',').filter(l => l.trim())
    .map(l => `<span class="badge lang">${l.trim()}</span>`).join('');

  const genreBadges = item.genres.split(',').filter(g => g.trim())
    .map(g => `<span class="badge genre">${g.trim()}</span>`).join('');

  const details = [
    ['Type', item.type],
    ['Release Date', item.releaseDate],
    ['Certification', item.certification],
    ['Runtime', item.runtime ? item.runtime + ' mins' : null],
    ['Decade', item.decade],
    ['Total Votes', item.totalVotes ? parseInt(item.totalVotes).toLocaleString() : null],
    ['Cast', item.cast],
    ['Directors', item.directors ? [...new Set(item.directors.split(',').map(d => d.trim()))].join(', ') : null],
    ['Writers', item.writers ? [...new Set(item.writers.split(',').map(w => w.trim()))].join(', ') : null],
    ['Vote Category', item.voteCategory],
  ].filter(([,v]) => v).map(([l,v]) => `
    <div class="detail-row">
      <span class="detail-label">${l}</span>
      <span class="detail-value">${escHtml(v)}</span>
    </div>
  `).join('');

  const ratingDiff = parseFloat(item.ratingDiff);
  const diffText = !isNaN(ratingDiff) ? (ratingDiff > 0 ? `+${ratingDiff}` : `${ratingDiff}`) : '';
  const diffColor = ratingDiff > 0 ? '#7ae87a' : ratingDiff < 0 ? '#e87a7a' : '#888';

  modalContent.innerHTML = `
    <div class="modal-top">
      ${item.poster
        ? `<img class="modal-poster" src="${item.poster}" alt="${escHtml(item.title)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'modal-poster-placeholder',textContent:'🎬'}))">`
        : `<div class="modal-poster-placeholder">🎬</div>`}
      <div class="modal-header">
        <div class="modal-title">${escHtml(item.title)}</div>
        ${item.originalTitle && item.originalTitle !== item.title
          ? `<div class="modal-subtitle">${escHtml(item.originalTitle)}</div>` : ''}
        <div class="modal-ratings">
          ${item.vrRating ? `<div class="rating-pill"><span class="val">${item.vrRating}</span><span class="lbl">VR Rating</span></div>` : ''}
          ${item.imdbRating ? `<div class="rating-pill"><span class="val">${item.imdbRating}</span><span class="lbl">IMDb</span></div>` : ''}
          ${diffText ? `<div class="rating-pill"><span class="val" style="color:${diffColor}">${diffText}</span><span class="lbl">Difference</span></div>` : ''}
        </div>
        <div class="modal-badges">
          ${langBadges}
          ${genreBadges}
          ${streamBadges}
        </div>
      </div>
    </div>
    ${item.plot ? `<div class="modal-plot">${escHtml(item.plot)}</div>` : ''}
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
searchInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(applyFilters, 250); });
typeFilter.addEventListener('change', applyFilters);
genreFilter.addEventListener('change', applyFilters);
langFilter.addEventListener('change', applyFilters);
yearFilter.addEventListener('change', applyFilters);
streamingFilter.addEventListener('change', applyFilters);
ratingFilter.addEventListener('change', applyFilters);
clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  [typeFilter, genreFilter, langFilter, yearFilter, streamingFilter, ratingFilter].forEach(s => s.value = '');
  applyFilters();
});
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

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

// ===== START =====
initFilters();
applyFilters();
