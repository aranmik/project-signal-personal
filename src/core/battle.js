import { gameState } from "./state.js";
import { createInitialParty, createPreviewEnemies, createStageEnemies, SLOT_ORDER, DEFAULT_FORMATION } from "./state.js";
import { FUSION_RECIPES, BASE_JOBS, prefersFront, slotPreference } from "../data/jobs.js";
import { STAGE_CLEAR_EVENTS } from "../data/stages.js";
import { rewardById } from "../data/rewards.js";
import { renderGame, playActionFx, playStatusTickFx, playSupportFx } from "../ui/render.js";
import { skillOf } from "../data/skills.js";

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

// Start Flow UX Polish 01 — 타이틀/파티준비 → 스테이지 테마 선택 화면.
//   실제 진입 가능 테마는 초보자의 길 하나뿐(나머지 잠금). 전투 로직은 불변.
export function showStageSelect() {
  clearInterval(tickTimer);
  tickTimer = null;
  clearFinish();
  gameState.battle.isRunning = false;
  gameState.battle.status = "ready";
  gameState.run.result = null;
  gameState.screen = "stageSelect";
  renderGame(gameState);
}

// Job Codex Entry Foundation — 타이틀 → 직업 도감(관람용 화면).
//   전투/선택과 분리된 창구. 여기서 직업을 골라도 파티/게임에 아무 영향이 없다.
export function showCodex() {
  gameState.screen = "codex";
  renderGame(gameState);
}

export function resetBattle() {
  clearInterval(tickTimer);
  tickTimer = null;
  clearFinish();

  gameState.run.stage = 1;
  gameState.run.result = null;
  gameState.run.bonuses = { atk: 0, maxHp: 0, heal: 0 };
  gameState.run.rewardLevels = {}; // 런 성장은 런과 함께 초기화 (시작 배치 유지와 별개)
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
  gameState.run.lastFusion = null;
  gameState.run.recruitContext = null;

  gameState.logs = ["초보자의 길 1 / 10 — 모험 시작!"];

  renderGame(gameState);
}

