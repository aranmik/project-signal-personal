// Run Structure Design 01A/01B — 선택형 여정 + 심도/경계도 압박 데이터.
//   01A: "전투는 자동이지만, 여정은 내가 고른다." 전투 후 다음 길을 고르고, 정예에서 보스 열쇠를
//        얻어 원할 때 보스문에 도전한다.
//   01B: "심도는 적을 강하게 만들고, 경계도는 적을 조직적으로 만든다."
//        심도(여정 깊이) → 적 HP/공격력 스케일. 경계도(합체 진행도) → 적 진형 조직도.
//        합체/보스 도전을 막지 않는다 — 대신 내 선택이 "세계의 반응"으로 돌아온다.
//   전투 계산/합체/영입/배치 코드는 무변경(이 파일은 데이터 + 선택/스케일/진형 로직만).
//
//   정예/보스 본체는 BEGINNER_THEME(stages.js)의 :elite/:boss 구성을 그대로 재활용한다
//   (얼굴 교체 없음 — S5 올빼미 / S9 사슴 / S10 사자왕 감각 유지). 소형 인카운터는 01B부터
//   "역할 진형"(ROLE_ACTOR)으로 구성한다 — 경계도가 진형의 두께/조직을 정한다.
import { BEGINNER_THEME } from "./stages.js";

// 선택지 카탈로그(표시 문구). 실제 인카운터는 createRouteEnemies(state.js)가 생성한다.
//   title/sub = 선택 카드 문구(모바일 390px), hud = 상단 HUD 짧은 라벨, kind = 흐름 분기.
//   Reward Pressure 01 — reward 프로필: 각 길의 "보상/위험 성격"을 코드에서 읽히게 명시.
//     picks = 전투 후 성장 선택 횟수(기존 성장 시스템 안에서 차등) / risk·rewardTier = 읽힘 등급 /
//     cardTag = 여정 카드 한 줄 / resultLabel = 보상·결과 화면에서 "방금 고른 길"의 의미.
//   "위험 전투"(hud)와 "깊은 수풀"(title)은 동일한 danger 길 — 보상이 좋고(2픽) 합체 기회를 함께 준다.
export const ROUTE_TYPES = {
  normal: { id: "normal", title: "새싹 숲길",  sub: "안정적인 전투",          hud: "일반 전투", kind: "battle",
    reward: { picks: 1, riskTier: "stable",   rewardTier: "low",  cardTag: "안정 · 보상 낮음",            resultLabel: "일반 전투 보상" } },
  danger: { id: "danger", title: "깊은 수풀",  sub: "위험 · 동료/합체 보상",   hud: "위험 전투", kind: "battle",
    // Beginner Flow Playtest Support 01 — 깊은 수풀 전투는 "현재 경계도" 진형으로 싸운다(선택 즉시 미래 경계도 X).
    //   클리어하면 동료 영입/합체로 경계도가 오른다 → 카드 문구도 "클리어 시 경계도↑"로 읽히게 정리.
    reward: { picks: 0, riskTier: "risky",    rewardTier: "high", cardTag: "위험 · 클리어 시 경계도↑ · 동료/합체",  resultLabel: "깊은 수풀 보상", deepForest: true } },
  elite:  { id: "elite",  title: "현자의 가지", sub: "승리 시 보스 열쇠",       hud: "정예 전투", kind: "battle",
    // Beginner Flow Playtest Support 01 — 현자의 가지 보상은 성장 1픽으로 정리(기존 2픽 = "큰 보상" 설계였으나
    //   클리어 직후 보상 화면이 두 번 떠 중복처럼 읽힘). 보스 열쇠 획득(key)은 그대로 유지된다.
    reward: { picks: 1, riskTier: "veryRisky", rewardTier: "high", cardTag: "매우 위험 · 열쇠 + 보상",   resultLabel: "정예 보상", key: true } },
  rest:   { id: "rest",   title: "이슬 쉼터",  sub: "전투 없이 회복",         hud: "휴식",     kind: "rest",
    reward: { picks: 0, riskTier: "safe",     rewardTier: "none", cardTag: "회복 · 보상 없음",             resultLabel: "휴식으로 회복", heal: true } },
  boss:   { id: "boss",   title: "새싹 왕의 문", sub: "사자왕에게 도전",        hud: "보스전",   kind: "boss",
    reward: { picks: 0, riskTier: "boss",     rewardTier: "clear", cardTag: "",                            resultLabel: "" } },
};

