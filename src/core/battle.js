import { gameState } from "./state.js";
import { createInitialParty, createPreviewEnemies, createStageEnemies, createRouteEnemies, createLayoutPreviewEnemies, SLOT_ORDER, DEFAULT_FORMATION } from "./state.js";
import { FUSION_RECIPES, BASE_JOBS, prefersFront, slotPreference, availableFusions, combatRoleOf } from "../data/jobs.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { STAGE_CLEAR_EVENTS } from "../data/stages.js";
import { ROUTE_TYPES, rollRouteOffer, bossFury, bossReadinessPressure, bossMenace, alertnessFromFusions, depthSpeedFactor, routeReward } from "../data/routes.js";
import { REWARDS, rewardById, REWARD_MAX_LEVEL } from "../data/rewards.js";
import { renderGame, playActionFx, playStatusTickFx, playSupportFx, playStatusApplyFx, playActorFx, clearFxLayer } from "../ui/render.js";
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
  clearFxLayer(); // Monster Identity 02 — 이전 전투의 잔여 FX 정리(누적 방지)
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
  gameState.run.deepForestCount = 0;         // Deep Forest Reward Rebuild 01 — 깊은 수풀 보상 단계 초기화
  gameState.run.recruitPower = 0;            // Deep Forest Reward Rebuild 01 — 깊은 수풀 영입(경계도 가산) 초기화
  gameState.run.partyHp = null;              // Stage Persistence 01 — 전투 간 HP 지속 초기화(첫 전투는 풀피)

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

// Diversification 02 — 일반 전투 보상 3택을 굴려 고정(재렌더에도 유지). MAX 제외 + 중복 없이 추출.
//   범용(공세/생존/균형/회복)이 항상 대상 적격이라, 이들이 모두 MAX되기 전엔 3개가 안정적으로 유지된다.
//   MAX 다수로 적격이 3 미만인 극단 상황에선 가능한 만큼만 제시(보고). MAX 보상을 다시 넣는 fallback은 하지 않음.
function rollRewardOffer() {
  const eligible = REWARDS.filter(rewardEligible);
  gameState.run.rewardOffer = shuffle(eligible).slice(0, 3).map((r) => r.id);
}

