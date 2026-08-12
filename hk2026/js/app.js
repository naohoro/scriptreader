/* ===== 香港 日本産食肉加工品 商談会/交流会 2026 — MC Script Reader ===== */

// ───────────────────────────────────────────────
// i18n（UI ラベル）
// ───────────────────────────────────────────────
const I18N = {
  ja: {
    allMc:            '全員',
    langSwitch:       '中文',
    loadError:        '台本データの読み込みに失敗しました',
    statusDaysBefore: (d) => `${d}日後`,
    statusBefore:     (m) => m >= 60 ? `開始 ${Math.floor(m/60)}時間${m%60}分前` : `開始 ${m}分前`,
    statusOnTime:     '定刻通り',
    statusLate:       (m) => `+${m}分 遅れ`,
    statusWarn:       (m) => `+${m}分`,
    statusRunning:    '進行中',
    statusEnded:      'イベント終了',
    editBtn:          '編集',
    editBtnActive:    '編集中',
    editWarning:      'このページを閉じると編集内容はリセットされます',
    rosterProgress:   (n, total) => `お呼びした企業　${n} / ${total}`,
    rosterReset:      'リセット',
    rosterHint:       'タップでチェック',
  },
  zh: {
    allMc:            '全部',
    langSwitch:       '日本語',
    loadError:        '無法載入台本資料',
    statusDaysBefore: (d) => `${d}天後`,
    statusBefore:     (m) => m >= 60 ? `距開始 ${Math.floor(m/60)}小時${m%60}分` : `距開始 ${m}分鐘`,
    statusOnTime:     '準時',
    statusLate:       (m) => `遲 ${m} 分鐘`,
    statusWarn:       (m) => `+${m}分`,
    statusRunning:    '進行中',
    statusEnded:      '活動結束',
    editBtn:          '編輯',
    editBtnActive:    '編輯中',
    editWarning:      '關閉此頁面後，編輯內容將會重設',
    rosterProgress:   (n, total) => `已介紹企業　${n} / ${total}`,
    rosterReset:      '重設',
    rosterHint:       '點擊可打勾',
  },
};

// セクション見出しの短縮ラベル（タブ用）
const SHORT_TITLE = {
  part1: { ja: '3分前',     zh: '3分鐘前' },
  part2: { ja: '開演',       zh: '開場' },
  part3: { ja: '主催者挨拶', zh: '主辦方致辭' },
  part4: { ja: '企業紹介',   zh: '企業介紹' },
  part5: { ja: '試食・商談', zh: '試食商談' },
  part6: { ja: '終了',       zh: '閉幕' },
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
  theme:        localStorage.getItem('hk-theme')    || 'light',
  fontSize:     parseInt(localStorage.getItem('hk-fontSize') || '3'),
  lang:         localStorage.getItem('hk-lang')     || 'ja',
  mcFilter:     'all',
  editMode:     false,
  eventData:    null,
  activePartId: null,
  rosterDone:   new Set(JSON.parse(localStorage.getItem('hk-roster') || '[]')),
};

// ───────────────────────────────────────────────
// 香港時間（端末のタイムゾーンに依存させない）
// ───────────────────────────────────────────────
const TZ = 'Asia/Hong_Kong';
const TZ_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function hkNow() {
  const p = {};
  for (const part of TZ_FMT.formatToParts(new Date())) p[part.type] = part.value;
  const hour = p.hour === '24' ? '00' : p.hour;
  return {
    year:  parseInt(p.year),
    month: parseInt(p.month),
    day:   parseInt(p.day),
    hh:    hour,
    mm:    p.minute,
    ss:    p.second,
    mins:  parseInt(hour) * 60 + parseInt(p.minute),
  };
}

// ───────────────────────────────────────────────
// Init
// ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  applyFontSize(state.fontSize);
  startClock();

  const scrollEl = document.getElementById('script-scroll');
  if (scrollEl) {
    scrollEl.addEventListener('scroll', () => updateActiveTabOnScroll(scrollEl), { passive: true });
  }

  loadEvent();
});

