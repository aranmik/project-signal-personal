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
export const ROUTE_TYPES = {
  normal: { id: "normal", title: "새싹 숲길",  sub: "안정적인 전투",          hud: "일반 전투", kind: "battle" },
  danger: { id: "danger", title: "깊은 수풀",  sub: "더 조직적 / 보상 +",     hud: "위험 전투", kind: "battle" },
  elite:  { id: "elite",  title: "현자의 가지", sub: "승리 시 보스 열쇠",       hud: "정예 전투", kind: "battle" },
  rest:   { id: "rest",   title: "이슬 쉼터",  sub: "전투 없이 파티 정비",     hud: "휴식",     kind: "rest"   },
  boss:   { id: "boss",   title: "새싹 왕의 문", sub: "사자왕에게 도전",        hud: "보스전",   kind: "boss"   },
};

// 정예/보스 본체 — stages.js의 :elite/:boss 구성을 단일 출처로 재활용(데이터 중복 없음).
const byTier = (tier) =>
  BEGINNER_THEME.stages.filter((s) => s.tier === tier).map((s) => s.enemies.slice());
export const ELITE_POOL = byTier("elite");            // [["owl:elite",...], ["deer:elite",...]]
export const BOSS_ENCOUNTER = byTier("boss")[0] || ["lion:boss"]; // 사자왕

// 여정 선택지 오퍼 — "읽히는 반고정" 선택지(복잡한 랜덤 생성 아님).
//   항상 안정 옵션(일반) + depth 리듬에 따른 둘째 옵션(정예/위험/휴식). 보스 열쇠가 있으면 보스문 추가.
//   카드 2~3개. 정예가 주기적으로 떠 열쇠를 모을 수 있고, 열쇠를 얻으면 "지금 갈지/더 돌지"를 고른다.
export function rollRouteOffer({ depth, bossKeys }) {
  const choices = ["normal"];
  const r = depth % 3;
  if (r === 2) choices.push("elite");
  else if (r === 0) choices.push("rest");
  else choices.push("danger");
  if (bossKeys > 0) choices.push("boss");
  return choices;
}

// 보스 도전 타이밍 감각(초보자 테마 기준) — "지금 갈지/더 돌지" 읽힘용.
//   빠른 8~11 / 적정 12~17 / 늦은 18~24 / 너무 늦음 25+.
export function bossTimingLabel(depth) {
  if (depth < 8) return "이른 도전";
  if (depth <= 11) return "빠른 도전";
  if (depth <= 17) return "적정 도전";
  if (depth <= 24) return "늦은 도전";
  return "너무 늦은 도전";
}

/* =========================================================
   01B — 심도 스케일링: "심도는 적을 강하게 만든다."
   심도(여정 깊이)가 오를수록 적 HP/공격력이 오른다. 보수적 선형 + 과심도 가속.
   HP를 atk보다 크게 키운다 — 전투가 "길어지되" 한 대가 과하게 아프진 않게(어뷰징 완화도 겸).
   감각 밴드: 1~8 입문 / 9~16 적정 보스 준비 / 17~22 거칠어짐 / 23~29 오래 머문 대가 / 30+ 과심도.
   ========================================================= */
export function depthScale(depth) {
  const d = Math.max(1, depth);
  let hp = 1 + (d - 1) * 0.06;   // 심도당 +6% HP
  let atk = 1 + (d - 1) * 0.035; // 심도당 +3.5% 공격력
  if (d >= 30) {                 // 과심도 — 오래 머문 대가가 확실히 커진다
    hp += (d - 29) * 0.05;
    atk += (d - 29) * 0.03;
  } else if (d >= 23) {          // 거친 숲 — 가속 시작
    hp += (d - 22) * 0.03;
    atk += (d - 22) * 0.02;
  }
  return { hp, atk };
}

// 보스 심도 강화(광폭화) — 늦게 도전할수록 사자왕이 강해진다. depthScale 위에 곱하는 추가 배수.
//   도전을 "막지" 않는다 — 빠른 도전도 가능하되, 늦으면 보스가 숲의 깊이에 반응한다.
//   stage 0=평상 / 1=분노(늦은) / 2=광폭화(과심도). label·log는 UI/로그 체감용.
export function bossFury(depth) {
  if (depth >= 25) return { stage: 2, hp: 1.35, atk: 1.25, label: "광폭화", log: "깊어진 숲의 힘으로 사자왕이 광폭화했다." };
  if (depth >= 18) return { stage: 1, hp: 1.18, atk: 1.12, label: "분노",   log: "사자왕이 숲의 깊이에 반응한다." };
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
