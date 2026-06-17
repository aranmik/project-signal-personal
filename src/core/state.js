import { UNIT_TEMPLATES } from "../data/units.js";
import { stagePlan } from "../data/stages.js";
import { combatRoleOf } from "../data/jobs.js"; // Run Reward Training 01 — 역할 기반 훈련 대상 필터
import {
  ELITE_POOL, BOSS_ENCOUNTER,
  depthScale, bossFury, bossReadinessPressure, bossMenace, normalFormation, eliteEscort, ROLE_ACTOR, FRONT_ROLES,
} from "../data/routes.js";

// Boss Early Challenge Pressure 01 — 현재 배치(formation)의 채워진 슬롯 수 = 파티 인원.
//   파티는 매 전투 formation에서 재구성되므로 formation이 인원의 단일 출처(전투 중 변동 없음).
export function partySizeOf(run) {
  const f = (run && run.formation) || {};
  return SLOT_ORDER.filter((k) => f[k]).length;
}

function createUnit(template, instanceId, bonuses = { atk: 0, maxHp: 0 }) {
  const maxHp = template.maxHp + bonuses.maxHp;
  return {
    ...template,
    instanceId,
    atk: template.atk + bonuses.atk,
    maxHp,
    hp: maxHp,
    // Run Reward Diversification 02 — "받는 치유량" 보너스(회복/균형 훈련, 전역 healRecv). 치유 시 healUnit이 가산.
    healReceivedBonus: bonuses.healRecv || 0,
    actionGauge: 0,
    isDead: false,
    // Status & Effect Foundation 01: 실제 상태 데이터({ type, duration } 배열).
    //   duration은 "그 유닛의 행동 횟수" 기준(배속 영향 없음). statusMarkers(표시 전용)와 분리.
    statuses: [],
    // Combat Grammar Polish 02 — 보호막(numeric). 피해는 shield를 먼저 깎고 초과분만 HP에.
    //   maxHp와 별개(초과 가능). HP바 파랑 덮개 비율 = min(shield/maxHp, 1).
    shield: 0,
  };
}

// Game Flow 01 → Fusion Flow Foundation 01: 배치(formation) 기반 파티 구성.
//   formation = { f0, f1, b0, b1 } (전열2/후열2), 값은 jobId 또는 null(빈 슬롯).
//   유닛은 slotKey(전장 위치)와 role(front/back — 타겟 우선순위)을 슬롯에서 받는다.
//   instanceId는 직업당 안정(reconcile 키). 프리뷰/구버전 호출은 기본 4인 배치 사용.
export const SLOT_ORDER = ["f0", "f1", "b0", "b1"];
export const SLOT_NAMES = { f0: "전열 1", f1: "전열 2", b0: "후열 1", b1: "후열 2" };
export const DEFAULT_FORMATION = { f0: "warrior", f1: "guardian", b0: "archer", b1: "priest" };

// Run Reward Training 01 — 대상 필터 성장(전열/후열/역할) 적용. 전역(all/heal)은 bonuses가 담당하고,
//   여기서는 유닛의 배치(front/back)·combatRole(tank/melee/ranged/support/healer)에 맞는
//   training 버킷의 atk/maxHp만 추가 가산한다. training 버킷이 없거나 combatRole이 없으면 안전히 건너뛴다.
function applyTargetedGrowth(u, jobId, row, training) {
  if (!training) return;
  const role = combatRoleOf(jobId); // 2차 씨앗 등 매핑 없으면 null → 역할 훈련 대상에서 제외
  let addAtk = 0, addHp = 0;
  [row, role].forEach((bucket) => {
    const t = bucket && training[bucket];
    if (t) { addAtk += t.atk || 0; addHp += t.maxHp || 0; }
  });
  if (addHp) { u.maxHp += addHp; u.hp = u.maxHp; }
  if (addAtk) u.atk += addAtk;
}

