import { gameState } from "./state.js";
import { createInitialParty, createPreviewEnemies, createStageEnemies, createRouteEnemies, createLayoutPreviewEnemies, createUnit, SLOT_ORDER, DEFAULT_FORMATION } from "./state.js";
import { ACTIVE_FUSION_RECIPES, BASE_JOBS, ADVANCED_JOBS, SECOND_CLASS_JOBS, prefersFront, slotPreference, availableFusions, combatRoleOf } from "../data/jobs.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { STAGE_CLEAR_EVENTS } from "../data/stages.js";
import { ROUTE_TYPES, rollRouteOffer, SAGE_COOLDOWN, bossFury, bossReadinessPressure, bossMenace, alertnessFromFusions, depthSpeedFactor, routeReward, farmWarnLevel } from "../data/routes.js";
import { REWARDS, rewardById, REWARD_MAX_LEVEL } from "../data/rewards.js";
// Deep Reward Pool 01 — 심층 탐험형 보상 + 고갈 fallback. active만 등장(scaffold/idea는 Dev 카탈로그 전용). 영구스탯/레벨업 없음.
import { DEEP_REWARDS, deepRewardById, activeDeepRewards } from "../data/deepRewards.js";
import { saveFootprint } from "../data/footprints.js";
// Return & Loot Core 01 — 런 중 "들고 있는" 전리품 후보(감정 코어 · 전투 스탯 효과 없음 · 영구 경제 아님).
import { rollLootCandidate } from "../data/loot.js";
// Discovery Codex Foundation 01 — 안전한 진행도 기록 훅(headless 주회 중엔 호출 안 함). 전투 계산/수치 불변.
import { recordRunResult, recordMonstersDefeated } from "./progression.js";
import { renderGame, playActionFx, playStatusTickFx, playSupportFx, playStatusApplyFx, playActorFx, clearFxLayer, setFxSuppressed, setRenderSuppressed } from "../ui/render.js";
import { skillOf } from "../data/skills.js";

let tickTimer = null;
// Dev Balance Lab 01 — 계측 미터(헤드리스 듀얼 sim 중에만 set). 본게임 전투에는 항상 null이라
//   아래 전투 함수의 훅들이 전혀 동작하지 않는다(피해/회복/계산식 100% 불변). 파일 하단 섹션 참조.
let labMeter = null;
// Auto Run Report 01 — 헤드리스 자동 주회 모드(별도 대시보드 페이지에서만 ON). 본게임엔 항상 false.
//   ON이면: 전투 tick 타이머를 만들지 않고(runHeadlessBattle가 수동 구동), 전투 종료 전환을 즉시(동기)
//   처리하며, 렌더/FX/로그/발자취 기록을 생략한다. 전투 계산식/런 규칙은 일절 바꾸지 않는다.
let headlessRun = false;
// Dev Balance Lab 02 — 현재 행동 중인 유닛(회복/보호막/표식의 "시전자" 귀속용). performAction이 매 행동마다 갱신.
//   labMeter가 null이면 의미 없음(계측 외 영향 0). 공격은 performAttack이 attacker를 직접 넘기므로 이 변수와 무관.
let labActor = null;
export function setHeadlessRun(v) {
  headlessRun = !!v;
  setRenderSuppressed(headlessRun); // renderGame no-op(대시보드엔 게임 DOM 없음)
  setFxSuppressed(headlessRun);     // FX DOM/타이머 생성 차단(성능·청결)
}
// Combat Feel Polish 01: 기본 전투 호흡 상향. 새 1x = 500ms (BASE / speed).
const BASE_TICK_INTERVAL = 500; // 1x 기준 tick 간격
// Run Footprints Polish 01 — 기본 배속(x2) 1틱의 현실 시간(=BASE/2=250ms). 전투 게임 틱 수에 곱해
//   "x2로 봤다면 걸렸을 현실 전투시간"을 환산한다. 틱 수는 배속과 무관(게임 길이)이라 MAX 60ms floor도 자동 반영.
const X2_TICK_INTERVAL = BASE_TICK_INTERVAL / 2;

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
  if (headlessRun) return; // Auto Run Report 01 — 주회는 runHeadlessBattle가 tick을 수동 구동(타이머 없음)
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
  clearFxLayer(); // Monster Identity 02 — 이전 전투의 잔여 FX 정리(누적 방지)
  gameState.battle.status = "running";
  gameState.battle.isRunning = true;
  gameState.battle.result = null;

  // Run Footprints 01 — 정식 전투만 현실 시간 측정 시작(preview/layout preview 제외).
  if (!gameState.battle.previewKind) gameState.run.battleStartTs = performance.now();

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

// Battlefield Preview & Layout Tune 01 — Dev 레이아웃 프리뷰. 전투 계산을 돌리지 않고(틱 없음) 배치만 본다.
//   previewKind="layout"로 두어 전투/보상 흐름과 완전 분리. 케이스 전환은 같은 화면에서 즉시(devBar).
export function startLayoutPreview(caseId) {
  clearInterval(tickTimer);
  tickTimer = null;
  clearFinish();
  gameState.party = createInitialParty();           // 기본 4인 — 행동선 거리 확인용
  gameState.enemies = createLayoutPreviewEnemies(caseId);
  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;
  gameState.battle.previewKind = "layout";
  gameState.run.layoutCase = caseId;                // devBar 하이라이트용
  gameState.run.currentRouteType = "normal";
  gameState.screen = "battle";
  gameState.logs = [`Dev 레이아웃 프리뷰 — ${caseId}`];
  renderGame(gameState);                            // 정적 렌더(틱 없음)
}

// 타이틀 → Dev 프리뷰 진입(첫 케이스).
export function showDevPreview() {
  startLayoutPreview("alert-5");
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
  gameState.run.bonuses = { atk: 0, maxHp: 0, heal: 0, healRecv: 0 };
  gameState.run.rewardLevels = {}; // 런 성장 + 훈련 선택 횟수(MAX 3 캡) 초기화 (시작 배치 유지와 별개)
  gameState.run.training = {};      // Run Reward Training 01 — 대상 필터 성장 초기화
  gameState.run.rewardOffer = null; // Run Reward Training 01 — 보상 3택 초기화
  // Deep Reward Pool 01 — 심층 보상 상태/관측 초기화.
  gameState.run.nextBattleShield = null;   // 다음 전투 보호막 보상(1회 소비)
  gameState.run.rewardFallbackCount = 0;   // 보상 고갈 fallback 발동 수(dev)
  gameState.run.deepRewardOffered = 0;     // 심층 보상 제시 수(dev)
  gameState.run.deepRewardTaken = 0;       // 심층 보상 선택 수(dev)
  gameState.run.rewardNoCandidateError = 0; // 보상 후보 0개 에러(항상 0이 정상 · dev)
  gameState.run.carriedLoot = []; // Return & Loot Core 01 — 새 런 시작 시 들고 있던 전리품 초기화
  gameState.screen = "battle";

  // Fusion Flow 01: 런 시작 배치 복원(합체/영입으로 바뀐 formation을 초기화).
  gameState.run.formation = gameState.run.startFormation
    ? { ...gameState.run.startFormation }
    : { ...DEFAULT_FORMATION };
  gameState.party = createInitialParty(gameState.run.bonuses, gameState.run.formation, gameState.run.training);
  gameState.enemies = createStageEnemies(1); // Game Flow 01: 초보자 테마 스테이지 플랜

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;
  gameState.battle.previewKind = null; // 정식 런 — 프리뷰 모드 해제
  gameState.run.recruitOffer = null;
  gameState.run.recruitSlot = null;
  gameState.run.recruitPreview = null;
  gameState.run.lastFusion = null;
  gameState.run.recruitContext = null;

  // Run Structure 01A: 여정 레이어 초기화. stage=이긴 전투 수, depth=여정 깊이(별개).
  gameState.run.depth = 1;
  gameState.run.bossKeys = 0;
  gameState.run.threat = 0;
  gameState.run.alertness = 0;   // 01B 경계도/합체 누적도 런과 함께 초기화
  gameState.run.fusionCount = 0;
  gameState.run.routeChoices = null;
  gameState.run.currentRouteType = "normal"; // 첫 전투는 고정 도입(일반)
  gameState.run.rewardPicks = 0;             // Reward Pressure 01 — 보상 선택 횟수 초기화
  gameState.run.deepForestCount = 0;         // (구) 깊은 수풀 보상 단계 — Route Grammar 02에서 미사용(초기화만 유지)
  gameState.run.recruitPower = 0;            // 영입 누적(경계도 가산) — Route Grammar 02: 동료의 흔적 영입 수
  // Route Grammar 02 — 4인 전 런웨이 / 잠복 경계도 / anti-farm 추적 상태.
  gameState.run.party4Reached = false;       // 4인 완성 래치(한 번 켜지면 유지 — 합체로 3인이 돼도 켜진 채)
  gameState.run.party4Depth = 0;             // 4인 최초 완성 심도
  gameState.run.alertnessAtParty4 = 0;       // 4인 완성 시점의 누적 경계도(전환 스냅샷)
  gameState.run.effectiveAlertnessAtParty4 = 0;
  gameState.run.preParty4Battles = 0;        // 4인 전 치른 전투 수(anti-farm 기준)
  gameState.run.preParty4GrowthCount = 0;    // 4인 전 성장 보상 픽 수
  gameState.run.preParty4DangerCount = 0;    // 4인 전 깊은 수풀 진입 수
  gameState.run.preParty4RecruitCount = 0;   // 4인 전 영입 수
  gameState.run.farmWarnShown = 0;           // 마지막으로 보여준 파밍 경고 단계
  gameState.run.restJustTaken = false;       // Rest Grove 01 — 직전에 쉼터(정비)를 골랐는가(다음 오퍼 보정용)
  gameState.run.lastRestDepth = 0;           // Rest Grove 01 — 마지막 정비 심도
  gameState.run.bondMissStreak = 0;          // Route Choice Polish 02 — 결속 미노출 연속수(굶김 가드)
  gameState.run.eliteCooldown = 0;           // Route Choice Polish 02 — 정예(현자의 가지) 노출 쿨다운
  gameState.run.partyHp = null;              // Stage Persistence 01 — 전투 간 HP 지속 초기화(첫 전투는 풀피)
  gameState.run.combatMs = 0;                // Run Footprints 01 — 현실 전투 시간 누적 초기화(새 런)
  gameState.run.battleStartTs = null;
  gameState.run.combatNormMs = 0;            // Run Footprints Polish 01 — x2 환산 전투시간 누적 초기화

  gameState.logs = ["새싹 숲 입구 — 모험 시작! 첫 전투가 끝나면 여정을 고른다."];

  renderGame(gameState);
}

// Game Flow 01 → Reward & Growth Foundation 01: 보상 선택 → 런 성장 누적 → 다음 스테이지.
//   효과는 REWARDS 데이터(stat/value) 기반 — run.bonuses에 누적되고 다음 전투 파티
//   재생성 시 아군 전체(합체/영입 멤버 포함)에 반영된다. 적에게는 적용되지 않는다.
//   rewardLevels는 표시용 선택 횟수(Lv). 런 재시작 시 둘 다 초기화(resetBattle).
// Run Reward Training 01 — 훈련 효과 적용(대상별 라우팅).
//   전역(all)·회복(heal)은 기존 run.bonuses 경로 재사용 → createUnit/회복 계산이 그대로 반영.
//   배치/역할 대상은 run.training[target] 버킷에 누적 → createInitialParty가 대상 유닛에만 가산.
// Diversification 02 — 단일 효과 적용 헬퍼(균형 훈련의 extra까지 공용).
function applyGrant(target, stat, value) {
  const b = gameState.run.bonuses;
  if (stat === "healRecv") {
    b.healRecv = (b.healRecv || 0) + value;             // 받는 치유량(전역) — createUnit이 healReceivedBonus로 반영
  } else if (stat === "heal") {
    b.heal = (b.heal || 0) + value;                     // 레거시(현재 미사용 — 안전 유지)
  } else if (target === "all") {
    b[stat] = (b[stat] || 0) + value;                   // 공세/생존/균형(전역 atk/maxHp)
  } else {
    const t = gameState.run.training[target] || (gameState.run.training[target] = { atk: 0, maxHp: 0 });
    t[stat] = (t[stat] || 0) + value;                   // 전열/후열/역할 대상 필터 성장
  }
}
function applyTrainingReward(reward) {
  applyGrant(reward.target, reward.stat, reward.value);
  if (reward.extra) applyGrant(reward.target, reward.extra.stat, reward.extra.value); // 균형 훈련: 받는 치유량 +1
}

// Run Reward Training 01 → Diversification 02 — 훈련 후보 적격성.
//   ① 대상자가 있을 때만(없는 훈련 배제: all=항상, front/back=해당 열 점유, 역할=combatRole 보유).
//   ② MAX(Lv.3) 도달 훈련은 후보에서 제외(rewardLevels 카운트 기준).
function rewardTargetPresent(reward) {
  if (reward.target === "all") return true;
  const f = gameState.run.formation || {};
  if (reward.target === "front" || reward.target === "back") {
    const pre = reward.target === "front" ? "f" : "b";
    return SLOT_ORDER.some((k) => f[k] && k.startsWith(pre));
  }
  // 역할 대상(tank/melee/ranged/support) — combatRole 보유 파티원 존재 여부.
  return partyJobIds().some((id) => combatRoleOf(id) === reward.target);
}
function rewardEligible(reward) {
  const lv = (gameState.run.rewardLevels && gameState.run.rewardLevels[reward.id]) || 0;
  if (lv >= REWARD_MAX_LEVEL) return false; // MAX 도달 → 후보 제외
  return rewardTargetPresent(reward);
}

// Diversification 02 → Deep Reward Pool 01 + Reward Exhaustion Fallback 01 — 보상 3택을 굴려 고정(재렌더에도 유지).
//   ① 심도별 등장 규칙(C): 1~20 성장만 / 21~29 성장 + 낮은 확률 심층 1 / 30+ 성장 고갈분을 심층 active로 보충.
//   ② 고갈 fallback(A): 어떤 이유로든 후보가 0이면 심층 active(최소 "숨 고르기")로 보장 → 보상 화면이 절대 빈 채로
//      진행 불가가 되지 않게 한다(rewardNoCandidateError는 항상 0이 정상). MAX 성장을 다시 넣지는 않는다(스탯 무한증가 X).
function rollRewardOffer() {
  const run = gameState.run;
  const depth = run.depth || 1;
  const eligibleGrowth = REWARDS.filter(rewardEligible);
  const deepPool = activeDeepRewards().filter((r) => depth >= (r.depthMin || 0)); // 심도 조건 충족한 active 심층 보상
  let pool = eligibleGrowth.slice();
  if (depth >= 30) {
    pool = eligibleGrowth.concat(deepPool); // 30+: 성장 고갈분을 심층이 자연 보충(질 위주 — active만)
  } else if (depth >= 21 && deepPool.length && Math.random() < 0.5) {
    pool = eligibleGrowth.concat([deepPool[Math.floor(Math.random() * deepPool.length)]]); // 21~29: 낮은 확률로 심층 1 후보
  }
  let offer = shuffle(pool).slice(0, 3).map((r) => r.id);
  // A — Fallback: 후보 0(전 성장 Max 등)이면 심층 active로 보장. 심도 조건도 못 채우면 심도 무관 최소 보장.
  if (offer.length === 0) {
    const fb = deepPool.length ? deepPool : activeDeepRewards();
    offer = shuffle(fb).slice(0, 3).map((r) => r.id);
    run.rewardFallbackCount = (run.rewardFallbackCount || 0) + 1;
  }
  if (offer.length === 0) { offer = ["deep_breath"]; run.rewardFallbackCount = (run.rewardFallbackCount || 0) + 1; } // 최후 방어(이론상 미도달)
  run.rewardOffer = offer;
  // dev 관측(Run Reward 안정화): 심층 제시/고갈 에러. rewardNoCandidateError는 0이어야 정상.
  if (offer.some((id) => deepRewardById(id))) run.deepRewardOffered = (run.deepRewardOffered || 0) + 1;
  if (offer.length === 0) run.rewardNoCandidateError = (run.rewardNoCandidateError || 0) + 1;
}

export function applyReward(id) {
  const growthReward = rewardById(id);
  const deepReward = growthReward ? null : deepRewardById(id);
  const reward = growthReward || deepReward;
  if (!reward) return;
  // 현재 제시된 3택에 없는 id는 무시(재렌더/중복 클릭 방어).
  if (!(gameState.run.rewardOffer || []).includes(id)) return;

  if (growthReward) {
    applyTrainingReward(growthReward);
    const lv = gameState.run.rewardLevels;
    lv[id] = (lv[id] || 0) + 1;
    gameState.logs = [`보상: ${growthReward.name} Lv.${lv[id]} — 다음 전투부터 적용`];
    // Route Grammar 02 — 4인 전 성장 보상 픽 추적(anti-farm 신호: 4인 전 과도한 성장 파밍 관측).
    if (!gameState.run.party4Reached) gameState.run.preParty4GrowthCount = (gameState.run.preParty4GrowthCount || 0) + 1;
  } else {
    // Deep Reward Pool 01 — 심층 active 보상 적용(현재 HP 회복 / 다음 전투 보호막). 영구 스탯 증가 없음.
    applyDeepReward(deepReward);
    gameState.run.deepRewardTaken = (gameState.run.deepRewardTaken || 0) + 1;
    gameState.logs = [`보상: ${deepReward.name} — ${deepReward.effect}`];
  }

  // Reward Pressure 01 — 다회 성장 선택(깊은 수풀=2회). 남은 픽이 있으면 새 3택을 굴려 보상 화면 유지.
  gameState.run.rewardPicks = (gameState.run.rewardPicks || 1) - 1;
  if (gameState.run.rewardPicks > 0) {
    rollRewardOffer();
    gameState.screen = "reward";
    renderGame(gameState);
    return;
  }
  gameState.run.rewardOffer = null;

  // Route Grammar 02 — 전투 보상 후엔 곧장 다음 여정 선택으로(합체 자동 연결 제거).
  //   합체는 더 이상 깊은 수풀/스테이지 이벤트로 자동 진입하지 않는다 — "결속의 공터(bond)" 루트의 명시적 선택뿐.
  //   (deepForestRewardType / STAGE_CLEAR_EVENTS 자동 합체 트리거 제거 — 영입/합체와 위험 전투의 분리.)
  proceedNextStage();
}

// Deep Reward Pool 01 — 심층 active 보상 적용. heal=현재 파티HP 스냅샷 회복(다음 전투 이월) / shield=다음 전투 시작 보호막 플래그.
//   영구 스탯/레벨업 없음 · 모두 "이번 런/다음 전투" 한정 · safe 메커니즘(기존 partyHp 이월 + u.shield)만 사용.
function applyDeepReward(reward) {
  const ap = reward && reward.apply;
  if (!ap) return; // scaffold/idea는 apply 없음(애초에 offer에 안 들어오지만 방어).
  if (ap.kind === "heal") {
    // 숨 고르기 — capturePartyHp가 보상 직전에 호출되므로 run.partyHp가 현재 HP. 스냅샷을 소량 회복(applyPersistedHp가 maxHp 클램프).
    const snap = gameState.run.partyHp;
    if (snap) {
      Object.keys(snap).forEach((job) => {
        const s = snap[job];
        if (s && s.ko) snap[job] = { hp: ap.amount };          // 기절 → 소량 부활
        else if (s) s.hp = (s.hp || 0) + ap.amount;            // 생존 → 소량 회복(클램프는 복원 시)
      });
    }
  } else if (ap.kind === "shield") {
    // 응축된 성장 / 전열 다짐 — 다음 전투 시작 시 1회 보호막(누적 안 됨). advanceStage가 소비.
    gameState.run.nextBattleShield = { scope: ap.scope, pct: ap.pct };
  }
}

// Deep Reward Pool 01 — 다음 전투 시작 보호막 부여(1회 소비). advanceStage가 applyPersistedHp 직후 호출.
//   scope "all"=전원 / "front"=전열만(formation 슬롯 f*). u.shield는 기존 전투 메커니즘(흡수) 재사용 — 수치 로직 불변.
function applyNextBattleShield() {
  const nb = gameState.run.nextBattleShield;
  if (!nb) return;
  gameState.run.nextBattleShield = null; // 1회 소비(다음 전투 1회 한정)
  const f = gameState.run.formation || {};
  gameState.party.forEach((u) => {
    if (u.isDead) return;
    if (nb.scope === "front") {
      const slot = SLOT_ORDER.find((k) => f[k] === u.jobId);
      if (!(slot && slot.startsWith("f"))) return;
    }
    u.shield = Math.max(u.shield || 0, Math.round(u.maxHp * nb.pct));
  });
}