// Game Flow 01 → Reward & Growth Foundation 01: 보상 선택 → 런 성장 누적 → 다음 스테이지.
//   효과는 REWARDS 데이터(stat/value) 기반 — run.bonuses에 누적되고 다음 전투 파티
//   재생성 시 아군 전체(합체/영입 멤버 포함)에 반영된다. 적에게는 적용되지 않는다.
//   rewardLevels는 표시용 선택 횟수(Lv). 런 재시작 시 둘 다 초기화(resetBattle).
export function applyReward(id) {
  const reward = rewardById(id);
  if (!reward) return;

  const b = gameState.run.bonuses;
  b[reward.stat] = (b[reward.stat] || 0) + reward.value;

  const lv = gameState.run.rewardLevels;
  lv[id] = (lv[id] || 0) + 1;

  gameState.logs = [`보상: ${reward.name} Lv.${lv[id]} — 다음 전투부터 적용`];

  // Fusion Flow 01: 보상 후 스테이지 클리어 이벤트(S3/S8 합체, S5 영입) 라우팅.
  //   이벤트 타이밍은 STAGE_CLEAR_EVENTS(stage data)로 관리 — 테마/층수가 바뀌면 데이터만 수정.
  const ev = STAGE_CLEAR_EVENTS[gameState.run.stage];
  if (ev) {
    if (ev.type === "recruit") {
      rollRecruitOffer(); // 영입 후보는 진입 시 1회 확정
      gameState.run.recruitContext = "expand"; // 4인 확장 영입 — 문구 분기용
    }
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

  // Fusion Moment 01: 합체는 탄생 — 짧은 결과 확인 화면을 먼저 보여준다.
  //   영입 후보는 지금 굴려 고정(공통 규칙: 합체 실행 = 반드시 영입으로 보충).
  gameState.run.lastFusion = {
    materials: [...recipe.materials],
    result: recipe.result,
    birthLine: recipe.birthLine,
  };
  rollRecruitOffer();
  gameState.run.recruitContext = "fusion";
  gameState.screen = "fusionResult";
  renderGame(gameState);
}

// 합체 결과 확인 → 동료 영입으로 이어간다(후보는 applyFusion에서 이미 확정).
export function continueAfterFusion() {
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
    applyDamage(unit, POISON_TICK_DAMAGE); // shield 우선 흡수(공통 피해 경로)
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

  // Hero Skill Foundation 01: 행동 횟수(주기형 스킬 조건용). 스테이지마다 유닛 재생성 → 자연 초기화.
  unit.actionCount = (unit.actionCount || 0) + 1;

  const isParty = gameState.party.includes(unit);

  // 영웅: 스킬 조건을 만족하면 스킬 사용(아니면 기본 공격으로 fallback). 적은 스킬 없음.
  if (isParty && trySkill(unit)) {
    unit.actionGauge -= 100;
    return;
  }

  // 기본 공격(fallback). snipe 문법(궁수/도적)은 약한 적 우선 원거리 타겟팅 유지.
  const targetPool = isParty ? gameState.enemies : gameState.party;
  const attackTarget = isParty && grammarOf(unit) === "snipe"
    ? selectArcherTarget(targetPool)
    : selectAttackTarget(targetPool);

  if (attackTarget) {
    performAttack(unit, attackTarget);
  }
  unit.actionGauge -= 100;
}

// Hero Skill Foundation 01 — 영웅 첫 스킬 디스패치(직업 id 기준).
//   원칙: 조건 만족 시 스킬 수행 후 true 반환 → 기본 공격 대신 스킬. 아니면 false(기본 공격).
//   계산식은 "스킬 효과 최소 범위"에서만 변경(배수/소량 회복/게이지 -25). 밸런스는 보수적.
function trySkill(unit) {
  const meta = skillOf(unit.id);
  if (!meta) return false;
  const enemies = gameState.enemies.filter((u) => !u.isDead);

  switch (unit.id) {
    case "warrior": {
      // 강타: 3번째 행동마다 강한 일격(×1.5).
      if (unit.actionCount % 3 !== 0) return false;
      const t = selectAttackTarget(enemies);
      if (!t) return false;
      performAttack(unit, t, { mult: 1.5, skill: meta });
      return true;
    }
    case "rogue": {
      // 급습: HP 40% 이하 적이 있으면 마무리(×1.6, 원거리 문법 유지).
      const low = lowestRatioEnemy(enemies, 0.4);
      if (!low) return false;
      performAttack(unit, low, { mult: 1.6, lineType: "ranged", skill: meta });
      return true;
    }
    case "archer": {
      // 저격: 3번째 행동마다 또는 HP 50% 이하 적이 있으면 약점 저격(×1.4, 약한 적 우선).
      const low = lowestRatioEnemy(enemies, 0.5);
      if (unit.actionCount % 3 !== 0 && !low) return false;
      const t = selectArcherTarget(enemies);
      if (!t) return false;
      performAttack(unit, t, { mult: 1.4, lineType: "ranged", skill: meta });
      return true;
    }
    case "trickster": {
      // 교란: 곧 행동할(게이지 높은) 적의 진행도를 낮춤(-25) + 아주 약한 피해. 영구잠금 없음.
      const top = enemies.reduce((a, b) => (a && (a.actionGauge || 0) >= (b.actionGauge || 0) ? a : b), enemies[0]);
      if (!top || (top.actionGauge || 0) < 40) return false;
      performDisrupt(unit, top, meta);
      return true;
    }
    case "guardian": {
      // 수호: 피해 입었고 보호막 없는 아군 중 HP 비율 최저에게 보호막 부여(+그래도 기본 공격은 수행).
      const ward = damagedUnshieldedAlly();
      if (!ward) return false;
      grantShieldTo(unit, ward, SHIELD_GUARD);
      pushLog(`${unit.name}${josa(unit.name, "이가")} ${ward.name}${josa(ward.name, "을를")} 지켰다.`);
      playSupportFx({ casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind, guardInstanceId: ward.instanceId });
      // 보호 후에도 전열 공격은 유지(템포 불변) — 단 외침은 수호!만(공격 외침 생략).
      const t = selectAttackTarget(enemies);
      if (t) performAttack(unit, t, { noShout: true });
      return true;
    }
    case "priest": {
      // 치유: HP 75% 이하 아군이 있으면 최저 1명 회복.
      const t = lowestRatioAlly(0.75);
      if (!t) return false;
      performHeal(unit, t, { skill: meta });
      return true;
    }
    case "cleric": {
      // 축복: 피해 입은 아군이 있으면 소량 회복 + guard(사제보다 회복 낮게, 보호 위주).
      const t = lowestRatioAlly(0.95);
      if (!t) return false;
      performBless(unit, t, meta);
      return true;
    }
    case "saint": {
      // 성역: HP 80% 이하 아군이 2명 이상이면 파티 소량 회복 + 최저 1명 guard.
      const hurt = gameState.party.filter((u) => !u.isDead && u.hp / u.maxHp <= 0.8);
      if (hurt.length < 2) return false;
      performSanctuary(unit, meta);
      return true;
    }
    default:
      return false;
  }
}

// 스킬 보조 셀렉터 ---------------------------------------------------------
function aliveParty() {
  return gameState.party.filter((u) => !u.isDead);
}
function lowestRatioAlly(maxRatio) {
  const c = aliveParty().filter((u) => u.hp / u.maxHp < maxRatio);
  if (c.length === 0) return null;
  return c.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
}
function damagedUnshieldedAlly() {
  const c = aliveParty().filter((u) => u.hp < u.maxHp && (u.shield || 0) <= 0);
  if (c.length === 0) return null;
  return c.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
}
function lowestRatioEnemy(enemies, maxRatio) {
  const c = enemies.filter((u) => u.hp / u.maxHp <= maxRatio);
  if (c.length === 0) return null;
  return c.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
}

// Combat Grammar Polish 02 — 보호막(numeric) 부여. 보수적 수치. 누적 폭주 방지를 위해
//   기존 shield와 비교해 더 큰 값으로 "갱신"(stack이 아니라 refresh).
const SHIELD_GUARD = 12;   // 수호자 수호
const SHIELD_BLESS = 8;    // 신관 축복
const SHIELD_SANCT = 6;    // 성직자 성역(최저 1명)
function grantShieldTo(caster, target, amount) {
  target.shield = Math.max(target.shield || 0, amount);
}

// Combat Grammar Polish 02 — 피해 적용: shield 우선 흡수 → 초과분만 HP. 사망 판정은 HP 기준.
//   poison/기본 공격/교란 등 모든 피해가 이 경로를 탄다(공통). 음수 방지.
function applyDamage(target, dmg) {
  let remaining = Math.max(0, dmg);
  const sh = target.shield || 0;
  if (sh > 0) {
    const absorbed = Math.min(sh, remaining);
    target.shield = sh - absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) target.hp -= remaining;
}

// 교란: 게이지 -25(0 미만 방지) + 아주 약한 피해. 보라/분홍 왜곡선.
function performDisrupt(trickster, target, meta) {
  const dmg = Math.max(1, Math.round(trickster.atk * 0.5));
  applyDamage(target, dmg);
  target.actionGauge = Math.max(0, (target.actionGauge || 0) - 25);
  pushLog(`${trickster.name}${josa(trickster.name, "이가")} ${target.name}${josa(target.name, "을를")} 교란했다. ${dmg} 피해.`);
  playActionFx({
    sourceInstanceId: trickster.instanceId,
    sourceUnitId: trickster.id,
    targetInstanceId: target.instanceId,
    lineType: "disrupt",
    kind: "disrupt",
    isHeal: false,
    amount: dmg,
    shoutText: meta.name + "!",
    shoutKind: meta.kind,
    shoutTier: "skill",
  });
  if (target.hp <= 0) {
    target.hp = 0;
    target.isDead = true;
    pushLog(`${target.name}${josa(target.name, "이가")} 쓰러졌다.`);
  }
}

// 축복(신관): 소량 회복 + guard. 사제 단일 치유보다 회복 낮게.
function performBless(cleric, target, meta) {
  const healAmount = Math.max(1, Math.round(cleric.atk * 1.0));
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + healAmount);
  const actual = target.hp - before;
  grantShieldTo(cleric, target, SHIELD_BLESS);
  pushLog(`${cleric.name}${josa(cleric.name, "이가")} ${target.name}${josa(target.name, "을를")} 축복했다. (+${actual})`);
  playSupportFx({
    casterInstanceId: cleric.instanceId,
    text: meta.name + "!",
    kind: meta.kind,
    heals: actual > 0 ? [{ targetInstanceId: target.instanceId, amount: actual }] : [],
    guardInstanceId: target.instanceId,
  });
}

