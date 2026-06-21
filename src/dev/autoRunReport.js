// =====================================================================
// Auto Run Report 02 — Player Policy Profiles + Beginner Early Cushion 01 (A/B)
//   (Auto Run Report 01/01A 위 확장 — Blind Spot Explorer / 100+ Run Stats Dashboard)
//
//   목적: ① 자동 정책을 고도화해 "무모한 플레이 vs 사람에 가까운 안정 운영"을 비교하고,
//         ② 초반 1~8 전멸이 "정책 문제"인지 "실제 난도 문제"인지 분리하며,
//         ③ Early Cushion 01(초반 완충) 실험안을 Baseline과 A/B로 비교한다.
//   분리: 본게임 전투 엔진/런 흐름(battle.js)을 헤드리스로 그대로 구동(정책은 UI 대신 flow 함수 호출).
//         **전투식/직업스탯/스킬/몬스터/합체/보상/스테이지 데이터는 일절 바꾸지 않는다.**
//         Early Cushion(완충)은 본게임 기본값이 아니라 "headless 자동 주회의 실험 프로필에서만" 적용한다
//         (정책/드라이버 레벨 보정 — 4인 전 안전 라우팅 + 합체 직후 보호막. 엔진/데이터 무수정).
//   오염: 발자취/localStorage 미기록(battle.js headless 가드), 본게임 state는 deep snapshot→완전 복구(01A).
//         별도 엔트리(dev/auto-run-report.html)로 일반 플레이엔 노출되지 않는다.
// =====================================================================
import { gameState, SLOT_ORDER } from "../core/state.js";
import {
  setHeadlessRun, runHeadlessBattle,
  startRun, applyReward, applyFusion, skipFusion, continueAfterFusion,
  previewRecruit, confirmRecruit, confirmArrange, chooseRoute, continueFromRest,
  partyJobIds,
} from "../core/battle.js";
import {
  BASE_JOBS, ADVANCED_JOBS, SECOND_CLASS_JOBS, ACTIVE_FUSION_RECIPES, availableFusions,
  slotPreference, combatRoleOf,
} from "../data/jobs.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { rewardById } from "../data/rewards.js";

/* ── 이름/포맷 헬퍼 ─────────────────────────────────────────────── */
const jobName = (id) => (UNIT_TEMPLATES.party[id] && UNIT_TEMPLATES.party[id].name) || id;
const rewardName = (id) => { const r = rewardById(id); return (r && r.name) || id; };
const isSecond = (id) => SECOND_CLASS_JOBS.includes(id);
const fmt1 = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const fmtPct = (n) => (Math.round((n || 0) * 1000) / 10).toFixed(1) + "%";
const rand = () => Math.random();
const pick = (a) => a[Math.floor(rand() * a.length)];
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
function preferIds(offer, preferred) { const p = offer.filter((id) => preferred.includes(id)); return pick(p.length ? p : offer); }

/* ── seed(선택) — Math.random 교체로 엔진+정책 전체를 결정론화 ────────── */
let savedRandom = null;
function installSeed(seed) {
  savedRandom = Math.random;
  let s = seed >>> 0;
  Math.random = function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function restoreRandom() { if (savedRandom) { Math.random = savedRandom; savedRandom = null; } }

/* ── 직업/보상 카테고리(정책 선호용 — 데이터 변경 아님, 분류만) ────────── */
const SURVIVAL_BASE = ["priest", "cleric", "guardian"];           // 생존 기여 기본직업(영입 후보)
const ATTACK_BASE = ["warrior", "archer", "trickster"];           // 공격형 기본직업
const SURVIVAL_REWARDS = ["survival", "balance", "frontline", "tank", "support", "recovery"];
const ATTACK_REWARDS = ["offense", "backline", "melee", "ranged"];
const BALANCED_REWARDS = ["survival", "balance", "offense", "frontline", "melee", "ranged"]; // 안정 성장가(생존+공격 균형)
const BASE_RECIPES = ACTIVE_FUSION_RECIPES.filter((r) => r.materials.every((m) => BASE_JOBS.includes(m)));
// 2차 레시피의 재료(1차/기본) 집합 — "2차로 가는 1차"를 선호하기 위함.
const SECOND_MATERIALS = new Set(ACTIVE_FUSION_RECIPES.filter((r) => isSecond(r.result)).flatMap((r) => r.materials));

/* ── 런 컨텍스트 헬퍼(정책 판단 — gameState 실시간 조회) ──────────────── */
function aliveParty() { return gameState.party.filter((u) => !u.isDead); }
function partyHpRatio() { const a = aliveParty(); return a.length ? a.reduce((s, u) => s + u.hp / u.maxHp, 0) / a.length : 1; }
function aliveHpStats() { const a = aliveParty(); if (!a.length) return { avg: 1, min: 1 }; const r = a.map((u) => Math.max(0, u.hp) / u.maxHp); return { avg: r.reduce((x, y) => x + y, 0) / r.length, min: Math.min(...r) }; }
function curPartySize() { return partyJobIds().length; }
function partyHasSecond() { return partyJobIds().some(isSecond); }
const isDealer = (id) => ["melee", "ranged"].includes(combatRoleOf(id));

/* ── 시작 편성(2인, 본게임과 동일하게 slotPreference 배치) ───────────── */
function makeFormation(jobs) {
  const f = { f0: null, f1: null, b0: null, b1: null };
  jobs.forEach((j) => { const slot = slotPreference(j).find((k) => !f[k]); if (slot) f[slot] = j; });
  return f;
}
function randomStartFormation() { return makeFormation(shuffle(BASE_JOBS).slice(0, 2)); }
function twoDistinct(pool) { const a = pick(pool); const b = pick(pool.filter((x) => x !== a)) || a; return [a, b]; }

/* ── 자동 플레이 정책(5종) ───────────────────────────────────────────
   각 정책은 UI 결정점을 대신 고른다(전투/런 규칙은 본게임 함수가 처리 — 복제/변경 없음).
   HP/파티 상태는 gameState 실시간 조회로 판단한다. */
const POLICIES = {
  // 1) 랜덤 탐험가 — 상상 못 한 조합/루트 탐색. 거의 균등 랜덤.
  random: {
    id: "random", label: "랜덤 탐험가", desc: "안 해본 조합 탐색(거의 균등 랜덤)",
    startFormation: randomStartFormation,
    pickReward: (offer) => pick(offer),
    decideFusion: (options) => (rand() < 0.5 ? pick(options).result : null),
    pickRecruit: (offer) => pick(offer),
    pickRoute: (choices) => pick(choices),
  },
  // 2) 합체 우선가 — 합체 가능하면 합체(2차 우선), 열쇠2면 보스.
  fusion: {
    id: "fusion", label: "합체 우선가", desc: "합체 욕심 루트(2차 결과 우선)",
    startFormation: () => makeFormation([...(pick(BASE_RECIPES) || { materials: ["warrior", "archer"] }).materials]),
    pickReward: (offer) => pick(offer),
    decideFusion: (options) => { const s = options.filter((o) => isSecond(o.result)); return (s.length ? pick(s) : pick(options)).result; },
    pickRecruit: (offer) => {
      const owned = partyJobIds();
      const useful = offer.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m))));
      return pick(useful.length ? useful : offer);
    },
    // Route Grammar 02 — 합체 우선: 결속의 공터(bond) 최우선, 4인 전엔 동료의 흔적(ally)으로 빈자리 보충(합체 자동 영입 없음).
    pickRoute: (choices) => { if (choices.includes("bond")) return "bond"; if (curPartySize() < 4 && choices.includes("ally")) return "ally"; if (choices.includes("boss")) return "boss"; return ["danger", "elite", "normal", "rest", "ally"].find((rt) => choices.includes(rt)) || choices[0]; },
  },
  // 3) 안정 운영가 — 생존/4인 완성 우선. "사람이 조심해서 플레이하면 어디까지 가는가".
  steady: {
    id: "steady", label: "안정 운영가", desc: "생존/4인 완성 우선",
    startFormation: () => { const s = pick(SURVIVAL_BASE); const o = pick(BASE_JOBS.filter((j) => j !== s)); return makeFormation([s, o]); },
    pickReward: (offer) => preferIds(offer, SURVIVAL_REWARDS),
    decideFusion: (options) => (partyHpRatio() < 0.6 ? null : pick(options).result), // 약하거나 HP 낮으면 보류
    pickRecruit: (offer) => preferIds(offer, SURVIVAL_BASE),                          // 생존 직업 우선으로 4인 완성
    // Route Grammar 02 — 4인 미만이면 동료의 흔적(ally) 우선으로 파티 완성, 상태 좋으면 결속의 공터(bond)로 합체 진행.
    pickRoute: (choices) => {
      const hurt = partyHpRatio() < 0.55; const size = curPartySize();
      if (hurt && choices.includes("rest")) return "rest";                            // 다치면 회복 우선(죽음 나선 차단)
      if (size < 4 && choices.includes("ally")) return "ally";                        // 영입 우선(파티 완성)
      if (choices.includes("boss") && size >= 4 && partyHpRatio() >= 0.6) return "boss"; // 키 충분+상태 좋으면 도전
      if (size >= 4 && choices.includes("bond") && partyHpRatio() >= 0.6) return "bond"; // 상태 좋으면 합체로 진행
      const order = hurt ? ["rest", "normal", "ally"] : ["normal", "elite", "danger", "rest", "ally"];
      return order.find((rt) => choices.includes(rt)) || choices[0];
    },
  },
  // 4) 공격 욕심가 — 딜/위험 선호. 고점과 폭사율 확인.
  aggressive: {
    id: "aggressive", label: "공격 욕심가", desc: "딜/위험 선호(고점·폭사 확인)",
    startFormation: () => makeFormation(twoDistinct(ATTACK_BASE)),
    pickReward: (offer) => preferIds(offer, ATTACK_REWARDS),
    decideFusion: (options) => { const d = options.filter((o) => isDealer(o.result)); return (d.length ? pick(d) : pick(options)).result; },
    pickRecruit: (offer) => preferIds(offer, ATTACK_BASE),
    // Route Grammar 02 — 깊은 수풀/현자의 가지 선호. 4인 전에도 위험을 밟는다(위험 진입은 별도 기록). 합체는 위험 없을 때만.
    pickRoute: (choices) => {
      if (partyHpRatio() < 0.25 && choices.includes("rest")) return "rest";           // HP 매우 낮을 때만 휴식
      if (choices.includes("boss")) return "boss";                                    // 빠른 보스 도전
      return ["danger", "elite", "bond", "normal", "ally", "rest"].find((rt) => choices.includes(rt)) || choices[0]; // 위험/정예 선호
    },
  },
  // 5) 2차 추적가 — 2차 확보 우선. "2차를 목표로 하면 실제로 보는가".
  secondChaser: {
    id: "secondChaser", label: "2차 추적가", desc: "2차 확보 우선",
    startFormation: () => makeFormation([...(pick(BASE_RECIPES) || { materials: ["warrior", "archer"] }).materials]),
    pickReward: (offer) => preferIds(offer, SURVIVAL_REWARDS),                         // 살아남아 2차까지 — 생존 약간 선호
    decideFusion: (options) => {
      if (partyHpRatio() < 0.4) return null;                                           // HP 너무 낮으면 안정 선택(보류)
      const second = options.filter((o) => isSecond(o.result));
      if (second.length) return pick(second).result;                                  // 2차 최우선
      const toward = options.filter((o) => SECOND_MATERIALS.has(o.result));            // 2차로 가는 1차 우선
      return (toward.length ? pick(toward) : pick(options)).result;
    },
    pickRecruit: (offer) => {
      const owned = partyJobIds();
      const useful = offer.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m))));
      return pick(useful.length ? useful : offer);
    },
    // Route Grammar 02 — 2차 재료를 위해 영입(ally)·합체(bond)를 명시적으로 선택(합체 후 자동 영입 없음 반영).
    pickRoute: (choices) => {
      if (partyHpRatio() < 0.4 && choices.includes("rest")) return "rest";
      if (curPartySize() < 4 && choices.includes("ally")) return "ally";              // 2차 재료 영입
      if (choices.includes("bond")) return "bond";                                    // 합체로 2차 추적
      if (choices.includes("boss") && partyHasSecond()) return "boss";                // 2차 확보 + 키 있으면 도전
      return ["elite", "danger", "normal", "rest", "ally"].find((rt) => choices.includes(rt)) || choices[0];
    },
  },
  // 6) 안정 성장가 — 상식적 사람 플레이 기준 정책. 생존 확보 후 성장/정예/보스키/합체를 적당히 추진.
  //    Auto Run Report 02 발견(안정 운영가는 오래 살지만 클리어 0%)을 보완 — 생존만이 아니라 "진행"을 챙긴다.
  steadyGrowth: {
    id: "steadyGrowth", label: "안정 성장가", desc: "생존 확보 후 성장·정예·보스키·합체 적극(기준 정책)",
    startFormation: () => { const s = pick(SURVIVAL_BASE); const o = pick(BASE_JOBS.filter((j) => j !== s)); return makeFormation([s, o]); },
    pickReward: (offer) => preferIds(offer, BALANCED_REWARDS),
    decideFusion: (options) => {
      if (partyHpRatio() < 0.45) return null;                                          // HP 너무 낮으면 보류
      const second = options.filter((o) => isSecond(o.result));
      if (second.length) return pick(second).result;                                  // 2차로 이어지면 우선
      return pick(options).result;                                                     // 4인 이후 합체 자체가 진행(강한 결과 무관)
    },
    pickRecruit: (offer) => {
      if (curPartySize() < 4) {                                                         // 4인 전엔 합체 재료 우선(없으면 아무거나)
        const owned = partyJobIds();
        const useful = offer.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m))));
        return pick(useful.length ? useful : offer);
      }
      return pick(offer);
    },
    // Route Grammar 02 — 4인 미만이면 동료의 흔적(ally) 우선, 상태 ok면 결속의 공터(bond)로 합체 진행(즉시 강제 합체 아님).
    //   합체로 3인이 되면 무리한 위험보다 ally/쉼터/안전 성장 우선(빈자리 리스크 이해).
    pickRoute: (choices) => {
      const hurt = partyHpRatio() < 0.5; const size = curPartySize();
      if (hurt && choices.includes("rest")) return "rest";                              // HP 낮으면 회복
      if (size < 4 && choices.includes("ally")) return "ally";                          // 영입 우선(파티 완성)
      if (choices.includes("boss") && size >= 4 && partyHpRatio() >= 0.55) return "boss"; // 키 충분+상태 ok면 도전
      if (size >= 4 && choices.includes("bond") && partyHpRatio() >= 0.55) return "bond"; // 상태 ok면 합체로 진행
      if (size < 4) { const safe = ["ally", "rest", "normal"].find((rt) => choices.includes(rt)); if (safe) return safe; } // 3인 무리한 위험 회피
      // 4인 이후: 보스키/성장을 위해 정예·위험을 적극(안정 운영가보다 공격적), 너무 다치면 회복.
      const order = hurt ? ["rest", "normal", "ally"] : ["elite", "danger", "normal", "rest"];
      return order.find((rt) => choices.includes(rt)) || choices[0];
    },
  },
  // 7) 합체 욕심가(빈자리) — Route Grammar 02: 합체 후 보충 없이 3인으로 밀어붙인다("합체 후 자동 영입 없음"을 적극 활용/시험).
  //    첫 합체 전엔 동료의 흔적으로 4인을 채우고, 합체(결속의 공터) 후엔 빈자리를 안 채우고 위험/보스로 욕심낸다.
  fusionGreedy: {
    id: "fusionGreedy", label: "합체 욕심가(빈자리)", desc: "합체 후 보충 없이 3인 고급 파티로 밀어붙임(빈자리 리스크 관측)",
    startFormation: () => makeFormation([...(pick(BASE_RECIPES) || { materials: ["warrior", "archer"] }).materials]),
    pickReward: (offer) => pick(offer),
    decideFusion: (options) => { const s = options.filter((o) => isSecond(o.result)); return (s.length ? pick(s) : pick(options)).result; },
    pickRecruit: (offer) => { const owned = partyJobIds(); const u = offer.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m)))); return pick(u.length ? u : offer); },
    pickRoute: (choices) => {
      const size = curPartySize(); const fused = (gameState.run.fusionCount || 0) > 0;
      if (choices.includes("bond")) return "bond";                                      // 합체 최우선
      if (size < 4 && !fused && choices.includes("ally")) return "ally";                // 첫 합체 전엔 4인 채움
      if (choices.includes("boss")) return "boss";                                      // 3인이어도 보스 욕심
      if (partyHpRatio() < 0.3 && choices.includes("rest")) return "rest";
      return ["danger", "elite", "normal", "rest", "ally"].find((rt) => choices.includes(rt)) || choices[0]; // 합체 후 3인: 보충(ally) 대신 위험
    },
  },
};
const POLICY_ORDER = ["random", "fusion", "steady", "steadyGrowth", "aggressive", "secondChaser", "fusionGreedy"];

/* ── 실험 프로필(Baseline / Early Cushion 01) ─────────────────────────
   Early Cushion 01 = headless 실험 전용 완충(본게임 기본값 무변경, baseline은 보정 0):
     (1) 4인 파티 완성 전 + HP 낮을 때 안전 라우팅 보정(정책 라우트 위에 덮어씀):
         - 다치면(평균HP<55%) 쉼터 우선(회복) / 건강하면 영입 주는 깊은 수풀로 4인 채움.
     (2) 합체 직후 다음 전투 1회에 한해 파티 전체 maxHp 12% 보호막(합체 후 인원/HP 흔들림 완화).
   둘 다 "정책/드라이버 판단 보정"이라 적/직업/스킬/보상 수치를 건드리지 않는다. */
