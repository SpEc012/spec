// ─────────────────────────────────────────────────────────────
//  SpEc — page controller
// ─────────────────────────────────────────────────────────────
import { profile, badges, socials, connections, playlist, sceneDefaults } from './config.js';
import { icons } from './icons.js';
import { AudioEngine, store } from './audio.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── pixel art helpers ─────────
function pixelSVG(rows, colors, scale = 1) {
  const h = rows.length, w = rows[0].length;
  let rects = '';
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (colors[ch]) rects += `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${colors[ch]}"/>`;
    })
  );
  return `<svg viewBox="0 0 ${w * scale} ${h * scale}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

const SKULL = [
  '..XXXXX..',
  '.XXXXXXS.',
  'XXXXXXXSS',
  'XooXXooXS',
  'XooXXooXS',
  'XXXXoXXSS',
  '.XXXXXXS.',
  '..XoXoS..',
  '..XXXSS..',
];
const skullSVG = pixelSVG(SKULL, { X: '#ffffff', S: '#cdb8ff', o: '#1a0b2e' });

function pixelMoonSVG(n = 16) {
  const rows = [];
  const R = n * 0.44, cx = n / 2, cy = n / 2, ox = n * 0.66, oy = n * 0.38, R2 = n * 0.38;
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = (px - cx) ** 2 + (py - cy) ** 2 <= R * R;
      const b = (px - ox) ** 2 + (py - oy) ** 2 <= R2 * R2;
      if (a && !b) {
        const d = Math.sqrt((px - ox) ** 2 + (py - oy) ** 2) - R2;
        row += d < 1.2 ? 'L' : d < 2.6 ? 'M' : 'D';
      } else row += '.';
    }
    rows.push(row);
  }
  return pixelSVG(rows, { L: '#ffe2ff', M: '#f6b8ff', D: '#d98cf0' });
}

// ───────── render profile ─────────
function renderProfile() {
  $('banner').src = profile.banner;
  $('avatar-img').src = profile.avatar;
  $('avatar-img').alt = `${profile.displayName}'s avatar`;
  const name = $('display-name');
  name.textContent = profile.displayName;
  name.dataset.text = profile.displayName;
  $('username').textContent = profile.username;
  $('status-text').textContent = profile.status;
  $('skulls').innerHTML = skullSVG + skullSVG;
  document.querySelector('.enter-moon').innerHTML = pixelMoonSVG(16);

  $('badges').innerHTML = badges
    .map(
      (b) =>
        `<li class="badge" style="--c:${b.color}" data-tip="${b.label}" tabindex="0" aria-label="${b.label}">${icons[b.icon] ?? ''}</li>`
    )
    .join('');

  const brandHover = {
    discord: '#8b93ff', youtube: '#ff4f6d', tiktok: '#6ff0ff', instagram: '#ff6fd8', x: '#d9d2ff',
    twitch: '#b48cff', spotify: '#5dffa8', steam: '#8fd0ff', github: '#e4dcff', soundcloud: '#ff9a5c',
  };
  $('socials').innerHTML = socials
    .map((s) => {
      const placeholder = !s.copy && (!s.url || s.url === '#');
      const attrs = s.copy
        ? `href="#" data-copy="${s.copy}"`
        : `href="${s.url || '#'}" ${placeholder ? 'data-placeholder="1"' : 'target="_blank" rel="noopener"'}`;
      return `<a class="social${placeholder ? ' is-placeholder' : ''}" ${attrs} data-tip="${s.copy ? `${s.label} · click to copy` : s.label}" aria-label="${s.label}" style="--hc:${brandHover[s.icon] || '#ff6fd8'}">${icons[s.icon] ?? ''}</a>`;
    })
    .join('');

  $('connections').innerHTML = connections
    .map(
      (c) => `<li><a class="connection" href="${c.url}" target="_blank" rel="noopener">
        <span class="ico">${icons[c.icon] ?? icons.globe}</span>
        <span class="label">${c.label}</span>
        <span class="arrow">${icons['arrow-up-right']}</span></a></li>`
    )
    .join('');

  // member since (parse as a local date so it never slips a day)
  const [y, m, d] = profile.memberSince.split('-').map(Number);
  const since = new Date(y, m - 1, d);
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(since);
  const now = new Date();
  let months = (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth());
  if (now.getDate() < since.getDate()) months--;
  const yrs = Math.floor(months / 12), mo = months % 12;
  const rel = [yrs && `${yrs}y`, mo && `${mo}mo`].filter(Boolean).join(' ') || 'new';
  $('member-since').innerHTML = `${icons.calendar}<span>${fmt}</span><small>· ${rel}</small>`;

  // player chrome
  $('prev-btn').innerHTML = icons['skip-back'];
  $('next-btn').innerHTML = icons['skip-forward'];
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

