import { UNIT_TEMPLATES } from "../data/units.js";
import { stagePlan } from "../data/stages.js";

function createUnit(template, instanceId, bonuses = { atk: 0, maxHp: 0 }) {
  const maxHp = template.maxHp + bonuses.maxHp;
  return {
    ...template,
    instanceId,
    atk: template.atk + bonuses.atk,
    maxHp,
    hp: maxHp,
    actionGauge: 0,
    isDead: false,
    // Status & Effect Foundation 01: 실제 상태 데이터({ type, duration } 배열).
    //   duration은 "그 유닛의 행동 횟수" 기준(배속 영향 없음). statusMarkers(표시 전용)와 분리.
    statuses: [],
  };
}

// Game Flow 01 → Fusion Flow Foundation 01: 배치(formation) 기반 파티 구성.
//   formation = { f0, f1, b0, b1 } (전열2/후열2), 값은 jobId 또는 null(빈 슬롯).
//   유닛은 slotKey(전장 위치)와 role(front/back — 타겟 우선순위)을 슬롯에서 받는다.
//   instanceId는 직업당 안정(reconcile 키). 프리뷰/구버전 호출은 기본 4인 배치 사용.
export const SLOT_ORDER = ["f0", "f1", "b0", "b1"];
export const SLOT_NAMES = { f0: "전열 1", f1: "전열 2", b0: "후열 1", b1: "후열 2" };
export const DEFAULT_FORMATION = { f0: "warrior", f1: "guardian", b0: "archer", b1: "priest" };

export function createInitialParty(bonuses = { atk: 0, maxHp: 0 }, formation = DEFAULT_FORMATION) {
  const party = [];
  SLOT_ORDER.forEach((slot) => {
    const jobId = formation[slot];
    if (!jobId) return;
    const u = createUnit(UNIT_TEMPLATES.party[jobId], `hero-${jobId}-1`, bonuses);
    u.slotKey = slot;
    u.role = slot.startsWith("f") ? "front" : "back"; // 배치가 전열/후열을 결정
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

export function createStageEnemies(stage) {
  const plan = stagePlan(stage);
  return plan.enemies.map((spec, i) => {
    const [key, rank] = spec.split(":");
    const u = createUnit(UNIT_TEMPLATES.enemies[key], `st${stage}-${key}-${i}`);
    u.slot = rank === "boss" ? "boss" : i;
    if (rank && RANK_OVERRIDES[rank]) {
      Object.assign(u, RANK_OVERRIDES[rank], { name: RANK_PREFIX[rank] + u.name });
    }
    return u;
  });
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

export const gameState = {
  project: {
    id: "SIGNAL_PERSONAL",
    version: "v0.1-phase7",
  },

  screen: "title",

  // Game Flow 01 → Fusion Flow 01: 런 = 초보자 테마 10스테이지 클리어 루프.
  //   formation = 현재 배치(합체/영입으로 런 중 변함), startFormation = 시작 배치(다시 시작용).
  run: {
    themeId: "beginner",
    stage: 1,
    maxStage: 10,
    result: null,
    bonuses: { atk: 0, maxHp: 0, heal: 0 }, // 누적 성장값 — 파티 재생성 시 아군 전체 적용
    rewardLevels: {}, // Reward & Growth 01: 보상별 선택 횟수(Lv 표시용 — 효과는 bonuses가 담당)
    formation: null,      // null = 기본 4인 배치
    startFormation: null, // 직업 선택 화면에서 정한 시작 배치
    recruitOffer: null,   // 영입 화면 진입 시 굴린 랜덤 후보(최대 3) — 화면 갱신에도 고정
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
