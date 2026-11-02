// 독서·공연 도감 — 앱 본체
// Firebase 설정은 firebase-config.js 에서만 바꾸면 됩니다.
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const root = document.getElementById('app');
const configured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('여기에');

// ---------- 상태 ----------
const S = {
  user: undefined, items: [], loaded: false, error: '',
  tab: load('tab', 'read'), sortRead: load('sortRead', 'recent'), filterSeen: 'all',
  overlay: null, draft: null,
};
function load(k, d) { try { return localStorage.getItem('dogam.' + k) || d; } catch (e) { return d; } }
function keep(k, v) { try { localStorage.setItem('dogam.' + k, v); } catch (e) { /* 무시 */ } }

// ---------- Firebase ----------
let auth, db, unsub = null;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  onAuthStateChanged(auth, (u) => {
    S.user = u || null;
    if (unsub) { unsub(); unsub = null; }
    S.items = []; S.loaded = false;
    if (u) {
      unsub = onSnapshot(collection(db, 'users', u.uid, 'items'), (snap) => {
        S.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        S.loaded = true; S.error = ''; render();
      }, (err) => { S.error = '기록을 불러오지 못했어요: ' + err.message; render(); });
    }
    render();
  });
}
const itemsCol = () => collection(db, 'users', S.user.uid, 'items');