// Auto Run Report 04 — A/B 실험 프로필(headless 전용 보정, baseline은 보정 0).
//   각 프로필은 본게임 데이터를 바꾸지 않고 "드라이버 판단/헤드리스 보정"만 한다:
//     route(policyChoice, choices, ctx) → 정책 라우트 위 안전 라우팅 보정
//     preBattle(ctx) → 전투 시작 직전 headless 보정(party.shield 부여 / 이번 전투 적 스탯 완화)
//   둘 다 적/직업/스킬/보상 수치를 영구 변경하지 않는다(전투당 한정, 배치 종료 시 state 복구).
function shieldParty(pct) { gameState.party.forEach((u) => { if (!u.isDead) u.shield = Math.max(u.shield || 0, Math.round(u.maxHp * pct)); }); }
function nerfEnemies(hpMul, atkMul) { gameState.enemies.forEach((e) => { e.maxHp = Math.max(1, Math.round(e.maxHp * hpMul)); e.hp = Math.min(e.hp, e.maxHp); e.atk = Math.max(1, Math.round(e.atk * atkMul)); }); }
const has = (choices, x) => choices.includes(x);
function safeWhenFragile(pc, c, ctx) { // 다치면 회복 / 4인 전엔 영입(깊은수풀)·일반, 위험·정예 억제
  if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest";
  if (ctx.partySize < 4) { if (ctx.hpRatio >= 0.55 && has(c, "danger")) return "danger"; if (has(c, "normal")) return "normal"; if (has(c, "rest")) return "rest"; }
  return pc;
}
const PROFILES = {
  baseline: { id: "baseline", label: "Baseline", desc: "현재 본게임 규칙 그대로(보정 0)" },
  cushion: {
    id: "cushion", label: "Early Cushion 01", desc: "4인 전 안전 라우팅 + 합체 직후 1전투 보호막(12%)",
    route: (pc, c, ctx) => { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (ctx.partySize < 4 && ctx.hpRatio >= 0.55 && has(c, "danger")) return "danger"; return pc; },
    preBattle: (ctx) => { if (ctx.sinceFusion === 0) shieldParty(0.12); },
  },
  cushion2: {
    id: "cushion2", label: "Early Cushion 02", desc: "초반(심도≤8)·4인 전 매 전투 보호막(15%) 강화 + 안전 라우팅 + 합체 직후 보호막",
    route: (pc, c, ctx) => { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (ctx.partySize < 4 && ctx.hpRatio >= 0.55 && has(c, "danger")) return "danger"; return pc; },
    preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.partySize < 4) shieldParty(0.15); else if (ctx.sinceFusion === 0) shieldParty(0.12); },
  },
  recruitSafe: {
    id: "recruitSafe", label: "Recruit Safety 01", desc: "4인 미만이면 영입/안전 루트 가중·위험/정예/보스 억제(4인 후 정책 그대로)",
    route: (pc, c, ctx) => { if (ctx.partySize < 4) return safeWhenFragile(pc, c, ctx); return pc; },
  },
  fusionSafe: {
    id: "fusionSafe", label: "First Fusion Safety 01", desc: "첫 합체 후 1~2전투 보호막(12%) + 안전 경로(합체 직후 위험·정예 억제)",
    route: (pc, c, ctx) => { if (ctx.sinceFusion != null && ctx.sinceFusion <= 1) { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (has(c, "normal")) return "normal"; } return pc; },
    preBattle: (ctx) => { if (ctx.sinceFusion != null && ctx.sinceFusion <= 1) shieldParty(0.12); },
  },
  softRamp: {
    id: "softRamp", label: "Soft Ramp 01", desc: "심도 1~8 적 HP×0.85·공격×0.9 완화(보스 불변) — 초반 성장 곡선만 완화 시뮬",
    preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.routeType !== "boss") nerfEnemies(0.85, 0.9); },
  },
  guided: {
    id: "guided", label: "Guided Beginner 01", desc: "초반(심도≤10) 영입→쉼터→일반→정예 순서 유도(4인·건강할 때만 정예/보스)",
    route: (pc, c, ctx) => { if (ctx.depth <= 10 || ctx.partySize < 4) { const safe = safeWhenFragile(pc, c, ctx); if (ctx.partySize < 4) return safe; if (ctx.hpRatio < 0.6 && (pc === "elite" || pc === "danger" || pc === "boss")) return safe; } return pc; },
  },
  safeElite: {
    id: "safeElite", label: "Safe Elite Gate 01", desc: "정예/위험은 4인·HP≥60%일 때만 진입(아니면 일반/쉼터로 대체)",
    route: (pc, c, ctx) => { if ((pc === "elite" || pc === "danger") && !(ctx.partySize >= 4 && ctx.hpRatio >= 0.6)) { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (has(c, "normal")) return "normal"; } return pc; },
  },
  // ── Observation Batch 01 — Soft Ramp Split (분해 실험 프로필) ─────────────
  //   softRamp 01(= 심도1~8 적 HP×0.85·공격×0.9, 보스 제외)을 성분/구간/상황별로 쪼개
  //   "어느 성분이 런을 살리는지"를 관측한다. 전부 headless preBattle 보정만(전투당 한정,
  //   적/직업/스킬/보상 수치를 영구 변경하지 않음 — 배치 종료 시 state 복구). 밸런스 확정 아님.
  //   nerfEnemies(hpMul=1.0 / atkMul=1.0)은 사실상 no-op이라 해당 성분만 완화된다.
  softRampHp: {
    id: "softRampHp", label: "Soft Ramp HP Only 01", split: true,
    desc: "심도1~8 적 HP×0.85만 완화(공격 불변) — '초반 전투를 오래 버티기만 하면 사는가' 관측",
    preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.routeType !== "boss") nerfEnemies(0.85, 1.0); },
  },
  softRampAtk: {
    id: "softRampAtk", label: "Soft Ramp ATK Only 01", split: true,
    desc: "심도1~8 적 공격×0.9만 완화(HP 불변) — '급사·한 번에 터짐이 핵심인가' 관측",
    preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.routeType !== "boss") nerfEnemies(1.0, 0.9); },
  },
  softRampEarly: {
    id: "softRampEarly", label: "Soft Ramp Early Only 01", split: true,
    desc: "심도1~8에만 HP×0.85·공격×0.9, 중후반 baseline — EARLY_WIPE_1_8 완화만으로 9+ 도달이 오르는가(= Soft Ramp 01 양성분·초반밴드 기준선)",
    preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.routeType !== "boss") nerfEnemies(0.85, 0.9); },
  },
  softRampDanger: {
    id: "softRampDanger", label: "Soft Ramp Danger Only 01", split: true,
    desc: "위험/정예 전투에만 HP×0.85·공격×0.9(일반/보스 baseline, 심도 무관) — N>D>WIPE·ELITE_GREED가 과징벌인가 관측",
    preBattle: (ctx) => { if (ctx.routeType === "danger" || ctx.routeType === "elite") nerfEnemies(0.85, 0.9); },
  },
  party3Danger: {
    id: "party3Danger", label: "Party-3 Danger Cushion 01", split: true,
    desc: "4인 미만(2~3인)으로 위험/정예에 진입한 전투에만 HP×0.85·공격×0.9 — '4인 미완성 파티가 위험 전투에서 한 번에 터짐'이 핵심인가",
    preBattle: (ctx) => { if (ctx.partySize < 4 && (ctx.routeType === "danger" || ctx.routeType === "elite")) nerfEnemies(0.85, 0.9); },
  },
  postFusion: {
    id: "postFusion", label: "Post Fusion Cushion 01", split: true,
    desc: "첫 합체 후 1~3전투에만 파티 보호막 12% — POST_FUSION_WIPE가 합체 구조의 재미있는 리스크인가 구조적 벌칙인가",
    preBattle: (ctx) => { if (ctx.sinceFusion != null && ctx.sinceFusion <= 2) shieldParty(0.12); },
  },
};
const PROFILE_ORDER = ["baseline", "cushion", "cushion2", "recruitSafe", "fusionSafe", "softRamp", "guided", "safeElite",
  "softRampHp", "softRampAtk", "softRampEarly", "softRampDanger", "party3Danger", "postFusion"];
// Soft Ramp Split 비교 패널의 행 순서(baseline + softRamp 01 양성분 기준선 + 6 split).
const SPLIT_PROFILE_ORDER = ["baseline", "softRamp", "softRampHp", "softRampAtk", "softRampEarly", "softRampDanger", "party3Danger", "postFusion"];

// Auto Run Report 04 — 역할군 분류(Balance Lab 03 ROLE_GROUP과 이름 일치). 의존도/축 판정용.
const ROLE_AR = {
  warrior: "singleDps", guardian: "tank", archer: "singleDps", priest: "healer", cleric: "shielder", trickster: "control",
  rogue: "singleDps", saint: "healer", warden: "debuff", watchbow: "counter", trapper: "debuff", paladin: "tank",
  vanguard: "aoeDps", forbidden: "tank", wall: "tank", healbow: "healer", purifier: "healer", mage: "aoeDps",
  bard: "support", gatekeeper: "tank", tracker: "marker",
  dragonspear: "pierce", sage: "aoeDps", sunlord: "support", swordsaint: "counter", redeemer: "healer",
  skyarcher: "marker", plaguebringer: "debuff", dancer: "support", wardkeeper: "shielder",
};
const roleAr = (id) => ROLE_AR[id] || "support";
const jobsHaveRole = (set, role) => [...set].some((j) => roleAr(j) === role);
const AXES = {
  hasHealer: (set) => jobsHaveRole(set, "healer"),
  hasTank: (set) => jobsHaveRole(set, "tank"),
  hasShield: (set) => jobsHaveRole(set, "shielder"),
  hasAoE: (set) => jobsHaveRole(set, "aoeDps") || jobsHaveRole(set, "pierce"),
  hasSecondClass: (set) => [...set].some((j) => SECOND_CLASS_JOBS.includes(j)),
};

/* ── Auto Run Report 03 — 테마 정의 / 목표 / PASS·WATCH·FAIL 판정 ──────────
   테마 검증용 대시보드 기반. 현재 본게임은 초보자 숲만 구현 → beginner만 enabled,
   나머지는 "준비 중"(disabled)으로 구조만 확장(미래 테마 추가 시 데이터만 더하면 됨).
   ※ 이번 03에서 실제 헤드리스 주회는 항상 본게임(초보자 숲) 엔진으로 돈다. 테마 선택은
     "목표 범위 + 판정 + 결과 태그"를 정하는 것이며, 비활성 테마는 선택 불가(데이터 미구현).
   목표값은 절대 밸런스 확정값이 아니라 "대시보드 판정용 초기 목표"다 — THEME_TARGETS만 고치면 조정된다. */
const THEMES = {
  beginner: { id: "beginner", label: "초보자 숲 / Beginner Forest", enabled: true, desc: "모두가 어느 정도 지나갈 수 있어야 하는 입문 테마. 접대는 해도 '내가 잘해서 이겼다'는 감정이 있어야 한다." },
  poison: { id: "poison", label: "독무 늪지 / Poison Marsh", enabled: false, desc: "준비 중 — 테마 데이터 미구현." },
  citadel: { id: "citadel", label: "장갑 성채 / Armored Citadel", enabled: false, desc: "준비 중 — 테마 데이터 미구현." },
  shadow: { id: "shadow", label: "그림자 습격대 / Shadow Raiders", enabled: false, desc: "준비 중 — 테마 데이터 미구현." },
  goblin: { id: "goblin", label: "고블린 캠프 / Goblin Camp", enabled: false, desc: "준비 중 — 테마 데이터 미구현." },
  troll: { id: "troll", label: "트롤 굴 / Troll Den", enabled: false, desc: "준비 중 — 테마 데이터 미구현." },
  toxic: { id: "toxic", label: "중독 늪 / Toxic Swamp", enabled: false, desc: "준비 중 — 테마 데이터 미구현." },
};
const THEME_ORDER = ["beginner", "poison", "citadel", "shadow", "goblin", "troll", "toxic"];

// 테마별 목표(common = 정책 공통 / policies = 정책별). 비율(0~1). 나라/유키가 실기 후 이 객체만 조정.
const THEME_TARGETS = {
  beginner: {
    common: {
      reached9: 0.70, reached17: 0.40, reached25Min: 0.20, reached25Max: 0.35,
      bossAttemptMin: 0.35, bossAttemptMax: 0.55, bossKillOnAttemptMin: 0.60, bossKillOnAttemptMax: 0.80,
      firstParty4: 0.80, firstFusionMin: 0.40, firstFusionMax: 0.60,
    },
    policies: {
      random: { clearMin: 0.15, clearMax: 0.30, reached9: 0.60, firstParty4: 0.70, note: "안 해본 조합 탐색 — 변동 큼" },
      fusion: { clearMin: 0.10, clearMax: 0.25, reached9: 0.50, firstFusion: 0.50, note: "2차런 수 증가가 중요" },
      steady: { clearMin: 0.45, clearMax: 0.65, reached17: 0.50, note: "보스 도전률 낮으면 WATCH" },
      steadyGrowth: { clearMin: 0.60, clearMax: 0.80, note: "상식적 사람 플레이 기준 정책" },
      aggressive: { clearMin: 0.20, clearMax: 0.40, note: "고점↑ — 1-8 전멸 과도하면 WATCH" },
      secondChaser: { clearMin: 0.25, clearMax: 0.45, note: "firstSecondClass/secondRuns/secondClearRate 중요" },
    },
  },
};
function policyTarget(themeId, policyId) {
  const t = THEME_TARGETS[themeId] || THEME_TARGETS.beginner;
  return { ...t.common, ...((t.policies && t.policies[policyId]) || {}) };
}

// 판정: 목표 범위 안=PASS / 살짝 벗어남=WATCH / 크게 벗어남=FAIL.
function clearVerdict(rate, tgt) {
  if (tgt.clearMin == null) return "—";
  if (rate >= tgt.clearMin && rate <= tgt.clearMax) return "PASS";
  if (rate >= tgt.clearMin - 0.10 && rate <= tgt.clearMax + 0.15) return "WATCH";
  return "FAIL";
}
export function evaluateTheme(themeId, policyId, a) {
  const tgt = policyTarget(themeId, policyId);
  const N = a.attempts || 1;
  const stable = policyId === "steady" || policyId === "steadyGrowth";
  const clear = clearVerdict(a.clearRate, tgt);
  const edRate = a.deaths1to8 / N;
  const earlyDeath = edRate >= (stable ? 0.50 : 0.70) ? "FAIL" : edRate >= (stable ? 0.35 : 0.55) ? "WATCH" : "PASS";
  const r9 = a.reached9 / N, p4 = a.firstParty4Rate;
  const tgt9 = tgt.reached9 ?? 0.60, tgtP4 = tgt.firstParty4 ?? 0.80;
  const funReach = (r9 >= tgt9 && p4 >= tgtP4) ? "PASS" : (r9 >= tgt9 * 0.7 && p4 >= tgtP4 * 0.7) ? "WATCH" : "FAIL";
  let bossFlow;
  if (a.bossAttemptRate < 0.05) bossFlow = "WATCH"; // 거의 도전 못 함 → 진행 부족
  else {
    const attemptOk = a.bossAttemptRate >= (tgt.bossAttemptMin ?? 0.35) * 0.6;
    const killOk = a.bossKillOnAttemptRate >= (tgt.bossKillOnAttemptMin ?? 0.60);
    bossFlow = attemptOk && killOk ? "PASS" : "WATCH";
  }
  const all = [clear, earlyDeath, funReach, bossFlow];
  const overall = all.includes("FAIL") ? "FAIL" : all.includes("WATCH") ? "WATCH" : "PASS";
  return { clear, earlyDeath, funReach, bossFlow, overall, target: tgt };
}
// 자동 해석 문구.
function validationFlags(themeId, policyId, a) {
  const f = [];
  const N = a.attempts || 1;
  const stable = policyId === "steady" || policyId === "steadyGrowth";
  const tgt = policyTarget(themeId, policyId);
  if (a.deaths1to8 / N >= (stable ? 0.50 : 0.70)) f.push("초반 1~8 전멸이 높음 — First Fun Reach Watch");
  if (a.clearRate < 0.05 && a.avgDepth >= 9) f.push("오래 생존하지만 클리어 0% — Key/Fusion Progression Watch");
  if (a.bossAttemptRate >= 0.10 && a.bossKillOnAttemptRate > 0.85) f.push("보스 도전 시 처치율 높음 — 보스보다 보스 전 진행이 병목");
  if (a.secondRuns / N < 0.10) f.push("2차 확보런 수가 낮음 — Second Class Access Watch");
  if (a.firstParty4Rate < (tgt.firstParty4 ?? 0.80)) f.push("첫 4인 도달률 낮음 — Party Formation Watch");
  if (a.firstFusionRate < (tgt.firstFusion ?? tgt.firstFusionMin ?? 0.40)) f.push("첫 합체 경험률 낮음 — Fusion Access Watch");
  if (!f.length) f.push("뚜렷한 경고 없음 — 목표 범위 내에서 안정적.");
  return f;
}

/* ── 풀-런 1회 구동(screen 전이 상태머신 + 정책 + 프로필) ─────────────── */
const MAX_DECISIONS = 400;
const MAX_BATTLES = 60;

// Route Grammar 02 — 새 토큰: ALLY=동료의 흔적(영입), BOND=결속의 공터(합체). 전투 루트(N/D/E)는 전투 핸들러에서 push.
const ROUTE_TOKEN = { normal: "N", danger: "D", elite: "E", boss: "BOSS", ally: "ALLY", bond: "BOND", rest: "REST" };
const hasFirstClass = () => partyJobIds().some((j) => ADVANCED_JOBS.includes(j));