// Fusion Flow Foundation 01 — 합체/영입 Flow.
//   모든 판단은 run.formation(슬롯→jobId)과 데이터(FUSION_RECIPES/BASE_JOBS) 기반.
//   파티 유닛은 다음 스테이지 진입 시 formation에서 재구성된다(전투 중 변경 없음).
// Run Structure 01A: 전투 후(보상/합체/영입/배치 이후) 다음 전투로 직행하지 않고 "여정 선택"을 거친다.
//   모든 전투 후 경로(보상 직행 / 합체 스킵 / 재배치 확정)가 여기 한 곳으로 모이므로 단일 진입점.
function proceedNextStage() {
  showRouteChoice();
}

// Run Structure 01A — 여정 선택 화면 표시. depth/bossKeys로 선택지(읽히는 반고정)를 굴려 고정한다.
function showRouteChoice() {
  clearFinish();
  gameState.battle.isRunning = false;
  gameState.battle.status = "ready";
  gameState.run.result = null;
  updateParty4Latch();   // Route Grammar 02 — 영입/합체 직후 4인 완성 래치 반영
  maybeFarmWarning();    // Route Grammar 02 — 4인 전 파밍 예고(잠복 압력)
  // Route Grammar 02B — 의미별 전투 루트 오퍼(2~3개 랜덤): ally는 4인 미만 영입가능 시, bond는 3인+ 합체가능 시.
  // Rest Grove 01 — 다친 파티는 정비(쉼터) 선택지 보장 + 쉼터 직후엔 연속 쉼터 방지하고 빌드 우선.
  const av = aliveParty();
  const hpRatio = av.length ? av.reduce((s, u) => s + Math.max(0, u.hp) / u.maxHp, 0) / av.length : 1;
  const restJustTaken = !!gameState.run.restJustTaken;
  const run = gameState.run;
  const canFuseNow = availableFusions(partyJobIds()).length > 0;
  const canBondNow = canFuseNow && partyJobIds().length >= 3; // 결속의 공터 노출 가능(3인+ & 조합)
  run.routeChoices = rollRouteOffer({
    depth: run.depth,
    bossKeys: run.bossKeys,
    partySize: partyJobIds().length,
    canRecruit: recruitCandidates().length > 0,          // 동료의 흔적 노출 조건(빈자리 + 미보유 기본직업)
    canFuse: canFuseNow,                                  // 결속의 공터 노출 조건(실제 합체 조합 — 인원 게이트는 rollRouteOffer가 3인+로 적용)
    hpRatio, restJustTaken,
    bondMissStreak: run.bondMissStreak || 0,              // Route Choice Polish 02 — 결속 굶김 가드
    eliteCooldown: run.eliteCooldown || 0,               // Route Choice Polish 02 — 정예(현자의 가지) 쿨다운
  });
  run.restJustTaken = false; // 오퍼에 반영했으니 소비
  // Route Choice Polish 02 — 오퍼 결과로 카운터 갱신: 결속 미노출 연속수 / 정예 쿨다운(연속·조기 노출 억제).
  const offered = run.routeChoices;
  run.bondMissStreak = canBondNow ? (offered.includes("bond") ? 0 : (run.bondMissStreak || 0) + 1) : 0;
  run.eliteCooldown = offered.includes("elite") ? SAGE_COOLDOWN : Math.max(0, (run.eliteCooldown || 0) - 1);
  gameState.screen = "route";
  renderGame(gameState);
}

// Route Grammar 02 — 4인 완성 래치. 한 번 4인이 되면 잠복 경계도가 전면 전환되고 그 뒤로 유지된다
//   (합체로 3인이 돼도 "여정은 이미 시작됐다"). 영입/합체/라우팅 직후 호출된다.
function updateParty4Latch() {
  if (gameState.run.party4Reached) return;
  if (!partyIsFull()) return;
  gameState.run.party4Reached = true;
  gameState.run.party4Depth = gameState.run.depth;
  gameState.run.alertnessAtParty4 = gameState.run.alertness || 0;
  gameState.run.effectiveAlertnessAtParty4 = gameState.run.alertness || 0; // 4인 도달 = 잠복 전면 전환
  pushLog("파티가 완성되었습니다 — 이제부터 숲이 본격적으로 반응합니다. 진짜 여정의 시작.");
}

// Route Grammar 02 — 4인 전 파밍 예고(즉시 처벌 아님 — 잠복 압력이 쌓이고 있음을 읽힌다).
function maybeFarmWarning() {
  if (gameState.run.party4Reached || partyIsFull()) return;
  const lvl = farmWarnLevel(gameState.run.preParty4Battles || 0);
  if (lvl > (gameState.run.farmWarnShown || 0)) {
    gameState.run.farmWarnShown = lvl;
    if (lvl === 1) pushLog("파티가 완성되지 않은 채 숲을 오래 헤매고 있습니다 — 숲의 시선이 모입니다.");
    else if (lvl === 2) pushLog("동료를 모으지 않고 전투를 반복합니다 — 이후 숲의 압력이 커집니다(잠복 경계도 누설).");
  }
}

// Run Structure 01A — 길 선택. 휴식=전투 없이 한 박자(다시 선택), 그 외=인카운터 생성 후 전투.
//   "내가 보스 도전 타이밍을 정한다" — 보스문은 열쇠가 있을 때만 오퍼에 포함된다(여기서도 방어).
export function chooseRoute(routeType) {
  const rt = ROUTE_TYPES[routeType];
  if (!rt) return;
  if (!(gameState.run.routeChoices || []).includes(routeType)) return;

  gameState.run.depth += 1;
  gameState.run.currentRouteType = routeType;
  gameState.run.routeChoices = null;

  if (rt.kind === "rest") {
    restParty();
    gameState.run.threat = Math.max(0, gameState.run.threat - 1);
    // Rest Grove 01 — 쉼터 = "정비". 전원 회복 + 다음 여정 오퍼가 빌드(영입/합체)를 보장하도록 플래그(연속 쉼터 방지 포함).
    gameState.run.restJustTaken = true;
    gameState.run.lastRestDepth = gameState.run.depth;
    pushLog("이슬 쉼터에서 숨을 고르고 진형을 정비했다 — 전원 회복. 다음 여정에서 빌드 기회가 이어진다.");
    // Rest Route Polish 01 — 곧장 넘어가지 않고 짧은 정비 장면(진형 정리)을 보여준 뒤 여정으로 잇는다.
    gameState.screen = "rest";
    renderGame(gameState);
    return;
  }

  // Route Grammar 02B — 동료의 흔적(ally)/결속의 공터(bond)도 "전투 루트"다. 여기선 전투로 진입만 하고,
  //   영입/합체는 전투 승리 후 applyFinish에서 연결한다(패배 시 영입/합체 없음). 합체 후 자동 영입은 여전히 금지.
  // 위험/정예는 위험도(읽힘용) 상승. 보스/일반/영입/결속은 변동 없음(영입·결속 전투는 일반 난도).
  if (routeType === "danger") gameState.run.threat += 2;
  else if (routeType === "elite") gameState.run.threat += 1;

  // Route Grammar 02 — 4인 전 전투/위험 추적(anti-farm 신호 + 관측). 깊은 수풀은 별도 카운트.
  if (!gameState.run.party4Reached) {
    gameState.run.preParty4Battles = (gameState.run.preParty4Battles || 0) + 1;
    if (routeType === "danger") gameState.run.preParty4DangerCount = (gameState.run.preParty4DangerCount || 0) + 1;
  }

  gameState.screen = "battle";
  advanceStage(routeType);
}

// Rest Route Polish 01 — 휴식 장면에서 "여정을 잇는다" → 다음 여정 선택으로 복귀.
export function continueFromRest() {
  showRouteChoice();
}

// Stage Persistence 01 / Rest Route Polish 01 — 전투 간 HP 지속(직업 기준 저장/복원).
//   매 스테이지 풀피 재생성을 대체한다: 승리 시 생존 HP를 저장하고, 다음 전투에서 복원한다.
//   기절(HP0) 영웅은 ko로 기록 → 다음 전투에서 HP 1로 복귀("간신히 정신을 차린 상태").
//   직업(jobId) 키라 재배치/슬롯 이동에 안전하고, 합체/영입으로 생긴 신규 직업은 키가 없어 풀피로 합류한다.
function capturePartyHp() {
  const snap = {};
  gameState.party.forEach((u) => {
    if (!u.jobId) return;
    snap[u.jobId] = u.isDead ? { ko: true } : { hp: u.hp };
  });
  gameState.run.partyHp = snap;
}

function applyPersistedHp() {
  const snap = gameState.run.partyHp;
  if (!snap) return; // 첫 전투(또는 런 시작 직후): 풀피 그대로
  gameState.party.forEach((u) => {
    const s = u.jobId && snap[u.jobId];
    if (!s) return; // 신규 합류(영입/합체): createUnit 기본값(풀피) 유지
    if (s.ko) { u.hp = 1; u.isDead = false; }                 // 기절 → HP 1로 복귀(여전히 매우 위험)
    else if (typeof s.hp === "number") u.hp = Math.max(1, Math.min(u.maxHp, s.hp)); // 생존 HP 이월(클램프)
  });
}

// Rest Route Polish 01 — 이슬 쉼터: 기절 포함 파티 전원 HP를 max로 완전 회복.
//   저장 HP도 풀로 갱신해 다음 전투까지 회복이 유지된다(쉼터 = 위험을 쉬어가는 선택).
function restParty() {
  gameState.party.forEach((u) => { u.hp = u.maxHp; u.isDead = false; });
  const snap = {};
  gameState.party.forEach((u) => { if (u.jobId) snap[u.jobId] = { hp: u.maxHp }; });
  gameState.run.partyHp = snap;
}

export function partyJobIds() {
  const f = gameState.run.formation || {};
  return SLOT_ORDER.map((k) => f[k]).filter(Boolean);
}

// Sage Branch Gate 01 — 합체는 "현재 편성 파티가 4인으로 가득 찼을 때"만 열린다.
//   2인 출발 → 깊은 수풀 영입 2회로 4인을 채운 뒤에야 합체 선택지/보상/화면이 등장한다.
//   판정 기준은 formation 슬롯(jobId 맵) 점유 여부 — 전투 HP/기절(isDead)과 무관하다.
//   즉 HP 0 기절 영웅도 슬롯에 존재하면 파티원으로 센다(사망/제외로 빼지 않음).
function partyIsFull() {
  const f = gameState.run.formation || {};
  return SLOT_ORDER.every((k) => !!f[k]);
}

// Sage Branch Gate 01 — 합체 진입 가능 여부의 단일 판정(파티 4인 + 실행 가능한 레시피 존재).
//   합체가 노출되는 모든 경로(보상 후 라우팅 / 깊은 수풀 보상)가 이 한 곳을 거친다.
function canEnterFusion() {
  return partyIsFull() && availableFusions(partyJobIds()).length > 0;
}

// 합체 실행: 재료 2명 제거 → 결과 1차 직업을 첫 재료 슬롯에 배치.
//   공통 규칙: 합체는 2명을 소모해 1명을 얻는다 — 인원이 1명 줄어드므로
//   "실행"한 경우 반드시 동료 영입으로 보충한다(스테이지/테마와 무관한 공통 Flow).
//   합체 없음/스킵은 영입 없이 다음 스테이지(skipFusion).
export function applyFusion(resultId) {
  const recipe = ACTIVE_FUSION_RECIPES.find((r) => r.result === resultId); // Unlock 01 — 1차+2차 병합 소스
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
  // Run Structure 01B — 합체 실행 = 경계도 상승. 파티가 합체로 강해질수록 몬스터가 더 대비한다
  //   (합체를 막지 않는다 — 대신 다음 인카운터가 더 조직적인 진형으로 응답한다).
  gameState.run.fusionCount = (gameState.run.fusionCount || 0) + 1;
  // Deep Forest Reward Rebuild 01 — 경계도 = 합체 + 깊은수풀 영입(둘 다 "강해진" 사건). 기존 산식 재사용.
  gameState.run.alertness = alertnessFromFusions(gameState.run.fusionCount + (gameState.run.recruitPower || 0));
  // First Class Trial 01: 합체 로그를 레시피 데이터 기반으로(15종 1차 직업 공통). 이름은 직업 템플릿.
  const jn = (id) => UNIT_TEMPLATES.party[id]?.name || id;
  gameState.logs.push(`합체! ${jn(recipe.materials[0])} + ${jn(recipe.materials[1])} → ${jn(recipe.result)}`);
  // Run Structure 01C — 경계도는 "실제 합체 횟수"로만 오른다(길 선택만으로는 안 오름). 규칙을 로그로 명확히.
  gameState.logs.push(`경계도 ${gameState.run.alertness} — 강해진 파티에 몬스터가 더 조직적으로 대비한다.`);

  // Route Grammar 02 — 합체는 영웅 2명을 소모해 상위 영웅 1명을 얻는다. 인원이 1명 줄어드는 것은 비용이자 선택 결과다.
  //   더 이상 자동 영입으로 빈자리를 채우지 않는다 — 빈자리를 채울지는 다음 여정(동료의 흔적)에서 유저가 정한다.
  gameState.logs.push(`파티 인원이 ${partyJobIds().length}명으로 줄었습니다 — 빈자리는 '동료의 흔적'에서 채울 수 있습니다.`);

  // Fusion Moment 01: 합체는 탄생 — 짧은 결과 확인 화면을 먼저 보여준다(자동 영입 없이 다음 여정으로).
  gameState.run.lastFusion = {
    materials: [...recipe.materials],
    result: recipe.result,
    birthLine: recipe.birthLine,
  };
  gameState.run.recruitContext = null; // 합체 후 자동 영입 제거 — 빈자리는 유지된다
  gameState.screen = "fusionResult";
  renderGame(gameState);
}

// Route Grammar 02 — 합체 결과 확인 → 곧장 다음 여정 선택으로(자동 영입 제거). 빈자리는 유지된다.
export function continueAfterFusion() {
  proceedNextStage();
}

// Recruit UX Rebuild 01 — 영입 진입: 채울 빈 슬롯(recruitSlot)을 고정하고 미리보기 상태 초기화.
//   한 화면에서 "현재 파티 확인 + 후보 미리배치/교체 + 다음 여정으로"를 모두 처리한다(별도 배치 단계 제거).
function enterRecruit() {
  const f = gameState.run.formation || {};
  gameState.run.recruitSlot = SLOT_ORDER.find((k) => !f[k]) || null;
  gameState.run.recruitPreview = null;
  gameState.screen = "recruit";
  renderGame(gameState);
}

// Deep Forest Reward Rebuild 01 — 다음 깊은 수풀 보상 종류: 처음 2회=동료 영입 → 이후=합체.
//   줄 수 없으면 null(깊은 수풀 미등장). 영입가능=빈자리+미보유 기본직업 / 합체가능=실행 레시피 존재.
//   영입 단계인데 영입 불가(빈자리 없음 등)면 합체로 폴백, 합체도 불가하면 null.
export function deepForestRewardType() {
  const count = gameState.run.deepForestCount || 0;
  const canRecruit = recruitCandidates().length > 0;
  // Sage Branch Gate 01 — 합체 보상은 파티 4인 + 레시피 존재일 때만(2/3인이면 합체 후보 미등장).
  const canFuse = canEnterFusion();
  if (count < 2 && canRecruit) return "recruit";
  if (canFuse) return "fusion";
  if (canRecruit) return "recruit";
  return null;
}