// ---------- 도우미 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const parseDay = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => (s ? s.slice(0, 10).replaceAll('-', '.') : '');
const dday = (s) => { const n = Math.round((parseDay(s) - today0()) / 86400000); return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : '지남'; };
const fmtTicket = (s) => { const d = new Date(s); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const stars = (n) => (n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');
const noStr = (n) => 'No.' + String(n || 0).padStart(3, '0');

const TYPE_COLORS = { 소설: '#E06A3B', 고전: '#6B5BD6', 에세이: '#2E8A5E', 동화: '#2E8A5E', 시: '#C0457A', 철학: '#3B78D9', 자기계발: '#8F6A08', 과학: '#2F7F8F', 역사: '#8A5A2E', 뮤지컬: '#D9483B', 연극: '#2E8A5E', 콘서트: '#6B5BD6', 영화: '#3B78D9' };
const PALETTE = ['#E06A3B', '#6B5BD6', '#2E8A5E', '#3B78D9', '#C0457A', '#8F6A08', '#2F7F8F'];
const TINTS = ['#DCD6FF', '#FFD9C7', '#FFE9A8', '#CDEFD8', '#CFE0FF', '#F9D2E3'];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const typeColor = (t) => TYPE_COLORS[t] || PALETTE[hash(t) % PALETTE.length];
const badge = (t) => (t ? `<span class="badge" style="background:${typeColor(t)}">${esc(t)}</span>` : '');
const cover = (it, cls, label = '표지 사진') => it.photo
  ? `<img class="cover ${cls}" src="${esc(it.photo)}" alt="">`
  : `<div class="cover ${cls}" style="background:${TINTS[hash(it.title || '') % TINTS.length]}">${label}</div>`;
const itemType = (it) => (it.subtype === 'movie' ? '영화' : it.showType || '공연');

const ICON = {
  read: '<path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/>',
  seen: '<path d="M3 8h18v4a2 2 0 0 0 0 4v0H3v0a2 2 0 0 0 0-4z"/><path d="M15 8v8" stroke-dasharray="2 2"/>',
  wishBook: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  wishShow: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z"/>',
};
const svg = (p, size = 22, sw = 2.2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const TABS = [
  { id: 'read', label: '읽은 책', title: '읽은 책', code: 'BOOKS', color: '#D9483B', active: '#D9483B' },
  { id: 'seen', label: '본 작품', title: '본 공연·영화', code: 'SEEN', color: '#3B78D9', active: '#3B78D9' },
  { id: 'wishBook', label: '읽을 책', title: '읽고 싶은 책', code: 'WISH', color: '#2E8A5E', active: '#2E8A5E' },
  { id: 'wishShow', label: '볼 작품', title: '보고 싶은 공연·영화', code: 'WISH', color: '#F2C230', active: '#8F6A08', light: true },
];
const KIND_NAME = { read: '읽은 책', seen: '본 공연·영화', wishBook: '읽고 싶은 책', wishShow: '보고 싶은 공연·영화' };
const FIELDS = {
  read: ['kind', 'title', 'author', 'genre', 'startDate', 'endDate', 'rating', 'photo', 'memo', 'no', 'createdAt'],
  seen: ['kind', 'subtype', 'title', 'showType', 'cast', 'date', 'rating', 'with', 'photo', 'createdAt'],
  wishBook: ['kind', 'title', 'author', 'photo', 'createdAt'],
  wishShow: ['kind', 'subtype', 'title', 'showType', 'cast', 'periodStart', 'periodEnd', 'tickets', 'releaseDate', 'photo', 'createdAt'],
};
const DEFAULTS = {
  read: () => ({ kind: 'read', title: '', author: '', genre: '', startDate: '', endDate: todayStr(), rating: 0, photo: '', memo: '' }),
  seen: () => ({ kind: 'seen', subtype: 'show', title: '', showType: '뮤지컬', cast: '', date: todayStr(), rating: 0, with: '', photo: '' }),
  wishBook: () => ({ kind: 'wishBook', title: '', author: '', photo: '' }),
  wishShow: () => ({ kind: 'wishShow', subtype: 'show', title: '', showType: '뮤지컬', cast: '', periodStart: '', periodEnd: '', tickets: ['', '', '', '', ''], releaseDate: '', photo: '' }),
};

// ---------- 목록 정렬, 일정 ----------
const ofKind = (k) => S.items.filter((it) => it.kind === k);
const ts = (it) => it.createdAt || 0;
function readList() {
  const l = ofKind('read');
  if (S.sortRead === 'rating') return l.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.no || 0) - (a.no || 0));
  if (S.sortRead === 'no') return l.sort((a, b) => (a.no || 0) - (b.no || 0));
  return l.sort((a, b) => (b.endDate || '').localeCompare(a.endDate || '') || (b.no || 0) - (a.no || 0));
}
function nextEvent(it) {
  const now = Date.now();
  if (it.subtype === 'movie') {
    if (it.releaseDate && parseDay(it.releaseDate) >= today0()) return { t: parseDay(it.releaseDate).getTime(), text: `〈${it.title}〉 개봉이 다가온다!`, when: fmtDate(it.releaseDate) + ' 개봉', dd: dday(it.releaseDate) };
    return null;
  }
  let best = null;
  (it.tickets || []).forEach((t, i) => {
    if (!t) return; const v = new Date(t).getTime();
    if (v >= now && (!best || v < best.t)) best = { t: v, i, text: `〈${it.title}〉 ${i + 1}차 티켓팅이 다가온다!`, when: fmtTicket(t), dd: dday(t) };
  });
  return best;
}
function wishShowList() {
  return ofKind('wishShow').map((it) => ({ it, ev: nextEvent(it) }))
    .sort((a, b) => (a.ev ? a.ev.t : Infinity) - (b.ev ? b.ev.t : Infinity) || ts(b.it) - ts(a.it));
}

// ---------- 그리기 ----------
function render() {
  const kept = {};
  root.querySelectorAll('[data-keep]').forEach((el) => { kept[el.dataset.keep] = el.scrollTop; });
  root.innerHTML = view();
  root.querySelectorAll('[data-keep]').forEach((el) => { if (kept[el.dataset.keep]) el.scrollTop = kept[el.dataset.keep]; });
}

function view() {
  if (!configured) {
    return `<div class="screen"><div class="center"><div class="logo-box">${svg(ICON.read, 52, 2.4).replace('currentColor', '#fff')}</div>
      <h1 class="dh">독서·공연 도감</h1><p>Firebase 설정이 아직 없어요.<br>firebase-config.js 파일에 Firebase 설정값을 붙여 넣어 주세요.</p></div></div>`;
  }
  if (S.user === undefined) return `<div class="screen"><div class="center"><p class="px" style="font-size:10px">LOADING...</p></div></div>`;
  if (!S.user) {
    return `<div class="screen"><div class="center"><div class="logo-box">${svg(ICON.read, 52, 2.4).replace('currentColor', '#fff')}</div>
      <h1 class="dh">독서·공연 도감</h1><p>읽은 책, 본 공연과 영화,<br>읽고 보고 싶은 것을 한곳에 모아요.</p>
      <button type="button" class="login-btn" data-action="login">Google 계정으로 시작하기</button>
      ${S.error ? `<p class="err">${esc(S.error)}</p>` : ''}</div></div>`;
  }
  return mainView() + overlayView();
}

function mainView() {
  const t = TABS.find((x) => x.id === S.tab) || TABS[0];
  const counts = { read: ofKind('read').length, seen: ofKind('seen').length, wishBook: ofKind('wishBook').length, wishShow: ofKind('wishShow').length };
  let controls = '';
  if (t.id === 'read') controls = `<div class="chips">${[['recent', '최신순'], ['rating', '별점순'], ['no', '번호순']].map(([k, l]) => `<button type="button" class="chip ${S.sortRead === k ? 'on' : ''}" data-action="sort" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (t.id === 'seen') controls = `<div class="chips">${[['all', '전체'], ['show', '공연'], ['movie', '영화']].map(([k, l]) => `<button type="button" class="chip ${S.filterSeen === k ? 'on' : ''}" data-action="filter" data-v="${k}">${l}</button>`).join('')}</div>`;
  return `<div class="screen" ${S.overlay ? 'aria-hidden="true"' : ''}>
    <header class="hd ${t.light ? 'light' : ''}" style="background:${t.color}">
      <div class="hd-row"><h1 class="dh">${t.title}</h1>
        <div class="hd-right"><span class="px code">${t.code} ${counts[t.id]}</span>
          <button type="button" class="icon-btn" data-action="logout" aria-label="로그아웃">${svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>', 18, 2.4)}</button></div></div>
      ${controls}
    </header>
    <main class="content" data-keep="content-${t.id}">${S.error ? `<p class="err">${esc(S.error)}</p>` : ''}${S.loaded ? listView(t.id) : '<p class="empty px">LOADING...</p>'}</main>
    <button type="button" class="fab" data-action="add" aria-label="${KIND_NAME[t.id]} 새로 기록하기">${svg('<path d="M12 5v14M5 12h14"/>', 24, 3)}</button>
    <nav class="tabs">${TABS.map((x) => `<button type="button" class="tab" data-action="tab" data-v="${x.id}" ${x.id === t.id ? `style="color:${x.active}" aria-current="page"` : ''}>${svg(ICON[x.id])}${x.label}</button>`).join('')}</nav>
  </div>`;
}

function empty(msg) { return `<div class="empty"><span class="px">EMPTY</span>${msg}<br>오른쪽 아래 + 버튼으로 기록해 보세요.</div>`; }

function listView(tab) {
  if (tab === 'read') {
    const l = readList();
    if (!l.length) return empty('아직 읽은 책이 없어요.');
    return `<div class="grid">${l.map((b) => `<button type="button" class="card book-card" data-action="open" data-id="${b.id}">
      <div class="top-line"><span class="px no">${noStr(b.no)}</span><span class="stars">${stars(b.rating)}</span></div>
      ${cover(b, '')}
      <div class="title">${esc(b.title)}</div>
      <div class="top-line"><span class="sub">${esc(b.author)}</span>${badge(b.genre)}</div></button>`).join('')}</div>`;
  }
  if (tab === 'seen') {
    let l = ofKind('seen');
    if (S.filterSeen !== 'all') l = l.filter((x) => (x.subtype || 'show') === S.filterSeen);
    l.sort((a, b) => (b.date || '').localeCompare(a.date || '') || ts(b) - ts(a));
    if (!l.length) return empty('아직 본 공연·영화가 없어요.');
    return `<div class="list">${l.map((it) => `<button type="button" class="card row-card" data-action="edit" data-id="${it.id}">
      ${cover(it, 'thumb', '포스터')}
      <div class="meta"><div class="top-line">${badge(itemType(it))}<span class="stars" style="font-size:12px">${stars(it.rating)}</span></div>
        <div class="title">${esc(it.title)}</div>
        ${it.subtype !== 'movie' && it.cast ? `<div class="sub">캐스팅 · ${esc(it.cast)}</div>` : ''}
        <div class="sub">본 날 · ${fmtDate(it.date)}</div>
        ${it.with ? `<div class="sub">함께 · ${esc(it.with)}</div>` : ''}</div></button>`).join('')}</div>`;
  }
  if (tab === 'wishBook') {
    const l = ofKind('wishBook').sort((a, b) => ts(b) - ts(a));
    if (!l.length) return empty('읽고 싶은 책을 모아 두세요.');
    return `<div class="list">${l.map((b) => `<div class="card row-card">
      <button type="button" data-action="edit" data-id="${b.id}" style="all:unset;display:flex;gap:12px;align-items:center;flex:1;min-width:0;cursor:pointer">
        ${cover(b, 'thumb-s', '표지')}
        <span class="meta"><span class="title">${esc(b.title)}</span><span class="sub">${esc(b.author)}</span></span></button>
      <button type="button" class="small-btn" data-action="promote" data-id="${b.id}">다 읽음</button></div>`).join('')}</div>`;
  }
  const l = wishShowList();
  const up = l.map((x) => x.ev).filter(Boolean)[0];
  const banner = up ? `<div class="banner"><span class="msg">${esc(up.text)}<br><span class="when">${esc(up.when)}</span></span><span class="px">${up.dd}</span></div>` : '';
  if (!l.length) return empty('보고 싶은 공연·영화를 모아 두세요.');
  return banner + `<div class="list">${l.map(({ it, ev }) => wishShowCard(it, ev)).join('')}</div>`;
}

function wishShowCard(it, ev) {
  const head = `<button type="button" data-action="edit" data-id="${it.id}" style="all:unset;display:flex;gap:12px;cursor:pointer;flex:1;min-width:0">
    ${cover(it, 'thumb', '포스터')}
    <span class="meta">${badge(itemType(it))}<span class="title">${esc(it.title)}</span>
      ${it.subtype === 'movie'
        ? `<span class="sub">개봉일 · ${it.releaseDate ? fmtDate(it.releaseDate) : '미정'}</span>`
        : `${it.cast ? `<span class="sub">캐스팅 · ${esc(it.cast)}</span>` : ''}${it.periodStart || it.periodEnd ? `<span class="sub">공연 일정 · ${fmtDate(it.periodStart)} ~ ${fmtDate(it.periodEnd)}</span>` : ''}`}
    </span></button>`;
  const done = `<button type="button" class="small-btn" data-action="promote" data-id="${it.id}">다 봄 → 본 작품으로</button>`;
  if (it.subtype === 'movie') {
    return `<div class="card show-card"><div style="display:flex;gap:8px;align-items:flex-start">${head}${it.releaseDate ? `<span class="px" style="font-size:10px">${dday(it.releaseDate)}</span>` : ''}</div>${done}</div>`;
  }
  const now = Date.now();
  const rows = (it.tickets || []).map((t, i) => {
    if (!t) return '';
    const past = new Date(t).getTime() < now; const next = ev && ev.i === i;
    return `<div class="t-row ${past ? 'past' : ''} ${next ? 'next' : ''}"><span class="n">${i + 1}차</span><span class="d">${fmtTicket(t)}</span><span class="r ${next ? 'px' : ''}">${past ? '지남' : dday(t)}</span></div>`;
  }).join('');
  return `<div class="card show-card"><div style="display:flex">${head}</div>
    ${rows ? `<div class="tickets"><span class="px label">TICKETING</span>${rows}</div>` : ''}${done}</div>`;
}

// ---------- 상세, 입력 화면 ----------
function overlayView() {
  const o = S.overlay; if (!o) return '';
  if (o.type === 'detail') return detailView(o);
  return formView(o);
}

function detailView(o) {
  const b = S.items.find((x) => x.id === o.id);
  if (!b) { S.overlay = null; return ''; }
  const color = b.genre ? typeColor(b.genre) : '#6B5BD6';
  const days = b.startDate && b.endDate ? Math.round((parseDay(b.endDate) - parseDay(b.startDate)) / 86400000) + 1 : 0;
  const memo = o.memoEditing
    ? `<div class="memo-box"><label class="sr" for="memo-text">내용 요약 메모</label><textarea id="memo-text" placeholder="책 내용 요약, 느낀 점, 기억하고 싶은 문장을 적어요">${esc(b.memo)}</textarea></div>
       <div class="btn-row"><button type="button" class="big-btn ghost dh" data-action="memo-cancel">취소</button><button type="button" class="big-btn dh" data-action="memo-save">저장</button></div>`
    : `<div class="memo-box ${b.memo ? '' : 'placeholder'}">${b.memo ? esc(b.memo) : '아직 메모가 없어요. 책 내용 요약이나 기억하고 싶은 문장을 적어 보세요.'}</div>
       <button type="button" class="big-btn dh" data-action="memo-edit">${b.memo ? '메모 수정' : '메모 쓰기'}</button>`;
  return `<div class="sheet" role="dialog" aria-label="${esc(b.title)} 상세">
    <div class="sheet-hd" style="background:${color}">
      <button type="button" class="icon-btn" data-action="close" aria-label="목록으로 돌아가기">${svg('<path d="M15 5l-7 7 7 7"/>', 20, 3)}</button>
      <span class="px" style="font-size:12px">${noStr(b.no)}</span>
      <button type="button" class="icon-btn" data-action="edit" data-id="${b.id}" aria-label="수정하기">${svg('<path d="M4 20l4-1 11-11-3-3L5 16z"/>', 20, 2.4)}</button>
    </div>
    <div class="sheet-body" data-keep="detail">
      <div class="detail-top">${cover(b, '')}
        <div class="meta" style="gap:8px">${badge(b.genre)}<h1 class="dh">${esc(b.title)}</h1>
          <span class="sub" style="font-size:14px">${esc(b.author)}</span><span class="stars" style="font-size:20px;letter-spacing:1px">${stars(b.rating)}</span></div></div>
      <div class="info">
        <div class="info-row"><span>읽기 시작한 날</span><span>${fmtDate(b.startDate) || '-'}</span></div>
        <div class="info-row"><span>완독한 날</span><span>${fmtDate(b.endDate) || '-'}</span></div>
        ${days > 0 ? `<div class="info-row"><span>읽은 기간</span><span>${days}일</span></div>` : ''}
      </div>
      <div class="memo-hd"><h2 class="dh">내용 요약 메모</h2></div>
      ${memo}
    </div></div>`;
}

const field = (label, inner, id) => `<div class="field">${id ? `<label for="${id}">${label}</label>` : `<span class="lbl">${label}</span>`}${inner}</div>`;
const inp = (name, value, type = 'text', ph = '') => `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off">`;

function formView(o) {
  const d = S.draft; const k = o.kind; const t = TABS.find((x) => x.id === k);
  const photoLabel = k === 'read' || k === 'wishBook' ? '표지 사진' : '포스터 사진';
  const parts = [];
  if (k === 'seen' || k === 'wishShow') {
    parts.push(field('구분', `<div class="seg" role="group" aria-label="공연 또는 영화">${[['show', '공연'], ['movie', '영화']].map(([v, l]) => `<button type="button" class="${d.subtype === v ? 'on' : ''}" data-action="subtype" data-v="${v}" aria-pressed="${d.subtype === v}">${l}</button>`).join('')}</div>`));
  }
  parts.push(field(photoLabel, `<div class="photo-pick">${cover(d, '', d.photo ? '' : '사진 없음')}
    <div class="photo-btns"><label class="file-label">사진 고르기<input type="file" name="photoFile" accept="image/*" class="sr"></label>
    ${d.photo ? '<button type="button" class="dashed-btn" data-action="photo-remove">사진 빼기</button>' : ''}</div></div>`));
  parts.push(field('제목', inp('title', d.title, 'text', '제목을 입력해요'), 'f-title'));
  if (k === 'read' || k === 'wishBook') parts.push(field('저자', inp('author', d.author), 'f-author'));
  if (k === 'read') {
    parts.push(field('분류', inp('genre', d.genre, 'text', '예: 소설, 고전, 에세이'), 'f-genre'));
    parts.push(`<div class="two">${field('읽기 시작한 날', inp('startDate', d.startDate, 'date'), 'f-startDate')}${field('완독한 날', inp('endDate', d.endDate, 'date'), 'f-endDate')}</div>`);
  }
  if ((k === 'seen' || k === 'wishShow') && d.subtype !== 'movie') {
    parts.push(field('공연 종류', `<select id="f-showType" name="showType">${['뮤지컬', '연극', '콘서트', '기타'].map((v) => `<option ${d.showType === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`, 'f-showType'));
    parts.push(field('캐스팅', inp('cast', d.cast, 'text', '배우 이름을 쉼표로 나눠 적어요'), 'f-cast'));
  }
  if (k === 'seen') {
    parts.push(field('본 날', inp('date', d.date, 'date'), 'f-date'));
    parts.push(field('누구랑 봤는지', inp('with', d.with, 'text', '예: 엄마, 친구, 혼자'), 'f-with'));
  }
  if (k === 'read' || k === 'seen') {
    parts.push(field('별점', `<div class="star-pick" role="group" aria-label="별점">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${d.rating >= n ? 'on' : ''}" data-action="star" data-v="${n}" aria-label="별 ${n}개">★</button>`).join('')}</div>`));
  }
  if (k === 'wishShow' && d.subtype !== 'movie') {
    parts.push(`<div class="two">${field('공연 시작일', inp('periodStart', d.periodStart, 'date'), 'f-periodStart')}${field('공연 종료일', inp('periodEnd', d.periodEnd, 'date'), 'f-periodEnd')}</div>`);
    parts.push(`<div class="field"><span class="lbl">티켓팅 일정</span><span class="hint">필요한 차수만 적으면 돼요.</span>${[0, 1, 2, 3, 4].map((i) => `<div style="display:flex;align-items:center;gap:10px"><label for="f-ticket${i}" style="width:34px;font-weight:700;font-size:14px">${i + 1}차</label><input id="f-ticket${i}" name="ticket${i}" type="datetime-local" value="${esc((d.tickets || [])[i] || '')}" style="flex:1"></div>`).join('')}</div>`);
  }
  if (k === 'wishShow' && d.subtype === 'movie') parts.push(field('개봉일', inp('releaseDate', d.releaseDate, 'date'), 'f-releaseDate'));
  if (o.id) parts.push(`<button type="button" class="del-btn" data-action="delete">이 기록 지우기</button>`);

  const heading = (o.id ? '수정 · ' : d.fromId ? '옮기기 · ' : '새 기록 · ') + KIND_NAME[k];
  return `<div class="sheet" role="dialog" aria-label="${heading}">
    <div class="sheet-hd ${t.light ? 'light' : ''}" style="background:${t.color}">
      <button type="button" class="text-btn" data-action="close">취소</button>
      <h2 class="dh">${heading}</h2>
      <button type="submit" form="item-form" class="text-btn primary">저장</button>
    </div>
    <div class="sheet-body" data-keep="form"><form id="item-form" class="form" novalidate>${parts.join('')}</form></div></div>`;
}

// ---------- 동작 ----------
function collectForm() {
  const f = document.getElementById('item-form'); if (!f || !S.draft) return;
  for (const el of f.elements) {
    if (!el.name || el.name === 'photoFile') continue;
    const m = el.name.match(/^ticket(\d)$/);
    if (m) { S.draft.tickets = S.draft.tickets || ['', '', '', '', '']; S.draft.tickets[+m[1]] = el.value; } else S.draft[el.name] = el.value;
  }
}

function openForm(kind, id, preset) {
  const item = id ? S.items.find((x) => x.id === id) : null;
  S.draft = item ? JSON.parse(JSON.stringify(item)) : { ...DEFAULTS[kind](), ...(preset || {}) };
  if (kind === 'wishShow') S.draft.tickets = [0, 1, 2, 3, 4].map((i) => (S.draft.tickets || [])[i] || '');
  S.overlay = { type: 'form', kind, id: id || null };
  render();
}

function nextNo() { return ofKind('read').reduce((m, b) => Math.max(m, b.no || 0), 0) + 1; }

function report(p) { p.catch((err) => alert('저장하지 못했어요: ' + err.message)); }

function saveForm() {
  collectForm();
  const d = S.draft; const o = S.overlay;
  if (!d.title || !d.title.trim()) { alert('제목을 입력해 주세요.'); return; }
  const data = {};
  for (const f of FIELDS[o.kind]) if (d[f] !== undefined) data[f] = d[f];
  data.kind = o.kind; data.title = d.title.trim(); data.rating = Number(d.rating || 0);
  if (!data.createdAt) data.createdAt = Date.now();
  if (o.kind === 'read' && !data.no) data.no = nextNo();
  const ref = o.id ? doc(itemsCol(), o.id) : doc(itemsCol());
  report(setDoc(ref, data));
  if (d.fromId) report(deleteDoc(doc(itemsCol(), d.fromId)));
  const backTo = o.id && o.kind === 'read' && S.overlay.from === 'detail';
  S.draft = null;
  S.overlay = backTo ? { type: 'detail', id: o.id } : null;
  if (!o.id && S.tab !== o.kind) { S.tab = o.kind; keep('tab', o.kind); }
  render();
}

function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요')); };
    img.src = url;
  });
}

const actions = {
  login: async () => {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider);
      else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') { S.error = '로그인하지 못했어요: ' + e.message; render(); }
    }
  },
  logout: () => { if (confirm('로그아웃할까요?')) signOut(auth); },
  tab: (el) => { S.tab = el.dataset.v; keep('tab', S.tab); render(); },
  sort: (el) => { S.sortRead = el.dataset.v; keep('sortRead', S.sortRead); render(); },
  filter: (el) => { S.filterSeen = el.dataset.v; render(); },
  add: () => openForm(S.tab),
  open: (el) => { S.overlay = { type: 'detail', id: el.dataset.id }; render(); },
  edit: (el) => {
    const it = S.items.find((x) => x.id === el.dataset.id); if (!it) return;
    const from = S.overlay && S.overlay.type === 'detail' ? 'detail' : null;
    openForm(it.kind, it.id); S.overlay.from = from;
  },
  close: () => {
    if (S.overlay && S.overlay.type === 'form' && S.overlay.from === 'detail') S.overlay = { type: 'detail', id: S.overlay.id };
    else S.overlay = null;
    S.draft = null; render();
  },
  promote: (el) => {
    const it = S.items.find((x) => x.id === el.dataset.id); if (!it) return;
    if (it.kind === 'wishBook') openForm('read', null, { title: it.title, author: it.author || '', photo: it.photo || '', fromId: it.id });
    else openForm('seen', null, { subtype: it.subtype || 'show', title: it.title, showType: it.showType || '뮤지컬', cast: it.cast || '', photo: it.photo || '', fromId: it.id });
  },
  subtype: (el) => { collectForm(); S.draft.subtype = el.dataset.v; render(); },
  star: (el) => { collectForm(); const n = +el.dataset.v; S.draft.rating = S.draft.rating === n ? 0 : n; render(); },
  'photo-remove': () => { collectForm(); S.draft.photo = ''; render(); },
  delete: () => {
    if (!confirm('이 기록을 지울까요? 지우면 되돌릴 수 없어요.')) return;
    report(deleteDoc(doc(itemsCol(), S.overlay.id)));
    S.overlay = null; S.draft = null; render();
  },
  'memo-edit': () => { S.overlay.memoEditing = true; render(); const t = document.getElementById('memo-text'); if (t) t.focus(); },
  'memo-cancel': () => { S.overlay.memoEditing = false; render(); },
  'memo-save': () => {
    const t = document.getElementById('memo-text');
    report(setDoc(doc(itemsCol(), S.overlay.id), { memo: t ? t.value : '' }, { merge: true }));
    S.overlay.memoEditing = false; render();
  },
};

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !root.contains(el)) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});
root.addEventListener('submit', (e) => { if (e.target.id === 'item-form') { e.preventDefault(); saveForm(); } });
root.addEventListener('change', async (e) => {
  if (e.target.name !== 'photoFile' || !e.target.files[0]) return;
  collectForm();
  try { S.draft.photo = await compress(e.target.files[0]); } catch (err) { alert(err.message); }
  render();
});

render();
