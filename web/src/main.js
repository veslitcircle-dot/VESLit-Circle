// VESLit Circle site: scrub a pre-rendered camera path on scroll, pin HTML to the frame, play lights-on first.

const HOLD = 12, MOVE = 48;                                   // must match assets/blender/build_room.py
const STOPS = ["wide", "crest", "board", "window", "cabinet", "library"];
const STOP_FRAME = STOPS.map((_, i) => 1 + i * (HOLD + MOVE)); // 1, 61, 121, 181, 241, 301
const LAST_FRAME = STOP_FRAME[STOPS.length - 1] + HOLD;        // 313
// scroll length per segment in viewport heights: holds get reading room, the board most of all
const SEGMENTS = [
  ["hold", 0, 0.5], ["move", 0, 1.0], ["hold", 1, 0.45], ["move", 1, 1.0], ["hold", 2, 1.6], ["move", 2, 1.0],
  ["hold", 3, 0.7], ["move", 3, 1.0], ["hold", 4, 0.9], ["move", 4, 1.0], ["hold", 5, 1.0],
];

const portrait = () => window.innerHeight > window.innerWidth;
const hd = () => Math.max(innerWidth, innerHeight) * Math.min(window.devicePixelRatio || 1, 2) > 1500;
const setName = () => (portrait() ? "mobile" : "desktop") + (hd() ? "" : "_sd");
const lightsName = () => (portrait() ? "lightson_m" : "lightson") + (hd() ? "" : "_sd");

const canvas = document.getElementById("room");
const ctx = canvas.getContext("2d", { alpha: false });
const pinned = document.getElementById("pinned");
const cards = [...document.querySelectorAll(".card")];
const track = document.getElementById("track");
const pre = document.getElementById("preloader");
const preStatus = document.getElementById("preStatus");

// ------------------------------------------------------------------ frame sets
const sets = {};
async function loadSet(name) {
  if (sets[name]) return sets[name];
  const manifest = await fetch(`/frames/${name}/manifest.json`).then(r => r.json()).catch(() => null);
  const set = { name, frames: manifest ? manifest.frames : [], w: manifest?.width || 1280, h: manifest?.height || 800, images: new Map(), loaded: 0 };
  sets[name] = set;
  return set;
}
function loadImage(set, n) {
  if (set.images.has(n)) return set.images.get(n);
  const p = new Promise(res => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => { set.loaded++; res(im); };
    im.onerror = () => res(null);
    im.src = `/frames/${set.name}/frame_${String(n).padStart(4, "0")}.webp`;
  });
  set.images.set(n, p);
  return p;
}
async function preloadAll(set, concurrency = 6, onProgress) {
  const q = [...set.frames];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (q.length) { await loadImage(set, q.shift()); onProgress?.(set.loaded / set.frames.length); }
  }));
}
// nearest rendered frame to a fractional frame number, preferring one that's already decoded
const ready = new Map();   // set.name -> Map(n -> HTMLImageElement)
function nearestReady(set, f) {
  const fr = set.frames; if (!fr.length) return null;
  let lo = 0, hi = fr.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (fr[mid] < f) lo = mid + 1; else hi = mid; }
  const cand = [fr[lo], fr[lo - 1], fr[lo + 1], fr[lo - 2], fr[lo + 2]].filter(n => n !== undefined);
  cand.sort((a, b) => Math.abs(a - f) - Math.abs(b - f));
  const rm = ready.get(set.name) || new Map();
  for (const n of cand) if (rm.get(n)) return rm.get(n);
  for (const n of cand) loadImage(set, n).then(im => { if (im) { if (!ready.has(set.name)) ready.set(set.name, new Map()); ready.get(set.name).set(n, im); } });
  return null;
}
function markReady(set) {
  if (!ready.has(set.name)) ready.set(set.name, new Map());
  for (const [n, p] of set.images) p.then(im => { if (im) ready.get(set.name).set(n, im); });
}