// Deep Forest Reward Rebuild 01 — 깊은 수풀 클리어 보상(파티 강화 X). 영입/영입/합체 순. 단계 진행 후 화면 전환.
function giveDeepForestReward() {
  const type = deepForestRewardType();
  gameState.run.deepForestCount = (gameState.run.deepForestCount || 0) + 1; // 보상 단계 진행
  if (type === "recruit") {
    rollRecruitOffer();
    gameState.run.recruitContext = "deepforest";
    pushLog("수풀 속에서 새 동료를 만났습니다.");
    enterRecruit();
  } else if (type === "fusion") {
    pushLog("수풀 깊은 곳에서 합체의 기회가 열렸습니다.");
    gameState.screen = "fusion";
    renderGame(gameState);
  } else {
    // 안전장치(정상적으론 danger가 안 떴어야 함) — 보상 없이 다음 여정으로.
    pushLog("깊은 수풀을 헤쳤다.");
    proceedNextStage();
  }
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

// Recruit UX Rebuild 01 → Arrange Hotfix 01 — 후보 미리배치(확정 전 교체 가능). 직전 미리보기는 jobId로
//   추적해 제거(슬롯을 교체한 뒤여도 안전) 후 빈 슬롯에 새로 배치한다. 슬롯 위치는 파티 그리드 탭으로 교체.
export function previewRecruit(jobId) {
  const f = gameState.run.formation;
  if (!f) return;
  const offered = gameState.run.recruitOffer || [];
  if (!offered.includes(jobId)) return;
  // 직전 미리보기 동료 제거(스왑으로 위치가 바뀌었을 수 있으니 jobId로 찾는다).
  if (gameState.run.recruitPreview) {
    const prev = SLOT_ORDER.find((k) => f[k] === gameState.run.recruitPreview);
    if (prev) f[prev] = null;
  }
  const empty = SLOT_ORDER.find((k) => !f[k]);
  if (!empty) return;                    // 빈자리 없으면 무시(정상적으론 항상 있음)
  f[empty] = jobId;
  gameState.run.recruitPreview = jobId;
  renderGame(gameState);
}

// Recruit UX Rebuild 01 — 영입 확정 → 곧바로 여정 선택으로(별도 "새 파티를 배치하세요" 단계 우회).
//   후보가 있는데 미선택이면 진행 차단(UI 버튼이 딤드라 사실상 안 옴). 후보가 없으면 그냥 진행.
export function confirmRecruit() {
  const hasCandidates = (gameState.run.recruitOffer || []).length > 0;
  if (hasCandidates && !gameState.run.recruitPreview) return;
  if (gameState.run.recruitPreview) {
    gameState.logs.push("새 동료와 함께 — 다음 여정으로.");
    // Route Grammar 02 — 동료의 흔적(ally) 영입 = 경계도 상승(강해진 만큼 숲이 대비). 4인 전엔 잠복으로 쌓인다.
    if (gameState.run.recruitContext === "ally") {
      gameState.run.recruitPower = (gameState.run.recruitPower || 0) + 1;
      gameState.run.alertness = alertnessFromFusions((gameState.run.fusionCount || 0) + gameState.run.recruitPower);
      if (!gameState.run.party4Reached) gameState.run.preParty4RecruitCount = (gameState.run.preParty4RecruitCount || 0) + 1;
      gameState.logs.push(`경계도 ${gameState.run.alertness}${gameState.run.party4Reached ? "" : " (잠복)"} — 새 동료로 강해진 파티에 숲이 대비한다.`);
    }
  }
  gameState.run.recruitOffer = null;
  gameState.run.recruitPreview = null;
  gameState.run.recruitSlot = null;
  gameState.run.recruitContext = null;
  proceedNextStage(); // 배치 단계 건너뜀 — 한 화면에서 흐름이 이어진다
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

// Run Structure 01A: stage(이긴 전투 수)는 합체 S3/S8·영입 S5와 일반 풀 인덱스를 계속 구동한다.
//   다만 다음 인카운터는 stage 플랜이 아니라 "고른 길"(routeType)이 정한다 — createRouteEnemies.
export function advanceStage(routeType = gameState.run.currentRouteType) {
  gameState.run.stage += 1;

  // Fusion Flow 01: 현재 배치(합체/영입 반영) 기준으로 파티 재구성. Run Reward Training 01 — 대상 필터 성장 반영.
  gameState.party = createInitialParty(gameState.run.bonuses, gameState.run.formation || undefined, gameState.run.training);
  // Stage Persistence 01 — 풀피 재생성 대신 직전 전투 결과 HP를 복원(기절 영웅은 HP 1). 첫 전투는 무영향.
  applyPersistedHp();
  applyNextBattleShield(); // Deep Reward Pool 01 — 응축된 성장/전열 다짐 보상의 다음 전투 보호막(1회 소비)
  gameState.enemies = createRouteEnemies(routeType, gameState.run); // 길 선택이 인카운터를 만든다

  gameState.battle.tick = 0;
  gameState.battle.status = "ready";
  gameState.battle.isRunning = false;
  gameState.battle.result = null;
  gameState.run.result = null;

  const label = ROUTE_TYPES[routeType]?.hud || "전투";
  gameState.logs.push(`심도 ${gameState.run.depth} — ${label} 시작!`);

  // Run Structure 01B — 보스 심도 강화 체감(로그). 늦게 도전할수록 사자왕이 숲의 깊이에 반응한다.
  //   Boss Early Challenge Pressure 01 — 준비 부족(인원/합체/심도)이면 별개 축으로 위압 로그를 더한다.
  if (routeType === "boss") {
    const fury = bossFury(gameState.run.depth);
    if (fury.log) gameState.logs.push(fury.log);
    const ready = bossReadinessPressure({
      depth: gameState.run.depth,
      bossKeys: gameState.run.bossKeys || 0,
      fusionCount: gameState.run.fusionCount || 0,
      partySize: gameState.party.length,
    });
    if (ready.log) gameState.logs.push(ready.log);
    // Boss Readiness Pressure 02 — 위압 상태(활성/해제)도 진입 시 체감 로그로 알린다.
    gameState.logs.push(bossMenace(gameState.run.bossKeys || 0).log);
  }

  startBattle();
}

function stopBattle() {
  clearInterval(tickTimer);
  tickTimer = null;
  gameState.battle.isRunning = false;
}

// Dev Balance Lab 01 — 한 "전투 스텝"(게이지 충전 → 준비된 유닛 1명 행동)을 단일 함수로 추출.
//   본게임 battleTick과 헤드리스 듀얼 sim이 같은 엔진 경로를 공유한다(게이지 공식/행동 분기 복제 없음).
//   tick 카운트/렌더/종료판정/마무리는 battleTick이, 반복 호출은 sim 루프(runDuelSimulation)가 담당한다.
function stepCombat() {
  const allUnits = [
    ...gameState.party.filter((u) => !u.isDead),
    ...gameState.enemies.filter((u) => !u.isDead),
  ];

  // Run Structure 01C — 심도 속도 압박: 심도 30+/40+에서 몬스터 게이지 충전 가속(×1.3/×1.5). 영웅 불변.
  //   계산식은 게이지 "충전량"만 — tick 간격/배속 루프와 무관하므로 2x/MAX에서도 안전.
  const enemySpeedMult = depthSpeedFactor(gameState.run.depth || 1);
  allUnits.forEach((u) => {
    // First Class Expansion 01: slow(감속, 바드 템포) ×0.6. Combat Grammar Foundation 01: speedUp/speedDown ±30%.
    //   세 상태는 곱연산으로 합성(자기 행동 시 1턴 만료). 게이지 "충전량"만 조정 → 배속 루프와 무관.
    let speedMod = 1;
    if (hasStatus(u, "slow")) speedMod *= 0.6;
    if (hasStatus(u, "speedDown")) speedMod *= (1 - statusPct(u, "speedDown"));
    if (hasStatus(u, "speedUp")) speedMod *= (1 + statusPct(u, "speedUp"));
    let gain = u.speed * speedMod;
    if (gameState.enemies.includes(u)) gain *= enemySpeedMult; // 심도 30+/40+ 몬스터(보스 포함)만 가속
    u.actionGauge += gain;
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
}

function battleTick() {
  gameState.battle.tick += 1;
  stepCombat();

  const end = checkBattleEnd();

  // renderGame을 먼저 — 이 시점 화면은 아직 battle이라 마지막 사망 연출이 보인다.
  renderGame(gameState);

  if (end) {
    stopBattle();
    // Run Footprints 01 — 정식 전투 종료 시 현실 전투 시간 누적(preview 제외). battleStartTs는 startBattle에서 설정.
    if (end.outcome !== "preview" && gameState.run.battleStartTs != null) {
      gameState.run.combatMs = (gameState.run.combatMs || 0) + (performance.now() - gameState.run.battleStartTs);
      // Run Footprints Polish 01 — x2 환산: 이 전투의 게임 틱 수 × x2 틱 간격(배속 무관 — 게임 길이 기준).
      gameState.run.combatNormMs = (gameState.run.combatNormMs || 0) + (gameState.battle.tick || 0) * X2_TICK_INTERVAL;
      gameState.run.battleStartTs = null;
    }
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

/* ── Combat Grammar Foundation 01 — 치명 / 공통 상태(버프·디버프) / 도발 기반 ──────────
   "앞으로 모든 스킬이 얹힐 공통 전투 문법." 새 스킬을 늘리는 게 아니라 기반을 만든다.
   기존 atkUp(올빼미)/atkDown(이슬말랑·사자왕 포효)/slow(바드)/guard/taunt(수문장 어그로)와 호환:
   이 시스템은 같은 statuses 배열·applyStatus·performAttack/applyDamage 경로를 공유한다. */
const CRIT_BASE = 0.10;        // 기본 치명 확률(상수화 — 추후 조정)
const CRIT_MULT = 1.5;         // 치명 피해 배율
// Batch 01C — 덫꾼 독 표식: 중독된 대상을 기본 공격할 때 치명 확률 가산("치명판"). 시전자 무관 횡단 효과.
const POISON_CRIT_BONUS = 0.25;
// Batch 01C — 바드 랜덤(적 효과: 행동 게이지 감소량). 교란꾼 -25 감각 재사용.
const BARD_GAUGE_DROP = 25;
const STATUS_PCT = 0.30;       // 공통 버프/디버프 1차 효과 크기(공/방/치/속 ±30%)
const STATUS_MAX_TURNS = 3;    // 최대 지속 — 재적용 시 항상 3턴으로 갱신
// 공통 버프/디버프 키: atkUp/atkDown(공격력) defUp/defDown(방어) critUp/critDown(치명) speedUp/speedDown(속도).
//   taunted = 새 도발(도발당함 — 다음 기본 공격을 도발자에게). 기존 taunt(어그로 자석)와 별개 키.

// 특정 상태의 효과 크기(pct)를 읽는다(없으면 0). 효과 계산 공용.
function statusPct(unit, type) {
  if (!Array.isArray(unit.statuses)) return 0;
  const s = unit.statuses.find((x) => x.type === type);
  return s ? (s.pct || 0) : 0;
}

// 공통 상태 부여 — 항상 STATUS_MAX_TURNS로 갱신(1~3턴 남아도 3으로). 머리 위 짧은 FX로 읽힘.
function applyCombatStatus(target, type, pct = STATUS_PCT) {
  applyStatus(target, { type, duration: STATUS_MAX_TURNS, pct });
  playStatusApplyFx(target.instanceId, STATUS_FX_LABEL[type] || "", STATUS_FX_VARIANT[type] || "");
}

// 도발(신규 문법): 도발자→대상. 대상의 다음 "기본 공격" 타겟을 도발자로 강제(특수행동 X).
//   여러 도발이 들어오면 마지막 도발자가 우선(tauntedBy 덮어쓰기). 단일 대상.
function applyTaunt(caster, target) {
  applyTauntMany(caster, [target]);
}

// Combat Visibility Job Grammar 01 — 영웅 도발 대상 수(직업 티어): 기본 2 / 1차 3 / 2차 4.
//   ※ 나라 "3차"=현재 구조상 2차 직업으로 해석. 도발 효과 구조(강제 타겟 redirect)는 그대로, "대상 수"만 티어로.
function heroTauntCount(jobId) {
  if (SECOND_CLASS_JOBS.includes(jobId)) return 4;
  if (ADVANCED_JOBS.includes(jobId)) return 3;
  return 2; // 기본 직업
}

// 도발: 최대 N명에게 "나를 봐!"(taunted — 다음 기본 공격을 도발자에게). 대상마다 노랑 점선 도발선. 외침은 1회.
//   효과 구조 불변(applyStatus taunted + tauntedBy redirect). N은 호출부에서 heroTauntCount로 정한다.
function applyTauntMany(caster, foes) {
  const list = (foes || []).filter(Boolean);
  if (!list.length) return;
  const names = list.map((f) => f.name).join(", ");
  pushLog(`${caster.name}${josa(caster.name, "이가")} ${names}${josa(names, "을를")} 도발했다 — 나를 봐!`);
  list.forEach((foe, i) => {
    foe.tauntedBy = caster.instanceId;
    applyStatus(foe, { type: "taunted", duration: STATUS_MAX_TURNS });
    playActionFx({
      sourceInstanceId: caster.instanceId, sourceUnitId: caster.id, targetInstanceId: foe.instanceId,
      lineType: "taunt", kind: "taunt", isHeal: false, amount: 0,
      shoutText: i === 0 ? "나를 봐!" : null, shoutKind: "taunt", shoutTier: "skill",
    });
  });
}

// 도발 리다이렉트 — 기본 공격 시 호출. 도발당한 상태면 타겟을 도발자로 바꾸고 도발을 소모(1회).
//   특수행동(포효/회복/버프)은 이 경로를 안 타므로 도발에 끊기지 않는다(보스 포효 보호).
function redirectIfTaunted(unit, intended) {
  const id = unit.tauntedBy;
  if (!id) return intended;
  const taunter = [...gameState.party, ...gameState.enemies].find((u) => u.instanceId === id && !u.isDead);
  unit.tauntedBy = null; // 1회 소모
  unit.statuses = (unit.statuses || []).filter((s) => s.type !== "taunted");
  // In-Game Apply 01B — 수문장 도발 redirect 꺾임(visual-only·gatekeeper 전용). 타겟 결과는 불변.
  if (taunter && taunter.id === "gatekeeper" && intended && intended !== taunter) {
    playActorFx("gatekeeperRedirect", taunter.instanceId, { fromId: intended.instanceId });
  }
  return taunter || intended;
}

// 상태 적용 FX 라벨/색 변주(머리 위 짧은 기호). render.playStatusApplyFx가 사용.
const STATUS_FX_LABEL = {
  atkUp: "공↑", atkDown: "공↓", defUp: "방↑", defDown: "방↓",
  critUp: "치↑", critDown: "치↓", speedUp: "속↑", speedDown: "속↓",
};
const STATUS_FX_VARIANT = {
  atkUp: "up", atkDown: "down", defUp: "up", defDown: "down",
  critUp: "up", critDown: "down", speedUp: "up", speedDown: "down",
};

// 행동 직전 상태 처리: poison 고정 피해 → duration 1 감소 → 만료 제거.
//   poison으로 죽으면 행동하지 않는다(호출부에서 isDead 확인).
function processStatusesBeforeAction(unit) {
  if (!Array.isArray(unit.statuses) || unit.statuses.length === 0) return;

  const poison = Array.isArray(unit.statuses) && unit.statuses.find((s) => s.type === "poison");
  if (poison) {
    // First Class Expansion 01A: 덫꾼 중독은 대상 maxHp 10%(tickPct), 그 외(프리뷰 등)는 고정값.
    const pDmg = poison.tickPct ? Math.max(1, Math.round(unit.maxHp * poison.tickPct)) : POISON_TICK_DAMAGE;
    applyDamage(unit, pDmg); // shield/결속 경로 공통
    pushLog(`${unit.name}${josa(unit.name, "이가")} 중독 피해. ${pDmg} 피해.`);
    // FX 과밀 방지: 행동선/펄스 없이 작은 숫자만 (기존 숫자 상한 공유)
    playStatusTickFx({ targetInstanceId: unit.instanceId, amount: pDmg, kind: "poison" });
    killIfDead(unit);
  }

  // Second Class Batch 2 — 역병술사 감염: 소량 고정 지속 피해. 로그 과밀/보스 과피해 방지(per-tick 로그 없이 숫자 FX만, 고정 2).
  const infection = !unit.isDead && unit.statuses.find((s) => s.type === "infection");
  if (infection) {
    const iDmg = infection.tick || 2;
    applyDamage(unit, iDmg);
    playStatusTickFx({ targetInstanceId: unit.instanceId, amount: iDmg, kind: "poison" });
    killIfDead(unit);
  }

  unit.statuses.forEach((s) => { s.duration -= 1; });
  unit.statuses = unit.statuses.filter((s) => s.duration > 0);
  // Combat Grammar Foundation 01 — 도발이 만료(타임아웃)되면 강제 타겟(tauntedBy)도 함께 해제(영구 도발 방지).
  if (unit.tauntedBy && !hasStatus(unit, "taunted")) unit.tauntedBy = null;
}

// ── Monster Identity 01 — 적 전투 개성(trait) ─────────────────────────────
//   "몬스터를 더 세게 만드는 게 아니라, 자기 방식으로 싸우게 만든다." 초보자 8종에 한 줄 개성.
//   매 턴형(guard/hunter/rangedFocus/weaken)은 공격을 자기 방식으로 수행(항상 true),
//   주기형(healAlly/command/ward/bossRoar)은 2번째 행동마다 특수, 평소엔 false→기본 공격.
//   상태/수치는 단순·짧게(읽힘 우선). 영웅 스킬/계산식/합체 흐름은 무변경. 적의 "아군"은 gameState.enemies.
function introTrait(unit, text) {
  if (unit.traitIntroduced) return; // 개성 소개 로그는 첫 행동에 1회만(로그 과밀 방지)
  unit.traitIntroduced = true;
  pushLog(text);
}

function tryEnemyTrait(unit) {
  const heroes = gameState.party.filter((u) => !u.isDead);
  if (heroes.length === 0) return false;
  switch (unit.trait) {
    case "guard":       return traitGuard(unit, heroes);
    case "hunter":      return traitHunter(unit, heroes);
    case "rangedFocus": return traitRangedFocus(unit, heroes);
    case "weaken":      return traitWeaken(unit, heroes);
    case "healAlly":    return traitHealAlly(unit);
    case "command":     return traitCommand(unit);
    case "ward":        return traitWard(unit);
    case "bossRoar":    return traitBossRoar(unit, heroes);
    default:            return false;
  }
}

// 곰방패 — 전열 탱커: 가장 다친 아군(자신 포함)에 짧은 guard(받는 피해 -3) 후 평소처럼 공격.
function traitGuard(unit, heroes) {
  const ward = gameState.enemies
    .filter((e) => !e.isDead && !hasStatus(e, "guard"))
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (ward) applyStatus(ward, { type: "guard", duration: 2 });
  // Monster Identity 02 — "앞에서 지켜준다": 보호 대상 가드 펄스 + 곰 주변 보호 링.
  playActorFx("guard", unit.instanceId, { wardId: ward ? ward.instanceId : unit.instanceId });
  introTrait(unit, "곰방패가 방패를 세웠다.");
  const t = redirectIfTaunted(unit, selectAttackTarget(heroes)); // 도발당했으면 도발자 우선
  if (t) performAttack(unit, t);
  return true;
}

// 잎여우 — 근접 딜러: HP 가장 낮은 영웅의 빈틈을 파고든다(약하면 추가 피해).
function traitHunter(unit, heroes) {
  const t = redirectIfTaunted(unit, heroes.reduce((a, b) => (a.hp <= b.hp ? a : b)));
  introTrait(unit, "잎여우가 빈틈을 파고들었다.");
  // Monster Identity 02 — "약한 애 노린다": 공격 직전 짧은 전진감(lunge).
  playActorFx("lunge", unit.instanceId);
  if (t) performAttack(unit, t, { mult: t.hp / t.maxHp < 0.5 ? 1.3 : 1 });
  return true;
}

// 깃새 — 원거리 딜러: 후열 영웅 우선(없으면 최저 HP)으로 정확한 원거리 견제(일반보다 약간 약함).
function traitRangedFocus(unit, heroes) {
  const back = heroes.filter((h) => h.role === "back");
  const pool = back.length ? back : heroes;
  const t = redirectIfTaunted(unit, pool.reduce((a, b) => (a.hp <= b.hp ? a : b)));
  introTrait(unit, "깃새가 뒤쪽을 노렸다.");
  // Combat Visibility Polish 01 — 발사체 제거(행동선과 정보 중복). 원거리는 ranged 행동선 공통 문법으로만 읽힌다.
  if (t) performAttack(unit, t, { mult: 0.9, lineType: "ranged" });
  return true;
}

// 이슬말랑 — 서포터: 공격하며 대상의 다음 공격을 무디게(atkDown, 짧게). 쌓이지 않게 갱신형.
function traitWeaken(unit, heroes) {
  const t = redirectIfTaunted(unit, selectAttackTarget(heroes));
  introTrait(unit, "이슬말랑이 힘을 흐리게 했다.");
  if (t) {
    performAttack(unit, t);
    if (!t.isDead) {
      applyStatus(t, { type: "atkDown", duration: 2, pct: 0.2 });
      // Monster Identity 02 — "힘 빠뜨린다": 대상 머리 위 약화(공↓) 표식.
      playActorFx("weaken", unit.instanceId, { targetId: t.instanceId });
    }
  }
  return true;
}

// 풀양 — 힐러: 2번째 행동마다 가장 다친 아군 몬스터를 소량 회복(낮게 — 장기전 방지). 평소엔 공격.
function traitHealAlly(unit) {
  if (unit.actionCount % 2 !== 0) return false;
  const hurt = gameState.enemies.filter((e) => !e.isDead && e.hp < e.maxHp);
  if (hurt.length === 0) return false;
  const t = hurt.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
  const amt = healUnit(t, Math.max(1, Math.round(unit.atk * 0.9)));
  pushLog("풀양이 새싹빛으로 회복했다.");
  playSupportFx({ casterInstanceId: unit.instanceId, text: "회복", kind: "heal", heals: amt > 0 ? [{ targetInstanceId: t.instanceId, amount: amt }] : [] });
  // Monster Identity 02 — "아군을 돌본다": 양 주변 초록 반짝(회복 대상 펄스는 위 playSupportFx).
  playActorFx("heal", unit.instanceId);
  return true;
}

// 숲올빼미 현자 — 후열 지휘 정예: 2번째 행동마다 아군 하나에 짧은 공격력 강화(atkUp). 평소엔 공격.
function traitCommand(unit) {
  if (unit.actionCount % 2 !== 0) return false;
  const allies = gameState.enemies.filter((e) => !e.isDead && e !== unit);
  if (allies.length === 0) return false;
  const t = allies.find((a) => !hasStatus(a, "atkUp")) || allies[0];
  applyStatus(t, { type: "atkUp", duration: 3, pct: 0.25 });
  pushLog("숲올빼미 현자가 친구들에게 지시했다.");
  playSupportFx({ casterInstanceId: unit.instanceId, text: "지휘", kind: "buff", guardInstanceId: t.instanceId });
  // Monster Identity 02 — "뒤에서 지휘한다": 올빼미 주변 지휘 radial signal.
  playActorFx("command", unit.instanceId);
  return true;
}

// 사슴수호자 — 전열 관문 정예: 2번째 행동마다 자신/후열 아군에 작은 보호막(결계). 평소엔 공격.
function traitWard(unit) {
  if (unit.actionCount % 2 !== 0) return false;
  const allies = gameState.enemies.filter((e) => !e.isDead && (e === unit || e.role === "back"));
  if (allies.length === 0) return false;
  allies.forEach((a) => { a.shield = Math.max(a.shield || 0, 6); });
  pushLog("사슴수호자가 숲의 결계를 펼쳤다.");
  playSupportFx({ casterInstanceId: unit.instanceId, text: "결계", kind: "guard", guardInstanceId: unit.instanceId });
  // Monster Identity 02 — "길막는 수호자": 자신 barrier 링 + 후열 아군 보호 펄스.
  playActorFx("ward", unit.instanceId, { allyIds: allies.map((a) => a.instanceId) });
  return true;
}

// 새싹숲 사자왕 — 보스: 2번째 행동마다 왕의 포효(파티 전체 피해). 위압(Elite Key Seal) 활성 시 더 강하고
//   다음 공격 약화(atkDown)까지, 해제 시 포효만 약하게. 평소 행동은 단일 공격(false→기본 공격).
//   menace.atk 램프가 performAction에서 먼저 적용되므로 포효도 램프된 atk를 따라간다(자연 강화).
function traitBossRoar(unit, heroes) {
  if (unit.actionCount % 2 !== 0) return false;
  const menaceActive = !!unit.menace;
  const dmg = Math.max(1, Math.round(unit.atk * (menaceActive ? 0.5 : 0.35)));
  // Monster Identity 02 — "포효 온다 → 포효!": 예고 gather → radial shock(전체 공격 읽힘).
  playActorFx("roar", unit.instanceId);
  heroes.forEach((h) => {
    applyDamage(h, dmg);
    playStatusTickFx({ targetInstanceId: h.instanceId, amount: dmg, kind: "roar" });
    if (menaceActive && !h.isDead) applyStatus(h, { type: "atkDown", duration: 1, pct: 0.2 });
    killIfDead(h);
  });
  pushLog(menaceActive ? "왕의 위압이 파티 전체를 짓눌렀다." : "위압이 걷힌 사자왕의 포효가 약해졌다.");
  playSupportFx({ casterInstanceId: unit.instanceId, text: "포효!", kind: "attack", heals: [] });
  return true;
}

function performAction(unit) {
  processStatusesBeforeAction(unit);
  if (unit.isDead) {
    unit.actionGauge = 0; // poison으로 행동 전 사망 — 이번 행동은 소멸
    return;
  }

  // Hero Skill Foundation 01: 행동 횟수(주기형 스킬 조건용). 스테이지마다 유닛 재생성 → 자연 초기화.
  unit.actionCount = (unit.actionCount || 0) + 1;
  if (labMeter) labActor = unit; // Dev Balance Lab 02 — 이번 행동의 회복/보호막/표식 시전자 귀속(계측 전용)

  const isParty = gameState.party.includes(unit);

  // Batch 01A — 파수궁 반격 재충전: 파수궁이 자신의 일반 행동을 수행하는 이번 턴에 반격 가능 상태를 회복한다.
  //   (반격 자체는 performAttack 직접 호출이라 이 경로를 타지 않으므로 스스로 재충전되지 않는다.)
  if (isParty && unit.id === "watchbow") unit.counterReady = true;
  // Job Identity Tuning 02 — 검성 간파 반격 재충전: 일반 행동 1회 사이 1번만(이번 행동에 재충전). [결투] 조건 제거.
  if (isParty && unit.id === "swordsaint") unit.parryReady = true;

  // Boss Readiness Pressure 02 — 위압: 사자왕은 행동할 때마다 공격력이 오른다(상한까지). 시간 압박.
  //   기준 atk(menaceBaseAtk)에 누적 단계를 곱한다 → 장기전이면 미완성 파티가 버티지 못한다.
  if (!isParty && unit.menace && unit.menace.atkStepPct > 0) {
    const prev = unit.menaceStacks || 0;
    unit.menaceStacks = Math.min(prev + 1, unit.menace.atkMaxStacks);
    unit.atk = Math.max(1, Math.round((unit.menaceBaseAtk || unit.atk) * (1 + unit.menaceStacks * unit.menace.atkStepPct)));
    if (prev === 0) {
      pushLog(`${unit.name}${josa(unit.name, "이가")} 위압을 두른다 — 시간이 흐를수록 공격이 거세진다.`);
      // Monster Identity 02 — "보스답다": 위압 발현 시 subtle rage cue(존재감 상승, 1회).
      playActorFx("rage", unit.instanceId);
    }
  }

  // Monster Identity 01 — 적 전투 개성(trait). 처리하면(true) 기본 공격 대신 자기 방식으로 행동.
  //   주기형(회복/지휘/결계/포효)은 특수 턴이 아니면 false → 아래 기본 공격으로 흐른다.
  if (!isParty && tryEnemyTrait(unit)) {
    unit.actionGauge -= 100;
    return;
  }

  // 영웅: 스킬 조건을 만족하면 스킬 사용(아니면 기본 공격으로 fallback). 적은 스킬 없음.
  if (isParty && trySkill(unit)) {
    if (labMeter) labMeter.onSkillCast(unit); // Dev Balance Lab 01 — 스킬 발동 횟수 계측(무동작 시 null)
    unit.actionGauge -= 100;
    return;
  }

  // 기본 공격(fallback). snipe 문법(궁수/도적)은 약한 적 우선 원거리 타겟팅 유지.
  const targetPool = isParty ? gameState.enemies : gameState.party;
  let attackTarget = isParty && grammarOf(unit) === "snipe"
    ? selectArcherTarget(targetPool)
    : selectAttackTarget(targetPool);
  // Combat Grammar Foundation 01 — 도발: 적의 기본 공격 타겟을 도발자로 강제(특수행동 X). 영웅엔 미적용.
  if (!isParty) attackTarget = redirectIfTaunted(unit, attackTarget);

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
      // Stealth In-Game Apply 01 (C-1) — 급습(마무리) 직후 짧게 은신("치고 사라진다"). ambush 정체성 유지·duration 짧게(2턴)·
      //   다음 공격 시 performAttack에서 reveal(C-2)로 해제 → 무한/상시 은신 아님. 발동은 마무리 성공 시에만(조건부·저빈도).
      applyHidden(unit, 2, "ambush");
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
      // Combat Grammar Foundation 01 — 도발(주기): 2번째 행동마다 전열 적 1명을 도발한다.
      //   그 적의 "다음 기본 공격"이 수호자를 향한다(탱커가 어그로를 끈다). 보스 포효 등 특수행동은 안 끊김.
      if (unit.actionCount % 2 === 0) {
        // Combat Visibility Job Grammar 01 — 기본 직업 도발 = 최대 2명(티어). 효과 구조(강제 타겟) 불변.
        const foes = [...frontEnemies(), ...aliveEnemies().filter((e) => e.role !== "front")].slice(0, heroTauntCount(unit.id));
        if (foes.length) { applyTauntMany(unit, foes); return true; }
      }
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
      // Batch 01B — 신관 정체성 정렬: 사제(치유)와 분리된 "보호/축복" 서포터.
      //   직접 회복 없이, 보호막이 없거나 낮은 생존 아군 최대 2명에게 소량 보호막(미래 피해 완화).
      //   모두 이미 충분히 보호되어 있으면 행동 낭비 대신 기본 공격(return false).
      const cand = aliveParty()
        .filter((a) => (a.shield || 0) < SHIELD_BLESS)
        .sort((a, b) => (a.shield || 0) - (b.shield || 0) || a.hp / a.maxHp - b.hp / b.maxHp)
        .slice(0, 2);
      if (cand.length === 0) return false;
      performBless(unit, cand, meta);
      return true;
    }
    case "saint": {
      // 01A: 쌍치유 — 저체력 아군이 있으면 HP 비율 최저 2인을 회복(사제와 동일 회복량).
      if (!lowestRatioAlly(0.8)) return false;
      performDualHeal(unit, meta);
      return true;
    }
    default:
      // First Class Expansion 01: 확장 16종은 데이터 logic(skills.js) → executor가 처리.
      return meta.logic ? runDataSkill(unit, meta) : false;
  }
}

// ── First Class Expansion 01 — 확장 직업 공통 헬퍼/상태 ──────────────────
function aliveEnemies() {
  return gameState.enemies.filter((u) => !u.isDead);
}
function frontEnemies() {
  const a = aliveEnemies();
  const f = a.filter((u) => u.role === "front");
  return f.length ? f : a;
}
function highGaugeEnemy() {
  const a = aliveEnemies();
  if (!a.length) return null;
  return a.reduce((x, y) => ((x.actionGauge || 0) >= (y.actionGauge || 0) ? x : y));
}
function highHpEnemy() {
  const a = aliveEnemies();
  if (!a.length) return null;
  return a.reduce((x, y) => (x.hp / x.maxHp >= y.hp / y.maxHp ? x : y));
}
function frontEnemyNoPoison() {
  return frontEnemies().find((e) => !hasStatus(e, "poison")) || null;
}
function lowestRatioAllyAny() {
  const a = aliveParty();
  if (!a.length) return null;
  return a.reduce((x, y) => (x.hp / x.maxHp <= y.hp / y.maxHp ? x : y));
}
function applyStatus(unit, status) {
  if (!Array.isArray(unit.statuses)) unit.statuses = [];
  const ex = unit.statuses.find((s) => s.type === status.type);
  if (ex) {
    ex.duration = Math.max(ex.duration, status.duration);
    if (status.pct != null) ex.pct = status.pct;
  } else {
    unit.statuses.push({ ...status });
  }
  if (labMeter && status.type === "mark") labMeter.onMark(labActor, unit); // Dev Balance Lab 02 — 표식 부여 계측
}
function healUnit(unit, amount) {
  const before = unit.hp;
  // Run Reward Diversification 02 — 실제 회복(amount>0)일 때 대상의 "받는 치유량" 보너스를 가산(공통 싱크).
  //   회복 0/연출용 호출엔 가산하지 않음. 최대 HP 초과는 기존대로 제한. 쉼터/HP 보정은 healUnit을 안 거쳐 무영향.
  const recv = amount > 0 ? (unit.healReceivedBonus || 0) : 0;
  unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, amount) + recv);
  const healed = unit.hp - before;
  // Dev Balance Lab 02 — 회복 계측: 시전자(labActor)·대상·시도량(req)·유효량(eff). 초과회복=req-eff(낭비). 무동작 시 null.
  const requested = Math.max(0, amount) + recv;
  if (labMeter && requested > 0) labMeter.onHeal(labActor, unit, requested, healed);
  return healed;
}
function removeNegStatus(unit) {
  // Batch 01A — 정화 대상 디버프(정화사 전용 사용처). speedDown 추가(공식 디버프 목록 정렬).
  const neg = ["poison", "atkDown", "speedDown", "slow"];
  const before = (unit.statuses || []).length;
  unit.statuses = (unit.statuses || []).filter((s) => !neg.includes(s.type));
  return before !== unit.statuses.length;
}
function skillShout(caster, text, kind) {
  playSupportFx({ casterInstanceId: caster.instanceId, text, kind, heals: [] });
}

// First Class Expansion 01 — 데이터 logic 기반 스킬 executor(확장 16종).
//   cond 미충족이면 false 반환 → performAction이 기본 공격으로 fallback.
//   반응형(보복 counter / 결속 redirect / 성역 면역)은 안전 최소 구현(근사·마커·1회 무효). WATCH.
function runDataSkill(unit, meta) {
  const L = meta.logic;
  switch (L.type) {
    case "gaugeStrike": { // 워든 습격
      const t = highGaugeEnemy();
      if (!t) return false;
      performAttack(unit, t, { mult: L.mult, skill: meta });
      // Combat Visibility — 워든 게이지 드레인도 "여기였다" 마커(깎이기 직전 위치 기록).
      t.gaugeDropFrom = Math.min(100, t.actionGauge || 0);
      t.actionGauge = Math.max(0, (t.actionGauge || 0) * (1 - L.drainPct));
      applyStatus(t, { type: "atkDown", duration: L.atkDownTurns, pct: L.atkDownPct });
      return true;
    }
    case "counterStance": { // 파수궁 보복(근사: 게이지 높은 적 즉시 견제)
      const t = highGaugeEnemy();
      if (!t) return false;
      performAttack(unit, t, { mult: L.mult, lineType: "ranged", skill: meta });
      return true;
    }
    case "poison": { // 덫꾼 중독 — Batch 01C: 임의의 적 최대 2명에 독 살포(독 표식 서포터).
      const pool = aliveEnemies();
      if (pool.length === 0) return false;
      // 비중독 적 우선으로 퍼뜨리고(독 판을 넓힘), 부족하면 이미 중독된 적으로 채움. 중복 대상 없음.
      const count = L.count || 2;
      const targets = shuffle(pool.filter((e) => !hasStatus(e, "poison")))
        .concat(shuffle(pool.filter((e) => hasStatus(e, "poison"))))
        .slice(0, count);
      if (targets.length === 0) return false;
      targets.forEach((t, i) => {
        applyStatus(t, { type: "poison", duration: L.duration }); // 기존 poison 구조/틱 재사용(수치 불변)
        playActionFx({
          sourceInstanceId: unit.instanceId, sourceUnitId: unit.id, targetInstanceId: t.instanceId,
          lineType: "disrupt", kind: "disrupt", isHeal: false, amount: 0,
          shoutText: i === 0 ? meta.name + "!" : null, shoutKind: meta.kind, shoutTier: "skill",
        });
        playActorFx("trapperVenom", unit.instanceId, { targetId: t.instanceId }); // In-Game Apply 01B — venom 적용 순간 큰 독방울 3개(visual-only·공통 poison tick 무변경)
      });
      pushLog(`${unit.name}${josa(unit.name, "이가")} ${targets.map((t) => t.name).join(", ")}${josa(targets[targets.length - 1].name, "을를")} 중독시켰다.`);
      return true;
    }
    case "strikeSelfHeal": { // 성기사 — Job Identity Tuning 02: 자가 회복형(보호막 지급 제거). "내 공격으로 내가 치료된다."
      const t = selectAttackTarget(aliveEnemies());
      if (!t) return false;
      // 특수 공격 색감(pierce family — 주황)으로 "공격 스킬"임이 읽히게. + "성휘!" 외침.
      performAttack(unit, t, { mult: L.mult, skill: meta, lineType: "pierce" });
      const selfHealed = healUnit(unit, L.selfHeal);
      // 공격 성공 후 성기사 본인 머리 위 노란 성휘 자가회복 FX(일반 민트 치유와 구분).
      if (selfHealed > 0) playActorFx("selfHeal", unit.instanceId, { amount: selfHealed });
      return true;
    }
    case "aoeStrike": { // 선봉 진군 — Batch 01B: 전열 적 전체 낮은 피해 + 전열 아군 방어 증가(회복 제거).
      const targets = L.scope === "front" ? frontEnemies() : aliveEnemies();
      if (targets.length === 0) return false;
      // 전열 적 전체에 낮은 피해(mult는 데이터 유지 — 수치 조정 아님).
      //   Hotfix 03 — 폰 가시성: 전열 타격선을 주황 pierce(전진 직선·preview FCL_LINE vanguard와 일치)로 명시. ★lineType은 시각만(피해/타깃/수치 불변).
      targets.forEach((t, i) =>
        performAttack(unit, t, { mult: L.mult, skill: i === 0 ? meta : undefined, noShout: i !== 0, lineType: "pierce" })
      );
      // Batch 01B Hotfix — 방어 증가 대상은 "선봉의 위치와 무관하게" 항상 아군 전열(슬롯 f0/f1) 생존자.
      //   선봉이 후열에 있어도 전열 아군에게 적용 / 전열 아군이 없으면 생략(후열 fallback 없음).
      //   기존 defUp 문법 재사용(신규 시스템 없음). frontlineAllies()가 f0/f1 생존자만 반환(최대 2명).
      const frontAllies = frontlineAllies();
      frontAllies.forEach((a) => applyCombatStatus(a, "defUp"));
      if (frontAllies.length) {
        playSupportFx({ casterInstanceId: unit.instanceId, text: null, kind: "support", guardInstanceId: frontAllies[0].instanceId });
      }
      return true;
    }
    case "bondOffense": { // 금제 악의 결속 — 타격 + 결속(금제 피격 시 60/40 분배: applyDamage)
      const t = selectAttackTarget(aliveEnemies());
      if (!t) return false;
      performAttack(unit, t, { mult: L.mult, skill: meta });
      // 대상 생존 시 결속 링크 갱신(다음 행동까지). 사망이면 해제.
      //   Combat Visibility — 결속 대상엔 [표식] 칩을 붙이지 않는다(추적자/천궁 mark와 중복 방지). 대상은 지속 결속선으로 인지.
      unit.bondOffenseTarget = t.isDead ? null : t.instanceId;
      // Runtime Parity Hotfix 02 — 악의 결속 적용 순간 대상에 붉은 봉인 링(visual-only·"대상을 봉한다" 가시화). 결속/전가 로직 무변경.
      if (!t.isDead) playActorFx("forbiddenSeal", unit.instanceId, { toId: t.instanceId });
      return true;
    }
    case "bondDefense": { // 성벽 선의 결속 — 최저 아군에 결속(그 아군 피격 시 50/50 분담: applyDamage)
      const others = aliveParty().filter((a) => a !== unit && a.hp < a.maxHp);
      const ally = others.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (!ally) return false;
      ally.protectedBy = unit.instanceId; // 그 아군이 받는 피해의 50%를 성벽이 대신
      // Combat Visibility — 성벽(사용자)에 [결속] 칩 + 지속 결속선 출처. 대상엔 mark 칩 미부여(지속선으로만 인지).
      unit.bondDefenseTarget = ally.instanceId;
      grantShieldTo(unit, ally, L.shield);
      playSupportFx({ casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind, guardInstanceId: ally.instanceId });
      return true;
    }
    case "snipeHeal": { // 치유궁 치유사격
      const t = selectArcherTarget(aliveEnemies());
      if (!t) return false;
      performAttack(unit, t, { mult: L.mult, lineType: "ranged", skill: meta });
      const ally = lowestRatioAllyHurt(0.95);
      if (ally) {
        const amt = healUnit(ally, Math.round(unit.atk * L.healFactor)); // 회복은 즉시(gameplay 불변)
        // Hotfix 03 — "적 공격선 → 아군 치유선" 2단 순서감(폰 가시성): 치유 FX만 살짝 지연(회복 수치/타깃 불변).
        if (amt > 0) { const aid = ally.instanceId; setTimeout(() => playSupportFx({ casterInstanceId: unit.instanceId, text: null, kind: "heal", heals: [{ targetInstanceId: aid, amount: amt }] }), 240); }
      }
      return true;
    }
    case "cleanse": { // 정화사 정화 — Batch 01A 공식 정렬: 위급 치유 우선 → 디버프 정화 → 정화 성공 시 보호막.
      //   "정화+회복+보호막 동시 적용"을 피한다(정화/보호 담당으로 읽히게). 우선순위로 분기.
      // (1) HP 30% 미만 위급 아군이 있으면 치유만(정화/보호막 없음).
      const emergency = lowestRatioAlly(0.30);
      if (emergency) {
        const amt = healUnit(emergency, Math.round(unit.atk * L.healFactor));
        // Hero Readability Polish 01A — 어떤 분기로 행동했는지 읽히게(로그만, 우선순위/수치 불변).
        pushLog(`${unit.name}${josa(unit.name, "이가")} 위급한 아군을 먼저 치유했다.`);
        playSupportFx({
          casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind,
          heals: amt > 0 ? [{ targetInstanceId: emergency.instanceId, amount: amt }] : [],
        });
        return true;
      }
      // (2) 위급 대상이 없을 때만 디버프/지속 피해 아군을 찾아 정화. (3) 정화 성공 시에만 소량 보호막.
      const NEG = ["poison", "atkDown", "speedDown", "slow"];
      const debuffed = aliveParty().find((a) => (a.statuses || []).some((s) => NEG.includes(s.type)));
      if (debuffed) {
        // Hero Readability Polish 01A — 제거 전 디버프 종류를 잡아 로그에 이름을 넣는다(표시용).
        const had = (debuffed.statuses || []).map((s) => s.type).filter((t) => NEG.includes(t));
        const removed = removeNegStatus(debuffed);
        if (removed) grantShieldTo(unit, debuffed, L.shield);
        const nm = had.includes("poison") ? "중독"
          : had.includes("atkDown") ? "약화"
          : (had.includes("speedDown") || had.includes("slow")) ? "둔화" : "해로운 효과";
        if (removed) pushLog(`${unit.name}${josa(unit.name, "이가")} ${debuffed.name}의 ${nm}${josa(nm, "을를")} 정화했다 — 보호막.`);
        playSupportFx({
          casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind,
          guardInstanceId: removed ? debuffed.instanceId : null,
        });
        return true;
      }
      // (4) 위급 대상도 디버프도 없으면 약한 회복 fallback(다친 아군 있을 때만). 없으면 기본 공격.
      const hurt = lowestRatioAllyHurt(0.95);
      if (!hurt) return false;
      const amt = healUnit(hurt, Math.round(unit.atk * L.healFactor));
      pushLog(`${unit.name}${josa(unit.name, "이가")} 상처를 조금 돌봤다.`);
      playSupportFx({
        casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind,
        heals: amt > 0 ? [{ targetInstanceId: hurt.instanceId, amount: amt }] : [],
      });
      return true;
    }
    case "charge": { // 마도/현자 — 집중 → 광역 폭발 (2행동, 무한 방지)
      if (!unit.charging) {
        unit.charging = true;
        skillShout(unit, L.chargeName + "!", meta.kind);
        pushLog(`${unit.name}${josa(unit.name, "이가")} ${L.chargeName}…`);
        if (L.allyHaste) {
          const pool = aliveParty().filter((a) => a !== unit);
          // Combat Feedback Polish 02 — 아군 게이지 가속도 무희 피날레와 같은 "상승 마커"(공통 문법). 가속량/누적식은 불변(마커용 기록만).
          shuffle(pool).slice(0, L.allyHaste.count).forEach((a) => {
            a.gaugeRiseFrom = Math.min(100, a.actionGauge || 0);
            a.actionGauge += 100 * L.allyHaste.pct;
          });
        }
        // Combat Visibility Job Grammar 01 — 집중 전조: 시전자→적 진영 중앙으로 선 + 중앙에 "마력이 모이는 점".
        playActorFx("chargeGather", unit.instanceId, { enemyIds: aliveEnemies().map((e) => e.instanceId) });
        return true;
      }
      unit.charging = false;
      const targets = aliveEnemies();
      // Combat Grammar Follow-up 01 — 발동: 충전 때 고정한 "그 좌표"에서 보라 충격파가 적 전체로 퍼진다("그 자리에서 터진다").
      //   시전자→각 적 원거리 행동선은 제거(noLine) — 각 적엔 도착 hit(펄스/숫자)만. 시전자 "마력 폭발!" 외침은 유지(i===0).
      playActorFx("aoeSpread", unit.instanceId, { enemyIds: targets.map((t) => t.instanceId) });
      targets.forEach((t, i) =>
        performAttack(unit, t, { mult: L.mult, skill: i === 0 ? { name: L.releaseName, kind: meta.kind } : undefined, noShout: i !== 0, noLine: true })
      );
      pushLog(`${unit.name}${josa(unit.name, "이가")} ${L.releaseName}!`);
      return true;
    }
    case "bardRandom": { // 바드 — Bard Identity Polish 01: 리듬(아군 지원) / 템포(적 방해) 이중 연주, 각 최대 2명.
      const otherAllies = aliveParty().filter((a) => a !== unit);
      const enemies = aliveEnemies();
      // 연주 선택: 양쪽 유효하면 50/50(리듬/템포), 한쪽만 유효하면 그쪽, 둘 다 없으면 기본 공격.
      let play;
      if (otherAllies.length && enemies.length) play = Math.random() < 0.5 ? "rhythm" : "tempo";
      else if (otherAllies.length) play = "rhythm";
      else if (enemies.length) play = "tempo";
      else return false;

      if (play === "rhythm") {
        // 리듬 — 생존 아군 최대 2명에 이로운 효과(atkUp/critUp, 대상별 랜덤). 기존 효과/수치/지속 그대로(대상 수만 1→2).
        const targets = shuffle(otherAllies).slice(0, 2);
        targets.forEach((t) => applyCombatStatus(t, Math.random() < 0.5 ? "atkUp" : "critUp"));
        pushLog(`${unit.name}${josa(unit.name, "이가")} 리듬을 연주했다 — 아군 ${targets.length}명에게 가락을 실었다.`);
        // Combat Visibility Job Grammar 01 — 아군 전원에게 지원선(buff) + 상승 end. "누가 누구에게"가 보이게(대상 수만큼).
        playSupportFx({ casterInstanceId: unit.instanceId, text: "리듬!", kind: meta.kind, buffs: targets.map((t) => t.instanceId) });
      } else {
        // 템포 — 생존 적 최대 2명에 해로운 효과(speedDown 또는 게이지 -25, 대상별 랜덤). 기존 효과/수치 그대로(대상 수만 1→2).
        const targets = shuffle(enemies).slice(0, 2);
        targets.forEach((t, i) => {
          if (Math.random() < 0.5) applyCombatStatus(t, "speedDown");
          else { t.gaugeDropFrom = Math.min(100, t.actionGauge || 0); t.actionGauge = Math.max(0, (t.actionGauge || 0) - BARD_GAUGE_DROP); }
          playActionFx({
            sourceInstanceId: unit.instanceId, sourceUnitId: unit.id, targetInstanceId: t.instanceId,
            lineType: "disrupt", kind: "disrupt", isHeal: false, amount: 0,
            shoutText: i === 0 ? "템포!" : null, shoutKind: meta.kind, shoutTier: "skill",
          });
        });
        pushLog(`${unit.name}${josa(unit.name, "이가")} 템포를 흔들었다 — 적 ${targets.length}명의 박자를 무너뜨렸다.`);
      }
      return true;
    }
    case "taunt": { // 수문장 도발
      if (hasStatus(unit, "taunt")) return false; // 이미 도발 중이면 기본 공격
      applyStatus(unit, { type: "taunt", duration: L.turns });
      // Combat Visibility Job Grammar 01 — 1차 직업 도발 = 최대 3명에 도발선(+taunted). 어그로 구조(taunt status)는 유지.
      applyTauntMany(unit, [...frontEnemies(), ...aliveEnemies().filter((e) => e.role !== "front")].slice(0, heroTauntCount(unit.id)));
      if (L.alsoStrike) {
        const t = selectAttackTarget(aliveEnemies());
        if (t) performAttack(unit, t, { noShout: true });
      }
      playSupportFx({ casterInstanceId: unit.instanceId, text: null, kind: meta.kind, guardInstanceId: unit.instanceId });
      return true;
    }
    case "aim": { // 추적자 조준 → 추격 (2행동)
      if (!unit.aimTarget) {
        // Stealth In-Game Apply 01 (C-3) — 조준으로 '은신한 적'을 짚어낸다(최소·조건부·저빈도).
        //   ★대상은 gameState.enemies뿐 → 아군 rogue 은신은 절대 건드리지 않음(rogue 은신 맛 보존). aimshot 정체성/로그 유지(짚어내기는 조준 앞의 짧은 rider).
        //   ★현행엔 적 은신 소스가 없어 사실상 dormant(적이 hidden일 때만 발동 · devStealth로 검증). "찾아낼 수 있음"이지 은신 삭제 시스템 아님(대상 1명·표식+shimmer만).
        const hiddenFoe = aliveEnemies().find((e) => isHidden(e));
        if (hiddenFoe) {
          playActorFx("mark", unit.instanceId, { targetId: hiddenFoe.instanceId }); // 탐지 표식(Phase B 언어: 점선 조준선 + 스코프)
          clearHidden(hiddenFoe, "tracker"); // reveal(내부 revealShimmer) → 이후 타깃 필터에 다시 잡힘(visible 우선 규칙과 충돌 없음)
          pushLog(`${unit.name}${josa(unit.name, "이가")} 은신한 ${hiddenFoe.name}${josa(hiddenFoe.name, "을를")} 짚어냈다.`);
        }
        const t = highHpEnemy();
        if (!t) return false;
        unit.aimTarget = t.instanceId;
        unit.aimFullHp = t.hp >= t.maxHp;
        applyStatus(t, { type: "mark", duration: 2 });
        skillShout(unit, meta.name + "!", meta.kind);
        // Combat Visibility Job Grammar 01 — 표식 부여 행동선(점선 mark/aim) + 대상 몸통 스코프 표식(item 6).
        playActorFx("mark", unit.instanceId, { targetId: t.instanceId });
        pushLog(`${unit.name}${josa(unit.name, "이가")} ${t.name}${josa(t.name, "을를")} 조준했다.`);
        // Stealth Polish 02 (작업 B) — Tracker aim stealth: 조준 진입 시 숨을 죽인다(집중/잠복). source "aim" · duration 2(다음 추격 공격까지 유지) ·
        //   다음 aimshot(추격=performAttack)에서 shouldRevealOnAction→clearHidden으로 reveal(shimmer). Rogue "급습 후 은신"(source "ambush")과 리듬/소스 구분 · 무한/상시 아님(추격마다 해제).
        applyHidden(unit, 2, "aim");
        return true;
      }
      const t = aliveEnemies().find((e) => e.instanceId === unit.aimTarget);
      unit.aimTarget = null;
      if (!t) return false; // 이미 처치됨 → 기본 공격
      const mult = L.mult + (unit.aimFullHp ? L.fullHpBonus : 0);
      // Hero Readability Polish 01B — 표식 대상 추격임을 로그에 짧게 드러낸다(chase 플래그, 표시 전용). 피해/수치 불변.
      // Combat Target-Link Polish 01 — 추적 성공은 곡선 원거리가 아니라 직선 저격선(snipe). 표식/피해/타겟 판정 불변.
      performAttack(unit, t, { mult, lineType: "snipe", skill: { name: L.releaseName, kind: meta.kind }, chase: true });
      // Combat Visibility Job Grammar 01 — 추격 성공 즉시 표식 칩 제거(item 7) + 스코프 위치 강한 hit burst(item 8).
      t.statuses = (t.statuses || []).filter((s) => s.type !== "mark");
      playActorFx("markBurst", unit.instanceId, { targetId: t.instanceId });
      return true;
    }
    case "pierce": { // 용창 관통 (전열 + 후열, 처치 시 1회 추가 — 무한 방지)
      // Combat Visibility Job Grammar 01 — "체인 관통": 동시 2선이 아니라 용창→전열→후열로 순차 이어지는 한 줄기 공격선.
      //   붉은/주황 공격 스킬선(lineType "pierce"). 피해/타겟 판정은 기존 유지(시각 표현만 체인).
      const target = frontEnemies()[0] || aliveEnemies()[0];
      if (!target) return false;
      performAttack(unit, target, { mult: L.mult, skill: meta, lineType: "pierce" });
      const back = aliveEnemies().filter((e) => e.role !== "front" && e !== target);
      if (back.length) {
        // 두 번째 선은 전열 대상의 몸에서 후열로 이어진다(fxSourceId) + 살짝 늦게(delayExtra) → 체인 감각.
        performAttack(unit, back[0], { mult: L.mult * 0.7, lineType: "pierce", noShout: true, fxSourceId: target.instanceId, fxDelayExtra: 170, chained: true });
        if (back[0].isDead) {
          const more = aliveEnemies().filter((e) => e.role !== "front");
          if (more.length) performAttack(unit, more[0], { mult: L.mult * 0.7, lineType: "pierce", noShout: true, fxSourceId: back[0].instanceId, fxDelayExtra: 340, chained: true });
        }
      }
      return true;
    }
    case "sanctuary": { // 성황 — 도발 보유 + (저체력 아군 시) 1회 파티 피해 무효
      if (!hasStatus(unit, "taunt")) {
        applyStatus(unit, { type: "taunt", duration: 1 });
        // Combat Visibility Job Grammar 01 — 2차 직업 도발 = 최대 4명 도발선. 과밀 방지로 2번째 행동마다만 선을 그린다.
        if (unit.actionCount % 2 === 0) applyTauntMany(unit, [...frontEnemies(), ...aliveEnemies().filter((e) => e.role !== "front")].slice(0, heroTauntCount(unit.id)));
      }
      const allies = aliveParty();
      // Job Identity Tuning 01 — 수호의 오오라: 아군 전체 "받는 피해 고정값 감소"(aegis). 만료되면 다시 켠다(주기적 유지).
      //   아바타보다 큰 오오라 FX + 아군 [방어] 버프칩으로 지속 인지. 성황의 수호/방어 정체성 강화.
      if (!allies.some((a) => hasStatus(a, "aegis"))) {
        allies.forEach((a) => applyStatus(a, { type: "aegis", duration: L.auraTurns ?? 4, flat: L.auraFlat ?? 2 }));
        playActorFx("aura", unit.instanceId, { allyIds: allies.map((a) => a.instanceId) });
        skillShout(unit, "수호의 오오라!", meta.kind);
        pushLog(`${unit.name}${josa(unit.name, "이가")} 수호의 오오라를 펼쳤다 — 아군 받는 피해 -${L.auraFlat ?? 2}.`);
        return true;
      }
      const lowExists = allies.some((a) => a.hp / a.maxHp < L.allyHpThreshold);
      if (lowExists && !unit.sanctUsed) {
        unit.sanctUsed = true;
        allies.forEach((a) => { a.damageImmune = true; });
        // Combat Grammar Follow-up 01 — 성황 중심 노랑 성역 파동이 아군 전체로 퍼진다 + 시전자 "성역!" 외침.
        //   아군은 damageImmune→[성역] 버프칩으로 상태 인지(기존 mint 회복 펄스 대신 금빛 보호 문법으로 분리).
        playActorFx("sanctuarySpread", unit.instanceId, { allyIds: allies.map((a) => a.instanceId) });
        skillShout(unit, meta.name + "!", meta.kind);
        pushLog(`${unit.name}${josa(unit.name, "이가")} 성역을 펼쳤다. 파티 피해 1회 무효.`);
        return true;
      }
      return false; // 성역 미발동 — 도발만 갱신하고 기본 공격
    }
    case "crushStrike": { // 검성(SR-25) — Job Identity Tuning 02: 결투 제거. 간파(피격 반격, triggerSwordsaintParry)는 반응형.
      //   능동 행동은 단순 공격 — 매 공격이 분쇄 스택을 쌓는다(performAttack에서 누적). 간파 준비(parryReady)는 performAction에서 재충전.
      const t = selectAttackTarget(aliveEnemies());
      if (!t) return false;
      performAttack(unit, t, { mult: L.mult ?? 1.1, skill: meta, lineType: "crush" });
      return true;
    }
    case "skymark": { // 천궁(SR-27) — 천표식(받는 피해↑) + 표식 대상 강화 하늘사격. 사망 시 재지정.
      let mt = aliveEnemies().find((e) => e.instanceId === unit.skyTarget);
      const fresh = !mt;
      if (fresh) {
        mt = selectSkyTarget(); // 보스>후열>저HP>고ATK
        if (!mt) return false;
        unit.skyTarget = mt.instanceId;
        applyCombatStatus(mt, "defDown", L.dmgUpPct ?? 0.12); // 받는 피해 소폭↑(방↓ 칩 + FX 1회)
        // Combat Visibility Job Grammar 01 — 천표식 부여 행동선(추적자와 공통 mark 문법, item 6).
        playActorFx("mark", unit.instanceId, { targetId: mt.instanceId });
        pushLog(`${unit.name}${josa(unit.name, "이가")} ${mt.name}에게 하늘 표식을 새겼다.`);
      } else {
        applyStatus(mt, { type: "defDown", duration: 3, pct: L.dmgUpPct ?? 0.12 }); // 갱신(FX 없이)
      }
      applyStatus(mt, { type: "mark", duration: 3 }); // 표식 칩 유지(기존 mark 문법 재사용)
      // Combat Target-Link Polish 01 — 천궁의 표식 대상 사격도 직선 저격선(snipe)으로 "꿰뚫는다". 표식/피해/타겟 판정 불변.
      performAttack(unit, mt, { mult: L.mult ?? 1.3, lineType: "snipe", skill: { name: fresh ? "하늘 표식" : "하늘사격", kind: meta.kind } });
      return true;
    }
    case "wardbond": { // 결계장(SR-30) — Job Identity Tuning 02: 파티 결속/피해 분산(성황 aegis와 차별). 결계장 생존 중 결속 유지.
      const party = aliveParty();
      // 생존 아군 전체에 결속(wardlink) 부여/갱신 — 지속 오오라 + [결계] 칩. 결계장 사망 시 분산은 자동 비활성(applyDamage가 검사).
      party.forEach((a) => applyStatus(a, { type: "wardlink", duration: 999 }));
      if (!unit.wardOpened) {
        unit.wardOpened = true;
        pushLog(`${unit.name}${josa(unit.name, "이가")} 파티 결계를 펼쳤다 — 피해를 함께 나눈다.`);
        skillShout(unit, meta.name + "!", meta.kind);
        playActorFx("wardAura", unit.instanceId, { allyIds: party.map((a) => a.instanceId) });
        return true;
      }
      // 결속 유지 후엔 행동 낭비 없이 기본 공격(결속은 위에서 매 턴 갱신됨).
      const t = selectAttackTarget(aliveEnemies());
      if (t) { performAttack(unit, t, { noShout: true }); return true; }
      return false;
    }
    case "rescue": { // 구원자(SR-26) — 구원선 부여(전투당 1회) + 보조(정화 우선→소량 회복). 발동은 dealRaw triggerSalvation.
      const hasSalv = aliveParty().some((a) => hasStatus(a, "salvation"));
      if (!hasSalv && !unit.salvationGiven) {
        const t = selectSalvationTarget(); // HP비율 최저 > maxHp 낮음 > 후열
        if (t) {
          applyStatus(t, { type: "salvation", duration: 999 }); // 전투 내내 유지(소모 전까지). 999=사실상 영구
          unit.salvationGiven = true; // 전투당 1회 — 소모 후 재부여하지 않음
          pushLog(`${unit.name}${josa(unit.name, "이가")} ${t.name}에게 구원선을 잇는다.`);
          playSupportFx({ casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind, guardInstanceId: t.instanceId });
          playStatusApplyFx(t.instanceId, "구원", "up");
          return true;
        }
      }
      // 보조: 디버프 있으면 정화 1개 우선 → 아니면 소량 회복(유지력 과다 방지). 둘 다 불가면 기본 공격.
      const NEG = ["poison", "infection", "atkDown", "speedDown", "slow", "defDown"];
      const debuffed = aliveParty().find((a) => (a.statuses || []).some((s) => NEG.includes(s.type)));
      if (debuffed) {
        removeOneNegStatus(debuffed);
        pushLog(`${unit.name}${josa(unit.name, "이가")} ${debuffed.name}의 해로운 효과를 씻어냈다.`);
        playSupportFx({ casterInstanceId: unit.instanceId, text: "정화!", kind: meta.kind, guardInstanceId: debuffed.instanceId });
        return true;
      }
      const hurt = lowestRatioAllyHurt(0.95);
      if (!hurt) return false;
      const amt = healUnit(hurt, L.rescueHeal ?? 5);
      if (amt > 0) playSupportFx({ casterInstanceId: unit.instanceId, text: null, kind: "heal", heals: [{ targetInstanceId: hurt.instanceId, amount: amt }] });
      return true;
    }
    case "infect": { // 역병술사(SR-28) — 감염 부여 + 제한 확산(행동 2회마다·최대 3) + 감염 대상 우선 공격.
      const enemies = aliveEnemies();
      if (!enemies.length) return false;
      const infected = enemies.filter((e) => hasStatus(e, "infection"));
      if (infected.length === 0) { // 감염 0 → 새 감염 부여
        const t = selectInfectTarget(enemies);
        if (!t) return false;
        applyInfection(t, L);
        pushLog(`${unit.name}${josa(unit.name, "이가")} 감염을 뿌린다.`);
        skillShout(unit, meta.name + "!", meta.kind);
        return true;
      }
      // 제한 확산: 행동 2~3회마다 1회, 미감염 대상, 최대 maxInfected까지(무한 확산/매틱 확산 금지)
      if (unit.actionCount % (L.spreadEvery ?? 2) === 0 && infected.length < (L.maxInfected ?? 3)) {
        const uninfected = enemies.filter((e) => !hasStatus(e, "infection"));
        const t = selectInfectTarget(uninfected);
        if (t) {
          applyInfection(t, L);
          pushLog("감염이 번졌다.");
          return true;
        }
      }
      // 평소: 가장 약한 감염 대상 우선 공격(추가 피해는 표식 정체성으로 충분 — 단순 유지).
      const target = infected.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      performAttack(unit, target, { mult: L.mult ?? 1.0, lineType: "ranged", skill: meta });
      return true;
    }
    case "dance": { // 무희(SR-29) — Job Identity Tuning 01: 공격형 로망. 1박 공격력↑ / 2박 치명↑(2명) / 피날레 속도게이지↑(무희 제외).
      //   방어 성향(회복/보호막)은 성황으로 분리. 대상 선정 랜덤성 유지.
      const others = aliveParty().filter((a) => a !== unit);
      unit.beat = ((unit.beat || 0) % 3) + 1; // 1→2→3→1
      if (unit.beat === 1) { // 1박 고양 — 랜덤 1명 공격력↑
        const t = shuffle(others.length ? others : [unit])[0];
        applyCombatStatus(t, "atkUp", L.exaltPct ?? 0.10);
        pushLog(`${unit.name} 1박, 고양! ${t.name} 공격력↑`);
        playSupportFx({ casterInstanceId: unit.instanceId, text: "1박!", kind: meta.kind, buffs: [t.instanceId] });
      } else if (unit.beat === 2) { // 2박 가락 — 랜덤 2명 치명 확률↑
        const list = (shuffle(others).slice(0, 2));
        const targets = list.length ? list : [unit];
        targets.forEach((t) => applyCombatStatus(t, "critUp", L.critPct ?? STATUS_PCT));
        pushLog(`${unit.name} 2박, 가락! 아군 ${targets.length}명 치명↑`);
        playSupportFx({ casterInstanceId: unit.instanceId, text: "2박!", kind: meta.kind, buffs: targets.map((t) => t.instanceId) });
      } else { // 피날레 — 무희 제외 아군 전체 속도 게이지↑("단숨에 나아간다") + 분홍 뾰로롱
        const gain = L.finaleGauge ?? 30;
        others.forEach((a) => {
          a.gaugeRiseFrom = Math.min(100, a.actionGauge || 0); // render: 상승 구간 표시(읽힘)
          a.actionGauge = Math.min(100, (a.actionGauge || 0) + gain);
        });
        pushLog(`${unit.name} 피날레! 아군이 리듬을 받고 단숨에 나아간다.`);
        playActorFx("finale", unit.instanceId, { allyIds: others.map((a) => a.instanceId) });
      }
      return true;
    }
    default:
      return false;
  }
}

// 보조: 일정 비율 미만으로 "피해 입은" 최저 아군(없으면 null) — 확장 스킬 공용.
function lowestRatioAllyHurt(maxRatio) {
  return lowestRatioAlly(maxRatio);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 스킬 보조 셀렉터 ---------------------------------------------------------
function aliveParty() {
  return gameState.party.filter((u) => !u.isDead);
}
// Batch 01B Hotfix — 아군 전열(슬롯 f0/f1) 생존자만 반환(최대 2명). 시전자 위치와 무관.
//   선봉 진군의 방어 증가 대상 등 "전열 대상" 스킬 공용. 전열 슬롯은 SLOT_ORDER의 f* 키로 판정.
function frontlineAllies() {
  const frontSlots = SLOT_ORDER.filter((k) => k.startsWith("f"));
  return aliveParty().filter((u) => frontSlots.includes(u.slotKey));
}
function lowestRatioAlly(maxRatio) {
  const c = aliveParty().filter((u) => u.hp / u.maxHp < maxRatio);
  if (c.length === 0) return null;
  return c.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
}
// Second Class Batch 1A — 아군 후열(슬롯 b0/b1) 생존자(결계장 후열 완충 대상). frontlineAllies의 후열 버전.
function backlineAllies() {
  const backSlots = SLOT_ORDER.filter((k) => k.startsWith("b"));
  return aliveParty().filter((u) => backSlots.includes(u.slotKey));
}
// Second Class Batch 1A — 적 등급 우선순위 가중(표식 타겟팅 공용). 보스>정예>일반. state.js RANK_OVERRIDES의 tier.
function enemyTierRank(u) {
  return u.tier === "boss" ? 3 : u.tier === "elite" ? 2 : 1;
}
// 검성 결투 표식: 보스 > 정예 > 공격력 높은 적 > 현재 HP 비율 낮은 적.
function selectDuelTarget() {
  const a = aliveEnemies();
  if (!a.length) return null;
  return a.slice().sort((x, y) =>
    enemyTierRank(y) - enemyTierRank(x)
    || (y.atk || 0) - (x.atk || 0)
    || x.hp / x.maxHp - y.hp / y.maxHp
  )[0];
}
// 천궁 천표식: 보스 > 후열/원거리 적 > HP 비율 낮은 적 > 공격력 높은 적.
function selectSkyTarget() {
  const a = aliveEnemies();
  if (!a.length) return null;
  const backRank = (u) => (u.role === "back" ? 1 : 0);
  return a.slice().sort((x, y) =>
    enemyTierRank(y) - enemyTierRank(x)
    || backRank(y) - backRank(x)
    || x.hp / x.maxHp - y.hp / y.maxHp
    || (y.atk || 0) - (x.atk || 0)
  )[0];
}
function damagedUnshieldedAlly() {
  const c = aliveParty().filter((u) => u.hp < u.maxHp && (u.shield || 0) <= 0);
  if (c.length === 0) return null;
  return c.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
}
// ── Second Class Batch 2 — 구원자/역병술사 공용 헬퍼 ───────────────────────
// 구원선 대상: HP 비율 최저 > 최대 HP 낮음 > 후열 아군.
function selectSalvationTarget() {
  const a = aliveParty();
  if (!a.length) return null;
  return a.slice().sort((x, y) =>
    x.hp / x.maxHp - y.hp / y.maxHp
    || x.maxHp - y.maxHp
    || (y.role === "back" ? 1 : 0) - (x.role === "back" ? 1 : 0)
  )[0];
}
// 감염 대상: 보스 제외 일반/정예 중 HP 비율 높은 적 우선(없으면=적 적으면 보스 허용), 공격력 높은 적.
function selectInfectTarget(pool) {
  if (!pool || !pool.length) return null;
  const nonBoss = pool.filter((e) => e.tier !== "boss");
  const cand = nonBoss.length ? nonBoss : pool;
  return cand.slice().sort((x, y) =>
    y.hp / y.maxHp - x.hp / x.maxHp
    || (y.atk || 0) - (x.atk || 0)
  )[0];
}
// 감염 부여: 감염 상태(지속 피해 tick) + 기존 defDown(방어 소폭↓) 재사용. '감염' 머리 위 표식 1회.
function applyInfection(target, L) {
  applyStatus(target, { type: "infection", duration: L.infectTurns ?? 3, tick: L.infectTick ?? 2 });
  applyStatus(target, { type: "defDown", duration: L.infectTurns ?? 3, pct: L.infectDefDown ?? 0.12 });
  playStatusApplyFx(target.instanceId, "감염", "down");
}
// 디버프 1개만 제거(정화사 removeNegStatus는 전부 제거 — 구원자/구원선은 1개 정책). 제거 성공 시 true.
function removeOneNegStatus(unit) {
  const NEG = ["poison", "infection", "atkDown", "speedDown", "slow", "defDown"];
  const i = (unit.statuses || []).findIndex((s) => NEG.includes(s.type));
  if (i >= 0) { unit.statuses.splice(i, 1); return true; }
  return false;
}
// 구원선 발동: 치명 피해 직전 1회(dealRaw에서 호출). 부활/사망 lifecycle 무변경 — HP가 0 이하가 될 피해를 가로챈다.
//   구원 소모 + maxHp healPct 회복 + 보호막 + 디버프 1개 제거. immortal과 독립(클램프보다 먼저 판정).
function triggerSalvation(target) {
  const L = skillOf("redeemer")?.logic || {};
  target.statuses = (target.statuses || []).filter((s) => s.type !== "salvation");
  target.hp = Math.max(1, Math.round(target.maxHp * (L.healPct ?? 0.20)));
  target.shield = Math.max(target.shield || 0, L.shield ?? 7);
  removeOneNegStatus(target);
  const redeemer = gameState.party.find((u) => !u.isDead && u.id === "redeemer");
  pushLog(`${redeemer ? redeemer.name : "구원자"}, 죽음을 붙잡았다! ${target.name} 구원 발동.`);
  playSupportFx({
    casterInstanceId: (redeemer || target).instanceId,
    text: "구원 발동!", kind: "heal",
    heals: [{ targetInstanceId: target.instanceId, amount: 0 }],
    guardInstanceId: target.instanceId,
  });
  playStatusApplyFx(target.instanceId, "구원", "up");
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
  const before = target.shield || 0;
  target.shield = Math.max(before, amount);
  // Dev Balance Lab 02 — 보호막 부여 계측(증가분 = refresh로 실제 오른 양). 무동작 시 null.
  if (labMeter && target.shield > before) labMeter.onShield(caster, target, target.shield - before);
}

// Combat Grammar Polish 02 — 실제 피해 적용(raw): 성역 1회 무효 → shield 흡수 → 초과분 HP.
//   결속/반격 무한연쇄 차단을 위해 "분배된 피해"는 항상 이 raw 경로로만 적용된다(재분배 없음).
// Job Identity Tuning 01 — 성황 수호 오오라(aegis): 받는 피해 고정 감소량(없으면 0).
function aegisFlatOf(unit) {
  if (!Array.isArray(unit.statuses)) return 0;
  const s = unit.statuses.find((x) => x.type === "aegis");
  return s ? (s.flat || 0) : 0;
}

function dealRaw(target, dmg) {
  if (target.damageImmune) { // First Class Expansion 01: 성역(성황) 1회 피해 무효
    target.damageImmune = false;
    return;
  }
  const hpBefore = target.hp; // Dev Balance Lab 01 — 실제 HP 손실 계측용(피해/계산식 불변, 읽기만)
  let absorbed = 0;
  let remaining = Math.max(0, dmg);
  // Job Identity Tuning 01 — 성황 수호 오오라: 피해 적용 직전 고정값 감소(최소 1 보장 — 완전 무효는 아님).
  const aegis = aegisFlatOf(target);
  if (aegis > 0 && remaining > 0) remaining = Math.max(1, remaining - aegis);
  const sh = target.shield || 0;
  if (sh > 0) {
    absorbed = Math.min(sh, remaining);
    target.shield = sh - absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) {
    // Second Class Batch 2 — 구원자 구원선: shield 흡수 후에도 이 피해로 HP가 0 이하가 될 치명이면 1회 개입.
    //   사망/부활 lifecycle을 건드리지 않고 "치명 피해를 받기 직전"에 가로챈다. immortal 클램프보다 먼저 판정.
    if (remaining >= target.hp && hasStatus(target, "salvation") && gameState.party.includes(target)) {
      triggerSalvation(target);
      if (labMeter) labMeter.onDamage(target, absorbed, 0, 0); // 구원선 개입 — shield 흡수분만 기록(HP 손실 0)
      return;
    }
    target.hp -= remaining;
  }
  // Dev Cheat Mode 01 — Immortal: 아군 영웅은 dev immortal일 때 최소 HP 1 유지(모든 피해 경로의 공통 싱크).
  //   적/몬스터엔 미적용(정상 사망). 일반 모드(dev OFF)에선 분기 자체가 false라 동작 완전 동일.
  if (gameState.dev && gameState.dev.immortal && target.hp < 1 && gameState.party.includes(target)) {
    target.hp = 1;
  }
  // Dev Balance Lab 01/02 — 받은 피해/막은 피해/오버킬 계측(대상 기준). hpLost는 보유 HP로 캡(음수 HP 과집계 방지),
  //   초과분은 overkill로 분리. 피해/계산식은 불변(읽기만). 무동작 시 null.
  if (labMeter) labMeter.onDamage(target, absorbed, Math.min(remaining, hpBefore), Math.max(0, remaining - hpBefore));
}

// Stage Persistence 01 — 전투 무력화 표시 + 로그. 표현만 분기(전투 판정/타겟/패배 조건은 불변).
//   영웅: HP 0 = "기절"(승리 시 다음 전투에서 HP 1로 복귀). 몬스터: 기존처럼 "쓰러짐/처치".
function markFallen(unit) {
  unit.hp = 0;
  unit.isDead = true;
  if (labMeter) labMeter.onFaint(unit, gameState.battle.tick); // Dev Balance Lab 02 — 기절/처치 시점 계측(생존시간/킬타임)
  const isHero = gameState.party.includes(unit);
  pushLog(isHero
    ? `${unit.name}${josa(unit.name, "이가")} 기절했다.`
    : `${unit.name}${josa(unit.name, "이가")} 쓰러졌다.`);
}

// 분배된 피해로 사망한 유닛(결속 파트너 등) 정리 — 호출부가 못 보는 사망을 여기서 마킹.
function killIfDead(unit) {
  if (unit && !unit.isDead && unit.hp <= 0) {
    markFallen(unit);
  }
}

// First Class Expansion 01A — 피해 적용 + 결속 피해 분배.
//   금제 악의 결속: 금제 60% / 결속 대상(적) 40%.  성벽 선의 결속: 대상 50% / 성벽 50%.
//   분배분은 dealRaw로만 적용 → 한 피해 이벤트당 분배 1회, 무한 연쇄 없음. 연결 사망 시 링크 해제.
function applyDamage(target, dmg) {
  // Boss Readiness Pressure 02 — 위압 중 사자왕은 받는 피해 감소(모든 피해원 공통: 공격/중독/교란/분배 전 단계).
  //   최소 1 보장. 위압 비활성(열쇠 2+) 보스에는 menace가 없어 영향 없음.
  if (target.menace && target.menace.dr > 0) dmg = Math.max(1, dmg * (1 - target.menace.dr));
  // Job Identity Tuning 02 — 결계장 파티 결속: 결속된 아군이 피해를 받으면 생존 결속 아군 전체가 나눠 받는다(총량 약간 완충).
  //   결계장 생존 중에만 작동. dealRaw로 직접 분배 → 재귀 분산 없음(무한 연쇄 차단). 성황 aegis(고정감소)와 다른 축.
  if (hasStatus(target, "wardlink") && gameState.party.some((u) => !u.isDead && u.id === "wardkeeper")) {
    const linked = aliveParty().filter((a) => hasStatus(a, "wardlink"));
    if (linked.length >= 2) {
      const buffer = skillOf("wardkeeper")?.logic?.bufferPct ?? 0.85;
      const total = Math.max(linked.length, Math.round(dmg * buffer));      // 완충(총 피해 -%)
      const each = Math.max(1, Math.round(total / linked.length));          // 생존 결속 아군 균등 분배(최소 1)
      linked.forEach((a) => { dealRaw(a, each); killIfDead(a); });
      playActorFx("wardSplash", null, { allyIds: linked.map((a) => a.instanceId) }); // 각 아군에 작게 피해 튐
      return;
    }
  }
  if (target.bondOffenseTarget) {
    const partner = gameState.enemies.find((e) => e.instanceId === target.bondOffenseTarget && !e.isDead);
    if (partner) {
      dealRaw(target, dmg * 0.6);
      dealRaw(partner, dmg * 0.4);
      playActorFx("forbiddenTransfer", target.instanceId, { toId: partner.instanceId }); // In-Game Apply 01B — 전가 순간 visual-only(피해 분배 불변)
      killIfDead(partner);
      return;
    }
    target.bondOffenseTarget = null;
  }
  if (target.protectedBy) {
    const wall = gameState.party.find((u) => u.instanceId === target.protectedBy && !u.isDead);
    if (wall && wall !== target) {
      dealRaw(target, dmg * 0.5);
      dealRaw(wall, dmg * 0.5);
      killIfDead(wall);
      return;
    }
    target.protectedBy = null;
  }
  dealRaw(target, dmg);
}

// 교란: 게이지 -25(0 미만 방지) + 아주 약한 피해. 보라/분홍 왜곡선.
function performDisrupt(trickster, target, meta) {
  const dmg = Math.max(1, Math.round(trickster.atk * 0.5));
  applyDamage(target, dmg);
  // Combat Visibility — 게이지 감소 표식: 깎이기 직전 위치를 기록(render가 "여기였다" 마커를 띄운다).
  target.gaugeDropFrom = Math.min(100, target.actionGauge || 0);
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
    markFallen(target);
  }
}

// 축복(신관) — Batch 01B: 사제와 분리된 서포터. 직접 회복 없이 보호막 중심(미래 피해 완화).
//   대상 아군(최대 2명)에게 소량 보호막(SHIELD_BLESS)을 refresh로 부여한다. HP는 채우지 않는다.
function performBless(cleric, allies, meta) {
  allies.forEach((a) => grantShieldTo(cleric, a, SHIELD_BLESS));
  pushLog(`${cleric.name}${josa(cleric.name, "이가")} 아군을 축복했다 — 보호막(+${SHIELD_BLESS}).`);
  playSupportFx({
    casterInstanceId: cleric.instanceId,
    text: meta.name + "!",
    kind: meta.kind,
    guardInstanceId: allies[0] ? allies[0].instanceId : null,
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

// ── Stealth Foundation 01 — Minimal Hidden State Contract ──────────────────
//   은신은 멋진 잔상 FX가 아니라 도적/추적자 전투 정체성을 위한 "최소 상태 계약"이다.
//   ★hidden을 부여하는 스킬이 아직 없다(Rogue/Tracker HOLD·normal gameplay 미연결) → 일반 플레이에선 어떤 유닛도 hidden이 아니므로
//     타깃/밸런스 영향 0. 기존 status 구조(unit.statuses[{type,duration,...}])를 그대로 재사용. reveal 규칙은 future Rogue/Tracker에서 확장.
function isHidden(unit) { return !!unit && !unit.isDead && hasStatus(unit, "hidden"); }
function applyHidden(unit, turns = 2, source = null) {
  if (!unit || unit.isDead) return false;
  applyStatus(unit, { type: "hidden", duration: Math.max(1, turns | 0), source: source || null });
  return true;
}
function clearHidden(unit, reason = "manual") {
  if (!unit || !Array.isArray(unit.statuses)) return false;
  const had = unit.statuses.some((s) => s.type === "hidden");
  if (had) {
    unit.statuses = unit.statuses.filter((s) => s.type !== "hidden");
    playActorFx("revealShimmer", unit.instanceId, { reason }); // reveal visual hook(짧은 shimmer). playActorFx가 내부에서 fxSuppressed 가드(헤드리스 안전).
  }
  return had;
}
// 계약: 은신 유닛이 "공격 계열" 행동을 시작하면 reveal 후보(판정만 제공 — 실제 자동 reveal 연결은 future Rogue/Tracker).
function shouldRevealOnAction(unit, actionKind) {
  return isHidden(unit) && (actionKind === "attack" || actionKind === "ranged" || actionKind === "disrupt");
}
// 적대 단일 타깃 계약: visible(비은신) 후보가 있으면 은신 후보 제외 / 전부 은신이면 fallback으로 전체(타깃 없어짐 방지).
function filterHiddenTargets(candidates) {
  const arr = Array.isArray(candidates) ? candidates : [];
  const visible = arr.filter((u) => !isHidden(u));
  return visible.length > 0 ? visible : arr;
}

function selectAttackTarget(pool) {
  const alive = filterHiddenTargets(pool.filter((u) => !u.isDead)); // Stealth Foundation 01 — 은신 제외(visible 있으면·전부 은신이면 fallback). ★normal gameplay엔 hidden 부여 스킬이 없어 영향 0.
  // First Class Expansion 01: 도발(taunt) 대상이 있으면 우선 공격(수문장/성황). 적은 taunt를 안 가짐.
  const taunting = alive.filter((u) => hasStatus(u, "taunt"));
  if (taunting.length > 0) return taunting[0];
  const front = alive.filter((u) => u.role === "front");
  return front.length > 0 ? front[0] : alive[0] ?? null;
}

function selectArcherTarget(pool) {
  const alive = filterHiddenTargets(pool.filter((u) => !u.isDead)); // Stealth Foundation 01 — 은신 제외(위와 동일 계약)
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
  // Stealth In-Game Apply 01 (C-2) — 은신 유닛이 공격 계열 행동을 시작하면 은신 해제(Foundation shouldRevealOnAction 계약).
  //   clearHidden이 상태 제거 + reveal shimmer 재생(공격 순간에 맞춰 드러남). event/payload/피해 계산 무관·시각+상태만.
  if (shouldRevealOnAction(attacker, "attack")) {
    // Stealth Polish 02 (작업 A) — Rogue 급습 은신(source "ambush") 해제 시에만 전신 등장 연기("나타났다!!") 보강.
    //   ★source "ambush" 한정 → Tracker aim 은신(source "aim") reveal엔 안 붙음(shimmer만). clearHidden이 기존 reveal shimmer 재생, smoke는 보조.
    const ambushReveal = Array.isArray(attacker.statuses) && attacker.statuses.some((s) => s.type === "hidden" && s.source === "ambush");
    clearHidden(attacker, "attack");
    if (ambushReveal) playActorFx("revealSmoke", attacker.instanceId);
  }
  // Status & Effect Foundation 01: guard — 받는 피해 최소 보정(음수/0 방지, 최소 1).
  // First Class Expansion 01: atkDown(워든 습격) — 공격자의 공격력 일시 감소.
  let atk = attacker.atk;
  const ad = Array.isArray(attacker.statuses) && attacker.statuses.find((s) => s.type === "atkDown");
  if (ad) atk = Math.max(1, Math.round(atk * (1 - (ad.pct || 0))));
  // Monster Identity 01 — atkUp(숲올빼미 지휘): 공격력 일시 증가(적 전용 버프). 영웅엔 부여되지 않음.
  const au = Array.isArray(attacker.statuses) && attacker.statuses.find((s) => s.type === "atkUp");
  if (au) atk = Math.round(atk * (1 + (au.pct || 0)));

  // Job Identity Tuning 02 — 검성 분쇄: 공격(간파 반격 포함)마다 스택+1(최대 crushMax), 스택당 atk +crushPct.
  //   스테이지 종료 시 파티 재생성(createInitialParty)으로 unit이 새로 만들어져 스택은 자동 초기화된다.
  if (attacker.id === "swordsaint") {
    const cl = (skillOf("swordsaint") && skillOf("swordsaint").logic) || {};
    attacker.crushStacks = Math.min(cl.crushMax ?? 10, (attacker.crushStacks || 0) + 1);
    atk = Math.round(atk * (1 + attacker.crushStacks * (cl.crushPct ?? 0.04)));
  }

  const base = hasStatus(target, "guard")
    ? Math.max(1, atk - GUARD_DAMAGE_REDUCTION)
    : atk;
  let mult = opts.mult || 1;
  // Combat Grammar Foundation 01 — 치명 판정. 기본 공격(스킬 아님)만 확률 롤. critUp/critDown 반영.
  //   rhythm(바드 리듬)·opts.crit는 확정 치명. 치명은 일반 피해 배율만 — 중독/고정/회복엔 적용 안 됨(별 경로).
  let isCrit = false;
  if (hasStatus(attacker, "rhythm")) {
    isCrit = true;
    attacker.statuses = attacker.statuses.filter((s) => s.type !== "rhythm");
  } else if (opts.crit) {
    isCrit = true;
  } else if (!opts.skill) {
    // Batch 01C — 중독 대상이면 치명 확률 가산(덫꾼 독 표식 — 파티의 다음 공격 기대값↑).
    const poisonBonus = hasStatus(target, "poison") ? POISON_CRIT_BONUS : 0;
    const chance = Math.max(0, Math.min(1, CRIT_BASE + statusPct(attacker, "critUp") - statusPct(attacker, "critDown") + poisonBonus));
    if (Math.random() < chance) isCrit = true;
  }
  if (isCrit) mult *= CRIT_MULT;
  let damage = Math.max(1, Math.round(base * mult));
  // Combat Grammar Foundation 01 — 방어 상태(대상): defUp 받는 피해↓ / defDown 받는 피해↑.
  //   표시/로그 숫자에 반영되도록 여기서 적용(읽힘 우선 — 보이는 숫자 = 실제 피해).
  const defUp = statusPct(target, "defUp");
  const defDown = statusPct(target, "defDown");
  if (defUp) damage = Math.max(1, Math.round(damage * (1 - defUp)));
  if (defDown) damage = Math.max(1, Math.round(damage * (1 + defDown)));
  // Combat Grammar Polish 02: 보호막 우선 흡수 → 초과분만 HP.
  // Batch 01A — 파수궁 반격은 "실제 피해를 입었을 때만" 발동(0/무효화 제외). 적용 전후 내구도(HP+보호막)
  //   풀을 비교해 피해무효(damageImmune)나 분담 경로로 대상 풀이 줄지 않은 경우엔 반격하지 않는다.
  const poolBefore = target.hp + (target.shield || 0);
  applyDamage(target, damage);
  const tookRealDamage = (target.hp + (target.shield || 0)) < poolBefore;
  // Dev Balance Lab 01/02 — 타격 계측(공격 횟수/치명/최대·평균/스킬 피해 + 반격 여부). 표시되는 damage 기준. 무동작 시 null.
  if (labMeter) labMeter.onAttack(attacker, target, damage, isCrit, !!opts.skill, !!opts.isCounter);

  const verb = attackVerb(attacker);
  const ro = josa(target.name, "을를");

  // 치명 로그/외침은 최소로 — 별도 줄 없이 기존 피해 로그에 "(치명!)"만 덧붙인다(로그 과밀 방지).
  // Hero Readability Polish 01A — 독 대상 기본 공격에서 치명이 났으면 "독 표식 치명!"으로 표기(덫꾼 치명판 가시화).
  //   기본 공격(!opts.skill)에만 적용 — 스킬 공격엔 poison 치명 보정이 없으므로 이 표기도 안 붙는다. 수치/계산 불변.
  const poisonCrit = isCrit && !opts.skill && hasStatus(target, "poison");
  const critTag = poisonCrit ? " (독 표식 치명!)" : isCrit ? " (치명!)" : "";
  // Hero Readability Polish 01B — 추적자 추격(표식 대상)이면 짧은 태그(표시 전용).
  const chaseTag = opts.chase ? " (표식 추적)" : "";
  pushLog(`${attacker.name}${josa(attacker.name, "이가")} ${target.name}${ro} ${verb}. ${damage} 피해${critTag}${chaseTag}.`);

  const line = opts.lineType || attackLineType(attacker);
  playActionFx({
    // Combat Visibility Job Grammar 01 — 체인 관통: fxSourceId로 선 시작점을 다른 유닛(전열 대상)에서 출발시키고
    //   chained/delayExtra로 순차 연결한다(피해는 동기 적용·시각만 체인).
    sourceInstanceId: opts.fxSourceId || attacker.instanceId,
    sourceUnitId: attacker.id,
    targetInstanceId: target.instanceId,
    lineType: line,
    kind: actionKindOf(attacker, attacker.team === "party"),
    isHeal: false,
    amount: damage,
    delayExtra: opts.fxDelayExtra || 0,
    chained: !!opts.chained,
    noLine: !!opts.noLine, // Combat Grammar Follow-up 01 — 광역 폭발 등: 선 생략하고 도착 hit만(피해는 그대로)
    // Combat Grammar Foundation 01 — 치명이면 주황 치명 숫자 규격(01C), 아니면 기본 빨강.
    numberVariant: isCrit ? "crit" : null,
    // 스킬이면 스킬명(더 큰 텍스트), 아니면 기본 "공격!". noShout면 외침 없음.
    shoutText: opts.noShout ? null : opts.skill ? opts.skill.name + "!" : "공격!",
    shoutKind: opts.skill ? opts.skill.kind : line === "ranged" ? "ranged" : "attack",
    shoutTier: opts.skill ? "skill" : "basic",
  });

  if (target.hp <= 0) {
    markFallen(target);
  }

  // First Class Expansion 01A → Batch 01A — 파수궁 보복: 적이 후열 아군에게 "실제 피해"를 입히면
  //   살아있는 파수궁이 즉시 1회 원거리 보복. opts.isCounter면 발동 안 함(반격의 반격 금지 → 무한 연쇄 차단).
  if (!opts.isCounter && tookRealDamage && attacker.team === "enemy" && gameState.party.includes(target) && target.role === "back") {
    triggerWatchbowCounter(attacker, target); // target=피격 후열 아군(감지선 출발점·In-Game Apply 01B)
  }

  // Job Identity Tuning 02 — 검성 간파 반격: 검성이 실제 피해를 입으면 공격자에게 즉시 1회 반격(턴당 1회). [결투] 조건 제거.
  //   isCounter면 발동 안 함(반격의 반격 금지 → 무한 연쇄 차단). 파수궁과 독립(둘 다 isCounter 가드).
  if (!opts.isCounter && tookRealDamage && attacker.team === "enemy" && gameState.party.includes(target)) {
    triggerSwordsaintParry(attacker, target);
  }
}

// Job Identity Tuning 02 — 검성 간파: 검성 본인이 피격당하면 공격자에게 즉시 1회 반격(턴당 1회). [결투] 조건 없음 — 직관화.
//   - 피해는 검성 ATK의 counterMult. 게이지/일반 행동 미소모(직접 performAttack). 반격도 분쇄 스택에 기여(performAttack에서 누적).
//   - parryReady가 false면 발동 안 함(이번 행동 주기엔 이미 반격). 검성 일반 행동 시 재충전.
function triggerSwordsaintParry(enemyAttacker, victim) {
  if (!enemyAttacker || enemyAttacker.isDead) return;
  const ss = gameState.party.find((u) => !u.isDead && u.id === "swordsaint");
  if (!ss || ss !== victim) return;               // 검성 본인이 피격당했을 때만
  if (ss.parryReady === false) return;            // 이번 행동 주기엔 이미 반격함
  const mult = skillOf("swordsaint")?.logic?.counterMult ?? 0.7;
  ss.parryReady = false;
  pushLog(`${ss.name} 간파!`);
  performAttack(ss, enemyAttacker, { mult, skill: { name: "간파", kind: "attack" }, isCounter: true, lineType: "crush" });
}

// 후열 아군 피격 → 파수궁 보복. Batch 01A 공식 정렬:
//   - 피해량은 파수궁 ATK의 50%(mult 0.5, 최소 1 보장은 performAttack의 Math.max(1,…)).
//   - 게이지/일반 행동을 소모하지 않는다(여기서 직접 performAttack 호출 — performAction을 거치지 않음).
//   - 일반 행동 1회 사이 최대 1번: counterReady가 false면 발동하지 않는다(초기 undefined=충전됨으로 간주).
//   - 발동하면 counterReady=false로 소진. 재충전은 파수궁이 일반 행동(performAction)을 수행할 때.
function triggerWatchbowCounter(enemyAttacker, victim) {
  if (!enemyAttacker || enemyAttacker.isDead) return;
  const watchbow = gameState.party.find((u) => !u.isDead && u.id === "watchbow");
  if (!watchbow) return;
  if (watchbow.counterReady === false) return; // 이번 일반 행동 주기엔 이미 1회 보복함
  watchbow.counterReady = false;
  // In-Game Apply 01B — 아군 피격 → 파수궁 감지선(visual-only). 보복 조건/타깃/피해는 불변.
  playActorFx("watchbowDetect", watchbow.instanceId, { fromId: (victim || enemyAttacker).instanceId });
  performAttack(watchbow, enemyAttacker, {
    mult: 0.5, lineType: "ranged", skill: skillOf("watchbow"), isCounter: true,
  });
}

// 01A — 성직자 쌍치유: HP 비율 최저 2인 회복(사제와 동일 회복량). 단일 큰 회복 아님.
function performDualHeal(saint, meta) {
  const targets = aliveParty()
    .slice()
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
    .slice(0, 2);
  // Run Reward Diversification 02 — 받는 치유량은 healUnit이 대상별로 가산(힐러 측 bonuses.heal 제거).
  const amount = Math.round(saint.atk * 1.5);
  const heals = [];
  targets.forEach((a) => {
    const h = healUnit(a, amount);
    if (h > 0) heals.push({ targetInstanceId: a.instanceId, amount: h });
  });
  pushLog(`${saint.name}${josa(saint.name, "이가")} 두 아군을 치유했다.`);
  playSupportFx({ casterInstanceId: saint.instanceId, text: meta.name + "!", kind: meta.kind, heals });
}

function performHeal(healer, target, opts = {}) {
  // Run Reward Diversification 02 — 받는 치유량 보너스는 healUnit이 대상 기준으로 가산(힐러 측 bonuses.heal 제거).
  const healAmount = Math.round(healer.atk * 1.5);
  const actualHeal = healUnit(target, healAmount);

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
    // Run Structure 01A: 보스문 승리 = 런 클리어. 그 외 전투 승리 = 보상 후 여정 선택으로.
    return { outcome: gameState.run.currentRouteType === "boss" ? "clear" : "victory" };
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
  if (headlessRun) { applyFinish(outcome); return; } // Auto Run Report 01 — 주회는 마무리 지연 없이 즉시(동기) 전환
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
    // Stage Persistence 01 — 승리 시점의 파티 HP를 저장(생존=현재 HP, 기절=ko). 다음 전투로 이월된다.
    //   danger(깊은 수풀)는 아래에서 일찍 return하므로 캡처는 분기 전에 한 번만 수행한다.
    capturePartyHp();
    // Return & Loot Core 01 — 전투 승리 시 낮은 확률로 전리품을 "주워서 들고 간다"(아직 확정 소유 아님).
    //   ★headless(주회/Auto Run/Balance Lab) 제외 → dev 도구 동작/요약 무영향. 기존 보상/영입/합체/쉼터 흐름은 건드리지 않는다.
    if (!headlessRun) maybeFindLoot();
    // Run Structure 01A: 정예 전투 승리 시 보스 열쇠 획득(보스문이 다음 여정 선택지로 열린다).
    if (gameState.run.currentRouteType === "elite") {
      gameState.run.bossKeys += 1;
      // Boss Readiness Pressure 02 — 첫 열쇠=보스문 개방 / 둘째 열쇠=사자왕 위압 해제. 단계별 체감 로그.
      const keys = gameState.run.bossKeys;
      if (keys === 1) pushLog("보스 열쇠를 얻었다 — 새싹 왕의 문이 열린다.");
      else if (keys === 2) pushLog("두 번째 열쇠가 사자왕의 위압을 걷어냈다. 정예의 시험을 모두 넘었다.");
      else pushLog(`정예를 물리쳤다 — 보스 열쇠 +1 (보유 ${keys}).`);
    }
    // Discovery Codex Foundation 01 — 방금 처치한 적을 도감에 발견+처치로 기록(headless 주회 제외). 전투 계산 불변.
    if (!headlessRun) recordMonstersDefeated(enemyMonsterIds(gameState.enemies));
    // Route Grammar 02B — 승리 후 보상은 길마다 다르다(전부 전투 후). 영입/합체는 "전투에서 이긴 뒤" 연결한다.
    const rt = gameState.run.currentRouteType;
    if (rt === "ally") {
      // 동료의 흔적 승리 → 영입 화면(빈자리 채움). 패배 시엔 여기 안 옴 = 영입 없음. 자동 영입 아님(ally 선택의 결과).
      gameState.run.result = "victory";
      rollRecruitOffer();
      gameState.run.recruitContext = "ally";
      pushLog(`심도 ${gameState.run.depth} 클리어! 동료의 흔적 — 전투에서 이겨 새 동료를 영입한다.`);
      enterRecruit();
      return;
    }
    if (rt === "bond" && partyJobIds().length >= 3 && availableFusions(partyJobIds()).length > 0) {
      // 결속의 공터 승리 → 합체 화면. 합체 후 자동 영입 없음(빈자리 유지). 패배 시엔 여기 안 옴 = 합체 없음.
      gameState.run.result = "victory";
      gameState.run.recruitContext = "bond";
      pushLog(`심도 ${gameState.run.depth} 클리어! 결속의 공터 — 전투에서 이겨 합체로 빌드를 정리한다.`);
      gameState.screen = "fusion";
      renderGame(gameState);
      return;
    }
    // Reward Pressure 01 — 그 외(새싹 숲길1 / 깊은 수풀2 / 정예1)는 성장 보상. 보스 열쇠는 위 elite 분기에서 이미 처리.
    gameState.run.rewardPicks = Math.max(1, routeReward(rt).picks || 1);
    gameState.run.result = "victory";
    rollRewardOffer(); // Run Reward Training 01 — 보상 진입 시 3택을 한 번 굴려 고정
    gameState.screen = "reward"; // Game Flow 01: 클리어 → 보상 선택 화면
    pushLog(`심도 ${gameState.run.depth} 클리어! 보상을 선택하세요.`);
  } else if (outcome === "clear") {
    gameState.run.result = "clear";
    if (!headlessRun) recordMonstersDefeated(enemyMonsterIds(gameState.enemies)); // 사자왕 처치 기록(도감)
    recordFootprint("clear"); // Run Footprints 01 — 런 클리어 1건 기록
    pushLog("새싹숲 사자왕 격파 — 런 클리어! ▶ 다시 시작");
  } else if (outcome === "defeat") {
    gameState.battle.result = "defeat";
    gameState.run.result = "defeat";
    recordFootprint("defeat"); // Run Footprints 01 — 모험 실패 1건 기록
    pushLog("모험 실패... ▶ 다시 시작");
  }
  renderGame(gameState);
}

// Return & Loot Core 01 — 전투 승리 시 전리품 발견 시도(감정 코어).
//   ★전투 스탯 효과 없음 · 영구 재화/상점/메타 성장 아님 · battle event schema/payload 무확장(런 상태 carriedLoot만 변경).
//   1런 0~3개 체감: 확률 30% + 보유 상한 3. 기존 본게임 RNG와 동일하게 Math.random 사용.
const LOOT_FIND_CHANCE = 0.3; // 전투 승리당 발견 확률
const LOOT_CARRY_CAP = 3;     // 한 런에 들고 갈 수 있는 전리품 수(0~3개 체감 상한)
function maybeFindLoot() {
  const run = gameState.run;
  if (!Array.isArray(run.carriedLoot)) run.carriedLoot = [];
  if (run.carriedLoot.length >= LOOT_CARRY_CAP) return;
  if (Math.random() >= LOOT_FIND_CHANCE) return;
  const loot = rollLootCandidate(run.depth || 0, run.carriedLoot.map((l) => l.id));
  if (!loot) return;
  run.carriedLoot.push(loot);
  pushLog(`전리품을 주웠다 — ${loot.name} (아직 들고 있는 중).`);
}

// Run Footprints 01 — 현재 런 요약 1건 저장(클리어/실패/포기 공용). 파티 구성은 formation(슬롯→직업) 기준,
//   현실 전투 시간 합(combatMs)·심도·경계도를 함께 남긴다. 직업명 매핑은 표시 레이어(render)가 담당한다.
function recordFootprint(result) {
  if (headlessRun) return; // Auto Run Report 01 — 주회는 발자취(localStorage)를 절대 기록하지 않는다(오염 차단)
  const f = gameState.run.formation || {};
  const party = SLOT_ORDER.map((k) => (f[k] ? { slot: k, job: f[k] } : null)).filter(Boolean);
  saveFootprint({
    result,
    depth: gameState.run.depth,
    alertness: gameState.run.alertness || 0,
    party,
    combatMs: Math.round(gameState.run.combatMs || 0),
    combatNormMs: Math.round(gameState.run.combatNormMs || 0), // Polish 01 — x2 환산 전투시간
    ts: Date.now(),
  });
  // Discovery Codex Foundation 01 — 진행도(사자왕 클리어/최고 심도) 안전 반영. headless는 위에서 이미 return됨.
  //   try/catch는 progression 내부에 있음(실패해도 플레이 방해 X). 전투 계산/수치 불변.
  recordRunResult({ result, depth: gameState.run.depth, themeId: "beginner" });
}

// Discovery Codex Foundation 01 — 전투에 등장한 적의 도감 id(=템플릿 type) 목록. id 파싱(`prefix-key-i`)은 fallback.
function enemyMonsterIds(units) {
  return (units || []).map((u) => u && (u.type || String(u.id || "").split("-")[1])).filter(Boolean);
}

// Run Footprints 01 — 런 포기: 진행 중 전투 시간까지 합산해 "포기" 1건 기록 후 타이틀로.
//   기존 "타이틀" 버튼(goTitle — 비기록 빠른 복귀)과 의미를 분리한다(포기는 발자취를 남긴다).
export function abandonRun() {
  if (gameState.run.battleStartTs != null) {
    gameState.run.combatMs = (gameState.run.combatMs || 0) + (performance.now() - gameState.run.battleStartTs);
    gameState.run.combatNormMs = (gameState.run.combatNormMs || 0) + (gameState.battle.tick || 0) * X2_TICK_INTERVAL;
    gameState.run.battleStartTs = null;
  }
  recordFootprint("abort");
  goTitle();
}

// Return Choice Core 01 — Carry Loot Exit Decision 01: route 선택 구간에서 "지금 들고 나온다"는 명시적 귀환.
//   전투 없이 런을 종료하고, 들고 있던 전리품을 확보(secured)한 결과 화면으로 간다.
//   ★보스 클리어("clear")와 구분되는 "return" 결과 — 패배 아님·대성공도 아님("적당히 챙겨 살아 돌아옴").
//   전투 밸런스/적 수치/route pressure/band/Forest Director/loot 드랍 로직·battle event schema/payload 전부 무변경.
//   run 종료 흐름만 추가(결과 표시는 기존 result-overlay 경로 재사용 — getRunLootSummary가 return을 secured로 본다).
export function returnRun() {
  // 진행 중 전투 시간 합산(route 화면에선 보통 battleStartTs=null이라 no-op — abandonRun과 동일 가드).
  if (gameState.run.battleStartTs != null) {
    gameState.run.combatMs = (gameState.run.combatMs || 0) + (performance.now() - gameState.run.battleStartTs);
    gameState.run.combatNormMs = (gameState.run.combatNormMs || 0) + (gameState.battle.tick || 0) * X2_TICK_INTERVAL;
    gameState.run.battleStartTs = null;
  }
  gameState.run.result = "return";    // getRunLootSummary: carried → secured
  gameState.battle.status = "ended";  // result-overlay 표시 조건(ended)
  gameState.screen = "battle";        // 결과 오버레이는 battle view 위에 뜬다(clear/defeat와 동일 경로)
  recordFootprint("return");          // 발자취 "귀환" 1건(최고 심도만 갱신·사자왕 클리어 카운트 아님)
  const n = Array.isArray(gameState.run.carriedLoot) ? gameState.run.carriedLoot.length : 0;
  pushLog(n > 0 ? `전리품 ${n}개를 품고 숲을 빠져나왔다. ▶ 다시 시작` : "숲을 빠져나왔다. ▶ 다시 시작");
  renderGame(gameState);
}

function pushLog(text) {
  if (labMeter || headlessRun) return; // Dev Balance Lab 01 / Auto Run Report 01 — 헤드리스 중 로그 누적 생략
  gameState.logs.push(text);
  if (gameState.logs.length > 8) {
    gameState.logs.splice(0, gameState.logs.length - 8);
  }
}

/* =========================================================
   Dev Balance Lab 01 — 계측 미터 + 헤드리스 듀얼 시뮬레이터
   본게임 전투 엔진(stepCombat/performAction/performAttack/healUnit…)을 "그대로" 재사용해
   아군 1 vs 적 1을 측정 시간만큼 돌리고 지표를 수집한다. 전투 공식/직업 스탯/스킬 수치/몬스터
   데이터/합체/보상/localStorage는 일절 건드리지 않는다(이 도구는 계측 전용이다).
     - labMeter가 null이 아닐 때만 위 전투 함수의 훅이 기록한다(본게임 전투엔 항상 null → 동작 불변).
     - sim은 gameState.party/enemies/logs/screen/run.depth/battle/dev.immortal을 잠시 빌렸다가 복구한다.
     - FX/로그/렌더는 setFxSuppressed + pushLog 가드로 생략(피해/회복/계산식은 불변, 표시만 생략).
     - 사망 시 즉시 HP 복구(revive)로 측정 시간 내내 전투가 끊기지 않게 한다(나라 요청).
   향후 Auto Run Report 01은 이 미터(createLabMeter)와 sim 헬퍼를 재사용해 다회 주회로 확장할 수 있다.
   ========================================================= */

// x2 환산 1초 = 게임 틱 4개(=1000ms / X2_TICK_INTERVAL 250ms). 발자취(combatNormMs)와 같은 시간 규약.
const LAB_TICKS_PER_SEC = Math.max(1, Math.round(1000 / X2_TICK_INTERVAL));

// Dev Balance Lab 02 — per-unit 계측 누적기(1:1/생존/다중/파티 공통). instanceId별 record를 모은다.
//   공격은 performAttack이 attacker를 직접 넘기고, 회복/보호막/표식은 labActor(현재 행동 유닛)에 귀속한다.
//   1:1 호환 result()도 제공해 Balance Lab 01 듀얼 표를 그대로 유지한다(총 피해량=모든 적 받은 피해 합).
function createLabMeter() {
  const units = new Map();
  const recOf = (u) => {
    let r = units.get(u.instanceId);
    if (!r) {
      r = {
        instanceId: u.instanceId, id: u.id, name: u.name, team: u.team,
        dmgDone: 0, hits: 0, crits: 0, skillCasts: 0, skillDamage: 0, maxHit: 0, counters: 0, // 공세(공격 기준)
        dmgTaken: 0, shieldBlocked: 0, overkillTaken: 0,                                        // 피격(대상 기준, 모든 피해원)
        healDone: 0, overHeal: 0, shieldApplied: 0, marks: 0,                                   // 지원
        faints: 0, faintTick: null,                                                             // 생명주기
      };
      units.set(u.instanceId, r);
    }
    return r;
  };
  const m = { units, kills: [] };
  m.onAttack = (attacker, target, damage, isCrit, isSkill, isCounter) => {
    const r = recOf(attacker);
    r.dmgDone += damage; r.hits += 1;
    if (damage > r.maxHit) r.maxHit = damage;
    if (isCrit) r.crits += 1;
    if (isSkill) r.skillDamage += damage;
    if (isCounter) r.counters += 1;
  };
  m.onDamage = (target, absorbed, hpLost, overkill = 0) => {
    const r = recOf(target);
    r.dmgTaken += absorbed + hpLost; r.shieldBlocked += absorbed; r.overkillTaken += overkill;
  };
  m.onSkillCast = (unit) => { recOf(unit).skillCasts += 1; };
  m.onHeal = (actor, target, requested, effective) => {
    if (!actor) return;
    const r = recOf(actor);
    r.healDone += effective; r.overHeal += Math.max(0, requested - effective);
  };
  m.onShield = (caster, target, added) => { if (caster && added > 0) recOf(caster).shieldApplied += added; };
  m.onMark = (caster, target) => { if (caster) recOf(caster).marks += 1; };
  m.onFaint = (unit, tick) => {
    const r = recOf(unit); r.faints += 1; if (r.faintTick == null) r.faintTick = tick;
    if (unit.team === "enemy") m.kills.push(tick);
  };
  // 1:1 호환 결과(Balance Lab 01 듀얼 표). 총 피해량=모든 적 받은 피해 합(독/교란/광역 포함), 받은 피해량=아군 record.
  m.result = (seconds, ticks) => {
    const per = (v) => (seconds > 0 ? v / seconds : 0);
    const all = [...units.values()];
    const hero = all.find((r) => r.team === "party") || { hits: 0, dmgDone: 0, maxHit: 0, crits: 0, skillCasts: 0, skillDamage: 0, dmgTaken: 0, shieldBlocked: 0, healDone: 0 };
    const totalToEnemies = all.filter((r) => r.team === "enemy").reduce((s, r) => s + r.dmgTaken, 0);
    return {
      seconds, ticks,
      totalDamage: totalToEnemies, dps: per(totalToEnemies),
      attacks: hero.hits, avgDamage: hero.hits ? hero.dmgDone / hero.hits : 0, maxDamage: hero.maxHit,
      crits: hero.crits, skillCasts: hero.skillCasts, skillDamage: hero.skillDamage,
      damageTaken: hero.dmgTaken, dpsTaken: per(hero.dmgTaken), shieldBlocked: hero.shieldBlocked, heal: hero.healDone,
    };
  };
  return m;
}

// sim 전용: 측정 시간 동안 양쪽이 죽지 않고 계속 싸우도록 사망 즉시 HP 복구.
//   HP 흐름은 자연스럽게 두되(저HP 조건 스킬이 정상 작동) 전투가 끝나지 않게 한다.
//   피해/회복 집계는 이 복구 전에 dealRaw/healUnit 훅에서 이미 기록되었다.
function reviveForSim(u) {
  if (u && u.isDead) { u.isDead = false; u.hp = u.maxHp; }
}

// 헤드리스 듀얼 1회 실행 → 측정 결과 반환. config: { heroJob, enemyTemplate, seconds }.
//   enemyTemplate = UNIT_TEMPLATES.enemies[key] 또는 Lab 내부 더미 템플릿(본게임 데이터 오염 없음).
export function runDuelSimulation({ heroJob, enemyTemplate, seconds }) {
  if (!heroJob || !enemyTemplate || !seconds) return null;

  // 원상복구용 스냅샷 — 본게임 상태를 잠시 빌린다.
  const saved = {
    party: gameState.party,
    enemies: gameState.enemies,
    logs: gameState.logs,
    screen: gameState.screen,
    battle: { ...gameState.battle },
    runDepth: gameState.run.depth,
    immortal: gameState.dev ? gameState.dev.immortal : false,
  };

  // 샌드박스 유닛: 본게임 생성식 그대로 재사용(공식 복제 없음).
  //   아군은 직업 선호 슬롯(전열/후열)에 배치 → role/grammar/jobId가 본게임과 동일하게 구성된다.
  const slot = prefersFront(heroJob) ? "f0" : "b0";
  const hero = createInitialParty({ atk: 0, maxHp: 0, heal: 0, healRecv: 0 }, { [slot]: heroJob }, null)[0];
  if (!hero) return null;
  const enemy = createUnit(enemyTemplate, `lab-${enemyTemplate.id || "enemy"}-1`);

  let result = null;
  const meter = createLabMeter();
  try {
    gameState.party = [hero];
    gameState.enemies = [enemy];
    gameState.run.depth = 1;                              // 심도 가속 없음(순수 1:1)
    if (gameState.dev) gameState.dev.immortal = false;    // sim은 불사 클램프 대신 revive 사용
    labMeter = meter;
    setFxSuppressed(true);

    const ticks = Math.max(1, Math.round(seconds * LAB_TICKS_PER_SEC));
    for (let i = 0; i < ticks; i++) {
      stepCombat();
      reviveForSim(hero);
      reviveForSim(enemy);
    }
    result = meter.result(seconds, ticks);
  } finally {
    // 항상 복구(에러가 나도 본게임 상태가 오염되지 않게).
    labMeter = null;
    setFxSuppressed(false);
    gameState.party = saved.party;
    gameState.enemies = saved.enemies;
    gameState.logs = saved.logs;
    gameState.screen = saved.screen;
    Object.assign(gameState.battle, saved.battle);
    gameState.run.depth = saved.runDepth;
    if (gameState.dev) gameState.dev.immortal = saved.immortal;
  }
  return result;
}

/* =========================================================
   Dev Balance Lab 02 — Role Value Metrics: 일반 시나리오 헤드리스 실행(아군 N vs 적 M).
   1:1 Duel / Survival / Multi Target / Party 공통. 전투 엔진(stepCombat)을 그대로 재사용하고,
   per-unit 미터로 생존/회복/보호막/다중/조건부 지표를 수집한다. 본게임 수치/데이터/저장 무변경.
     - sustained=true(듀얼/생존/다중): 사망 즉시 revive → 측정시간 내내 지속(throughput + 첫 기절 + 킬레이트).
     - sustained=false(파티 웨이브): revive 없이 자연 종료(클리어/전멸/시간초과) — 클리어·잔여HP·기절 수.
   gameState는 잠시 빌렸다 finally에서 복구(state 오염 0). FX/로그/렌더는 헤드리스 가드로 생략.
   ========================================================= */
const LAB_FRONT_SLOTS = ["ef0", "ef1", "ef2", "ef3", "ef4", "ef5"];
const LAB_BACK_SLOTS = ["eb0", "eb1", "eb2", "eb3", "eb4", "eb5"];

export function runLabScenario({ allyJobs, enemyTemplates, seconds, sustained = true }) {
  if (!Array.isArray(allyJobs) || !allyJobs.length || !Array.isArray(enemyTemplates) || !enemyTemplates.length || !seconds) return null;
  const saved = {
    party: gameState.party, enemies: gameState.enemies, logs: gameState.logs, screen: gameState.screen,
    battle: { ...gameState.battle }, runDepth: gameState.run.depth, immortal: gameState.dev ? gameState.dev.immortal : false,
  };
  // 아군: 직업 선호 슬롯에 배치(role/grammar/jobId가 본게임과 동일하게 구성). 최대 4인.
  const formation = { f0: null, f1: null, b0: null, b1: null };
  allyJobs.slice(0, 4).forEach((j) => { const slot = slotPreference(j).find((k) => !formation[k]); if (slot) formation[slot] = j; });
  const heroes = createInitialParty({ atk: 0, maxHp: 0, heal: 0, healRecv: 0 }, formation, null);
  if (!heroes.length) return null;
  // 적: 템플릿 배열로 생성(전열/후열 슬롯 분산 — 본게임 타겟팅 role 그대로).
  let fi = 0, bi = 0;
  const enemies = enemyTemplates.map((t, i) => {
    const u = createUnit(t, `lab-e${i}-${t.id || "e"}`);
    u.slot = u.role === "front" ? (LAB_FRONT_SLOTS[fi++] || `ef${i}`) : (LAB_BACK_SLOTS[bi++] || `eb${i}`);
    return u;
  });

  let result = null;
  const meter = createLabMeter();
  try {
    gameState.party = heroes; gameState.enemies = enemies; gameState.run.depth = 1;
    if (gameState.dev) gameState.dev.immortal = false; // revive로 측정(불사 클램프 미사용)
    labMeter = meter; labActor = null; setFxSuppressed(true);
    const ticks = Math.max(1, Math.round(seconds * LAB_TICKS_PER_SEC));
    let endTick = ticks, clearTick = null;
    for (let i = 0; i < ticks; i++) {
      gameState.battle.tick = i + 1; // 미터 타이밍(생존시간/킬타임)용
      if (!sustained) {
        const enemiesDead = enemies.every((u) => u.isDead);
        const heroesDead = heroes.every((u) => u.isDead);
        if (enemiesDead || heroesDead) { if (enemiesDead && clearTick == null) clearTick = i; endTick = i; break; }
      }
      stepCombat();
      if (sustained) { heroes.forEach(reviveForSim); enemies.forEach(reviveForSim); }
    }
    const enemiesDeadFinal = enemies.every((u) => u.isDead);
    if (!sustained && enemiesDeadFinal && clearTick == null) clearTick = endTick;
    result = buildLabResult(meter, seconds, ticks, { sustained, endTick, clearTick, enemiesDeadFinal, heroesDeadFinal: heroes.every((u) => u.isDead) });
  } finally {
    labMeter = null; labActor = null; setFxSuppressed(false);
    gameState.party = saved.party; gameState.enemies = saved.enemies; gameState.logs = saved.logs; gameState.screen = saved.screen;
    Object.assign(gameState.battle, saved.battle); gameState.run.depth = saved.runDepth;
    if (gameState.dev) gameState.dev.immortal = saved.immortal;
  }
  return result;
}

function buildLabResult(meter, seconds, ticks, ctx) {
  const tickToSec = (t) => (t == null ? null : Math.round((t / LAB_TICKS_PER_SEC) * 10) / 10);
  const blank = (u) => ({ instanceId: u.instanceId, id: u.id, name: u.name, team: u.team, dmgDone: 0, hits: 0, crits: 0, skillCasts: 0, skillDamage: 0, maxHit: 0, counters: 0, dmgTaken: 0, shieldBlocked: 0, overkillTaken: 0, healDone: 0, overHeal: 0, shieldApplied: 0, marks: 0, faints: 0, faintTick: null });
  const statOf = (u) => meter.units.get(u.instanceId) || blank(u);
  const allies = gameState.party.map((u) => {
    const r = statOf(u);
    return { ...r, maxHp: u.maxHp, finalHp: Math.max(0, u.hp), isDead: !!u.isDead, fainted: r.faints > 0, survivalTime: r.faintTick != null ? tickToSec(r.faintTick) : seconds };
  });
  const enemies = gameState.enemies.map((u) => {
    const r = statOf(u);
    return { instanceId: u.instanceId, id: u.id, name: u.name, maxHp: u.maxHp, finalHp: Math.max(0, u.hp), isDead: !!u.isDead, dmgTaken: r.dmgTaken, overkillTaken: r.overkillTaken, deaths: r.faints };
  });
  const kills = meter.kills.slice().sort((a, b) => a - b);
  const totalDamage = enemies.reduce((s, e) => s + e.dmgTaken, 0);   // 적이 받은 총 피해(모든 적 합 = 아군 throughput)
  const totalHealing = allies.reduce((s, a) => s + a.healDone, 0);
  const totalShieldAbsorbed = allies.reduce((s, a) => s + a.shieldBlocked, 0);
  const totalDamageTaken = allies.reduce((s, a) => s + a.dmgTaken, 0);
  const remainingHp = allies.reduce((s, a) => s + a.finalHp, 0);
  const maxHpTotal = allies.reduce((s, a) => s + a.maxHp, 0);
  const faintCount = allies.filter((a) => a.isDead).length;
  return {
    seconds, ticks, sustained: ctx.sustained, allies, enemies, kills,
    targetsHit: enemies.filter((e) => e.dmgTaken > 0).length,
    killCount: kills.length, firstKillTime: kills.length ? tickToSec(kills[0]) : null,
    overkillLoss: enemies.reduce((s, e) => s + e.overkillTaken, 0),
    totalDamage, dps: seconds > 0 ? totalDamage / seconds : 0,
    totalHealing, totalShieldAbsorbed, totalDamageTaken,
    remainingHp, maxHpTotal, remainingHpRatio: maxHpTotal ? remainingHp / maxHpTotal : 0,
    faintCount, survivorCount: allies.length - faintCount,
    result: ctx.sustained ? null : (ctx.enemiesDeadFinal ? "clear" : ctx.heroesDeadFinal ? "wipe" : "timeout"),
    clearTime: ctx.clearTick != null ? tickToSec(ctx.clearTick) : null,
  };
}

/* =========================================================
   Auto Run Report 01 — 헤드리스 풀-런 구동 프리미티브
   런 전체(전투→보상→여정→합체/영입→보스)는 별도 Dev 모듈(src/dev/autoRunReport.js)의
   정책/상태머신이 본게임 flow 함수(applyReward/chooseRoute/applyFusion/confirmRecruit…)를
   그대로 호출해 진행한다 — 런 규칙을 복제하지 않는다. battle.js는 "현재 전투를 동기로 끝까지
   돌리는" 한 가지 프리미티브만 추가로 노출한다(setHeadlessRun으로 타이머/전환을 헤드리스화).
   ========================================================= */

// 현재 진행 중인 전투(screen="battle", isRunning=true)를 동기로 끝까지 구동한다.
//   headlessRun이면 battleTick은 타이머 없이 이 루프에서만 돈다. 종료 시 scheduleFinish가
//   즉시 applyFinish를 호출해 다음 화면(보상/여정/결과)으로 전환된다(stopBattle이 isRunning=false).
//   반환: true=정상 종료, false=maxTicks 초과(교착 방어 — 호출부가 런을 중단 처리).
export function runHeadlessBattle(maxTicks = 6000) {
  let n = 0;
  while (gameState.battle.isRunning && n < maxTicks) {
    battleTick();
    n += 1;
  }
  return n < maxTicks;
}

// Runtime Parity Hotfix 02 — Dev-only FX 관측 harness.
//   rAF 기반 전투 루프가 멈추는 hidden-tab/headless 환경에서 "실제 본게임 스킬 처리 경로"의 render FX를 관측하기 위해,
//   현재 진행 중인 전투(window.signalDev.testParty로 구성)를 수동으로 N틱 진행한다.
//   ★stepCombat(본게임 전투 1틱)을 그대로 호출 — 전투 로직/피해/회복/타깃/게이지/storage/event 전부 무변경.
//   관측이 끊기지 않게 죽은 유닛은 매 틱 되살린다(dev 전용·state 저장 안 함·sim용 reviveForSim 재사용).
//   main game flow에 미노출(signalDev에 안 붙임) — dev preview/콘솔에서 import로만 호출하는 검증 도구.
export function devFxStep(n = 60, revive = true) {
  const count = Math.max(1, n | 0);
  for (let i = 0; i < count; i++) {
    stepCombat();
    if (revive) { gameState.party.forEach(reviveForSim); gameState.enemies.forEach(reviveForSim); }
  }
  renderGame(gameState);
  return { party: gameState.party.map((u) => u.instanceId), enemies: gameState.enemies.map((u) => u.instanceId) };
}

// Stealth Foundation 01 — Dev-only 검증 helper(★main gameplay 미노출·storage 무관·상태만 조작).
//   instanceId로 hidden 부여/해제/조회 + 타깃 필터 계약 확인. dev preview/콘솔에서 import로만 호출.
export function devStealth(cmd, instanceId, turns) {
  const all = [...gameState.party, ...gameState.enemies];
  const u = instanceId ? all.find((x) => x.instanceId === instanceId) : null;
  switch (cmd) {
    case "apply":   { const ok = applyHidden(u, turns || 2, "dev"); renderGame(gameState); return ok; }
    case "clear":   { const ok = clearHidden(u, "dev"); renderGame(gameState); return ok; }
    case "isHidden": return isHidden(u);
    case "list":    return all.filter(isHidden).map((x) => x.instanceId);           // 현재 은신 중인 유닛 목록
    case "reveal":  return shouldRevealOnAction(u, "attack");                         // 공격 시 reveal 후보인지
    // 적이 아군(party)을 공격할 때 고를 타깃 — hidden 제외 계약/all-hidden fallback 검증용.
    case "pickPartyTarget": { const t = selectAttackTarget(gameState.party); return t ? t.instanceId : null; }
    default: return null;
  }
}
