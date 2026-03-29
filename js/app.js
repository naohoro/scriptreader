/* ===== JWWA 2026 MC Script Reader ===== */

// State
const state = {
  theme: localStorage.getItem('theme') || 'dark',
  fontSize: parseInt(localStorage.getItem('fontSize') || '3'),
  mcFilter: 'all', // 'all' | 'mc1' | 'mc2'
  eventData: null,
  clockInterval: null,
  activePartId: null,
};

// ───────────────────────────────────────────────
// Init
// ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  applyFontSize(state.fontSize);
  startClock();

  // Hash routing
  handleRoute();
  window.addEventListener('hashchange', handleRoute);
});

function handleRoute() {
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    loadEvent(hash);
  } else {
    showSelector();
  }
}

// ───────────────────────────────────────────────
// Clock
// ───────────────────────────────────────────────
function startClock() {
  updateClockDisplay();
  state.clockInterval = setInterval(updateClockDisplay, 1000);
}

function updateClockDisplay() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const timeStr = `${hh}:${mm}:${ss}`;

  // Selector clock
  const selClock = document.getElementById('selector-clock');
  if (selClock) selClock.textContent = timeStr;

  // Viewer clock
  const topClock = document.getElementById('topbar-clock');
  if (topClock) topClock.textContent = `${hh}:${mm}`;

  // Update time status if event loaded
  if (state.eventData) {
    updateTimeStatus(state.eventData);
    updateActivePartTab(state.eventData);
  }
}

function parseTimeMins(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function updateTimeStatus(event) {
  const el = document.getElementById('time-status');
  if (!el) return;

  const now = nowMins();
  const start = parseTimeMins(event.startTime);
  const end   = parseTimeMins(event.endTime);

  if (start !== null && now < start) {
    const diff = start - now;
    el.textContent = diff >= 60
      ? `開始 ${Math.floor(diff/60)}時間${diff%60}分前`
      : `開始 ${diff}分前`;
    el.className = 'status-before';
    return;
  }
  if (end !== null && now > end + 15) {
    el.textContent = '終了';
    el.className = 'status-before';
    return;
  }

  // Find current expected part
  let currentPart = null;
  let nextPart    = null;

  for (let i = 0; i < event.parts.length; i++) {
    const p = event.parts[i];
    const pm = parseTimeMins(p.scheduledTime);
    if (pm !== null && pm <= now) {
      currentPart = p;
      // find next part with scheduledTime
      for (let j = i + 1; j < event.parts.length; j++) {
        if (event.parts[j].scheduledTime) { nextPart = event.parts[j]; break; }
      }
    }
  }

  if (!currentPart) {
    el.textContent = '進行中';
    el.className = 'status-ok';
    return;
  }

  if (nextPart && nextPart.scheduledTime) {
    const nextMins = parseTimeMins(nextPart.scheduledTime);
    const delta = now - nextMins; // positive = behind schedule
    if (delta > 10) {
      el.textContent = `+${delta}分 遅れ`;
      el.className = 'status-late';
    } else if (delta > 3) {
      el.textContent = `+${delta}分`;
      el.className = 'status-warn';
    } else if (delta > 0) {
      el.textContent = `+${delta}分`;
      el.className = 'status-warn';
    } else {
      el.textContent = '定刻通り';
      el.className = 'status-ok';
    }
  } else {
    el.textContent = '進行中';
    el.className = 'status-ok';
  }
}

function updateActivePartTab(event) {
  const now = nowMins();
  let activeId = null;
  for (const p of event.parts) {
    const pm = parseTimeMins(p.scheduledTime);
    if (pm !== null && pm <= now) activeId = p.id;
  }
  document.querySelectorAll('.part-tab').forEach(btn => {
    btn.classList.toggle('current-time', btn.dataset.partId === activeId);
  });
}

// ───────────────────────────────────────────────
// Selector Screen
// ───────────────────────────────────────────────
function showSelector() {
  state.eventData = null;
  document.getElementById('selector-screen').style.display = 'flex';
  document.getElementById('viewer-screen').style.display = 'none';
  document.getElementById('selector-date').textContent = formatDateJP(new Date());
}

function formatDateJP(date) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const wd = days[date.getDay()];
  return `${m}月${d}日（${wd}）`;
}