export function createInitialParty(bonuses = { atk: 0, maxHp: 0 }, formation = DEFAULT_FORMATION, training = null) {
  const party = [];
  SLOT_ORDER.forEach((slot) => {
    const jobId = formation[slot];
    if (!jobId) return;
    const u = createUnit(UNIT_TEMPLATES.party[jobId], `hero-${jobId}-1`, bonuses);
    u.jobId = jobId; // Stage Persistence 01 — 전투 간 HP 지속을 직업 기준으로 매칭(재배치/슬롯 이동에 안전)
    u.slotKey = slot;
    u.role = slot.startsWith("f") ? "front" : "back"; // 배치가 전열/후열을 결정
    applyTargetedGrowth(u, jobId, u.role, training); // Run Reward Training 01 — 배치/역할 훈련 가산
    party.push(u);
  });
  return party;
}

export function createInitialEnemies() {
  return [
    createUnit(UNIT_TEMPLATES.enemies.slime, "enemy-slime-1"),
    createUnit(UNIT_TEMPLATES.enemies.goblin, "enemy-goblin-1"),
    createUnit(UNIT_TEMPLATES.enemies.wolf, "enemy-wolf-1"),
  ];
}

// Game Flow Foundation 01 — 스테이지 플랜 기반 적 생성.
//   "키" 일반 / "키:elite" 정예 / "키:boss" 보스. 정예/보스 수치는 프리뷰에서 검증된
//   임시값 재사용(밸런스 튜닝 아님). slot 배치·sizeClass·tier는 기존 프리뷰/Boss Presence
//   기반 그대로 — 새 표현 시스템 없음. instanceId는 스테이지별 유니크(잔존 상태 차단).
const RANK_OVERRIDES = {
  elite: { sizeClass: "mon-elite", tier: "elite", maxHp: 170, hp: 170, atk: 12, speed: 5 },
  boss:  { sizeClass: "mon-boss",  tier: "boss",  maxHp: 520, hp: 520, atk: 15, speed: 5 },
};
const RANK_PREFIX = { elite: "정예 ", boss: "보스 " };

// 적 명세 배열("키" / "키:elite" / "키:boss")을 유닛으로 빌드하는 공용 헬퍼.
//   instanceId는 prefix로 유니크하게(스테이지/여정 전환 간 잔존 상태 차단). 정예/보스 override는 동일.
//   opts.scale = 01B 심도 스케일({hp, atk} 배수), opts.slots = 진형 슬롯 배열(없으면 index).
function buildEnemies(specs, prefix, opts = {}) {
  const scale = opts.scale || { hp: 1, atk: 1 };
  const slots = opts.slots;
  return specs.map((spec, i) => {
    const [key, rank] = spec.split(":");
    const u = createUnit(UNIT_TEMPLATES.enemies[key], `${prefix}-${key}-${i}`);
    u.slot = slots ? (slots[i] ?? i) : (rank === "boss" ? "boss" : i);
    if (rank && RANK_OVERRIDES[rank]) {
      // Beginner Theme Actor 01: 고유명 정예/보스(keepName)는 "정예/보스 " 접두를 붙이지 않는다
      //   (HUD가 ELITE/BOSS 라벨을 따로 표시 — "정예 숲올빼미 현자" 같은 중복 방지). 수치만 override.
      const name = u.keepName ? u.name : RANK_PREFIX[rank] + u.name;
      Object.assign(u, RANK_OVERRIDES[rank], { name });
    }
    // Run Structure 01B — 심도 스케일. RANK_OVERRIDES(정예/보스 기본치) 적용 후 곱해야 정예/보스도 심도를 받는다.
    u.maxHp = Math.max(1, Math.round(u.maxHp * scale.hp));
    u.hp = u.maxHp;
    u.atk = Math.max(1, Math.round(u.atk * scale.atk));
    return u;
  });
}

