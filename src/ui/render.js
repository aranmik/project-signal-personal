export function renderGame(state) {
  const growthPanel = document.getElementById("growth-panel");
  const battleView = document.getElementById("battle-view");

  if (state.screen === "growth") {
    growthPanel.hidden = false;
    battleView.hidden = true;
    renderGrowthPanel(state);
  } else {
    growthPanel.hidden = true;
    battleView.hidden = false;
    battleView.dataset.status = state.battle.status;
    renderHud(state);
    renderUnits(state);
    renderLogs(state);
    renderButton(state);
  }
}

function renderGrowthPanel(state) {
  document.getElementById("growth-stage-label").textContent =
    `Stage ${state.run.stage} 클리어!`;
  document.getElementById("growth-subtitle").textContent =
    "파티를 강화하세요.";
  document.getElementById("growth-log").textContent =
    state.logs[state.logs.length - 1] ?? "";
}

function renderButton(state) {
  const btn = document.getElementById("start-button");
  if (!btn) return;
  btn.disabled = state.battle.isRunning;

  if (state.battle.status === "running") {
    btn.textContent = "전투 중...";
  } else if (state.battle.status === "ended") {
    if (state.run.result === "victory") {
      btn.textContent = "다음 스테이지";
    } else if (state.run.result === "clear") {
      btn.textContent = "처음부터";
    } else {
      btn.textContent = "다시 시작";
    }
  } else {
    btn.textContent = "전투 시작";
  }
}

function renderHud(state) {
  document.getElementById("stage-label").textContent = `Stage ${state.run.stage}`;
  document.getElementById("status-label").textContent = state.battle.status;
  renderPartyBonus(state.run.bonuses);
}

function renderPartyBonus(bonuses) {
  const el = document.getElementById("party-bonus");
  const { atk, maxHp } = bonuses;
  if (atk === 0 && maxHp === 0) {
    el.hidden = true;
    return;
  }
  const parts = [];
  if (atk > 0) parts.push(`공격 +${atk}`);
  if (maxHp > 0) parts.push(`최대 HP +${maxHp}`);
  el.textContent = `파티 강화: ${parts.join(" · ")}`;
  el.hidden = false;
}

// Battle Screen Baseline 01: 전장 위 absolute 유닛 배치
// 루다 monster-battlefield-mockup.html "1. 기본 대치" 파츠 구조 이식
const AVATAR_PARTS = {
  warrior: ["aura", "base", "stance", "body", "head", "shield"],
  priest: ["aura", "base", "stance", "body", "head", "staff"],
  archer: ["aura", "base", "stance", "body", "head", "bow", "arrow"],
  slime: ["shadow", "slime-body", "shine", "eye left", "eye right"],
  goblin: ["shadow", "ear left", "ear right", "goblin-body", "goblin-head", "eye left", "eye right", "mouth"],
  wolf: ["shadow", "tail", "wolf-body", "leg one", "leg two", "wolf-head", "ear left", "ear right", "snout", "eye"],
};

function renderUnits(state) {
  const layer = document.getElementById("unit-layer");
  if (!layer) return;
  layer.innerHTML = "";

  state.party.forEach((unit) => layer.appendChild(createFieldUnit(unit)));
  state.enemies.forEach((unit) => layer.appendChild(createFieldUnit(unit)));
}

function createFieldUnit(unit) {
  const id = unit.id || "unknown";
  const isParty = unit.team === "party";
  const deadClass = unit.isDead ? " dead" : "";

  const wrap = document.createElement("div");
  wrap.className = `unit ${unit.team} ${id}-pos${deadClass}`;
  wrap.dataset.instanceId = unit.instanceId;

  const figClass = isParty ? "avatar" : "monster";
  const parts = (AVATAR_PARTS[id] || [])
    .map((p) => `<span class="part ${p}"></span>`)
    .join("");
  const hpDisplay = Math.max(0, unit.hp);

  wrap.innerHTML = `
    <div class="${figClass} ${id}">${parts}</div>
    <span class="name">${unit.name}</span>
    <span class="hp">${hpDisplay}/${unit.maxHp}</span>
  `;

  return wrap;
}

function renderLogs(state) {
  const logList = document.getElementById("log-list");
  logList.innerHTML = "";

  const recent = state.logs.slice(-8);
  recent.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    logList.appendChild(li);
  });

  const container = document.getElementById("battle-log");
  container.scrollTop = container.scrollHeight;
}
