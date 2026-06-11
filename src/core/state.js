import { UNIT_TEMPLATES } from "../data/units.js";

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
  };
}

export function createInitialParty(bonuses = { atk: 0, maxHp: 0 }) {
  return [
    createUnit(UNIT_TEMPLATES.party.warrior, "hero-warrior-1", bonuses),
    createUnit(UNIT_TEMPLATES.party.priest, "hero-priest-1", bonuses),
    createUnit(UNIT_TEMPLATES.party.archer, "hero-archer-1", bonuses),
    // Party Join 01: 4번째 동료. instanceId는 스테이지/재시작 간 안정(reconcile 키).
    createUnit(UNIT_TEMPLATES.party.guardian, "hero-guardian-1", bonuses),
  ];
}

export function createInitialEnemies() {
  return [
    createUnit(UNIT_TEMPLATES.enemies.slime, "enemy-slime-1"),
    createUnit(UNIT_TEMPLATES.enemies.goblin, "enemy-goblin-1"),
    createUnit(UNIT_TEMPLATES.enemies.wolf, "enemy-wolf-1"),
  ];
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
  //   statusMarkers는 "표시용" 임시 데이터일 뿐 — 실제 상태 이상/효과 계산은 없다.
  if (kind === "signal") {
    return [
      mk("goblin", 0, { statusMarkers: ["mark"] }),
      mk("slime", 1, { statusMarkers: ["poison"] }),
      mk("wolf", 2, { statusMarkers: ["poison", "mark"] }),
      mk("goblin", 3, { sizeClass: "mon-elite", tier: "elite", name: "정예 고블린", maxHp: 170, hp: 170, atk: 12, speed: 5, statusMarkers: ["guard", "buff"] }),
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

  run: {
    stage: 1,
    maxStage: 3,
    result: null,
    bonuses: { atk: 0, maxHp: 0 },
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
