// Fusion Flow Foundation 01 → First Class Trial 01 — 직업 카탈로그 / 합체 레시피.
//   "합체가 게임 플레이 안에서 보여야 한다." 이제 6개 기본 직업의 모든 2직업 조합(15쌍)이
//   1차 직업 15종으로 1:1 대응된다 — 어떤 2명을 골라도 합체 후보가 보인다.
//   확장(2차/다중 레시피)은 이 데이터만 늘리는 방향으로 진행한다(구조 변경 없이).

// 기본 직업 6종 (직업 선택/영입 후보 풀)
export const BASE_JOBS = ["warrior", "guardian", "archer", "priest", "cleric", "trickster"];

// 1차 직업 15종 (합체 결과로만 등장 — 선택/영입 불가). 6기본 직업의 모든 2조합과 대응.
export const ADVANCED_JOBS = [
  "rogue", "saint", "warden", "watchbow", "trapper", "paladin", "vanguard",
  "forbidden", "wall", "healbow", "purifier", "mage", "bard", "gatekeeper", "tracker",
];

// 2차 직업 분류(표시 전용 — render.js jobTierLabel 도감 단계 배지). 영입/보상 로직과 무관:
//   이 배열은 도감 단계 표기용이다. 합체는 ACTIVE_FUSION_RECIPES(= FUSION_RECIPES + SECOND_CLASS_RECIPES)를 본다 — Unlock 01.
//   Second Class Codex Readability 01: Batch 1A/2로 Dev 전투 씨앗화된 SR-25~30도 포함(도감 배지 '2차 씨앗' 정상화).
export const SECOND_CLASS_JOBS = [
  "dragonspear", "sage", "sunlord",
  "swordsaint", "redeemer", "skyarcher", "plaguebringer", "dancer", "wardkeeper",
];

// 합체 레시피 — job id 기반 판단. materials 2개 → result 1개. 순서 무관(availableFusions가 흡수).
//   birthLine: 합체 결과 화면용 탄생 문구 — "소모/제거"가 아니라 "탄생"으로 읽히게.
//   First Class Trial 01: 6기본 직업의 모든 2조합 = 1차 15종(단일 확정 결과, 분기 없음).
export const FUSION_RECIPES = [
  // 전사 조합
  { materials: ["warrior", "guardian"],  result: "gatekeeper", birthLine: "전사의 검과 수호자의 방패가 문을 지키는 자로 거듭났다." },
  { materials: ["warrior", "archer"],    result: "rogue",      birthLine: "전사와 궁수의 힘이 하나로 모였다." },
  { materials: ["warrior", "priest"],    result: "paladin",    birthLine: "전사의 의지에 사제의 빛이 깃들어 성기사가 되었다." },
  { materials: ["warrior", "cleric"],    result: "vanguard",   birthLine: "전사의 돌격과 신관의 가호가 선봉으로 모였다." },
  { materials: ["warrior", "trickster"], result: "warden",     birthLine: "전사의 단단함과 교란꾼의 술수가 워든으로 엮였다." },
  // 수호자 조합
  { materials: ["guardian", "archer"],    result: "watchbow",  birthLine: "수호자의 경계와 궁수의 시야가 파수궁으로 깨어났다." },
  { materials: ["guardian", "priest"],    result: "forbidden", birthLine: "수호자의 결속과 사제의 권능이 금제로 봉인되었다." },
  { materials: ["guardian", "cleric"],    result: "wall",      birthLine: "수호자의 방패와 신관의 가호가 흔들리지 않는 성벽이 되었다." },
  { materials: ["guardian", "trickster"], result: "trapper",   birthLine: "수호자의 인내와 교란꾼의 함정술이 덫꾼으로 이어졌다." },
  // 사제 조합
  { materials: ["priest", "archer"],    result: "healbow",  birthLine: "사제의 치유와 궁수의 사격이 치유궁으로 맺혔다." },
  { materials: ["priest", "cleric"],    result: "saint",    birthLine: "사제와 신관의 힘이 하나로 이어졌다." },
  { materials: ["priest", "trickster"], result: "purifier", birthLine: "사제의 정결과 교란꾼의 기지가 정화사로 피어났다." },
  // 궁수·신관·교란꾼 잔여 조합
  { materials: ["archer", "cleric"],     result: "mage",    birthLine: "궁수의 집중과 신관의 신비가 마도로 응축되었다." },
  { materials: ["archer", "trickster"],  result: "tracker", birthLine: "궁수의 추적과 교란꾼의 은밀함이 추적자로 합쳐졌다." },
  { materials: ["cleric", "trickster"],  result: "bard",    birthLine: "신관의 선율과 교란꾼의 장단이 바드의 노래가 되었다." },
];