function loadEvent() {
  const data = window.SCRIPT_DATA;
  if (!data) {
    document.getElementById('script-scroll').innerHTML =
      `<div class="loading">${t('loadError')}</div>`;
    return;
  }
  state.eventData    = data;
  state.activePartId = data.parts.length ? data.parts[0].id : null;
  applyLang(state.lang);
  renderViewer(data);
  jumpToCurrentPart(data);
}

// 開いた時点の香港時間に対応するセクションへ移動
function jumpToCurrentPart(data) {
  const now = hkNow();
  if (!isEventDay(data, now)) return;
  let target = null;
  for (const p of data.parts) {
    const pm = parseTimeMins(p.scheduledTime);
    if (pm !== null && pm <= now.mins) target = p.id;
  }
  if (target && target !== data.parts[0].id) {
    setTimeout(() => scrollToPart(target), 120);
  }
}

// ───────────────────────────────────────────────
// Clock & Time Status
// ───────────────────────────────────────────────
function startClock() {
  updateClockDisplay();
  setInterval(updateClockDisplay, 1000);
}

function updateClockDisplay() {
  const now = hkNow();
  const clock = document.getElementById('topbar-clock');
  if (clock) clock.innerHTML = `${now.hh}:${now.mm}<span class="tz-badge">HKT</span>`;

  if (state.eventData) {
    updateTimeStatus(state.eventData, now);
    updateCurrentTimePart(state.eventData, now);
  }
}

function parseTimeMins(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}

function parseEventDate(dateStr) {
  const m = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : null;
}

function isEventDay(event, now) {
  const d = parseEventDate(event.date);
  if (!d) return true;
  return d.year === now.year && d.month === now.month && d.day === now.day;
}

function updateTimeStatus(event, now) {
  const el = document.getElementById('time-status');
  if (!el) return;

  const d = parseEventDate(event.date);
  if (d) {
    const eventDay = Date.UTC(d.year, d.month - 1, d.day);
    const today    = Date.UTC(now.year, now.month - 1, now.day);
    const diffDays = Math.round((eventDay - today) / 86400000);

    if (diffDays > 0) {
      el.textContent = t('statusDaysBefore', diffDays);
      el.className   = 'status-before';
      return;
    }
    if (diffDays < 0) {
      el.textContent = t('statusEnded');
      el.className   = 'status-before';
      return;
    }
  }

  const start = parseTimeMins(event.startTime);
  const end   = parseTimeMins(event.endTime);

  if (start !== null && now.mins < start) {
    el.textContent = t('statusBefore', start - now.mins);
    el.className   = 'status-before';
    return;
  }
  if (end !== null && now.mins > end + 15) {
    el.textContent = t('statusEnded');
    el.className   = 'status-before';
    return;
  }

  // 進行中：次セクションの定刻との差分
  let nextPart = null, foundCurrent = false;
  for (let i = 0; i < event.parts.length; i++) {
    const pm = parseTimeMins(event.parts[i].scheduledTime);
    if (pm !== null && pm <= now.mins) {
      for (let j = i + 1; j < event.parts.length; j++) {
        if (event.parts[j].scheduledTime) { nextPart = event.parts[j]; break; }
      }
      foundCurrent = true;
    }
  }

  if (nextPart) {
    const delta = now.mins - parseTimeMins(nextPart.scheduledTime);
    if (delta > 10)     { el.textContent = t('statusLate', delta); el.className = 'status-late'; }
    else if (delta > 2) { el.textContent = t('statusWarn', delta); el.className = 'status-warn'; }
    else                { el.textContent = t('statusOnTime');      el.className = 'status-ok'; }
  } else {
    el.textContent = foundCurrent ? t('statusRunning') : t('statusOnTime');
    el.className   = 'status-ok';
  }
}

function updateCurrentTimePart(event, now) {
  if (!isEventDay(event, now)) return;
  let currentId = null;
  for (const p of event.parts) {
    const pm = parseTimeMins(p.scheduledTime);
    if (pm !== null && pm <= now.mins) currentId = p.id;
  }
  document.querySelectorAll('.part-tab').forEach(btn => {
    btn.classList.toggle('current-time', btn.dataset.partId === currentId);
  });
  document.querySelectorAll('.part-header').forEach(h => {
    h.classList.toggle('is-now', h.dataset.partId === currentId);
  });
}