export function applyReward(id) {
  const reward = rewardById(id);
  if (!reward) return;
  // 현재 제시된 3택에 없는 id는 무시(재렌더/중복 클릭 방어).
  if (!(gameState.run.rewardOffer || []).includes(id)) return;

  applyTrainingReward(reward);

  const lv = gameState.run.rewardLevels;
  lv[id] = (lv[id] || 0) + 1;
  gameState.logs = [`보상: ${reward.name} Lv.${lv[id]} — 다음 전투부터 적용`];

  // Reward Pressure 01 — 다회 성장 선택(정예=2회). 남은 픽이 있으면 새 3택을 굴려 보상 화면 유지.
  gameState.run.rewardPicks = (gameState.run.rewardPicks || 1) - 1;
  if (gameState.run.rewardPicks > 0) {
    rollRewardOffer();
    gameState.screen = "reward";
    renderGame(gameState);
    return;
  }
  gameState.run.rewardOffer = null;

  // Run Reward Training 01 — 일반 전투 보상 후 라우팅은 합체만(스테이지 기반 자동 "영입"은 제거).
  //   신규 영웅 영입은 깊은 수풀 보상(giveDeepForestReward)과 합체 후 보충(continueAfterFusion)에서만 발생한다.
  //   Sage Branch Gate 01 — 합체 진입은 파티 4인 + 레시피 존재일 때만.
  const ev = STAGE_CLEAR_EVENTS[gameState.run.stage];
  const canFuse = canEnterFusion();

  // 깊은 수풀(danger) 클리어 = 합체 기회 보장(후보 있을 때만 — 억지 진입/강제 합체 아님, 스킵 가능).
  if (gameState.run.currentRouteType === "danger" && canFuse) {
    gameState.screen = "fusion";
    renderGame(gameState);
    return;
  }
  // 기존 스테이지 합체 이벤트(S3/S8) — 빈 합체 화면 방지를 위해 후보 있을 때만.
  if (ev && ev.type === "fusion" && canFuse) {
    gameState.screen = "fusion";
    renderGame(gameState);
    return;
  }
  // 깊은 수풀이었지만 합체 후보가 없으면 짧은 안내 후 다음 여정으로(억지 합체 화면 X).
  if (gameState.run.currentRouteType === "danger" && !canFuse) {
    pushLog("깊은 수풀을 헤쳤지만 아직 합체할 조합이 없습니다.");
  }

  proceedNextStage();
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
  gameState.run.routeChoices = rollRouteOffer({
    depth: gameState.run.depth,
    bossKeys: gameState.run.bossKeys,
    // Deep Forest Reward Rebuild 01 — 줄 보상(영입/합체)이 있을 때만 깊은 수풀 노출.
    canDeepForest: deepForestRewardType() !== null,
    // Sage Branch Gate 01 — 현자의 가지(정예)는 경계도 4 이상에서만 등장(0~3은 일반/쉼터/깊은 수풀).
    alertness: gameState.run.alertness || 0,
  });
  gameState.screen = "route";
  renderGame(gameState);
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
    // Reward Pressure 01 — 휴식은 회복만, 성장/합체 보상 없음(안정 선택). 고른 길의 성격을 로그로 남긴다.
    pushLog("이슬 쉼터에서 한 박자 정비했다 — 휴식으로 회복(보상 없음).");
    // Rest Route Polish 01 — 곧장 넘어가지 않고 짧은 휴식 장면을 보여준 뒤 여정으로 잇는다.
    gameState.screen = "rest";
    renderGame(gameState);
    return;
  }

  // 위험/정예는 위험도(읽힘용) 상승. 보스/일반은 변동 없음.
  if (routeType === "danger") gameState.run.threat += 2;
  else if (routeType === "elite") gameState.run.threat += 1;

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
  enterRecruit();
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
    // Deep Forest Reward Rebuild 01 — 깊은 수풀 동료 영입도 경계도 상승(강해진 만큼 숲이 대비). 기존 수치 재사용.
    if (gameState.run.recruitContext === "deepforest") {
      gameState.run.recruitPower = (gameState.run.recruitPower || 0) + 1;
      gameState.run.alertness = alertnessFromFusions((gameState.run.fusionCount || 0) + gameState.run.recruitPower);
      gameState.logs.push(`경계도 ${gameState.run.alertness} — 새 동료로 강해진 파티에 숲이 대비한다.`);
    }
  }
  gameState.run.recruitOffer = null;
  gameState.run.recruitPreview = null;
  gameState.run.recruitSlot = null;
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