// Battlefield Layout Rebuild 01 — 진형 슬롯을 화면 Y축으로 매핑(CSS .enemy-slot-{slot}).
//   전열(ef, 하단 밴드=영웅에 가까움)/후열(eb, 상단 밴드=깊은 숲). front 역할은 전열 슬롯부터, back 역할은
//   후열 슬롯부터 채우고 모자라면 반대 라인으로 흘려보낸다(전열6/후열6까지 지그재그). 정예핵심(ecf/ecb)·보스는 호출부 지정.
const FRONT_SLOTS = ["ef0", "ef1", "ef2", "ef3", "ef4", "ef5"];
const BACK_SLOTS = ["eb0", "eb1", "eb2", "eb3", "eb4", "eb5"];
function assignSlotsByFront(isFrontArr) {
  let fi = 0, bi = 0;
  return isFrontArr.map((isFront) =>
    isFront
      ? (FRONT_SLOTS[fi++] || BACK_SLOTS[bi++] || "ef5")
      : (BACK_SLOTS[bi++] || FRONT_SLOTS[fi++] || "eb5")
  );
}
function specIsFront(spec) {
  const [key] = spec.split(":");
  return UNIT_TEMPLATES.enemies[key]?.role === "front";
}

// Elite Escort Overlap Fix 01 — 정예 본체(ecf 전열중앙 / ecb 후열우측)와 호위 소형이 겹치지 않게
//   본체 박스를 피한 호위 슬롯 순서(390폭 실측 기준). z-index로 숨기지 않고 슬롯 자체를 분산한다.
//   - owl(후열 우측, ecb): 올빼미가 후열 우측을 통째로 차지하므로 후열 호위는 좌측(eb0,eb3)에 모은다.
//     390폭에선 올빼미 좌측과 우측 사이에 소형이 둘 들어갈 폭이 없어, 후열 소형을 모두 좌측에 둬서
//     올빼미 뒤에 묻히지 않게 한다(좌측 eb0/eb3은 기존 진형과 같은 지그재그 스태거).
//     전열(ef*)은 올빼미(상단)와 라인이 달라 안 겹치므로 기존 순서.
//   - deer(전열 중앙, ecf): 전열 호위는 양 옆(ef0,ef1)만 — 본체 바로 아래/중앙(ef2,ef5,ef3,ef4)은
//     서로/본체와 겹쳐 좌석이 부족하므로, 남는 전열 호위는 후열(상단)로 흘려 본체와 시각적 여백을 둔다.
const ELITE_FRONT_OWL = ["ef0", "ef1", "ef2", "ef3", "ef4"];
const ELITE_BACK_OWL  = ["eb0", "eb3", "eb2", "eb5", "eb4"]; // 후열 호위는 좌측에 모음(올빼미 우측 비움)
const ELITE_FRONT_DEER = ["ef0", "ef1"]; // 양 옆 2석만 — 나머지는 후열로 흘림
const ELITE_BACK_DEER  = ["eb0", "eb1", "eb2", "eb3", "eb4", "eb5"];
function assignEliteEscortSlots(isFrontArr, coreFront) {
  const fp = coreFront ? ELITE_FRONT_DEER : ELITE_FRONT_OWL;
  const bp = coreFront ? ELITE_BACK_DEER : ELITE_BACK_OWL;
  let fi = 0, bi = 0;
  return isFrontArr.map((isFront) =>
    isFront ? (fp[fi++] || bp[bi++] || "ef5") : (bp[bi++] || fp[fi++] || "eb5")
  );
}

export function createStageEnemies(stage) {
  const specs = stagePlan(stage).enemies;
  const slots = assignSlotsByFront(specs.map(specIsFront));
  return buildEnemies(specs, `st${stage}`, { slots });
}

