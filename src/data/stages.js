// Game Flow Foundation 01 — 초보자 테마 10스테이지 플랜.
//   "한 판의 게임 흐름"을 위한 데이터일 뿐 — 밸런스 튜닝 아님(수치는 임시).
//   enemies 표기: "키" = 일반, "키:elite" = 정예, "키:boss" = 보스.
//   정예/보스 수치·표현(sizeClass/tier)은 state.js createStageEnemies에서 부여 —
//   Boss Presence Foundation의 presence/hit/death 기반을 그대로 재사용한다.
//   테마/스테이지 구조는 미래 테마 추가(중급자 등) 시 이 형태로 늘린다.
export const BEGINNER_THEME = {
  id: "beginner",
  name: "초보자의 길",
  maxStage: 10,
  stages: [
    { tier: "normal", label: "일반 전투", enemies: ["slime", "slime"] },
    { tier: "normal", label: "일반 전투", enemies: ["slime", "goblin"] },
    { tier: "normal", label: "일반 전투", enemies: ["slime", "goblin", "wolf"] },
    { tier: "normal", label: "일반 전투", enemies: ["goblin", "goblin", "slime"] },
    { tier: "elite",  label: "정예 전투", enemies: ["goblin:elite", "slime", "goblin"] },
    { tier: "normal", label: "일반 전투", enemies: ["wolf", "slime", "slime"] },
    { tier: "normal", label: "일반 전투", enemies: ["goblin", "wolf", "slime"] },
    { tier: "normal", label: "일반 전투", enemies: ["slime", "goblin", "wolf", "goblin"] },
    { tier: "normal", label: "일반 전투", enemies: ["wolf", "wolf", "goblin", "slime"] },
    { tier: "boss",   label: "보스 전투", enemies: ["goblin:boss"] },
  ],
};

export function stagePlan(stage) {
  return BEGINNER_THEME.stages[stage - 1] || BEGINNER_THEME.stages[0];
}

// Fusion Flow Foundation 01 — 스테이지 클리어 이벤트(보상 선택 후 진입).
//   S3/S8: 합체 기회. 공통 규칙(battle.js applyFusion): 합체를 "실행"하면 인원이 1명
//   줄어드므로 반드시 동료 영입으로 보충한다. 합체 없음/스킵이면 영입도 없다.
//   S5: 동료 영입 — 합체 보충이 아니라 4인 파티 확장(정예 클리어 보상 성격) 별도 이벤트.
export const STAGE_CLEAR_EVENTS = {
  3: { type: "fusion" },
  5: { type: "recruit" },
  8: { type: "fusion" },
};