function battleTick() {
  gameState.battle.tick += 1;

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
  target.tauntedBy = caster.instanceId;
  applyStatus(target, { type: "taunted", duration: STATUS_MAX_TURNS });
  pushLog(`${caster.name}${josa(caster.name, "이가")} ${target.name}${josa(target.name, "을를")} 도발했다.`);
  playActionFx({
    sourceInstanceId: caster.instanceId, sourceUnitId: caster.id, targetInstanceId: target.instanceId,
    lineType: "taunt", kind: "taunt", isHeal: false, amount: 0,
    shoutText: "도발!", shoutKind: "taunt", shoutTier: "skill",
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
  // Monster Identity 02 — "멀리서 쏜다": 선과 함께 작은 투사체가 날아간다(보조 감각).
  if (t) { playActorFx("projectile", unit.instanceId, { targetId: t.instanceId }); performAttack(unit, t, { mult: 0.9, lineType: "ranged" }); }
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

  const isParty = gameState.party.includes(unit);

  // Batch 01A — 파수궁 반격 재충전: 파수궁이 자신의 일반 행동을 수행하는 이번 턴에 반격 가능 상태를 회복한다.
  //   (반격 자체는 performAttack 직접 호출이라 이 경로를 타지 않으므로 스스로 재충전되지 않는다.)
  if (isParty && unit.id === "watchbow") unit.counterReady = true;
  // Second Class Batch 1A — 검성 간파 반격도 같은 패턴: 일반 행동 1회 사이 1번만(이번 행동에 재충전).
  if (isParty && unit.id === "swordsaint") unit.duelCounterReady = true;

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
        const foe = selectAttackTarget(enemies);
        if (foe) { applyTaunt(unit, foe); return true; }
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
}
function healUnit(unit, amount) {
  const before = unit.hp;
  // Run Reward Diversification 02 — 실제 회복(amount>0)일 때 대상의 "받는 치유량" 보너스를 가산(공통 싱크).
  //   회복 0/연출용 호출엔 가산하지 않음. 최대 HP 초과는 기존대로 제한. 쉼터/HP 보정은 healUnit을 안 거쳐 무영향.
  const recv = amount > 0 ? (unit.healReceivedBonus || 0) : 0;
  unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, amount) + recv);
  return unit.hp - before;
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
      });
      pushLog(`${unit.name}${josa(unit.name, "이가")} ${targets.map((t) => t.name).join(", ")}${josa(targets[targets.length - 1].name, "을를")} 중독시켰다.`);
      return true;
    }
    case "strikeHealShield": { // 성기사 성휘
      const t = selectAttackTarget(aliveEnemies());
      if (!t) return false;
      performAttack(unit, t, { mult: L.mult, skill: meta });
      const selfHealed = healUnit(unit, L.selfHeal);
      const ally = lowestRatioAllyAny();
      if (ally) grantShieldTo(unit, ally, L.allyShield);
      playSupportFx({
        casterInstanceId: unit.instanceId, text: null, kind: meta.kind,
        heals: selfHealed > 0 ? [{ targetInstanceId: unit.instanceId, amount: selfHealed }] : [],
        guardInstanceId: ally ? ally.instanceId : null,
      });
      return true;
    }
    case "aoeStrike": { // 선봉 진군 — Batch 01B: 전열 적 전체 낮은 피해 + 전열 아군 방어 증가(회복 제거).
      const targets = L.scope === "front" ? frontEnemies() : aliveEnemies();
      if (targets.length === 0) return false;
      // 전열 적 전체에 낮은 피해(mult는 데이터 유지 — 수치 조정 아님).
      targets.forEach((t, i) =>
        performAttack(unit, t, { mult: L.mult, skill: i === 0 ? meta : undefined, noShout: i !== 0 })
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
      unit.bondOffenseTarget = t.isDead ? null : t.instanceId;
      if (!t.isDead) applyStatus(t, { type: "mark", duration: 1 });
      return true;
    }
    case "bondDefense": { // 성벽 선의 결속 — 최저 아군에 결속(그 아군 피격 시 50/50 분담: applyDamage)
      const others = aliveParty().filter((a) => a !== unit && a.hp < a.maxHp);
      const ally = others.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (!ally) return false;
      ally.protectedBy = unit.instanceId; // 그 아군이 받는 피해의 50%를 성벽이 대신
      grantShieldTo(unit, ally, L.shield);
      applyStatus(ally, { type: "mark", duration: 1 });
      playSupportFx({ casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind, guardInstanceId: ally.instanceId });
      return true;
    }
    case "snipeHeal": { // 치유궁 치유사격
      const t = selectArcherTarget(aliveEnemies());
      if (!t) return false;
      performAttack(unit, t, { mult: L.mult, lineType: "ranged", skill: meta });
      const ally = lowestRatioAllyHurt(0.95);
      if (ally) {
        const amt = healUnit(ally, Math.round(unit.atk * L.healFactor));
        if (amt > 0) playSupportFx({ casterInstanceId: unit.instanceId, text: null, kind: "heal", heals: [{ targetInstanceId: ally.instanceId, amount: amt }] });
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
          shuffle(pool).slice(0, L.allyHaste.count).forEach((a) => { a.actionGauge += 100 * L.allyHaste.pct; });
        }
        return true;
      }
      unit.charging = false;
      const targets = aliveEnemies();
      targets.forEach((t, i) =>
        performAttack(unit, t, { mult: L.mult, lineType: "ranged", skill: i === 0 ? { name: L.releaseName, kind: meta.kind } : undefined, noShout: i !== 0 })
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
        playSupportFx({ casterInstanceId: unit.instanceId, text: "리듬!", kind: meta.kind, guardInstanceId: targets[0] ? targets[0].instanceId : null });
      } else {
        // 템포 — 생존 적 최대 2명에 해로운 효과(speedDown 또는 게이지 -25, 대상별 랜덤). 기존 효과/수치 그대로(대상 수만 1→2).
        const targets = shuffle(enemies).slice(0, 2);
        targets.forEach((t, i) => {
          if (Math.random() < 0.5) applyCombatStatus(t, "speedDown");
          else t.actionGauge = Math.max(0, (t.actionGauge || 0) - BARD_GAUGE_DROP);
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
      if (L.alsoStrike) {
        const t = selectAttackTarget(aliveEnemies());
        if (t) performAttack(unit, t, { noShout: true });
      }
      playSupportFx({ casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind, guardInstanceId: unit.instanceId });
      return true;
    }
    case "aim": { // 추적자 조준 → 추격 (2행동)
      if (!unit.aimTarget) {
        const t = highHpEnemy();
        if (!t) return false;
        unit.aimTarget = t.instanceId;
        unit.aimFullHp = t.hp >= t.maxHp;
        applyStatus(t, { type: "mark", duration: 2 });
        skillShout(unit, meta.name + "!", meta.kind);
        pushLog(`${unit.name}${josa(unit.name, "이가")} ${t.name}${josa(t.name, "을를")} 조준했다.`);
        return true;
      }
      const t = aliveEnemies().find((e) => e.instanceId === unit.aimTarget);
      unit.aimTarget = null;
      if (!t) return false; // 이미 처치됨 → 기본 공격
      const mult = L.mult + (unit.aimFullHp ? L.fullHpBonus : 0);
      // Hero Readability Polish 01B — 표식 대상 추격임을 로그에 짧게 드러낸다(chase 플래그, 표시 전용). 피해/수치 불변.
      performAttack(unit, t, { mult, lineType: "ranged", skill: { name: L.releaseName, kind: meta.kind }, chase: true });
      return true;
    }
    case "pierce": { // 용창 관통 (전열 + 후열, 처치 시 1회 추가 — 무한 방지)
      const target = frontEnemies()[0] || aliveEnemies()[0];
      if (!target) return false;
      performAttack(unit, target, { mult: L.mult, skill: meta });
      const back = aliveEnemies().filter((e) => e.role !== "front" && e !== target);
      if (back.length) {
        performAttack(unit, back[0], { mult: L.mult * 0.7, lineType: "ranged", noShout: true });
        if (back[0].isDead) {
          const more = aliveEnemies().filter((e) => e.role !== "front");
          if (more.length) performAttack(unit, more[0], { mult: L.mult * 0.7, lineType: "ranged", noShout: true });
        }
      }
      return true;
    }
    case "sanctuary": { // 성황 — 도발 보유 + (저체력 아군 시) 1회 파티 피해 무효
      if (!hasStatus(unit, "taunt")) applyStatus(unit, { type: "taunt", duration: 1 });
      const allies = aliveParty();
      const lowExists = allies.some((a) => a.hp / a.maxHp < L.allyHpThreshold);
      if (lowExists && !unit.sanctUsed) {
        unit.sanctUsed = true;
        allies.forEach((a) => { a.damageImmune = true; });
        playSupportFx({
          casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind,
          heals: allies.map((a) => ({ targetInstanceId: a.instanceId, amount: 0 })),
        });
        pushLog(`${unit.name}${josa(unit.name, "이가")} 성역을 펼쳤다. 파티 피해 1회 무효.`);
        return true;
      }
      return false; // 성역 미발동 — 도발만 갱신하고 기본 공격
    }
    case "duel": { // 검성(SR-25) — 결투 표식 우선타격 + (HP35%↓) 마무리 일섬. 반격은 triggerSwordsaintCounter.
      let dt = aliveEnemies().find((e) => e.instanceId === unit.duelTarget);
      const fresh = !dt;
      if (fresh) {
        dt = selectDuelTarget(); // 보스>정예>고ATK>저HP
        if (!dt) return false;
        unit.duelTarget = dt.instanceId;
        pushLog(`${unit.name}${josa(unit.name, "이가")} ${dt.name}에게 결투를 건다.`);
      }
      applyStatus(dt, { type: "duel", duration: 3 }); // 결투 표식 — 검성 행동마다 갱신(읽힘 칩)
      const low = dt.hp / dt.maxHp <= (L.executeThreshold ?? 0.35);
      const sk = low ? { name: "일섬", kind: meta.kind } : meta; // meta.name="결투"
      performAttack(unit, dt, { mult: (L.mult ?? 1.1) * (low ? (L.executeMult ?? 1.4) : 1), skill: sk });
      if (low) pushLog(`${unit.name}${josa(unit.name, "이가")} 결투 상대를 베어낸다 — 일섬!`);
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
        pushLog(`${unit.name}${josa(unit.name, "이가")} ${mt.name}에게 하늘 표식을 새겼다.`);
      } else {
        applyStatus(mt, { type: "defDown", duration: 3, pct: L.dmgUpPct ?? 0.12 }); // 갱신(FX 없이)
      }
      applyStatus(mt, { type: "mark", duration: 3 }); // 표식 칩 유지(기존 mark 문법 재사용)
      performAttack(unit, mt, { mult: L.mult ?? 1.3, lineType: "ranged", skill: { name: fresh ? "하늘 표식" : "하늘사격", kind: meta.kind } });
      return true;
    }
    case "wardfield": { // 결계장(SR-30) — 진형 결계(보호막/완충) + 앵커 보강. 성황 무효와 분리(감소/완충만).
      if (!unit.wardOpened) {
        unit.wardOpened = true;
        const party = aliveParty();
        party.forEach((a) => grantShieldTo(unit, a, L.partyShield ?? 6));        // 전체 작은 보호막
        frontlineAllies().forEach((a) => grantShieldTo(unit, a, L.frontShield ?? 10)); // 전열 추가 보호막
        backlineAllies().forEach((a) => applyStatus(a, { type: "defUp", duration: L.backGuardTurns ?? 2, pct: L.backGuardPct ?? 0.15 })); // 후열 완충
        pushLog(`${unit.name}${josa(unit.name, "이가")} 진형 결계를 펼쳤다.`);
        playSupportFx({ casterInstanceId: unit.instanceId, text: meta.name + "!", kind: meta.kind, guardInstanceId: unit.instanceId, heals: party.map((a) => ({ targetInstanceId: a.instanceId, amount: 0 })) });
        return true;
      }
      if (unit.actionCount % 2 !== 0) return false; // 평소엔 기본 공격
      const cand = aliveParty().filter((a) => a !== unit);
      if (!cand.length) return false;
      const t = cand.sort((a, b) => (a.shield || 0) - (b.shield || 0) || a.hp / a.maxHp - b.hp / b.maxHp)[0]; // 보호막/HP 최저
      grantShieldTo(unit, t, frontlineAllies().includes(t) ? (L.frontShield ?? 10) : (L.partyShield ?? 6));
      pushLog(`${unit.name}${josa(unit.name, "이가")} 결계를 보강했다.`);
      playSupportFx({ casterInstanceId: unit.instanceId, text: "결계 보강!", kind: meta.kind, guardInstanceId: t.instanceId });
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

// Combat Grammar Polish 02 — 실제 피해 적용(raw): 성역 1회 무효 → shield 흡수 → 초과분 HP.
//   결속/반격 무한연쇄 차단을 위해 "분배된 피해"는 항상 이 raw 경로로만 적용된다(재분배 없음).
function dealRaw(target, dmg) {
  if (target.damageImmune) { // First Class Expansion 01: 성역(성황) 1회 피해 무효
    target.damageImmune = false;
    return;
  }
  let remaining = Math.max(0, dmg);
  const sh = target.shield || 0;
  if (sh > 0) {
    const absorbed = Math.min(sh, remaining);
    target.shield = sh - absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) target.hp -= remaining;
  // Dev Cheat Mode 01 — Immortal: 아군 영웅은 dev immortal일 때 최소 HP 1 유지(모든 피해 경로의 공통 싱크).
  //   적/몬스터엔 미적용(정상 사망). 일반 모드(dev OFF)에선 분기 자체가 false라 동작 완전 동일.
  if (gameState.dev && gameState.dev.immortal && target.hp < 1 && gameState.party.includes(target)) {
    target.hp = 1;
  }
}

// Stage Persistence 01 — 전투 무력화 표시 + 로그. 표현만 분기(전투 판정/타겟/패배 조건은 불변).
//   영웅: HP 0 = "기절"(승리 시 다음 전투에서 HP 1로 복귀). 몬스터: 기존처럼 "쓰러짐/처치".
function markFallen(unit) {
  unit.hp = 0;
  unit.isDead = true;
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
  if (target.bondOffenseTarget) {
    const partner = gameState.enemies.find((e) => e.instanceId === target.bondOffenseTarget && !e.isDead);
    if (partner) {
      dealRaw(target, dmg * 0.6);
      dealRaw(partner, dmg * 0.4);
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

function selectAttackTarget(pool) {
  const alive = pool.filter((u) => !u.isDead);
  // First Class Expansion 01: 도발(taunt) 대상이 있으면 우선 공격(수문장/성황). 적은 taunt를 안 가짐.
  const taunting = alive.filter((u) => hasStatus(u, "taunt"));
  if (taunting.length > 0) return taunting[0];
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
  // First Class Expansion 01: atkDown(워든 습격) — 공격자의 공격력 일시 감소.
  let atk = attacker.atk;
  const ad = Array.isArray(attacker.statuses) && attacker.statuses.find((s) => s.type === "atkDown");
  if (ad) atk = Math.max(1, Math.round(atk * (1 - (ad.pct || 0))));
  // Monster Identity 01 — atkUp(숲올빼미 지휘): 공격력 일시 증가(적 전용 버프). 영웅엔 부여되지 않음.
  const au = Array.isArray(attacker.statuses) && attacker.statuses.find((s) => s.type === "atkUp");
  if (au) atk = Math.round(atk * (1 + (au.pct || 0)));

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
    sourceInstanceId: attacker.instanceId,
    sourceUnitId: attacker.id,
    targetInstanceId: target.instanceId,
    lineType: line,
    kind: actionKindOf(attacker, attacker.team === "party"),
    isHeal: false,
    amount: damage,
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
    triggerWatchbowCounter(attacker);
  }

  // Second Class Batch 1A — 검성 간파 반격: 결투 표식 대상이 검성/전열 아군을 실제 타격하면 1회 반격.
  //   isCounter면 발동 안 함(반격의 반격 금지 → 무한 연쇄 차단). 파수궁과 독립(둘 다 isCounter 가드).
  if (!opts.isCounter && tookRealDamage && attacker.team === "enemy" && gameState.party.includes(target)) {
    triggerSwordsaintCounter(attacker, target);
  }
}

// Second Class Batch 1A — 검성 간파: 결투 대상(적)이 검성 또는 전열 아군을 타격하면 즉시 1회 반격.
//   - 결투 대상에 한정(enemyAttacker.instanceId === 검성.duelTarget).
//   - 피해는 검성 ATK의 counterMult(0.7, 60~80% 범위). 게이지/일반 행동 미소모(직접 performAttack).
//   - 일반 행동 1회 사이 최대 1번: duelCounterReady가 false면 발동 안 함. 검성 일반 행동 시 재충전.
function triggerSwordsaintCounter(enemyAttacker, victim) {
  if (!enemyAttacker || enemyAttacker.isDead) return;
  const ss = gameState.party.find((u) => !u.isDead && u.id === "swordsaint");
  if (!ss) return;
  if (ss.duelCounterReady === false) return;          // 이번 행동 주기엔 이미 반격함
  if (enemyAttacker.instanceId !== ss.duelTarget) return; // 결투 대상만 반격
  if (!(victim === ss || victim.role === "front")) return; // 검성 또는 전열 아군 피격에만
  const mult = skillOf("swordsaint")?.logic?.counterMult ?? 0.7;
  ss.duelCounterReady = false;
  pushLog(`${ss.name} 간파!`);
  performAttack(ss, enemyAttacker, { mult, skill: { name: "간파", kind: "attack" }, isCounter: true });
}

// 후열 아군 피격 → 파수궁 보복. Batch 01A 공식 정렬:
//   - 피해량은 파수궁 ATK의 50%(mult 0.5, 최소 1 보장은 performAttack의 Math.max(1,…)).
//   - 게이지/일반 행동을 소모하지 않는다(여기서 직접 performAttack 호출 — performAction을 거치지 않음).
//   - 일반 행동 1회 사이 최대 1번: counterReady가 false면 발동하지 않는다(초기 undefined=충전됨으로 간주).
//   - 발동하면 counterReady=false로 소진. 재충전은 파수궁이 일반 행동(performAction)을 수행할 때.
function triggerWatchbowCounter(enemyAttacker) {
  if (!enemyAttacker || enemyAttacker.isDead) return;
  const watchbow = gameState.party.find((u) => !u.isDead && u.id === "watchbow");
  if (!watchbow) return;
  if (watchbow.counterReady === false) return; // 이번 일반 행동 주기엔 이미 1회 보복함
  watchbow.counterReady = false;
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
    // Run Structure 01A: 정예 전투 승리 시 보스 열쇠 획득(보스문이 다음 여정 선택지로 열린다).
    if (gameState.run.currentRouteType === "elite") {
      gameState.run.bossKeys += 1;
      // Boss Readiness Pressure 02 — 첫 열쇠=보스문 개방 / 둘째 열쇠=사자왕 위압 해제. 단계별 체감 로그.
      const keys = gameState.run.bossKeys;
      if (keys === 1) pushLog("보스 열쇠를 얻었다 — 새싹 왕의 문이 열린다.");
      else if (keys === 2) pushLog("두 번째 열쇠가 사자왕의 위압을 걷어냈다. 정예의 시험을 모두 넘었다.");
      else pushLog(`정예를 물리쳤다 — 보스 열쇠 +1 (보유 ${keys}).`);
    }
    // Deep Forest Reward Rebuild 01 — 깊은 수풀(danger)은 스탯 보상 화면을 건너뛰고 동료영입/합체 보상 루트로.
    if (gameState.run.currentRouteType === "danger") {
      gameState.run.result = "victory";
      pushLog(`심도 ${gameState.run.depth} 클리어! 깊은 수풀의 보상.`);
      giveDeepForestReward(); // 화면 전환·렌더는 여기서 담당
      return;
    }
    // Reward Pressure 01 — 길 프로필에 따라 성장 선택 횟수 차등(일반1 / 정예2). 보상 화면이 이 값으로 다회 선택.
    gameState.run.rewardPicks = Math.max(1, routeReward(gameState.run.currentRouteType).picks || 1);
    gameState.run.result = "victory";
    rollRewardOffer(); // Run Reward Training 01 — 보상 진입 시 3택을 한 번 굴려 고정
    gameState.screen = "reward"; // Game Flow 01: 클리어 → 보상 선택 화면
    pushLog(`심도 ${gameState.run.depth} 클리어! 보상을 선택하세요.`);
  } else if (outcome === "clear") {
    gameState.run.result = "clear";
    pushLog("새싹숲 사자왕 격파 — 런 클리어! ▶ 다시 시작");
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
