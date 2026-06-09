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
  },

  logs: [
    "Project Signal Personal 시작.",
    "Phase 7: 성장 선택 구조 완료.",
  ],
};