function playOneRun(policy, profileId, themeId, runIndex) {
  const rec = {
    runIndex, policy: policy.id, profile: profileId, theme: themeId, result: null, finalDepth: 0,
    battleCount: 0, fusionCount: 0, recruitCount: 0, faintCount: 0,
    bossAttempted: false, bossKilled: false,
    finalParty: [], secondClassCount: 0, gotSecondClass: false,
    selectedRewards: [], routeChoices: [], endReason: "", jobsSeen: new Set(),
    // 재미 도달 지표(없으면 0)
    firstFusionDepth: 0, firstRecruitDepth: 0, partySize4Depth: 0, firstSecondClassDepth: 0,
    firstFirstClassDepth: 0, firstEliteAttemptDepth: 0, firstEliteKillDepth: 0, firstBossKeyDepth: 0,
    bossAttemptDepth: 0, bossKillDepth: 0, firstRestDepth: 0, firstNearDeathDepth: 0,
    // 마일스톤 이후 생존용 battle index(없으면 null)
    party4BattleIdx: null, fusionBattleIdx: null, secondClassBattleIdx: null, eliteEnterBattleIdx: null, bossKeyBattleIdx: null,
    // 보스 흐름
    bossHalfHpSeen: false, bossHalfHpSeenDepth: 0, bossHpRemaining: null, bossAttemptPartySize: null, bossAttemptHpPercent: null,
    // 선택 경로
    path: [],
    // Observation Batch 01 — Danger Route Autopsy(위험/정예 진입 컨텍스트 + 추정 마커). failureTags와 별개로 부착.
    dangerEntries: [], dangerMarkers: [],
    // Route Grammar 02 — 루트 문법 관측: 루트 선택 카운트 + 합체 빈자리/보충 추적.
    routeCounts: { normal: 0, ally: 0, bond: 0, danger: 0, elite: 0, rest: 0, boss: 0 },
    firstRecruitRouteDepth: 0, firstFusionRouteDepth: 0, firstDangerDepth: 0,
    fusionCreatedEmptySlot: false, partySizeAfterFusion: null, recruitAfterFusionDepth: 0, battlesWhileUnder4AfterFusion: 0,
  };
  const profile = PROFILES[profileId] || PROFILES.baseline;
  let pendingRoute = "normal";      // 다음 전투의 길 종류(첫 전투는 도입=일반)
  let sinceFusion = null;            // 첫 합체 이후 전투 수(null=합체 전)
  let prevBossKeys = 0;
  const ctx = () => ({ depth: gameState.run.depth, partySize: curPartySize(), hpRatio: partyHpRatio(), routeType: pendingRoute, sinceFusion });

  startRun(policy.startFormation());

  let decisions = 0;
  while (true) {
    if (!rec.partySize4Depth && curPartySize() >= 4) { rec.partySize4Depth = gameState.run.depth; rec.party4BattleIdx = rec.battleCount; }
    if (!rec.firstSecondClassDepth && partyHasSecond()) { rec.firstSecondClassDepth = gameState.run.depth; rec.secondClassBattleIdx = rec.battleCount; }
    if (!rec.firstFirstClassDepth && hasFirstClass()) rec.firstFirstClassDepth = gameState.run.depth;

    if (gameState.run.result === "clear") { rec.result = "clear"; rec.endReason = "clear"; rec.bossKilled = true; rec.bossKillDepth = gameState.run.depth; rec.bossHalfHpSeen = true; rec.bossHpRemaining = 0; rec.path.push("CLEAR"); break; }
    if (gameState.run.result === "defeat") { rec.result = "defeat"; rec.endReason = "defeat"; rec.path.push("WIPE"); break; }
    if (++decisions > MAX_DECISIONS || rec.battleCount > MAX_BATTLES) { rec.result = "incomplete"; rec.endReason = "cap"; break; }

    const screen = gameState.screen;
    if (screen === "battle") {
      if (profile.preBattle) profile.preBattle(ctx()); // headless 보정(보호막/적완화)
      partyJobIds().forEach((j) => rec.jobsSeen.add(j));
      // Route Grammar 02 — 합체로 빈자리가 생긴 뒤 4인 미만으로 치른 전투 수(빈자리 방치 리스크 관측).
      if (rec.fusionCreatedEmptySlot && curPartySize() < 4) rec.battlesWhileUnder4AfterFusion += 1;
      rec.battleCount += 1;
      rec.path.push(ROUTE_TOKEN[pendingRoute] || "B");
      const ok = runHeadlessBattle();
      if (!ok) { rec.result = "incomplete"; rec.endReason = "battle-timeout"; break; }
      const deadNow = gameState.party.filter((u) => u.isDead).length;
      if (gameState.run.result !== "defeat") { rec.faintCount += deadNow; if (deadNow > 0 && !rec.firstNearDeathDepth) rec.firstNearDeathDepth = gameState.run.depth; }
      // 정예 승리 = 보스 열쇠 획득
      if ((gameState.run.bossKeys || 0) > prevBossKeys) { prevBossKeys = gameState.run.bossKeys; if (!rec.firstEliteKillDepth) rec.firstEliteKillDepth = gameState.run.depth; if (!rec.firstBossKeyDepth) { rec.firstBossKeyDepth = gameState.run.depth; rec.bossKeyBattleIdx = rec.battleCount; } }
      // 보스 전투 직후 보스 HP 포착
      if (pendingRoute === "boss") {
        const boss = gameState.enemies[0];
        if (boss) { const ratio = boss.maxHp ? Math.max(0, boss.hp) / boss.maxHp : 0; if (gameState.run.result === "defeat") { rec.bossHpRemaining = ratio; if (ratio <= 0.5) { rec.bossHalfHpSeen = true; rec.bossHalfHpSeenDepth = gameState.run.depth; } } }
      }
      sinceFusion = sinceFusion == null ? null : sinceFusion + 1;
    } else if (screen === "reward") {
      const offer = gameState.run.rewardOffer || [];
      if (offer.length === 0) { rec.result = "incomplete"; rec.endReason = "reward-empty"; break; }
      const id = policy.pickReward(offer); rec.selectedRewards.push(id); applyReward(id);
    } else if (screen === "fusion") {
      // Route Grammar 02 — 합체는 결속의 공터(bond)의 명시적 선택. 합체 후 자동 영입 없음 — 빈자리가 생긴다.
      const options = availableFusions(partyJobIds());
      const choiceId = options.length ? policy.decideFusion(options) : null;
      if (choiceId) { rec.fusionCount += 1; if (!rec.firstFusionDepth) rec.firstFusionDepth = gameState.run.depth; if (rec.fusionBattleIdx == null) rec.fusionBattleIdx = rec.battleCount; sinceFusion = 0; applyFusion(choiceId); rec.fusionCreatedEmptySlot = true; if (rec.partySizeAfterFusion == null) rec.partySizeAfterFusion = curPartySize(); }
      else skipFusion();
    } else if (screen === "fusionResult") {
      continueAfterFusion();
    } else if (screen === "recruit") {
      // Route Grammar 02 — 영입은 동료의 흔적(ally)의 명시적 선택. 합체 후 보충이면 recruitAfterFusionDepth 기록.
      const offer = gameState.run.recruitOffer || [];
      if (offer.length) { const jobId = policy.pickRecruit(offer); if (jobId) { previewRecruit(jobId); rec.recruitCount += 1; if (!rec.firstRecruitDepth) rec.firstRecruitDepth = gameState.run.depth; if (rec.fusionCreatedEmptySlot && !rec.recruitAfterFusionDepth) rec.recruitAfterFusionDepth = gameState.run.depth; } }
      confirmRecruit();
    } else if (screen === "arrange") {
      confirmArrange();
    } else if (screen === "route") {
      const choices = gameState.run.routeChoices || ["normal"];
      let rt = policy.pickRoute(choices);
      if (profile.route) rt = profile.route(rt, choices, ctx()); // 프로필 안전 라우팅 보정
      rec.routeChoices.push(rt);
      rec.routeCounts[rt] = (rec.routeCounts[rt] || 0) + 1; // Route Grammar 02 — 루트 선택 카운트
      // 전투 없는 루트(ally/bond)는 여기서 토큰 push(전투 핸들러를 안 거치므로). rest는 rest 핸들러에서.
      if (rt === "ally") { rec.path.push("ALLY"); if (!rec.firstRecruitRouteDepth) rec.firstRecruitRouteDepth = gameState.run.depth; }
      else if (rt === "bond") { rec.path.push("BOND"); if (!rec.firstFusionRouteDepth) rec.firstFusionRouteDepth = gameState.run.depth; }
      if (rt === "danger" && !rec.firstDangerDepth) rec.firstDangerDepth = gameState.run.depth;
      if (rt === "rest" && !rec.firstRestDepth) rec.firstRestDepth = gameState.run.depth;
      if ((rt === "elite" || rt === "danger")) {
        if (!rec.firstEliteAttemptDepth) rec.firstEliteAttemptDepth = gameState.run.depth; rec.eliteEnterBattleIdx = rec.battleCount;
        // 위험/정예 진입 컨텍스트 포착(진입 직전 = 이 전투 직전). battleIdx = 진입 전 완료 전투 수.
        const ds = new Set(partyJobIds()); const hp = aliveHpStats();
        rec.dangerEntries.push({
          routeType: rt, depth: gameState.run.depth, battleIdx: rec.battleCount, partySize: curPartySize(),
          hasHealer: AXES.hasHealer(ds), hasTank: AXES.hasTank(ds), hasAoE: AXES.hasAoE(ds),
          afterParty4: rec.partySize4Depth > 0, afterFusion: sinceFusion != null, sinceFusion,
          startHpAvg: hp.avg, startHpMin: hp.min,
        });
      }
      if (rt === "boss") { rec.bossAttempted = true; if (!rec.bossAttemptDepth) rec.bossAttemptDepth = gameState.run.depth; rec.bossAttemptPartySize = curPartySize(); rec.bossAttemptHpPercent = partyHpRatio(); }
      pendingRoute = rt;
      chooseRoute(rt);
    } else if (screen === "rest") {
      rec.path.push("REST"); continueFromRest();
    } else {
      rec.result = "incomplete"; rec.endReason = "unknown:" + screen; break;
    }
  }

  // ── 마무리: 파생 지표/실패원인/경로/역할축 ──
  rec.finalDepth = gameState.run.depth || 0;
  rec.finalParty = SLOT_ORDER.map((k) => (gameState.run.formation || {})[k]).filter(Boolean);
  rec.finalParty.forEach((j) => rec.jobsSeen.add(j));
  rec.finalPartySize = rec.finalParty.length;
  rec.bossKeysFinal = gameState.run.bossKeys || 0;
  rec.secondClassCount = rec.finalParty.filter(isSecond).length;
  rec.gotSecondClass = [...rec.jobsSeen].some(isSecond);
  rec.reachedDepth9 = rec.finalDepth >= 9; rec.reachedDepth17 = rec.finalDepth >= 17; rec.reachedDepth25 = rec.finalDepth >= 25;
  rec.hasHealer = AXES.hasHealer(rec.jobsSeen); rec.hasTank = AXES.hasTank(rec.jobsSeen); rec.hasShield = AXES.hasShield(rec.jobsSeen); rec.hasAoE = AXES.hasAoE(rec.jobsSeen); rec.hasSecondClass = AXES.hasSecondClass(rec.jobsSeen);
  const cleared = rec.result === "clear";
  rec.clearWithoutHealer = cleared && !rec.hasHealer; rec.clearWithoutTank = cleared && !rec.hasTank;
  rec.clearWithoutAoE = cleared && !rec.hasAoE; rec.clearWithoutSecondClass = cleared && !rec.hasSecondClass;
  rec.pathSignature = rec.path.join(">");
  rec.lastChoices = rec.path.slice(-5).join(">");
  rec.preWipeChoice = rec.result === "defeat" ? (rec.path[rec.path.length - 2] || "") : "";
  rec.lastSafeMilestone = rec.bossAttemptDepth ? "boss" : rec.firstBossKeyDepth ? "bosskey" : rec.firstEliteKillDepth ? "elitekill" : rec.firstSecondClassDepth ? "second" : rec.firstFusionDepth ? "fusion" : rec.partySize4Depth ? "party4" : rec.firstRecruitDepth ? "recruit" : "start";
  rec.failureTags = computeFailureTags(rec);
  rec.dangerMarkers = computeDangerMarkers(rec); // failureTags와 별개(추가 분석/표시용)
  // Route Grammar 02 — run-state 기반 관측 지표(4인 전 런웨이 / 잠복 경계도 / 합체 빈자리).
  const run = gameState.run;
  rec.party4Depth = run.party4Depth || 0;
  rec.party4Reached = !!run.party4Reached;
  rec.alertnessAtParty4 = run.alertnessAtParty4 || 0;
  rec.effectiveAlertnessAtParty4 = run.effectiveAlertnessAtParty4 || 0;
  rec.latentAlertnessAtParty4 = run.alertnessAtParty4 || 0; // 4인 도달 시 전면 전환된 잠복량
  rec.preParty4Battles = run.preParty4Battles || 0;
  rec.preParty4GrowthCount = run.preParty4GrowthCount || 0;
  rec.preParty4DangerCount = run.preParty4DangerCount || 0;
  rec.preParty4RecruitCount = run.preParty4RecruitCount || 0;
  rec.farmWarnShown = run.farmWarnShown || 0;
  rec.finalAlertness = run.alertness || 0;
  // 합체 빈자리 / 보충 / 작은 파티 결과.
  rec.skippedRecruitAfterFusion = rec.fusionCreatedEmptySlot && !rec.recruitAfterFusionDepth;
  rec.clearWithUnder4Party = cleared && rec.finalPartySize < 4;
  rec.highTierSmallPartyClear = cleared && rec.finalPartySize < 4 && [...rec.jobsSeen].some((j) => ADVANCED_JOBS.includes(j) || SECOND_CLASS_JOBS.includes(j));
  rec.wipeAfterFusionWithoutRefill = rec.result === "defeat" && rec.fusionCreatedEmptySlot && rec.finalPartySize < 4;
  // 전멸 직전 루트(토큰) + 최근 3루트.
  rec.routeBeforeWipe = rec.result === "defeat" ? (rec.path[rec.path.length - 2] || "") : "";
  rec.lastThreeRoutesBeforeWipe = (rec.result === "defeat" ? rec.path.slice(0, -1) : rec.path).slice(-3).join(">");
  // 4인 전 파밍 의심: 4인 미완성 + 전투 반복 + 동료의 흔적 무시.
  rec.preParty4FarmSuspect = !rec.party4Reached && rec.preParty4Battles >= 5 && rec.preParty4RecruitCount === 0 && (rec.routeCounts.ally || 0) === 0;
  rec.routeCauseTags = computeRouteCauseTags(rec);
  if (!rec.result) { rec.result = "incomplete"; rec.endReason = rec.endReason || "incomplete"; }
  return rec;
}

// Route Grammar 02 — Fun Wipe / Choice Ownership 추정 태그(전멸 = "내 선택의 결과"로 읽히게). 완벽한 인과 아님 — watch 톤.
function computeRouteCauseTags(rec) {
  const t = [];
  if (rec.result !== "defeat") return t;
  const d = rec.finalDepth, before = rec.routeBeforeWipe;
  if (!rec.party4Reached && rec.preParty4DangerCount > 0 && before === "D") t.push("wipeAfterPreParty4Danger");
  if (rec.firstDangerDepth && d <= 8 && before === "D") t.push("wipeAfterEarlyDeepBrush");
  if (rec.fusionCreatedEmptySlot && rec.finalPartySize < 4) {
    t.push("wipeAfterFusionWithoutRefill");
    if (!rec.recruitAfterFusionDepth) t.push("wipeAfterSkippedRecruit");
  }
  if (rec.fusionBattleIdx != null && rec.battleCount - rec.fusionBattleIdx <= 2) t.push("wipeAfterEarlyFusion");
  if (!rec.firstRestDepth && rec.faintCount >= 2) t.push("wipeAfterNoRestLowHp");
  if (rec.finalPartySize < 4 && (before === "D" || before === "E")) t.push("wipeAfterUnder4Greed");
  return t;
}

// Observation Batch 01 — 위험 루트 추정 마커. 전멸 직전 근접(3전투 이내) 위험 진입을 "치명적 진입"으로 보고
//   그 진입의 컨텍스트로 추정 마커를 붙인다(완벽한 인과 아님 — failureTags를 건드리지 않는 추가 표시용).
function computeDangerMarkers(rec) {
  const m = [];
  if (rec.result !== "defeat" || !rec.dangerEntries.length) return m;
  const wipeBattle = rec.battleCount;
  const near = rec.dangerEntries.filter((e) => wipeBattle - e.battleIdx <= 3 && wipeBattle - e.battleIdx >= 0);
  if (!near.length) return m; // 위험 진입이 전멸과 무관(멀리 떨어짐)
  const last = near[near.length - 1];
  m.push(last.afterParty4 ? "DANGER_POST_PARTY4_WIPE" : "DANGER_PRE_PARTY4_WIPE");
  if (last.afterFusion && last.sinceFusion != null && last.sinceFusion <= 2) m.push("DANGER_POST_FUSION_WIPE");
  if (!last.hasHealer) m.push("DANGER_NO_HEALER_WIPE");
  if (!last.hasTank) m.push("DANGER_NO_TANK_WIPE");
  if (!last.hasAoE) m.push("DANGER_NO_AOE_WIPE");
  if (last.startHpAvg < 0.5) m.push("DANGER_LOW_HP_ENTRY");
  if (near.length >= 2) m.push("DANGER_CHAIN_WIPE");
  return m;
}

