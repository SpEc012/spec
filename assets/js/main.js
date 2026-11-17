// ─────────────────────────────────────────────────────────────
//  SpEc — page controller
// ─────────────────────────────────────────────────────────────
import { profile, views, badges, socials, links, playlist, sceneDefaults } from './config.js';
import { icons } from './icons.js';
import { AudioEngine, store } from './audio.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ───────── pixel moon for the enter screen ─────────
function pixelMoonSVG(n = 16) {
  const R = n * 0.44, cx = n / 2, cy = n / 2, ox = n * 0.66, oy = n * 0.38, R2 = n * 0.38;
  const fill = { L: '#ffe2ff', M: '#f6b8ff', D: '#d98cf0' };
  let rects = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = (px - cx) ** 2 + (py - cy) ** 2 <= R * R;
      const b = (px - ox) ** 2 + (py - oy) ** 2 <= R2 * R2;
      if (!a || b) continue;
      const d = Math.sqrt((px - ox) ** 2 + (py - oy) ** 2) - R2;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill[d < 1.2 ? 'L' : d < 2.6 ? 'M' : 'D']}"/>`;
    }
  }
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// ───────── render ─────────
function render() {
  $('avatar-img').src = profile.avatar;
  $('avatar-img').alt = `${profile.displayName}'s avatar`;
  $('display-name').textContent = profile.displayName;
  document.querySelector('.enter-moon').innerHTML = pixelMoonSVG(16);

  const loc = $('location');
  if (profile.location) loc.innerHTML = `${icons['map-pin']}<span>${esc(profile.location)}</span>`;
  else loc.hidden = true;

  $('badges').innerHTML = badges
    .map((b) => `<li class="badge" style="--c:${b.color}" data-tip="${esc(b.label)}" tabindex="0" aria-label="${esc(b.label)}">${icons[b.icon] ?? ''}</li>`)
    .join('');

  const glow = {
    discord: '#8b93ff', youtube: '#ff4f6d', tiktok: '#6ff0ff', instagram: '#ff6fd8', x: '#e4dcff',
    twitch: '#b48cff', spotify: '#5dffa8', steam: '#8fd0ff', github: '#e4dcff', soundcloud: '#ff9a5c',
  };
  $('socials').innerHTML = socials
    .map((s) => {
      const placeholder = !s.copy && (!s.url || s.url === '#');
      const attrs = s.copy
        ? `href="#" data-copy="${esc(s.copy)}"`
        : `href="${esc(s.url || '#')}" ${placeholder ? 'data-placeholder="1"' : 'target="_blank" rel="noopener"'}`;
      const tip = s.copy ? `${s.label} · copy` : s.label;
      return `<a class="social" ${attrs} data-tip="${esc(tip)}" aria-label="${esc(s.label)}" style="--hc:${glow[s.icon] || '#ff6fd8'}">${icons[s.icon] ?? ''}</a>`;
    })
    .join('');

  // discord widget
  $('dw-name').textContent = profile.displayName;
  $('dw-user').textContent = profile.username;
  $('dw-status').textContent = profile.status;
  $('dw-icon').innerHTML = icons.discord;

  // chips
  $('views-ico').innerHTML = icons.eye;
  $('flip-ico').innerHTML = icons['refresh-cw'];
  $('flip-back-ico').innerHTML = icons['undo-2'];

  // back
  $('about').textContent = profile.about;
  const [y, m, d] = profile.memberSince.split('-').map(Number);
  const since = new Date(y, m - 1, d); // local date, so it never slips a day
  $('member-since').textContent = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(since);
  $('links').innerHTML = links
    .map(
      (l) => `<a class="link-btn" href="${esc(l.url)}" target="_blank" rel="noopener">
        <span class="ico">${icons[l.icon] ?? icons.globe}</span><span>${esc(l.label)}</span>
        <span class="arrow">${icons['arrow-up-right']}</span></a>`
    )
    .join('');

  // player chrome
  $('prev-btn').innerHTML = icons['skip-back'];
  $('next-btn').innerHTML = icons['skip-forward'];
  const multi = playlist.length > 1;
  $('prev-btn').hidden = !multi;
  $('next-btn').hidden = !multi;
}