// ------------------------------------------------------------------ drawing
let drawn = { x: 0, y: 0, w: 0, h: 0 };
let lastImg = null;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const set = sets[setName()] || { w: 1280, h: 800 };
  const s = Math.max(innerWidth / set.w, innerHeight / set.h);          // cover
  const w = set.w * s, h = set.h * s;
  drawn = { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w, h };
  pinned.style.transform = `translate(${drawn.x}px, ${drawn.y}px)`;
  pinned.style.width = `${w}px`; pinned.style.height = `${h}px`;
  placeCards();
  if (lastImg) draw(lastImg);
}
function draw(img) {
  lastImg = img;
  ctx.fillStyle = "#0a0806"; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.drawImage(img, drawn.x, drawn.y, drawn.w, drawn.h);
}
function placeCards() {
  const key = portrait() ? "anchorM" : "anchor";
  const M = 16;                                   // keep cards this far inside the viewport
  const visL = -drawn.x + M, visT = -drawn.y + M;  // visible region, in frame (pinned) coordinates
  const visR = -drawn.x + innerWidth - M, visB = -drawn.y + innerHeight - M;
  for (const c of cards) {
    if (c === boardCard) { sizeBoard(); continue; }
    const a = (c.dataset[key] || c.dataset.anchor).split(",").map(Number);
    let x = a[0] * drawn.w, y = a[1] * drawn.h, w = a[2] * drawn.w, h = a[3] * drawn.h;
    w = Math.min(w, visR - visL); h = Math.min(h, visB - visT);
    x = Math.min(Math.max(x, visL), visR - w); y = Math.min(Math.max(y, visT), visB - h);
    c.style.left = `${x}px`; c.style.top = `${y}px`; c.style.width = `${w}px`; c.style.height = `${h}px`;
  }
}