// Run Structure 01A/01B — 길 선택이 인카운터를 만든다(createStageEnemies와 빌더 공유).
//   01B: 심도(run.depth)→HP/atk 스케일, 경계도(run.alertness)→진형 두께/조직.
//   normal/danger = 경계도 진형(역할→액터, danger는 한 단계 두껍게 + 소량 강화),
//   elite = 정예 본체(올빼미/사슴 번갈아)를 중앙 핵심에 두고 경계도 호위로 보호 진형,
//   boss = 사자왕(심도 fury 추가 강화). 정예/보스 본체 구성은 stages.js 재활용.
export function createRouteEnemies(routeType, run) {
  const depth = run.depth;
  const alertness = run.alertness || 0;
  const scale = depthScale(depth);
  const prefix = `d${depth}`;

  if (routeType === "boss") {
    const fury = bossFury(depth);
    // Boss Early Challenge Pressure 01 — 심도 분노(fury)와 별개로 "준비 부족" 보정을 보스에만 곱한다.
    //   빠른/얕은 도전을 막지 않되, 미완성 파티면 사자왕이 압도하도록(낮은 심도 보스의 약함을 보정).
    const ready = bossReadinessPressure({
      depth, bossKeys: run.bossKeys || 0, fusionCount: run.fusionCount || 0, partySize: partySizeOf(run),
    });
    // Boss Readiness Pressure 02 — Elite Key Seal: 열쇠 2개 미만이면 위압 활성(DR + 행동마다 atk 램프).
    //   스탯 압박(ready)/심도 분노(fury)와 별개 축 — 보스에만, 보스전에서만 건다.
    const menace = bossMenace(run.bossKeys || 0);
    const bscale = { hp: scale.hp * fury.hp * ready.hp, atk: scale.atk * fury.atk * ready.atk };
    const units = buildEnemies(BOSS_ENCOUNTER, prefix, { scale: bscale, slots: ["boss"] });
    units.forEach((u) => {
      if (fury.stage > 0) u.bossFury = fury.stage;
      if (ready.level > 0) u.bossReadiness = ready.level; // HUD/라벨 읽힘용
      if (menace.active) {
        // 위압 메타를 보스에 부여 — battle.js가 받는 피해 감소/행동 atk 램프에 사용.
        u.menace = { dr: menace.dr, atkStepPct: menace.atkStepPct, atkMaxStacks: menace.atkMaxStacks };
        u.menaceBaseAtk = u.atk; // 램프 기준 = 스케일 적용된 보스 atk
        u.menaceStacks = 0;
      }
    });
    return units;
  }

  if (routeType === "elite") {
    // 정예 본체(번갈아: 올빼미 → 사슴 …)는 role에 따라 전열중앙(ecf)/후열중앙(ecb)에 "주인공"으로 선다.
    //   호위 소형이 전열/후열로 둘러싸 보호 진형이 읽힌다 — 정예 오른쪽 끝 밀림 해결.
    const eliteSpec = ELITE_POOL[(run.bossKeys || 0) % ELITE_POOL.length][0];
    const escort = eliteEscort(alertness);
    const specs = [eliteSpec, ...escort.map((r) => ROLE_ACTOR[r])];
    // Elite Escort Overlap Fix 01 — 호위 소형이 정예 본체 뒤에 묻히지 않게 본체 박스를 피한 슬롯 배치.
    const coreFront = specIsFront(eliteSpec);
    const escortSlots = assignEliteEscortSlots(escort.map((r) => FRONT_ROLES.has(r)), coreFront);
    const slots = [coreFront ? "ecf" : "ecb", ...escortSlots];
    return buildEnemies(specs, prefix, { scale, slots });
  }

  // normal / danger — 경계도 진형. danger는 한 단계 두꺼운 진형 + 소량 강화(읽힘용).
  const formAlert = routeType === "danger" ? alertness + 1 : alertness;
  const roles = normalFormation(formAlert);
  const specs = roles.map((r) => ROLE_ACTOR[r]);
  const slots = assignSlotsByFront(roles.map((r) => FRONT_ROLES.has(r)));
  const dscale = routeType === "danger" ? { hp: scale.hp * 1.12, atk: scale.atk } : scale;
  const units = buildEnemies(specs, prefix, { scale: dscale, slots });
  if (routeType === "danger") units.forEach((u) => { u.atk += 1; });
  return units;
}

