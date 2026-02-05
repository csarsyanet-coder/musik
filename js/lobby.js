const GAMES = [
  
  {
  id: "math-sprint",
  name: "Math Sprint",
  desc: "Game matematika cepat: skor, streak, difficulty adaptif.",
  emoji: "➗",
  tags: ["math","brain","speed"],
  status: "Play",
  href: "games/math-sprint/index.html"
  },
  
  {
    id: "coming-soon",
    name: "Coming Soon",
    desc: "Game berikutnya akan ditambahkan. Lobby ini siap di-scale.",
    emoji: "📦",
    tags: ["soon"],
    status: "Soon",
    href: "#"
  }

];

const $ = (id) => document.getElementById(id);

const listEl = $("list");
const searchEl = $("search");
const clearBtn = $("clearSearch");

const totalEl = $("total");
const pArt = $("pArt");
const pName = $("pName");
const pDesc = $("pDesc");
const pTags = $("pTags");
const pStatus = $("pStatus");
const playBtn = $("playBtn");

let activeId = null;

function norm(s){ return (s || "").toLowerCase().trim(); }

function render(){
  const q = norm(searchEl.value);

  const filtered = GAMES.filter(g => {
    if(!q) return true;
    const hay = `${g.name} ${g.desc} ${g.tags.join(" ")}`.toLowerCase();
    return hay.includes(q);
  });

  totalEl.textContent = String(filtered.length);
  listEl.innerHTML = "";

  filtered.forEach((g, idx) => {
    const item = document.createElement("div");
    item.className = "item" + (g.id === activeId ? " active" : "");
    item.innerHTML = `
      <div class="bar"></div>
      <div class="ico">${g.emoji}</div>
      <div class="meta">
        <b>${g.name}</b>
        <small>${g.tags.map(t => "#" + t).join(" • ")}</small>
      </div>
      <div class="tag ${g.status === "Play" ? "play" : ""}">${g.status}</div>
    `;
    item.addEventListener("click", () => selectGame(g.id));
    listEl.appendChild(item);

    // auto select first result
    if(!activeId && idx === 0) selectGame(g.id, true);
  });

  if(filtered.length === 0){
    activeId = null;
    pArt.textContent = "🔍";
    pName.textContent = "Tidak ada hasil";
    pDesc.textContent = "Coba kata lain (misal: logic, memory).";
    pTags.innerHTML = "";
    pStatus.textContent = "—";
    playBtn.disabled = true;
  }
}


function selectGame(id, silent=false){
  const g = GAMES.find(x => x.id === id);
  if(!g) return;

  activeId = id;

  pArt.textContent = g.emoji;
  pName.textContent = g.name;
  pDesc.textContent = g.desc;

  pTags.innerHTML = g.tags.map(t => `<span class="chip">#${t}</span>`).join("");
  pStatus.textContent = g.status;

  const playable = (g.status === "Play") && g.href !== "#";
  playBtn.disabled = !playable;
  playBtn.onclick = () => { if(playable) location.href = g.href; };

  if(!silent) render();
}

// events
searchEl.addEventListener("input", () => {
  activeId = null;
  render();
});

clearBtn.addEventListener("click", () => {
  searchEl.value = "";
  activeId = null;
  searchEl.focus();
  render();
});

$("infoBtn").addEventListener("click", () => {
  alert(
    "Lobby model Launcher (sidebar).\n\n" +
    "Nanti kalau folder game sudah ada:\n" +
    "1) buat games/nama-game/index.html\n" +
    "2) ubah status game jadi 'Play' di js/lobby.js"
  );
});


render();
