export function renderGame(state) {
  renderHud(state);
  renderUnits(state);
  renderLogs(state);
  renderButton(state);
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
}

function renderUnits(state) {
  const enemySide = document.getElementById("enemy-side");
  const partySide = document.getElementById("party-side");

  enemySide.innerHTML = "";
  partySide.innerHTML = "";

  state.enemies.forEach((unit) => {
    enemySide.appendChild(createUnitCard(unit));
  });

  state.party.forEach((unit) => {
    partySide.appendChild(createUnitCard(unit));
  });
}

function createUnitCard(unit) {
  const card = document.createElement("div");
  const deadClass = unit.isDead ? " dead" : "";
  card.className = `unit-card ${unit.team}${deadClass}`;
  card.dataset.instanceId = unit.instanceId;

  const label = unit.job || unit.type || unit.role;
  const hpDisplay = Math.max(0, unit.hp);

  card.innerHTML = `
    <div class="unit-name">${unit.name}</div>
    <div class="unit-role">${label}</div>
    <div class="unit-hp">HP ${hpDisplay} / ${unit.maxHp}</div>
    ${unit.isDead ? '<div class="unit-dead-label">DEAD</div>' : ""}
  `;

  return card;
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