// Reward Pressure 01 — 길의 보상 프로필(없으면 일반 1픽 기본). 보상 화면/카드/결과 공용.
export function routeReward(routeType) {
  return (ROUTE_TYPES[routeType] && ROUTE_TYPES[routeType].reward) || ROUTE_TYPES.normal.reward;
}

// 정예/보스 본체 — stages.js의 :elite/:boss 구성을 단일 출처로 재활용(데이터 중복 없음).
const byTier = (tier) =>
  BEGINNER_THEME.stages.filter((s) => s.tier === tier).map((s) => s.enemies.slice());
export const ELITE_POOL = byTier("elite");            // [["owl:elite",...], ["deer:elite",...]]
export const BOSS_ENCOUNTER = byTier("boss")[0] || ["lion:boss"]; // 사자왕

// 여정 선택지 오퍼 — "읽히는 반고정" 선택지(복잡한 랜덤 생성 아님).
//   항상 안정 옵션(일반) + depth 리듬에 따른 둘째 옵션(정예/위험/휴식). 보스 열쇠가 있으면 보스문 추가.
//   카드 2~3개. 정예가 주기적으로 떠 열쇠를 모을 수 있고, 열쇠를 얻으면 "지금 갈지/더 돌지"를 고른다.
// Deep Forest Reward Rebuild 01 — 깊은 수풀(danger)은 "보상을 줄 수 있을 때만" 등장한다.
//   canDeepForest = 다음 깊은 수풀 보상(영입/합체)이 실제로 가능한가(battle.js deepForestRewardType).
//   불가하면 깊은 수풀 대신 휴식을 제시해 선택지가 비지 않게 한다(항상 normal + 둘째 옵션).
// Sage Branch Gate 01 — 현자의 가지(elite)는 경계도(alertness) 4 이상에서 최초 등장한다.
//   경계도 0~3에서는 정예 대신 깊은 수풀(보상 가능 시)·쉼터를 제시해 초반 운영을
//   "일반 전투 / 쉼터 / 깊은 수풀" 중심으로 유지한다(쉼터·깊은 수풀 선택의 의미 강화).
export const SAGE_BRANCH_MIN_ALERTNESS = 4;
export function rollRouteOffer({ depth, bossKeys, canDeepForest = true, alertness = 0 }) {
  const choices = ["normal"];
  const r = depth % 3;
  if (r === 2) {
    // 정예 타이밍이라도 경계도 4 미만이면 현자의 가지를 막고 깊은 수풀/쉼터로 대체.
    if (alertness >= SAGE_BRANCH_MIN_ALERTNESS) choices.push("elite");
    else choices.push(canDeepForest ? "danger" : "rest");
  }
  else if (r === 0) choices.push("rest");
  else choices.push(canDeepForest ? "danger" : "rest"); // 깊은 수풀이 보상 불가면 휴식으로 대체
  // Beginner Flow Playtest Support 01 — 보스문은 "열쇠를 모두 확보(2개)"했을 때만 노출한다.
  //   열쇠 1개 상태에선 보스문 미노출 — 두 번째 정예(현자의 가지)를 넘어야 문이 열린다(호흡 정리).
  //   bossMenace/위압 로직은 유지(삭제 X) — 다만 초보자 테마에선 항상 열쇠 2개=위압 해제로 보스를 만난다.
  //   다른 테마에서 "열쇠 1개 도전(위압)"을 다시 쓰려면 이 조건만 테마별로 분기하면 된다.
  if (bossKeys >= BOSS_MENACE.keysToSeal) choices.push("boss");
  return choices;
}

// 보스 도전 타이밍 감각(초보자 테마 기준) — "지금 갈지/더 돌지" 읽힘용.
//   Beginner Theme Clear Feel 01 — 25~35심도를 "정석/이상 도전" 구간으로 재정렬.
//   이른 ~20 / 빠른 승부 21~24 / 정석 25~30 / 충분히 준비 31~35 / 욕심·장기전 36+.
export function bossTimingLabel(depth) {
  if (depth <= 20) return "이른 도전";
  if (depth <= 24) return "빠른 승부";
  if (depth <= 30) return "정석 도전";
  if (depth <= 35) return "충분히 준비한 도전";
  return "욕심내는 도전";
}

/* =========================================================
   01B — 심도 스케일링: "심도는 적을 강하게 만든다."
   심도(여정 깊이)가 오를수록 적 HP/공격력이 오른다. 보수적 선형 + 과심도 가속.
   HP를 atk보다 크게 키운다 — 전투가 "길어지되" 한 대가 과하게 아프진 않게(어뷰징 완화도 겸).
   Beginner Theme Clear Feel 01 — 25~35를 정석/이상 도전 구간으로 두기 위해 추가 가속을 위로 민다.
   감각 밴드: 1~24 준비/정석 준비 / 25~35 정석~이상 도전(선형만) / 33~39 거칠어짐 / 40+ 과심도.
   ========================================================= */
