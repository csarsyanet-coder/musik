(() => {
  // ===== Canvas =====
  const board = document.getElementById("board");
  const ctx = board.getContext("2d", { alpha: false });

  const nextCv = document.getElementById("next");
  const nextCtx = nextCv.getContext("2d", { alpha: true });

  const holdCv = document.getElementById("hold");
  const holdCtx = holdCv.getContext("2d", { alpha: true });

  // ===== UI =====
  const elScore = document.getElementById("score");
  const elLines = document.getElementById("lines");
  const elLevel = document.getElementById("level");
  const elBest  = document.getElementById("best");
  const elStatus= document.getElementById("status");

  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnExit = document.getElementById("btnExit");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayDesc = document.getElementById("overlayDesc");

  const BEST_KEY = "tetris_best_v1";

  // ===== Tetris config =====
  const COLS = 10;
  const ROWS = 20;
  const CELL = Math.floor(board.width / COLS);
  const VIS_W = COLS * CELL;
  const VIS_H = ROWS * CELL;

  // Fit canvas to integer cells (avoid blur)
  board.width = VIS_W;
  board.height = VIS_H;

  // Colors by tetromino id
  const COLORS = {
    I: "#51e3ff",
    O: "#ffe66d",
    T: "#c77dff",
    S: "#7dff8f",
    Z: "#ff7d7d",
    J: "#7da7ff",
    L: "#ffb86b",
    G: "rgba(255,255,255,.12)" // ghost
  };

  const SHAPES = {
    I: [
      [0,0,0,0],
      [1,1,1,1],
      [0,0,0,0],
      [0,0,0,0],
    ],
    O: [
      [1,1],
      [1,1],
    ],
    T: [
      [0,1,0],
      [1,1,1],
      [0,0,0],
    ],
    S: [
      [0,1,1],
      [1,1,0],
      [0,0,0],
    ],
    Z: [
      [1,1,0],
      [0,1,1],
      [0,0,0],
    ],
    J: [
      [1,0,0],
      [1,1,1],
      [0,0,0],
    ],
    L: [
      [0,0,1],
      [1,1,1],
      [0,0,0],
    ]
  };

  const BAG = ["I","O","T","S","Z","J","L"];

  function makeMatrix(rows, cols, val=0){
    return Array.from({length: rows}, () => Array(cols).fill(val));
  }

  // ===== State =====
  let grid = makeMatrix(ROWS, COLS, "");
  let bag = [];
  let running = false;
  let paused = false;
  let gameOver = false;

  let score = 0;
  let lines = 0;
  let level = 1;

  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  elBest.textContent = String(best);

  let dropIntervalMs = 800;
  let dropAcc = 0;

  let piece = null;
  let next = null;
  let hold = null;
  let holdUsed = false;

  // ===== Piece helpers =====
  function clone2D(m){ return m.map(r => r.slice()); }

  function rotate(mat, dir){
    // dir: 1 cw, -1 ccw
    const n = mat.length;
    const res = Array.from({length:n}, () => Array(n).fill(0));
    for (let y=0;y<n;y++){
      for (let x=0;x<n;x++){
        if (dir === 1) res[x][n-1-y] = mat[y][x];
        else res[n-1-x][y] = mat[y][x];
      }
    }
    return res;
  }

  function shapeMatrix(id){
    const s = SHAPES[id];
    const max = Math.max(s.length, s[0].length);
    // pad to square for easier rotation
    const m = Array.from({length:max}, (_,y)=>
      Array.from({length:max}, (_,x)=> (s[y] && s[y][x]) ? 1 : 0)
    );
    return m;
  }

  function newPiece(id){
    const m = shapeMatrix(id);
    const x = Math.floor((COLS - m[0].length)/2);
    const y = -1; // spawn slightly above
    return { id, m, x, y };
  }

  function refillBag(){
    bag = BAG.slice();
    for (let i=bag.length-1;i>0;i--){
      const j = (Math.random()*(i+1))|0;
      [bag[i],bag[j]] = [bag[j],bag[i]];
    }
  }

  function takeFromBag(){
    if (bag.length === 0) refillBag();
    return bag.pop();
  }

  function collides(p, m = p.m, ox = p.x, oy = p.y){
    for (let y=0;y<m.length;y++){
      for (let x=0;x<m[y].length;x++){
        if (!m[y][x]) continue;
        const gx = ox + x;
        const gy = oy + y;
        if (gx < 0 || gx >= COLS) return true;
        if (gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function merge(p){
    for (let y=0;y<p.m.length;y++){
      for (let x=0;x<p.m[y].length;x++){
        if (!p.m[y][x]) continue;
        const gx = p.x + x;
        const gy = p.y + y;
        if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS){
          grid[gy][gx] = p.id;
        }
      }
    }
  }

  function clearLines(){
    let cleared = 0;
    for (let y=ROWS-1; y>=0; y--){
      if (grid[y].every(v => v !== "")){
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(""));
        cleared++;
        y++; // re-check same index
      }
    }
    if (cleared > 0){
      lines += cleared;

      // scoring (classic-ish)
      const base = [0, 100, 300, 500, 800][cleared] || (cleared*200);
      score += base * level;

      // level up each 10 lines
      level = Math.floor(lines / 10) + 1;

      // speed by level
      dropIntervalMs = Math.max(90, 800 - (level-1)*60);

      syncUI();
    }
  }

  function hardDrop(){
    if (!running || paused || gameOver) return;
    let dy = 0;
    while (!collides(piece, piece.m, piece.x, piece.y + dy + 1)) dy++;
    piece.y += dy;
    lockPiece();
  }

  function softDrop(){
    if (!running || paused || gameOver) return;
    if (!collides(piece, piece.m, piece.x, piece.y + 1)) {
      piece.y += 1;
      score += 1; // small bonus
      syncUI();
    } else {
      lockPiece();
    }
  }

  function lockPiece(){
    merge(piece);
    clearLines();
    holdUsed = false;

    piece = next;
    next = newPiece(takeFromBag());

    // game over if immediately collides
    if (collides(piece)){
      endGame();
    }
  }

  function tryMove(dx, dy){
    if (!running || paused || gameOver) return;
    if (!collides(piece, piece.m, piece.x + dx, piece.y + dy)){
      piece.x += dx;
      piece.y += dy;
    }
  }

  function tryRotate(dir){
    if (!running || paused || gameOver) return;
    const rotated = rotate(piece.m, dir);

    // simple wall-kick attempts
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks){
      if (!collides(piece, rotated, piece.x + k, piece.y)){
        piece.m = rotated;
        piece.x += k;
        return;
      }
    }
  }

  function doHold(){
    if (!running || paused || gameOver) return;
    if (holdUsed) return;
    holdUsed = true;

    const curId = piece.id;
    if (!hold){
      hold = curId;
      piece = next;
      next = newPiece(takeFromBag());
    } else {
      const swap = hold;
      hold = curId;
      piece = newPiece(swap);
    }

    // reset spawn position for held piece
    piece.x = Math.floor((COLS - piece.m[0].length)/2);
    piece.y = -1;

    if (collides(piece)) endGame();
  }

  function syncUI(){
    elScore.textContent = String(score);
    elLines.textContent = String(lines);
    elLevel.textContent = String(level);
    elBest.textContent = String(best);
    elStatus.textContent = gameOver ? "GAME OVER" : (paused ? "PAUSED" : (running ? "RUNNING" : "READY"));
  }

  function showOverlay(title, desc){
    overlayTitle.textContent = title;
    overlayDesc.textContent = desc;
    overlay.classList.add("show");
  }
  function hideOverlay(){
    overlay.classList.remove("show");
  }

  function start(){
    if (running && !gameOver) return;
    reset();
    running = true;
    paused = false;
    gameOver = false;
    hideOverlay();
    syncUI();
  }

  function reset(){
    grid = makeMatrix(ROWS, COLS, "");
    score = 0;
    lines = 0;
    level = 1;
    dropIntervalMs = 800;
    dropAcc = 0;

    hold = null;
    holdUsed = false;

    bag = [];
    refillBag();
    piece = newPiece(takeFromBag());
    next = newPiece(takeFromBag());

    paused = false;
    gameOver = false;
    syncUI();
  }

  function togglePause(){
    if (!running || gameOver) return;
    paused = !paused;
    if (paused) showOverlay("PAUSE", "Tekan P atau tombol Pause untuk lanjut");
    else hideOverlay();
    syncUI();
  }

  function endGame(){
    gameOver = true;
    running = false;
    paused = false;

    if (score > best){
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    showOverlay("GAME OVER", "Tekan Restart untuk main lagi");
    syncUI();
  }

  // ===== Rendering =====
  function drawCell(x, y, color){
    ctx.fillStyle = color;
    ctx.fillRect(x*CELL, y*CELL, CELL, CELL);
    // subtle border
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(x*CELL, y*CELL, CELL, 1);
    ctx.fillRect(x*CELL, y*CELL, 1, CELL);
  }

  function drawBoard(){
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, board.width, board.height);

    // grid
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    for (let x=1; x<COLS; x++){
      ctx.beginPath();
      ctx.moveTo(x*CELL, 0);
      ctx.lineTo(x*CELL, VIS_H);
      ctx.stroke();
    }
    for (let y=1; y<ROWS; y++){
      ctx.beginPath();
      ctx.moveTo(0, y*CELL);
      ctx.lineTo(VIS_W, y*CELL);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // locked blocks
    for (let y=0;y<ROWS;y++){
      for (let x=0;x<COLS;x++){
        const id = grid[y][x];
        if (!id) continue;
        drawCell(x, y, COLORS[id] || "#fff");
      }
    }

    // ghost
    if (piece){
      let gy = piece.y;
      while (!collides(piece, piece.m, piece.x, gy + 1)) gy++;
      for (let y=0;y<piece.m.length;y++){
        for (let x=0;x<piece.m[y].length;x++){
          if (!piece.m[y][x]) continue;
          const px = piece.x + x;
          const py = gy + y;
          if (py >= 0) drawCell(px, py, COLORS.G);
        }
      }

      // active piece
      for (let y=0;y<piece.m.length;y++){
        for (let x=0;x<piece.m[y].length;x++){
          if (!piece.m[y][x]) continue;
          const px = piece.x + x;
          const py = piece.y + y;
          if (py >= 0) drawCell(px, py, COLORS[piece.id] || "#fff");
        }
      }
    }
  }

  function drawMini(ctx2, id){
    ctx2.clearRect(0,0,120,120);
    ctx2.fillStyle = "rgba(0,0,0,.15)";
    ctx2.fillRect(0,0,120,120);

    if (!id) return;
    const m = shapeMatrix(id);
    const cell = 24;
    const w = m[0].length * cell;
    const h = m.length * cell;
    const ox = Math.floor((120 - w)/2);
    const oy = Math.floor((120 - h)/2);

    for (let y=0;y<m.length;y++){
      for (let x=0;x<m[y].length;x++){
        if (!m[y][x]) continue;
        ctx2.fillStyle = COLORS[id] || "#fff";
        ctx2.fillRect(ox + x*cell, oy + y*cell, cell, cell);
        ctx2.fillStyle = "rgba(0,0,0,.18)";
        ctx2.fillRect(ox + x*cell, oy + y*cell, cell, 1);
        ctx2.fillRect(ox + x*cell, oy + y*cell, 1, cell);
      }
    }
  }

  // ===== Loop =====
  let last = performance.now();
  function frame(ts){
    const dt = Math.min(0.05, (ts - last)/1000);
    last = ts;

    if (running && !paused && !gameOver){
      dropAcc += dt*1000;
      if (dropAcc >= dropIntervalMs){
        dropAcc = 0;
        if (!collides(piece, piece.m, piece.x, piece.y + 1)) piece.y++;
        else lockPiece();
      }
    }

    drawBoard();
    drawMini(nextCtx, next?.id);
    drawMini(holdCtx, hold);

    requestAnimationFrame(frame);
  }

  // ===== Input =====
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();

    if (k === "p") return togglePause();

    if (!running || paused || gameOver) return;

    if (k === "arrowleft" || k === "a") return tryMove(-1, 0);
    if (k === "arrowright" || k === "d") return tryMove(1, 0);

    if (k === "arrowdown" || k === "s") return softDrop();

    if (k === "arrowup" || k === "w" || k === "x") return tryRotate(1);
    if (k === "z") return tryRotate(-1);

    if (k === " ") { e.preventDefault(); return hardDrop(); }
    if (k === "c") return doHold();
  }, { passive: false });

 
  function act(a){
    if (a === "pause") return togglePause();
    if (a === "hold") return doHold();
    if (a === "drop") return hardDrop();
    if (!running || paused || gameOver) return;

    if (a === "left") return tryMove(-1,0);
    if (a === "right") return tryMove(1,0);
    if (a === "down") return softDrop();
    if (a === "rotR") return tryRotate(1);
    if (a === "rotL") return tryRotate(-1);
    if (a === "restart") { reset(); running = true; paused = false; gameOver = false; hideOverlay(); syncUI(); }
  }

  document.querySelectorAll("[data-a]").forEach(btn => {
    const a = btn.getAttribute("data-a");
    btn.addEventListener("click", (e) => { e.preventDefault(); act(a); });
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); act(a); }, { passive: false });
  });


 
  btnStart.addEventListener("click", start);
  btnPause.addEventListener("click", togglePause);
  btnRestart.addEventListener("click", () => { reset(); running = true; paused = false; gameOver = false; hideOverlay(); syncUI(); });
  btnExit.addEventListener("click", () => {
  window.location.href = "../../";
  });
  
