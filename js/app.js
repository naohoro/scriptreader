/* ===== JWWA 2026 MC Script Reader ===== */

// ───────────────────────────────────────────────
// i18n
// ───────────────────────────────────────────────
const I18N = {
  ja: {
    allMc:           '全員',
    fontReset:       '標準',
    langSwitch:      'EN',
    themeToggle:     'ライト / ダーク',
    loading:         '読み込み中...',
    loadError:       '読み込みエラー',
    statusDaysBefore:(d) => `${d}日後`,
    statusBefore:    (m) => m >= 60 ? `開始 ${Math.floor(m/60)}時間${m%60}分前` : `開始 ${m}分前`,
    statusOnTime:    '定刻通り',
    statusLate:      (m) => `+${m}分 遅れ`,
    statusWarn:      (m) => `+${m}分`,
    statusRunning:   '進行中',
    statusEnded:     'イベント終了',
    editBtn:         '編集',
    editBtnActive:   '編集中',
    editWarning:     'このページを閉じると原稿はリセットされます',
  },
  en: {
    allMc:           'All',
    fontReset:       'Reset',
    langSwitch:      '日本語',
    themeToggle:     'Light / Dark',
    loading:         'Loading...',
    loadError:       'Load error',
    statusDaysBefore:(d) => `In ${d} day${d === 1 ? '' : 's'}`,
    statusBefore:    (m) => m >= 60 ? `Starts in ${Math.floor(m/60)}h ${m%60}m` : `Starts in ${m}m`,
    statusOnTime:    'On Schedule',
    statusLate:      (m) => `+${m}m Late`,
    statusWarn:      (m) => `+${m}m`,
    statusRunning:   'Running',
    statusEnded:     'Event Ended',
    editBtn:         'Edit',
    editBtnActive:   'Editing',
    editWarning:     'Edits will be lost when you close this page',
  },
};

function t(key, ...args) {
  const dict = I18N[state.lang] || I18N.ja;
  const val  = dict[key];
  return typeof val === 'function' ? val(...args) : (val || key);
}

// ───────────────────────────────────────────────
// State
// ───────────────────────────────────────────────
const state = {
  theme:        localStorage.getItem('theme')    || 'light',
  fontSize:     parseInt(localStorage.getItem('fontSize') || '3'),
  lang:         localStorage.getItem('lang')     || 'ja',
  mcFilter:     'all',
  editMode:     false,
  eventData:    null,
  activePartId: null,
};

// ───────────────────────────────────────────────
// Init
// ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  applyFontSize(state.fontSize);
  applyLang(state.lang);
  startClock();

  // Scroll listener for active tab tracking
  const scrollEl = document.getElementById('script-scroll');
  if (scrollEl) {
    scrollEl.addEventListener('scroll', () => updateActiveTabOnScroll(scrollEl), { passive: true });
  }

  handleRoute();
  window.addEventListener('hashchange', handleRoute);
});

function handleRoute() {
  const hash = window.location.hash.replace('#', '');
  if (hash) loadEvent(hash);
  else showSelector();
}

// ───────────────────────────────────────────────
// Clock & Time Status
// ───────────────────────────────────────────────
function startClock() {
  updateClockDisplay();
  setInterval(updateClockDisplay, 1000);
}

function updateClockDisplay() {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2, '0');
  const mm  = String(now.getMinutes()).padStart(2, '0');
  const ss  = String(now.getSeconds()).padStart(2, '0');

  const selClock = document.getElementById('selector-clock');
  if (selClock) selClock.textContent = `${hh}:${mm}:${ss}`;

  const topClock = document.getElementById('topbar-clock');
  if (topClock) topClock.textContent = `${hh}:${mm}`;

  if (state.eventData) {
    updateTimeStatus(state.eventData);
    updateCurrentTimePart(state.eventData);
  }
}

function parseTimeMins(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}

