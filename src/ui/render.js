export function renderGame(state) {
  renderHud(state);
  renderUnits(state);
  renderLogs(state);
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
  card.className = `unit-card ${unit.team}`;
  card.dataset.instanceId = unit.instanceId;

  const label = unit.job || unit.type || unit.role;

  card.innerHTML = `
    <div class="unit-name">${unit.name}</div>
    <div class="unit-role">${label}</div>
    <div class="unit-hp">HP ${unit.hp} / ${unit.maxHp}</div>
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
}
