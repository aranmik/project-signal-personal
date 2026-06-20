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
const BASE_RECIPES = ACTIVE_FUSION_RECIPES.filter((r) => r.materials.every((m) => BASE_JOBS.includes(m)));
// 2차 레시피의 재료(1차/기본) 집합 — "2차로 가는 1차"를 선호하기 위함.
const SECOND_MATERIALS = new Set(ACTIVE_FUSION_RECIPES.filter((r) => isSecond(r.result)).flatMap((r) => r.materials));

/* ── 런 컨텍스트 헬퍼(정책 판단 — gameState 실시간 조회) ──────────────── */
function aliveParty() { return gameState.party.filter((u) => !u.isDead); }
function partyHpRatio() { const a = aliveParty(); return a.length ? a.reduce((s, u) => s + u.hp / u.maxHp, 0) / a.length : 1; }
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
    pickRoute: (choices) => { if (choices.includes("boss")) return "boss"; return ["danger", "elite", "normal", "rest"].find((rt) => choices.includes(rt)) || choices[0]; },
  },
  // 3) 안정 운영가 — 생존/4인 완성 우선. "사람이 조심해서 플레이하면 어디까지 가는가".
  steady: {
    id: "steady", label: "안정 운영가", desc: "생존/4인 완성 우선",
    startFormation: () => { const s = pick(SURVIVAL_BASE); const o = pick(BASE_JOBS.filter((j) => j !== s)); return makeFormation([s, o]); },
    pickReward: (offer) => preferIds(offer, SURVIVAL_REWARDS),
    decideFusion: (options) => (partyHpRatio() < 0.6 ? null : pick(options).result), // 약하거나 HP 낮으면 보류
    pickRecruit: (offer) => preferIds(offer, SURVIVAL_BASE),                          // 생존 직업 우선으로 4인 완성
    pickRoute: (choices) => {
      const hurt = partyHpRatio() < 0.55;
      if (hurt && choices.includes("rest")) return "rest";                            // 다치면 회복 우선(죽음 나선 차단)
      if (choices.includes("boss") && curPartySize() >= 4 && partyHpRatio() >= 0.6) return "boss"; // 키 충분+상태 좋으면 도전
      if (curPartySize() < 4) {                                                       // 4인 완성 우선
        if (!hurt && choices.includes("danger")) return "danger";                     // 건강하면 영입 주는 깊은 수풀
        if (choices.includes("rest")) return "rest";
        if (choices.includes("normal")) return "normal";
      }
      const order = hurt ? ["rest", "normal", "elite", "danger"] : ["normal", "elite", "danger", "rest"]; // 깊은수풀만 반복하지 않음
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
    pickRoute: (choices) => {
      if (partyHpRatio() < 0.25 && choices.includes("rest")) return "rest";           // HP 매우 낮을 때만 휴식
      if (choices.includes("boss")) return "boss";                                    // 빠른 보스 도전
      return ["danger", "elite", "normal", "rest"].find((rt) => choices.includes(rt)) || choices[0]; // 위험/정예 선호
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
    pickRoute: (choices) => {
      if (partyHpRatio() < 0.4 && choices.includes("rest")) return "rest";
      if (choices.includes("boss") && partyHasSecond()) return "boss";                // 2차 확보 + 키 있으면 도전
      return ["danger", "elite", "normal", "rest"].find((rt) => choices.includes(rt)) || choices[0]; // 영입/합체(2차 재료)·열쇠
    },
  },
};
const POLICY_ORDER = ["random", "fusion", "steady", "aggressive", "secondChaser"];

/* ── 실험 프로필(Baseline / Early Cushion 01) ─────────────────────────
   Early Cushion 01 = headless 실험 전용 완충(본게임 기본값 무변경, baseline은 보정 0):
     (1) 4인 파티 완성 전 + HP 낮을 때 안전 라우팅 보정(정책 라우트 위에 덮어씀):
         - 다치면(평균HP<55%) 쉼터 우선(회복) / 건강하면 영입 주는 깊은 수풀로 4인 채움.
     (2) 합체 직후 다음 전투 1회에 한해 파티 전체 maxHp 12% 보호막(합체 후 인원/HP 흔들림 완화).
   둘 다 "정책/드라이버 판단 보정"이라 적/직업/스킬/보상 수치를 건드리지 않는다. */
const PROFILES = {
  baseline: { id: "baseline", label: "Baseline", desc: "현재 본게임 규칙 그대로" },
  cushion: { id: "cushion", label: "Early Cushion 01", desc: "4인 전 안전 라우팅 + 합체 직후 보호막(실험 전용)" },
};
const PROFILE_ORDER = ["baseline", "cushion"];
const CUSHION_SHIELD_PCT = 0.12; // 합체 직후 보호막 = 파티 maxHp의 12%(10~15% 권장 내, 과하지 않게)

function cushionRouteOverride(policyChoice, choices) {
  const hurt = partyHpRatio() < 0.55;
  if (hurt && choices.includes("rest")) return "rest";                                // 회복 우선(죽음 나선 차단)
  if (curPartySize() < 4 && !hurt && choices.includes("danger")) return "danger";      // 건강하면 영입으로 4인 채움
  return policyChoice;
}
function applyCushionShield() {
  // 헤드리스 전용: 합체 직후 다음 전투 시작 시 파티에 1회성 보호막. 다음 전투는 createInitialParty로
  //   파티가 재생성(shield 0)되므로 자연히 "1전투 한정"이 된다. 본게임 데이터/수치 무변경.
  gameState.party.forEach((u) => { if (!u.isDead) u.shield = Math.max(u.shield || 0, Math.round(u.maxHp * CUSHION_SHIELD_PCT)); });
}

/* ── 풀-런 1회 구동(screen 전이 상태머신 + 정책 + 프로필) ─────────────── */
const MAX_DECISIONS = 400;
const MAX_BATTLES = 60;

function playOneRun(policy, profileId, runIndex) {
  const rec = {
    runIndex, policy: policy.id, profile: profileId, result: null, finalDepth: 0,
    battleCount: 0, fusionCount: 0, recruitCount: 0, faintCount: 0,
    bossAttempted: false, bossKilled: false,
    finalParty: [], secondClassCount: 0, gotSecondClass: false,
    selectedRewards: [], routeChoices: [], endReason: "",
    jobsSeen: new Set(),
    // 재미 도달 지표(없으면 0)
    firstFusionDepth: 0, firstRecruitDepth: 0, partySize4Depth: 0, firstSecondClassDepth: 0,
  };
  const cushion = profileId === "cushion";
  let shieldPending = false; // 합체 직후 보호막 대기(cushion 전용)

  startRun(policy.startFormation());

  let decisions = 0;
  while (true) {
    // 재미 도달 심도 기록(첫 도달 시 1회)
    if (!rec.partySize4Depth && curPartySize() >= 4) rec.partySize4Depth = gameState.run.depth;
    if (!rec.firstSecondClassDepth && partyHasSecond()) rec.firstSecondClassDepth = gameState.run.depth;

    if (gameState.run.result === "clear") { rec.result = "clear"; rec.endReason = "clear"; rec.bossKilled = true; break; }
    if (gameState.run.result === "defeat") { rec.result = "defeat"; rec.endReason = "defeat"; break; }
    if (++decisions > MAX_DECISIONS || rec.battleCount > MAX_BATTLES) { rec.result = "incomplete"; rec.endReason = "cap"; break; }

    const screen = gameState.screen;
    if (screen === "battle") {
      if (cushion && shieldPending) { applyCushionShield(); shieldPending = false; } // 합체 직후 1전투 보호막
      partyJobIds().forEach((j) => rec.jobsSeen.add(j));
      rec.battleCount += 1;
      const ok = runHeadlessBattle();
      if (!ok) { rec.result = "incomplete"; rec.endReason = "battle-timeout"; break; }
      if (gameState.run.result !== "defeat") rec.faintCount += gameState.party.filter((u) => u.isDead).length;
    } else if (screen === "reward") {
      const offer = gameState.run.rewardOffer || [];
      if (offer.length === 0) { rec.result = "incomplete"; rec.endReason = "reward-empty"; break; }
      const id = policy.pickReward(offer);
      rec.selectedRewards.push(id);
      applyReward(id);
    } else if (screen === "fusion") {
      const options = availableFusions(partyJobIds());
      const choiceId = options.length ? policy.decideFusion(options) : null;
      if (choiceId) {
        rec.fusionCount += 1;
        if (!rec.firstFusionDepth) rec.firstFusionDepth = gameState.run.depth;
        if (cushion) shieldPending = true; // 다음 전투에 보호막
        applyFusion(choiceId);
      } else skipFusion();
    } else if (screen === "fusionResult") {
      continueAfterFusion();
    } else if (screen === "recruit") {
      const offer = gameState.run.recruitOffer || [];
      if (offer.length) {
        const jobId = policy.pickRecruit(offer);
        if (jobId) { previewRecruit(jobId); rec.recruitCount += 1; if (!rec.firstRecruitDepth) rec.firstRecruitDepth = gameState.run.depth; }
      }
      confirmRecruit();
    } else if (screen === "arrange") {
      confirmArrange();
    } else if (screen === "route") {
      const choices = gameState.run.routeChoices || ["normal"];
      let rt = policy.pickRoute(choices);
      if (cushion) rt = cushionRouteOverride(rt, choices); // 실험 프로필: 안전 라우팅 보정
      rec.routeChoices.push(rt);
      if (rt === "boss") rec.bossAttempted = true;
      chooseRoute(rt);
    } else if (screen === "rest") {
      continueFromRest();
    } else {
      rec.result = "incomplete"; rec.endReason = "unknown:" + screen; break;
    }
  }

  rec.finalDepth = gameState.run.depth || 0;
  rec.finalParty = SLOT_ORDER.map((k) => (gameState.run.formation || {})[k]).filter(Boolean);
  rec.finalParty.forEach((j) => rec.jobsSeen.add(j));
  rec.secondClassCount = rec.finalParty.filter(isSecond).length;
  rec.gotSecondClass = [...rec.jobsSeen].some(isSecond);
  rec.reachedDepth9 = rec.finalDepth >= 9;
  rec.reachedDepth17 = rec.finalDepth >= 17;
  rec.reachedDepth25 = rec.finalDepth >= 25;
  if (!rec.result) { rec.result = "incomplete"; rec.endReason = rec.endReason || "incomplete"; }
  return rec;
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

export async function runBatch({ count, policyId, profileId = "baseline", seed, onProgress }) {
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
      runs.push(playOneRun(policy, profileId, i));
      if (onProgress) onProgress(i + 1, count);
      if ((i + 1) % CHUNK === 0 && i + 1 < count) await nextTick();
    }
  } finally {
    setHeadlessRun(false);
    if (useSeed) restoreRandom();
    restoreState(snap); // immortal 포함 본게임 state 완전 복구(deep)
  }
  return { runs, elapsed: performance.now() - t0, policyId, profileId, count, seed: useSeed ? seed : null, canceled: cancelFlag };
}
export function cancelBatch() { cancelFlag = true; }

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
    deathBand, clearParty: topGroups(clears), wipeParty: topGroups(wipes),
    jobs, secondJobs, rewardAll: rewardCount(runs), rewardClear: rewardCount(clears), rewardWipe: rewardCount(wipes),
  };
}