// 실패 원인 자동 추정 태그(전멸런 중심 — 완벽한 인과 아님). UI엔 "추정 원인"으로 표시.
function computeFailureTags(rec) {
  const t = [];
  if (rec.result !== "defeat") return t;
  const d = rec.finalDepth;
  t.push(d <= 8 ? "EARLY_WIPE_1_8" : d <= 16 ? "MID_WIPE_9_16" : "LATE_WIPE_17_PLUS");
  if (rec.finalPartySize < 4) t.push("LOW_PARTY_SIZE_WIPE");
  if (rec.party4BattleIdx != null && rec.battleCount - rec.party4BattleIdx <= 3) t.push("POST_PARTY4_WIPE");
  if (rec.fusionBattleIdx != null && rec.battleCount - rec.fusionBattleIdx <= 3) t.push("POST_FUSION_WIPE");
  if (rec.eliteEnterBattleIdx != null && rec.battleCount - rec.eliteEnterBattleIdx <= 2) t.push("ELITE_GREED_WIPE");
  if (rec.faintCount >= 3) t.push("LOW_HP_CHAIN");
  if (!rec.firstRestDepth) t.push("NO_REST_RECOVERY");
  if (rec.bossAttempted) t.push("BOSS_ATTEMPT_FAIL");
  else if (rec.bossKeysFinal < 2) t.push("BOSS_KEY_STARVE");
  if (!rec.firstFusionDepth && d >= 9) t.push("NO_FUSION_PROGRESS");
  if (!rec.gotSecondClass && d >= 12) t.push("NO_SECOND_CLASS");
  if (!rec.hasHealer && !rec.hasShield) t.push("NO_HEAL_OR_SHIELD_AXIS");
  if (!rec.hasTank) t.push("NO_TANK_AXIS");
  if (!rec.hasAoE) t.push("NO_AOE_AXIS");
  return t;
}

/* ── 상태 스냅샷/복구(본게임 state 오염 방지 — 01A State Restore) ─────────
   run/battle은 in-place 변형 + 새 key(run.partyHp 등) 추가 가능 → deep clone 스냅샷 + 통째 교체 복구.
   party/enemies/logs는 실행 중 재할당되어 원본 불변 → 참조 복원으로 정확히 원복. */
function deepClone(o) { return typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)); }
function snapshotState() {
  return {
    party: gameState.party, enemies: gameState.enemies, logs: gameState.logs, screen: gameState.screen,
    battle: deepClone(gameState.battle), run: deepClone(gameState.run),
    immortal: gameState.dev ? gameState.dev.immortal : false,
  };
}
function restoreState(s) {
  gameState.party = s.party; gameState.enemies = s.enemies; gameState.logs = s.logs; gameState.screen = s.screen;
  gameState.battle = deepClone(s.battle); // 통째 교체 — 잔류 key 0
  gameState.run = deepClone(s.run);
  if (gameState.dev) gameState.dev.immortal = s.immortal;
}

/* ── 배치 러너(chunk 처리 + 진행률 + 취소) ──────────────────────────── */
let cancelFlag = false;
const nextTick = () => new Promise((r) => setTimeout(r, 0));

export async function runBatch({ count, policyId, profileId = "baseline", themeId = "beginner", seed, onProgress }) {
  const policy = POLICIES[policyId] || POLICIES.random;
  const snap = snapshotState();
  const useSeed = seed != null && !Number.isNaN(seed);
  if (useSeed) installSeed(seed);
  setHeadlessRun(true);
  if (gameState.dev) gameState.dev.immortal = false; // 주회는 불사 OFF — 전멸이 실제로 발생해야 한다
  cancelFlag = false;
  const runs = [];
  const t0 = performance.now();
  try {
    const CHUNK = 20; // 마지막 청크엔 trailing yield 없음(백그라운드 탭 스로틀 완화 — 포그라운드 무영향)
    for (let i = 0; i < count; i++) {
      if (cancelFlag) break;
      runs.push(playOneRun(policy, profileId, themeId, i));
      if (onProgress) onProgress(i + 1, count);
      if ((i + 1) % CHUNK === 0 && i + 1 < count) await nextTick();
    }
  } finally {
    setHeadlessRun(false);
    if (useSeed) restoreRandom();
    restoreState(snap); // immortal 포함 본게임 state 완전 복구(deep)
  }
  return { runs, elapsed: performance.now() - t0, policyId, profileId, themeId, count, seed: useSeed ? seed : null, canceled: cancelFlag };
}
export function cancelBatch() { cancelFlag = true; }

/* ── Observation Batch 01 — Soft Ramp Split 배치(baseline + softRamp + 6 split, 동일 policy/seed/runs) ──
   각 프로필을 같은 조건으로 주회해 "어느 성분이 런을 살리는지"를 한 표로 비교한다. runBatch 재사용(각 호출이
   snapshot→restore하므로 본게임 state 무오염). 밸런스 확정 아님 — 관측 신호. */
let splitCancelFlag = false;
function splitMetrics(runs) {
  const N = runs.length || 1;
  const r = (c) => c / N;
  const tagged = (tag) => runs.filter((x) => (x.failureTags || []).includes(tag)).length;
  const wipes = runs.filter((x) => x.result === "defeat");
  const depths = runs.map((x) => x.finalDepth);
  return {
    runs: N,
    clearRate: r(runs.filter((x) => x.result === "clear").length),
    avgFinalDepth: mean(depths), p50FinalDepth: median(depths), maxDepth: Math.max(0, ...depths),
    reached9Rate: r(runs.filter((x) => x.reachedDepth9).length), reached17Rate: r(runs.filter((x) => x.reachedDepth17).length),
    bossAttemptRate: r(runs.filter((x) => x.bossAttempted).length), bossKillRate: r(runs.filter((x) => x.bossKilled).length),
    bossAttemptKillRate: (() => { const a = runs.filter((x) => x.bossAttempted).length; return a ? runs.filter((x) => x.bossKilled).length / a : 0; })(),
    // 초반 병목(추정 태그 기준)
    earlyWipe18Count: tagged("EARLY_WIPE_1_8"), earlyWipe18Rate: r(tagged("EARLY_WIPE_1_8")),
    midWipe916Count: tagged("MID_WIPE_9_16"), midWipe916Rate: r(tagged("MID_WIPE_9_16")),
    lowPartyWipeCount: tagged("LOW_PARTY_SIZE_WIPE"), lowPartyWipeRate: r(tagged("LOW_PARTY_SIZE_WIPE")),
    postParty4WipeCount: tagged("POST_PARTY4_WIPE"), postParty4WipeRate: r(tagged("POST_PARTY4_WIPE")),
    postFusionWipeCount: tagged("POST_FUSION_WIPE"), postFusionWipeRate: r(tagged("POST_FUSION_WIPE")),
    // 진행 마일스톤
    firstRecruitRate: r(runs.filter((x) => x.firstRecruitDepth > 0).length),
    party4Rate: r(runs.filter((x) => x.partySize4Depth > 0).length),
    firstFusionRate: r(runs.filter((x) => x.firstFusionDepth > 0).length),
    firstClassRate: r(runs.filter((x) => x.firstFirstClassDepth > 0).length),
    secondClassRate: r(runs.filter((x) => x.firstSecondClassDepth > 0).length),
    firstBossKeyRate: r(runs.filter((x) => x.firstBossKeyDepth > 0).length),
    // 역할축 전멸(전멸 + 해당 축 부재)
    noHealerWipeRate: r(wipes.filter((x) => !x.hasHealer).length),
    noTankWipeRate: r(wipes.filter((x) => !x.hasTank).length),
    noAoEWipeRate: r(wipes.filter((x) => !x.hasAoE).length),
    noSecondClassWipeRate: r(wipes.filter((x) => !x.hasSecondClass).length),
  };
}
function computeSplitDelta(m, base) {
  return {
    clearRate: m.clearRate - base.clearRate, earlyWipe18Rate: m.earlyWipe18Rate - base.earlyWipe18Rate,
    reached9Rate: m.reached9Rate - base.reached9Rate, party4Rate: m.party4Rate - base.party4Rate,
    firstFusionRate: m.firstFusionRate - base.firstFusionRate, bossAttemptRate: m.bossAttemptRate - base.bossAttemptRate,
  };
}
export async function runSoftRampSplit({ count, policyId, themeId = "beginner", seed, onProgress }) {
  splitCancelFlag = false;
  const order = SPLIT_PROFILE_ORDER;
  const results = [];
  for (let i = 0; i < order.length; i++) {
    if (splitCancelFlag) break;
    const profileId = order[i];
    const meta = await runBatch({ count, policyId, profileId, themeId, seed, onProgress: (d, t) => onProgress && onProgress(i, order.length, profileId, d, t) });
    results.push({ profileId, label: (PROFILES[profileId] || {}).label || profileId, split: !!(PROFILES[profileId] || {}).split, metrics: splitMetrics(meta.runs) });
    if (meta.canceled) { splitCancelFlag = true; break; }
  }
  const base = results.find((x) => x.profileId === "baseline");
  results.forEach((x) => { x.delta = base ? computeSplitDelta(x.metrics, base.metrics) : null; });
  return { policyId, themeId, seed, count, results, canceled: splitCancelFlag };
}
export function cancelSplit() { splitCancelFlag = true; cancelFlag = true; }

/* ── 집계 ───────────────────────────────────────────────────────── */
const DEATH_BANDS = [
  { label: "1–8", min: 1, max: 8 }, { label: "9–16", min: 9, max: 16 }, { label: "17–24", min: 17, max: 24 },
  { label: "25–30", min: 25, max: 30 }, { label: "31+", min: 31, max: Infinity },
];
const bandOf = (d) => (DEATH_BANDS.find((b) => d >= b.min && d <= b.max) || DEATH_BANDS[DEATH_BANDS.length - 1]).label;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const meanNZ = (a) => { const f = a.filter((x) => x > 0); return f.length ? mean(f) : 0; }; // 0(미발생) 제외 평균
function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const partySig = (jobs) => jobs.slice().map(jobName).sort().join(" + ") || "(빈 파티)";