// ───────── toast ─────────
let toastTimer;
function toast(msg, ms = 2400) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), ms);
}

// ───────── typing ─────────
async function typeOnce(el, text, speed = 45) {
  el.textContent = '';
  if (reducedMotion) {
    el.textContent = text;
    return;
  }
  for (const ch of text) {
    el.textContent += ch;
    await sleep(speed + Math.random() * 30);
  }
}

// types a line, waits, backspaces it, moves on — forever
async function taglineLoop(el, lines) {
  if (!lines.length) return;
  if (reducedMotion) {
    el.textContent = lines[0];
    return;
  }
  for (let i = 0; ; i++) {
    const chars = Array.from(lines[i % lines.length]);
    for (let k = 1; k <= chars.length; k++) {
      el.textContent = chars.slice(0, k).join('');
      const ch = chars[k - 1];
      await sleep(34 + Math.random() * 38 + (/[,.]/.test(ch) ? 220 : 0));
    }
    await sleep(2800);
    for (let k = chars.length; k >= 0; k--) {
      el.textContent = chars.slice(0, k).join('');
      await sleep(16);
    }
    await sleep(420);
  }
}

// ───────── state ─────────
const settings = {
  weather: store.get('weather', sceneDefaults.weather),
  pixel: store.get('pixel', false),
};
const WEATHERS = ['rain', 'snow', 'clear'];
const WEATHER_LABEL = { rain: 'rainy night', snow: 'snowy night', clear: 'clear night' };
const WEATHER_ICON = { rain: 'cloud-rain', snow: 'snowflake', clear: 'cloud-moon' };

let scene = null;
const audio = new AudioEngine(playlist, { volume: sceneDefaults.volume, ambience: sceneDefaults.rainSound });

// ───────── boot ─────────
render();
initCursor();
initTitle();
initClock();
initVolume();
updateWeatherUI();

const progress = { total: 4, done: 0 };
const step = () => {
  progress.done++;
  $('enter-progress').style.width = `${(progress.done / progress.total) * 100}%`;
};

const loadScene = (async () => {
  const { CityScene, webglAvailable } = await import('./scene.js');
  if (!webglAvailable()) throw new Error('no webgl');
  scene = new CityScene($('city'), { reducedMotion });
  scene.setWeather(settings.weather);
  if (settings.pixel) scene.setPixelMode(true);
  scene.onLightning = () => audio.thunder();
  scene.start();
  if (new URLSearchParams(location.search).has('debug')) window.__spec = { scene, audio };
})()
  .catch((err) => {
    console.warn('[spec] 3D scene unavailable, using the flat sky', err);
    document.documentElement.classList.add('no-webgl');
  })
  .finally(step);

const loadFonts = (document.fonts?.ready ?? Promise.resolve()).finally(step);
const loadImages = ($('avatar-img').decode?.() ?? Promise.resolve()).catch(() => {}).finally(step);
const loadAudio = new Promise((res) => {
  if (audio.el.readyState >= 3) return res();
  audio.el.addEventListener('canplay', res, { once: true });
  audio.el.addEventListener('error', res, { once: true });
  setTimeout(res, 5000); // mobile browsers often won't preload — don't block
}).finally(step);

const enterEl = $('enter');
enterEl.classList.add('is-loading');
typeOnce($('enter-text'), 'waking the city', 40);

let entered = false;
Promise.all([loadScene, loadFonts, loadImages, loadAudio]).then(async () => {
  enterEl.classList.remove('is-loading');
  enterEl.classList.add('is-ready');
  await sleep(250);
  if (!entered) typeOnce($('enter-text'), 'click to enter', 55);
});