export function depthScale(depth) {
  const d = Math.max(1, depth);
  let hp = 1 + (d - 1) * 0.06;   // 심도당 +6% HP
  let atk = 1 + (d - 1) * 0.035; // 심도당 +3.5% 공격력
  if (d >= 40) {                 // 과심도 — 오래 머문 대가가 확실히 커진다
    hp += (d - 39) * 0.05;
    atk += (d - 39) * 0.03;
  } else if (d >= 33) {          // 거친 숲 — 가속 시작
    hp += (d - 32) * 0.03;
    atk += (d - 32) * 0.02;
  }
  return { hp, atk };
}

// Run Structure 01C — 심도 분위기: 심도가 깊어질수록 "숲의 온도/공기"가 바뀐다(읽힘용).
//   Beginner Theme Clear Feel 01 — 25~35 정석 구간은 평온 유지, 분위기는 36+에서만 바뀐다.
//   1~35 기본 / 36+ 위협 / 46+ 분노. tier=전장·패널 class hook, label=문구. "보스를 오래 미룬 대가"를
//   숫자가 아니라 전장 분위기로도 보이게 한다.
export function depthAtmosphere(depth) {
  const d = Math.max(1, depth || 1);
  if (d >= 46) return { tier: "fury",   label: "숲이 분노로 가득찹니다" };
  if (d >= 36) return { tier: "threat", label: "숲이 위협으로 가득찹니다" };
  return { tier: "", label: "" };
}

// Run Structure 01C — 심도 속도 압박: 심도 36+/46+에서 몬스터 행동 게이지 충전 가속(영웅 불변).
//   Beginner Theme Clear Feel 01 — 25~35 정석 구간은 평속 유지, 가속은 36+에서만.
//   일반 전투 행동 빈도로도 "숲이 거칠어졌다"가 느껴지게. 보수적 상한(×1.5) — 폭주 방지.
export function depthSpeedFactor(depth) {
  const d = Math.max(1, depth || 1);
  if (d >= 46) return 1.5;
  if (d >= 36) return 1.3;
  return 1;
}

// 보스 심도 강화(광폭화) — 늦게 도전할수록 사자왕이 강해진다. depthScale 위에 곱하는 추가 배수.
//   도전을 "막지" 않는다 — 빠른 도전도 가능하되, 늦으면 보스가 숲의 깊이에 반응한다.
//   stage 0=평상 / 1=분노(늦은) / 2=광폭화(과심도). label·log는 UI/로그 체감용.
//   Beginner Theme Clear Feel 01 — 25~35를 정석/이상 도전으로 두기 위해 분노/광폭화를 위로 민다.
//   분노 36+ / 광폭화 45+. 25~35 보스전은 광폭화 없이 정상 도전이 된다.
export function bossFury(depth) {
  if (depth >= 45) return { stage: 2, hp: 1.35, atk: 1.25, label: "광폭화", log: "깊어진 숲의 힘으로 사자왕이 광폭화했다." };
  if (depth >= 36) return { stage: 1, hp: 1.18, atk: 1.12, label: "분노",   log: "사자왕이 숲의 깊이에 반응한다." };
  return { stage: 0, hp: 1, atk: 1, label: "", log: "" };
}

/* =========================================================
   Boss Early Challenge Pressure 01 — "보스 도전은 막지 않는다. 대신 준비 부족이면 사자왕이 압도한다."
   보스문은 열쇠만 있으면 열린다(하드락 없음 — 합체도 제한 없음). 다만 준비가 부족하면
   — 파티 인원/합체 횟수/심도가 모자라면 — 사자왕에게만 추가 강화를 곱한다.
   낮은 심도 보스는 depthScale(심도 스케일)만으로는 약하므로, 이 "준비 부족" 보정을 별도로 계산해
   빠른 도전이 "무모한 도전"으로 읽히게 한다. 일반/정예/합체/직업 밸런스는 불변 — 이 보정은 보스 전용.
   bossFury(심도 분노/광폭화)와는 별개 축으로 곱해진다(심도가 깊어도 작동, 라벨도 분리).
   ========================================================= */
export const BOSS_READY = { party: 4, fusions: 2, depth: 8 }; // 적정 도전 권장선(읽힘/판정 기준)

