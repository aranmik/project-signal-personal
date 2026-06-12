import { gameState } from "./state.js";
import { createInitialParty, createPreviewEnemies, createStageEnemies, SLOT_ORDER, DEFAULT_FORMATION } from "./state.js";
import { FUSION_RECIPES, BASE_JOBS, prefersFront, slotPreference } from "../data/jobs.js";
import { STAGE_CLEAR_EVENTS } from "../data/stages.js";
import { renderGame, playActionFx, playStatusTickFx } from "../ui/render.js";

let tickTimer = null;
// Combat Feel Polish 01: 기본 전투 호흡 상향. 새 1x = 500ms (BASE / speed).
const BASE_TICK_INTERVAL = 500; // 1x 기준 tick 간격

// Combat Breath Preview 01: 배속 스텝 1x→2x→3x→4x→MAX 순환.
//   MAX는 무제한이 아니라 "안전 상한"을 둔 빠른 모드 — interval을 MIN_TICK_INTERVAL로 floor한다.
//   (배수만 크게 두고 interval을 캡 → FX/전투 루프가 무너지지 않고 연출도 보이는 빠른 모드)
//   Living Battle Screen 04A: 모바일 운용상 속도 선택지를 2x/MAX로 단순화.
//   일반 전투 = 2x, 장기 관찰/무한 스테이지 = MAX. (구조는 그대로 — 배열만 축소, 저위험)
const SPEED_STEPS = [
  { mult: 2, label: "2x" },
  { mult: 10, label: "MAX" },
];
const MIN_TICK_INTERVAL = 60; // MAX 안전 상한 — 이 밑으로는 내려가지 않는다(≈16 tick/s)

function speedIndex() {
  const i = SPEED_STEPS.findIndex((s) => s.label === gameState.battle.speedLabel);
  return i >= 0 ? i : 0;
}

// interval을 단일 진입점에서 (재)무장한다. 항상 기존 timer를 먼저 정리 → setInterval 중복 0.
//   배속은 tick "간격"만 줄인다(계산식 무변경). MAX는 MIN_TICK_INTERVAL로 floor.
function startTicking() {
  clearInterval(tickTimer);
  tickTimer = null;
  const interval = Math.max(
    MIN_TICK_INTERVAL,
    BASE_TICK_INTERVAL / gameState.battle.speed
  );
  gameState.battle.tickInterval = interval; // renderHud가 --tick CSS 변수로 반영
  tickTimer = setInterval(battleTick, interval);
}

// Party & Formation Integrity 01 — 전투 시작 직전 formation/파티 검증.
//   계약: 슬롯당 최대 1명 / 파티 내 동일 job id 중복 없음.
//   formation은 슬롯 키 객체라 구조적으로 슬롯 중복이 불가능하지만, 미래 코드 실수를
//   대비해 유닛 slotKey 중복·누락을 감지하면 빈 슬롯으로 자동 보정 + console.warn.
function validateParty(context) {
  const f = gameState.run.formation || {};
  const jobs = SLOT_ORDER.map((k) => f[k]).filter(Boolean);
  const dupJob = jobs.find((j, i) => jobs.indexOf(j) !== i);
  if (dupJob) {
    console.warn(`[party-validation] 동일 직업 중복: ${dupJob} (${context})`);
  }

  const seen = new Set();
  gameState.party.forEach((u) => {
    if (!u.slotKey || seen.has(u.slotKey)) {
      const free = SLOT_ORDER.find((k) => !seen.has(k));
      console.warn(`[party-validation] 슬롯 중복/누락 보정: ${u.id} → ${free} (${context})`);
      u.slotKey = free;
      u.role = free && free.startsWith("f") ? "front" : "back";
    }
    seen.add(u.slotKey);
  });
}

export function startBattle() {
  if (gameState.battle.isRunning) return;

  validateParty("startBattle");
  clearFinish(); // 이전 전투의 지연 전환 잔여 취소
  gameState.battle.status = "running";
  gameState.battle.isRunning = true;
  gameState.battle.result = null;

  pushLog("전투 시작!");
  renderGame(gameState);

  startTicking();
}

