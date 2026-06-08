export const gameState = {
  project: {
    id: "SIGNAL_PERSONAL",
    version: "v0.1-phase2-state",
  },

  screen: "battle",

  run: {
    stage: 1,
    maxStage: 1,
    result: null,
  },

  party: [],
  enemies: [],

  battle: {
    status: "ready",
    tick: 0,
    isRunning: false,
    result: null,
  },

  logs: [
    "Project Signal Personal 시작.",
    "Phase 2: gameState 준비 중.",
  ],
};
