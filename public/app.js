// ===== CONFIG =====
const USERS = {
  Thunder: { img: '/animals/capybara.jpg',  class: 'thunder', label: 'Thunder' },
  BF:      { img: '/animals/chihuahua.jpg', class: 'bf',      label: 'BF' }
};

const ANIMAL_IMGS = [
  '/animals/capybara.jpg',
  '/animals/chihuahua.jpg',
  '/animals/monkey.jpg',
  '/animals/piglet.jpg'
];

function animalBg() {
  const all = [...ANIMAL_IMGS, ...ANIMAL_IMGS];
  return `<div class="animal-bg">${all.map(src => `<span class="animal-float"><img src="${src}" alt=""></span>`).join('')}</div>`;
}

// ===== STATE =====
let currentUser = null;
let calMonth = new Date();
let lightboxItems = [];
let lightboxIndex = 0;

// ===== API =====
async function api(method, path, body = null) {
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method,
    headers: isForm ? {} : (body ? { 'Content-Type': 'application/json' } : {}),
    body: isForm ? body : (body ? JSON.stringify(body) : null)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(err);
  }
  return res.json();
}

// ===== ROUTER =====
function navigate(view, param = '') {
  location.hash = param ? `#${view}/${param}` : `#${view}`;
}

async function renderRoute() {
  const hash = location.hash || '#login';
  const parts = hash.slice(1).split('/');
  const view = parts[0];
  const param = parts[1];

  if (!currentUser && view !== 'login') {
    renderLogin();
    return;
  }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">Loading...</div>';

  try {
    switch (view) {
      case 'calendar': await renderCalendar(); break;
      case 'day':      await renderDay(param); break;
      case 'gallery':  await renderGallery(); break;
      default:         currentUser ? await renderCalendar() : renderLogin(); break;
    }
  } catch (e) {
    app.innerHTML = `<div class="loading">Something went wrong: ${e.message}</div>`;
  }
}

// ===== LOGIN =====
function renderLogin() {
  document.getElementById('app').innerHTML = `
    ${animalBg()}
    <div class="login-page">
      <div class="login-animals">
        ${ANIMAL_IMGS.map(src => `<img src="${src}" class="login-animal-img" alt="">`).join('')}
      </div>
      <div class="login-title">Us Memory</div>
      <div class="login-sub">💕 Who are you?</div>
      <div class="login-cards">
        ${Object.entries(USERS).map(([name, u]) => `
          <div class="login-card ${u.class}" onclick="login('${name}')">
            <img src="${u.img}" class="login-card-img" alt="${u.label}">
            <span class="login-card-name">${u.label}</span>
          </div>
        `).join('')}
      </div>
      <div class="login-bottom-animals">
        ${ANIMAL_IMGS.map(src => `<img src="${src}" class="login-bottom-img" alt="">`).join('')}
      </div>
    </div>
  `;
}

async function login(user) {
  await api('POST', '/api/login', { user });
  currentUser = user;
  navigate('calendar');
}

async function logout() {
  await api('POST', '/api/logout');
  currentUser = null;
  navigate('login');
}

// ===== TOPBAR =====
function topbar(active = '') {
  const u = USERS[currentUser];
  return `
    <div class="topbar">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="topbar-title">💕 Us Memory</div>
        <div class="topbar-animals">
          ${ANIMAL_IMGS.map(src => `<img src="${src}" class="topbar-animal-img" alt="">`).join('')}
        </div>
      </div>
      <div class="topbar-right">
        <button class="btn btn-ghost btn-sm" onclick="navigate('${active === 'gallery' ? 'calendar' : 'gallery'}')">
          ${active === 'gallery' ? '📅 Calendar' : '🖼️ Us Gallery'}
        </button>
        <div class="user-badge ${u.class}"><img src="${u.img}" class="badge-img" alt="${u.label}"> ${u.label}</div>
        <button class="btn btn-ghost btn-sm" onclick="logout()">Leave</button>
      </div>
    </div>
  `;
}