function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function parseEventDate(dateStr) {
  // "2026年4月3日（金）" → Date (midnight, local time)
  const m = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

function updateTimeStatus(event) {
  const el = document.getElementById('time-status');
  if (!el) return;

  // ── Step 1: 日付チェック ──────────────────────
  const eventDate = parseEventDate(event.date);
  if (eventDate) {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const diffDays = Math.round((eventDate - todayMidnight) / 86400000);

    if (diffDays > 0) {
      // イベント前（当日より前）→ 「X日後」
      el.textContent = t('statusDaysBefore', diffDays);
      el.className   = 'status-before';
      return;
    }

    if (diffDays < 0) {
      // イベント日を過ぎた → 「イベント終了」
      el.textContent = t('statusEnded');
      el.className   = 'status-before';
      return;
    }
    // diffDays === 0 → 当日 → 以下のリアルタイム判定へ
  }

  // ── Step 2: 当日のリアルタイム判定 ───────────
  const now   = nowMins();
  const start = parseTimeMins(event.startTime);
  const end   = parseTimeMins(event.endTime);

  // 開始前
  if (start !== null && now < start) {
    el.textContent = t('statusBefore', start - now);
    el.className   = 'status-before';
    return;
  }

  // 終了後（endTime + 5分 を超えたら）
  if (end !== null && now > end + 5) {
    el.textContent = t('statusEnded');
    el.className   = 'status-before';
    return;
  }

  // 進行中：次のパート定刻との差分を計算
  let nextPart     = null;
  let foundCurrent = false;

  for (let i = 0; i < event.parts.length; i++) {
    const pm = parseTimeMins(event.parts[i].scheduledTime);
    if (pm !== null && pm <= now) {
      for (let j = i + 1; j < event.parts.length; j++) {
        if (event.parts[j].scheduledTime) { nextPart = event.parts[j]; break; }
      }
      foundCurrent = true;
    }
  }

  if (nextPart) {
    const delta = now - parseTimeMins(nextPart.scheduledTime);
    if (delta > 10) {
      el.textContent = t('statusLate', delta);
      el.className   = 'status-late';
    } else if (delta > 2) {
      el.textContent = t('statusWarn', delta);
      el.className   = 'status-warn';
    } else {
      el.textContent = t('statusOnTime');
      el.className   = 'status-ok';
    }
  } else {
    el.textContent = foundCurrent ? t('statusRunning') : t('statusOnTime');
    el.className   = 'status-ok';
  }
}

// Highlight the part tab that corresponds to the scheduled time right now
function updateCurrentTimePart(event) {
  const now = nowMins();
  let currentId = null;
  for (const p of event.parts) {
    const pm = parseTimeMins(p.scheduledTime);
    if (pm !== null && pm <= now) currentId = p.id;
  }
  document.querySelectorAll('.part-tab').forEach(btn => {
    btn.classList.toggle('current-time', btn.dataset.partId === currentId);
  });
}

// ───────────────────────────────────────────────
// Selector Screen
// ───────────────────────────────────────────────
function showSelector() {
  state.eventData    = null;
  state.activePartId = null;
  document.getElementById('selector-screen').style.display = 'flex';
  document.getElementById('viewer-screen').style.display   = 'none';
  document.getElementById('selector-date').textContent     = formatDateJP(new Date());
}

function formatDateJP(date) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth()+1}月${date.getDate()}日（${days[date.getDay()]}）`;
}

// ───────────────────────────────────────────────
// Load Event
// ───────────────────────────────────────────────
async function loadEvent(eventId) {
  document.getElementById('selector-screen').style.display = 'none';
  const viewer = document.getElementById('viewer-screen');
  viewer.style.display = 'flex';
  document.getElementById('script-scroll').innerHTML =
    `<div class="loading">${t('loading')}</div>`;

  try {
    const res  = await fetch(`data/${eventId}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.eventData  = data;
    state.mcFilter   = 'all';
    state.editMode   = false;
    state.activePartId = data.parts.length ? data.parts[0].id : null;
    renderViewer(data);
    window.location.hash = eventId;
  } catch (e) {
    document.getElementById('script-scroll').innerHTML =
      `<div class="loading">${t('loadError')}: ${e.message}</div>`;
  }
}

// ───────────────────────────────────────────────
// Render Viewer
// ───────────────────────────────────────────────
function renderViewer(data) {
  document.getElementById('topbar-event-title').textContent = data.title;
  document.getElementById('topbar-part-hint').textContent   =
    `${data.date}　${data.startTime} — ${data.endTime}`;

  renderPartTabs(data);
  renderMcControls(data);
  renderScript(data);
  updateNavBtnState();
}

function renderPartTabs(data) {
  const container = document.getElementById('part-tabs');
  container.innerHTML = '';
  data.parts.forEach(part => {
    const btn = document.createElement('button');
    btn.className       = 'part-tab';
    btn.dataset.partId  = part.id;
    const m = part.title.match(/PART\s*(\d+)/i);
    btn.textContent     = m ? `P${m[1]}` : part.id.replace('part', 'P');
    btn.title           = part.title;
    btn.addEventListener('click', () => scrollToPart(part.id));
    container.appendChild(btn);
  });
  // Activate first tab
  const firstTab = container.querySelector('.part-tab');
  if (firstTab) firstTab.classList.add('active');
}

