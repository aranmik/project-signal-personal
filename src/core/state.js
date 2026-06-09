import { UNIT_TEMPLATES } from "../data/units.js";

function createUnit(template, instanceId) {
  return {
    ...template,
    instanceId,
    hp: template.maxHp,
    actionGauge: 0,
    dead: false,
  };
}

function createInitialParty() {
  return [
    createUnit(UNIT_TEMPLATES.party.warrior, "hero-warrior-1"),
    createUnit(UNIT_TEMPLATES.party.priest, "hero-priest-1"),
    createUnit(UNIT_TEMPLATES.party.archer, "hero-archer-1"),
  ];
}

function createInitialEnemies() {
  return [
    createUnit(UNIT_TEMPLATES.enemies.slime, "enemy-slime-1"),
    createUnit(UNIT_TEMPLATES.enemies.goblin, "enemy-goblin-1"),
    createUnit(UNIT_TEMPLATES.enemies.wolf, "enemy-wolf-1"),
  ];
}

export const gameState = {
  project: {
    id: "SIGNAL_PERSONAL",
    version: "v0.1-phase3-units",
  },

  screen: "battle",

  run: {
    stage: 1,
    maxStage: 1,
    result: null,
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
    "Phase 3: 유닛 데이터 분리 완료.",
  ],
};