// Second Class Recipe Unlock 01 — SR-22~SR-30 2차 직업 레시피(1차+기본 / 1차+1차). 이제 실제 합체에서 활성.
//   FUSION_RECIPES(1차)와 구조를 분리 유지한다 — 2차만 잠그거나 조정하려면 이 배열만 건드리면 된다.
//   실제 합체 검색은 아래 ACTIVE_FUSION_RECIPES(1차+2차 병합)를 통해 두 소스를 함께 본다.
//   재료 id는 jobStatus.js note 기준(예: 무희=바드+신관=bard+cleric / 구원자=정화사+사제=purifier+priest).
export const SECOND_CLASS_RECIPES = [
  { materials: ["rogue", "archer"],        result: "dragonspear",   birthLine: "도적의 칼끝에 용의 숨결이 실려 용창이 되었다." },
  { materials: ["mage", "trickster"],      result: "sage",          birthLine: "마도의 통찰과 교란꾼의 기지가 현자의 경지에 닿았다." },
  { materials: ["vanguard", "guardian"],   result: "sunlord",       birthLine: "선봉의 깃발과 수호자의 빛이 성황의 권능으로 떠올랐다." },
  // SR-25~30 — Batch 1A/2 Dev 전투 씨앗을 실제 합체 흐름으로 해금(Unlock 01).
  { materials: ["warden", "warrior"],      result: "swordsaint",    birthLine: "워든의 술수와 전사의 검이 하나의 결투로 벼려져 검성이 되었다." },
  { materials: ["purifier", "priest"],     result: "redeemer",      birthLine: "정화사의 자비와 사제의 기도가 죽음을 붙잡는 구원자로 거듭났다." },
  { materials: ["tracker", "archer"],      result: "skyarcher",     birthLine: "추적자의 표식과 궁수의 시야가 하늘을 가르는 천궁으로 피어났다." },
  { materials: ["trapper", "trickster"],   result: "plaguebringer", birthLine: "덫꾼의 독과 교란꾼의 책략이 전장을 병들게 하는 역병술사로 번졌다." },
  { materials: ["bard", "cleric"],         result: "dancer",        birthLine: "바드의 선율과 신관의 가호가 박자를 짓는 무희의 춤이 되었다." },
  { materials: ["wall", "guardian"],       result: "wardkeeper",    birthLine: "성벽의 굳건함과 수호자의 결계가 진형을 지키는 결계장으로 세워졌다." },
];

// Second Class Recipe Unlock 01 — 합체 검색용 "활성 레시피" 단일 출처(1차 + 2차 병합).
//   availableFusions/applyFusion(battle.js)이 공통으로 이 목록을 본다. 두 원본 배열의 구조/분리는 유지.
export const ACTIVE_FUSION_RECIPES = [...FUSION_RECIPES, ...SECOND_CLASS_RECIPES];

/* =========================================================
   Role Category Foundation 01 — 직업 "성향" 분류(전투 역할 문법).
   기존 role(front/back = 배치 성향)과는 다른 축이다 — 절대 섞지 않는다.
   성향 5종: tank/melee/ranged/support/healer.
   이 정보는 "도감 상세 표시 + 영웅 확장 기반"으로만 쓴다 —
   전투 계산/타겟팅/스탯/합체식/영입·배치·전투 화면에는 연결하지 않는다(표시 전용 메타).
   2차 3종(용창/현자/성황)은 이번 분류 대상이 아님 → combatRoleOf가 null(도감에 성향 줄 미표시).
   ========================================================= */
export const JOB_COMBAT_ROLES = {
  // 기본 6직업
  warrior: "melee",
  guardian: "tank",
  archer: "ranged",
  priest: "healer",
  cleric: "support",   // 힐러가 아니라 보호/축복 계열 서포터
  trickster: "support", // 행동 게이지 방해 서포터

  // 1차 15직업
  gatekeeper: "tank",
  rogue: "melee",
  paladin: "tank",     // 이번 기준에서 탱커로 분류
  vanguard: "support",
  warden: "melee",     // 이번 기준에서 근접딜러로 분류
  watchbow: "ranged",  // 탱커 조합이지만 성향은 원거리딜러
  forbidden: "tank",   // 이번 기준에서 탱커로 분류
  wall: "tank",
  trapper: "support",
  healbow: "healer",
  saint: "healer",
  purifier: "healer",
  mage: "ranged",
  tracker: "ranged",
  bard: "support",
};

export const JOB_ROLE_LABELS = {
  tank: "탱커",
  melee: "근접딜러",
  ranged: "원거리딜러",
  support: "서포터",
  healer: "힐러",
};

export function combatRoleOf(jobId) {
  return JOB_COMBAT_ROLES[jobId] || null;
}

export function combatRoleLabelOf(jobId) {
  const role = combatRoleOf(jobId);
  return role ? JOB_ROLE_LABELS[role] : "";
}

// 현재 파티(jobIds)에서 실행 가능한 레시피만 추린다.
//   파티 내 동일 직업 중복 금지: 결과 직업을 이미 보유 중이면 그 조합은 제외.
export function availableFusions(jobIds) {
  // Second Class Recipe Unlock 01 — 1차+2차 병합 소스를 본다(기존 1차 후보는 그대로, 2차도 함께 등장).
  return ACTIVE_FUSION_RECIPES.filter(
    (r) => r.materials.every((m) => jobIds.includes(m)) && !jobIds.includes(r.result)
  );
}

// Party & Formation Integrity 01 → First Class Trial 01 — 슬롯 선호 규칙(시작 배치/영입/합체 계승 공용).
//   전열 선호: 기본 전사/수호자 + 근접·방어형 1차(도적/워든/성기사/선봉/금제/성벽/수문장)·2차(용창).
//   그 외(원거리·치유·교란형)는 후열 선호. 선호 슬롯이 차 있으면 남은 빈 슬롯 순서로.
//   점유 슬롯에는 절대 배치하지 않는다. (각 직업 템플릿의 role:front 군과 일치)
export const FRONT_PREF_JOBS = [
  "warrior", "guardian",
  "rogue", "warden", "paladin", "vanguard", "forbidden", "wall", "gatekeeper",
  "dragonspear",
  // Second Class Batch 1A — 검성/결계장은 전열형(처형딜러/보호탱커). 천궁(skyarcher)은 후열 → 미포함.
  "swordsaint", "wardkeeper",
];

export function prefersFront(jobId) {
  return FRONT_PREF_JOBS.includes(jobId);
}

export function slotPreference(jobId) {
  return prefersFront(jobId)
    ? ["f0", "f1", "b0", "b1"]
    : ["b0", "b1", "f0", "f1"];
}