// Combat Breath Preview 01: 배속 순환(1x→2x→3x→4x→MAX→1x). 전투 중이면 즉시 cadence 재무장
//   (startTicking이 기존 timer를 정리하므로 중복 없음). 비전투면 다음 startBattle에 반영.
export function cycleSpeed() {
  const next = SPEED_STEPS[(speedIndex() + 1) % SPEED_STEPS.length];
  gameState.battle.speed = next.mult;
  gameState.battle.speedLabel = next.label;
  if (gameState.battle.isRunning) {
    startTicking();
  }
  renderGame(gameState);
}

// Combat Breath Preview 01: 개발/프리뷰용 전투 장면 시작. 정식 스테이지/보상 아님.
//   4직업 파티 유지 + kind별 프리뷰 적 구성으로 전투 화면 호흡/밀도를 본다.
//   previewKind를 켜두면 전투 종료 시 성장/스테이지 진행으로 넘어가지 않고 장면에 머문다.
export function startPreview(kind) {
  clearInterval(tickTimer);
  tickTimer = null;
  clearFinish();

  gameState.run.stage = 1;
  gameState.run.result = null;
  gameState.run.bonuses = { atk: 0, maxHp: 0 };
  gameState.screen = "battle";

  gameState.party = createInitialParty();
  gameState.enemies = createPreviewEnemies(kind);
  gameState.battle.previewKind = kind;

  // Combat Readability Foundation 01: 신호 프리뷰 아군 신호.
  //   Status & Effect Foundation 01: guard는 실제 상태로 부여(전사 — front라 실제로 맞아 확인 가능).
  //   buff/mark는 효과 미구현 — statusMarkers(표시 전용) 유지.
  if (kind === "signal") {
    const u = (jobId) => gameState.party.find((x) => x.id === jobId);
    u("warrior").statuses = [{ type: "guard", duration: 4 }];
    u("warrior").statusMarkers = ["buff"];
    u("guardian").statuses = [{ type: "guard", duration: 4 }];
    u("priest").statusMarkers = ["mark"];
  }

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;

  const labels = {
    "normal-max": "프리뷰: 다수전(Normal Max)",
    "elite-mix": "프리뷰: 정예 혼합(Elite Mix)",
    "boss-solo": "프리뷰: 보스 단독(Boss Solo)",
    "signal": "프리뷰: 신호 확인(Target/Status/Role)",
  };
  gameState.logs = [labels[kind] || "프리뷰"];

  renderGame(gameState);
  startBattle();
}

// Game Flow Foundation 01: 타이틀 → 직업 선택 화면.
export function showJobSelect() {
  clearInterval(tickTimer);
  tickTimer = null;
  clearFinish();
  gameState.battle.isRunning = false;
  gameState.battle.status = "ready";
  gameState.screen = "jobSelect";
  renderGame(gameState);
}

// Shell 01 → Fusion Flow Foundation 01: 새 런 시작(스테이지 1부터 자동 전투).
//   formation을 주면 그 배치로(직업 선택 화면), 없으면 직전 시작 배치 유지(다시 시작).
export function startRun(formation) {
  if (formation && typeof formation === "object") {
    gameState.run.startFormation = { ...formation };
  }
  resetBattle();
  startBattle();
}

// Shell 01: 전투/결과 → 타이틀로 복귀
export function goTitle() {
  clearInterval(tickTimer);
  tickTimer = null;
  clearFinish();
  gameState.battle.isRunning = false;
  gameState.battle.status = "ready";
  gameState.run.result = null;
  gameState.screen = "title";
  renderGame(gameState);
}

export function resetBattle() {
  clearInterval(tickTimer);
  tickTimer = null;
  clearFinish();

  gameState.run.stage = 1;
  gameState.run.result = null;
  gameState.run.bonuses = { atk: 0, maxHp: 0, heal: 0 };
  gameState.screen = "battle";

  // Fusion Flow 01: 런 시작 배치 복원(합체/영입으로 바뀐 formation을 초기화).
  gameState.run.formation = gameState.run.startFormation
    ? { ...gameState.run.startFormation }
    : { ...DEFAULT_FORMATION };
  gameState.party = createInitialParty(gameState.run.bonuses, gameState.run.formation);
  gameState.enemies = createStageEnemies(1); // Game Flow 01: 초보자 테마 스테이지 플랜

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;
  gameState.battle.previewKind = null; // 정식 런 — 프리뷰 모드 해제
  gameState.run.recruitOffer = null;

  gameState.logs = ["초보자의 길 1 / 10 — 모험 시작!"];

  renderGame(gameState);
}

