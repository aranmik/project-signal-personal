import { gameState } from "./state.js";
import { createInitialParty, createInitialEnemies } from "./state.js";
import { renderGame, playActionFx } from "../ui/render.js";

let tickTimer = null;
// Combat Feel Polish 01: 기본 전투 호흡 상향. 나라 체감상 기존 2x가 기본에 가까움.
//   새 1x = 500ms / 새 2x = 250ms (BASE / speed). 계산식 무변경, tick 간격만.
const BASE_TICK_INTERVAL = 500; // 1x 기준 tick 간격

// Battle Speed 01: interval을 단일 진입점에서 (재)무장한다.
//   항상 기존 timer를 먼저 정리 → setInterval 중복 생성 0.
//   배속은 tick "간격"만 줄인다(계산식 무변경) — 1x 500ms / 2x 250ms.
function startTicking() {
  clearInterval(tickTimer);
  tickTimer = null;
  const interval = BASE_TICK_INTERVAL / gameState.battle.speed;
  tickTimer = setInterval(battleTick, interval);
}

export function startBattle() {
  if (gameState.battle.isRunning) return;

  gameState.battle.status = "running";
  gameState.battle.isRunning = true;
  gameState.battle.result = null;

  pushLog("전투 시작!");
  renderGame(gameState);

  startTicking();
}

// Battle Speed 01: 1x ↔ 2x 토글. 전투 중이면 현재 cadence로 interval 재무장
//   (startTicking이 기존 timer를 정리하므로 중복 없음). 비전투면 다음 startBattle에 반영.
export function toggleSpeed() {
  gameState.battle.speed = gameState.battle.speed === 1 ? 2 : 1;
  if (gameState.battle.isRunning) {
    startTicking();
  }
  renderGame(gameState);
}

// Shell 01: 타이틀 → 전투 진입 (스테이지 1부터 새 런 시작 후 자동 전투)
export function startRun() {
  resetBattle();
  startBattle();
}

// Shell 01: 전투/결과 → 타이틀로 복귀
export function goTitle() {
  clearInterval(tickTimer);
  tickTimer = null;
  gameState.battle.isRunning = false;
  gameState.battle.status = "ready";
  gameState.run.result = null;
  gameState.screen = "title";
  renderGame(gameState);
}

export function resetBattle() {
  clearInterval(tickTimer);
  tickTimer = null;

  gameState.run.stage = 1;
  gameState.run.result = null;
  gameState.run.bonuses = { atk: 0, maxHp: 0 };
  gameState.screen = "battle";

  gameState.party = createInitialParty();
  gameState.enemies = createInitialEnemies();

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;

  gameState.logs = ["Stage 1 — 처음부터 시작합니다."];

  renderGame(gameState);
}

export function applyGrowth(type) {
  const b = gameState.run.bonuses;
  let logMsg = "";

  if (type === "atk") {
    b.atk += 1;
    logMsg = "성장 선택: 공격 훈련 — 파티 공격력 +1";
  } else {
    b.maxHp += 5;
    logMsg = "성장 선택: 체력 훈련 — 파티 최대 HP +5";
  }

  gameState.screen = "battle";
  gameState.logs = [logMsg];
  advanceStage();
}

export function advanceStage() {
  gameState.run.stage += 1;

  gameState.party = createInitialParty(gameState.run.bonuses);
  gameState.enemies = createInitialEnemies();

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;
  gameState.run.result = null;

  gameState.logs.push(`Stage ${gameState.run.stage} — 전투 시작!`);

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

function attackLineType(attacker) {
  if (attacker.team === "enemy") return "enemy";
  if (attacker.id === "archer") return "straight";
  return "slash"; // 전사(및 근접) — source→target connector
}

function performAttack(attacker, target) {
  const damage = attacker.atk;
  target.hp -= damage;

  const verb = attackVerb(attacker);
  const ro = josa(target.name, "을를");
  const i = josa(target.name, "이가");

  pushLog(`${attacker.name}${josa(attacker.name, "이가")} ${target.name}${ro} ${verb}. ${damage} 피해.`);

  // Action Feedback 01: source → target 행동선 + 피격 + 피해 숫자
  playActionFx({
    sourceInstanceId: attacker.instanceId,
    sourceUnitId: attacker.id,
    targetInstanceId: target.instanceId,
    lineType: attackLineType(attacker),
    isHeal: false,
    amount: damage,
  });

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

  // Action Feedback 01: source → target 회복선 + 회복 숫자
  playActionFx({
    sourceInstanceId: healer.instanceId,
    sourceUnitId: healer.id,
    targetInstanceId: target.instanceId,
    lineType: "heal",
    isHeal: true,
    amount: actualHeal,
  });
}

function checkBattleEnd() {
  const allEnemiesDead = gameState.enemies.every((u) => u.isDead);
  const allPartyDead = gameState.party.every((u) => u.isDead);

  if (allEnemiesDead) {
    gameState.battle.status = "ended";
    if (gameState.run.stage < gameState.run.maxStage) {
      gameState.run.result = "victory";
      gameState.screen = "growth";
      pushLog(`Stage ${gameState.run.stage} 클리어! 성장을 선택하세요.`);
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
