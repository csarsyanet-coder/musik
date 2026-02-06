const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");

const scoreEl = document.getElementById("score");
const bestEl  = document.getElementById("best");
const lvlEl   = document.getElementById("lvl");
const statusEl= document.getElementById("status");

const modeSelect = document.getElementById("mode");
const diffSelect = document.getElementById("difficulty");
const snakeColorInput = document.getElementById("snakeColor");
const eyeColorInput   = document.getElementById("eyeColor");

const btnStart   = document.getElementById("btnStart");
const btnRestart = document.getElementById("btnRestart");
const btnExit    = document.getElementById("btnExit");
const btnLbReset = document.getElementById("btnLbReset");
const lbList     = document.getElementById("lbList");

// arena
const gridX = 26, gridY = 15;
const tileW = canvas.width / gridX;
const tileH = canvas.height / gridY;

// difficulty
const DIFF_BASE = { easy: 11, normal: 8, hard: 6 };

// food
const NORMAL_COLOR = "#ffd400";  // kuning
const SUPER_COLOR  = "#ff2b2b";  // merah
const SUPER_SPAWN_EVERY = 6;
const SUPER_TTL_SEC = 6.0;
const SUPER_BONUS = 4;

// storage
const BEST_KEY = "snake_modes_best_v1";
const LB_KEY   = "snake_modes_lb_v1";

// state
let best = Number(localStorage.getItem(BEST_KEY) || 0);
bestEl.textContent = String(best);

let snake, dir, food, score;
let running=false, paused=false;

let tick=0, tickDiv=8;
let baseTickDiv = 8; // speed tetap sesuai difficulty
let level=1;

// mode
let mode = "classic"; // classic/adventure
let walls = [];       // hanya untuk adventure

// super food
let normalEaten=0;
let superFood=null;   // {x,y,ttl}

// visuals
let snakeColor = snakeColorInput.value;
let eyeColor   = eyeColorInput.value;

let lastTs = performance.now();

function key(c){ return `${c.x},${c.y}`; }
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