// 성역(성직자): 파티 전체 소량 회복 + 최저 1명 guard. 단일 큰 회복이 아니라 "안정화".
function performSanctuary(saint, meta) {
  const allies = aliveParty();
  const each = Math.max(1, Math.round(saint.atk * 0.8));
  const heals = [];
  allies.forEach((a) => {
    const before = a.hp;
    a.hp = Math.min(a.maxHp, a.hp + each);
    const actual = a.hp - before;
    if (actual > 0) heals.push({ targetInstanceId: a.instanceId, amount: actual });
  });
  const lowest = allies.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
  let guardId = null;
  if (lowest) {
    grantShieldTo(saint, lowest, SHIELD_SANCT);
    guardId = lowest.instanceId;
  }
  pushLog(`${saint.name}${josa(saint.name, "이가")} 성역을 펼쳤다. 파티가 안정됐다.`);
  playSupportFx({
    casterInstanceId: saint.instanceId,
    text: meta.name + "!",
    kind: meta.kind,
    heals,
    guardInstanceId: guardId,
  });
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

// Basic Action Breath 01 — 행동 시각 문법(표시용. 계산/타겟/피해 불변).
//   영웅·몬스터의 일반 공격은 같은 "attack"(빨강 곡선 + X 타격점),
//   원거리 기본 공격(snipe: 궁수/도적)은 "ranged"(녹색·크게 휘는 곡선 + 과녁),
//   회복은 "heal"(청록 점선 + 십자가). action kind는 표시 문법용으로만 쓴다.
function attackLineType(attacker) {
  if (attacker.team === "enemy") return "attack"; // 몬스터 일반 공격도 영웅과 같은 전투 언어
  if (grammarOf(attacker) === "snipe") return "ranged"; // 원거리 기본 공격(궁수/도적)
  return "attack"; // 근접/일반
}

// Hero Skill Foundation 01: opts = { mult, skill, lineType, noShout }.
//   mult = 피해 배수(스킬), skill = { name, kind }(스킬 텍스트), lineType 강제(급습/저격=ranged),
//   noShout = 외침 생략(수호 후 동반 공격 등). 미지정이면 기본 공격 "공격!".
function performAttack(attacker, target, opts = {}) {
  // Status & Effect Foundation 01: guard — 받는 피해 최소 보정(음수/0 방지, 최소 1).
  const base = hasStatus(target, "guard")
    ? Math.max(1, attacker.atk - GUARD_DAMAGE_REDUCTION)
    : attacker.atk;
  const damage = Math.max(1, Math.round(base * (opts.mult || 1)));
  // Combat Grammar Polish 02: 보호막 우선 흡수 → 초과분만 HP.
  applyDamage(target, damage);

  const verb = attackVerb(attacker);
  const ro = josa(target.name, "을를");

  pushLog(`${attacker.name}${josa(attacker.name, "이가")} ${target.name}${ro} ${verb}. ${damage} 피해.`);

  const line = opts.lineType || attackLineType(attacker);
  playActionFx({
    sourceInstanceId: attacker.instanceId,
    sourceUnitId: attacker.id,
    targetInstanceId: target.instanceId,
    lineType: line,
    kind: actionKindOf(attacker, attacker.team === "party"),
    isHeal: false,
    amount: damage,
    // 스킬이면 스킬명(더 큰 텍스트), 아니면 기본 "공격!". noShout면 외침 없음.
    shoutText: opts.noShout ? null : opts.skill ? opts.skill.name + "!" : "공격!",
    shoutKind: opts.skill ? opts.skill.kind : line === "ranged" ? "ranged" : "attack",
    shoutTier: opts.skill ? "skill" : "basic",
  });

  if (target.hp <= 0) {
    target.hp = 0;
    target.isDead = true;
    pushLog(`${target.name}${josa(target.name, "이가")} 쓰러졌다.`);
  }
}

function performHeal(healer, target, opts = {}) {
  // Game Flow 01: 회복 훈련 보상(run.bonuses.heal) — 작은 고정 가산만.
  const healAmount = Math.round(healer.atk * 1.5) + (gameState.run.bonuses.heal || 0);
  const hpBefore = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + healAmount);
  const actualHeal = target.hp - hpBefore;

  pushLog(`${healer.name}${josa(healer.name, "이가")} ${target.name}${josa(target.name, "을를")} 회복했다. (+${actualHeal})`);

  // Action Feedback 01: source → target 회복선 + 회복 숫자. Skill 01: 치유! 텍스트.
  playActionFx({
    sourceInstanceId: healer.instanceId,
    sourceUnitId: healer.id,
    targetInstanceId: target.instanceId,
    lineType: "heal",
    kind: "heal",
    isHeal: true,
    amount: actualHeal,
    shoutText: opts.skill ? opts.skill.name + "!" : "치유!",
    shoutKind: "heal",
    shoutTier: "skill",
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
