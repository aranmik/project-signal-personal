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
// Route Grammar 02B — 정정: 동료 획득·합체·성장은 "전투를 이긴 뒤 얻는 보상"이다.
//   동료의 흔적(ally)/결속의 공터(bond)는 비전투 이벤트가 아니라 "보상 타입이 다른 전투 루트"다.
//   전투 없이 파티 강화는 없다(런의 긴장·선택 책임·전멸 납득감 보존). 합체 후 자동 영입은 여전히 금지.
//   kind="battle"(rest만 비전투). 승리 후 보상 종류는 battle.js applyFinish가 currentRouteType로 분기한다:
//     normal=성장1픽 / danger=성장2픽 / ally=영입1(승리시) / bond=합체화면(승리시) / elite=보스키+성장1 / boss=클리어.
export const ROUTE_TYPES = {
  normal: { id: "normal", title: "새싹 숲길",  sub: "전투 · 승리 후 성장",      hud: "일반 전투", kind: "battle",
    reward: { picks: 1, riskTier: "stable",   rewardTier: "low",  cardTag: "전투 · 승리 후 성장 1회",       resultLabel: "일반 전투 보상" } },
  ally:   { id: "ally",   title: "동료의 흔적", sub: "전투 · 승리 후 동료 영입",  hud: "동료 찾기", kind: "battle",
    reward: { picks: 0, riskTier: "stable",   rewardTier: "ally", cardTag: "전투 · 승리 후 영입(패배 시 없음)", resultLabel: "동료의 흔적 — 영입", recruit: true } },
  bond:   { id: "bond",   title: "결속의 공터", sub: "전투 · 승리 후 합체/정리",  hud: "결속 전투", kind: "battle",
    reward: { picks: 0, riskTier: "stable",   rewardTier: "bond", cardTag: "전투 · 승리 후 합체(패배 시 없음)", resultLabel: "결속의 공터 — 합체", fusion: true } },
  // 깊은 수풀 = 순수 위험 도박(영입/합체와 분리). 위험 전투(stat 프리미엄) + 더 큰 성장 보상(2픽).
  danger: { id: "danger", title: "깊은 수풀",  sub: "위험한 전투 · 더 큰 보상",  hud: "위험 전투", kind: "battle",
    reward: { picks: 2, riskTier: "risky",    rewardTier: "high", cardTag: "위험 전투 · 승리 후 성장 2회",   resultLabel: "깊은 수풀 보상" } },
  elite:  { id: "elite",  title: "현자의 가지", sub: "정예 전투 · 보스 열쇠",    hud: "정예 전투", kind: "battle",
    reward: { picks: 1, riskTier: "veryRisky", rewardTier: "high", cardTag: "정예 전투 · 승리 후 열쇠 + 보상", resultLabel: "정예 보상", key: true } },
  rest:   { id: "rest",   title: "이슬 쉼터",  sub: "전원 회복 · 진형 정비",     hud: "정비",     kind: "rest",
    reward: { picks: 0, riskTier: "safe",     rewardTier: "none", cardTag: "정비 · 전원 회복 · 다음 빌드 준비", resultLabel: "이슬 쉼터 — 정비", heal: true } },
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
// Route Grammar 02B — 여정 선택 오퍼: 매 여정 2~3개를 "조건 필터링된 후보군에서 랜덤"으로 구성한다.
//   기본 후보군(전부 전투, rest만 비전투): 새싹 숲길 / 깊은 수풀 / 현자의 가지 / 이슬 쉼터.
//     · 현자의 가지(elite): 경계도 4 제한 제거 — 기본 후보군에 포함(보스엔 열쇠 2개 필요 + 모든 강화에 전투 비용이 있어 초반 러쉬 완충이 이미 있음).
//   조건부 후보:
//     · 동료의 흔적(ally): 파티 4명 미만 + 영입 가능(빈자리)일 때만. 4명이면 노출 안 함.
//     · 결속의 공터(bond): 파티 3명 이상 + 실제 합체 조합이 있을 때만. 2명 이하면 노출 안 함(2→1 단독 파티 방지). 4인 전용 아님 — 3인에서도 조건 맞으면 등장.
//     · 보스: 열쇠 2개 이상.
//   "노출 = 유저에게 허용"이므로 불가능/무의미한 선택지는 후보에서 제외한다.
// Rest Grove 01 — hpRatio/restJustTaken 추가. 다친 파티는 "정비(이슬 쉼터)"를 항상 선택지로 보장하고,
//   쉼터 직후엔 연속 쉼터를 막아 "정비 → 다음 빌드/전투"로 이어지게 한다(쉼터 = 빌드 포기가 아니라 다음 빌드 준비).
// Route Choice Cap 01 — 여정 선택지를 의도적으로 "최대 2개"로 제한한다(로그라이크식 밀당 실험).
//   매번 영입/합체 최적해를 밟지 못하게 하고, 새싹 숲길은 "원하는 게 안 나왔을 때 심도를 지불하며
//   지나가는 기본 진행로"가 된다("이번엔 영입이 잘 안 나왔네" 같은 운의 감각). 조건별 우선순위로
//   선택지 없음/강제(억까)는 막는다. ※ Boss Gate/BOSS_READY.depth는 손대지 않는다 — 보스문 노출
//   조건(열쇠 2)도 기존 그대로. 이 캡이 보스/열쇠/합체 타이밍을 얼마나 뒤로 미는지 먼저 관측한다.
// Route Choice Polish 02 — bond starvation guard + Sage Branch cooldown.
//   bondMissStreak = "합체 가능한데 결속이 안 나온 연속 횟수"(showRouteChoice가 누적/리셋해 넘긴다).
//     → BOND_STARVE_LIMIT 도달 시 결속을 강제 노출(굶김 방지). 쉼터 직후 + 합체 가능도 결속 우선(정비→빌드 약속).
//   eliteCooldown = "정예(현자의 가지)를 방금 노출해 잠시 억제할 남은 횟수" → 연속/조기 반복 노출(정답지화) 방지.
//   둘 다 cap=2·pre-4 보호·보스문 조건(열쇠2)은 그대로. 3인 리스크 완화/전투 수치 변경 없음.
export const BOND_STARVE_LIMIT = 2; // 합체 가능한데 결속 미노출 2연속이면 다음 오퍼에 결속 강제
export const SAGE_COOLDOWN = 2;     // 정예 노출 후 2회 동안 정예 풀에서 제외(연속 노출 억제)
export function rollRouteOffer({ depth, bossKeys, partySize = 4, canRecruit = false, canFuse = false, hpRatio = 1, restJustTaken = false, bondMissStreak = 0, eliteCooldown = 0, rng = Math.random }) {
  const CAP = 2;
  const offer = [];
  const add = (rt) => { if (rt && !offer.includes(rt) && offer.length < CAP) offer.push(rt); };
  const pickFrom = (arr) => { const a = arr.filter((rt) => rt && !offer.includes(rt)); return a.length ? a[Math.floor(rng() * a.length)] : null; };
  const ret = () => [...new Set(offer.length ? offer : ["normal"])];

  const bossReady = (bossKeys || 0) >= BOSS_MENACE.keysToSeal; // 열쇠 2 = 새싹 왕의 문 개방(기존 조건 유지)
  const lowHp = hpRatio < 0.55 && !restJustTaken;
  const canBond = canFuse && partySize >= 3;
  // C — 결속 보장 조건: 합체 가능 + (오래 굶었거나 / 쉼터 직후 빌드 약속). 쉼터 직후엔 결속을 강하게 약속한다.
  const bondStarved = canBond && (bondMissStreak >= BOND_STARVE_LIMIT || restJustTaken);

  // 1) 생존 안전장치 — 다칠 때(hp<55%)는 정비(이슬 쉼터)를 항상 보장. 쉼터 직후엔 제외(연속 쉼터 방지).
  if (lowHp) add("rest");

  // 2) 4인 전 런웨이 — 동료의 흔적(영입) 우선 + 안전 진행(새싹 숲길). 4인 전엔 위험/정예 압력을 노출하지
  //    않는다(초반 억까 방지). 영입 후보가 없으면 정비/진행으로 2개를 채운다.
  if (partySize < 4) {
    if (canRecruit) add("ally");
    add("normal");
    if (offer.length < CAP) add(!restJustTaken ? "rest" : "danger");
    return ret();
  }

  // 3) 보스 준비 완료(열쇠 2) — 새싹 왕의 문을 강하게 포함하되 과밀하지 않게(보스 + 1개). 현자의 가지(정예)는
  //    노출하지 않는다(열쇠 충분 — 정답지화/연속 노출 방지). 결속이 굶었으면 둘째 칸을 결속으로 보장.
  if (bossReady) {
    add("boss");
    if (offer.length < CAP) {
      if (bondStarved) add("bond"); // 굶은 결속은 보스 준비 중에도 보장
      else {
        const deferPool = ["normal"];                 // 보스를 미루고 진행하는 안전 선택
        if (canBond) deferPool.push("bond");           // 한 번 더 키우는 합체
        if (!restJustTaken) deferPool.push("rest");    // 또는 정비
        if (rng() < 0.3) deferPool.push("danger");     // 가끔 깊은 수풀
        add(pickFrom(deferPool));
      }
    }
    return ret();
  }

  // C — 보스 미개방 구간: 결속이 굶었거나 쉼터 직후면 결속 + 안전 진행(새싹 숲길)으로 "정비→빌드" 리듬 보장.
  if (bondStarved) {
    add("bond");
    add("normal");
    if (offer.length < CAP) add(!restJustTaken ? "rest" : "danger");
    return ret();
  }

  // 4) 4인 이후(열쇠 모으는 중) — 빌드/압력 루트를 "매번 다 나오지 않게" 하나만 랜덤(밀당의 핵심).
  //    결속(합체)은 답답함 방지로 가중(×2). 현자의 가지(정예)는 D — 쿨다운 중이면 풀에서 제외(연속/조기 노출 억제).
  const pool = [];
  if (canBond) { pool.push("bond"); pool.push("bond"); }
  if (eliteCooldown <= 0) pool.push("elite");
  pool.push("danger");
  if (!restJustTaken) pool.push("rest");
  add(pickFrom(pool));

  // 5) 기본 진행로 — 새싹 숲길을 2번째로 항상 보강(원하는 게 안 나왔을 때 지나가는 길 + 빈 오퍼 방지).
  add("normal");
  return ret();
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

/* =========================================================
   Forest Director 01 — 전투 타입별 최소 품질선 + 심도 구간 압력 레이어.
   철학 전환: "심도/경계도 → 적 수/스탯 → 전투"(절대 기준)가 아니라,
              "루트/전투 타입 → 최소 품질선 → 심도/경계도 가산 압력 → 최종 전투".
   ① 압력 레이어 분리: 적 수(directorCount)와 스탯(directorScale)을 별도 곡선으로 두고
      step 위치를 어긋나게 해 "심도 9에 적 수 + 스탯 동시 급등(절벽)"을 막는다.
   ② 적 수는 심도 밴드에서만 결정(경계도와 분리) — 경계도는 "조합(조직화)"만 바꾼다(체력 뻥튀기보다 조합 압박).
   ③ 정예/보스는 심도에 종속되지 않는 최소 품질선(floor)을 먼저 갖고, 심도/경계도는 그 위에 곱만 한다.
   ※ 직업/스킬/몬스터/스테이지/보상 데이터(units/skills/jobs/stages/rewards)는 일절 바꾸지 않는다 — "생성 규칙"만.
   ========================================================= */
export const DEPTH_BANDS = [
  { id: 1, min: 1,  max: 4,  label: "준비 구간" },
  { id: 2, min: 5,  max: 8,  label: "첫 선택의 대가" },
  { id: 3, min: 9,  max: 13, label: "숲의 반응" },
  { id: 4, min: 14, max: 20, label: "보스 준비" },
  { id: 5, min: 21, max: 30, label: "로망" },
  { id: 6, min: 31, max: Infinity, label: "과심도" },
];
export function depthBand(depth) {
  const d = Math.max(1, depth || 1);
  return DEPTH_BANDS.find((b) => d >= b.min && d <= b.max) || DEPTH_BANDS[DEPTH_BANDS.length - 1];
}

// ① 적 수 — 전투 타입 × 심도 밴드(완만, 경계도와 분리). 마찰 전투(일반/영입/결속)는 2,3,4,4,5,6.
//    위험(danger)은 +1(상한 6). 정예 호위 수는 eliteEscortCount(별도 floor).
const COUNT_BY_BAND = { friction: [2, 3, 4, 4, 5, 6], danger: [3, 4, 4, 5, 6, 6] };
export function directorCount(routeType, depth) {
  const b = depthBand(depth).id - 1;
  if (routeType === "danger") return COUNT_BY_BAND.danger[b];
  return COUNT_BY_BAND.friction[b]; // normal / ally / bond — 마찰 전투
}

// ② 스탯 스케일 — 밴드 계단(횡보 → 살짝 상승). depthScale(연속 +6%/심도)보다 완만하고,
//    step 위치를 "적 수 step(밴드 경계 d5/9/14/21)"과 어긋나게(밴드 중간 d3/7/11/17/25)에서 올려 동시 급등을 막는다.
const SCALE_STEPS = [
  { from: 1,  hp: 1.00, atk: 1.00 },
  { from: 3,  hp: 1.06, atk: 1.03 },
  { from: 7,  hp: 1.16, atk: 1.08 },
  { from: 11, hp: 1.30, atk: 1.14 },
  { from: 17, hp: 1.48, atk: 1.22 },
  { from: 25, hp: 1.72, atk: 1.34 },
  { from: 33, hp: 2.05, atk: 1.50 },
];
export function directorScale(depth) {
  const d = Math.max(1, depth || 1);
  let s = SCALE_STEPS[0];
  for (const step of SCALE_STEPS) if (d >= step.from) s = step;
  let hp = s.hp, atk = s.atk;
  if (d >= 40) { hp += (d - 39) * 0.04; atk += (d - 39) * 0.025; } // 과심도 추가 가산(감각 유지)
  return { hp, atk };
}

// ② 조합(조직화) — 적 수는 directorCount로 고정하고, 경계도가 "역할 구성"만 두껍게 한다.
//    낮은 경계도 = 근접/원거리 마찰. 높을수록 탱/힐/서폿 주입(조합 압박) — 수는 안 늘린다.
export function directorRoles(routeType, depth, alertness) {
  const count = directorCount(routeType, depth);
  const out = [];
  const add = (r) => { if (out.length < count) out.push(r); };
  if (alertness >= 1) add("tank");            // 전열 방벽
  add("melee");
  if (count >= 3) add("ranged");              // 후열 압박
  if (alertness >= 3) add("healer");          // 조직화: 힐러(조합 압박)
  if (alertness >= 4) add("support");         // 서포터(약화/보호)
  if (alertness >= 5) add("tank");            // 두꺼운 전열
  while (out.length < count) add(out.length % 2 ? "ranged" : "melee"); // 남는 자리 = 마찰
  return out;
}

// ③ 정예전 최소 호위 수 — 언제 만나도 "정예 1 + 소형 최소 3". 밴드/경계도로 +1까지 두꺼워진다(floor 아래로 안 내려감).
const ELITE_ESCORT_FLOOR = [3, 3, 4, 4, 5, 5];
export function eliteEscortCount(depth, alertness) {
  const floor = ELITE_ESCORT_FLOOR[depthBand(depth).id - 1];
  return Math.min(6, floor + (alertness >= 4 ? 1 : 0));
}

// ③ 보스 최소 기본값 — 심도/경계도와 무관한 floor. depth(directorScale)/fury/readiness는 이 위에 곱(가산 압력)만.
//    "도적+사제 2인이 쉽게 못 잡는" 기본값 — 4인/합체 파티가 도전할 때 비로소 가능성이 생기는 목표물.
//    (기존 RANK_OVERRIDES.boss 520/15보다 높은 바닥 — 낮은 심도라고 약해지지 않게.)
export const BOSS_FLOOR = { hp: 760, atk: 21 };

// 위험도/품질선 읽힘 태그(dev 관측용 — 전투 타입 + 밴드 + 조직화 상태).
export function combatDirectorTag(routeType, depth, alertness, party4Reached) {
  const band = depthBand(depth);
  const t = [`B${band.id}`];
  if (routeType === "elite") t.push("ELITE_FLOOR");
  else if (routeType === "boss") t.push("BOSS_FLOOR");
  else if (routeType === "danger") t.push("RISK");
  if (!party4Reached) t.push("PRE4");
  if (alertness >= 4) t.push("ORG");
  return t;
}

/* =========================================================
   Depth Band Director 01 — Forest Pressure Wave 01.
   "심도는 계속 조금씩 어려워지는 계단이 아니라, 숨 고르기와 긴장이 번갈아 오는 숲의 호흡이어야 한다."
   현재 director(적 수/스탯/조합) 위에 5단계 pressure band(아주쉬움~아주어려움) 파형을 얹는다 —
   작고 되돌리기 쉬운 레이어. ★raw HP/ATK multiplier·기본 스탯·파티 수 스케일링은 건드리지 않는다.
   band가 바꾸는 것: ① d6~9 friction 적 수 완충(±1) ② 역할 조합 조직화 정도(기존 directorRoles 경계도 레버 재사용).
   ★deterministic: 같은 (route, depth, alertness[, seed])면 항상 같은 band. Math.random 미사용(state 무오염).
   ========================================================= */
export const PRESSURE_BANDS = [
  { id: "veryEasy", label: "아주 쉬움" },
  { id: "easy",     label: "쉬움" },
  { id: "normal",   label: "평이" },
  { id: "hard",     label: "어려움" },
  { id: "veryHard", label: "아주 어려움" },
];
// 기본 분포(누적): 아주쉬움 3% / 쉬움 30% / 평이 40% / 어려움 25% / 아주어려움 2%.
//   고정 확률로 박지 않고 bandHardShift로 depth+alertness+route에 따라 어려운 쪽으로 자연 이동(아래).
const BAND_BASE_CUM = [0.03, 0.33, 0.73, 0.98, 1.0];
const BAND_ROUTE_CODE = { normal: 1, ally: 2, bond: 3, danger: 4, elite: 5, boss: 6, rest: 7 };
const BAND_RUNWAY_MIN = 6, BAND_RUNWAY_MAX = 9; // d6~9 런웨이(초중반 붕괴 좌표) — 적 수 완충 집중 구간
// band → ordinary combat 보정(작고 되돌리기 쉬움). roleAlertDelta=조직화(directorRoles 경계도 보정), runwayCountDelta=d6~9 friction 적 수.
//   ★veryHard는 이번 단계에서 일반 전투 스파이크 금지 → hard와 동일한 기계 효과(rare label만). 고압 스파이크는 미래(Omen/Monster House 등)로.
const BAND_MOD = {
  veryEasy: { roleAlertDelta: -2, runwayCountDelta: -1 },
  easy:     { roleAlertDelta: -1, runwayCountDelta: -1 },
  normal:   { roleAlertDelta: 0,  runwayCountDelta: 0 },
  hard:     { roleAlertDelta: 1,  runwayCountDelta: 0 },
  veryHard: { roleAlertDelta: 1,  runwayCountDelta: 0 },
};
// 결정적 의사난수 0..1 — Math.random 미사용·state 무오염. 같은 입력=같은 값. seed 없으면 0(심도 파형 기준).
function bandNoise(seed, depth, routeType, alertness) {
  let h = ((seed >>> 0) + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (depth + 1), 0x85ebca6b);
  h = Math.imul(h ^ ((BAND_ROUTE_CODE[routeType] || 0) + 0x165667b1), 0xc2b2ae35);
  h = Math.imul(h ^ ((alertness || 0) + 1), 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// depth+alertness+route가 분포를 "어려운 쪽"으로 미는 정도(상한 cap). cap 덕분에 후반/고경계에도 easy/veryEasy가 사라지지 않는다(쉬어가기 보존).
function bandHardShift(depth, alertness, routeType, isElite) {
  let s = Math.min(0.14, Math.max(0, (depth || 1) - 8) * 0.012) + Math.min(0.08, (alertness || 0) * 0.016);
  if (routeType === "danger") s += 0.06;
  if (isElite) s += 0.05;
  return Math.min(0.24, s);
}
// 결정적 pressure band. boss는 BOSS_FLOOR라 파형 미적용(label만). 반환은 표시/적용 공용(roleAlertDelta·runwayCountDelta는 적용 가능 형태로 게이트됨).
export function pressureBand(routeType, depth, alertness, seed = 0) {
  const isBoss = routeType === "boss", isElite = routeType === "elite";
  if (isBoss) return { id: "normal", label: "평이", roleAlertDelta: 0, runwayCountDelta: 0, inRunway: false, applied: false, noise: 0, shift: 0, reason: "보스=BOSS_FLOOR (파형 미적용 · label만)" };
  const a = alertness || 0;
  const noise = bandNoise(seed, depth, routeType, a);
  const shift = bandHardShift(depth, a, routeType, isElite);
  const v = Math.max(0, Math.min(0.999999, noise + shift));
  let idx = BAND_BASE_CUM.findIndex((c) => v < c); if (idx < 0) idx = PRESSURE_BANDS.length - 1;
  const b = PRESSURE_BANDS[idx], mod = BAND_MOD[b.id];
  const inRunway = depth >= BAND_RUNWAY_MIN && depth <= BAND_RUNWAY_MAX;
  const friction = routeType === "normal" || routeType === "ally" || routeType === "bond";
  const runwayCountDelta = (inRunway && friction) ? mod.runwayCountDelta : 0; // danger/elite·런웨이 밖은 적 수 완충 안 함(정체성 유지)
  return {
    id: b.id, label: b.label, roleAlertDelta: mod.roleAlertDelta, runwayCountDelta, inRunway, applied: true,
    noise: Math.round(noise * 1000) / 1000, shift: Math.round(shift * 1000) / 1000,
    reason: `noise ${noise.toFixed(2)} + shift ${shift.toFixed(2)} → ${b.label}` + (runwayCountDelta ? ` · d6~9 적 수 ${runwayCountDelta}` : "") + (mod.roleAlertDelta ? ` · 조직화 ${mod.roleAlertDelta > 0 ? "+" : ""}${mod.roleAlertDelta}` : ""),
  };
}
// band 적용 유효 경계도(조직화) — directorRoles 입력 보정용. clamp [0, MAX_ALERTNESS]. 적 수/스탯은 안 건드린다.
export function bandAdjustedAlertness(alertness, band) {
  return Math.max(0, Math.min(MAX_ALERTNESS, (alertness || 0) + ((band && band.roleAlertDelta) || 0)));
}
// band runway 적 수 완충을 역할 배열에 적용(friction·d6~9에서만 -1, 최소 2 보장). danger/elite/런웨이밖은 그대로.
export function applyBandRunwayCount(roles, band) {
  if (!band || !band.runwayCountDelta) return roles;
  return roles.slice(0, Math.max(2, roles.length + band.runwayCountDelta));
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
// Route Grammar 02B — 영입/합체가 이제 전투 비용을 가지므로(무료 영입/합체 아님) 파밍 예고를 느슨하게.
//   4인 완성에 보통 영입 전투 2~3회가 드므로 그보다 넉넉히 잡아 정상 파티 빌드는 경고하지 않는다.
export const FARM_GRACE = 6; // 4인 전 이 횟수까지의 전투는 잠복(예고만 — 즉시 처벌 아님)
export const FARM_STEP = 3;  // 이후 N전투마다 잠복 경계도가 1씩 누설(실제 경계도까지만)

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