// ───────── enter ─────────
async function enter() {
  if (entered) return;
  entered = true;
  document.body.classList.add('is-entered');
  document.body.classList.remove('is-locked');
  enterEl.classList.add('is-gone');
  setTimeout(() => (enterEl.hidden = true), 1300);

  audio.weather = settings.weather;
  audio.enter();
  await loadScene;
  scene?.flyIn();

  initTilt();
  initFlip();
  initPlayer();
  initDock();
  initPresence();
  initViews();

  await sleep(reducedMotion ? 0 : 1500);
  taglineLoop($('tagline'), profile.taglines);
}

enterEl.addEventListener('click', enter);
window.addEventListener('keydown', (e) => {
  if (!entered && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    enter();
  }
});

// ───────── 3D tilt ─────────
function initTilt() {
  const stage = $('stage'); // --rx/--ry inherit to the glass + card
  const card = $('card');
  const target = { x: 0, y: 0, gx: 50, gy: 0 };
  const cur = { x: 0, y: 0, gx: 50, gy: 0 };
  let lastMove = 0;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = (e.clientY / innerHeight) * 2 - 1;
    target.x = nx;
    target.y = ny;
    const r = card.getBoundingClientRect();
    target.gx = ((e.clientX - r.left) / r.width) * 100;
    target.gy = ((e.clientY - r.top) / r.height) * 100;
    lastMove = performance.now();
    scene?.setPointer(nx, -ny);
  });
  document.documentElement.addEventListener('pointerleave', () => {
    target.x = target.y = 0;
    scene?.setPointer(0, 0);
  });

  // phones: tilt with the device where the browser allows it
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    target.x = Math.max(-1, Math.min(1, e.gamma / 30));
    target.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    lastMove = performance.now();
    scene?.setPointer(target.x, -target.y);
  });

  const strength = reducedMotion ? 0 : 1;
  const loop = (t) => {
    requestAnimationFrame(loop);
    const idle = performance.now() - lastMove > 4000; // gentle sway when nobody's moving
    const tx = idle ? Math.sin(t / 3200) * 0.3 : target.x;
    const ty = idle ? Math.cos(t / 4100) * 0.22 : target.y;
    cur.x += (tx - cur.x) * 0.07;
    cur.y += (ty - cur.y) * 0.07;
    cur.gx += (target.gx - cur.gx) * 0.12;
    cur.gy += (target.gy - cur.gy) * 0.12;
    stage.style.setProperty('--ry', `${(cur.x * 12 * strength).toFixed(3)}deg`);
    stage.style.setProperty('--rx', `${(-cur.y * 9 * strength).toFixed(3)}deg`);
    card.style.setProperty('--gx', `${cur.gx.toFixed(1)}%`);
    card.style.setProperty('--gy', `${cur.gy.toFixed(1)}%`);
  };
  requestAnimationFrame(loop);
}

// ───────── flip ─────────
let flip = () => {};
function initFlip() {
  const stage = $('stage');
  const front = document.querySelector('.face.front');
  const back = document.querySelector('.face.back');
  back.inert = true;
  flip = (moveFocus = false) => {
    const flipped = stage.classList.toggle('is-flipped');
    front.inert = flipped;
    back.inert = !flipped;
    if (moveFocus) setTimeout(() => (flipped ? $('flip-back-btn') : $('flip-btn')).focus({ preventScroll: true }), 500);
  };
  $('flip-btn').addEventListener('click', () => flip(true));
  $('flip-back-btn').addEventListener('click', () => flip(true));
}

// ───────── player ─────────
const fmtTime = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