// ───────────────────────────────────────────────
// Load Event
// ───────────────────────────────────────────────
async function loadEvent(eventId) {
  document.getElementById('selector-screen').style.display = 'none';

  const viewer = document.getElementById('viewer-screen');
  viewer.style.display = 'flex';
  document.getElementById('script-scroll').innerHTML =
    '<div class="loading">読み込み中...</div>';

  try {
    const res = await fetch(`data/${eventId}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.eventData = data;
    state.mcFilter  = 'all';
    renderViewer(data);
    window.location.hash = eventId;
  } catch (e) {
    document.getElementById('script-scroll').innerHTML =
      `<div class="loading">読み込みエラー: ${e.message}</div>`;
  }
}

// ───────────────────────────────────────────────
// Render Viewer
// ───────────────────────────────────────────────
function renderViewer(data) {
  // Top bar
  document.getElementById('topbar-event-title').textContent = data.title;
  document.getElementById('topbar-part-hint').textContent =
    `${data.date}　${data.startTime} — ${data.endTime}`;

  // Part tabs
  renderPartTabs(data);

  // MC controls
  renderMcControls(data);

  // Script
  renderScript(data);
}

function renderPartTabs(data) {
  const container = document.getElementById('part-tabs');
  container.innerHTML = '';
  data.parts.forEach(part => {
    const btn = document.createElement('button');
    btn.className = 'part-tab';
    btn.dataset.partId = part.id;

    // Short label: extract "P1" from "PART 1..."
    const m = part.title.match(/PART\s*(\d+)/i);
    btn.textContent = m ? `P${m[1]}` : part.id.replace('part', 'P');
    btn.title = part.title;

    btn.addEventListener('click', () => scrollToPart(part.id));
    container.appendChild(btn);
  });
}

function renderMcControls(data) {
  const group = document.getElementById('mc-filter-group');
  group.innerHTML = '';

  const filters = [{ id: 'all', label: '全員' }];
  if (data.mc1) filters.push({ id: 'mc1', label: data.mc1.name });
  if (data.mc2) filters.push({ id: 'mc2', label: data.mc2.name });

  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className = `mc-filter-btn`;
    btn.dataset.filter = f.id;
    btn.textContent = f.label;
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
    section.id = part.id;

    // Part header
    const header = document.createElement('div');
    header.className = 'part-header';

    const numMatch = part.title.match(/PART\s*(\d+)/i);
    const numLabel = numMatch ? `PART ${numMatch[1]}` : part.id.toUpperCase();

    // Clean title text (remove PART N and time at end)
    let titleText = part.title
      .replace(/^PART\s*\d+\s*/i, '')
      .replace(/[\s　]+\d{1,2}:\d{2}\s*[—–-]?\s*$/, '')
      .trim();
    if (!titleText) titleText = part.title;

    header.innerHTML = `
      <span class="part-number">${numLabel}</span>
      <span class="part-title-text">${escHtml(titleText)}</span>
      ${part.scheduledTime ? `<span class="part-time-badge">${part.scheduledTime}</span>` : ''}
    `;
    section.appendChild(header);

    // Rows
    part.rows.forEach((row, ri) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'script-row';

      // Time
      const timeEl = document.createElement('div');
      timeEl.className = 'row-time';
      timeEl.textContent = row.time || '';
      rowEl.appendChild(timeEl);

      // Body
      const bodyEl = document.createElement('div');
      bodyEl.className = 'row-body';

      // Action
      if (row.action) {
        const actionEl = document.createElement('div');
        actionEl.className = 'row-action';
        actionEl.textContent = row.action;
        actionEl.addEventListener('click', () => actionEl.classList.toggle('hidden'));
        bodyEl.appendChild(actionEl);
      }

      // Script segments
      const scriptEl = document.createElement('div');
      scriptEl.className = 'row-script';

      row.script.forEach(seg => {
        if (!seg.lines.length) return;
        const segEl = document.createElement('div');
        segEl.className = `script-segment segment-${seg.type}`;
        segEl.dataset.segType = seg.type;

        const labelEl = document.createElement('div');
        labelEl.className = 'seg-label';
        labelEl.textContent = seg.speaker || seg.type.toUpperCase();
        segEl.appendChild(labelEl);

        const linesEl = document.createElement('div');
        linesEl.className = 'seg-lines';
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

  // Apply current filter
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

  // Update buttons
  document.querySelectorAll('.mc-filter-btn').forEach(btn => {
    const f = btn.dataset.filter;
    btn.classList.remove('active-all', 'active-mc1', 'active-mc2');
    if (f === filter) {
      btn.classList.add(`active-${filter === 'all' ? 'all' : filter}`);
    }
  });

  // Update segments
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
  const el = document.getElementById(partId);
  if (el) {
    const scroll = document.getElementById('script-scroll');
    const top = el.offsetTop - scroll.offsetTop;
    scroll.scrollTo({ top, behavior: 'smooth' });
    state.activePartId = partId;

    // Highlight tab
    document.querySelectorAll('.part-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.partId === partId);
    });
  }
}

// Update active tab on scroll
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const scrollEl = document.getElementById('script-scroll');
    if (scrollEl) {
      scrollEl.addEventListener('scroll', () => {
        updateActiveTabOnScroll(scrollEl);
      }, { passive: true });
    }
  }, 500);
});

function updateActiveTabOnScroll(scrollEl) {
  if (!state.eventData) return;
  const scrollTop = scrollEl.scrollTop;
  let activeId = null;
  for (const part of state.eventData.parts) {
    const el = document.getElementById(part.id);
    if (el && el.offsetTop - scrollEl.offsetTop <= scrollTop + 80) {
      activeId = part.id;
    }
  }
  if (activeId) {
    document.querySelectorAll('.part-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.partId === activeId);
    });
    // Scroll tab into view
    const activeTab = document.querySelector(`.part-tab[data-part-id="${activeId}"]`);
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }
}

// ───────────────────────────────────────────────
// Font Size
// ───────────────────────────────────────────────
function changeFontSize(delta) {
  const next = delta === 0 ? 3 : Math.min(5, Math.max(1, state.fontSize + delta));
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
  const icons = document.querySelectorAll('.theme-icon');
  icons.forEach(el => { el.textContent = theme === 'dark' ? '☀' : '☾'; });
}

// ───────────────────────────────────────────────
// Back
// ───────────────────────────────────────────────
function goBack() {
  state.eventData = null;
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