// ------------------------------------------------------------------ notice board projection
// The board card is pinned onto the rendered board face: assets/blender/export_board.py writes the face's
// four corners for every frame, and each tick the card gets the matrix3d that maps its box onto that quad.
const boardCard = document.querySelector(".card-board");
const boardData = {};                                  // "d" | "m" -> { aspect, frames: { n: [[x,y] x4] } }
const BOARD_W = { d: 900, m: 360 };                    // design width of the card in CSS px before projection
async function loadBoard() {
  await Promise.all(["d", "m"].map(k => fetch(`/frames/board_${k}.json`).then(r => r.json()).then(j => { boardData[k] = j; }).catch(() => null)));
  sizeBoard(); projectBoard(current);
}
function sizeBoard() {
  const k = portrait() ? "m" : "d", w = BOARD_W[k], aspect = boardData[k]?.aspect || 2.1;
  boardCard.style.left = "0px"; boardCard.style.top = "0px"; boardCard.style.width = `${w}px`;
  if (!boardCard.classList.contains("lifted")) boardCard.style.height = `${Math.round(w / aspect)}px`;
}
function solve(A, b) {                                 // gaussian elimination with partial pivoting
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let t = b[i]; for (let c = i + 1; c < n; c++) t -= A[i][c] * x[c]; x[i] = t / A[i][i]; }
  return x;
}
function matrix3dFor(w, h, dst) {                       // homography: (0,0),(w,0),(w,h),(0,h) -> dst quad
  const src = [[0, 0], [w, 0], [w, h], [0, h]], A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  const [a, bb, c, d, e, f, g, hh] = solve(A, b);
  // when the perspective terms are negligible (every stop: the camera faces the board head-on) use a plain 2D
  // matrix: text inside a 3D-transformed layer gets rasterised in half-updated tiles on some GPUs
  if (Math.abs(g) * w < 0.03 && Math.abs(hh) * h < 0.03) return `matrix(${[a, d, bb, e, c, f].map(v => +v.toFixed(6)).join(",")})`;
  return `matrix3d(${[a, d, 0, g, bb, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1].map(v => +v.toFixed(6)).join(",")})`;
}
function projectBoard(f) {
  const k = portrait() ? "m" : "d", d = boardData[k];
  if (!d || !drawn.w) return;
  const W = BOARD_W[k];
  // on phones the board is too small to use, so during the board hold the card lifts off to a readable size
  const lift = portrait() && f >= STOP_FRAME[2] - 1 && f <= STOP_FRAME[2] + HOLD + 1;
  if (lift) {
    const a = boardCard.dataset.anchorM.split(",").map(Number);
    const ax = a[0] * drawn.w, ay = a[1] * drawn.h, aw = a[2] * drawn.w, ah = a[3] * drawn.h, sc = aw / W;
    if (!boardCard.classList.contains("lifted")) { boardCard.classList.add("lifted"); boardCard.classList.remove("settling"); }
    boardCard.style.height = "auto";                       // lifted: tall enough for every event
    boardCard.style.visibility = "visible";
    boardCard.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px) scale(${sc.toFixed(4)})`;
    return;
  }
  if (boardCard.classList.contains("lifted")) {
    boardCard.classList.remove("lifted"); boardCard.classList.add("settling");
    setTimeout(() => boardCard.classList.remove("settling"), 520);
  }
  const H = Math.round(W / d.aspect);
  if (boardCard.style.height !== `${H}px`) boardCard.style.height = `${H}px`;
  const lo = Math.max(1, Math.min(LAST_FRAME, 1 + 2 * Math.floor((f - 1) / 2))), hi = Math.min(LAST_FRAME, lo + 2);
  const qa = d.frames[lo] || d.frames[hi], qb = d.frames[hi] || qa;
  if (!qa) return;
  const t = hi > lo ? Math.min(1, Math.max(0, (f - lo) / (hi - lo))) : 0;
  const pts = qa.map(([x, y], i) => [(x + (qb[i][0] - x) * t) * drawn.w, (y + (qb[i][1] - y) * t) * drawn.h]);
  const xs = pts.map(p => p[0] + drawn.x), ys = pts.map(p => p[1] + drawn.y);
  const off = Math.max(...xs) < 0 || Math.min(...xs) > innerWidth || Math.max(...ys) < 0 || Math.min(...ys) > innerHeight;
  boardCard.style.visibility = off ? "hidden" : "visible";
  if (!off) boardCard.style.transform = matrix3dFor(W, H, pts);
}

// ------------------------------------------------------------------ the owl: a live three.js layer (src/owl3d.js)
// loaded on demand once the visitor heads past the notice board; the room itself stays pre-rendered
let owl3d = null, owl3dState = "idle", lastScrollAt = performance.now();
async function bootOwl3d() {
  owl3dState = "loading";
  try { const m = await import("./owl3d.js"); owl3d = await m.createOwl3D(document.getElementById("stage")); owl3dState = "ready"; }
  catch (e) { console.warn("live owl unavailable:", e); owl3dState = "failed"; }
}
function updateOwl(f, now) {
  if (owl3dState === "idle" && f >= STOP_FRAME[2] - MOVE * 0.5) bootOwl3d();
  if (owl3d) owl3d.update(f, now, drawn, portrait(), now - lastScrollAt);
}

// ------------------------------------------------------------------ scroll -> frame
let segPx = [];
function layoutTrack() {
  track.innerHTML = "";
  segPx = SEGMENTS.map(([, , vh]) => Math.round(vh * innerHeight));
  for (const px of segPx) { const d = document.createElement("div"); d.style.height = `${px}px`; track.appendChild(d); }
  const tail = document.createElement("div"); tail.style.height = `${innerHeight}px`; track.appendChild(tail);   // last hold fills the screen
}
function frameForScroll(y) {
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const [kind, k] = SEGMENTS[i], len = segPx[i];
    if (y <= acc + len || i === SEGMENTS.length - 1) {
      const t = len ? Math.min(1, Math.max(0, (y - acc) / len)) : 1;
      if (kind === "hold") return STOP_FRAME[k] + t * HOLD;
      const a = STOP_FRAME[k] + HOLD, b = STOP_FRAME[k + 1];
      return a + (b - a) * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);   // ease in-out
    }
    acc += len;
  }
  return LAST_FRAME;
}
function scrollForStop(k) {
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const [kind, kk] = SEGMENTS[i];
    if (kind === "hold" && kk === k) return acc + segPx[i] * 0.2;
    acc += segPx[i];
  }
  return 0;
}

// card visibility: fully on during the hold, fading across the last third of the approach and first third of the leave
const navLinks = [...document.querySelectorAll(".nav a[href^='#']")];
let activeStop = -1;
function updateCards(f) {
  for (const c of cards) {
    if (c === boardCard) { c.classList.add("on"); c.classList.toggle("dim", portrait() && f < STOP_FRAME[0] + HOLD + MOVE * 0.5); continue; }
    const k = STOPS.indexOf(c.dataset.stop), s = STOP_FRAME[k];
    const on = f >= s - MOVE * 0.3 && f <= s + HOLD + MOVE * 0.3;
    c.classList.toggle("on", on);
  }
  // nearest stop for the nav highlight
  let k = 0;
  for (let i = 0; i < STOPS.length; i++) if (Math.abs(f - STOP_FRAME[i] - HOLD / 2) < Math.abs(f - STOP_FRAME[k] - HOLD / 2)) k = i;
  if (k !== activeStop) {
    activeStop = k;
    for (const a of navLinks) a.classList.toggle("active", a.getAttribute("href") === `#${STOPS[k]}`);
  }
}
// keyboard: arrows / page keys / space step between stops
document.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea") || !document.getElementById("drawer").hidden) return;
  const next = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowRight: 1, ArrowUp: -1, PageUp: -1, ArrowLeft: -1 }[e.key];
  if (!next) return;
  e.preventDefault();
  const k = Math.min(STOPS.length - 1, Math.max(0, activeStop + next));
  window.scrollTo({ top: scrollForStop(k), behavior: "smooth" });
});