function initPlayer() {
  const el = audio.el;
  const player = $('player');
  const playBtn = $('play-btn');
  const bar = $('bar');

  const syncTrack = () => {
    $('track-title').textContent = audio.track.title;
    $('track-artist').textContent = audio.track.artist;
    $('back-track').textContent = `${audio.track.title} — ${audio.track.artist}`;
  };
  const syncPlay = () => {
    const playing = !el.paused;
    playBtn.innerHTML = playing ? icons.pause : icons.play;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    player.classList.toggle('is-playing', playing);
  };
  let dragging = false;
  const syncTime = () => {
    if (dragging) return;
    const d = el.duration, c = el.currentTime;
    const p = isFinite(d) && d > 0 ? (c / d) * 100 : 0;
    $('bar-fill').style.width = `${p}%`;
    $('bar-knob').style.left = `${p}%`;
    $('time-cur').textContent = fmtTime(c);
    $('time-dur').textContent = fmtTime(d);
    bar.setAttribute('aria-valuenow', Math.round(p));
  };

  el.addEventListener('play', syncPlay);
  el.addEventListener('pause', syncPlay);
  el.addEventListener('timeupdate', syncTime);
  el.addEventListener('loadedmetadata', () => { syncTime(); syncTrack(); });
  syncTrack(); syncPlay(); syncTime();

  playBtn.addEventListener('click', () => audio.toggle());
  $('next-btn').addEventListener('click', () => { audio.next(); syncTrack(); });
  $('prev-btn').addEventListener('click', () => { audio.prev(); syncTrack(); });

  // seeking
  const seekAt = (clientX) => {
    const r = bar.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    $('bar-fill').style.width = `${f * 100}%`;
    $('bar-knob').style.left = `${f * 100}%`;
    $('time-cur').textContent = fmtTime(f * el.duration);
    return f;
  };
  bar.addEventListener('pointerdown', (e) => {
    dragging = true;
    bar.classList.add('is-drag');
    bar.setPointerCapture(e.pointerId);
    seekAt(e.clientX);
  });
  bar.addEventListener('pointermove', (e) => dragging && seekAt(e.clientX));
  const endDrag = (e) => {
    if (!dragging) return;
    audio.seek(seekAt(e.clientX));
    dragging = false;
    bar.classList.remove('is-drag');
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') el.currentTime = Math.min(el.duration, el.currentTime + 5);
    if (e.key === 'ArrowLeft') el.currentTime = Math.max(0, el.currentTime - 5);
  });

  // visualizer + music-reactive city
  const viz = $('viz');
  const vctx = viz.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  viz.width = viz.clientWidth * dpr;
  viz.height = viz.clientHeight * dpr;
  const grad = vctx.createLinearGradient(0, 0, viz.width, 0);
  grad.addColorStop(0, '#6ff0ff');
  grad.addColorStop(0.5, '#b49cff');
  grad.addColorStop(1, '#ff6fd8');
  const N = 10;
  const loop = (t) => {
    requestAnimationFrame(loop);
    audio.update();
    scene?.setAudioLevel(reducedMotion ? 0 : audio.level);
    const bars = audio.bars(N, t / 1000);
    vctx.clearRect(0, 0, viz.width, viz.height);
    vctx.fillStyle = grad;
    const bw = viz.width / N;
    const px = 2 * dpr; // pixel-stepped bars to match the art style
    for (let i = 0; i < N; i++) {
      const h = Math.max(px, Math.round((bars[i] * viz.height) / px) * px);
      vctx.fillRect(Math.round(i * bw + bw * 0.2), viz.height - h, Math.ceil(bw * 0.6), h);
    }
  };
  requestAnimationFrame(loop);
}

// ───────── volume (top-left) ─────────
function initVolume() {
  const vol = $('vol');
  const btn = $('vol-btn');
  const sync = () => {
    const v = audio.muted ? 0 : audio.volume;
    vol.value = v;
    vol.style.setProperty('--v', `${v * 100}%`);
    btn.innerHTML = v === 0 ? icons['volume-x'] : v < 0.5 ? icons['volume-1'] : icons['volume-2'];
    btn.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
  };
  vol.addEventListener('input', () => { audio.setVolume(parseFloat(vol.value)); sync(); });
  btn.addEventListener('click', () => { audio.setMuted(!audio.muted); sync(); });
  audio.syncVol = sync;
  sync();
}