// ===== CALENDAR =====
async function renderCalendar() {
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth() + 1;
  const summary = await api('GET', `/api/calendar/${year}/${month}`);

  const noteAuthorsMap = {};
  summary.noteEntries.forEach(n => {
    if (!noteAuthorsMap[n.date]) noteAuthorsMap[n.date] = new Set();
    noteAuthorsMap[n.date].add(n.author);
  });

  const mediaCountMap = {};
  summary.mediaCounts.forEach(m => {
    if (!mediaCountMap[m.date]) mediaCountMap[m.date] = {};
    mediaCountMap[m.date][m.author] = m.count;
  });

  const ratingMap = {};
  summary.ratings.forEach(r => {
    if (!ratingMap[r.date]) ratingMap[r.date] = {};
    ratingMap[r.date][r.author] = r.rating;
  });

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayStr = toDateStr(today);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const noteAuthors = noteAuthorsMap[dateStr] || new Set();
    const counts = mediaCountMap[dateStr] || {};
    const ratings = ratingMap[dateStr] || {};

    const anyActivity = !isFuture && (noteAuthors.has('Thunder') || noteAuthors.has('BF') || counts.Thunder || counts.BF);
    const activityBlock = anyActivity ? `
      <div class="cal-act-header"><span>📝</span><span>📷</span></div>
      <div class="cal-act-row thunder"><span>${noteAuthors.has('Thunder') ? '✓' : '-'}</span><span>${counts.Thunder || '-'}</span></div>
      <div class="cal-act-row bf"><span>${noteAuthors.has('BF') ? '✓' : '-'}</span><span>${counts.BF || '-'}</span></div>
    ` : '';

    const avg = (ratings.Thunder && ratings.BF) ? (ratings.Thunder + ratings.BF) / 2 : null;
    const scoreRow = avg !== null
      ? `<div class="cal-score">♥ ${Number.isInteger(avg) ? avg : avg.toFixed(1)}</div>`
      : '';

    cells += `
      <div class="cal-day${isToday ? ' today' : ''}${isFuture ? ' future' : ''}" onclick="navigate('day','${dateStr}')">
        <div class="cal-day-num">${d}</div>
        ${activityBlock}${scoreRow}
      </div>
    `;
  }

  document.getElementById('app').innerHTML = `
    ${animalBg()}
    ${topbar('calendar')}
    <div class="calendar-page" style="position:relative;z-index:1">
      <div class="calendar-nav">
        <button class="btn btn-ghost btn-sm" onclick="shiftMonth(-1)">‹ Prev</button>
        <div class="calendar-month">${monthNames[month - 1]} ${year}</div>
        <button class="btn btn-ghost btn-sm" onclick="shiftMonth(1)">Next ›</button>
      </div>
      <div class="calendar-grid">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-header">${d}</div>`).join('')}
        ${cells}
      </div>
    </div>
  `;
}

function shiftMonth(dir) {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + dir, 1);
  renderCalendar();
}

// ===== DAY PAGE =====
async function renderDay(dateStr) {
  if (!dateStr) { navigate('calendar'); return; }

  const [notes, ratings, media] = await Promise.all([
    api('GET', `/api/notes/${dateStr}`),
    api('GET', `/api/ratings/${dateStr}`),
    api('GET', `/api/media/${dateStr}`)
  ]);

  const noteMap = {};
  notes.forEach(n => noteMap[n.author] = n.content);
  const ratingMap = {};
  ratings.forEach(r => ratingMap[r.author] = r.rating);

  const dateLabel = formatDateLabel(dateStr);
  const isOwn = (author) => author === currentUser;

  document.getElementById('app').innerHTML = `
    ${animalBg()}
    ${topbar('calendar')}
    <div class="day-page" style="position:relative;z-index:1">
      <div class="day-header">
        <button class="btn btn-ghost btn-sm" onclick="navigate('calendar')">← Back</button>
        <div>
          <div class="day-title">📖 ${dateLabel}</div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-title">📝 Journal</div>
        ${Object.entries(USERS).map(([name, u]) => `
          <div class="note-block" id="note-block-${name}">
            <div class="note-author ${u.class}"><img src="${u.img}" class="author-img" alt="${u.label}"> ${u.label}</div>
            ${isOwn(name) ? `
              <textarea
                class="note-textarea ${u.class}"
                id="note-textarea-${name}"
                placeholder="Write something about today..."
                oninput="onNoteInput('${name}')"
              >${noteMap[name] || ''}</textarea>
              <div class="note-actions">
                <span class="note-saved" id="note-saved-${name}">Saved ✓</span>
                <button class="btn btn-primary btn-sm" onclick="saveNote('${name}','${dateStr}')">Save</button>
              </div>
            ` : `
              <textarea
                class="note-textarea"
                readonly
                placeholder="${name} hasn't written anything yet..."
              >${noteMap[name] || ''}</textarea>
            `}
          </div>
        `).join('<hr style="border:none;border-top:1.5px solid var(--border);margin:16px 0">')}
      </div>

      <div class="section-card">
        <div class="section-title">♥ How was today?</div>
        <div class="ratings-row">
          ${Object.entries(USERS).map(([name, u]) => `
            <div class="rating-block">
              <div class="rating-label ${u.class}"><img src="${u.img}" class="author-img" alt="${u.label}"> ${u.label}</div>
              <div class="hearts-row" id="hearts-${name}">
                ${renderHearts(ratingMap[name] || 0, name === currentUser, name, dateStr)}
              </div>
            </div>
          `).join('')}
        </div>
        ${(() => {
          const scores = Object.values(ratingMap).filter(r => r > 0);
          if (!scores.length) return '';
          const avg = scores.reduce((a, b) => a + b, 0) / 2;
          const display = Number.isInteger(avg) ? avg : avg.toFixed(1);
          return `<div class="total-score">
            <span class="total-score-label">Today's Score</span>
            <span class="total-score-value">${display} / 10 ♥</span>
          </div>`;
        })()}
      </div>

      <div class="section-card">
        <div class="section-title">📸 Photos & Videos</div>
        <label class="media-upload-area" id="upload-area-${dateStr}">
          <input type="file" accept="image/*,video/*" multiple onchange="uploadMedia(this,'${dateStr}')">
          <div>📤 Click to upload photos or videos</div>
          <div style="font-size:0.8rem;margin-top:6px">Images & videos up to 500MB</div>
        </label>
        <div id="upload-status-day" class="upload-status" style="display:none"></div>
        <div class="media-grid" id="media-grid-day">
          ${renderMediaItems(media, true)}
        </div>
      </div>
    </div>
  `;

  lightboxItems = media;
  fixVideoThumbnails();
}

function renderHearts(rating, editable, author, dateStr) {
  let html = '';
  for (let i = 1; i <= 10; i++) {
    const filled = i <= rating;
    if (editable) {
      html += `<span class="heart" onclick="rateDay('${author}','${dateStr}',${i})" onmouseover="previewHearts('${author}',${i})" onmouseout="resetHearts('${author}','${dateStr}',${rating})">${filled ? '♥' : '♡'}</span>`;
    } else {
      html += `<span class="heart readonly">${filled ? '♥' : '♡'}</span>`;
    }
  }
  return html;
}

function previewHearts(author, n) {
  const row = document.getElementById(`hearts-${author}`);
  if (!row) return;
  row.querySelectorAll('.heart').forEach((h, i) => h.textContent = i < n ? '♥' : '♡');
}

function resetHearts(author, dateStr, current) {
  const row = document.getElementById(`hearts-${author}`);
  if (!row) return;
  row.querySelectorAll('.heart').forEach((h, i) => h.textContent = i < current ? '♥' : '♡');
}

async function rateDay(author, dateStr, rating) {
  await api('POST', '/api/ratings', { date: dateStr, rating });
  const row = document.getElementById(`hearts-${author}`);
  if (row) row.innerHTML = renderHearts(rating, true, author, dateStr);
}

let noteTimers = {};
function onNoteInput(author) {
  clearTimeout(noteTimers[author]);
  noteTimers[author] = setTimeout(() => autoSaveNote(author), 1500);
}

async function autoSaveNote(author) {
  const ta = document.getElementById(`note-textarea-${author}`);
  if (!ta) return;
  const dateStr = location.hash.split('/')[1];
  if (!dateStr) return;
  await api('POST', '/api/notes', { date: dateStr, content: ta.value });
  const saved = document.getElementById(`note-saved-${author}`);
  if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 2000); }
}

async function saveNote(author, dateStr) {
  const ta = document.getElementById(`note-textarea-${author}`);
  if (!ta) return;
  await api('POST', '/api/notes', { date: dateStr, content: ta.value });
  const saved = document.getElementById(`note-saved-${author}`);
  if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 2000); }
}

function uploadWithProgress(form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media');
    xhr.withCredentials = true;
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(xhr.responseText || xhr.statusText));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(form);
  });
}

async function uploadMedia(input, dateStr) {
  if (!input.files.length) return;
  const statusId = dateStr ? 'upload-status-day' : 'upload-status-gallery';
  const count = input.files.length;
  const label = `Uploading ${count} file${count > 1 ? 's' : ''}`;
  showUploadProgress(statusId, 0, label);

  try {
    const form = new FormData();
    form.append('date', dateStr || toDateStr(new Date()));
    for (const f of input.files) form.append('files', f);
    await uploadWithProgress(form, pct => showUploadProgress(statusId, pct, label));

    if (dateStr) {
      const media = await api('GET', `/api/media/${dateStr}`);
      const grid = document.getElementById('media-grid-day');
      if (grid) { grid.innerHTML = renderMediaItems(media, true); lightboxItems = media; fixVideoThumbnails(); }
      showUploadStatus(statusId, 'success', `✓ ${count} file${count > 1 ? 's' : ''} uploaded successfully!`);
    } else {
      showUploadStatus(statusId, 'success', `✓ ${count} file${count > 1 ? 's' : ''} uploaded successfully!`);
      setTimeout(() => renderGallery(), 1500);
    }
  } catch (e) {
    showUploadStatus(statusId, 'error', `✗ Upload failed: ${e.message}`);
  }
  input.value = '';
}

async function deleteMedia(id, dateStr) {
  const ok = await showConfirm('Delete this photo/video?<br><span style="font-size:0.88em;color:#9b7e8a">It will be removed from the calendar too. This cannot be undone.</span>');
  if (!ok) return;
  await api('DELETE', `/api/media/${id}`);
  if (dateStr) {
    const media = await api('GET', `/api/media/${dateStr}`);
    const grid = document.getElementById('media-grid-day');
    if (grid) { grid.innerHTML = renderMediaItems(media, true); lightboxItems = media; }
  } else {
    await renderGallery();
  }
}

function renderMediaItems(mediaList, withDelete = false) {
  if (!mediaList.length) return '';
  return mediaList.map((m, i) => {
    const isVideo = m.mimetype.startsWith('video/');
    const u = USERS[m.author] || { img: '/animals/capybara.jpg', label: m.author, class: '' };
    const dateStr = m.date || '';
    const deleteBtn = withDelete
      ? `<button class="media-delete" onclick="event.stopPropagation();deleteMedia(${m.id},'${dateStr}')" title="Delete">✕</button>`
      : '';
    const thumb = isVideo
      ? `<video src="/uploads/${m.filename}" muted preload="metadata" onerror="this.closest('.media-item').classList.add('media-broken')"></video><span class="video-play-icon">▶</span>`
      : `<img src="/uploads/${m.filename}" alt="${m.original_name}" loading="lazy" onerror="this.closest('.media-item').classList.add('media-broken')">`;
    return `
      <div class="media-item" onclick="openLightbox(${i})">
        ${thumb}
        ${deleteBtn}
        <div class="media-author-tag ${u.class}">${u.label}</div>
      </div>
    `;
  }).join('');
}

// ===== GALLERY =====
async function renderGallery() {
  const media = await api('GET', '/api/gallery');
  lightboxItems = media;

  document.getElementById('app').innerHTML = `
    ${animalBg()}
    ${topbar('gallery')}
    <div class="gallery-page" style="position:relative;z-index:1">
      <div class="gallery-title">🖼️ Us Gallery</div>
      <div class="gallery-sub">All our photos and videos in one place 💕</div>
      <div class="gallery-toolbar">
        <span style="color:var(--text-light);font-weight:700;font-size:0.9rem">${media.length} item${media.length !== 1 ? 's' : ''}</span>
        <label style="cursor:pointer">
          <input type="file" accept="image/*,video/*" multiple style="display:none" onchange="uploadMedia(this,null)">
          <span class="btn btn-primary">📤 Upload to Gallery</span>
        </label>
      </div>
      <div id="upload-status-gallery" class="upload-status" style="display:none"></div>
      ${media.length === 0 ? `
        <div class="empty-state">
          <div class="empty-emoji">📷</div>
          <p>No photos or videos yet — upload your first memory!</p>
        </div>
      ` : `
        <div class="gallery-grid">
          ${media.map((m, i) => {
            const isVideo = m.mimetype.startsWith('video/');
            const u = USERS[m.author] || { img: '/animals/capybara.jpg', label: m.author, class: '' };
            const dateFmt = m.date ? formatDateLabel(m.date) : formatDateTime(m.created_at);
            return `
              <div class="gallery-item" onclick="openLightbox(${i})">
                <button class="media-delete" onclick="event.stopPropagation();deleteMedia(${m.id},null)" title="Delete">✕</button>
                ${isVideo
                  ? `<video src="/uploads/${m.filename}" muted preload="metadata" onerror="this.closest('.gallery-item').classList.add('media-broken')"></video><span class="video-play-icon">▶</span>`
                  : `<img src="/uploads/${m.filename}" alt="${m.original_name}" loading="lazy" onerror="this.closest('.gallery-item').classList.add('media-broken')">`}
                <div class="gallery-item-meta">${u.label} · ${dateFmt}</div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
  fixVideoThumbnails();
}

