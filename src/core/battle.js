import { gameState } from "./state.js";
import { createInitialParty, createInitialEnemies } from "./state.js";
import { renderGame } from "../ui/render.js";

let tickTimer = null;
const TICK_INTERVAL = 1000;

export function startBattle() {
  if (gameState.battle.isRunning) return;

  gameState.battle.status = "running";
  gameState.battle.isRunning = true;
  gameState.battle.result = null;

  pushLog("전투 시작!");
  renderGame(gameState);

  tickTimer = setInterval(() => {
    battleTick();
  }, TICK_INTERVAL);
}

export function resetBattle() {
  clearInterval(tickTimer);
  tickTimer = null;

  gameState.party = createInitialParty();
  gameState.enemies = createInitialEnemies();

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;
  gameState.run.result = null;

  gameState.logs = ["전투를 초기화했습니다."];

  renderGame(gameState);
}

function stopBattle() {
  clearInterval(tickTimer);
  tickTimer = null;
  gameState.battle.isRunning = false;
}

function battleTick() {
  gameState.battle.tick += 1;

  const allUnits = [
    ...gameState.party.filter((u) => !u.isDead),
    ...gameState.enemies.filter((u) => !u.isDead),
  ];

  allUnits.forEach((u) => {
    u.actionGauge += u.speed;
  });

  const ready = allUnits
    .filter((u) => u.actionGauge >= 100)
    .sort((a, b) => {
      if (b.actionGauge !== a.actionGauge) return b.actionGauge - a.actionGauge;
      const aIsParty = gameState.party.includes(a);
      const bIsParty = gameState.party.includes(b);
      if (aIsParty !== bIsParty) return aIsParty ? -1 : 1;
      return 0;
    });

  if (ready.length > 0) {
    performAttack(ready[0]);
  }

  if (checkBattleEnd()) {
    stopBattle();
  }

  renderGame(gameState);
}

function selectTarget(attacker) {
  const isParty = gameState.party.includes(attacker);
  const pool = isParty
    ? gameState.enemies.filter((u) => !u.isDead)
    : gameState.party.filter((u) => !u.isDead);

  const front = pool.filter((u) => u.role === "front");
  return front.length > 0 ? front[0] : pool[0] ?? null;
}

function performAttack(attacker) {
  const target = selectTarget(attacker);
  if (!target) return;

  const damage = attacker.atk;
  target.hp -= damage;

  const attackerName = attacker.name;
  const targetName = target.name;
  pushLog(`${attackerName}가 ${targetName}을(를) 공격했다. ${damage} 피해.`);

  if (target.hp <= 0) {
    target.hp = 0;
    target.isDead = true;
    pushLog(`${targetName}이(가) 쓰러졌다.`);
  }

  attacker.actionGauge -= 100;
}

function checkBattleEnd() {
  const allEnemiesDead = gameState.enemies.every((u) => u.isDead);
  const allPartyDead = gameState.party.every((u) => u.isDead);

  if (allEnemiesDead) {
    gameState.battle.status = "ended";
    gameState.battle.result = "victory";
    gameState.run.result = "victory";
    pushLog("전투 승리!");
    pushLog("다시 시작할 수 있습니다.");
    return true;
  }

  if (allPartyDead) {
    gameState.battle.status = "ended";
    gameState.battle.result = "defeat";
    gameState.run.result = "defeat";
    pushLog("전투 패배...");
    pushLog("다시 시작할 수 있습니다.");
    return true;
  }

  return false;
}

function pushLog(text) {
  gameState.logs.push(text);
  if (gameState.logs.length > 8) {
    gameState.logs.splice(0, gameState.logs.length - 8);
  }
}