// ───────── dock / shortcuts / socials ─────────
function updateWeatherUI() {
  const w = settings.weather;
  $('weather-btn').innerHTML = icons[WEATHER_ICON[w]];
  $('weather-btn').dataset.tip = `${WEATHER_LABEL[w]} · W`;
  $('hud-weather').textContent = WEATHER_LABEL[w];
}

function initDock() {
  const ambBtn = $('ambience-btn');
  const pxBtn = $('pixel-btn');
  ambBtn.innerHTML = icons.waves;
  pxBtn.innerHTML = icons['grid-2x2'];
  const syncAmb = () => ambBtn.classList.toggle('is-on', audio.ambienceOn);
  const syncPx = () => pxBtn.classList.toggle('is-on', settings.pixel);
  syncAmb();
  syncPx();

  const cycleWeather = () => {
    settings.weather = WEATHERS[(WEATHERS.indexOf(settings.weather) + 1) % WEATHERS.length];
    store.set('weather', settings.weather);
    scene?.setWeather(settings.weather);
    audio.setWeather(settings.weather);
    updateWeatherUI();
    toast(`${WEATHER_LABEL[settings.weather]} ✦`);
  };
  const toggleAmb = () => {
    audio.setAmbience(!audio.ambienceOn);
    syncAmb();
    toast(audio.ambienceOn ? 'ambience on — listen to the weather' : 'ambience off');
  };
  const togglePx = () => {
    settings.pixel = !settings.pixel;
    store.set('pixel', settings.pixel);
    scene?.setPixelMode(settings.pixel);
    syncPx();
    toast(settings.pixel ? 'pixel mode ▦' : 'hd mode');
  };
  const toggleMute = () => {
    audio.setMuted(!audio.muted);
    audio.syncVol?.();
  };

  $('weather-btn').addEventListener('click', cycleWeather);
  ambBtn.addEventListener('click', toggleAmb);
  pxBtn.addEventListener('click', togglePx);

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'w') cycleWeather();
    else if (k === 'a') toggleAmb();
    else if (k === 'p') togglePx();
    else if (k === 'm') toggleMute();
    else if (k === 'f') flip(true);
    else if (k === ' ' && !e.target.closest('button, a, [role="slider"]')) {
      e.preventDefault();
      audio.toggle();
    }
  });

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`copied “${text}” ✦`);
    } catch {
      toast(text);
    }
  };
  $('socials').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.dataset.copy) {
      e.preventDefault();
      copy(a.dataset.copy);
    } else if (a.dataset.placeholder) {
      e.preventDefault();
      toast(`${a.getAttribute('aria-label').toLowerCase()} link coming soon ☾`);
    }
  });
  $('discord-widget').addEventListener('click', () => copy(profile.username));

  const t = audio.track;
  setTimeout(() => toast(`♫ now playing — ${t.title} · ${t.artist}`, 3600), 1800);
}

// ───────── view counter (counterapi.dev) ─────────
async function initViews() {
  if (!views.enabled) return;
  const base = `https://api.counterapi.dev/v1/${encodeURIComponent(views.namespace)}/${encodeURIComponent(views.key)}`;
  const today = new Date().toDateString();
  const firstToday = store.get('viewed', '') !== today; // one view per browser per day
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(firstToday ? `${base}/up` : base, { signal: ctrl.signal });
    if (!res.ok) return;
    const data = await res.json();
    const n = Number(data?.count);
    if (!Number.isFinite(n)) return;
    if (firstToday) store.set('viewed', today);
    $('views-chip').hidden = false;
    const el = $('views');
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1400);
      el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))).toLocaleString();
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  } catch {
    /* offline or blocked — the chip just stays hidden */
  }
}