// ───────────────────────────────────────────────
// Render
// ───────────────────────────────────────────────
function isZh() { return state.lang === 'zh'; }

function partTitle(part) {
  return isZh() ? (part.titleZh || part.title) : part.title;
}

function renderViewer(data) {
  document.getElementById('topbar-event-title').textContent =
    isZh() ? (data.titleZh || data.title) : data.title;
  document.getElementById('topbar-part-hint').textContent =
    `${isZh() ? (data.dateZh || data.date) : data.date}　${data.startTime} — ${data.endTime}`;

  renderPartTabs(data);
  renderMcControls(data);
  renderScript(data);
  updateNavBtnState();
  updateClockDisplay();
}

function renderPartTabs(data) {
  const container = document.getElementById('part-tabs');
  container.innerHTML = '';
  data.parts.forEach(part => {
    const btn = document.createElement('button');
    btn.className      = 'part-tab';
    btn.dataset.partId = part.id;
    const short = SHORT_TITLE[part.id];
    btn.innerHTML = `<span class="tab-no">${part.no}</span>${escHtml(short ? short[state.lang] : partTitle(part))}`;
    btn.title = partTitle(part);
    btn.addEventListener('click', () => scrollToPart(part.id));
    container.appendChild(btn);
  });
  const first = container.querySelector(`.part-tab[data-part-id="${state.activePartId}"]`)
             || container.querySelector('.part-tab');
  if (first) first.classList.add('active');
}

function renderMcControls(data) {
  const group = document.getElementById('mc-filter-group');
  group.innerHTML = '';

  const filters = [{ id: 'all', label: t('allMc') }];
  if (data.mc1) filters.push({ id: 'mc1', label: isZh() ? data.mc1.nameZh : data.mc1.name });
  if (data.mc2) filters.push({ id: 'mc2', label: isZh() ? data.mc2.nameZh : data.mc2.name });

  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className      = 'mc-filter-btn';
    btn.dataset.filter = f.id;
    btn.textContent    = f.label;
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

    const header = document.createElement('div');
    header.className       = 'part-header';
    header.dataset.partId  = part.id;
    header.innerHTML = `
      <span class="part-number">${part.no}</span>
      <span class="part-title-text">${escHtml(partTitle(part))}</span>
      ${part.scheduledTime ? `<span class="part-time-badge">${part.scheduledTime}</span>` : ''}
    `;
    section.appendChild(header);

    part.rows.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'script-row';

      const timeEl = document.createElement('div');
      timeEl.className   = 'row-time';
      timeEl.textContent = (row.time || '').replace(/\s*-\s*/, '\n–\n');
      rowEl.appendChild(timeEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'row-body';

      const scriptEl = document.createElement('div');
      scriptEl.className = 'row-script';

      row.script.forEach(seg => {
        scriptEl.appendChild(buildSegment(seg, data));
      });

      if (row.roster && row.roster.length) {
        scriptEl.appendChild(buildRoster(row.roster));
      }

      bodyEl.appendChild(scriptEl);
      rowEl.appendChild(bodyEl);
      section.appendChild(rowEl);
    });

    container.appendChild(section);
  });

  container.appendChild(buildFooter(data));

  applyMcFilterUI();
  if (state.editMode) enableEditable(true);
}

function buildFooter(data) {
  const el = document.createElement('div');
  el.className = 'event-meta';
  const rows = [
    [isZh() ? '場地'   : '場所',  isZh() ? (data.venueZh || data.venue) : data.venue],
    [isZh() ? '主辦'   : '主催',  data.host],
    [isZh() ? '營運'   : '運営',  data.operator],
    [isZh() ? '司儀'   : '進行',  `${data.mc1.fullName} / ${data.mc2.fullName}`],
  ];
  el.innerHTML =
    rows.map(([k, v]) => `<div class="meta-row"><span class="meta-key">${escHtml(k)}</span><span class="meta-val">${escHtml(v)}</span></div>`).join('') +
    (data.footnote ? `<div class="meta-note">${escHtml(data.footnote)}</div>` : '');
  return el;
}

