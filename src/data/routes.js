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
// Route Grammar 02 — Recruit / Risk / Fusion Choice Separation.
//   기존 "깊은 수풀"이 영입·합체·위험·경계도를 한꺼번에 들고 있던 것을 의미별로 분리한다:
//     새싹 숲길(normal) = 안전 전투 + 성장 / 동료의 흔적(ally) = 영입 전용(전투 없음) /
//     결속의 공터(bond) = 합체·빌드 정리(전투 없음) / 깊은 수풀(danger) = 순수 위험 도박(영입/합체 분리) /
//     현자의 가지(elite) = 정예·보스키 / 이슬 쉼터(rest) = 회복 / 보스(boss) = 최종 도전.
//   합체는 더 이상 자동으로 빈자리를 채우지 않는다(합체 후 자동 영입 제거 — battle.js). 영입은 ally의 명시적 선택.
export const ROUTE_TYPES = {
  normal: { id: "normal", title: "새싹 숲길",  sub: "안전한 전투 · 파티 성장",  hud: "일반 전투", kind: "battle",
    reward: { picks: 1, riskTier: "stable",   rewardTier: "low",  cardTag: "안전 · 보상 낮음",            resultLabel: "일반 전투 보상" } },
  ally:   { id: "ally",   title: "동료의 흔적", sub: "전투를 피하고 동료를 찾는다", hud: "동료 찾기", kind: "ally",
    reward: { picks: 0, riskTier: "safe",     rewardTier: "none", cardTag: "영입 · 전투 없음 · 파티 완성", resultLabel: "동료의 흔적" } },
  bond:   { id: "bond",   title: "결속의 공터", sub: "합체와 재배치 · 빌드 정리",  hud: "결속",     kind: "bond",
    reward: { picks: 0, riskTier: "safe",     rewardTier: "none", cardTag: "합체 · 전투 없음 · 빌드 정리", resultLabel: "결속의 공터" } },
  // Route Grammar 02 — 깊은 수풀은 이제 "순수 위험 도박"이다. 더 이상 기본 영입/합체 필수 루트가 아니다.
  //   위험 전투(stat 프리미엄 유지) + 더 큰 성장 보상(2픽). 영입/합체와 분리됐다(deepForest 제거).
  danger: { id: "danger", title: "깊은 수풀",  sub: "위험한 전투 · 더 큰 보상",  hud: "위험 전투", kind: "battle",
    reward: { picks: 2, riskTier: "risky",    rewardTier: "high", cardTag: "위험 · 더 큰 성장 보상",      resultLabel: "깊은 수풀 보상" } },
  elite:  { id: "elite",  title: "현자의 가지", sub: "정예의 기척 · 보스 열쇠",  hud: "정예 전투", kind: "battle",
    reward: { picks: 1, riskTier: "veryRisky", rewardTier: "high", cardTag: "매우 위험 · 열쇠 + 보상",   resultLabel: "정예 보상", key: true } },
  rest:   { id: "rest",   title: "이슬 쉼터",  sub: "전원 회복 · 전투 없음",     hud: "휴식",     kind: "rest",
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
// Sage Branch Gate 01 — 현자의 가지(elite)는 경계도(유효 경계도) 4 이상에서 최초 등장한다.
export const SAGE_BRANCH_MIN_ALERTNESS = 4;

// Route Grammar 02 — 여정 선택 오퍼 재정리. 의미별 루트를 명시적으로 제시한다.
//   - 항상 새싹 숲길(normal: 안전 전투+성장).
//   - 동료의 흔적(ally): 4인 미만 + 영입 가능하면 "높은 우선순위"로 항상 제시(파티 완성 유도).
//   - 결속의 공터(bond): 합체 가능(4인 + 레시피)할 때 제시 — 합체는 이제 ally와 분리된 명시적 선택.
//   - 깊은 수풀(danger)/현자의 가지(elite)/이슬 쉼터(rest): depth 리듬으로 둘째 위험/회복 옵션.
//     현자의 가지는 "4인 완성 + 유효 경계도 4+"부터(4인 전엔 본격 정예 미등장 — 준비 구간 보호).
//   - 보스: 열쇠 2개부터.
//   effAlertness = effectiveAlertness(run)(4인 전엔 잠복으로 낮음) — 정예 게이트가 이 값을 본다.
export function rollRouteOffer({ depth, bossKeys, effAlertness = 0, partySize = 4, party4Reached = false, canRecruit = false, canFuse = false }) {
  const choices = ["normal"];
  // 영입 우선: 4인 미만이면 동료의 흔적을 항상 제시(파티 완성 유도 — 위험을 미루고 인원을 채우는 선택).
  if (partySize < 4 && canRecruit) choices.push("ally");
  // 결속의 공터: 4인 + 실행 가능한 합체 레시피가 있을 때만(합체 후 자동 영입 없음 — 다음 선택은 유저 몫).
  if (canFuse) choices.push("bond");
  // depth 리듬으로 둘째 위험/회복 옵션.
  const r = depth % 3;
  if (r === 2) {
    if (party4Reached && effAlertness >= SAGE_BRANCH_MIN_ALERTNESS) choices.push("elite");
    else choices.push("danger");
  } else if (r === 0) choices.push("rest");
  else choices.push("danger");
  if (bossKeys >= BOSS_MENACE.keysToSeal) choices.push("boss");
  // 중복 제거(순서 유지).
  return [...new Set(choices)];
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

/* =========================================================
   Route Grammar 02 — 4인 전 런웨이 / 잠복 경계도(effectiveAlertness) / Anti-Farm.
   "2인 시작은 유지하되, 4인 전까지는 게임이 시작되기 전 준비 구간에 가깝게."
   경계도(alertness)는 영입/합체로 계속 오르지만, 4인 파티를 완성하기 전에는 그 효과가 즉시 처벌이
   아니라 "잠복 압력/예고"로 작동한다. 4인을 완성하면(party4Reached) 잠복 경계도가 본격적인 숲 압력으로
   전환되고, 그 뒤로는 줄어들지 않는다(합체로 3인이 돼도 "여정은 이미 시작됐다").
   3인 무한 안전 파밍 방지: 4인 전 전투를 오래 반복하면 잠복 경계도가 단계적으로 누설된다(예고 + 일부 활성).
   ========================================================= */
export const FARM_GRACE = 3; // 4인 전 이 횟수까지의 전투는 잠복(예고만 — 즉시 처벌 아님)
export const FARM_STEP = 2;  // 이후 N전투마다 잠복 경계도가 1씩 누설(실제 경계도까지만)

// 유효 경계도: 인카운터 진형/정예 게이트가 보는 "실제로 켜진 경계도". 4인 완성 후엔 전면 전환,
//   4인 전엔 잠복(파밍을 오래 하면 grace 초과분만큼 일부 누설). 실제 누적 alertness를 넘지 않는다.
export function effectiveAlertness(run) {
  const a = run.alertness || 0;
  if (run.party4Reached) return a;                        // 4인 도달 = 잠복 경계도 전면 전환
  const over = (run.preParty4Battles || 0) - FARM_GRACE;  // grace 초과 전투 수
  const leak = over > 0 ? Math.floor(over / FARM_STEP) + 1 : 0;
  return Math.max(0, Math.min(a, leak));
}

// 4인 전 파밍 경고 단계(0=정상 / 1=슬슬 헤맴 / 2=오래 헤맴). UI/로그 예고용 — partySize<4에서만 의미.
export function farmWarnLevel(preParty4Battles) {
  const b = preParty4Battles || 0;
  if (b >= FARM_GRACE + FARM_STEP * 2) return 2;
  if (b >= FARM_GRACE) return 1;
  return 0;
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