// ===== LIGHTBOX =====
function openLightbox(index) {
  lightboxIndex = index;
  showLightboxItem();
  document.getElementById('lightbox').classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightbox-content').innerHTML = '';
}

function lightboxNav(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxItems.length) % lightboxItems.length;
  showLightboxItem();
}

function lightboxError(type) {
  const m = lightboxItems[lightboxIndex];
  const icon = type === 'video' ? '🎬' : '📷';
  const msg = type === 'video' ? 'Cannot play this video' : 'Cannot display this image';
  document.getElementById('lightbox-content').innerHTML = `
    <div class="lightbox-error">
      <div style="font-size:2.5rem">${icon}</div>
      <div style="font-weight:700;margin-top:8px">${msg}</div>
      <div style="font-size:0.8rem;opacity:0.65;margin-top:4px">${m ? m.original_name : ''}</div>
      ${m ? `<a href="/uploads/${m.filename}" download="${m.original_name}" class="btn btn-primary" style="margin-top:16px;text-decoration:none">⬇ Download</a>` : ''}
    </div>
  `;
}

function showLightboxItem() {
  const m = lightboxItems[lightboxIndex];
  if (!m) return;
  const isVideo = m.mimetype.startsWith('video/');
  document.getElementById('lightbox-content').innerHTML = isVideo
    ? `<video src="/uploads/${m.filename}" controls autoplay style="max-width:90vw;max-height:88vh;border-radius:12px" onerror="lightboxError('video')"></video>`
    : `<img src="/uploads/${m.filename}" alt="${m.original_name}" style="max-width:90vw;max-height:88vh;border-radius:12px;object-fit:contain" onerror="lightboxError('image')">`;
}

