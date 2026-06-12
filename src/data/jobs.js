// Fusion Flow Foundation 01 — 직업 카탈로그 / 합체 레시피.
//   "합체가 게임 플레이 안에서 보여야 한다" — 이번엔 기본 6종 + 1차 2종 + 레시피 2개만.
//   30종/2차 합체/다중 레시피는 이 데이터만 늘리는 방향으로 확장한다(구조 변경 없이).

// 기본 직업 6종 (직업 선택/영입 후보 풀)
export const BASE_JOBS = ["warrior", "guardian", "archer", "priest", "cleric", "trickster"];

// 1차 직업 (합체 결과로만 등장 — 선택/영입 불가)
export const ADVANCED_JOBS = ["rogue", "saint"];

// 합체 레시피 — job id 기반 판단. materials 2개 → result 1개.
//   birthLine: 합체 결과 화면용 탄생 문구 — "소모/제거"가 아니라 "탄생"으로 읽히게.
export const FUSION_RECIPES = [
  {
    materials: ["warrior", "archer"],
    result: "rogue",
    birthLine: "전사와 궁수의 힘이 하나로 모였다.",
  },
  {
    materials: ["priest", "cleric"],
    result: "saint",
    birthLine: "사제와 신관의 힘이 하나로 이어졌다.",
  },
];

// 현재 파티(jobIds)에서 실행 가능한 레시피만 추린다.
//   파티 내 동일 직업 중복 금지: 결과 직업을 이미 보유 중이면 그 조합은 제외.
export function availableFusions(jobIds) {
  return FUSION_RECIPES.filter(
    (r) => r.materials.every((m) => jobIds.includes(m)) && !jobIds.includes(r.result)
  );
}

// Party & Formation Integrity 01 — 슬롯 선호 규칙(시작 배치/영입/합체 계승 공용).
//   전열 선호: 전사/수호자/도적, 그 외(궁수/사제/신관/교란꾼/성직자)는 후열 선호.
//   선호 슬롯이 차 있으면 남은 빈 슬롯 순서로. 점유 슬롯에는 절대 배치하지 않는다.
export const FRONT_PREF_JOBS = ["warrior", "guardian", "rogue"];

export function prefersFront(jobId) {
  return FRONT_PREF_JOBS.includes(jobId);
}

export function slotPreference(jobId) {
  return prefersFront(jobId)
    ? ["f0", "f1", "b0", "b1"]
    : ["b0", "b1", "f0", "f1"];
}
