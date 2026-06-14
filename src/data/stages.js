// Game Flow Foundation 01 — 초보자 테마 10스테이지 플랜.
//   "한 판의 게임 흐름"을 위한 데이터일 뿐 — 밸런스 튜닝 아님(수치는 임시).
//   enemies 표기: "키" = 일반, "키:elite" = 정예, "키:boss" = 보스.
//   정예/보스 수치·표현(sizeClass/tier)은 state.js createStageEnemies에서 부여 —
//   Boss Presence Foundation의 presence/hit/death 기반을 그대로 재사용한다.
//   테마/스테이지 구조는 미래 테마 추가(중급자 등) 시 이 형태로 늘린다.
// Beginner Theme Actor 01 — 초보자 "동물 연합 / 새싹 숲" 라인업으로 교체.
//   고블린 제외(추후 고블린 전용 테마). 소형 5종(곰방패/잎여우/깃새/이슬말랑/풀양) 분산,
//   정예 2종(S5 숲올빼미 현자, S9 사슴수호자), 보스(S10 새싹숲 사자왕).
//   tier 구조(정예 위치 수·보스 1종)·적 수치(RANK_OVERRIDES)는 기존 그대로 — "얼굴 교체"이며
//   전투 밸런스/Run Structure 변경이 아니다. 이벤트(S3 합체/S5 영입/S8 합체)는 stage 번호 기준이라 불변.
export const BEGINNER_THEME = {
  id: "beginner",
  name: "초보자의 길",
  maxStage: 10,
  stages: [
    { tier: "normal", label: "일반 전투", enemies: ["bear", "dewslime"] },
    { tier: "normal", label: "일반 전투", enemies: ["fox", "bird"] },
    { tier: "normal", label: "일반 전투", enemies: ["bear", "lamb", "dewslime"] },
    { tier: "normal", label: "일반 전투", enemies: ["fox", "bird", "lamb"] },
    { tier: "elite",  label: "정예 전투", enemies: ["owl:elite", "dewslime", "lamb"] },
    { tier: "normal", label: "일반 전투", enemies: ["bear", "fox", "bird"] },
    { tier: "normal", label: "일반 전투", enemies: ["dewslime", "lamb", "fox"] },
    { tier: "normal", label: "일반 전투", enemies: ["bear", "fox", "bird", "dewslime"] },
    { tier: "elite",  label: "정예 전투", enemies: ["deer:elite", "lamb"] },
    { tier: "boss",   label: "보스 전투", enemies: ["lion:boss"] },
  ],
};

export function stagePlan(stage) {
  return BEGINNER_THEME.stages[stage - 1] || BEGINNER_THEME.stages[0];
}

// Start Flow UX Polish 01 — 스테이지 테마 선택 목록(관람/구성 안내용).
//   현재 실제 플레이 가능 테마는 "초보자의 길"(beginner) 하나뿐 — 나머지 4개는 잠금 표시만.
//   잠금 테마는 클릭해도 진입 불가(실제 적 구성/전투 구현 없음). 미래 테마 추가 자리.
export const STAGE_THEMES = [
  { id: "beginner",  name: "초보자의 길",   desc: "슬라임과 고블린의 길 — 첫 모험.", locked: false },
  { id: "goblin",    name: "고블린 소굴",   desc: "고블린 무리가 모여드는 굴.",       locked: true },
  { id: "naga",      name: "나가의 늪지",   desc: "독과 안개가 깔린 늪.",             locked: true },
  { id: "troll",     name: "트롤의 대지",   desc: "거대한 트롤이 버티는 황야.",        locked: true },
  { id: "assassin",  name: "암살자 집단",   desc: "그림자 속의 칼날들.",             locked: true },
];

// Fusion Flow Foundation 01 — 스테이지 클리어 이벤트(보상 선택 후 진입).
//   S3/S8: 합체 기회. 공통 규칙(battle.js applyFusion): 합체를 "실행"하면 인원이 1명
//   줄어드므로 반드시 동료 영입으로 보충한다. 합체 없음/스킵이면 영입도 없다.
//   S5: 동료 영입 — 합체 보충이 아니라 4인 파티 확장(정예 클리어 보상 성격) 별도 이벤트.
export const STAGE_CLEAR_EVENTS = {
  3: { type: "fusion" },
  5: { type: "recruit" },
  8: { type: "fusion" },
};