function renderMcControls(data) {
  const group = document.getElementById('mc-filter-group');
  group.innerHTML = '';

  const filters = [{ id: 'all', label: t('allMc') }];
  if (data.mc1) filters.push({ id: 'mc1', label: data.mc1.name });
  if (data.mc2) filters.push({ id: 'mc2', label: data.mc2.name });

  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className    = 'mc-filter-btn';
    btn.dataset.filter = f.id;
    btn.textContent  = f.label;
    btn.addEventListener('click', () => setMcFilter(f.id));
    group.appendChild(btn);
  });

  applyMcFilterUI();
}

function renderScript(data) {
  const container = document.getElementById('script-scroll');
  container.innerHTML = '';

  data.parts.forEach(part => {
    const section = document.createElement('div');
    section.className = 'part-section';
    section.id        = part.id;

    // Header
    const header  = document.createElement('div');
    header.className = 'part-header';
    const numMatch   = part.title.match(/PART\s*(\d+)/i);
    const numLabel   = numMatch ? `PART ${numMatch[1]}` : part.id.toUpperCase();
    let titleText    = part.title
      .replace(/^PART\s*\d+\s*/i, '')
      .replace(/[\s　]+\d{1,2}:\d{2}\s*[—–-]?\s*$/, '')
      .trim() || part.title;

    header.innerHTML = `
      <span class="part-number">${numLabel}</span>
      <span class="part-title-text">${escHtml(titleText)}</span>
      ${part.scheduledTime ? `<span class="part-time-badge">${part.scheduledTime}</span>` : ''}
    `;
    section.appendChild(header);

    // Rows
    part.rows.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'script-row';

      const timeEl = document.createElement('div');
      timeEl.className   = 'row-time';
      timeEl.textContent = row.time || '';
      rowEl.appendChild(timeEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'row-body';

      if (row.action) {
        const actionEl = document.createElement('div');
        actionEl.className   = 'row-action';
        actionEl.textContent = row.action;
        actionEl.addEventListener('click', () => actionEl.classList.toggle('hidden'));
        bodyEl.appendChild(actionEl);
      }

      const scriptEl = document.createElement('div');
      scriptEl.className = 'row-script';

      row.script.forEach(seg => {
        if (!seg.lines.length) return;
        const segEl = document.createElement('div');
        segEl.className        = `script-segment segment-${seg.type}`;
        segEl.dataset.segType  = seg.type;

        const labelEl = document.createElement('div');
        labelEl.className   = 'seg-label';
        labelEl.textContent = seg.speaker || seg.type.toUpperCase();
        segEl.appendChild(labelEl);

        const linesEl = document.createElement('div');
        linesEl.className   = 'seg-lines';
        linesEl.textContent = seg.lines.join('\n');
        segEl.appendChild(linesEl);

        scriptEl.appendChild(segEl);
      });

      bodyEl.appendChild(scriptEl);
      rowEl.appendChild(bodyEl);
      section.appendChild(rowEl);
    });

    container.appendChild(section);
  });

  applyMcFilterUI();
}

// ───────────────────────────────────────────────
// MC Filter
// ───────────────────────────────────────────────
function setMcFilter(filter) {
  state.mcFilter = filter;
  applyMcFilterUI();
}

function applyMcFilterUI() {
  const filter = state.mcFilter;

  document.querySelectorAll('.mc-filter-btn').forEach(btn => {
    const f = btn.dataset.filter;
    btn.classList.remove('active-all', 'active-mc1', 'active-mc2');
    if (f === filter) btn.classList.add(`active-${filter}`);
  });

  document.querySelectorAll('.script-segment').forEach(seg => {
    const t = seg.dataset.segType;
    if (filter === 'all') {
      seg.classList.remove('dimmed');
    } else if (filter === 'mc1') {
      seg.classList.toggle('dimmed', t !== 'mc1' && t !== 'both');
    } else if (filter === 'mc2') {
      seg.classList.toggle('dimmed', t !== 'mc2' && t !== 'both');
    }
  });
}

// ───────────────────────────────────────────────
// Part Navigation
// ───────────────────────────────────────────────
function scrollToPart(partId) {
  const scrollEl = document.getElementById('script-scroll');
  const el       = document.getElementById(partId);
  if (!el || !scrollEl) return;

  scrollEl.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
  state.activePartId = partId;

  document.querySelectorAll('.part-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.partId === partId);
  });

  // Bring active tab into view
  const activeTab = document.querySelector(`.part-tab[data-part-id="${partId}"]`);
  if (activeTab) {
    activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  updateNavBtnState();
}