/* ── TSV / JSON ─────────────────────────────────────────────────── */
const TSV_COLS = [
  "runIndex", "policy", "profile", "result", "finalDepth", "battleCount", "fusionCount", "recruitCount",
  "faintCount", "bossAttempted", "bossKilled", "finalParty", "secondClassCount", "selectedRewards", "endReason",
  "routeChoices", "deathDepthBand", "firstFusionDepth", "firstRecruitDepth", "partySize4Depth",
  "firstSecondClassDepth", "reachedDepth9", "reachedDepth17", "reachedDepth25",
];
export function runsToTSV(runs) {
  const lines = [TSV_COLS.join("\t")];
  runs.forEach((r) => {
    lines.push([
      r.runIndex, r.policy, r.profile, r.result, r.finalDepth, r.battleCount, r.fusionCount, r.recruitCount,
      r.faintCount, r.bossAttempted ? 1 : 0, r.bossKilled ? 1 : 0, r.finalParty.map(jobName).join("+"), r.secondClassCount,
      r.selectedRewards.map(rewardName).join("|"), r.endReason, r.routeChoices.join(">"),
      r.result === "defeat" ? bandOf(r.finalDepth) : "", r.firstFusionDepth, r.firstRecruitDepth, r.partySize4Depth,
      r.firstSecondClassDepth, r.reachedDepth9 ? 1 : 0, r.reachedDepth17 ? 1 : 0, r.reachedDepth25 ? 1 : 0,
    ].join("\t"));
  });
  return lines.join("\n");
}
function runsToJSON(runs) { return JSON.stringify(runs.map((r) => ({ ...r, jobsSeen: [...r.jobsSeen] })), null, 0); }

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