// Combat Breath Preview 01: 개발/프리뷰용 전투 장면.
//   정식 스테이지/밸런스/보상/몬스터 시스템 아님 — 현재 몬스터 데이터를 재사용해
//   수량/크기/HP만 조정한다. slot으로 배치, sizeClass로 정예/보스처럼 보이게.
export function createPreviewEnemies(kind) {
  const mk = (tmplKey, idx, over = {}) => {
    const u = createUnit(UNIT_TEMPLATES.enemies[tmplKey], `prev-${tmplKey}-${idx}`);
    return { ...u, slot: idx, ...over };
  };

  if (kind === "normal-max") {
    // 일반 몬스터를 화면 허용 최대 근사(6체)로 배치 → 다수전 과밀 확인
    return ["slime", "goblin", "wolf", "goblin", "slime", "wolf"].map((k, i) =>
      mk(k, i)
    );
  }

  if (kind === "elite-mix") {
    // 정예처럼 보이는 큰 몬스터 1~2 + 일반 혼합 (임시 — 크기/HP만).
    //   Boss Presence Foundation 01: tier="elite"로 존재감 레이어 hook(크기와 분리).
    return [
      mk("goblin", 0, { sizeClass: "mon-elite", tier: "elite", name: "정예 고블린", maxHp: 170, hp: 170, atk: 12, speed: 5 }),
      mk("wolf", 1, { sizeClass: "mon-elite", tier: "elite", name: "정예 늑대", maxHp: 140, hp: 140, atk: 13, speed: 7 }),
      mk("slime", 2),
      mk("slime", 3),
      mk("goblin", 4),
    ];
  }

  if (kind === "boss-solo") {
    // 보스처럼 보이는 큰 몬스터 1체 단독 (정식 보스 패턴/시스템 없음). tier="boss".
    return [
      mk("goblin", "boss", { sizeClass: "mon-boss", tier: "boss", name: "보스 고블린", maxHp: 520, hp: 520, atk: 15, speed: 5, statusMarkers: ["mark"] }),
    ];
  }

  // Combat Readability Foundation 01: 신호(Target/Status/Role) 확인용 프리뷰 장면.
  //   Status & Effect Foundation 01: poison/guard는 실제 상태(statuses)로 부여 — 마커는 파생.
  //   mark/buff는 아직 효과 미구현이라 statusMarkers(표시 전용)로만 올린다.
  if (kind === "signal") {
    return [
      mk("goblin", 0, { statusMarkers: ["mark"] }),
      mk("slime", 1, { statuses: [{ type: "poison", duration: 4 }] }),
      mk("wolf", 2, { statuses: [{ type: "poison", duration: 4 }], statusMarkers: ["mark"] }),
      mk("goblin", 3, { sizeClass: "mon-elite", tier: "elite", name: "정예 고블린", maxHp: 170, hp: 170, atk: 12, speed: 5, statuses: [{ type: "guard", duration: 4 }], statusMarkers: ["buff"] }),
    ];
  }

  return createInitialEnemies();
}

// Battlefield Preview & Layout Tune 01 — Dev 레이아웃 스트레스 테스트용 적 구성(시각 확인 전용).
//   전투 계산/밸런스와 무관 — 슬롯 배치만 본다. 실 슬롯 시스템(ef/eb/ecf/ecb/boss + boss-l/r)을 그대로 쓴다.
export const LAYOUT_PREVIEW_CASES = [
  { id: "boss-solo",   label: "보스 단독" },
  { id: "boss-duo",    label: "보스 2기" },
  { id: "elite-deer",  label: "정예 사슴 단독" },
  { id: "elite-owl",   label: "정예 올빼미 단독" },
  { id: "elite-deer-mob", label: "사슴 정예+소형" },
  { id: "elite-owl-mob",  label: "올빼미 정예+소형" },
  { id: "alert-1", label: "경계도 1" },
  { id: "alert-2", label: "경계도 2" },
  { id: "alert-3", label: "경계도 3" },
  { id: "alert-4", label: "경계도 4" },
  { id: "alert-5", label: "경계도 5" },
  { id: "alert-6", label: "경계도 6" },
  { id: "small-12", label: "소형 12종" },
];