// Game Flow Foundation 01: 보상 선택(공격/체력/회복 훈련) → 다음 스테이지.
//   회복 훈련은 사제 회복량에 작은 고정치(+2)를 더한다 — 복잡한 성장 시스템 아님.
export function applyReward(type) {
  const b = gameState.run.bonuses;
  let logMsg = "";

  if (type === "atk") {
    b.atk += 1;
    logMsg = "보상: 공격 훈련 — 파티 공격력 +1";
  } else if (type === "heal") {
    b.heal += 2;
    logMsg = "보상: 회복 훈련 — 회복량 +2";
  } else {
    b.maxHp += 5;
    logMsg = "보상: 체력 훈련 — 파티 최대 HP +5";
  }

  gameState.logs = [logMsg];

  // Fusion Flow 01: 보상 후 스테이지 클리어 이벤트(S3/S8 합체, S5 영입) 라우팅.
  //   이벤트 타이밍은 STAGE_CLEAR_EVENTS(stage data)로 관리 — 테마/층수가 바뀌면 데이터만 수정.
  const ev = STAGE_CLEAR_EVENTS[gameState.run.stage];
  if (ev) {
    if (ev.type === "recruit") rollRecruitOffer(); // 영입 후보는 진입 시 1회 확정
    gameState.screen = ev.type; // "fusion" | "recruit"
    renderGame(gameState);
    return;
  }

  proceedNextStage();
}

// Fusion Flow Foundation 01 — 합체/영입 Flow.
//   모든 판단은 run.formation(슬롯→jobId)과 데이터(FUSION_RECIPES/BASE_JOBS) 기반.
//   파티 유닛은 다음 스테이지 진입 시 formation에서 재구성된다(전투 중 변경 없음).
function proceedNextStage() {
  gameState.screen = "battle";
  advanceStage();
}

export function partyJobIds() {
  const f = gameState.run.formation || {};
  return SLOT_ORDER.map((k) => f[k]).filter(Boolean);
}

// 합체 실행: 재료 2명 제거 → 결과 1차 직업을 첫 재료 슬롯에 배치.
//   공통 규칙: 합체는 2명을 소모해 1명을 얻는다 — 인원이 1명 줄어드므로
//   "실행"한 경우 반드시 동료 영입으로 보충한다(스테이지/테마와 무관한 공통 Flow).
//   합체 없음/스킵은 영입 없이 다음 스테이지(skipFusion).
export function applyFusion(resultId) {
  const recipe = FUSION_RECIPES.find((r) => r.result === resultId);
  if (!recipe) return;
  const f = gameState.run.formation;
  if (partyJobIds().includes(recipe.result)) return; // 동일 직업 중복 금지 — 방어
  const slots = SLOT_ORDER.filter((k) => recipe.materials.includes(f[k]));
  if (slots.length < 2) return; // 재료 부족 — 방어

  // 슬롯 계승: 결과 직업의 선호(전열/후열)와 맞는 재료 슬롯 우선, 없으면 첫 재료 슬롯.
  //   계승하지 않은 재료 슬롯은 비워져 이어지는 영입에서 채워진다.
  const wantFront = prefersFront(recipe.result);
  const inherit =
    slots.find((k) => (wantFront ? k.startsWith("f") : k.startsWith("b"))) || slots[0];
  const freed = slots.find((k) => k !== inherit);
  f[inherit] = recipe.result;
  f[freed] = null;
  gameState.logs.push(`합체! ${recipe.result === "rogue" ? "전사 + 궁수 → 도적" : "사제 + 신관 → 성직자"}`);

  // 공통 규칙: 합체 실행 = 인원 1명 감소 → 반드시 영입으로 보충.
  rollRecruitOffer();
  gameState.screen = "recruit";
  renderGame(gameState);
}

export function skipFusion() {
  proceedNextStage();
}

// 영입 후보 풀: 현재 파티에 없는 기본 직업(빈 슬롯이 없으면 영입 불가).
//   동일 직업 중복 금지 — 합체 재료로 사라진 기본 직업은 다시 후보가 될 수 있다.
export function recruitCandidates() {
  const f = gameState.run.formation || {};
  const hasEmpty = SLOT_ORDER.some((k) => !f[k]);
  if (!hasEmpty) return [];
  const owned = partyJobIds();
  return BASE_JOBS.filter((id) => !owned.includes(id));
}