function navPart(direction) {
  if (!state.eventData) return;
  const parts   = state.eventData.parts;
  const current = state.activePartId || (parts.length ? parts[0].id : null);
  const idx     = parts.findIndex(p => p.id === current);
  const nextIdx = idx + direction;
  if (nextIdx >= 0 && nextIdx < parts.length) {
    scrollToPart(parts[nextIdx].id);
  }
}

function updateNavBtnState() {
  if (!state.eventData) return;
  const parts = state.eventData.parts;
  const idx   = parts.findIndex(p => p.id === state.activePartId);
  const prevBtn = document.getElementById('chapter-prev');
  const nextBtn = document.getElementById('chapter-next');
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= parts.length - 1;
}

function updateActiveTabOnScroll(scrollEl) {
  if (!state.eventData) return;
  const scrollTop = scrollEl.scrollTop;
  let activeId    = null;

  for (const part of state.eventData.parts) {
    const el = document.getElementById(part.id);
    if (el && el.offsetTop <= scrollTop + 100) activeId = part.id;
  }

  if (activeId && activeId !== state.activePartId) {
    state.activePartId = activeId;
    document.querySelectorAll('.part-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.partId === activeId);
    });
    const tab = document.querySelector(`.part-tab[data-part-id="${activeId}"]`);
    if (tab) tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    updateNavBtnState();
  }
}

// ───────────────────────────────────────────────
// Font Size (7 levels)
// ───────────────────────────────────────────────
function changeFontSize(delta) {
  const next = delta === 0 ? 3 : Math.min(7, Math.max(1, state.fontSize + delta));
  state.fontSize = next;
  localStorage.setItem('fontSize', next);
  applyFontSize(next);
}

function applyFontSize(size) {
  document.documentElement.dataset.fontsize = size;
}

// ───────────────────────────────────────────────
// Theme
// ───────────────────────────────────────────────
function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  state.theme = next;
  localStorage.setItem('theme', next);
  applyTheme(next);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('.theme-icon').forEach(el => {
    el.textContent = theme === 'dark' ? '☀' : '☾';
  });
}

// ───────────────────────────────────────────────
// Language
// ───────────────────────────────────────────────
function toggleLang() {
  const next = state.lang === 'ja' ? 'en' : 'ja';
  state.lang = next;
  localStorage.setItem('lang', next);
  applyLang(next);
}

function applyLang(lang) {
  document.documentElement.lang = lang;

  // Update static i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  // Re-render MC controls to update "全員" / "All" label
  if (state.eventData) {
    renderMcControls(state.eventData);
  }

  // Sync edit button label with current edit state
  const editBtn = document.getElementById('edit-btn');
  if (editBtn) {
    const span = editBtn.querySelector('[data-i18n]');
    if (span) span.textContent = t(state.editMode ? 'editBtnActive' : 'editBtn');
  }
}

// ───────────────────────────────────────────────
// Edit Mode
// ───────────────────────────────────────────────
function toggleEditMode() {
  state.editMode = !state.editMode;

  const scrollEl  = document.getElementById('script-scroll');
  const warningEl = document.getElementById('edit-warning');
  const editBtn   = document.getElementById('edit-btn');

  if (state.editMode) {
    scrollEl.classList.add('edit-mode');
    warningEl.style.display = 'flex';
    editBtn.classList.add('edit-active');
    editBtn.querySelector('[data-i18n]').textContent = t('editBtnActive');
    // Make all script lines editable
    document.querySelectorAll('.seg-lines').forEach(el => {
      el.contentEditable = 'true';
      el.setAttribute('spellcheck', 'false');
    });
  } else {
    scrollEl.classList.remove('edit-mode');
    warningEl.style.display = 'none';
    editBtn.classList.remove('edit-active');
    editBtn.querySelector('[data-i18n]').textContent = t('editBtn');
    // Remove editability
    document.querySelectorAll('.seg-lines').forEach(el => {
      el.contentEditable = 'false';
    });
  }
}

function exitEditMode() {
  if (!state.editMode) return;
  state.editMode = false;
  document.getElementById('script-scroll').classList.remove('edit-mode');
  document.getElementById('edit-warning').style.display = 'none';
  const editBtn = document.getElementById('edit-btn');
  if (editBtn) {
    editBtn.classList.remove('edit-active');
    editBtn.querySelector('[data-i18n]').textContent = t('editBtn');
  }
  document.querySelectorAll('.seg-lines').forEach(el => {
    el.contentEditable = 'false';
  });
}

// ───────────────────────────────────────────────
// Back
// ───────────────────────────────────────────────
function goBack() {
  exitEditMode();
  state.eventData    = null;
  state.activePartId = null;
  window.location.hash = '';
  showSelector();
}

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