// ------------------------------------------------------------------ main loop
let target = 1, current = 1;
function tick() {
  const set = sets[setName()];
  if (!set) return requestAnimationFrame(tick);
  current += (target - current) * 0.18;
  if (Math.abs(target - current) < 0.02) current = target;
  const img = nearestReady(set, current);
  if (img && img !== lastImg) draw(img);
  updateCards(current); projectBoard(current); updateOwl(current, performance.now());
  requestAnimationFrame(tick);
}
function onScroll() { target = frameForScroll(window.scrollY); lastScrollAt = performance.now(); }

async function ensureSet(name) {
  if (sets[name] && sets[name].frames.length) return sets[name];
  const s = await loadSet(name);
  await Promise.all(s.frames.slice(0, 12).map(n => loadImage(s, n)));
  markReady(s);
  preloadAll(s, 6).then(() => markReady(s));
  return s;
}

// ------------------------------------------------------------------ preloader: lights on
async function playLightsOn() {
  if (new URLSearchParams(location.search).has("fast")) return;      // ?fast skips the lights-on intro (dev, screenshots)
  const set = await loadSet(lightsName());
  if (!set.frames.length) return;
  resizeFor(set);
  await preloadAll(set, 8, p => { preStatus.textContent = `lighting the room… ${Math.round(p * 100)}%`; });
  markReady(set);
  await new Promise(r => setTimeout(r, 150));
  // time-based playback: a throttled or hidden tab skips frames instead of stalling on the preloader
  const step = 1000 / 30, t0 = performance.now(), last = set.frames.length - 1;
  let i = 0;
  while (i <= last) {
    if (document.hidden) i = last;
    const im = await loadImage(set, set.frames[i]); if (im) draw(im);
    if (i === last) break;
    await new Promise(r => setTimeout(r, step));
    i = Math.max(i + 1, Math.min(last, Math.floor((performance.now() - t0) / step)));
  }
}
function resizeFor(set) {
  const s = Math.max(innerWidth / set.w, innerHeight / set.h);
  const w = set.w * s, h = set.h * s;
  drawn = { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w, h };
}