// 영입 화면 진입 시 후보 풀에서 랜덤 3종을 1회 확정(화면 재렌더에도 고정).
//   후보가 3보다 적으면 가능한 만큼만. 희귀도/가중치는 이번 단계에서 없음(균등).
function rollRecruitOffer() {
  const pool = recruitCandidates();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  gameState.run.recruitOffer = pool.slice(0, 3);
}

// 영입 실행: 직업 슬롯 선호(전열/후열) 순서로 첫 빈 슬롯에 배치 — 점유 슬롯 배치 불가.
export function applyRecruit(jobId) {
  const f = gameState.run.formation;
  const offered = gameState.run.recruitOffer || recruitCandidates();
  if (!offered.includes(jobId) || !recruitCandidates().includes(jobId)) return;
  const empty = slotPreference(jobId).find((k) => !f[k]);
  if (!empty) return;
  f[empty] = jobId;
  gameState.run.recruitOffer = null;
  gameState.logs.push(`새 동료 영입 완료.`);
  showArrange(); // 파티 구성 변경 → 재배치 확인
}

export function skipRecruit() {
  gameState.run.recruitOffer = null;
  showArrange(); // 영입 단계까지 온 경우 파티가 변했거나 확인이 필요 — 재배치 확인
}

// Party & Formation Integrity 01 보강 — 재배치 확인 화면.
//   파티 구성이 바뀌는 모든 경로(합체+영입, 4인 확장 영입)는 여기를 거친다.
//   합체 스킵/불가처럼 구성이 안 바뀐 경로는 거치지 않는다(proceedNextStage 직행).
function showArrange() {
  gameState.screen = "arrange";
  renderGame(gameState);
}

// 재배치 슬롯 교환(빈 슬롯 이동 포함). formation만 수정 — 검증은 startBattle에서.
export function swapFormationSlots(a, b) {
  const f = gameState.run.formation;
  if (!f || !SLOT_ORDER.includes(a) || !SLOT_ORDER.includes(b)) return;
  [f[a], f[b]] = [f[b], f[a]];
  renderGame(gameState);
}

export function confirmArrange() {
  proceedNextStage();
}

export function advanceStage() {
  gameState.run.stage += 1;

  // Fusion Flow 01: 현재 배치(합체/영입 반영) 기준으로 파티 재구성.
  gameState.party = createInitialParty(gameState.run.bonuses, gameState.run.formation || undefined);
  gameState.enemies = createStageEnemies(gameState.run.stage); // 스테이지 플랜(5 정예/10 보스)

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;
  gameState.run.result = null;

  gameState.logs.push(`초보자의 길 ${gameState.run.stage} / ${gameState.run.maxStage} — 전투 시작!`);

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

  const end = checkBattleEnd();

  // renderGame을 먼저 — 이 시점 화면은 아직 battle이라 마지막 사망 연출이 보인다.
  renderGame(gameState);

  if (end) {
    stopBattle();
    // Victory Finish 01: 정식 런/패배는 짧은 마무리 호흡 뒤 전환(사망 연출 노출).
    //   preview는 기존대로 battle 화면에 머문다(전환 없음).
    if (end.outcome !== "preview") scheduleFinish(end.outcome);
  }
}

// Status & Effect Foundation 01 — 최소 상태 시스템(poison/guard).
//   실제 상태 데이터 = unit.statuses [{ type, duration }]. statusMarkers는 계속 표시 전용.
//   duration은 "그 유닛의 행동 횟수" 기준(자기 행동마다 1 감소) → 배속(tick 간격)과 무관해
//   2x/MAX에서 체감이 동일하다. 죽은 유닛은 performAction에 오지 않으므로 tick 처리도 없다.
const POISON_TICK_DAMAGE = 2; // 작게 고정 — 밸런스를 흔들지 않는 기반 수치
const GUARD_DAMAGE_REDUCTION = 3; // 받는 피해 -3 (최소 1 보장)

