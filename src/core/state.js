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
    // Battle Speed 01: 전투 배속(1x/2x). 기본 1x. 세션 내 사용자 선택으로 유지된다
    //   (스테이지/재시작에서 reset하지 않음 — battle 객체를 재생성하지 않으므로 보존).
    speed: 1,
  },

  logs: [
    "Project Signal Personal 시작.",
    "Phase 7: 성장 선택 구조 완료.",
  ],
};