function topGroups(runs) {
  const map = new Map();
  runs.forEach((r) => {
    const key = partySig(r.finalParty);
    const g = map.get(key) || { key, count: 0, depthSum: 0, secondSum: 0, results: {} };
    g.count += 1; g.depthSum += r.finalDepth; g.secondSum += r.secondClassCount; g.results[r.result] = (g.results[r.result] || 0) + 1;
    map.set(key, g);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || b.depthSum / b.count - a.depthSum / a.count).slice(0, 10);
}

export function aggregate(runs) {
  const clears = runs.filter((r) => r.result === "clear");
  const wipes = runs.filter((r) => r.result === "defeat");
  const incompletes = runs.filter((r) => r.result === "incomplete");
  const depths = runs.map((r) => r.finalDepth);
  const secondRuns = runs.filter((r) => r.gotSecondClass);
  const nonSecondRuns = runs.filter((r) => !r.gotSecondClass);
  const clrRate = (arr) => (arr.length ? arr.filter((r) => r.result === "clear").length / arr.length : 0);

  const jobIds = Object.keys(UNIT_TEMPLATES.party);
  const jobs = jobIds.map((id) => {
    const appear = runs.filter((r) => r.jobsSeen.has(id));
    const inClear = clears.filter((r) => r.jobsSeen.has(id));
    return {
      id, name: jobName(id), second: isSecond(id), appear: appear.length, inClear: inClear.length,
      inclusion: appear.length ? inClear.length / appear.length : 0,
      avgDepth: mean(appear.map((r) => r.finalDepth)),
      bossKillRate: appear.length ? appear.filter((r) => r.bossKilled).length / appear.length : 0,
    };
  }).filter((j) => j.appear > 0).sort((a, b) => b.appear - a.appear);

  const secondJobs = SECOND_CLASS_JOBS.map((id) => {
    const appear = runs.filter((r) => r.jobsSeen.has(id));
    const inClear = clears.filter((r) => r.jobsSeen.has(id));
    return { id, name: jobName(id), appear: appear.length, inClear: inClear.length, inclusion: appear.length ? inClear.length / appear.length : 0 };
  }).filter((j) => j.appear > 0).sort((a, b) => b.appear - a.appear);

  const rewardCount = (subset) => {
    const m = new Map();
    subset.forEach((r) => r.selectedRewards.forEach((id) => m.set(id, (m.get(id) || 0) + 1)));
    return [...m.entries()].map(([id, c]) => ({ name: rewardName(id), count: c })).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  const deathBand = DEATH_BANDS.map((b) => ({ label: b.label, count: wipes.filter((r) => bandOf(r.finalDepth) === b.label).length }));

  return {
    attempts: runs.length,
    clears: clears.length, clearRate: runs.length ? clears.length / runs.length : 0,
    wipes: wipes.length, incompletes: incompletes.length,
    avgDepth: mean(depths), medianDepth: median(depths), maxDepth: Math.max(0, ...depths), minDepth: depths.length ? Math.min(...depths) : 0,
    avgBattles: mean(runs.map((r) => r.battleCount)),
    avgFusion: mean(runs.map((r) => r.fusionCount)),
    avgRecruit: mean(runs.map((r) => r.recruitCount)),
    avgFaint: mean(runs.map((r) => r.faintCount)),
    bossAttempts: runs.filter((r) => r.bossAttempted).length,
    bossKills: runs.filter((r) => r.bossKilled).length,
    secondRuns: secondRuns.length,
    secondClearRate: clrRate(secondRuns),
    nonSecondClearRate: clrRate(nonSecondRuns),
    // 재미 도달 지표
    deaths1to8: deathBand[0].count,
    reached9: runs.filter((r) => r.reachedDepth9).length,
    reached17: runs.filter((r) => r.reachedDepth17).length,
    reached25: runs.filter((r) => r.reachedDepth25).length,
    avgFirstFusionDepth: meanNZ(runs.map((r) => r.firstFusionDepth)),
    avgPartySize4Depth: meanNZ(runs.map((r) => r.partySize4Depth)),
    avgFirstSecondDepth: meanNZ(runs.map((r) => r.firstSecondClassDepth)),
    // Auto Run Report 03 — 판정용 비율 지표
    bossAttemptRate: runs.length ? runs.filter((r) => r.bossAttempted).length / runs.length : 0,
    bossKillOnAttemptRate: (() => { const att = runs.filter((r) => r.bossAttempted).length; return att ? runs.filter((r) => r.bossKilled).length / att : 0; })(),
    reached9Rate: runs.length ? runs.filter((r) => r.reachedDepth9).length / runs.length : 0,
    reached17Rate: runs.length ? runs.filter((r) => r.reachedDepth17).length / runs.length : 0,
    reached25Rate: runs.length ? runs.filter((r) => r.reachedDepth25).length / runs.length : 0,
    firstParty4Rate: runs.length ? runs.filter((r) => r.partySize4Depth > 0).length / runs.length : 0,
    firstFusionRate: runs.length ? runs.filter((r) => r.firstFusionDepth > 0).length / runs.length : 0,
    firstSecondClassRate: runs.length ? runs.filter((r) => r.firstSecondClassDepth > 0).length / runs.length : 0,
    deathBand, clearParty: topGroups(clears), wipeParty: topGroups(wipes),
    jobs, secondJobs, rewardAll: rewardCount(runs), rewardClear: rewardCount(clears), rewardWipe: rewardCount(wipes),
  };
}

/* ── Auto Run Report 04 — 실패원인/경로/마일스톤/생존/의존도/보스흐름/자동진단 집계 ──── */
const tierAr = (id) => (SECOND_CLASS_JOBS.includes(id) ? "2차" : ADVANCED_JOBS.includes(id) ? "1차" : "기본");
export function aggregateAR04(runs, themeId, policyId, a) {
  const N = runs.length || 1;
  const clears = runs.filter((r) => r.result === "clear");
  const wipes = runs.filter((r) => r.result === "defeat");

  // A. 실패 원인(전멸런 태그 분포)
  const causeMap = new Map();
  wipes.forEach((r) => (r.failureTags || []).forEach((t) => causeMap.set(t, (causeMap.get(t) || 0) + 1)));
  const failureCauses = [...causeMap.entries()].map(([tag, count]) => ({ tag, count, rate: count / N })).sort((x, y) => y.count - x.count);

  // B. 선택 경로
  const pathTop = (subset, key) => { const m = new Map(); subset.forEach((r) => m.set(r[key], (m.get(r[key]) || 0) + 1)); return [...m.entries()].map(([sig, count]) => ({ sig, count })).sort((x, y) => y.count - x.count).slice(0, 5); };
  const preWipeMap = new Map(); wipes.forEach((r) => { const c = r.preWipeChoice || "?"; preWipeMap.set(c, (preWipeMap.get(c) || 0) + 1); });
  const preWipeTop = [...preWipeMap.entries()].map(([choice, count]) => ({ choice, count })).sort((x, y) => y.count - x.count);

  // C. 재미 도달 마일스톤
  const MS = [["첫 영입", "firstRecruitDepth"], ["첫 4인", "partySize4Depth"], ["첫 합체", "firstFusionDepth"], ["첫 1차", "firstFirstClassDepth"], ["첫 2차", "firstSecondClassDepth"], ["첫 정예", "firstEliteAttemptDepth"], ["정예 처치", "firstEliteKillDepth"], ["보스 열쇠", "firstBossKeyDepth"], ["보스 도전", "bossAttemptDepth"], ["보스 처치", "bossKillDepth"], ["첫 쉼터", "firstRestDepth"]];
  const milestones = MS.map(([name, key]) => { const reached = runs.filter((r) => r[key] > 0); return { name, key, reachRate: reached.length / N, avgDepth: reached.length ? mean(reached.map((r) => r[key])) : 0 }; });
  const diedBefore = (key) => runs.filter((r) => r.result !== "clear" && !(r[key] > 0)).length / N;
  const funReachLoss = { beforeParty4: diedBefore("partySize4Depth"), beforeFusion: diedBefore("firstFusionDepth"), beforeElite: diedBefore("firstEliteAttemptDepth"), beforeBossKey: diedBefore("firstBossKeyDepth"), beforeBossAttempt: diedBefore("bossAttemptDepth") };

  // D. 마일스톤 이후 생존
  const survNext = (idxKey, n) => { const reached = runs.filter((r) => r[idxKey] != null); if (!reached.length) return null; return reached.filter((r) => !(r.result === "defeat" && r.battleCount - r[idxKey] <= n)).length / reached.length; };
  const bk = runs.filter((r) => r.bossKeyBattleIdx != null);
  const milestoneSurvival = { party4Next3: survNext("party4BattleIdx", 3), fusionNext3: survNext("fusionBattleIdx", 3), secondClassNext3: survNext("secondClassBattleIdx", 3), eliteNext2: survNext("eliteEnterBattleIdx", 2), postBossKey: bk.length ? bk.filter((r) => r.bossAttempted || r.result !== "defeat").length / bk.length : null };

  // E. 직업/역할 의존도
  const jobIds = Object.keys(UNIT_TEMPLATES.party);
  const clrIn = (sub, id) => (sub.length ? sub.filter((r) => r.jobsSeen.has(id)).length / sub.length : 0);
  const jobDep = jobIds.map((id) => { const present = runs.filter((r) => r.jobsSeen.has(id)); const absent = runs.filter((r) => !r.jobsSeen.has(id)); return { id, name: jobName(id), tier: tierAr(id), appear: present.length, clearAppear: clears.filter((r) => r.jobsSeen.has(id)).length, wipeAppear: wipes.filter((r) => r.jobsSeen.has(id)).length, clearRatePresent: present.length ? present.filter((r) => r.result === "clear").length / present.length : 0, clearRateAbsent: absent.length ? absent.filter((r) => r.result === "clear").length / absent.length : 0, delta: clrIn(clears, id) - clrIn(wipes, id) }; }).filter((j) => j.appear > 0);
  const noClear = (key) => { const w = runs.filter((r) => !r[key]); return w.length ? w.filter((r) => r.result === "clear").length / w.length : null; };
  const withClear = (key) => { const w = runs.filter((r) => r[key]); return w.length ? w.filter((r) => r.result === "clear").length / w.length : null; };
  const ROLES = ["tank", "healer", "shielder", "singleDps", "aoeDps", "pierce", "counter", "marker", "debuff", "control", "support"];
  const roleDep = ROLES.map((role) => { const present = runs.filter((r) => jobsHaveRole(r.jobsSeen, role)); const absent = runs.filter((r) => !jobsHaveRole(r.jobsSeen, role)); return { role, present: present.length, clearPresent: present.length ? present.filter((r) => r.result === "clear").length / present.length : 0, clearAbsent: absent.length ? absent.filter((r) => r.result === "clear").length / absent.length : 0 }; }).filter((r) => r.present > 0 || r.role === "healer" || r.role === "tank");
  const roleDependency = {
    jobsTopClear: jobDep.slice().sort((x, y) => y.delta - x.delta).slice(0, 8),
    jobsTopWipe: jobDep.slice().sort((x, y) => y.wipeAppear - x.wipeAppear).slice(0, 8),
    roles: roleDep,
    noHealerClearRate: noClear("hasHealer"), noTankClearRate: noClear("hasTank"), noShieldClearRate: noClear("hasShield"), noAoEClearRate: noClear("hasAoE"), noSecondClassClearRate: noClear("hasSecondClass"),
    healerClearRate: withClear("hasHealer"), tankClearRate: withClear("hasTank"), aoeClearRate: withClear("hasAoE"), secondClassClearRate: withClear("hasSecondClass"),
  };

  // F. 보스 흐름
  const att = runs.filter((r) => r.bossAttempted);
  const fail = att.filter((r) => !r.bossKilled && r.bossHpRemaining != null);
  const bossFlow = {
    bossAttemptRate: att.length / N, bossKillRate: runs.filter((r) => r.bossKilled).length / N,
    bossKillOnAttemptRate: att.length ? att.filter((r) => r.bossKilled).length / att.length : 0,
    bossAttemptAvgDepth: att.length ? mean(att.map((r) => r.bossAttemptDepth)) : 0,
    bossAttemptPartySizeAvg: att.length ? mean(att.map((r) => r.bossAttemptPartySize || 0)) : 0,
    bossAttemptAvgHpPercent: att.length ? mean(att.map((r) => r.bossAttemptHpPercent || 0)) : 0,
    bossAttemptWithSecondClassRate: att.length ? att.filter((r) => r.hasSecondClass).length / att.length : 0,
    bossAttemptWithHealerRate: att.length ? att.filter((r) => r.hasHealer).length / att.length : 0,
    bossAttemptWithTankRate: att.length ? att.filter((r) => r.hasTank).length / att.length : 0,
    bossHalfHpSeenRate: runs.filter((r) => r.bossHalfHpSeen).length / N,
    bossFailAvgBossHpRemaining: fail.length ? mean(fail.map((r) => r.bossHpRemaining)) : null,
  };

  const diagnosis = buildDiagnosis(a, { failureCauses, milestoneSurvival, roleDependency, bossFlow }, policyId);
  return { failureCauses, wipePathTop: pathTop(wipes, "pathSignature"), clearPathTop: pathTop(clears, "pathSignature"), preWipeTop, milestones, funReachLoss, milestoneSurvival, roleDependency, bossFlow, diagnosis };
}

function buildDiagnosis(a, ar, policyId) {
  const N = a.attempts || 1;
  const ed = a.deaths1to8 / N;
  let primary = "", secondary = "";
  const watch = [];
  if (ed >= 0.5) primary = `초반 1~8 전멸이 ${fmtPct(ed)}입니다. 첫 4인 완성 전 이탈이 주요 병목입니다.`;
  const bf = ar.bossFlow;
  if (bf.bossAttemptRate < 0.2 && bf.bossKillOnAttemptRate >= 0.6) { const s = `보스 도전률은 낮지만(${fmtPct(bf.bossAttemptRate)}) 도전 시 처치율은 높습니다(${fmtPct(bf.bossKillOnAttemptRate)}). 보스보다 보스 전 진행이 병목입니다.`; if (!primary) primary = s; else if (!secondary) secondary = s; }
  if (bf.bossAttemptRate >= 0.1 && bf.bossHalfHpSeenRate < 0.05) { const s = "보스 HP 50% 이하를 거의 못 봅니다 — 보스 과강함 가능성."; if (!secondary) secondary = s; else watch.push(s); }
  const ms = ar.milestoneSurvival;
  if (ms.fusionNext3 != null && ms.fusionNext3 < 0.5) watch.push(`첫 합체 후 3전투 생존율 ${fmtPct(ms.fusionNext3)} — 합체 직후 파티 축소 리스크가 큽니다.`);
  if (ms.party4Next3 != null && ms.party4Next3 < 0.5) watch.push(`4인 완성 후 3전투 생존율 ${fmtPct(ms.party4Next3)} — 4인 직후 전멸이 잦습니다.`);
  const rd = ar.roleDependency;
  if (rd.healerClearRate != null && rd.noHealerClearRate != null && rd.healerClearRate - rd.noHealerClearRate > 0.10) watch.push(`Healer Dependency Watch: 힐러 없는 런 클리어율(${fmtPct(rd.noHealerClearRate)}) < 포함(${fmtPct(rd.healerClearRate)}).`);
  if (rd.tankClearRate != null && rd.noTankClearRate != null && rd.tankClearRate - rd.noTankClearRate > 0.10) watch.push("Tank Dependency Watch: 탱커 없는 런 클리어율 급락.");
  const topJob = (rd.jobsTopClear || [])[0];
  if (topJob && topJob.clearRatePresent - topJob.clearRateAbsent > 0.15 && topJob.appear >= 3) watch.push(`${topJob.name} Dependency Watch: 포함 런 클리어율(${fmtPct(topJob.clearRatePresent)})이 비포함(${fmtPct(topJob.clearRateAbsent)}) 대비 크게 높음.`);
  let recommended;
  if (ed >= 0.5) recommended = "Early Cushion 02 / Recruit Safety 01 / Soft Ramp 01로 초반 1~8 생존 완충을 A/B 비교 권장.";
  else if (ms.fusionNext3 != null && ms.fusionNext3 < 0.5) recommended = "First Fusion Safety 01로 합체 직후 완충 A/B 비교 권장.";
  else if (bf.bossAttemptRate < 0.2) recommended = "Guided Beginner 01 / Safe Elite Gate 01로 정예·진행 유도 A/B 비교 권장.";
  else recommended = "프로필 A/B(Cushion/RecruitSafe/SoftRamp)로 가장 개선 폭 큰 완충안 탐색 권장.";
  if (!primary) primary = "뚜렷한 단일 병목 없음 — 분포/경로를 확인하세요.";
  if (!watch.length) watch.push("뚜렷한 의존도/생존 경고 없음.");
  return { primary, secondary, recommended, watch };
}

/* ── Observation Batch 01 — Danger Route Autopsy 집계 ─────────────────────
   N>D>WIPE·정예/위험 진입 후 전멸이 왜 발생하는지 집계. 위험 진입 컨텍스트(dangerEntries)와
   추정 마커(dangerMarkers)는 playOneRun에서 부착됨 — 여기선 분포/대표 경로/평균만 낸다.
   "관측 신호"용 — 완벽한 인과 아님, 밸런스 확정값 아님. */
export function aggregateDangerAutopsy(runs) {
  const N = runs.length || 1;
  const wipes = runs.filter((r) => r.result === "defeat");
  const allEntries = [];
  runs.forEach((r) => (r.dangerEntries || []).forEach((e) => allEntries.push({ ...e, _run: r })));
  const total = allEntries.length;
  const runsWithEntry = runs.filter((r) => (r.dangerEntries || []).length > 0);
  const wipesWithDanger = wipes.filter((r) => (r.dangerEntries || []).length > 0);
  const rate = (c, d) => (d ? c / d : 0);
  const cnt = (arr, f) => arr.filter(f).length;

  // A. 위험 진입 현황
  const entry = {
    totalDangerEntries: total, dangerEntryRate: rate(runsWithEntry.length, N), avgEntriesPerRun: total / N,
    beforeParty4: cnt(allEntries, (e) => !e.afterParty4), afterParty4: cnt(allEntries, (e) => e.afterParty4),
    afterFusion: cnt(allEntries, (e) => e.afterFusion),
    noHealer: cnt(allEntries, (e) => !e.hasHealer), noTank: cnt(allEntries, (e) => !e.hasTank), noAoE: cnt(allEntries, (e) => !e.hasAoE),
  };

  // 진입 후 3전투 이내 전멸 = 그 진입이 전멸로 이어졌다고 본다(per-entry, 완벽한 인과 아님).
  const ledToWipe = (e) => e._run.result === "defeat" && (e._run.battleCount - e.battleIdx) >= 1 && (e._run.battleCount - e.battleIdx) <= 3;
  const stepsToWipe = (r) => { const es = r.dangerEntries; const last = es[es.length - 1]; return r.battleCount - last.battleIdx; };
  const dangerWipeRuns = wipesWithDanger.filter((r) => { const s = stepsToWipe(r); return s >= 1 && s <= 3; });
  const lastEntry = (r) => r.dangerEntries[r.dangerEntries.length - 1];

  // B. 위험 진입 후 결과
  const ledCount = allEntries.filter(ledToWipe).length;
  const outcome = {
    dangerEntryWipeRate: rate(ledCount, total), dangerEntrySurvivalRate: 1 - rate(ledCount, total),
    wipesWithDanger: wipesWithDanger.length,
    within1: cnt(wipesWithDanger, (r) => stepsToWipe(r) === 1),
    within2: cnt(wipesWithDanger, (r) => stepsToWipe(r) >= 1 && stepsToWipe(r) <= 2),
    within3: cnt(wipesWithDanger, (r) => stepsToWipe(r) >= 1 && stepsToWipe(r) <= 3),
    avgDepthAtDangerWipe: dangerWipeRuns.length ? mean(dangerWipeRuns.map((r) => r.finalDepth)) : 0,
    avgPartySizeAtDangerWipe: dangerWipeRuns.length ? mean(dangerWipeRuns.map((r) => lastEntry(r).partySize)) : 0,
    avgStartHpAtDangerWipe: dangerWipeRuns.length ? mean(dangerWipeRuns.map((r) => lastEntry(r).startHpAvg)) : 0,
    avgDownsAtDangerWipe: dangerWipeRuns.length ? mean(dangerWipeRuns.map((r) => r.faintCount)) : 0,
  };

  // C. 대표 path signature(위험 진입을 가진 전멸 런 기준)
  const groupTop = (arr, key, n) => { const m = new Map(); arr.forEach((r) => { const k = r[key] || "?"; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].map(([sig, count]) => ({ sig, count })).sort((a, b) => b.count - a.count).slice(0, n); };
  const topPaths = groupTop(wipesWithDanger, "pathSignature", 10);
  const topPreWipe = groupTop(wipesWithDanger, "preWipeChoice", 6).map((x) => ({ choice: x.sig, count: x.count }));

  // D. 추정 마커 분포(전체 런 기준)
  const mm = new Map(); runs.forEach((r) => (r.dangerMarkers || []).forEach((t) => mm.set(t, (mm.get(t) || 0) + 1)));
  const markers = [...mm.entries()].map(([tag, count]) => ({ tag, count, rate: count / N })).sort((a, b) => b.count - a.count);

  return { entry, outcome, topPaths, topPreWipe, markers };
}

/* ── Route Grammar 02 — 새 루트 문법 집계(Route Grammar Summary / Fusion Empty Slot / Anti-Farm / Fun Wipe) ──
   playOneRun이 부착한 run-state 기반 지표를 표/분포로 낸다. "관측 신호"용 — 완벽한 인과 아님. */
const ROUTE_GRAMMAR_ORDER = ["normal", "ally", "bond", "danger", "elite", "rest", "boss"];
function distOf(vals) { const m = {}; vals.forEach((v) => { const k = v == null ? "—" : String(v); m[k] = (m[k] || 0) + 1; }); return m; }
function topCount(arr, n = 8) { const m = {}; arr.forEach((v) => { m[v] = (m[v] || 0) + 1; }); return Object.entries(m).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, n); }
export function aggregateRouteGrammar(runs) {
  const N = runs.length || 1;
  const rate = (c) => c / N;
  const wipes = runs.filter((r) => r.result === "defeat");
  const clears = runs.filter((r) => r.result === "clear");
  const sum = (f) => runs.reduce((s, r) => s + (f(r) || 0), 0);
  const meanNZ2 = (key) => { const f = runs.map((r) => r[key]).filter((x) => x > 0); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0; };

  // A. Route Grammar Summary — 루트 선택 카운트/비율 + 마일스톤 + 4인 전후 전멸률 + 전멸 경로.
  const routeChoiceCounts = {}; ROUTE_GRAMMAR_ORDER.forEach((rt) => { routeChoiceCounts[rt] = sum((r) => (r.routeCounts && r.routeCounts[rt]) || 0); });
  const totalChoices = ROUTE_GRAMMAR_ORDER.reduce((a, rt) => a + routeChoiceCounts[rt], 0) || 1;
  const routeChoiceRate = {}; ROUTE_GRAMMAR_ORDER.forEach((rt) => { routeChoiceRate[rt] = routeChoiceCounts[rt] / totalChoices; });
  const summary = {
    routeChoiceCounts, routeChoiceRate,
    firstRecruitRouteDepth: meanNZ2("firstRecruitRouteDepth"), party4Depth: meanNZ2("party4Depth"), party4Rate: rate(runs.filter((r) => r.party4Reached).length),
    firstFusionRouteDepth: meanNZ2("firstFusionRouteDepth"), firstDangerDepth: meanNZ2("firstDangerDepth"), firstRestDepth: meanNZ2("firstRestDepth"),
    alertnessAtParty4: meanNZ2("alertnessAtParty4"), effectiveAlertnessAtParty4: meanNZ2("effectiveAlertnessAtParty4"), latentAlertnessAtParty4: meanNZ2("latentAlertnessAtParty4"),
    preParty4BattleCount: mean(runs.map((r) => r.preParty4Battles || 0)), preParty4GrowthCount: mean(runs.map((r) => r.preParty4GrowthCount || 0)),
    preParty4DangerCount: mean(runs.map((r) => r.preParty4DangerCount || 0)), preParty4RecruitCount: mean(runs.map((r) => r.preParty4RecruitCount || 0)),
    preParty4WipeRate: rate(wipes.filter((r) => !r.party4Reached).length), postParty4WipeRate: rate(wipes.filter((r) => r.party4Reached).length),
    routeBeforeWipeTop: topCount(wipes.map((r) => r.routeBeforeWipe || "?")), lastThreeRoutesTop: topCount(wipes.map((r) => r.lastThreeRoutesBeforeWipe || "?"), 6),
  };

  // B. Fusion Choice / Empty Slot Watch — 합체 빈자리/보충/작은 파티 결과.
  const fused = runs.filter((r) => r.fusionCreatedEmptySlot);
  const fusionSlot = {
    fusionCreatedEmptySlotCount: fused.length, fusionCreatedEmptySlotRate: rate(fused.length),
    partySizeAfterFusionDist: distOf(fused.map((r) => r.partySizeAfterFusion)),
    battlesWhileUnder4AfterFusionAvg: fused.length ? mean(fused.map((r) => r.battlesWhileUnder4AfterFusion || 0)) : 0,
    recruitAfterFusionDepth: meanNZ2("recruitAfterFusionDepth"),
    skippedRecruitAfterFusionCount: runs.filter((r) => r.skippedRecruitAfterFusion).length, skippedRecruitAfterFusionRate: rate(runs.filter((r) => r.skippedRecruitAfterFusion).length),
    wipeAfterFusionWithoutRefillCount: runs.filter((r) => r.wipeAfterFusionWithoutRefill).length, wipeAfterFusionWithoutRefillRate: rate(runs.filter((r) => r.wipeAfterFusionWithoutRefill).length),
    clearWithUnder4PartyCount: runs.filter((r) => r.clearWithUnder4Party).length, clearWithUnder4PartyRate: rate(runs.filter((r) => r.clearWithUnder4Party).length),
    highTierSmallPartyClearCount: runs.filter((r) => r.highTierSmallPartyClear).length,
    bossAttemptPartySizeDist: distOf(runs.filter((r) => r.bossAttempted).map((r) => r.bossAttemptPartySize)),
    finalPartySizeDist: distOf(runs.map((r) => r.finalPartySize)),
    avgDepthToFirstSecondClass: meanNZ2("firstSecondClassDepth"), avgDepthToBossAttempt: meanNZ2("bossAttemptDepth"),
    avgClearDepth: clears.length ? mean(clears.map((r) => r.finalDepth)) : 0,
  };

  // C. Anti-Farm Watch — 4인 전 파밍 신호.
  const antiFarm = {
    preParty4BattleDist: distOf(runs.map((r) => r.preParty4Battles || 0)),
    preParty4GrowthAvg: mean(runs.map((r) => r.preParty4GrowthCount || 0)),
    preParty4FarmSuspectCount: runs.filter((r) => r.preParty4FarmSuspect).length, preParty4FarmSuspectRate: rate(runs.filter((r) => r.preParty4FarmSuspect).length),
    ignoredAllyRuns: runs.filter((r) => !r.party4Reached && (r.preParty4Battles || 0) >= 3 && ((r.routeCounts && r.routeCounts.ally) || 0) === 0).length,
    warningLevel1Rate: rate(runs.filter((r) => (r.farmWarnShown || 0) >= 1).length), warningLevel2Rate: rate(runs.filter((r) => (r.farmWarnShown || 0) >= 2).length),
    latentAlertLeakCount: runs.filter((r) => !r.party4Reached && (r.preParty4Battles || 0) >= 5).length, // 누설 근접 추정(proxy)
  };

  // D. Fun Wipe / Choice Ownership Watch — "내 선택의 결과"로 읽히는 전멸 원인 분포.
  const causeMap = {}; wipes.forEach((r) => (r.routeCauseTags || []).forEach((t) => { causeMap[t] = (causeMap[t] || 0) + 1; }));
  const funWipe = { routeCauseSummary: Object.entries(causeMap).map(([tag, count]) => ({ tag, count, rate: count / N })).sort((a, b) => b.count - a.count) };

  return { summary, fusionSlot, antiFarm, funWipe };
}

/* ── TSV / JSON ─────────────────────────────────────────────────── */
// Auto Run Report 03 — theme + 판정(verdict) + 목표 클리어 범위 열 추가(02 컬럼은 그대로 유지).
const TSV_COLS = [
  "theme", "policy", "profile", "runIndex", "result", "finalDepth", "battleCount", "fusionCount", "recruitCount",
  "faintCount", "bossAttempted", "bossKilled", "finalParty", "secondClassCount", "selectedRewards", "endReason",
  "routeChoices", "deathDepthBand", "firstFusionDepth", "firstRecruitDepth", "partySize4Depth",
  "firstSecondClassDepth", "reachedDepth9", "reachedDepth17", "reachedDepth25",
  "validationVerdict", "clearRateVerdict", "funReachVerdict", "bossFlowVerdict", "earlyDeathVerdict",
  "targetClearMin", "targetClearMax",
  // AR04
  "failureTags", "pathSignature", "lastChoices", "preWipeChoice", "lastSafeMilestone",
  "firstFirstClassDepth", "firstEliteAttemptDepth", "firstEliteKillDepth", "firstBossKeyDepth",
  "bossAttemptDepth", "bossHalfHpSeen", "bossHalfHpSeenDepth", "bossKillDepth", "firstRestDepth",
  "party4SurvivalNext3", "fusionSurvivalNext3", "secondClassSurvivalNext3", "eliteAttemptSurvivalNext2",
  "runBossAttemptHpPercent", "bossFailBossHpRemaining",
  "hasHealer", "hasTank", "hasShield", "hasAoE", "hasSecondClass",
  "clearWithoutHealer", "clearWithoutTank", "clearWithoutAoE", "clearWithoutSecondClass",
  // Observation Batch 01 — 위험 진입 컨텍스트(추정 마커 + 진입 횟수) 추가 열
  "dangerMarkers", "dangerEntryCount",
];
export function runsToTSV(runs, extra = {}) {
  const v = extra.verdict || {}, t = extra.target || {};
  const survFlag = (r, idxKey, n) => (r[idxKey] == null ? "" : (r.result === "defeat" && r.battleCount - r[idxKey] <= n ? 0 : 1));
  const b = (x) => (x ? 1 : 0);
  const lines = [TSV_COLS.join("\t")];
  runs.forEach((r) => {
    lines.push([
      r.theme || "", r.policy, r.profile, r.runIndex, r.result, r.finalDepth, r.battleCount, r.fusionCount, r.recruitCount,
      r.faintCount, b(r.bossAttempted), b(r.bossKilled), r.finalParty.map(jobName).join("+"), r.secondClassCount,
      r.selectedRewards.map(rewardName).join("|"), r.endReason, r.routeChoices.join(">"),
      r.result === "defeat" ? bandOf(r.finalDepth) : "", r.firstFusionDepth, r.firstRecruitDepth, r.partySize4Depth,
      r.firstSecondClassDepth, b(r.reachedDepth9), b(r.reachedDepth17), b(r.reachedDepth25),
      v.overall || "", v.clear || "", v.funReach || "", v.bossFlow || "", v.earlyDeath || "",
      t.clearMin != null ? t.clearMin : "", t.clearMax != null ? t.clearMax : "",
      (r.failureTags || []).join("|"), r.pathSignature || "", r.lastChoices || "", r.preWipeChoice || "", r.lastSafeMilestone || "",
      r.firstFirstClassDepth, r.firstEliteAttemptDepth, r.firstEliteKillDepth, r.firstBossKeyDepth,
      r.bossAttemptDepth, b(r.bossHalfHpSeen), r.bossHalfHpSeenDepth, r.bossKillDepth, r.firstRestDepth,
      survFlag(r, "party4BattleIdx", 3), survFlag(r, "fusionBattleIdx", 3), survFlag(r, "secondClassBattleIdx", 3), survFlag(r, "eliteEnterBattleIdx", 2),
      r.bossAttemptHpPercent != null ? Math.round(r.bossAttemptHpPercent * 1000) / 10 : "", r.bossHpRemaining != null ? Math.round(r.bossHpRemaining * 1000) / 10 : "",
      b(r.hasHealer), b(r.hasTank), b(r.hasShield), b(r.hasAoE), b(r.hasSecondClass),
      b(r.clearWithoutHealer), b(r.clearWithoutTank), b(r.clearWithoutAoE), b(r.clearWithoutSecondClass),
      (r.dangerMarkers || []).join("|"), (r.dangerEntries || []).length,
    ].join("\t"));
  });
  return lines.join("\n");
}
export function runsToJSON(runs, extra = {}) {
  return JSON.stringify({
    theme: extra.themeId || (runs[0] && runs[0].theme) || null,
    policy: extra.policyId || null, profile: extra.profileId || null,
    verdict: extra.verdict || null, target: extra.target || null,
    aggregate: extra.aggregate || null,
    failureCauses: extra.ar04 ? extra.ar04.failureCauses : null,
    pathSummary: extra.ar04 ? { wipePathTop: extra.ar04.wipePathTop, clearPathTop: extra.ar04.clearPathTop, preWipeTop: extra.ar04.preWipeTop } : null,
    milestones: extra.ar04 ? extra.ar04.milestones : null,
    funReachLoss: extra.ar04 ? extra.ar04.funReachLoss : null,
    milestoneSurvival: extra.ar04 ? extra.ar04.milestoneSurvival : null,
    roleDependency: extra.ar04 ? extra.ar04.roleDependency : null,
    bossFlow: extra.ar04 ? extra.ar04.bossFlow : null,
    diagnosis: extra.ar04 ? extra.ar04.diagnosis : null,
    profileComparison: extra.profileComparison || null,
    // Observation Batch 01 — Soft Ramp Split / Danger Route Autopsy export 확장
    softRampSplitResults: extra.split ? extra.split.results : null,
    splitProfileDeltas: extra.split ? extra.split.results.map((x) => ({ profileId: x.profileId, label: x.label, split: x.split, delta: x.delta })) : null,
    splitMeta: extra.split ? { policyId: extra.split.policyId, themeId: extra.split.themeId, seed: extra.split.seed, count: extra.split.count, canceled: extra.split.canceled } : null,
    dangerRouteAutopsy: extra.danger || null,
    dangerPathTopList: extra.danger ? extra.danger.topPaths : null,
    // Route Grammar 02 — 새 루트 문법 export 확장.
    routeGrammarVersion: "route-grammar-02",
    routeChoiceCounts: extra.routeGrammar ? extra.routeGrammar.summary.routeChoiceCounts : null,
    preParty4Stats: extra.routeGrammar ? {
      battles: extra.routeGrammar.summary.preParty4BattleCount, growth: extra.routeGrammar.summary.preParty4GrowthCount,
      danger: extra.routeGrammar.summary.preParty4DangerCount, recruit: extra.routeGrammar.summary.preParty4RecruitCount,
      wipeRate: extra.routeGrammar.summary.preParty4WipeRate, farmSuspectRate: extra.routeGrammar.antiFarm.preParty4FarmSuspectRate,
    } : null,
    antiFarmMarkers: extra.routeGrammar ? extra.routeGrammar.antiFarm : null,
    alertnessAtParty4: extra.routeGrammar ? extra.routeGrammar.summary.alertnessAtParty4 : null,
    effectiveAlertnessAtParty4: extra.routeGrammar ? extra.routeGrammar.summary.effectiveAlertnessAtParty4 : null,
    latentAlertnessAtParty4: extra.routeGrammar ? extra.routeGrammar.summary.latentAlertnessAtParty4 : null,
    routeBeforeWipe: extra.routeGrammar ? extra.routeGrammar.summary.routeBeforeWipeTop : null,
    lastThreeRoutesBeforeWipe: extra.routeGrammar ? extra.routeGrammar.summary.lastThreeRoutesTop : null,
    routeCauseSummary: extra.routeGrammar ? extra.routeGrammar.funWipe.routeCauseSummary : null,
    fusionEmptySlotWatch: extra.routeGrammar ? extra.routeGrammar.fusionSlot : null,
    routeTimelineTokens: ["N", "ALLY", "BOND", "D", "E", "REST", "BOSS", "CLEAR", "WIPE"],
    runs: runs.map((r) => ({ ...r, jobsSeen: [...r.jobsSeen] })),
  }, null, 0);
}

/* ── 렌더 ───────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const card = (k, v, sub) => `<div class="ar-card"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;

function renderSummary(a, meta) {
  const pol = (POLICIES[meta.policyId] || {}).label || meta.policyId;
  const prof = (PROFILES[meta.profileId] || {}).label || meta.profileId;
  $("ar-summary").innerHTML =
    `<h3>요약 — ${esc(pol)} · ${esc(prof)} · ${a.attempts}회 ${meta.seed != null ? `· seed ${meta.seed}` : ""} <span class="ar-meta">(${(meta.elapsed / 1000).toFixed(1)}s${meta.canceled ? " · 취소됨" : ""})</span></h3>
     <div class="ar-cards">
       ${card("총 시도", a.attempts)} ${card("클리어", a.clears, fmtPct(a.clearRate))} ${card("전멸", a.wipes)} ${card("미완(캡)", a.incompletes)}
       ${card("평균 심도", fmt1(a.avgDepth))} ${card("중앙값 심도", fmt1(a.medianDepth))} ${card("최고 심도", a.maxDepth)} ${card("최저 심도", a.minDepth)}
       ${card("심도1-8 전멸", a.deaths1to8)} ${card("심도9+ 도달", a.reached9)} ${card("심도17+ 도달", a.reached17)} ${card("심도25+ 도달", a.reached25)}
       ${card("평균 전투", fmt1(a.avgBattles))} ${card("평균 합체", fmt1(a.avgFusion))} ${card("평균 영입", fmt1(a.avgRecruit))} ${card("평균 기절", fmt1(a.avgFaint))}
       ${card("보스 도전", a.bossAttempts)} ${card("보스 처치", a.bossKills)} ${card("2차 확보런", a.secondRuns)} ${card("2차 확보 클리어율", fmtPct(a.secondClearRate))}
       ${card("첫 4인 심도", fmt1(a.avgPartySize4Depth))} ${card("첫 합체 심도", fmt1(a.avgFirstFusionDepth))} ${card("첫 2차 심도", fmt1(a.avgFirstSecondDepth))} ${card("2차 미확보 클리어율", fmtPct(a.nonSecondClearRate))}
     </div>`;
}

function renderDeathBand(a) {
  const max = Math.max(1, ...a.deathBand.map((b) => b.count));
  $("ar-deathband").innerHTML = `<h3>전멸 구간 (심도별 전멸 수)</h3><div class="ar-bars">${a.deathBand.map((b) =>
    `<div class="ar-bar-row"><span class="lab">${b.label}</span><span class="bar"><span class="fill" style="width:${(b.count / max) * 100}%"></span></span><span class="num">${b.count}</span></div>`).join("")}</div>`;
}

function partyTable(title, groups, note) {
  if (!groups.length) return `<h3>${title}</h3><div class="ar-empty">${note || "데이터 없음"}</div>`;
  const rows = groups.map((g) => {
    const rep = Object.entries(g.results).sort((a, b) => b[1] - a[1])[0];
    return `<tr><td class="txt">${esc(g.key)}</td><td>${g.count}</td><td>${fmt1(g.depthSum / g.count)}</td><td>${fmt1(g.secondSum / g.count)}</td><td>${rep ? esc(rep[0]) : "-"}</td></tr>`;
  }).join("");
  return `<h3>${title}</h3><div class="ar-tablewrap"><table><thead><tr><th class="txt">파티 구성</th><th>횟수</th><th>평균심도</th><th>2차수</th><th>대표결과</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderParties(a) {
  $("ar-clearparty").innerHTML = partyTable("클리어 파티 TOP 10", a.clearParty, "아직 클리어한 파티가 없습니다.");
  $("ar-wipeparty").innerHTML = partyTable("전멸 파티 TOP 10", a.wipeParty, "전멸 기록이 없습니다.");
}

function renderJobs(a) {
  const rows = a.jobs.map((j) =>
    `<tr><td class="txt">${esc(j.name)}${j.second ? ' <span class="ar-2nd">2차</span>' : ""}</td><td>${j.appear}</td><td>${j.inClear}</td><td>${fmtPct(j.inclusion)}</td><td>${fmt1(j.avgDepth)}</td><td>${fmtPct(j.bossKillRate)}</td></tr>`).join("");
  $("ar-jobs").innerHTML = `<h3>직업별 성과표 (등장 ${a.jobs.length}종)</h3><div class="ar-tablewrap"><table><thead><tr><th class="txt">직업</th><th>등장</th><th>클리어 포함</th><th>클리어 포함률</th><th>포함시 평균심도</th><th>보스처치율</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSecond(a) {
  const max = Math.max(a.secondClearRate, a.nonSecondClearRate, 0.0001);
  const bar = (label, v) => `<div class="ar-bar-row"><span class="lab">${label}</span><span class="bar"><span class="fill alt" style="width:${(v / max) * 100}%"></span></span><span class="num">${fmtPct(v)}</span></div>`;
  const rows = a.secondJobs.map((j) => `<tr><td class="txt">${esc(j.name)}</td><td>${j.appear}</td><td>${j.inClear}</td><td>${fmtPct(j.inclusion)}</td></tr>`).join("");
  $("ar-second").innerHTML = `<h3>2차 직업 분석</h3>
    <div class="ar-cards">${card("2차 확보런", a.secondRuns)}${card("2차 확보런 클리어율", fmtPct(a.secondClearRate))}${card("2차 미확보런 클리어율", fmtPct(a.nonSecondClearRate))}</div>
    <div class="ar-bars">${bar("2차 확보", a.secondClearRate)}${bar("2차 미확보", a.nonSecondClearRate)}</div>
    ${a.secondJobs.length ? `<div class="ar-tablewrap"><table><thead><tr><th class="txt">2차 직업</th><th>등장</th><th>클리어 포함</th><th>클리어 포함률</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="ar-empty">등장한 2차 직업이 없습니다.</div>`}`;
}

function rewardList(title, list) {
  if (!list.length) return `<div class="ar-rewardcol"><h4>${title}</h4><div class="ar-empty">없음</div></div>`;
  return `<div class="ar-rewardcol"><h4>${title}</h4><ol>${list.map((r) => `<li>${esc(r.name)} <b>${r.count}</b></li>`).join("")}</ol></div>`;
}
function renderRewards(a) {
  $("ar-rewards").innerHTML = `<h3>보상 선택 TOP (이름 기준 — 계열 태그 없음)</h3><div class="ar-rewards">${rewardList("전체", a.rewardAll)}${rewardList("클리어런", a.rewardClear)}${rewardList("전멸런", a.rewardWipe)}</div>`;
}

/* ── Auto Run Report 03 — Theme Validation 렌더 ─────────────────────── */
const badge = (v) => `<span class="ar-verdict ${String(v).toLowerCase()}">${v}</span>`;
const themeLabel = (id) => (THEMES[id] || {}).label || id;
const policyLabel = (id) => (POLICIES[id] || {}).label || id;
const rangeText = (tgt) => (tgt.clearMin != null ? `${fmtPct(tgt.clearMin)}~${fmtPct(tgt.clearMax)}` : "—");

function renderValidation(a, meta, verdict) {
  const tgt = verdict.target;
  $("ar-validation").innerHTML = `<h3>테마 검증 — ${esc(themeLabel(meta.themeId))} · ${esc(policyLabel(meta.policyId))} · ${esc((PROFILES[meta.profileId] || {}).label || meta.profileId)} · ${a.attempts}회 &nbsp; 종합 ${badge(verdict.overall)}</h3>
    <div class="ar-cards">
      ${card("클리어율", fmtPct(a.clearRate), `목표 ${rangeText(tgt)}`)}
      ${card("클리어율 판정", badge(verdict.clear))}
      ${card("초반전멸 판정", badge(verdict.earlyDeath), `1-8 ${a.deaths1to8}/${a.attempts}`)}
      ${card("재미도달 판정", badge(verdict.funReach), `9+ ${fmtPct(a.reached9Rate)} · 4인 ${fmtPct(a.firstParty4Rate)}`)}
      ${card("보스흐름 판정", badge(verdict.bossFlow), `도전 ${fmtPct(a.bossAttemptRate)} · 처치 ${fmtPct(a.bossKillOnAttemptRate)}`)}
      ${card("평균/중앙 심도", `${fmt1(a.avgDepth)}/${fmt1(a.medianDepth)}`, `최고 ${a.maxDepth}`)}
      ${card("9+/17+/25+ 도달", `${fmtPct(a.reached9Rate)}/${fmtPct(a.reached17Rate)}/${fmtPct(a.reached25Rate)}`)}
      ${card("첫4인/첫합체/첫2차", `${fmtPct(a.firstParty4Rate)}/${fmtPct(a.firstFusionRate)}/${fmtPct(a.firstSecondClassRate)}`)}
      ${card("2차 확보런", a.secondRuns, `클리어율 ${fmtPct(a.secondClearRate)}`)}
    </div>`;
}

function renderTargets(themeId) {
  const t = THEME_TARGETS[themeId];
  if (!t) { $("ar-targets").innerHTML = `<h3>정책별 목표 (${esc(themeLabel(themeId))})</h3><div class="ar-empty">이 테마의 목표가 정의되지 않았습니다(준비 중).</div>`; return; }
  const rows = POLICY_ORDER.map((pid) => {
    const tg = policyTarget(themeId, pid);
    return `<tr><td class="txt">${esc(policyLabel(pid))}</td><td>${rangeText(tg)}</td><td>${fmtPct(tg.reached9 ?? t.common.reached9)}</td><td>${fmtPct(tg.firstFusion ?? t.common.firstFusionMin)}</td><td>${fmtPct(t.common.bossAttemptMin)}~${fmtPct(t.common.bossAttemptMax)}</td><td class="txt">${esc(tg.note || "")}</td></tr>`;
  }).join("");
  $("ar-targets").innerHTML = `<h3>정책별 목표 (${esc(themeLabel(themeId))}) <span class="ar-meta">— THEME_TARGETS에서 조정</span></h3>
    <div class="ar-tablewrap"><table><thead><tr><th class="txt">정책</th><th>클리어율 목표</th><th>9+도달 목표</th><th>첫합체 목표</th><th>보스도전 목표</th><th class="txt">비고</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderFlags(themeId, policyId, a) {
  const flags = validationFlags(themeId, policyId, a);
  $("ar-flags").innerHTML = `<h3>검증 플래그 (자동 해석)</h3><ul class="ar-flags">${flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;
}

/* ── Auto Run Report 04 — 분석 섹션 렌더 ─────────────────────────────── */
function renderDiagnosis(ar) {
  const d = ar.diagnosis;
  $("ar-diagnosis").innerHTML = `<h3>자동 진단 (병목 요약)</h3>
    <div class="ar-diag"><div><b>주 병목:</b> ${esc(d.primary)}</div>${d.secondary ? `<div><b>부 병목:</b> ${esc(d.secondary)}</div>` : ""}<div><b>추천 실험:</b> ${esc(d.recommended)}</div></div>
    <h4>Watch List</h4><ul class="ar-flags">${d.watch.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`;
}
function renderFailureCause(ar) {
  $("ar-failcause").innerHTML = `<h3>실패 원인 (추정) TOP <span class="ar-meta">— 자동 추정(완벽한 인과 아님)</span></h3>` + (ar.failureCauses.length
    ? `<div class="ar-tablewrap"><table><thead><tr><th class="txt">원인 태그</th><th>건수</th><th>전체 비율</th></tr></thead><tbody>${ar.failureCauses.slice(0, 12).map((c) => `<tr><td class="txt">${c.tag}</td><td>${c.count}</td><td>${fmtPct(c.rate)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="ar-empty">전멸 기록이 없습니다.</div>`);
}
function renderPaths(ar) {
  const col = (title, list, codeKey) => `<div class="ar-rewardcol"><h4>${title}</h4>${list.length ? `<ol>${list.map((p) => `<li><code>${esc(codeKey ? p[codeKey] : p.sig)}</code> <b>${p.count}</b></li>`).join("")}</ol>` : `<div class="ar-empty">없음</div>`}</div>`;
  $("ar-paths").innerHTML = `<h3>선택 경로 분석 <span class="ar-meta">(N=일반·D=위험·E=정예·BOSS / REC=영입·FUS=합체·REST=쉼터)</span></h3>
    <div class="ar-rewards">${col("전멸 경로 TOP5", ar.wipePathTop)}${col("클리어 경로 TOP5", ar.clearPathTop)}${col("전멸 직전 선택 TOP", ar.preWipeTop, "choice")}</div>`;
}
function renderMilestones(ar) {
  const cards = ar.milestones.map((m) => card(m.name, fmtPct(m.reachRate), `평균심도 ${fmt1(m.avgDepth)}`)).join("");
  const L = ar.funReachLoss;
  const loss = [card("4인 전 사망", fmtPct(L.beforeParty4)), card("첫합체 전 사망", fmtPct(L.beforeFusion)), card("첫정예 전 사망", fmtPct(L.beforeElite)), card("첫보스키 전 사망", fmtPct(L.beforeBossKey)), card("보스도전 전 사망", fmtPct(L.beforeBossAttempt))].join("");
  $("ar-milestones").innerHTML = `<h3>재미 도달 마일스톤 (도달률 / 평균심도)</h3><div class="ar-cards">${cards}</div>
    <h4>재미 도달 전 이탈 비율</h4><div class="ar-cards">${loss}</div>`;
}
function renderMilestoneSurvival(ar) {
  const ms = ar.milestoneSurvival; const c = (k, v) => card(k, v == null ? "—" : fmtPct(v));
  $("ar-survival").innerHTML = `<h3>마일스톤 이후 생존율 (다음 N전투 내 전멸 안 함)</h3><div class="ar-cards">${c("4인 후 3전투", ms.party4Next3)}${c("합체 후 3전투", ms.fusionNext3)}${c("2차 후 3전투", ms.secondClassNext3)}${c("정예 진입 후 2전투", ms.eliteNext2)}${c("보스키 후→도전 도달", ms.postBossKey)}</div>`;
}
function renderRoleDependency(ar) {
  const rd = ar.roleDependency; const c = (k, v) => card(k, v == null ? "—" : fmtPct(v));
  const roleRows = rd.roles.map((r) => `<tr><td class="txt">${r.role}</td><td>${r.present}</td><td>${fmtPct(r.clearPresent)}</td><td>${fmtPct(r.clearAbsent)}</td></tr>`).join("");
  const jobRows = rd.jobsTopClear.map((j) => `<tr><td class="txt">${esc(j.name)} <span class="ar-meta">${j.tier}</span></td><td>${j.appear}</td><td>${j.clearAppear}</td><td>${j.wipeAppear}</td><td>${fmtPct(j.clearRatePresent)}</td><td>${fmtPct(j.clearRateAbsent)}</td><td>${(j.delta >= 0 ? "+" : "") + fmtPct(j.delta)}</td></tr>`).join("");
  $("ar-dependency").innerHTML = `<h3>직업 / 역할군 의존도</h3>
    <div class="ar-cards">${c("힐러 없음 클리어율", rd.noHealerClearRate)}${c("탱커 없음 클리어율", rd.noTankClearRate)}${c("보호막 없음 클리어율", rd.noShieldClearRate)}${c("광역 없음 클리어율", rd.noAoEClearRate)}${c("2차 없음 클리어율", rd.noSecondClassClearRate)}</div>
    <h4>역할군 있음/없음 클리어율</h4><div class="ar-tablewrap"><table><thead><tr><th class="txt">역할군</th><th>등장런</th><th>있을때</th><th>없을때</th></tr></thead><tbody>${roleRows}</tbody></table></div>
    <h4>클리어 기여 직업 TOP (delta = 클리어 등장률 − 전멸 등장률)</h4><div class="ar-tablewrap"><table><thead><tr><th class="txt">직업</th><th>등장</th><th>클리어포함</th><th>전멸포함</th><th>있을때</th><th>없을때</th><th>delta</th></tr></thead><tbody>${jobRows}</tbody></table></div>`;
}
function renderBossFlow(ar) {
  const bf = ar.bossFlow;
  $("ar-bossflow").innerHTML = `<h3>보스 흐름 분석</h3><div class="ar-cards">
    ${card("보스 도전률", fmtPct(bf.bossAttemptRate))}${card("도전 시 처치율", fmtPct(bf.bossKillOnAttemptRate))}${card("보스 처치율(전체)", fmtPct(bf.bossKillRate))}${card("보스 HP50% 도달률", fmtPct(bf.bossHalfHpSeenRate))}
    ${card("도전 평균 심도", fmt1(bf.bossAttemptAvgDepth))}${card("도전 평균 파티수", fmt1(bf.bossAttemptPartySizeAvg))}${card("도전 평균 HP%", fmtPct(bf.bossAttemptAvgHpPercent))}
    ${card("도전 시 2차 보유율", fmtPct(bf.bossAttemptWithSecondClassRate))}${card("도전 시 힐러 보유율", fmtPct(bf.bossAttemptWithHealerRate))}${card("실패 시 보스 잔여HP%", bf.bossFailAvgBossHpRemaining == null ? "—" : fmtPct(bf.bossFailAvgBossHpRemaining))}
  </div>`;
}

/* ── Observation Batch 01 — Danger Route Autopsy 렌더 ────────────────────── */
function renderDangerAutopsy(da) {
  const e = da.entry, o = da.outcome;
  const A = `<h4>A. 위험 진입 현황 <span class="ar-meta">(D=위험·E=정예 진입 기준)</span></h4><div class="ar-cards">
    ${card("총 위험 진입", e.totalDangerEntries, `런당 ${fmt1(e.avgEntriesPerRun)}`)}${card("위험 진입 런 비율", fmtPct(e.dangerEntryRate))}
    ${card("4인 전 진입", e.beforeParty4)}${card("4인 후 진입", e.afterParty4)}${card("합체 후 진입", e.afterFusion)}
    ${card("힐러 없이 진입", e.noHealer)}${card("탱커 없이 진입", e.noTank)}${card("광역 없이 진입", e.noAoE)}
  </div>`;
  const B = `<h4>B. 위험 진입 후 결과 <span class="ar-meta">(진입 후 3전투 이내 전멸 = 그 진입이 전멸로 이어졌다고 추정)</span></h4><div class="ar-cards">
    ${card("진입 후 전멸률", fmtPct(o.dangerEntryWipeRate))}${card("진입 후 생존률", fmtPct(o.dangerEntrySurvivalRate))}
    ${card("진입 1전투 내 전멸", o.within1)}${card("2전투 내", o.within2)}${card("3전투 내", o.within3)}
    ${card("위험전멸 평균심도", fmt1(o.avgDepthAtDangerWipe))}${card("평균 파티수", fmt1(o.avgPartySizeAtDangerWipe))}${card("평균 진입HP%", fmtPct(o.avgStartHpAtDangerWipe))}${card("평균 기절", fmt1(o.avgDownsAtDangerWipe))}
  </div>`;
  const pathRows = da.topPaths.length ? da.topPaths.map((p) => `<li><code>${esc(p.sig)}</code> <b>${p.count}</b></li>`).join("") : `<li class="ar-meta">위험 진입 전멸 표본 없음</li>`;
  const pwRows = da.topPreWipe.length ? da.topPreWipe.map((p) => `<li><code>${esc(p.choice)}</code> <b>${p.count}</b></li>`).join("") : `<li class="ar-meta">없음</li>`;
  const C = `<h4>C. 대표 위험 경로 <span class="ar-meta">(위험 진입을 가진 전멸 런 기준)</span></h4>
    <div class="ar-rewards"><div class="ar-rewardcol"><h4>danger-related wipe path TOP10</h4><ol>${pathRows}</ol></div>
    <div class="ar-rewardcol"><h4>전멸 직전 선택 TOP</h4><ol>${pwRows}</ol></div></div>`;
  const mk = da.markers.length
    ? `<div class="ar-tablewrap"><table><thead><tr><th class="txt">위험 마커(추정)</th><th>건수</th><th>전체비율</th></tr></thead><tbody>${da.markers.map((m) => `<tr><td class="txt">${m.tag}</td><td>${m.count}</td><td>${fmtPct(m.rate)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="ar-empty">위험 마커 없음(위험 진입 전멸 표본 없음).</div>`;
  const D = `<h4>D. 위험 루트 마커 분포 <span class="ar-meta">— 추정(failureTags와 별개 표시용)</span></h4>${mk}`;
  $("ar-danger").innerHTML = `<h3>Danger Route Autopsy <span class="ar-meta">— N&gt;D&gt;WIPE·정예 진입 후 전멸 관측(관측 신호 / candidate / watch)</span></h3>${A}${B}${C}${D}`;
}

/* ── Route Grammar 02 — 새 루트 문법 렌더(Summary / Fusion Empty Slot / Anti-Farm / Fun Wipe) ── */
const distHtml = (d) => Object.entries(d).sort((a, b) => (a[0] === "—" ? 1 : b[0] === "—" ? -1 : Number(a[0]) - Number(b[0]))).map(([k, c]) => `<span class="ar-distchip">${esc(k)}:<b>${c}</b></span>`).join("") || "—";
function renderRouteGrammar(rg) {
  const s = rg.summary, fs = rg.fusionSlot, af = rg.antiFarm, fw = rg.funWipe;
  const routeCells = ROUTE_GRAMMAR_ORDER.map((rt) => `${ROUTE_TOKEN[rt] || rt} <b>${s.routeChoiceCounts[rt]}</b> <span class="ar-meta">${fmtPct(s.routeChoiceRate[rt])}</span>`).join(" &nbsp;·&nbsp; ");
  const A = `<h4>A. Route Grammar Summary <span class="ar-meta">(루트 선택 분포 · N/ALLY/BOND/D/E/REST/BOSS)</span></h4>
    <p class="ar-routeline">${routeCells}</p>
    <div class="ar-cards">
      ${card("첫 영입(ALLY) 심도", fmt1(s.firstRecruitRouteDepth))}${card("4인 완성 심도", fmt1(s.party4Depth), `도달 ${fmtPct(s.party4Rate)}`)}${card("첫 합체(BOND) 심도", fmt1(s.firstFusionRouteDepth))}${card("첫 깊은수풀 심도", fmt1(s.firstDangerDepth))}${card("첫 쉼터 심도", fmt1(s.firstRestDepth))}
      ${card("경계도@4인", fmt1(s.alertnessAtParty4), `유효 ${fmt1(s.effectiveAlertnessAtParty4)}`)}${card("잠복@4인 전환", fmt1(s.latentAlertnessAtParty4))}
      ${card("4인전 전투", fmt1(s.preParty4BattleCount))}${card("4인전 성장픽", fmt1(s.preParty4GrowthCount))}${card("4인전 위험", fmt1(s.preParty4DangerCount))}${card("4인전 영입", fmt1(s.preParty4RecruitCount))}
      ${card("4인전 전멸률", fmtPct(s.preParty4WipeRate))}${card("4인후 전멸률", fmtPct(s.postParty4WipeRate))}
    </div>
    <div class="ar-rewards"><div class="ar-rewardcol"><h4>전멸 직전 루트 TOP</h4><ol>${s.routeBeforeWipeTop.map((x) => `<li><code>${esc(x.key)}</code> <b>${x.count}</b></li>`).join("") || "<li class='ar-meta'>없음</li>"}</ol></div>
    <div class="ar-rewardcol"><h4>전멸 직전 3루트 TOP</h4><ol>${s.lastThreeRoutesTop.map((x) => `<li><code>${esc(x.key)}</code> <b>${x.count}</b></li>`).join("") || "<li class='ar-meta'>없음</li>"}</ol></div></div>`;
  const B = `<h4>B. Fusion Choice / Empty Slot Watch <span class="ar-meta">(합체 후 자동 영입 없음 — 빈자리/보충/작은 파티)</span></h4>
    <div class="ar-cards">
      ${card("합체 빈자리 발생", fs.fusionCreatedEmptySlotCount, fmtPct(fs.fusionCreatedEmptySlotRate))}${card("합체후 4인미만 전투", fmt1(fs.battlesWhileUnder4AfterFusionAvg))}${card("합체후 보충 심도", fmt1(fs.recruitAfterFusionDepth))}
      ${card("보충 스킵", fs.skippedRecruitAfterFusionCount, fmtPct(fs.skippedRecruitAfterFusionRate))}${card("빈자리 방치 전멸", fs.wipeAfterFusionWithoutRefillCount, fmtPct(fs.wipeAfterFusionWithoutRefillRate))}
      ${card("4인미만 클리어", fs.clearWithUnder4PartyCount, fmtPct(fs.clearWithUnder4PartyRate))}${card("고급 소수 클리어", fs.highTierSmallPartyClearCount)}
      ${card("평균 클리어 심도", fmt1(fs.avgClearDepth))}${card("첫 2차 심도", fmt1(fs.avgDepthToFirstSecondClass))}${card("보스 도전 심도", fmt1(fs.avgDepthToBossAttempt))}
    </div>
    <div class="ar-cards">${card("합체후 파티수 분포", distHtml(fs.partySizeAfterFusionDist))}${card("보스 도전 파티수 분포", distHtml(fs.bossAttemptPartySizeDist))}${card("최종 파티수 분포", distHtml(fs.finalPartySizeDist))}</div>`;
  const C = `<h4>C. Anti-Farm Watch <span class="ar-meta">(4인 전 파밍 신호 — 예고/누설)</span></h4>
    <div class="ar-cards">
      ${card("파밍 의심 런", af.preParty4FarmSuspectCount, fmtPct(af.preParty4FarmSuspectRate))}${card("동료 무시 런", af.ignoredAllyRuns)}${card("4인전 성장 평균", fmt1(af.preParty4GrowthAvg))}
      ${card("경고1 발생률", fmtPct(af.warningLevel1Rate))}${card("경고2 발생률", fmtPct(af.warningLevel2Rate))}${card("잠복누설 근접", af.latentAlertLeakCount)}
    </div>
    <div class="ar-cards">${card("4인전 전투수 분포", distHtml(af.preParty4BattleDist))}</div>`;
  const D = `<h4>D. Fun Wipe / Choice Ownership Watch <span class="ar-meta">— 추정(완벽한 인과 아님 · "내 선택의 결과"로 읽히는 전멸)</span></h4>` + (fw.routeCauseSummary.length
    ? `<div class="ar-tablewrap"><table><thead><tr><th class="txt">전멸 원인(추정)</th><th>건수</th><th>전체비율</th></tr></thead><tbody>${fw.routeCauseSummary.map((c) => `<tr><td class="txt">${c.tag}</td><td>${c.count}</td><td>${fmtPct(c.rate)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="ar-empty">전멸 원인 표본 없음.</div>`);
  $("ar-routegrammar").innerHTML = `<h3>Route Grammar 02 <span class="ar-meta">— 새 루트 문법 관측(관측 신호 / candidate / watch)</span></h3>${A}${B}${C}${D}`;
}

/* ── Observation Batch 01 — Soft Ramp Split 비교 패널 렌더 ────────────────── */
const fmtPctD = (n) => (n >= 0 ? "+" : "−") + (Math.round(Math.abs(n) * 1000) / 10).toFixed(1) + "%";
function deltaCell(n, goodPos) {
  if (n == null) return "";
  if (Math.abs(n) < 0.0005) return ` <span class="ar-d zero">±0</span>`;
  const good = goodPos ? n > 0 : n < 0;
  return ` <span class="ar-d ${good ? "up" : "down"}">${fmtPctD(n)}</span>`;
}
function splitHead(seedNote) {
  return `<h3>Soft Ramp Split <span class="ar-meta">— 같은 policy·seed·runs로 baseline + Soft Ramp 01 + 6 split 비교(관측 신호 / candidate). Δ는 vs Baseline.</span>
    <span id="ar-split-btns" class="ar-splitctrl">
      <button type="button" class="ar-mini" data-split="10">10×8</button>
      <button type="button" class="ar-mini" data-split="30">30×8</button>
      <button type="button" class="ar-mini" data-split="60">60×8</button>
      <button type="button" class="ar-mini" data-split="100">100×8</button>
      <button type="button" id="ar-split-cancel" class="ar-mini" disabled>취소</button>
      <span id="ar-split-prog" class="ar-meta">${seedNote || ""}</span>
    </span></h3>`;
}
function renderSplitPanel(sr) {
  if (!sr || !sr.results.length) {
    $("ar-splitpanel").innerHTML = splitHead() + `<div class="ar-empty">실행하면 Baseline + Soft Ramp 01 + 6 split 프로필을 같은 policy·seed·runs로 주회해 비교합니다(seed 비우면 자동 고정).<br>“HP가 살렸는지 / 공격이 살렸는지 / 위험 루트만 문제인지 / 파티 3인 위험 진입만 문제인지”를 Δ로 구분.</div>`;
    return;
  }
  const tagN = (label, split) => `<td class="txt">${esc(label)}${split ? ' <span class="ar-2nd">split</span>' : ""}</td>`;
  const perf = sr.results.map((x) => {
    const m = x.metrics, d = x.delta || {}, base = x.profileId === "baseline";
    return `<tr class="${x.split ? "ar-splitrow" : ""}">${tagN(x.label, x.split)}
      <td>${fmtPct(m.clearRate)}${base ? "" : deltaCell(d.clearRate, true)}</td>
      <td>${fmtPct(m.reached9Rate)}${base ? "" : deltaCell(d.reached9Rate, true)}</td>
      <td>${fmtPct(m.reached17Rate)}</td>
      <td>${m.earlyWipe18Count} <span class="ar-meta">${fmtPct(m.earlyWipe18Rate)}</span>${base ? "" : deltaCell(d.earlyWipe18Rate, false)}</td>
      <td>${fmtPct(m.party4Rate)}${base ? "" : deltaCell(d.party4Rate, true)}</td>
      <td>${fmtPct(m.firstFusionRate)}${base ? "" : deltaCell(d.firstFusionRate, true)}</td>
      <td>${fmtPct(m.bossAttemptRate)}${base ? "" : deltaCell(d.bossAttemptRate, true)}</td>
      <td>${fmt1(m.avgFinalDepth)}/${fmt1(m.p50FinalDepth)}</td><td>${m.maxDepth}</td>
      <td>${fmtPct(m.bossKillRate)}</td><td>${fmtPct(m.bossAttemptKillRate)}</td></tr>`;
  }).join("");
  const perfTable = `<div class="ar-tablewrap"><table><thead><tr><th class="txt">프로필</th><th>클리어율 Δ</th><th>9+ Δ</th><th>17+</th><th>1-8전멸 Δ</th><th>첫4인 Δ</th><th>첫합체 Δ</th><th>보스도전 Δ</th><th>평균/p50심도</th><th>최고</th><th>보스처치</th><th>도전시처치</th></tr></thead><tbody>${perf}</tbody></table></div>`;

  const bottleneck = sr.results.map((x) => {
    const m = x.metrics;
    return `<tr class="${x.split ? "ar-splitrow" : ""}">${tagN(x.label, x.split)}
      <td>${m.midWipe916Count} <span class="ar-meta">${fmtPct(m.midWipe916Rate)}</span></td>
      <td>${m.lowPartyWipeCount} <span class="ar-meta">${fmtPct(m.lowPartyWipeRate)}</span></td>
      <td>${m.postParty4WipeCount} <span class="ar-meta">${fmtPct(m.postParty4WipeRate)}</span></td>
      <td>${m.postFusionWipeCount} <span class="ar-meta">${fmtPct(m.postFusionWipeRate)}</span></td>
      <td>${fmtPct(m.firstRecruitRate)}</td><td>${fmtPct(m.firstClassRate)}</td><td>${fmtPct(m.secondClassRate)}</td><td>${fmtPct(m.firstBossKeyRate)}</td>
      <td>${fmtPct(m.noHealerWipeRate)}</td><td>${fmtPct(m.noTankWipeRate)}</td><td>${fmtPct(m.noAoEWipeRate)}</td><td>${fmtPct(m.noSecondClassWipeRate)}</td></tr>`;
  }).join("");
  const bottleTable = `<h4>병목·마일스톤·역할축 <span class="ar-meta">(count·rate / 마일스톤 도달률 / 역할축 전멸률)</span></h4><div class="ar-tablewrap"><table><thead><tr><th class="txt">프로필</th><th>9-16전멸</th><th>저파티전멸</th><th>4인후전멸</th><th>합체후전멸</th><th>첫영입</th><th>첫1차</th><th>첫2차</th><th>첫보스키</th><th>힐러X전멸</th><th>탱커X전멸</th><th>광역X전멸</th><th>2차X전멸</th></tr></thead><tbody>${bottleneck}</tbody></table></div>`;

  const seedNote = `seed ${sr.seed} · ${sr.count}회×${sr.results.length}프로필 · ${policyLabel(sr.policyId)}${sr.canceled ? " · 취소됨" : ""}`;
  $("ar-splitpanel").innerHTML = splitHead(seedNote) + perfTable + bottleTable +
    `<p class="ar-meta">관측 신호: Δ가 클수록 그 성분이 런을 살린 후보. 어떤 split도 “정답”이 아니라 watch 좌표 — 손맛 판단은 나라.</p>`;
}

/* ── A/B 프로필 비교 히스토리(배치 누적) ─────────────────────────────── */
const comparisons = []; // 각 배치 완료 시 1행 누적
function pushComparison(a, meta, verdict, ar) {
  comparisons.push({
    theme: themeLabel(meta.themeId), policy: policyLabel(meta.policyId), profile: (PROFILES[meta.profileId] || {}).label || meta.profileId,
    runs: a.attempts, clearRate: a.clearRate, verdict: verdict.overall, deaths1to8: a.deaths1to8,
    firstParty4: a.firstParty4Rate, firstFusion: a.firstFusionRate, bossAttempt: a.bossAttemptRate, bossKill: a.bossKillOnAttemptRate,
    secondRuns: a.secondRuns, reached9: a.reached9Rate, failTop: (ar.failureCauses[0] || {}).tag || "—",
  });
}
function renderComparison() {
  const head = `<h3>A/B 프로필 비교 히스토리 <button type="button" id="ar-clear-compare" class="ar-mini">초기화</button></h3>`;
  if (!comparisons.length) { $("ar-compare").innerHTML = head + `<div class="ar-empty">배치를 실행하면 한 줄씩 누적됩니다(정책×프로필 A/B 비교용).</div>`; wireClearCompare(); return; }
  const rows = comparisons.map((c) =>
    `<tr><td class="txt">${esc(c.policy)}</td><td class="txt">${esc(c.profile)}</td><td>${c.runs}</td><td>${fmtPct(c.clearRate)}</td><td>${badge(c.verdict)}</td><td>${c.deaths1to8}</td><td>${fmtPct(c.firstParty4)}</td><td>${fmtPct(c.firstFusion)}</td><td>${fmtPct(c.bossAttempt)}</td><td>${fmtPct(c.bossKill)}</td><td>${fmtPct(c.reached9)}</td><td>${c.secondRuns}</td><td class="txt">${c.failTop}</td></tr>`).join("");
  $("ar-compare").innerHTML = head +
    `<div class="ar-tablewrap"><table><thead><tr><th class="txt">정책</th><th class="txt">프로필</th><th>runs</th><th>클리어율</th><th>판정</th><th>1-8전멸</th><th>첫4인</th><th>첫합체</th><th>보스도전</th><th>보스처치</th><th>9+도달</th><th>2차런</th><th class="txt">실패TOP</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  wireClearCompare();
}
function wireClearCompare() { const b = $("ar-clear-compare"); if (b) b.addEventListener("click", () => { comparisons.length = 0; renderComparison(); }); }

/* ── 컨트롤/엔트리 ───────────────────────────────────────────────── */
let lastRuns = null, lastMeta = null, lastVerdict = null, lastAgg = null, lastAr04 = null, lastDanger = null, lastSplit = null, lastRouteGrammar = null;
function setProgress(done, total) { const pct = total ? (done / total) * 100 : 0; $("ar-progress-fill").style.width = pct + "%"; $("ar-progress-text").textContent = `${done} / ${total}`; }

function renderAll(runs, meta) {
  lastRuns = runs; lastMeta = meta;
  if (!runs.length) { $("ar-summary").innerHTML = `<div class="ar-empty">실행 결과가 없습니다.</div>`; lastVerdict = lastAr04 = lastAgg = lastDanger = lastRouteGrammar = null; return; }
  const a = aggregate(runs);
  const verdict = evaluateTheme(meta.themeId, meta.policyId, a);
  const ar = aggregateAR04(runs, meta.themeId, meta.policyId, a);
  const da = aggregateDangerAutopsy(runs);
  const rg = aggregateRouteGrammar(runs);
  lastVerdict = verdict; lastAgg = a; lastAr04 = ar; lastDanger = da; lastRouteGrammar = rg;
  renderValidation(a, meta, verdict); renderTargets(meta.themeId); renderFlags(meta.themeId, meta.policyId, a);
  renderDiagnosis(ar); renderFailureCause(ar); renderPaths(ar); renderMilestones(ar); renderMilestoneSurvival(ar); renderRoleDependency(ar); renderBossFlow(ar);
  renderDangerAutopsy(da); renderRouteGrammar(rg);
  renderSummary(a, meta); renderDeathBand(a); renderParties(a); renderJobs(a); renderSecond(a); renderRewards(a);
  if (!meta.canceled) { pushComparison(a, meta, verdict, ar); renderComparison(); }
  $("ar-exports").hidden = false;
}

/* ── Soft Ramp Split 실행(8 프로필 순차 주회) ─────────────────────────── */
function setSplitRunning(on) {
  $("ar-splitpanel").querySelectorAll("[data-split]").forEach((b) => (b.disabled = on));
  const c = $("ar-split-cancel"); if (c) c.disabled = !on;
}
async function runSplit(count) {
  const policyId = $("ar-policy").value;
  const themeId = $("ar-theme") ? $("ar-theme").value : "beginner";
  const seedRaw = $("ar-seed").value.trim();
  // split 비교는 모든 프로필이 같은 RNG를 봐야 의미가 있으므로 seed를 항상 고정한다(비우면 자동 생성).
  const seed = seedRaw === "" ? Math.floor(Math.random() * 1e9) : parseInt(seedRaw, 10);
  setSplitRunning(true);
  const prog = (i, total, profileId, d, t) => { const p = $("ar-split-prog"); if (p) p.textContent = `seed ${seed} · ${(PROFILES[profileId] || {}).label || profileId} (${i + 1}/${total}) · ${d}/${t}`; };
  lastSplit = await runSoftRampSplit({ count, policyId, themeId, seed, onProgress: prog });
  renderSplitPanel(lastSplit);
  $("ar-exports").hidden = false;
}

async function run(count) {
  const policyId = $("ar-policy").value;
  const profileId = $("ar-profile").value;
  const themeId = $("ar-theme") ? $("ar-theme").value : "beginner";
  const seedRaw = $("ar-seed").value.trim();
  const seed = seedRaw === "" ? null : parseInt(seedRaw, 10);
  $("ar-run-btns").querySelectorAll("button").forEach((b) => (b.disabled = true));
  $("ar-cancel").disabled = false; $("ar-progress").hidden = false; setProgress(0, count);
  const meta = await runBatch({ count, policyId, profileId, themeId, seed, onProgress: setProgress });
  renderAll(meta.runs, meta);
  $("ar-run-btns").querySelectorAll("button").forEach((b) => (b.disabled = false));
  $("ar-cancel").disabled = true; $("ar-progress").hidden = true;
}

async function copy(text, btn, okLabel) {
  const orig = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = okLabel; }
  catch (e) {
    try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); btn.textContent = okLabel; }
    catch (e2) { btn.textContent = "복사 실패"; }
  }
  setTimeout(() => { btn.textContent = orig; }, 1200);
}

function syncDesc() {
  const th = (THEMES[$("ar-theme") ? $("ar-theme").value : "beginner"] || {});
  const pol = (POLICIES[$("ar-policy").value] || {}).desc || "";
  const prof = (PROFILES[$("ar-profile").value] || {}).desc || "";
  $("ar-desc").textContent = `${th.desc || ""} · ${pol} · ${prof}`;
}

export function initAutoRunReport() {
  // 테마/정책/프로필 select 채움. 비활성 테마는 "(준비 중)" + disabled(데이터 미구현).
  const theme = $("ar-theme");
  if (theme && !theme.children.length) THEME_ORDER.forEach((id) => { const o = new Option(THEMES[id].label + (THEMES[id].enabled ? "" : " (준비 중)"), id); o.disabled = !THEMES[id].enabled; theme.add(o); });
  const pol = $("ar-policy"); if (pol && !pol.children.length) POLICY_ORDER.forEach((id) => pol.add(new Option(POLICIES[id].label, id)));
  const prof = $("ar-profile"); if (prof && !prof.children.length) PROFILE_ORDER.forEach((id) => prof.add(new Option(PROFILES[id].label, id)));
  theme && theme.addEventListener("change", () => { renderTargets(theme.value); syncDesc(); });
  pol && pol.addEventListener("change", syncDesc);
  prof && prof.addEventListener("change", syncDesc);
  syncDesc();
  renderTargets(theme ? theme.value : "beginner");
  renderComparison();
  renderDangerAutopsy({ entry: { totalDangerEntries: 0, dangerEntryRate: 0, avgEntriesPerRun: 0, beforeParty4: 0, afterParty4: 0, afterFusion: 0, noHealer: 0, noTank: 0, noAoE: 0 }, outcome: { dangerEntryWipeRate: 0, dangerEntrySurvivalRate: 0, wipesWithDanger: 0, within1: 0, within2: 0, within3: 0, avgDepthAtDangerWipe: 0, avgPartySizeAtDangerWipe: 0, avgStartHpAtDangerWipe: 0, avgDownsAtDangerWipe: 0 }, topPaths: [], topPreWipe: [], markers: [] });
  renderSplitPanel(null);
  $("ar-routegrammar").innerHTML = `<h3>Route Grammar 02 <span class="ar-meta">— 새 루트 문법 관측</span></h3><div class="ar-empty">배치를 실행하면 루트 선택 분포(N/ALLY/BOND/D/E/REST/BOSS) · 합체 빈자리 · anti-farm · fun-wipe 관측이 표시됩니다.</div>`;
  $("ar-run-btns").addEventListener("click", (e) => { const b = e.target.closest("[data-count]"); if (b) run(Number(b.dataset.count)); });
  $("ar-cancel").addEventListener("click", cancelBatch);
  // Soft Ramp Split 패널(헤더 버튼은 재렌더로 교체되므로 섹션에 위임)
  $("ar-splitpanel").addEventListener("click", (e) => { const b = e.target.closest("[data-split]"); if (b && !b.disabled) { runSplit(Number(b.dataset.split)); return; } if (e.target.closest("#ar-split-cancel")) cancelSplit(); });
  $("ar-copy-tsv").addEventListener("click", (e) => { if (lastRuns) copy(runsToTSV(lastRuns, { verdict: lastVerdict, target: lastVerdict && lastVerdict.target }), e.target, "복사됨!"); });
  $("ar-copy-json").addEventListener("click", (e) => { if (lastRuns || lastSplit) copy(runsToJSON(lastRuns || [], { themeId: lastMeta && lastMeta.themeId, policyId: lastMeta && lastMeta.policyId, profileId: lastMeta && lastMeta.profileId, verdict: lastVerdict, target: lastVerdict && lastVerdict.target, aggregate: lastAgg, ar04: lastAr04, profileComparison: comparisons, split: lastSplit, danger: lastDanger, routeGrammar: lastRouteGrammar }), e.target, "복사됨!"); });
}