// 준비 부족 압박 — partySize/fusionCount/depth/bossKeys로 보스 전용 추가 배수와 읽힘 라벨을 만든다.
//   level 0=적정 / 1=성급한 도전 / 2=무모한 도전. 라벨/로그는 UI·전투 로그 체감용.
//   열쇠 1개(불완전한 열쇠)는 "이미 준비 부족(level>0)"일 때만 소폭 가중 — 적정 파티의 단일 열쇠는
//   정상 도전이므로 라벨/압박을 만들지 않는다(오경보 방지).
export function bossReadinessPressure({ depth = 1, bossKeys = 0, fusionCount = 0, partySize = 4 } = {}) {
  const missingMembers = Math.max(0, BOSS_READY.party - (partySize || 0));     // 4인 미만 — 빈 자리
  const missingFusions = Math.max(0, BOSS_READY.fusions - (fusionCount || 0)); // 합체 2회 미만
  const shallow = Math.max(0, BOSS_READY.depth - Math.max(1, depth));          // 심도 8 미만 — 성급함
  const fragileKey = (bossKeys || 0) <= 1 ? 1 : 0;                             // 열쇠 1개 — 불완전한 열쇠

  // 핵심 결핍(인원/합체/심도)만으로 hp 추가분을 쌓는다. HP를 atk보다 크게 — "길고 버겁게",
  //   한 방이 과하게 아프진 않게(빠른 도전 어뷰징 완화도 겸). 보스에게만 곱해진다.
  let hpExtra = missingMembers * 0.15 + missingFusions * 0.10 + shallow * 0.06;
  let atkExtra = missingMembers * 0.10 + missingFusions * 0.06 + shallow * 0.04;

  let level = 0;
  if (hpExtra >= 0.30) level = 2;
  else if (hpExtra > 0) level = 1;

  // 불완전한 열쇠 = 이미 준비 부족할 때만 가중(여벌 없이 무리한 도전이 더 버겁다).
  if (level > 0 && fragileKey) { hpExtra += 0.05; atkExtra += 0.03; }

  // 데이터 이상치 방어용 상한(정상 범위에선 도달하지 않음).
  hpExtra = Math.min(hpExtra, 1.2);
  atkExtra = Math.min(atkExtra, 0.8);

  const labels = ["", "성급한 도전", "무모한 도전"];
  const logs = [
    "",
    "성급한 도전 — 사자왕이 숲의 깊이를 빌려 맞선다.",
    "준비되지 않은 도전에 사자왕이 포효한다. 미완성 파티가 위압에 짓눌린다.",
  ];

  const reasons = [];
  if (missingMembers) reasons.push(`${partySize}인`);
  if (missingFusions) reasons.push(`합체 ${fusionCount}회`);
  if (shallow) reasons.push(`심도 ${depth}`);
  if (level > 0 && fragileKey) reasons.push("불완전한 열쇠");

  return {
    level,
    hp: 1 + hpExtra,
    atk: 1 + atkExtra,
    label: labels[level],
    log: logs[level],
    recommend: `권장: ${BOSS_READY.party}인 파티 / 합체 ${BOSS_READY.fusions}회+`,
    current: reasons.length ? `현재: ${reasons.join(" / ")}` : "현재: 도전 준비 양호",
  };
}

/* =========================================================
   Boss Readiness Pressure 02 — Elite Key Seal: "정예 2종을 모두 넘지 않으면 사자왕의 위압이 남는다."
   첫 열쇠 = 보스문을 여는 조건(도전 가능). 둘째 열쇠 = 사자왕의 위압을 거두는 조건.
   보스문 하드락 없음 — 열쇠 1개로도 도전 가능하되, 위압이 남아 "빠르지만 무모한 도전"이 된다.
   위압(보스 전용, 보스전에서만):
     - 받는 피해 감소(DR) — 짧은 화력으로는 끝나지 않는다(미완성 파티의 빠른 격파를 막는다).
     - 매 행동마다 공격력 상승(상한) — 시간이 흐를수록 버티기 힘들어진다(긴 전투면 3인 파티가 무너지도록).
   심도(분노/광폭화)·경계도(진형)·준비부족(스탯) 압박과 별개 축 — 함께 작동한다.
   ========================================================= */
export const BOSS_MENACE = {
  keysToSeal: 2,      // 열쇠 2개를 모으면 위압 해제(첫 1개는 문 개방용 — 둘째가 위압을 걷는다)
  dr: 0.40,           // 위압 중 사자왕이 받는 피해 -40%(후보 35~50% 중 보수적 중앙값)
  atkStepPct: 0.10,   // 사자왕 행동마다 공격력 +10%(기준 atk 대비, 누적)
  atkMaxStacks: 12,   // 상한 — 최대 +120%(폭주/거대수치 방지, 그래도 장기전이면 치명적)
};

