const $ = (id) => document.getElementById(id);

const els = {
  best: $("best"),
  time: $("time"),
  score: $("score"),
  streak: $("streak"),
  q: $("question"),
  ans: $("answer"),
  submit: $("submit"),
  start: $("start"),
  pause: $("pause"),
  reset: $("reset"),
  feedback: $("feedback"),
  history: $("history"),
  difficulty: $("difficulty"),
  opAdd: $("opAdd"),
  opSub: $("opSub"),
  opMul: $("opMul"),
  opDiv: $("opDiv"),
  durationChips: $("durationChips"),
  playBtn: $("playBtn"), // not used here (exists only in lobby), safe
};

const BEST_KEY = "math_sprint_best";
let best = Number(localStorage.getItem(BEST_KEY) || "0");
if (!Number.isFinite(best)) best = 0;
els.best.textContent = String(best);

let totalSeconds = 60;
let timeLeft = totalSeconds;
let timer = null;

let score = 0;
let streak = 0;
let level = 1; // for auto
let running = false;
let paused = false;

let current = null; // {text, answer, points, op, a,b}

function setFeedback(text, kind){
  els.feedback.textContent = text;
  els.feedback.className = "feedback " + (kind || "");
}

function selectedOps(){
  const ops = [];
  if (els.opAdd.checked) ops.push("+");
  if (els.opSub.checked) ops.push("-");
  if (els.opMul.checked) ops.push("×");
  if (els.opDiv.checked) ops.push("÷");
  return ops;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function difficultyRange(){
  const mode = els.difficulty.value;

  // Auto adapt: naik level saat streak bagus, turun kalau sering salah
  if (mode === "auto"){
    const max = clamp(8 + level * 4, 12, 99); // makin tinggi level makin besar angka
    const min = clamp(Math.floor(max * 0.35), 1, 60);
    return { min, max };
  }
  if (mode === "easy") return { min: 1, max: 15 };
  if (mode === "normal") return { min: 3, max: 35 };
  return { min: 8, max: 85 }; // hard
}

function randInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeQuestion(){
  const ops = selectedOps();
  if (ops.length === 0){
    // default minimal
    els.opAdd.checked = true;
    ops.push("+");
  }

  const { min, max } = difficultyRange();
  const op = ops[Math.floor(Math.random() * ops.length)];

  let a, b, ans, text;

  if (op === "+"){
    a = randInt(min, max);
    b = randInt(min, max);
    ans = a + b;
    text = `${a} + ${b}`;
  } else if (op === "-"){
    a = randInt(min, max);
    b = randInt(min, max);
    // biar gak negatif di easy/normal
    if (els.difficulty.value !== "hard" && els.difficulty.value !== "auto"){
      if (b > a) [a, b] = [b, a];
    }
    ans = a - b;
    text = `${a} − ${b}`;
  } else if (op === "×"){
    // perkalian lebih “kecil” biar masih doable
    const mMax = clamp(Math.floor(max / 2), 8, 40);
    a = randInt(min, mMax);
    b = randInt(min, mMax);
    ans = a * b;
    text = `${a} × ${b}`;
  } else {
    // ÷ hasil harus bulat: a ÷ b = k
    const bMax = clamp(Math.floor(max / 3), 6, 25);
    b = randInt(2, bMax);
    const k = randInt(2, clamp(Math.floor(max / 2), 6, 50));
    a = b * k;
    ans = k;
    text = `${a} ÷ ${b}`;
  }

  // points: tergantung op dan tingkat angka
  const complexity =
    (op === "×" ? 2 : op === "÷" ? 2 : 1) +
    (Math.max(a, b) >= 50 ? 1 : 0) +
    (Math.max(a, b) >= 80 ? 1 : 0);

  const points = 10 + (complexity * 5) + Math.floor(level / 2) * 2;

  return { text, answer: ans, points, op, a, b };
}

function showQuestion(){
  current = makeQuestion();
  els.q.textContent = current.text;
  els.ans.value = "";
  els.ans.focus();
}

function addHistory(qText, your, correct, pointsDelta){
  const div = document.createElement("div");
  div.className = "hitem";
  div.innerHTML = `
    <div class="hleft">
      <div class="hq">${qText} = ${correct}</div>
      <div class="hs">Jawab: ${your === "" ? "—" : your}</div>
    </div>
    <div class="hright">${pointsDelta >= 0 ? "+" : ""}${pointsDelta}</div>
  `;
  els.history.prepend(div);
}

function updateUI(){
  els.time.textContent = String(timeLeft);
  els.score.textContent = String(score);
  els.streak.textContent = String(streak);
}

function tick(){
  if (!running || paused) return;
  timeLeft -= 1;
  updateUI();
  if (timeLeft <= 0){
    endGame();
  }
}

function startGame(){
  // reset core
  score = 0;
  streak = 0;
  level = 1;
  timeLeft = totalSeconds;
  running = true;
  paused = false;
  els.history.innerHTML = "";
  setFeedback("Mulai! Jawab cepat 🔥", "");

  updateUI();
  showQuestion();

  clearInterval(timer);
  timer = setInterval(tick, 1000);
}

function pauseGame(){
  if (!running) return;
  paused = !paused;
  setFeedback(paused ? "Pause." : "Lanjut!", "");
  if (!paused) els.ans.focus();
}

function resetGame(){
  running = false;
  paused = false;
  clearInterval(timer);
  timer = null;

  score = 0;
  streak = 0;
  level = 1;
  timeLeft = totalSeconds;

  els.history.innerHTML = "";
  els.q.textContent = "—";
  els.ans.value = "";
  setFeedback("Siap. Klik Start.", "");
  updateUI();
}

function endGame(){
  running = false;
  paused = false;
  clearInterval(timer);
  timer = null;

  setFeedback(`Waktu habis! Skor kamu: ${score}`, "");

  if (score > best){
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    els.best.textContent = String(best);
    setFeedback(`New Best! 🎉 Skor: ${score}`, "good");
  }
}

function adaptDifficulty(correct){
  if (els.difficulty.value !== "auto") return;

  if (correct){
    // streak bagus → cepat naik
    if (streak % 5 === 0) level += 1;
    if (streak % 12 === 0) level += 1;
  } else {
    // salah → turun pelan
    if (level > 1) level -= 1;
  }
}

function submitAnswer(){
  if (!running || paused) return;
  if (!current) return;

  const raw = els.ans.value.trim();
  const your = raw === "" ? "" : Number(raw);

  const isNumber = raw !== "" && Number.isFinite(your);
  const correct = isNumber && (your === current.answer);

  if (correct){
    streak += 1;
    const gained = current.points + Math.min(20, streak); // bonus streak
    score += gained;
    setFeedback(`Benar! +${gained}`, "good");
    addHistory(current.text, raw, current.answer, gained);
  } else {
    // penalty kecil biar tetap fun
    const penalty = Math.min(12, 5 + Math.floor(level / 2));
    score = Math.max(0, score - penalty);
    streak = 0;
    setFeedback(`Salah! −${penalty} (jawaban: ${current.answer})`, "bad");
    addHistory(current.text, raw, current.answer, -penalty);
  }

  adaptDifficulty(correct);
  updateUI();
  showQuestion();
}

/* ===== Duration chips ===== */
function setDuration(sec){
  totalSeconds = sec;
  if (!running){
    timeLeft = totalSeconds;
    updateUI();
  }
}

els.durationChips.addEventListener("click", (e) => {
  const btn = e.target.closest("button.chip");
  if (!btn) return;
  const sec = Number(btn.dataset.sec);
  if (!Number.isFinite(sec)) return;

  [...els.durationChips.querySelectorAll(".chip")].forEach(x => x.classList.remove("active"));
  btn.classList.add("active");
  setDuration(sec);
});

els.start.addEventListener("click", startGame);
els.pause.addEventListener("click", pauseGame);
els.reset.addEventListener("click", resetGame);

els.submit.addEventListener("click", submitAnswer);
els.ans.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitAnswer();
});

// safety: prevent none op
[els.opAdd, els.opSub, els.opMul, els.opDiv].forEach(cb => {
  cb.addEventListener("change", () => {
    const ops = selectedOps();
    if (ops.length === 0) els.opAdd.checked = true;
    if (running && !paused) showQuestion();
  });
});

els.difficulty.addEventListener("change", () => {
  level = 1;
  if (running && !paused) showQuestion();
});

resetGame();