function buildSegment(seg, data) {
  const segEl = document.createElement('div');
  segEl.className       = `script-segment segment-${seg.type}`;
  segEl.dataset.segType = seg.type;

  const labelEl = document.createElement('div');
  labelEl.className = 'seg-label';
  if (seg.type === 'mc1') {
    labelEl.textContent = `${isZh() ? data.mc1.nameZh : data.mc1.name}　${isZh() ? data.mc1.langZh : data.mc1.lang}`;
  } else if (seg.type === 'mc2') {
    labelEl.textContent = `${isZh() ? data.mc2.nameZh : data.mc2.name}　${isZh() ? data.mc2.langZh : data.mc2.lang}`;
  } else {
    labelEl.textContent = seg.speaker || '';
  }
  segEl.appendChild(labelEl);

  // rich = 言語タグ付きの行（保呂田パートの日本語＋英語ミックス）
  if (seg.rich && seg.rich.length) {
    const linesEl = document.createElement('div');
    linesEl.className = 'seg-lines';
    seg.rich.forEach(l => {
      const lineEl = document.createElement('div');
      lineEl.className   = l.lang === 'en' ? 'seg-line line-en' : 'seg-line';
      lineEl.textContent = l.text;
      linesEl.appendChild(lineEl);
    });
    segEl.appendChild(linesEl);
  } else if (seg.lines.length) {
    const linesEl = document.createElement('div');
    linesEl.className   = 'seg-lines';
    linesEl.textContent = seg.lines.join('\n');
    segEl.appendChild(linesEl);
  }
  return segEl;
}

// ───────────────────────────────────────────────
// 企業紹介リスト（タップでチェック）
// ───────────────────────────────────────────────
function buildRoster(roster) {
  const wrap = document.createElement('div');
  wrap.className = 'roster';

  const head = document.createElement('div');
  head.className = 'roster-head';
  head.innerHTML = `
    <span class="roster-progress" id="roster-progress"></span>
    <span class="roster-hint">${escHtml(t('rosterHint'))}</span>
    <button class="roster-reset" onclick="resetRoster()">${escHtml(t('rosterReset'))}</button>
  `;
  wrap.appendChild(head);

  const list = document.createElement('div');
  list.className = 'roster-list';

  roster.forEach(entry => {
    const item = document.createElement('button');
    item.className        = 'roster-item';
    item.dataset.rosterNo = entry.no;
    item.classList.toggle('done', state.rosterDone.has(entry.no));

    item.innerHTML = `
      <span class="roster-no">${entry.no}</span>
      <span class="roster-body">
        <span class="roster-ja">${escHtml(entry.ja || '')}</span>
        <span class="roster-zh">${escHtml(entry.zh || '')}</span>
      </span>
      <span class="roster-check">✓</span>
    `;
    item.addEventListener('click', () => toggleRoster(entry.no, item));
    list.appendChild(item);
  });

  wrap.appendChild(list);
  setTimeout(() => updateRosterProgress(roster.length), 0);
  return wrap;
}

function toggleRoster(no, el) {
  if (state.rosterDone.has(no)) state.rosterDone.delete(no);
  else state.rosterDone.add(no);
  el.classList.toggle('done', state.rosterDone.has(no));
  localStorage.setItem('hk-roster', JSON.stringify([...state.rosterDone]));
  updateRosterProgress(document.querySelectorAll('.roster-item').length);
}

function resetRoster() {
  state.rosterDone.clear();
  localStorage.setItem('hk-roster', '[]');
  document.querySelectorAll('.roster-item').forEach(el => el.classList.remove('done'));
  updateRosterProgress(document.querySelectorAll('.roster-item').length);
}