// Job Identity / Skill Grammar Foundation 01 → Fusion Flow 01 — 직업 행동 문법.
//   직업은 이름이 아니라 반복되는 행동 문법으로 읽힌다. 문법은 직업 템플릿의
//   grammar 필드(strike/protect/snipe/heal/harass)에서 온다 — 직업이 늘어나도
//   battle.js 분기는 그대로(데이터만 추가). 적은 공통 "attack"(직업 문법 없음).
function grammarOf(unit) {
  return unit.grammar || "strike";
}

function actionKindOf(unit, isParty) {
  return isParty ? grammarOf(unit) : "attack";
}

// 수호자 protect: 행동 시 가장 위태로운(HP 비율 최저) 아군에게 짧은 guard 1행동.
//   공격은 그대로 수행(전투 템포 불변). 이미 guard면 중첩/갱신 없음(최소 문법).
//   FX 없음 — 상태 마커 + 로그가 신호. duration 1 = 대상의 다음 행동까지.
const GUARDIAN_PROTECT_DURATION = 1;

function grantGuard(guardian) {
  const alive = gameState.party.filter((u) => !u.isDead);
  if (alive.length === 0) return;
  const target = alive.reduce((a, b) =>
    a.hp / a.maxHp <= b.hp / b.maxHp ? a : b
  );
  if (hasStatus(target, "guard")) return;
  target.statuses.push({ type: "guard", duration: GUARDIAN_PROTECT_DURATION });
  pushLog(`${guardian.name}${josa(guardian.name, "이가")} ${target.name}${josa(target.name, "을를")} 지켰다.`);
}

function hasStatus(unit, type) {
  return Array.isArray(unit.statuses) && unit.statuses.some((s) => s.type === type);
}

// 행동 직전 상태 처리: poison 고정 피해 → duration 1 감소 → 만료 제거.
//   poison으로 죽으면 행동하지 않는다(호출부에서 isDead 확인).
function processStatusesBeforeAction(unit) {
  if (!Array.isArray(unit.statuses) || unit.statuses.length === 0) return;

  if (hasStatus(unit, "poison")) {
    unit.hp -= POISON_TICK_DAMAGE;
    pushLog(`${unit.name}${josa(unit.name, "이가")} 중독 피해. ${POISON_TICK_DAMAGE} 피해.`);
    // FX 과밀 방지: 행동선/펄스 없이 작은 숫자만 (기존 숫자 상한 공유)
    playStatusTickFx({ targetInstanceId: unit.instanceId, amount: POISON_TICK_DAMAGE, kind: "poison" });
    if (unit.hp <= 0) {
      unit.hp = 0;
      unit.isDead = true;
      pushLog(`${unit.name}${josa(unit.name, "이가")} 쓰러졌다.`);
    }
  }

  unit.statuses.forEach((s) => { s.duration -= 1; });
  unit.statuses = unit.statuses.filter((s) => s.duration > 0);
}

function performAction(unit) {
  processStatusesBeforeAction(unit);
  if (unit.isDead) {
    unit.actionGauge = 0; // poison으로 행동 전 사망 — 이번 행동은 소멸
    return;
  }

  const isParty = gameState.party.includes(unit);

  // Job Grammar 01 → Fusion Flow 01: 문법(grammar) 기반 분기 — 직업이 늘어도 여기 그대로.
  if (isParty && grammarOf(unit) === "protect") {
    grantGuard(unit);
  }

  if (isParty && grammarOf(unit) === "heal") {
    const healTarget = selectHealTarget(gameState.party);
    if (healTarget) {
      performHeal(unit, healTarget);
      unit.actionGauge -= 100;
      return;
    }
  }

  const targetPool = isParty ? gameState.enemies : gameState.party;

  const attackTarget = isParty && grammarOf(unit) === "snipe"
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
  if (unit.id === "guardian") return "찔렀다"; // Job Grammar 01 — 창(lance) 문법
  if (unit.id === "rogue") return "급습했다";  // Fusion Flow 01 — 1차 직업 문법
  return "공격했다";
}

function attackLineType(attacker) {
  if (attacker.team === "enemy") return "enemy";
  if (grammarOf(attacker) === "snipe") return "straight"; // 저격 계열(궁수/도적)
  return "slash"; // 근접/기타 — source→target connector
}