let dragActive = false;
let dragStartX = 0;
let dragLastCol = null;

function pieceWidthCells(p){
  // hitung lebar efektif piece (kolom paling kiri/kanan yang ada blok)
  let minX = 999, maxX = -999;
  for (let y=0; y<p.m.length; y++){
    for (let x=0; x<p.m[y].length; x++){
      if (!p.m[y][x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  if (maxX < 0) return 0;
  return (maxX - minX + 1);
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function movePieceToColumn(targetX){
  if (!running || paused || isGameOver) return;
  if (!piece) return;

  // geser step-by-step supaya tetap respect collision
  while (piece.x < targetX && !collides(piece, piece.m, piece.x + 1, piece.y)) {
    piece.x += 1;
  }
  while (piece.x > targetX && !collides(piece, piece.m, piece.x - 1, piece.y)) {
    piece.x -= 1;
  }
}

function getTouchX(e){
  const t = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : null);
  return t ? t.clientX : null;
}

function xToColumn(clientX){
  const rect = board.getBoundingClientRect();
  const x = clientX - rect.left;

  // map posisi jari -> kolom, lalu clamp biar mentok arena
  const rawCol = Math.floor((x / rect.width) * COLS);

  // biar tidak bisa “keluar” walau piece lebar (O/I)
  const w = pieceWidthCells(piece);
  const maxCol = COLS - w;   // mentok kanan
  const col = clamp(rawCol, 0, maxCol);
  return col;
}

// Jangan biarkan browser scroll saat geser di canvas
board.style.touchAction = "none";

board.addEventListener("touchstart", (e) => {
  if (!running || paused || isGameOver) return;
  e.preventDefault();

  dragActive = true;
  const x = getTouchX(e);
  if (x == null) return;

  dragStartX = x;
  dragLastCol = xToColumn(x);

  movePieceToColumn(dragLastCol);
}, { passive:false });

board.addEventListener("touchmove", (e) => {
  if (!dragActive) return;
  if (!running || paused || isGameOver) return;
  e.preventDefault();

  const x = getTouchX(e);
  if (x == null) return;

  const col = xToColumn(x);

  // biar nggak spam move tiap pixel, cuma kalau kolom berubah
  if (col !== dragLastCol) {
    dragLastCol = col;
    movePieceToColumn(col);
  }
}, { passive:false });

board.addEventListener("touchend", (e) => {
  dragActive = false;
  dragLastCol = null;
}, { passive:false });

board.addEventListener("touchcancel", (e) => {
  dragActive = false;
  dragLastCol = null;
}, { passive:false });

  // Init
  reset();
  showOverlay("TETRIS", "Tekan Mulai untuk bermain");
  syncUI();
  requestAnimationFrame(frame);
})();