function updateRosterProgress(total) {
  const el = document.getElementById('roster-progress');
  if (el) el.textContent = t('rosterProgress', state.rosterDone.size, total);
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
    btn.classList.remove('active-all', 'active-mc1', 'active-mc2');
    if (btn.dataset.filter === filter) btn.classList.add(`active-${filter}`);
  });

  document.querySelectorAll('.script-segment').forEach(seg => {
    const type = seg.dataset.segType;
    // 来賓（武内さん）の発話は日本語側。保呂田フィルタでは残す
    const isJaSide = (type === 'mc1' || type === 'guest');
    if (filter === 'all' || type === 'cue' || type === 'note') {
      seg.classList.remove('dimmed');
    } else if (filter === 'mc1') {
      seg.classList.toggle('dimmed', !isJaSide);
    } else {
      seg.classList.toggle('dimmed', type !== 'mc2');
    }
  });

  document.querySelectorAll('.roster').forEach(r => {
    r.classList.toggle('filter-mc1', filter === 'mc1');
    r.classList.toggle('filter-mc2', filter === 'mc2');
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
  const activeTab = document.querySelector(`.part-tab[data-part-id="${partId}"]`);
  if (activeTab) activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

  updateNavBtnState();
}

function navPart(direction) {
  if (!state.eventData) return;
  const parts   = state.eventData.parts;
  const current = state.activePartId || (parts.length ? parts[0].id : null);
  const idx     = parts.findIndex(p => p.id === current);
  const nextIdx = idx + direction;
  if (nextIdx >= 0 && nextIdx < parts.length) scrollToPart(parts[nextIdx].id);
}

function updateNavBtnState() {
  if (!state.eventData) return;
  const parts = state.eventData.parts;
  const idx   = parts.findIndex(p => p.id === state.activePartId);
  const prev  = document.getElementById('chapter-prev');
  const next  = document.getElementById('chapter-next');
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx >= parts.length - 1;
}

function updateActiveTabOnScroll(scrollEl) {
  if (!state.eventData) return;
  const scrollTop = scrollEl.scrollTop;
  let activeId = null;
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
// Font / Theme / Language
// ───────────────────────────────────────────────
function changeFontSize(delta) {
  const next = Math.min(7, Math.max(1, state.fontSize + delta));
  state.fontSize = next;
  localStorage.setItem('hk-fontSize', next);
  applyFontSize(next);
}

function applyFontSize(size) {
  document.documentElement.dataset.fontsize = size;
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  state.theme = next;
  localStorage.setItem('hk-theme', next);
  applyTheme(next);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('.theme-icon').forEach(el => {
    el.textContent = theme === 'dark' ? '☀' : '☾';
  });
}

function toggleLang() {
  state.lang = state.lang === 'ja' ? 'zh' : 'ja';
  localStorage.setItem('hk-lang', state.lang);
  applyLang(state.lang);
  if (state.eventData) {
    const keep = state.activePartId;
    renderViewer(state.eventData);
    if (keep) scrollToPart(keep);
  }
}

function applyLang(lang) {
  document.documentElement.lang = lang === 'zh' ? 'zh-HK' : 'ja';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  const editBtn = document.getElementById('edit-btn');
  if (editBtn) {
    const span = editBtn.querySelector('[data-i18n]');
    if (span) span.textContent = t(state.editMode ? 'editBtnActive' : 'editBtn');
  }
}

// ───────────────────────────────────────────────
// Edit Mode（当日その場での書き換え・保存はしない）
// ───────────────────────────────────────────────
function toggleEditMode() {
  state.editMode = !state.editMode;

  const scrollEl  = document.getElementById('script-scroll');
  const warningEl = document.getElementById('edit-warning');
  const editBtn   = document.getElementById('edit-btn');

  scrollEl.classList.toggle('edit-mode', state.editMode);
  warningEl.style.display = state.editMode ? 'flex' : 'none';
  editBtn.classList.toggle('edit-active', state.editMode);
  editBtn.querySelector('[data-i18n]').textContent = t(state.editMode ? 'editBtnActive' : 'editBtn');

  enableEditable(state.editMode);
}

function enableEditable(on) {
  document.querySelectorAll('.seg-lines').forEach(el => {
    el.contentEditable = on ? 'true' : 'false';
    if (on) el.setAttribute('spellcheck', 'false');
  });
}

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