function fixVideoThumbnails() {
  document.querySelectorAll('.media-item video, .gallery-item video').forEach(v => {
    if (v.readyState >= 1) {
      v.currentTime = 0.1;
    } else {
      v.addEventListener('loadedmetadata', () => { v.currentTime = 0.1; }, { once: true });
    }
  });
}

document.addEventListener('keydown', e => {
  if (document.getElementById('lightbox').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') lightboxNav(1);
  if (e.key === 'ArrowLeft') lightboxNav(-1);
  if (e.key === 'Escape') closeLightbox();
});

document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
});

// ===== HELPERS =====
function showConfirm(message) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').innerHTML = message;
    modal.style.display = 'flex';
    document.getElementById('confirm-yes').onclick = () => { modal.style.display = 'none'; resolve(true); };
    document.getElementById('confirm-no').onclick  = () => { modal.style.display = 'none'; resolve(false); };
  });
}

function showUploadProgress(id, percent, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'upload-status uploading';
  el.style.display = 'block';
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span>${label}</span><span style="font-weight:900">${percent}%</span>
    </div>
    <div class="upload-progress-bar"><div class="upload-progress-fill" style="width:${percent}%"></div></div>
  `;
}

function showUploadStatus(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `upload-status ${type}`;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => { if (el) el.style.display = 'none'; }, 3000);
}

function formatDateTime(isoStr) {
  if (!isoStr) return 'Gallery upload';
  const d = new Date(isoStr.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
         ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ===== INIT =====
window.addEventListener('hashchange', renderRoute);

(async () => {
  const me = await api('GET', '/api/me').catch(() => ({ user: null }));
  currentUser = me.user;
  renderRoute();
})();