function performAttack(attacker, target) {
  // Status & Effect Foundation 01: guard — 받는 피해 최소 보정(음수/0 방지, 최소 1).
  const damage = hasStatus(target, "guard")
    ? Math.max(1, attacker.atk - GUARD_DAMAGE_REDUCTION)
    : attacker.atk;
  target.hp -= damage;

  const verb = attackVerb(attacker);
  const ro = josa(target.name, "을를");
  const i = josa(target.name, "이가");

  pushLog(`${attacker.name}${josa(attacker.name, "이가")} ${target.name}${ro} ${verb}. ${damage} 피해.`);

  // Action Feedback 01: source → target 행동선 + 피격 + 피해 숫자
  //   Job Grammar 01: kind는 직업 행동 분류(strike/protect/snipe) — 표시/확장 hook.
  playActionFx({
    sourceInstanceId: attacker.instanceId,
    sourceUnitId: attacker.id,
    targetInstanceId: target.instanceId,
    lineType: attackLineType(attacker),
    kind: actionKindOf(attacker, attacker.team === "party"),
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
  // Game Flow 01: 회복 훈련 보상(run.bonuses.heal) — 작은 고정 가산만.
  const healAmount = Math.round(healer.atk * 1.5) + (gameState.run.bonuses.heal || 0);
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
    kind: "heal", // Job Grammar 01 — priest 회복 문법
    isHeal: true,
    amount: actualHeal,
  });
}

// Combat Lifecycle Polish 01: 전투 종료를 "감지"만 하고(상태=ended), 결과/화면 전환은
//   짧은 마무리 호흡 뒤 applyFinish에서 적용한다(마지막 사망 연출이 씹히지 않게).
//   반환: null(계속) | { outcome: "preview"|"victory"|"clear"|"defeat" }
//   전투 계산식(데미지/타겟/사망 판정)은 무변경 — 전환 "타이밍"만 조정.
function checkBattleEnd() {
  const allEnemiesDead = gameState.enemies.every((u) => u.isDead);
  const allPartyDead = gameState.party.every((u) => u.isDead);
  if (!allEnemiesDead && !allPartyDead) return null;

  gameState.battle.status = "ended";

  // 프리뷰는 성장/결과로 넘어가지 않고 화면에 머문다(전환 없음 → 즉시 로그만).
  if (gameState.battle.previewKind) {
    gameState.run.result = null;
    pushLog(allEnemiesDead ? "프리뷰 종료 — 다른 장면을 선택하세요." : "프리뷰 전멸 — 다시 선택하세요.");
    return { outcome: "preview" };
  }

  if (allEnemiesDead) {
    return { outcome: gameState.run.stage < gameState.run.maxStage ? "victory" : "clear" };
  }
  return { outcome: "defeat" };
}

// Victory Finish 01: 마지막 적/아군 사망 연출이 보일 짧은 호흡 뒤 전환.
//   2x≈640ms / MAX≈420ms (사망 연출보다 살짝 길게). 너무 긴 지연 금지.
let finishTimer = null;

function finishDelay() {
  return gameState.battle.speed >= 10 ? 420 : 640;
}

function scheduleFinish(outcome) {
  clearTimeout(finishTimer);
  finishTimer = setTimeout(() => applyFinish(outcome), finishDelay());
}

function clearFinish() {
  clearTimeout(finishTimer);
  finishTimer = null;
}

// 마무리 호흡 뒤 결과/성장 전환. 기존 outcome별 흐름(victory→growth / clear·defeat→오버레이) 유지.
function applyFinish(outcome) {
  finishTimer = null;
  if (gameState.battle.status !== "ended") return; // 그 사이 새 전투 시작 시 무시(방어)

  if (outcome === "victory") {
    gameState.run.result = "victory";
    gameState.screen = "reward"; // Game Flow 01: 클리어 → 보상 선택 화면
    pushLog(`초보자의 길 ${gameState.run.stage} 클리어! 보상을 선택하세요.`);
  } else if (outcome === "clear") {
    gameState.run.result = "clear";
    pushLog("초보자의 길 클리어! ▶ 다시 시작");
  } else if (outcome === "defeat") {
    gameState.battle.result = "defeat";
    gameState.run.result = "defeat";
    pushLog("모험 실패... ▶ 다시 시작");
  }
  renderGame(gameState);
}

function pushLog(text) {
  gameState.logs.push(text);
  if (gameState.logs.length > 8) {
    gameState.logs.splice(0, gameState.logs.length - 8);
  }
}