// ------------------------------------------------------------------ content
async function fillContent() {
  const c = await fetch("/content.json").then(r => r.json()).catch(() => null);
  if (!c) return;
  const $ = id => document.getElementById(id);
  $("insta").href = c.instagram.url; $("instaImg").src = c.instagram.image;
  $("instaCaption").textContent = c.instagram.caption; $("instaMeta").textContent = c.instagram.posted;
  $("eventsTitle").textContent = c.eventsTitle; $("eventsSub").textContent = c.eventsSubtitle || ""; $("eventsSub").hidden = !c.eventsSubtitle;
  $("eventsLive").hidden = !c.events.some(e => e.status !== "closed");
  $("eventList").innerHTML = c.events.map((e, i) => `
    <li class="event ${e.status}">
      <span class="n">${String(i + 1).padStart(2, "0")}</span>
      <span class="name">${e.name}</span>
      <span class="meta">${e.date} · ${e.venue}</span>
      <button data-form="${e.form}" data-name="${e.name}" ${e.status === "closed" ? "disabled" : ""}>${e.status === "closed" ? "Closed" : "Register"}</button>
    </li>`).join("");
  $("socials").innerHTML = c.socials.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener"><strong>${s.label}</strong><span>${s.sub}</span></a></li>`).join("");
  $("counts").innerHTML = Object.entries(c.wins.counts).map(([k, v]) => `<div><b data-count="${v}">${typeof v === "number" ? 0 : v}</b><span>${k}</span></div>`).join("");
  $("wins").hidden = !c.wins.list.length;
  $("wins").innerHTML = c.wins.list.map(w => `<li><span class="p">${w.placing}</span><b>${w.event}</b><span class="f">${w.fest} · ${w.year}</span></li>`).join("");
  $("aboutTitle").textContent = c.about.title; $("aboutLead").textContent = c.about.lead;
  $("aboutBody").textContent = c.about.body; $("aboutClosing").textContent = c.about.closing;
  $("shelfTags").innerHTML = c.about.shelf.map(t => `<li>${t}</li>`).join("");
  $("credits").textContent = "3D assets: " + c.credits.join(" · ");
  // registration drawer
  const drawer = $("drawer"), frame = $("drawerFrame");
  document.querySelectorAll(".event button[data-form]").forEach(b => b.addEventListener("click", () => {
    $("drawerTitle").textContent = b.dataset.name; $("drawerOpen").href = b.dataset.form;
    frame.src = b.dataset.form + (b.dataset.form.includes("?") ? "&" : "?") + "embedded=true";
    drawer.hidden = false;
  }));
  const close = () => { drawer.hidden = true; frame.src = "about:blank"; };
  $("drawerClose").addEventListener("click", close);
  drawer.addEventListener("click", e => { if (e.target === drawer) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
}

// ------------------------------------------------------------------ text effects
// text-type: the tagline types itself out when the hero is on, and re-types after a long pause off-screen
const typed = document.querySelector(".typed");
let typeTimer = 0, typedDone = false;
function typeTagline() {
  if (!typed || typedDone) return;
  typedDone = true;
  const text = typed.dataset.text; let i = 0;
  const HOLD_MS = 10000, ERASE_MS = 28;                     // read for 10 s, erase quickly, type again
  const typeStep = () => { typed.textContent = text.slice(0, ++i); typeTimer = setTimeout(i < text.length ? typeStep : eraseStart, i < text.length ? 42 + Math.random() * 40 : HOLD_MS); };
  const eraseStep = () => { typed.textContent = text.slice(0, --i); typeTimer = setTimeout(i > 0 ? eraseStep : typeStep, i > 0 ? ERASE_MS : 700); };
  const eraseStart = () => { if (document.hidden) { typeTimer = setTimeout(eraseStart, 1000); return; } eraseStep(); };
  typed.textContent = ""; typeTimer = setTimeout(typeStep, 500);
}
// count-up: the wins counters roll from 0 to their value the first time the cabinet card is shown
let counted = false;
function countUp() {
  if (counted) return; counted = true;
  const ease = t => 1 - Math.pow(1 - t, 3);
  document.querySelectorAll("#counts b[data-count]").forEach((el, i) => {
    const to = Number(el.dataset.count); if (!Number.isFinite(to)) return;
    const t0 = performance.now() + i * 120, dur = 1400;
    const f = now => { const t = Math.min(1, Math.max(0, (now - t0) / dur)); el.textContent = Math.round(to * ease(t)); if (t < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
}
const heroCard = document.querySelector(".card-hero"), cabinetCard = document.querySelector(".card-cabinet");
new MutationObserver(() => {
  if (heroCard.classList.contains("on")) typeTagline();
  if (cabinetCard.classList.contains("on")) countUp();
}).observe(document.getElementById("pinned"), { attributes: true, subtree: true, attributeFilter: ["class"] });

// nav: jump to a stop
document.querySelectorAll(".nav a[href^='#']").forEach(a => a.addEventListener("click", e => {
  e.preventDefault();
  const k = STOPS.indexOf(a.getAttribute("href").slice(1));
  if (k >= 0) window.scrollTo({ top: scrollForStop(k), behavior: "smooth" });
}));

// ------------------------------------------------------------------ boot
(async function boot() {
  layoutTrack(); placeCards();
  fillContent(); loadBoard();
  const pathSet = loadSet(setName());
  await playLightsOn();
  const set = await pathSet;
  markReady(set);
  // first frames first so scrolling works immediately, then the rest in the background
  await Promise.all(set.frames.slice(0, 12).map(n => loadImage(set, n)));
  resize();
  const first = await loadImage(set, set.frames[0]); if (first) draw(first);
  pre.classList.add("done"); setTimeout(() => pre.remove(), 900);
  preloadAll(set, 6).then(() => markReady(set));
  // deep link: /#cabinet opens on that stop
  const k = STOPS.indexOf(location.hash.slice(1));
  if (k > 0) { await Promise.all(set.frames.filter(n => Math.abs(n - STOP_FRAME[k]) < 8).map(n => loadImage(set, n))); markReady(set); window.scrollTo(0, scrollForStop(k)); onScroll(); current = target; }
  tick();
})();

window.__room = { get current() { return current; }, get target() { return target; }, get drawn() { return drawn; }, frameForScroll, scrollForStop, sets, get owl3d() { return owl3d; } };
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("hashchange", () => { const k = STOPS.indexOf(location.hash.slice(1)); if (k >= 0) window.scrollTo({ top: scrollForStop(k), behavior: "smooth" }); });
// scroll position that shows a given frame (inverse of frameForScroll, within holds and moves)
function scrollForFrame(f) {
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const [kind, k] = SEGMENTS[i], len = segPx[i];
    const a = kind === "hold" ? STOP_FRAME[k] : STOP_FRAME[k] + HOLD;
    const b = kind === "hold" ? STOP_FRAME[k] + HOLD : STOP_FRAME[k + 1];
    if (f <= b || i === SEGMENTS.length - 1) return acc + len * Math.min(1, Math.max(0, (f - a) / (b - a)));
    acc += len;
  }
  return acc;
}
let resizeTimer = 0, lastW = innerWidth, lastH = innerHeight;
window.addEventListener("resize", () => {
  const keep = current;                                   // keep the camera where it is while the track re-flows
  const bigChange = innerWidth !== lastW || Math.abs(innerHeight - lastH) / lastH > 0.3;   // ignore phone URL-bar jitter
  lastW = innerWidth; lastH = innerHeight;
  const go = () => {
    layoutTrack(); resize();
    clearTimeout(resizeTimer);
    if (bigChange) resizeTimer = setTimeout(() => { window.scrollTo(0, scrollForFrame(keep)); onScroll(); current = target; }, 60);
    else onScroll();
  };
  const want = setName();                                  // e.g. rotated, or a desktop window made narrow
  if (sets[want] && sets[want].frames.length) go(); else ensureSet(want).then(go);
});