export function createLayoutPreviewEnemies(caseId) {
  const run = { formation: { ...DEFAULT_FORMATION }, depth: 12, bossKeys: 2, alertness: 5, fusionCount: 2 };
  const m = caseId.match(/^alert-(\d+)$/);
  if (m) return createRouteEnemies("normal", { ...run, alertness: parseInt(m[1], 10) });

  switch (caseId) {
    case "boss-solo":
      return createRouteEnemies("boss", run);
    case "boss-duo": // 레이아웃 스트레스: 사자왕 둘을 좌/우 anchor에 (실제 콘텐츠 아님)
      return buildEnemies(["lion:boss", "lion:boss"], "prevBoss", { slots: ["boss-l", "boss-r"] });
    case "elite-deer":
      return buildEnemies(["deer:elite"], "prevElite", { slots: ["ecf"] });
    case "elite-owl":
      return buildEnemies(["owl:elite"], "prevElite", { slots: ["ecb"] });
    case "elite-deer-mob":
      return createRouteEnemies("elite", { ...run, bossKeys: 1 }); // 사슴 코어 + 호위 소형
    case "elite-owl-mob":
      return createRouteEnemies("elite", { ...run, bossKeys: 0 }); // 올빼미 코어 + 호위 소형
    case "small-12": { // 전열 6 + 후열 6 (지그재그 슬롯 겹침 스트레스 테스트)
      const frontSpecs = ["bear", "fox", "bear", "fox", "bear", "fox"];
      const backSpecs = ["bird", "dewslime", "lamb", "bird", "dewslime", "lamb"];
      const front = buildEnemies(frontSpecs, "prevF", { slots: ["ef0", "ef1", "ef2", "ef3", "ef4", "ef5"] });
      const back = buildEnemies(backSpecs, "prevB", { slots: ["eb0", "eb1", "eb2", "eb3", "eb4", "eb5"] });
      return [...front, ...back];
    }
    default:
      return createRouteEnemies("normal", { ...run, alertness: 5 });
  }
}

// Dev Cheat Mode 01 — URL 플래그로만 켜지는 개발자 테스트 옵션(기본 OFF). 일반 Pages 접속엔 영향 없음.
//   immortal: ?dev=1&immortal=1 일 때만 true. 아군이 죽지 않아 합체/1차/시인성/보상 흐름 테스트 접근성 확보.
//   밸런스/수치/몬스터/보상/심도 스케일은 일절 변경하지 않음 — 아군 HP 최소 1 클램프(dealRaw)만 추가된다.
function readDevFlags() {
  try {
    const p = new URLSearchParams((typeof location !== "undefined" && location.search) || "");
    return { immortal: p.get("dev") === "1" && p.get("immortal") === "1" };
  } catch (e) {
    return { immortal: false };
  }
}