// ───────── typewriter ─────────
async function typeInto(el, text, { speed = 32, jitter = 30, caret = true } = {}) {
  el.textContent = '';
  const span = document.createElement('span');
  el.append(span);
  let c;
  if (caret) {
    c = document.createElement('span');
    c.className = 'caret';
    el.append(c);
  }
  if (reducedMotion) {
    span.textContent = text;
    return c;
  }
  for (const ch of text) {
    span.textContent += ch;
    await sleep(speed + Math.random() * jitter + (/[,.]/.test(ch) ? 180 : 0));
  }
  return c;
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
renderProfile();
initCursor();
initTitle();
initClock();
updateWeatherUI();

const progress = { total: 4, done: 0 };
function step() {
  progress.done++;
  $('enter-progress').style.width = `${(progress.done / progress.total) * 100}%`;
}

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
const loadImages = Promise.all(
  [$('avatar-img'), $('banner')].map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
).finally(step);
const loadAudio = new Promise((res) => {
  if (audio.el.readyState >= 3) return res();
  audio.el.addEventListener('canplay', res, { once: true });
  audio.el.addEventListener('error', res, { once: true });
  setTimeout(res, 5000); // mobile browsers often won't preload — don't block
}).finally(step);

typeInto($('enter-text'), 'waking the city', { caret: false, speed: 40 });

const enterEl = $('enter');
enterEl.classList.add('is-loading');
let ready = false;
Promise.all([loadScene, loadFonts, loadImages, loadAudio]).then(async () => {
  ready = true;
  enterEl.classList.remove('is-loading');
  enterEl.classList.add('is-ready');
  await sleep(250);
  if (!entered) typeInto($('enter-text'), 'click to enter', { caret: false, speed: 55 });
});

// ───────── enter ─────────
let entered = false;
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
  initPlayer();
  initDock();
  initPresence();

  await sleep(reducedMotion ? 0 : 1700);
  const caret = await typeInto($('bio'), profile.bio, { speed: 26, jitter: 26 });
  setTimeout(() => caret?.remove(), 2600);
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
  const tilt = $('stage'); // --rx/--ry inherit to the glass + tilt layers
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
  document.addEventListener('pointerleave', () => {
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
    // gentle idle sway when nobody's moving
    const idle = performance.now() - lastMove > 4000;
    const tx = idle ? Math.sin(t / 3200) * 0.25 : target.x;
    const ty = idle ? Math.cos(t / 4100) * 0.18 : target.y;
    cur.x += (tx - cur.x) * 0.07;
    cur.y += (ty - cur.y) * 0.07;
    cur.gx += (target.gx - cur.gx) * 0.12;
    cur.gy += (target.gy - cur.gy) * 0.12;
    tilt.style.setProperty('--ry', `${(cur.x * 11 * strength).toFixed(3)}deg`);
    tilt.style.setProperty('--rx', `${(-cur.y * 8 * strength).toFixed(3)}deg`);
    card.style.setProperty('--gx', `${cur.gx.toFixed(1)}%`);
    card.style.setProperty('--gy', `${cur.gy.toFixed(1)}%`);
  };
  requestAnimationFrame(loop);
}

// ───────── player ─────────
function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function initPlayer() {
  const el = audio.el;
  const player = $('player');
  const playBtn = $('play-btn');
  const bar = $('bar');
  const vol = $('vol');
  const volBtn = $('vol-btn');

  const syncTrack = () => {
    $('track-title').textContent = audio.track.title;
    $('track-artist').textContent = audio.track.artist;
    player.querySelector('.loop-tag').textContent = playlist.length > 1 ? `${audio.index + 1} / ${playlist.length}` : 'on repeat';
  };
  const syncPlay = () => {
    const playing = !el.paused;
    playBtn.innerHTML = playing ? icons.pause : icons.play;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    player.classList.toggle('is-playing', playing);
  };
  const syncVol = () => {
    const v = audio.muted ? 0 : audio.volume;
    vol.value = v;
    vol.style.setProperty('--v', `${v * 100}%`);
    const ic = v === 0 ? icons['volume-x'] : v < 0.5 ? icons['volume-1'] : icons['volume-2'];
    volBtn.innerHTML = ic;
    $('mute-btn').innerHTML = ic;
    $('mute-btn').classList.toggle('is-on', !audio.muted);
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
  syncTrack(); syncPlay(); syncVol(); syncTime();

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

  vol.addEventListener('input', () => { audio.setVolume(parseFloat(vol.value)); syncVol(); });
  volBtn.addEventListener('click', () => { audio.setMuted(!audio.muted); syncVol(); });
  audio.syncVol = syncVol;

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
  const N = 14;
  const loop = (t) => {
    requestAnimationFrame(loop);
    audio.update();
    scene?.setAudioLevel(reducedMotion ? 0 : audio.level);
    const bars = audio.bars(N, t / 1000);
    vctx.clearRect(0, 0, viz.width, viz.height);
    vctx.fillStyle = grad;
    vctx.shadowColor = '#ff6fd8';
    vctx.shadowBlur = 6 * dpr;
    const bw = viz.width / N;
    // pixel-stepped bars to match the art style
    const px = 3 * dpr;
    for (let i = 0; i < N; i++) {
      const h = Math.max(px, Math.round((bars[i] * viz.height * 0.95) / px) * px);
      vctx.fillRect(Math.round(i * bw + bw * 0.18), viz.height - h, Math.ceil(bw * 0.64), h);
    }
  };
  requestAnimationFrame(loop);
}

// ───────── dock / settings ─────────
function updateWeatherUI() {
  const w = settings.weather;
  $('weather-chip').innerHTML = `${icons[WEATHER_ICON[w]]}<span>${WEATHER_LABEL[w]}</span>`;
  $('weather-btn').innerHTML = icons[WEATHER_ICON[w]];
  $('weather-btn').dataset.tip = `weather: ${w} · W`;
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
  audio.syncVol?.();

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
  $('mute-btn').addEventListener('click', toggleMute);

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'w') cycleWeather();
    else if (k === 'a') toggleAmb();
    else if (k === 'p') togglePx();
    else if (k === 'm') toggleMute();
    else if (k === ' ' && !e.target.closest('button, a, [role="slider"]')) {
      e.preventDefault();
      audio.toggle();
    }
  });

  // socials: copy-to-clipboard + placeholder notice
  $('socials').addEventListener('click', async (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.dataset.copy) {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(a.dataset.copy);
        toast(`copied “${a.dataset.copy}” ✦`);
      } catch {
        toast(a.dataset.copy);
      }
    } else if (a.dataset.placeholder) {
      e.preventDefault();
      toast(`${a.getAttribute('aria-label').toLowerCase()} link coming soon ☾`);
    }
  });

  const t = audio.track;
  setTimeout(() => toast(`♫ now playing — ${t.title} · ${t.artist}`, 3600), 1800);
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
      dot.setAttribute('aria-label', dot.title);
      const custom = data.activities?.find((a) => a.type === 4);
      if (custom?.state) $('status-text').textContent = custom.state;
      let line = '';
      if (data.listening_to_spotify && data.spotify) line = `${icons.music}<span>${data.spotify.song} — ${data.spotify.artist}</span>`;
      else {
        const game = data.activities?.find((a) => a.type === 0);
        if (game) line = `${icons['gamepad-2']}<span>playing ${game.name}</span>`;
      }
      $('presence').hidden = !line;
      if (line) $('presence-text').innerHTML = line;
    } catch {}
  };
  poll();
  setInterval(poll, 30000);
}

// ───────── clock + tab title ─────────
function initClock() {
  const tick = () => {
    const d = new Date();
    $('clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();
    $('hud-weather').textContent = `♫ ${audio.track.title.toLowerCase()}`;
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
  setInterval(() => {
    document.title = frames[i++ % frames.length] || profile.displayName;
  }, 380);
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
    const dist = Math.hypot(pos.x - last.x, pos.y - last.y);
    if (dist > 14) {
      spawn(pos.x, pos.y, 1);
      last = { ...pos };
    }
    const hover = e.target.closest('a, button, [role="button"], [role="slider"], input, .badge');
    cur.classList.toggle('is-hover', !!hover);
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