// ───────── Discord presence via Lanyard (optional) ─────────
function initPresence() {
  const id = profile.discordId?.trim();
  if (!id) return;
  const dot = $('status-dot');
  const labels = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline' };
  const poll = async () => {
    try {
      const res = await fetch(`https://api.lanyard.rest/v1/users/${encodeURIComponent(id)}`);
      const { success, data } = await res.json();
      if (!success) return;
      dot.dataset.status = data.discord_status;
      dot.title = labels[data.discord_status] || '';
      const custom = data.activities?.find((a) => a.type === 4);
      const game = data.activities?.find((a) => a.type === 0);
      let line = esc(custom?.state || profile.status);
      if (data.listening_to_spotify && data.spotify) line = `${icons.music}${esc(data.spotify.song)} — ${esc(data.spotify.artist)}`;
      else if (game) line = `${icons['gamepad-2']}playing ${esc(game.name)}`;
      $('dw-status').innerHTML = line;
    } catch {}
  };
  poll();
  setInterval(poll, 30000);
}

// ───────── clock + tab title ─────────
function initClock() {
  const tick = () => {
    const s = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();
    $('clock').textContent = s;
    $('back-clock').textContent = s;
  };
  tick();
  setInterval(tick, 10000);
}

function initTitle() {
  const full = `${profile.displayName} ✦ ${profile.username}`;
  const frames = [];
  for (let i = 1; i <= full.length; i++) frames.push(full.slice(0, i));
  for (let i = 0; i < 6; i++) frames.push(full);
  for (let i = full.length - 1; i >= 1; i--) frames.push(full.slice(0, i));
  let i = 0;
  setInterval(() => (document.title = frames[i++ % frames.length] || profile.displayName), 380);
}

// ───────── cursor + pixel sparkle trail ─────────
function initCursor() {
  if (!finePointer) return;
  document.body.classList.add('custom-cursor');
  const cur = document.querySelector('.cursor');
  const ring = cur.querySelector('.cursor-ring');
  const dot = cur.querySelector('.cursor-dot');
  const canvas = $('sparkles');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const fit = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  fit();
  addEventListener('resize', fit);

  const COLORS = ['#ff6fd8', '#6ff0ff', '#b49cff', '#ffe2ff'];
  const parts = [];
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const ringPos = { ...pos };
  let last = { ...pos };

  const spawn = (x, y, n, burst = false) => {
    if (reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = burst ? 1.5 + Math.random() * 3 : Math.random() * 0.6;
      parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (burst ? 0.5 : 0.2),
        life: 1,
        decay: 0.012 + Math.random() * 0.02,
        size: (burst ? 2 : 1.5) + Math.random() * 2,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        plus: Math.random() < 0.35,
      });
    }
  };

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    cur.classList.add('is-active');
    pos.x = e.clientX;
    pos.y = e.clientY;
    if (Math.hypot(pos.x - last.x, pos.y - last.y) > 14) {
      spawn(pos.x, pos.y, 1);
      last = { ...pos };
    }
    cur.classList.toggle('is-hover', !!e.target.closest('a, button, [role="button"], [role="slider"], input, .badge'));
  });
  addEventListener('pointerdown', (e) => {
    cur.classList.add('is-down');
    if (e.pointerType === 'mouse') spawn(e.clientX, e.clientY, 14, true);
  });
  addEventListener('pointerup', () => cur.classList.remove('is-down'));
  document.documentElement.addEventListener('pointerleave', () => cur.classList.remove('is-active'));

  const loop = () => {
    requestAnimationFrame(loop);
    ringPos.x += (pos.x - ringPos.x) * 0.2;
    ringPos.y += (pos.y - ringPos.y) * 0.2;
    dot.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%, -50%)`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.02;
      p.vx *= 0.98;
      p.life -= p.decay;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      const s = Math.round(p.size * dpr);
      const x = Math.round(p.x * dpr), y = Math.round(p.y * dpr);
      if (p.plus) {
        ctx.fillRect(x - s, y, s * 3, s);
        ctx.fillRect(x, y - s, s, s * 3);
      } else ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  };
  loop();
}
