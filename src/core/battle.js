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

  gameState.run.stage = 1;
  gameState.run.result = null;

  gameState.party = createInitialParty();
  gameState.enemies = createInitialEnemies();

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;

  gameState.logs = ["Stage 1 — 처음부터 시작합니다."];

  renderGame(gameState);
}

export function advanceStage() {
  gameState.run.stage += 1;

  gameState.party = createInitialParty();
  gameState.enemies = createInitialEnemies();

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;
  gameState.run.result = null;

  gameState.logs = [`Stage ${gameState.run.stage} — 전투 시작!`];

  startBattle();
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
    performAction(ready[0]);
  }

  if (checkBattleEnd()) {
    stopBattle();
  }

  renderGame(gameState);
}

function performAction(unit) {
  const isParty = gameState.party.includes(unit);

  if (isParty && unit.id === "priest") {
    const healTarget = selectHealTarget(gameState.party);
    if (healTarget) {
      performHeal(unit, healTarget);
      unit.actionGauge -= 100;
      return;
    }
  }

  const targetPool = isParty ? gameState.enemies : gameState.party;

  const attackTarget = isParty && unit.id === "archer"
    ? selectArcherTarget(targetPool)
    : selectAttackTarget(targetPool);

  if (attackTarget) {
    performAttack(unit, attackTarget);
  }
  unit.actionGauge -= 100;
}

function selectAttackTarget(pool) {
  const alive = pool.filter((u) => !u.isDead);
  const front = alive.filter((u) => u.role === "front");
  return front.length > 0 ? front[0] : alive[0] ?? null;
}

function selectArcherTarget(pool) {
  const alive = pool.filter((u) => !u.isDead);
  if (alive.length === 0) return null;
  return alive.reduce((lowest, u) => u.hp < lowest.hp ? u : lowest);
}

function selectHealTarget(party) {
  const candidates = party.filter((u) => !u.isDead && u.hp < u.maxHp);
  if (candidates.length === 0) return null;

  const lowest = candidates.reduce((a, b) =>
    a.hp / a.maxHp <= b.hp / b.maxHp ? a : b
  );

  return lowest.hp / lowest.maxHp < 0.7 ? lowest : null;
}

function josa(name, type) {
  const code = name.charCodeAt(name.length - 1);
  const hasBatchim = (code - 0xAC00) % 28 !== 0;
  if (type === "은는") return hasBatchim ? "은" : "는";
  if (type === "이가") return hasBatchim ? "이" : "가";
  if (type === "을를") return hasBatchim ? "을" : "를";
  return "";
}

function attackVerb(unit) {
  if (unit.id === "archer") return "저격했다";
  if (unit.id === "warrior") return "베었다";
  return "공격했다";
}

function performAttack(attacker, target) {
  const damage = attacker.atk;
  target.hp -= damage;

  const verb = attackVerb(attacker);
  const ro = josa(target.name, "을를");
  const i = josa(target.name, "이가");

  pushLog(`${attacker.name}${josa(attacker.name, "이가")} ${target.name}${ro} ${verb}. ${damage} 피해.`);

  if (target.hp <= 0) {
    target.hp = 0;
    target.isDead = true;
    pushLog(`${target.name}${josa(target.name, "이가")} 쓰러졌다.`);
  }
}

function performHeal(healer, target) {
  const healAmount = Math.round(healer.atk * 1.5);
  const hpBefore = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + healAmount);
  const actualHeal = target.hp - hpBefore;

  pushLog(`${healer.name}${josa(healer.name, "이가")} ${target.name}${josa(target.name, "을를")} 회복했다. (+${actualHeal})`);
}

function checkBattleEnd() {
  const allEnemiesDead = gameState.enemies.every((u) => u.isDead);
  const allPartyDead = gameState.party.every((u) => u.isDead);

  if (allEnemiesDead) {
    gameState.battle.status = "ended";
    if (gameState.run.stage < gameState.run.maxStage) {
      gameState.run.result = "victory";
      pushLog(`Stage ${gameState.run.stage} 클리어! ▶ 다음 스테이지`);
    } else {
      gameState.run.result = "clear";
      pushLog("전체 클리어! ▶ 처음부터");
    }
    return true;
  }

  if (allPartyDead) {
    gameState.battle.status = "ended";
    gameState.battle.result = "defeat";
    gameState.run.result = "defeat";
    pushLog("전투 패배... ▶ 다시 시작");
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