// 보스 위압 상태 — bossKeys로만 판정(준비부족 스탯 압박과 독립). active면 보스에 DR/atk램프를 건다.
//   label/log는 카드·HUD·전투로그 체감용. 해제(키 2+)도 의미 있는 상태라 별도 라벨/로그를 준다.
export function bossMenace(bossKeys) {
  const active = (bossKeys || 0) < BOSS_MENACE.keysToSeal;
  return {
    active,
    keys: bossKeys || 0,
    needKeys: BOSS_MENACE.keysToSeal,
    dr: active ? BOSS_MENACE.dr : 0,
    atkStepPct: active ? BOSS_MENACE.atkStepPct : 0,
    atkMaxStacks: BOSS_MENACE.atkMaxStacks,
    label: active ? "위압" : "위압 해제",
    log: active
      ? "사자왕의 위압이 남아 있다 — 피해를 덜 받고, 시간이 흐를수록 거세진다."
      : "정예의 시험을 모두 넘었다 — 사자왕의 위압이 사라졌다.",
  };
}

/* =========================================================
   01B — 경계도: "경계도는 적을 조직적으로 만든다."
   경계도 = 합체 진행도(합체 횟수). 파티가 합체로 강해질수록 몬스터가 더 대비한다 —
   합체를 막지 않되, 더 조직적인 진형(전열 방벽 + 후열 지원 + 정예 보호)으로 응답한다.
   ========================================================= */
export const MAX_ALERTNESS = 5; // 표시/진형 상한 단계(5+는 가장 두꺼운 진형)

// 합체 누적 횟수 → 경계도(현재는 1:1, 상한 적용). 합체 0회=0 … 5회+=5.
export function alertnessFromFusions(fusionCount) {
  return Math.min(MAX_ALERTNESS, Math.max(0, fusionCount || 0));
}

// 역할 → 초보자 테마 소형 액터. 진형은 "역할"로 설계하고 여기서 얼굴을 입힌다.
export const ROLE_ACTOR = {
  tank: "bear",        // 곰방패 — 전열 탱커
  melee: "fox",        // 잎여우 — 근접 딜러
  ranged: "bird",      // 깃새 — 후열 원거리
  support: "dewslime", // 이슬말랑 — 서포터
  healer: "lamb",      // 풀양 — 힐러
};
// 전열에 서는 역할(나머지는 후열). 진형 슬롯 배치(state.js)가 이걸로 전열/후열을 가른다.
export const FRONT_ROLES = new Set(["tank", "melee"]);

// 경계도별 일반 전투 진형(역할 배열). 경계도↑ = 수↑ + 역할 조합 조직화(전열 방벽 + 후열 지원).
//   0: 단순 1~2 / 1: 전열+후열 소량 / 2: 전열2+후열2 / 3: 탱+근접+원거리+서폿+힐 /
//   4: 전열 방벽(탱2)+후열 지원 / 5+: 전장 가득(탱2+근접+원거리+서폿+힐).
const NORMAL_FORMATIONS = [
  ["tank", "melee"],
  ["tank", "melee", "ranged"],
  ["tank", "melee", "ranged", "healer"],
  ["tank", "melee", "ranged", "support", "healer"],
  ["tank", "tank", "melee", "ranged", "healer"],
  ["tank", "tank", "melee", "ranged", "support", "healer"],
];

// 경계도 → 일반/위험 전투 진형. danger는 한 단계 두꺼운 진형(아래 createRouteEnemies에서 +1).
export function normalFormation(alertness) {
  const i = Math.min(Math.max(0, alertness), NORMAL_FORMATIONS.length - 1);
  return NORMAL_FORMATIONS[i].slice();
}

// 정예 전투 호위(역할 배열) — 경계도↑ = 정예 보호 진형이 두꺼워진다(정예는 본체로 별도 배치).
const ELITE_ESCORTS = [
  ["tank"],
  ["tank", "ranged"],
  ["tank", "melee", "ranged"],
  ["tank", "melee", "ranged", "healer"],
  ["tank", "tank", "melee", "ranged"],
  ["tank", "tank", "melee", "ranged", "healer"],
];
export function eliteEscort(alertness) {
  const i = Math.min(Math.max(0, alertness), ELITE_ESCORTS.length - 1);
  return ELITE_ESCORTS[i].slice();
}

// 유저용 설명 — run-status/route-panel 안내 문구(공식 설명 후보).
export const PRESSURE_HELP = "심도는 적을 강하게, 경계도는 적을 조직적으로 만듭니다.";