/* ── 정책/프로필 비교표(배치 누적) ───────────────────────────────────── */
const comparisons = []; // 각 배치 완료 시 1행 누적
function pushComparison(a, meta) {
  comparisons.push({
    policy: (POLICIES[meta.policyId] || {}).label || meta.policyId,
    profile: (PROFILES[meta.profileId] || {}).label || meta.profileId,
    runs: a.attempts, clearRate: a.clearRate, avgDepth: a.avgDepth, medianDepth: a.medianDepth,
    maxDepth: a.maxDepth, deaths1to8: a.deaths1to8, reached9: a.reached9, secondRuns: a.secondRuns, secondClearRate: a.secondClearRate,
  });
}
function renderComparison() {
  if (!comparisons.length) { $("ar-compare").innerHTML = `<h3>정책/프로필 비교표 <button type="button" id="ar-clear-compare" class="ar-mini">초기화</button></h3><div class="ar-empty">배치를 실행하면 한 줄씩 누적됩니다(정책·프로필 비교용).</div>`; wireClearCompare(); return; }
  const rows = comparisons.map((c) =>
    `<tr><td class="txt">${esc(c.policy)}</td><td class="txt">${esc(c.profile)}</td><td>${c.runs}</td><td>${fmtPct(c.clearRate)}</td><td>${fmt1(c.avgDepth)}</td><td>${fmt1(c.medianDepth)}</td><td>${c.maxDepth}</td><td>${c.deaths1to8}</td><td>${c.reached9}</td><td>${c.secondRuns}</td><td>${fmtPct(c.secondClearRate)}</td></tr>`).join("");
  $("ar-compare").innerHTML = `<h3>정책/프로필 비교표 <button type="button" id="ar-clear-compare" class="ar-mini">초기화</button></h3>
    <div class="ar-tablewrap"><table><thead><tr><th class="txt">정책</th><th class="txt">프로필</th><th>runs</th><th>클리어율</th><th>평균심도</th><th>중앙값</th><th>최고</th><th>1-8전멸</th><th>9+도달</th><th>2차런</th><th>2차클리어율</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  wireClearCompare();
}
function wireClearCompare() { const b = $("ar-clear-compare"); if (b) b.addEventListener("click", () => { comparisons.length = 0; renderComparison(); }); }

/* ── 컨트롤/엔트리 ───────────────────────────────────────────────── */
let lastRuns = null;
function setProgress(done, total) { const pct = total ? (done / total) * 100 : 0; $("ar-progress-fill").style.width = pct + "%"; $("ar-progress-text").textContent = `${done} / ${total}`; }

function renderAll(runs, meta) {
  lastRuns = runs;
  if (!runs.length) { $("ar-summary").innerHTML = `<div class="ar-empty">실행 결과가 없습니다.</div>`; return; }
  const a = aggregate(runs);
  renderSummary(a, meta); renderDeathBand(a); renderParties(a); renderJobs(a); renderSecond(a); renderRewards(a);
  if (!meta.canceled) { pushComparison(a, meta); renderComparison(); }
  $("ar-exports").hidden = false;
}

async function run(count) {
  const policyId = $("ar-policy").value;
  const profileId = $("ar-profile").value;
  const seedRaw = $("ar-seed").value.trim();
  const seed = seedRaw === "" ? null : parseInt(seedRaw, 10);
  $("ar-run-btns").querySelectorAll("button").forEach((b) => (b.disabled = true));
  $("ar-cancel").disabled = false; $("ar-progress").hidden = false; setProgress(0, count);
  const meta = await runBatch({ count, policyId, profileId, seed, onProgress: setProgress });
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
  const pol = (POLICIES[$("ar-policy").value] || {}).desc || "";
  const prof = (PROFILES[$("ar-profile").value] || {}).desc || "";
  $("ar-desc").textContent = `${pol} · ${prof}`;
}

export function initAutoRunReport() {
  // 정책/프로필 select 채움(POLICY_ORDER / PROFILE_ORDER 기준).
  const pol = $("ar-policy"); if (pol && !pol.children.length) POLICY_ORDER.forEach((id) => pol.add(new Option(POLICIES[id].label, id)));
  const prof = $("ar-profile"); if (prof && !prof.children.length) PROFILE_ORDER.forEach((id) => prof.add(new Option(PROFILES[id].label, id)));
  pol && pol.addEventListener("change", syncDesc);
  prof && prof.addEventListener("change", syncDesc);
  syncDesc();
  renderComparison();
  $("ar-run-btns").addEventListener("click", (e) => { const b = e.target.closest("[data-count]"); if (b) run(Number(b.dataset.count)); });
  $("ar-cancel").addEventListener("click", cancelBatch);
  $("ar-copy-tsv").addEventListener("click", (e) => { if (lastRuns) copy(runsToTSV(lastRuns), e.target, "복사됨!"); });
  $("ar-copy-json").addEventListener("click", (e) => { if (lastRuns) copy(runsToJSON(lastRuns), e.target, "복사됨!"); });
}