/* ===== Leaderboard per mode+diff ===== */
function loadLB(){
  try{
    const raw = localStorage.getItem(LB_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveLB(arr){
  localStorage.setItem(LB_KEY, JSON.stringify(arr));
}
function lbKey(){
  return `${modeSelect.value}|${diffSelect.value}`;
}
function renderLB(){
  const k = lbKey();
  const arr = loadLB().filter(x=>x.k===k).sort((a,b)=>b.score-a.score).slice(0,10);

  lbList.innerHTML = "";
  if (!arr.length){
    const li = document.createElement("li");
    li.innerHTML = `<span class="lb-name muted">Belum ada data</span><span class="lb-score muted">-</span>`;
    lbList.appendChild(li);
    return;
  }
  arr.forEach((e,i)=>{
    const li = document.createElement("li");
    li.innerHTML = `<span class="lb-name">${i+1}. ${escapeHtml(e.name)}</span><span class="lb-score">${e.score}</span>`;
    lbList.appendChild(li);
  });
}
function maybeSaveLeaderboard(){
  const k = `${mode}|${diffSelect.value}`;
  const all = loadLB();
  const same = all.filter(x=>x.k===k).sort((a,b)=>b.score-a.score);

  const worst = same.length < 10 ? -1 : same[9].score;
  if (score <= worst) return;

  let name = prompt("Masuk Top 10! Tulis nama:", "Player");
  if (name === null) return;
  name = name.trim().slice(0,18) || "Player";

  all.push({ k, name, score, ts: Date.now() });

  // rapihin: keep top 10 per k
  const map = new Map();
  for (const e of all){
    if (!map.has(e.k)) map.set(e.k, []);
    map.get(e.k).push(e);
  }
  const merged = [];
  for (const [kk, list] of map.entries()){
    list.sort((a,b)=>b.score-a.score);
    merged.push(...list.slice(0,10));
  }
  saveLB(merged);
}
btnLbReset.addEventListener("click", ()=>{
  const k = lbKey();
  const kept = loadLB().filter(x=>x.k !== k);
  saveLB(kept);
  renderLB();
});
modeSelect.addEventListener("change", renderLB);
diffSelect.addEventListener("change", renderLB);

/* ===== Walls (Adventure) ===== */
function rndCell(){ return { x:(Math.random()*gridX)|0, y:(Math.random()*gridY)|0 }; }

function safeWallSpot(c){
  // jangan pinggir & jangan dekat kepala
  const hx = snake[0].x, hy = snake[0].y;
  const d = Math.abs(c.x-hx)+Math.abs(c.y-hy);
  if (d < 4) return false;
  if (c.x<=0 || c.y<=0 || c.x>=gridX-1 || c.y>=gridY-1) return false;
  return true;
}

function occupiedSet(){
  const occ = new Set(snake.map(key));
  if (mode === "adventure") walls.forEach(w=>occ.add(key(w)));
  if (food) occ.add(key(food));
  if (superFood) occ.add(key(superFood));
  return occ;
}

function addRandomWalls(count){
  if (mode !== "adventure") return;
  const occ = occupiedSet();
  let added = 0;
  for (let i=0;i<8000 && added<count;i++){
    const c = rndCell();
    if (!safeWallSpot(c)) continue;
    if (occ.has(key(c))) continue;
    walls.push({x:c.x,y:c.y});
    occ.add(key(c));
    added++;
  }
}

function isWall(cell){
  if (mode !== "adventure") return false;
  for (const w of walls) if (w.x===cell.x && w.y===cell.y) return true;
  return false;
}

/* ===== Food ===== */
function spawnNormalFood(){
  const occ = new Set(snake.map(key));
  if (mode === "adventure") walls.forEach(w=>occ.add(key(w)));
  if (superFood) occ.add(key(superFood));

  for (let i=0;i<2000;i++){
    const c = rndCell();
    if (!occ.has(key(c))) return c;
  }
  return {x:1,y:1};
}
function spawnSuperFood(){
  const occ = new Set(snake.map(key));
  if (mode === "adventure") walls.forEach(w=>occ.add(key(w)));
  if (food) occ.add(key(food));

  for (let i=0;i<2500;i++){
    const c = rndCell();
    const hx=snake[0].x, hy=snake[0].y;
    if (Math.abs(c.x-hx)+Math.abs(c.y-hy) < 5) continue;
    if (!occ.has(key(c))) return { ...c, ttl: SUPER_TTL_SEC };
  }
  return {x:2,y:2, ttl: SUPER_TTL_SEC};
}

/* ===== Init / Start ===== */
function initState(){
  snake = [
    {x:Math.floor(gridX/2), y:Math.floor(gridY/2)},
    {x:Math.floor(gridX/2)-1, y:Math.floor(gridY/2)},
    {x:Math.floor(gridX/2)-2, y:Math.floor(gridY/2)},
  ];
  dir = {x:1,y:0};

  score=0; tick=0; level=1;
  mode = modeSelect.value || "classic";

  const diff = diffSelect.value || "normal";
  baseTickDiv = DIFF_BASE[diff] ?? 8;
  tickDiv = baseTickDiv;


  normalEaten=0;
  superFood=null;

  walls = [];
  if (mode === "adventure") addRandomWalls(10);

  food = spawnNormalFood();

  scoreEl.textContent="0";
  bestEl.textContent=String(best);
  lvlEl.textContent=String(level);
  statusEl.textContent="READY";
  renderLB();
}

function startGame(){
  initState();
  running=true; paused=false;
  menu.style.display="none";
  statusEl.textContent="PLAY";
}
function restartGame(){ startGame(); }
function exitGame(){ window.location.href = "../../index.html"; }

btnStart.addEventListener("click", startGame);
btnRestart.addEventListener("click", restartGame);
btnExit.addEventListener("click", exitGame);

snakeColorInput.addEventListener("input", ()=> snakeColor = snakeColorInput.value);
eyeColorInput.addEventListener("input", ()=> eyeColor = eyeColorInput.value);

/* ===== Difficulty scaling ===== */
function increaseDifficultyIfNeeded(){
  const newLevel = Math.floor(score/5) + 1;
  if (newLevel > level){
    level = newLevel;
    lvlEl.textContent = String(level);

    // speed TETAP (sesuai difficulty)
    tickDiv = baseTickDiv;

    // adventure: tambah tembok acak makin lama makin banyak
    if (mode === "adventure"){
      const add = clamp(3 + Math.floor(level/2), 3, 10);
      addRandomWalls(add);
    }
  }
}

function gameOver(){
  running=false; paused=false;
  statusEl.textContent="GAME OVER";
  menu.style.display="grid";

  if (score > best){
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = String(best);
  }
  maybeSaveLeaderboard();
  renderLB();
}

/* ===== Step ===== */
function step(dt){
  if (!running || paused) return;

  if (superFood){
    superFood.ttl -= dt;
    if (superFood.ttl <= 0) superFood = null;
  }

  tick++;
  if (tick % tickDiv !== 0) return;

  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  // pinggir = mati
 if (mode === "adventure") {
  if (head.x < 0) head.x = gridX - 1;
  else if (head.x >= gridX) head.x = 0;

  if (head.y < 0) head.y = gridY - 1;
  else if (head.y >= gridY) head.y = 0;
} else {
  // classic: nabrak pinggir = mati
  if (head.x < 0 || head.y < 0 || head.x >= gridX || head.y >= gridY) {
    gameOver();
    return;
  }
}

  // tembok hanya di adventure
  if (isWall(head)) { gameOver(); return; }

  // badan
  for (const s of snake){
    if (s.x===head.x && s.y===head.y) { gameOver(); return; }
  }

  snake.unshift(head);

  // makan normal
  if (food && head.x===food.x && head.y===food.y){
    score += 1;
    normalEaten += 1;

    if (!superFood && normalEaten % SUPER_SPAWN_EVERY === 0){
      superFood = spawnSuperFood();
    }
    food = spawnNormalFood();

    scoreEl.textContent = String(score);
    increaseDifficultyIfNeeded();
    return; // grow
  }

  // makan super
  if (superFood && head.x===superFood.x && head.y===superFood.y){
    score += (1 + SUPER_BONUS);
    superFood = null;

    scoreEl.textContent = String(score);
    increaseDifficultyIfNeeded();
    return; // grow
  }

  snake.pop();
}

/* ===== Draw ===== */
function draw(){
  ctx.fillStyle = "#c7d7a3";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  if (!snake || !food) return;

  // walls (hitam) hanya adventure
  if (mode === "adventure"){
    ctx.fillStyle = "#000";
    for (const w of walls){
      ctx.fillRect(w.x*tileW, w.y*tileH, tileW, tileH);
    }
  }

  // normal food (kuning)
  ctx.fillStyle = NORMAL_COLOR;
  ctx.fillRect(food.x*tileW, food.y*tileH, tileW, tileH);

  // super food (merah besar + cd bar)
  if (superFood){
    const pad = Math.min(tileW, tileH) * 0.12;
    const w = tileW - pad*2;
    const h = tileH - pad*2;

    ctx.fillStyle = SUPER_COLOR;
    ctx.fillRect(superFood.x*tileW + pad, superFood.y*tileH + pad, w, h);

    const t = clamp(superFood.ttl / SUPER_TTL_SEC, 0, 1);
    ctx.fillStyle = "#000";
    ctx.fillRect(superFood.x*tileW, superFood.y*tileH + tileH - 3, tileW, 3);
    ctx.fillStyle = "#fff";
    ctx.fillRect(superFood.x*tileW, superFood.y*tileH + tileH - 3, tileW * t, 3);
  }

  // snake
  ctx.fillStyle = snakeColor || "#000";
  for (let i=snake.length-1;i>=0;i--){
    const s = snake[i];
    ctx.fillRect(s.x*tileW, s.y*tileH, tileW, tileH);
  }

  // eyes on head
  const h = snake[0];
  const hx = h.x*tileW, hy = h.y*tileH;

  const ex1 = dir.x !== 0 ? (dir.x > 0 ? hx + tileW*0.70 : hx + tileW*0.30) : hx + tileW*0.35;
  const ex2 = dir.x !== 0 ? (dir.x > 0 ? hx + tileW*0.70 : hx + tileW*0.30) : hx + tileW*0.65;
  const ey1 = dir.y !== 0 ? (dir.y > 0 ? hy + tileH*0.70 : hy + tileH*0.30) : hy + tileH*0.35;
  const ey2 = dir.y !== 0 ? (dir.y > 0 ? hy + tileH*0.70 : hy + tileH*0.30) : hy + tileH*0.65;

  const r = Math.max(1, Math.floor(Math.min(tileW, tileH) * 0.12));
  ctx.fillStyle = eyeColor || "#fff";
  ctx.beginPath(); ctx.arc(ex1, ey1, r, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex2, ey2, r, 0, Math.PI*2); ctx.fill();

  ctx.fillStyle = "#000";
  const pr = Math.max(1, Math.floor(r * 0.55));
  ctx.beginPath(); ctx.arc(ex1, ey1, pr, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex2, ey2, pr, 0, Math.PI*2); ctx.fill();

  // pause overlay
  if (paused && running){
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#000";
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PAUSE", canvas.width/2, canvas.height/2);
    ctx.textAlign = "left";
  }
}

/* ===== Input ===== */
window.addEventListener("keydown", (e) => {
  if (!running) return;

  const k = e.key.toLowerCase();

  if (k === "p") {
    paused = !paused;
    statusEl.textContent = paused ? "PAUSE" : "PLAY";
    return;
  }

  if ((k==="arrowup"||k==="w") && dir.y===0)    { dir={x:0,y:-1}; return; }
  if ((k==="arrowdown"||k==="s") && dir.y===0)  { dir={x:0,y: 1}; return; }
  if ((k==="arrowleft"||k==="a") && dir.x===0)  { dir={x:-1,y:0}; return; }
  if ((k==="arrowright"||k==="d") && dir.x===0) { dir={x: 1,y:0}; return; }
});

/* Touch */
function setDirFromTouch(name){
  if (!running) return;

  if (name==="pause"){
    paused=!paused;
    statusEl.textContent = paused ? "PAUSE" : "PLAY";
    return;
  }
  if (name==="up" && dir.y===0) dir={x:0,y:-1};
  if (name==="down" && dir.y===0) dir={x:0,y: 1};
  if (name==="left" && dir.x===0) dir={x:-1,y:0};
  if (name==="right" && dir.x===0) dir={x: 1,y:0};
}
function handleTouchAction(action){
  if (action==="restart") return restartGame();
  return setDirFromTouch(action);
}
document.querySelectorAll("[data-dir]").forEach(btn=>{
  const action = btn.getAttribute("data-dir");
  btn.addEventListener("click", (e)=>{ e.preventDefault(); handleTouchAction(action); });
  btn.addEventListener("touchstart",(e)=>{ e.preventDefault(); handleTouchAction(action); },{passive:false});
});

/* ===== Loop ===== */
function loop(ts){
  const dt = clamp((ts-lastTs)/1000, 0, 0.05);
  lastTs = ts;

  step(dt);
  draw();
  requestAnimationFrame(loop);
}

/* Init */
initState();
menu.style.display="grid";
requestAnimationFrame(loop);