export const gameState = {
  project: {
    id: "SIGNAL_PERSONAL",
    version: "v0.1-phase7",
  },

  // Dev Cheat Mode 01 — 개발자 치트 플래그(기본 OFF, URL로만 ON).
  dev: readDevFlags(),

  screen: "title",

  // Game Flow 01 → Fusion Flow 01: 런 = 초보자 테마 10스테이지 클리어 루프.
  //   formation = 현재 배치(합체/영입으로 런 중 변함), startFormation = 시작 배치(다시 시작용).
  run: {
    themeId: "beginner",
    stage: 1,
    maxStage: 10,
    result: null,
    bonuses: { atk: 0, maxHp: 0, heal: 0, healRecv: 0 }, // 누적 성장값(전역 atk/maxHp + 받는 치유량 healRecv) — 파티 재생성 시 반영
    rewardLevels: {}, // Reward & Growth 01: 보상별 선택 횟수(Lv 표시용 — 효과는 bonuses/training이 담당)
    training: {},     // Run Reward Training 01: 대상 필터 성장 버킷 { front/back/tank/melee/ranged/support: {atk,maxHp} }
    rewardOffer: null, // Run Reward Training 01: 현재 보상 화면 3택(reward id 배열) — 재렌더에도 고정
    // Run Structure 01A — 선택형 여정 레이어 상태(stage=이긴 전투 수와 분리).
    depth: 1,                   // 여정 깊이(전투 + 휴식 노드 수) — 보스 도전 타이밍 감각의 기준
    bossKeys: 0,                // 보스 열쇠(정예 전투 승리로 획득)
    threat: 0,                  // 위험도(내부 누적 — 위험/정예에서 상승. UI는 01B부터 경계도로 표시)
    alertness: 0,               // 01B 경계도(합체 진행도 기반) — 적 진형 조직도를 결정
    fusionCount: 0,             // 01B 합체 실행 누적 — 경계도 산정 기준(+보스 준비 압박)
    // Deep Forest Reward Rebuild 01 — 깊은 수풀 보상 루트(스탯 X). deepForestCount=준 보상 수(영입/합체 단계 판정),
    //   recruitPower=깊은 수풀 영입 수(경계도 가산). 경계도 = alertnessFromFusions(fusionCount + recruitPower).
    deepForestCount: 0,
    recruitPower: 0,
    routeChoices: null,         // 현재 제시된 여정 선택지(route id 배열) — 화면 갱신에도 고정
    currentRouteType: "normal", // 현재/직전 인카운터 타입(HUD 표시 + 승리 처리 분기)
    rewardPicks: 0,             // Reward Pressure 01 — 현재 보상 화면에서 남은 성장 선택 횟수(길 프로필 기반)
    formation: null,      // null = 기본 4인 배치
    startFormation: null, // 직업 선택 화면에서 정한 시작 배치
    recruitOffer: null,   // 영입 화면 진입 시 굴린 랜덤 후보(최대 3) — 화면 갱신에도 고정
    recruitSlot: null,    // Recruit UX Rebuild 01 — 영입으로 채울 고정 슬롯(미리보기 배치 대상)
    recruitPreview: null, // Recruit UX Rebuild 01 — 현재 미리 배치한 후보(확정 전 교체 가능)
    // Fusion Moment 01: 합체 결과 화면용(직전 합체 정보) / 영입 화면 문맥(fusion=빈자리 보충, expand=4인 확장)
    lastFusion: null,
    recruitContext: null,
  },

  party: createInitialParty(),
  enemies: createInitialEnemies(),

  battle: {
    status: "ready",
    tick: 0,
    isRunning: false,
    result: null,
    // Battle Speed 01 → Combat Breath Preview 01/02: 전투 배속.
    //   speed = interval 계산용 배수, speedLabel = 표시(1x/2x/3x/4x/MAX).
    //   세션 내 사용자 선택으로 유지(스테이지/재시작에서 reset 안 함).
    //   Living Battle Screen 04: 모바일 확인 결과 2x가 기본 체감에 가장 적합 → 기본값 2x.
    speed: 2,
    speedLabel: "2x",
    tickInterval: 250, // 현재 tick 간격(ms) — renderHud가 --tick CSS 변수로 반영
    // Combat Breath Preview 01: 프리뷰 장면 활성 시 종류(null=정식 런)
    previewKind: null,
  },

  logs: [
    "Project Signal Personal 시작.",
    "Phase 7: 성장 선택 구조 완료.",
  ],
};
