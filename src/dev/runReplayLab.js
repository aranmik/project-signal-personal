// =====================================================================
// Run Replay Lab 01 — Seed Path Replay / Run Autopsy (계측 전용 dev 도구)
//   AR04 = 숲 전체 관측소, Balance Lab 03 = 전투 현미경, 이 도구 = 특정 런 "부검실".
//   seed/policy/profile/run을 골라 그 런이 어떤 선택을 거쳐 어떻게 죽거나 클리어했는지
//   심도별 타임라인으로 뜯어본다. 밸런스 수정 아님 — 본게임/엔진/데이터 무수정.
//
//   분리 원칙(요청): 기존 파일을 "수정"하지 않는다. 엔진 flow 함수는 battle.js에서 import만 하고,
//     AR04의 정책/프로필/실패태그/역할축 로직은 (수정 대신) 동일하게 "독립 복제"한다.
//     → src/dev/balanceLab.js / src/dev/autoRunReport.js / src/core/* / src/data/* / src/ui/* 무수정.
//   오염 방지: 헤드리스 구동(setHeadlessRun) — 렌더/FX/로그/발자취/localStorage 미발생, gameState 스냅샷→복구.
//   진입: 독립 페이지 dev/run-replay-lab.html (일반 플레이 비노출).
// =====================================================================
import { gameState, SLOT_ORDER } from "../core/state.js";
import {
  setHeadlessRun, runHeadlessBattle,
  startRun, applyReward, applyFusion, skipFusion, continueAfterFusion,
  previewRecruit, confirmRecruit, confirmArrange, chooseRoute, continueFromRest,
  partyJobIds,
} from "../core/battle.js";
import { BASE_JOBS, ADVANCED_JOBS, SECOND_CLASS_JOBS, ACTIVE_FUSION_RECIPES, availableFusions, slotPreference, combatRoleOf } from "../data/jobs.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { rewardById } from "../data/rewards.js";
import { effectiveAlertness } from "../data/routes.js"; // Route Grammar 02 — 유효 경계도(잠복) 읽기용

/* ── 이름/포맷 ───────────────────────────────────────────────────── */
const jobName = (id) => (UNIT_TEMPLATES.party[id] && UNIT_TEMPLATES.party[id].name) || id;
const rewardName = (id) => { const r = rewardById(id); return (r && r.name) || id; };
const isSecond = (id) => SECOND_CLASS_JOBS.includes(id);
const fmt1 = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const fmtPct = (n) => (n == null ? "—" : (Math.round((n || 0) * 1000) / 10).toFixed(1) + "%");
const rand = () => Math.random();
const pick = (a) => a[Math.floor(rand() * a.length)];
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
function preferIds(offer, preferred) { const p = offer.filter((id) => preferred.includes(id)); return pick(p.length ? p : offer); }
const tierOf = (id) => (SECOND_CLASS_JOBS.includes(id) ? "2차" : ADVANCED_JOBS.includes(id) ? "1차" : "기본");

/* ── seed(AR04와 동일 mulberry32) ───────────────────────────────── */
let savedRandom = null;
function installSeed(seed) { savedRandom = Math.random; let s = seed >>> 0; Math.random = function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function restoreRandom() { if (savedRandom) { Math.random = savedRandom; savedRandom = null; } }

/* ── 정책 선호 상수(AR04 복제) ──────────────────────────────────── */
const SURVIVAL_BASE = ["priest", "cleric", "guardian"];
const ATTACK_BASE = ["warrior", "archer", "trickster"];
const SURVIVAL_REWARDS = ["survival", "balance", "frontline", "tank", "support", "recovery"];
const ATTACK_REWARDS = ["offense", "backline", "melee", "ranged"];
const BALANCED_REWARDS = ["survival", "balance", "offense", "frontline", "melee", "ranged"];
const BASE_RECIPES = ACTIVE_FUSION_RECIPES.filter((r) => r.materials.every((m) => BASE_JOBS.includes(m)));
const SECOND_MATERIALS = new Set(ACTIVE_FUSION_RECIPES.filter((r) => isSecond(r.result)).flatMap((r) => r.materials));

/* ── 런 컨텍스트 헬퍼 ──────────────────────────────────────────── */
function aliveParty() { return gameState.party.filter((u) => !u.isDead); }
function partyHpRatio() { const a = aliveParty(); return a.length ? a.reduce((s, u) => s + u.hp / u.maxHp, 0) / a.length : 1; }
function partyHpStats() { const p = gameState.party; if (!p.length) return { avg: 0, min: 0 }; const r = p.map((u) => Math.max(0, u.hp) / u.maxHp); return { avg: r.reduce((a, b) => a + b, 0) / r.length, min: Math.min(...r) }; }
function aliveHpStats() { const a = aliveParty(); if (!a.length) return { avg: 1, min: 1 }; const r = a.map((u) => Math.max(0, u.hp) / u.maxHp); return { avg: r.reduce((x, y) => x + y, 0) / r.length, min: Math.min(...r) }; }
function curPartySize() { return partyJobIds().length; }
function partyHasSecond() { return partyJobIds().some(isSecond); }
const isDealer = (id) => ["melee", "ranged"].includes(combatRoleOf(id));
function makeFormation(jobs) { const f = { f0: null, f1: null, b0: null, b1: null }; jobs.forEach((j) => { const slot = slotPreference(j).find((k) => !f[k]); if (slot) f[slot] = j; }); return f; }
function randomStartFormation() { return makeFormation(shuffle(BASE_JOBS).slice(0, 2)); }
function twoDistinct(pool) { const a = pick(pool); const b = pick(pool.filter((x) => x !== a)) || a; return [a, b]; }

/* ── 정책 6종(AR04 복제) ───────────────────────────────────────── */
const POLICIES = {
  random: { id: "random", label: "랜덤 탐험가", startFormation: randomStartFormation, pickReward: (o) => pick(o), decideFusion: (op) => (rand() < 0.5 ? pick(op).result : null), pickRecruit: (o) => pick(o), pickRoute: (c) => pick(c) },
  fusion: {
    id: "fusion", label: "합체 우선가", startFormation: () => makeFormation([...(pick(BASE_RECIPES) || { materials: ["warrior", "archer"] }).materials]),
    pickReward: (o) => pick(o), decideFusion: (op) => { const s = op.filter((x) => isSecond(x.result)); return (s.length ? pick(s) : pick(op)).result; },
    pickRecruit: (o) => { const owned = partyJobIds(); const u = o.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m)))); return pick(u.length ? u : o); },
    pickRoute: (c) => { if (c.includes("bond")) return "bond"; if (curPartySize() < 4 && c.includes("ally")) return "ally"; if (c.includes("boss")) return "boss"; return ["danger", "elite", "normal", "rest", "ally"].find((rt) => c.includes(rt)) || c[0]; },
  },
  steady: {
    id: "steady", label: "안정 운영가", startFormation: () => { const s = pick(SURVIVAL_BASE); const o = pick(BASE_JOBS.filter((j) => j !== s)); return makeFormation([s, o]); },
    pickReward: (o) => preferIds(o, SURVIVAL_REWARDS), decideFusion: (op) => (partyHpRatio() < 0.6 ? null : pick(op).result), pickRecruit: (o) => preferIds(o, SURVIVAL_BASE),
    pickRoute: (c) => { const hurt = partyHpRatio() < 0.55, size = curPartySize(); if (hurt && c.includes("rest")) return "rest"; if (size < 4 && c.includes("ally")) return "ally"; if (c.includes("boss") && size >= 4 && partyHpRatio() >= 0.6) return "boss"; if (size >= 4 && c.includes("bond") && partyHpRatio() >= 0.6) return "bond"; const order = hurt ? ["rest", "normal", "ally"] : ["normal", "elite", "danger", "rest", "ally"]; return order.find((rt) => c.includes(rt)) || c[0]; },
  },
  steadyGrowth: {
    id: "steadyGrowth", label: "안정 성장가", startFormation: () => { const s = pick(SURVIVAL_BASE); const o = pick(BASE_JOBS.filter((j) => j !== s)); return makeFormation([s, o]); },
    pickReward: (o) => preferIds(o, BALANCED_REWARDS), decideFusion: (op) => { if (partyHpRatio() < 0.45) return null; const s = op.filter((x) => isSecond(x.result)); if (s.length) return pick(s).result; return pick(op).result; },
    pickRecruit: (o) => { if (curPartySize() < 4) { const owned = partyJobIds(); const u = o.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m)))); return pick(u.length ? u : o); } return pick(o); },
    pickRoute: (c) => { const hurt = partyHpRatio() < 0.5, size = curPartySize(); if (hurt && c.includes("rest")) return "rest"; if (size < 4 && c.includes("ally")) return "ally"; if (c.includes("boss") && size >= 4 && partyHpRatio() >= 0.55) return "boss"; if (size >= 4 && c.includes("bond") && partyHpRatio() >= 0.55) return "bond"; if (size < 4) { const safe = ["ally", "rest", "normal"].find((rt) => c.includes(rt)); if (safe) return safe; } const order = hurt ? ["rest", "normal", "ally"] : ["elite", "danger", "normal", "rest"]; return order.find((rt) => c.includes(rt)) || c[0]; },
  },
  aggressive: {
    id: "aggressive", label: "공격 욕심가", startFormation: () => makeFormation(twoDistinct(ATTACK_BASE)), pickReward: (o) => preferIds(o, ATTACK_REWARDS),
    decideFusion: (op) => { const d = op.filter((x) => isDealer(x.result)); return (d.length ? pick(d) : pick(op)).result; }, pickRecruit: (o) => preferIds(o, ATTACK_BASE),
    pickRoute: (c) => { if (partyHpRatio() < 0.25 && c.includes("rest")) return "rest"; if (c.includes("boss")) return "boss"; return ["danger", "elite", "bond", "normal", "ally", "rest"].find((rt) => c.includes(rt)) || c[0]; },
  },
  secondChaser: {
    id: "secondChaser", label: "2차 추적가", startFormation: () => makeFormation([...(pick(BASE_RECIPES) || { materials: ["warrior", "archer"] }).materials]), pickReward: (o) => preferIds(o, SURVIVAL_REWARDS),
    decideFusion: (op) => { if (partyHpRatio() < 0.4) return null; const s = op.filter((x) => isSecond(x.result)); if (s.length) return pick(s).result; const t = op.filter((x) => SECOND_MATERIALS.has(x.result)); return (t.length ? pick(t) : pick(op)).result; },
    pickRecruit: (o) => { const owned = partyJobIds(); const u = o.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m)))); return pick(u.length ? u : o); },
    pickRoute: (c) => { if (partyHpRatio() < 0.4 && c.includes("rest")) return "rest"; if (curPartySize() < 4 && c.includes("ally")) return "ally"; if (c.includes("bond")) return "bond"; if (c.includes("boss") && partyHasSecond()) return "boss"; return ["elite", "danger", "normal", "rest", "ally"].find((rt) => c.includes(rt)) || c[0]; },
  },
  // Route Grammar 02 — 합체 욕심가(빈자리): 합체 후 보충 없이 3인으로 밀어붙임(빈자리 리스크 관측).
  fusionGreedy: {
    id: "fusionGreedy", label: "합체 욕심가(빈자리)", startFormation: () => makeFormation([...(pick(BASE_RECIPES) || { materials: ["warrior", "archer"] }).materials]), pickReward: (o) => pick(o),
    decideFusion: (op) => { const s = op.filter((x) => isSecond(x.result)); return (s.length ? pick(s) : pick(op)).result; },
    pickRecruit: (o) => { const owned = partyJobIds(); const u = o.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m)))); return pick(u.length ? u : o); },
    pickRoute: (c) => { const size = curPartySize(); const fused = (gameState.run.fusionCount || 0) > 0; if (c.includes("bond")) return "bond"; if (size < 4 && !fused && c.includes("ally")) return "ally"; if (c.includes("boss")) return "boss"; if (partyHpRatio() < 0.3 && c.includes("rest")) return "rest"; return ["danger", "elite", "normal", "rest", "ally"].find((rt) => c.includes(rt)) || c[0]; },
  },
};
const POLICY_ORDER = ["random", "fusion", "steady", "steadyGrowth", "aggressive", "secondChaser", "fusionGreedy"];

/* ── 프로필 8종(AR04 복제, headless 보정만) ───────────────────────── */
function shieldParty(pct) { gameState.party.forEach((u) => { if (!u.isDead) u.shield = Math.max(u.shield || 0, Math.round(u.maxHp * pct)); }); }
function nerfEnemies(hp, atk) { gameState.enemies.forEach((e) => { e.maxHp = Math.max(1, Math.round(e.maxHp * hp)); e.hp = Math.min(e.hp, e.maxHp); e.atk = Math.max(1, Math.round(e.atk * atk)); }); }
const has = (c, x) => c.includes(x);
function safeWhenFragile(pc, c, ctx) { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (ctx.partySize < 4) { if (ctx.hpRatio >= 0.55 && has(c, "danger")) return "danger"; if (has(c, "normal")) return "normal"; if (has(c, "rest")) return "rest"; } return pc; }
const PROFILES = {
  baseline: { id: "baseline", label: "Baseline" },
  cushion: { id: "cushion", label: "Early Cushion 01", route: (pc, c, ctx) => { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (ctx.partySize < 4 && ctx.hpRatio >= 0.55 && has(c, "danger")) return "danger"; return pc; }, preBattle: (ctx) => { if (ctx.sinceFusion === 0) shieldParty(0.12); } },
  cushion2: { id: "cushion2", label: "Early Cushion 02", route: (pc, c, ctx) => { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (ctx.partySize < 4 && ctx.hpRatio >= 0.55 && has(c, "danger")) return "danger"; return pc; }, preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.partySize < 4) shieldParty(0.15); else if (ctx.sinceFusion === 0) shieldParty(0.12); } },
  recruitSafe: { id: "recruitSafe", label: "Recruit Safety 01", route: (pc, c, ctx) => (ctx.partySize < 4 ? safeWhenFragile(pc, c, ctx) : pc) },
  fusionSafe: { id: "fusionSafe", label: "First Fusion Safety 01", route: (pc, c, ctx) => { if (ctx.sinceFusion != null && ctx.sinceFusion <= 1) { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (has(c, "normal")) return "normal"; } return pc; }, preBattle: (ctx) => { if (ctx.sinceFusion != null && ctx.sinceFusion <= 1) shieldParty(0.12); } },
  softRamp: { id: "softRamp", label: "Soft Ramp 01", preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.routeType !== "boss") nerfEnemies(0.85, 0.9); } },
  guided: { id: "guided", label: "Guided Beginner 01", route: (pc, c, ctx) => { if (ctx.depth <= 10 || ctx.partySize < 4) { const safe = safeWhenFragile(pc, c, ctx); if (ctx.partySize < 4) return safe; if (ctx.hpRatio < 0.6 && (pc === "elite" || pc === "danger" || pc === "boss")) return safe; } return pc; } },
  safeElite: { id: "safeElite", label: "Safe Elite Gate 01", route: (pc, c, ctx) => { if ((pc === "elite" || pc === "danger") && !(ctx.partySize >= 4 && ctx.hpRatio >= 0.6)) { if (ctx.hpRatio < 0.55 && has(c, "rest")) return "rest"; if (has(c, "normal")) return "normal"; } return pc; } },
  // Observation Batch 01 — Soft Ramp Split(AR04 복제, headless preBattle 보정만). nerfEnemies 1.0 인자는 no-op.
  softRampHp: { id: "softRampHp", label: "Soft Ramp HP Only 01", split: true, preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.routeType !== "boss") nerfEnemies(0.85, 1.0); } },
  softRampAtk: { id: "softRampAtk", label: "Soft Ramp ATK Only 01", split: true, preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.routeType !== "boss") nerfEnemies(1.0, 0.9); } },
  softRampEarly: { id: "softRampEarly", label: "Soft Ramp Early Only 01", split: true, preBattle: (ctx) => { if (ctx.depth <= 8 && ctx.routeType !== "boss") nerfEnemies(0.85, 0.9); } },
  softRampDanger: { id: "softRampDanger", label: "Soft Ramp Danger Only 01", split: true, preBattle: (ctx) => { if (ctx.routeType === "danger" || ctx.routeType === "elite") nerfEnemies(0.85, 0.9); } },
  party3Danger: { id: "party3Danger", label: "Party-3 Danger Cushion 01", split: true, preBattle: (ctx) => { if (ctx.partySize < 4 && (ctx.routeType === "danger" || ctx.routeType === "elite")) nerfEnemies(0.85, 0.9); } },
  postFusion: { id: "postFusion", label: "Post Fusion Cushion 01", split: true, preBattle: (ctx) => { if (ctx.sinceFusion != null && ctx.sinceFusion <= 2) shieldParty(0.12); } },
};
const PROFILE_ORDER = ["baseline", "cushion", "cushion2", "recruitSafe", "fusionSafe", "softRamp", "guided", "safeElite",
  "softRampHp", "softRampAtk", "softRampEarly", "softRampDanger", "party3Danger", "postFusion"];
const isSplitProfile = (id) => !!(PROFILES[id] && PROFILES[id].split);

/* ── 역할 축(AR04/BL03 명명 일치) ───────────────────────────────── */
const ROLE_AR = { warrior: "singleDps", guardian: "tank", archer: "singleDps", priest: "healer", cleric: "shielder", trickster: "control", rogue: "singleDps", saint: "healer", warden: "debuff", watchbow: "counter", trapper: "debuff", paladin: "tank", vanguard: "aoeDps", forbidden: "tank", wall: "tank", healbow: "healer", purifier: "healer", mage: "aoeDps", bard: "support", gatekeeper: "tank", tracker: "marker", dragonspear: "pierce", sage: "aoeDps", sunlord: "support", swordsaint: "counter", redeemer: "healer", skyarcher: "marker", plaguebringer: "debuff", dancer: "support", wardkeeper: "shielder" };
const roleAr = (id) => ROLE_AR[id] || "support";
const jobsHaveRole = (set, role) => [...set].some((j) => roleAr(j) === role);
function axesOf(set) { return { healer: jobsHaveRole(set, "healer"), tank: jobsHaveRole(set, "tank"), shield: jobsHaveRole(set, "shielder"), aoe: jobsHaveRole(set, "aoeDps") || jobsHaveRole(set, "pierce"), second: [...set].some((j) => SECOND_CLASS_JOBS.includes(j)) }; }

/* ── 상태 스냅샷/복구(본게임 오염 방지 — AR01A 방식) ──────────────── */
function deepClone(o) { return typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)); }
function snapshotState() { return { party: gameState.party, enemies: gameState.enemies, logs: gameState.logs, screen: gameState.screen, battle: deepClone(gameState.battle), run: deepClone(gameState.run), immortal: gameState.dev ? gameState.dev.immortal : false }; }
function restoreState(s) { gameState.party = s.party; gameState.enemies = s.enemies; gameState.logs = s.logs; gameState.screen = s.screen; gameState.battle = deepClone(s.battle); gameState.run = deepClone(s.run); if (gameState.dev) gameState.dev.immortal = s.immortal; }

/* ── 상세 드라이버: 1런을 per-step 타임라인과 함께 구동 ─────────────── */
const MAX_DECISIONS = 400, MAX_BATTLES = 60;
// Route Grammar 02 — 새 토큰: ALLY=동료의 흔적(영입), BOND=결속의 공터(합체). 전투 루트(N/D/E)는 전투 핸들러에서 push.
const ROUTE_TOKEN = { normal: "N", danger: "D", elite: "E", boss: "BOSS", ally: "ALLY", bond: "BOND", rest: "REST" };
const hasFirstClass = () => partyJobIds().some((j) => ADVANCED_JOBS.includes(j));

function playRunDetailed(policy, profile, runIndex) {
  const rec = {
    runIndex, policy: policy.id, profile: profile.id, result: null, finalDepth: 0,
    battleCount: 0, fusionCount: 0, recruitCount: 0, faintCount: 0, bossAttempted: false, bossKilled: false,
    finalParty: [], gotSecondClass: false, jobsSeen: new Set(), path: [], timeline: [],
    firstFusionDepth: 0, firstRecruitDepth: 0, partySize4Depth: 0, firstSecondClassDepth: 0, firstFirstClassDepth: 0,
    firstEliteAttemptDepth: 0, firstEliteKillDepth: 0, firstBossKeyDepth: 0, bossAttemptDepth: 0, bossKillDepth: 0,
    firstRestDepth: 0, firstNearDeathDepth: 0,
    party4BattleIdx: null, fusionBattleIdx: null, secondClassBattleIdx: null, eliteEnterBattleIdx: null, bossKeyBattleIdx: null,
    bossHalfHpSeen: false, bossHalfHpSeenDepth: 0, bossHpRemaining: null, bossAttemptPartySize: null, bossAttemptHpPercent: null,
    dangerEntries: [], dangerMarkers: [], // Observation Batch 01 — 위험/정예 진입 컨텍스트 + 추정 마커(failureTags와 별개)
    // Route Grammar 02 — 루트 문법 관측.
    routeCounts: { normal: 0, ally: 0, bond: 0, danger: 0, elite: 0, rest: 0, boss: 0 },
    firstRecruitRouteDepth: 0, firstFusionRouteDepth: 0, firstDangerDepth: 0,
    fusionCreatedEmptySlot: false, partySizeAfterFusion: null, recruitAfterFusionDepth: 0, battlesWhileUnder4AfterFusion: 0,
  };
  let pendingRoute = "normal", sinceFusion = null, prevBossKeys = 0;
  const ctx = () => ({ depth: gameState.run.depth, partySize: curPartySize(), hpRatio: partyHpRatio(), routeType: pendingRoute, sinceFusion });
  const push = (e) => rec.timeline.push(e);

  startRun(policy.startFormation());
  let decisions = 0;
  while (true) {
    if (!rec.partySize4Depth && curPartySize() >= 4) { rec.partySize4Depth = gameState.run.depth; rec.party4BattleIdx = rec.battleCount; }
    if (!rec.firstSecondClassDepth && partyHasSecond()) { rec.firstSecondClassDepth = gameState.run.depth; rec.secondClassBattleIdx = rec.battleCount; }
    if (!rec.firstFirstClassDepth && hasFirstClass()) rec.firstFirstClassDepth = gameState.run.depth;
    if (gameState.run.result === "clear") { rec.result = "clear"; rec.bossKilled = true; rec.bossKillDepth = gameState.run.depth; rec.bossHalfHpSeen = true; rec.bossHpRemaining = 0; rec.path.push("CLEAR"); push({ kind: "end", token: "CLEAR", depth: gameState.run.depth }); break; }
    if (gameState.run.result === "defeat") { rec.result = "defeat"; rec.path.push("WIPE"); push({ kind: "end", token: "WIPE", depth: gameState.run.depth }); break; }
    if (++decisions > MAX_DECISIONS || rec.battleCount > MAX_BATTLES) { rec.result = "incomplete"; rec.path.push("CAP"); break; }

    const screen = gameState.screen;
    if (screen === "battle") {
      if (profile.preBattle) profile.preBattle(ctx());
      const jobs = partyJobIds(); jobs.forEach((j) => rec.jobsSeen.add(j));
      const depth = gameState.run.depth, size = jobs.length, hp0 = partyHpStats();
      if (rec.fusionCreatedEmptySlot && size < 4) rec.battlesWhileUnder4AfterFusion += 1; // Route Grammar 02
      const alertNow = gameState.run.alertness || 0, effNow = effectiveAlertness(gameState.run), p4 = !!gameState.run.party4Reached;
      rec.battleCount += 1; rec.path.push(ROUTE_TOKEN[pendingRoute] || "B");
      const ok = runHeadlessBattle();
      if (!ok) { rec.result = "incomplete"; rec.path.push("TIMEOUT"); break; }
      const after = partyHpStats(), deadNow = gameState.party.filter((u) => u.isDead).length;
      const res = gameState.run.result === "defeat" ? "wipe" : (gameState.run.result === "clear" ? "clear" : "win");
      if (gameState.run.result !== "defeat") { rec.faintCount += deadNow; if (deadNow > 0 && !rec.firstNearDeathDepth) rec.firstNearDeathDepth = depth; }
      let keyGain = false;
      if ((gameState.run.bossKeys || 0) > prevBossKeys) { prevBossKeys = gameState.run.bossKeys; keyGain = true; if (!rec.firstEliteKillDepth) rec.firstEliteKillDepth = depth; if (!rec.firstBossKeyDepth) { rec.firstBossKeyDepth = depth; rec.bossKeyBattleIdx = rec.battleCount; } }
      let bossHp = null;
      if (pendingRoute === "boss") { const boss = gameState.enemies[0]; if (boss) { const ratio = boss.maxHp ? Math.max(0, boss.hp) / boss.maxHp : 0; bossHp = ratio; if (res === "wipe") { rec.bossHpRemaining = ratio; if (ratio <= 0.5) { rec.bossHalfHpSeen = true; rec.bossHalfHpSeenDepth = depth; } } } }
      push({ kind: "battle", token: ROUTE_TOKEN[pendingRoute] || "B", route: pendingRoute, depth, size, jobs, axes: axesOf(new Set(jobs)), avgHp: hp0.avg, minHp: after.min, faints: deadNow, result: res, keyGain, bossHp,
        // Route Grammar 02 — per-row 문법 컨텍스트.
        alertness: alertNow, effectiveAlertness: effNow, latentAlertness: p4 ? 0 : alertNow - effNow, preParty4: !p4, afterParty4: p4, afterFusion: sinceFusion != null, fusedEmptySlot: rec.fusionCreatedEmptySlot });
      sinceFusion = sinceFusion == null ? null : sinceFusion + 1;
    } else if (screen === "reward") {
      const offer = gameState.run.rewardOffer || []; if (!offer.length) { rec.result = "incomplete"; break; }
      const id = policy.pickReward(offer); applyReward(id); push({ kind: "reward", depth: gameState.run.depth, name: rewardName(id) });
    } else if (screen === "fusion") {
      // Route Grammar 02 — 합체는 BOND 루트의 선택. 합체 후 자동 영입 없음 → 빈자리 생성 기록(path 토큰은 route 핸들러의 BOND).
      const options = availableFusions(partyJobIds()); const choiceId = options.length ? policy.decideFusion(options) : null;
      if (choiceId) { rec.fusionCount += 1; if (!rec.firstFusionDepth) rec.firstFusionDepth = gameState.run.depth; if (rec.fusionBattleIdx == null) rec.fusionBattleIdx = rec.battleCount; sinceFusion = 0; const recp = ACTIVE_FUSION_RECIPES.find((r) => r.result === choiceId); push({ kind: "fusion", depth: gameState.run.depth, result: jobName(choiceId), materials: recp ? recp.materials.map(jobName) : [] }); applyFusion(choiceId); rec.fusionCreatedEmptySlot = true; if (rec.partySizeAfterFusion == null) rec.partySizeAfterFusion = curPartySize(); }
      else skipFusion();
    } else if (screen === "fusionResult") { continueAfterFusion(); }
    else if (screen === "recruit") {
      // Route Grammar 02 — 영입은 ALLY 루트의 선택(path 토큰은 route 핸들러의 ALLY). 합체 후 보충이면 depth 기록.
      const offer = gameState.run.recruitOffer || [];
      if (offer.length) { const jobId = policy.pickRecruit(offer); if (jobId) { previewRecruit(jobId); rec.recruitCount += 1; if (!rec.firstRecruitDepth) rec.firstRecruitDepth = gameState.run.depth; if (rec.fusionCreatedEmptySlot && !rec.recruitAfterFusionDepth) rec.recruitAfterFusionDepth = gameState.run.depth; push({ kind: "recruit", depth: gameState.run.depth, job: jobName(jobId) }); } }
      confirmRecruit();
    } else if (screen === "arrange") { confirmArrange(); }
    else if (screen === "route") {
      const choices = gameState.run.routeChoices || ["normal"]; let rt = policy.pickRoute(choices); if (profile.route) rt = profile.route(rt, choices, ctx());
      rec.routeCounts[rt] = (rec.routeCounts[rt] || 0) + 1; // Route Grammar 02 — 루트 선택 카운트
      // Route Grammar 02B — ally/bond도 전투 루트 → 토큰(ALLY/BOND)은 전투 핸들러가 push. 여기선 선택 심도만 기록.
      if (rt === "ally" && !rec.firstRecruitRouteDepth) rec.firstRecruitRouteDepth = gameState.run.depth;
      if (rt === "bond" && !rec.firstFusionRouteDepth) rec.firstFusionRouteDepth = gameState.run.depth;
      if (rt === "danger" && !rec.firstDangerDepth) rec.firstDangerDepth = gameState.run.depth;
      if (rt === "rest" && !rec.firstRestDepth) rec.firstRestDepth = gameState.run.depth;
      if (rt === "elite" || rt === "danger") {
        if (!rec.firstEliteAttemptDepth) rec.firstEliteAttemptDepth = gameState.run.depth; rec.eliteEnterBattleIdx = rec.battleCount;
        const ax = axesOf(new Set(partyJobIds())); const hp = aliveHpStats();
        rec.dangerEntries.push({ routeType: rt, depth: gameState.run.depth, battleIdx: rec.battleCount, partySize: curPartySize(), hasHealer: ax.healer, hasTank: ax.tank, hasAoE: ax.aoe, afterParty4: rec.partySize4Depth > 0, afterFusion: sinceFusion != null, sinceFusion, startHpAvg: hp.avg, startHpMin: hp.min });
      }
      if (rt === "boss") { rec.bossAttempted = true; if (!rec.bossAttemptDepth) rec.bossAttemptDepth = gameState.run.depth; rec.bossAttemptPartySize = curPartySize(); rec.bossAttemptHpPercent = partyHpRatio(); }
      pendingRoute = rt; chooseRoute(rt);
    } else if (screen === "rest") { rec.path.push("REST"); push({ kind: "rest", depth: gameState.run.depth }); continueFromRest(); }
    else { rec.result = "incomplete"; break; }
  }
  // 마무리
  rec.finalDepth = gameState.run.depth || 0;
  rec.finalParty = SLOT_ORDER.map((k) => (gameState.run.formation || {})[k]).filter(Boolean);
  rec.finalParty.forEach((j) => rec.jobsSeen.add(j));
  rec.finalPartySize = rec.finalParty.length;
  rec.bossKeysFinal = gameState.run.bossKeys || 0;
  rec.gotSecondClass = [...rec.jobsSeen].some(isSecond);
  const ax = axesOf(rec.jobsSeen);
  rec.hasHealer = ax.healer; rec.hasTank = ax.tank; rec.hasShield = ax.shield; rec.hasAoE = ax.aoe; rec.hasSecondClass = ax.second;
  rec.pathSignature = rec.path.join(">"); rec.lastChoices = rec.path.slice(-6).join(">");
  rec.preWipeChoice = rec.result === "defeat" ? (rec.path[rec.path.length - 2] || "") : "";
  rec.lastSafeMilestone = rec.bossAttemptDepth ? "boss" : rec.firstBossKeyDepth ? "bosskey" : rec.firstEliteKillDepth ? "elitekill" : rec.firstSecondClassDepth ? "second" : rec.firstFusionDepth ? "fusion" : rec.partySize4Depth ? "party4" : rec.firstRecruitDepth ? "recruit" : "start";
  rec.failureTags = computeFailureTags(rec);
  rec.dangerMarkers = computeDangerMarkers(rec);
  // Route Grammar 02 — run-state 기반 관측 지표.
  const run = gameState.run, cleared = rec.result === "clear";
  rec.party4Depth = run.party4Depth || 0; rec.party4Reached = !!run.party4Reached;
  rec.alertnessAtParty4 = run.alertnessAtParty4 || 0; rec.effectiveAlertnessAtParty4 = run.effectiveAlertnessAtParty4 || 0; rec.latentAlertnessAtParty4 = run.alertnessAtParty4 || 0;
  rec.preParty4Battles = run.preParty4Battles || 0; rec.preParty4GrowthCount = run.preParty4GrowthCount || 0;
  rec.preParty4DangerCount = run.preParty4DangerCount || 0; rec.preParty4RecruitCount = run.preParty4RecruitCount || 0; rec.farmWarnShown = run.farmWarnShown || 0;
  rec.finalAlertness = run.alertness || 0;
  rec.skippedRecruitAfterFusion = rec.fusionCreatedEmptySlot && !rec.recruitAfterFusionDepth;
  rec.clearWithUnder4Party = cleared && rec.finalPartySize < 4;
  rec.highTierSmallPartyClear = cleared && rec.finalPartySize < 4 && [...rec.jobsSeen].some((j) => ADVANCED_JOBS.includes(j) || SECOND_CLASS_JOBS.includes(j));
  rec.wipeAfterFusionWithoutRefill = rec.result === "defeat" && rec.fusionCreatedEmptySlot && rec.finalPartySize < 4;
  rec.routeBeforeWipe = rec.result === "defeat" ? (rec.path[rec.path.length - 2] || "") : "";
  rec.lastThreeRoutesBeforeWipe = (rec.result === "defeat" ? rec.path.slice(0, -1) : rec.path).slice(-3).join(">");
  rec.preParty4FarmSuspect = !rec.party4Reached && rec.preParty4Battles >= 5 && rec.preParty4RecruitCount === 0 && (rec.routeCounts.ally || 0) === 0;
  rec.routeCauseTags = computeRouteCauseTags(rec);
  return rec;
}
// Route Grammar 02 — Fun Wipe / Choice Ownership 추정 태그(AR04 복제). 완벽한 인과 아님 — watch 톤.
function computeRouteCauseTags(rec) {
  const t = [];
  if (rec.result !== "defeat") return t;
  const d = rec.finalDepth, before = rec.routeBeforeWipe;
  if (!rec.party4Reached && rec.preParty4DangerCount > 0 && before === "D") t.push("wipeAfterPreParty4Danger");
  if (rec.firstDangerDepth && d <= 8 && before === "D") t.push("wipeAfterEarlyDeepBrush");
  if (rec.fusionCreatedEmptySlot && rec.finalPartySize < 4) { t.push("wipeAfterFusionWithoutRefill"); if (!rec.recruitAfterFusionDepth) t.push("wipeAfterSkippedRecruit"); }
  if (rec.fusionBattleIdx != null && rec.battleCount - rec.fusionBattleIdx <= 2) t.push("wipeAfterEarlyFusion");
  if (!rec.firstRestDepth && rec.faintCount >= 2) t.push("wipeAfterNoRestLowHp");
  if (rec.finalPartySize < 4 && (before === "D" || before === "E")) t.push("wipeAfterUnder4Greed");
  return t;
}
// Observation Batch 01 — 위험 루트 추정 마커(AR04 복제). failureTags와 별개 표시용.
function computeDangerMarkers(rec) {
  const m = [];
  if (rec.result !== "defeat" || !rec.dangerEntries.length) return m;
  const wipeBattle = rec.battleCount;
  const near = rec.dangerEntries.filter((e) => wipeBattle - e.battleIdx <= 3 && wipeBattle - e.battleIdx >= 0);
  if (!near.length) return m;
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
// 타겟 런의 위험 진입 컨텍스트(마지막 위험 진입 + 그 위험 전투 결과)를 요약 — autopsy/export용.
function dangerContextOf(rec) {
  if (!rec.dangerEntries || !rec.dangerEntries.length) return null;
  const last = rec.dangerEntries[rec.dangerEntries.length - 1];
  const dangerBattles = (rec.timeline || []).filter((e) => e.kind === "battle" && (e.route === "danger" || e.route === "elite"));
  const lastBattle = dangerBattles[dangerBattles.length - 1] || null;
  return {
    partySize: last.partySize, hasHealer: last.hasHealer, hasTank: last.hasTank, hasAoE: last.hasAoE,
    startHpAvg: last.startHpAvg, startHpMin: last.startHpMin,
    afterBattleMinHp: lastBattle ? lastBattle.minHp : null, downs: lastBattle ? lastBattle.faints : null,
    depth: last.depth, routeType: last.routeType, afterParty4: last.afterParty4, afterFusion: last.afterFusion,
    preWipeChoice: rec.preWipeChoice, pathSignature: rec.pathSignature,
  };
}
function computeFailureTags(rec) {
  const t = []; if (rec.result !== "defeat") return t; const d = rec.finalDepth;
  t.push(d <= 8 ? "EARLY_WIPE_1_8" : d <= 16 ? "MID_WIPE_9_16" : "LATE_WIPE_17_PLUS");
  if (rec.finalPartySize < 4) t.push("LOW_PARTY_SIZE_WIPE");
  if (rec.party4BattleIdx != null && rec.battleCount - rec.party4BattleIdx <= 3) t.push("POST_PARTY4_WIPE");
  if (rec.fusionBattleIdx != null && rec.battleCount - rec.fusionBattleIdx <= 3) t.push("POST_FUSION_WIPE");
  if (rec.eliteEnterBattleIdx != null && rec.battleCount - rec.eliteEnterBattleIdx <= 2) t.push("ELITE_GREED_WIPE");
  if (rec.faintCount >= 3) t.push("LOW_HP_CHAIN");
  if (!rec.firstRestDepth) t.push("NO_REST_RECOVERY");
  if (rec.bossAttempted) t.push("BOSS_ATTEMPT_FAIL"); else if (rec.bossKeysFinal < 2) t.push("BOSS_KEY_STARVE");
  if (!rec.firstFusionDepth && d >= 9) t.push("NO_FUSION_PROGRESS");
  if (!rec.gotSecondClass && d >= 12) t.push("NO_SECOND_CLASS");
  if (!rec.hasHealer && !rec.hasShield) t.push("NO_HEAL_OR_SHIELD_AXIS");
  if (!rec.hasTank) t.push("NO_TANK_AXIS");
  if (!rec.hasAoE) t.push("NO_AOE_AXIS");
  return t;
}

/* ── 배치(seed 고정 결정론) ────────────────────────────────────── */
export function replayBatch({ policyId, profileId, seed, runs }) {
  const policy = POLICIES[policyId] || POLICIES.steadyGrowth;
  const profile = PROFILES[profileId] || PROFILES.baseline;
  const snap = snapshotState();
  const useSeed = seed != null && !Number.isNaN(seed);
  if (useSeed) installSeed(seed);
  setHeadlessRun(true);
  if (gameState.dev) gameState.dev.immortal = false;
  const out = [];
  try { for (let i = 0; i < runs; i++) out.push(playRunDetailed(policy, profile, i)); }
  finally { setHeadlessRun(false); if (useSeed) restoreRandom(); restoreState(snap); }
  return out;
}

/* ── 타겟 finder ───────────────────────────────────────────────── */
const FINDERS = {
  firstWipe: (rs) => rs.find((r) => r.result === "defeat"),
  deepestWipe: (rs) => rs.filter((r) => r.result === "defeat").sort((a, b) => b.finalDepth - a.finalDepth)[0],
  firstClear: (rs) => rs.find((r) => r.result === "clear"),
  bossAttempt: (rs) => rs.find((r) => r.bossAttempted),
  ndWipe: (rs) => rs.find((r) => r.result === "defeat" && /(^|>)N>D>WIPE$/.test(r.pathSignature)) || rs.find((r) => r.result === "defeat" && r.pathSignature.endsWith("D>WIPE")),
  postFusion: (rs) => rs.find((r) => (r.failureTags || []).includes("POST_FUSION_WIPE")),
  eliteGreed: (rs) => rs.find((r) => (r.failureTags || []).includes("ELITE_GREED_WIPE")),
  noHealer: (rs) => rs.find((r) => r.result === "defeat" && !r.hasHealer),
  // Observation Batch 01 — 위험 루트 부검용 타겟
  dangerWipe: (rs) => rs.find((r) => r.result === "defeat" && (r.dangerEntries || []).length > 0),
  dangerPreParty4: (rs) => rs.find((r) => (r.dangerMarkers || []).includes("DANGER_PRE_PARTY4_WIPE")),
  dangerPostFusion: (rs) => rs.find((r) => (r.dangerMarkers || []).includes("DANGER_POST_FUSION_WIPE")),
  // Route Grammar 02 — 새 문법 타겟
  recruitFirst: (rs) => rs.find((r) => r.party4Reached && (r.routeCounts.ally || 0) >= 2 && r.finalDepth >= 9) || rs.find((r) => r.party4Reached && (r.routeCounts.ally || 0) >= 1),
  earlyDeepBrush: (rs) => rs.find((r) => (r.routeCauseTags || []).includes("wipeAfterEarlyDeepBrush")) || rs.find((r) => (r.routeCauseTags || []).includes("wipeAfterPreParty4Danger")),
  farmSuspect: (rs) => rs.find((r) => r.preParty4FarmSuspect),
  firstFusionAfterParty4: (rs) => rs.find((r) => r.fusionCreatedEmptySlot && r.party4Reached && (r.firstFusionRouteDepth || 0) >= (r.party4Depth || 0)),
  fusionEmptySlotWipe: (rs) => rs.find((r) => (r.routeCauseTags || []).includes("wipeAfterFusionWithoutRefill")),
  fusionThenRefill: (rs) => rs.find((r) => r.fusionCreatedEmptySlot && r.recruitAfterFusionDepth > 0),
  // smallPartyBoss / clearUnder4 — 자동 정책으론 거의 미발생(3인은 일찍 전멸). 없으면 closest(가장 깊은 4인미만 런)로 대체.
  smallPartyBoss: (rs) => rs.find((r) => r.bossAttempted && (r.bossAttemptPartySize || 4) < 4) || rs.filter((r) => r.finalPartySize < 4 && r.fusionCreatedEmptySlot).sort((a, b) => b.finalDepth - a.finalDepth)[0],
  clearUnder4: (rs) => rs.find((r) => r.clearWithUnder4Party) || rs.filter((r) => r.finalPartySize < 4 && r.fusionCreatedEmptySlot).sort((a, b) => b.finalDepth - a.finalDepth)[0],
  skippedRecruitWipe: (rs) => rs.find((r) => (r.routeCauseTags || []).includes("wipeAfterSkippedRecruit")),
  longRun: (rs) => rs.slice().sort((a, b) => (b.timeline.length - a.timeline.length))[0],
};

/* ── failureTag → 타임라인 위치 추정 ───────────────────────────── */
function tagLocations(rec) {
  const loc = {}; const wipeStep = rec.timeline.length - 1;
  (rec.failureTags || []).forEach((tag) => {
    if (/_WIPE_/.test(tag) || tag === "POST_PARTY4_WIPE" || tag === "POST_FUSION_WIPE" || tag === "ELITE_GREED_WIPE" || tag === "BOSS_ATTEMPT_FAIL") loc[tag] = wipeStep;
    else if (tag === "BOSS_KEY_STARVE") loc[tag] = wipeStep;
    else loc[tag] = "run"; // 축 부재/체인은 런 전체
  });
  return loc;
}

/* ════════════════════════════════════════════════════════════════
   UI
   ════════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
let lastRuns = null, lastTarget = null, lastMeta = null, lastCompare = null;

const PRESETS = [
  { label: "Baseline first wipe", policyId: "steadyGrowth", profileId: "baseline", target: "firstWipe" },
  { label: "Baseline deepest wipe", policyId: "steadyGrowth", profileId: "baseline", target: "deepestWipe" },
  { label: "Baseline boss attempt", policyId: "steadyGrowth", profileId: "baseline", target: "bossAttempt" },
  { label: "Baseline vs Soft Ramp (same seed)", policyId: "steadyGrowth", profileId: "baseline", target: "firstWipe", compare: "softRamp" },
  { label: "Soft Ramp saved run", policyId: "steadyGrowth", profileId: "softRamp", target: "deepestWipe" },
  { label: "N>D>WIPE sample", policyId: "steadyGrowth", profileId: "baseline", target: "ndWipe" },
  { label: "Post Fusion Wipe sample", policyId: "fusion", profileId: "baseline", target: "postFusion" },
  { label: "Elite Greed Wipe sample", policyId: "steadyGrowth", profileId: "baseline", target: "eliteGreed" },
  { label: "No Healer Wipe sample", policyId: "random", profileId: "baseline", target: "noHealer" },
  // ── Observation Batch 01 — Split / Danger Autopsy presets(seed는 harness로 찾은 의미있는 표본) ──
  //   "saved?" 프리셋: Baseline에서 전멸한 같은 seed·index 런을 split profile로 재생 → 살았는지 Before/After 비교.
  { label: "Split: HP only saved?", policyId: "steadyGrowth", profileId: "baseline", target: "dangerWipe", compare: "softRampHp", seed: 405, split: true, note: "seed405 run#0 N>D>WIPE@3 → HP만 완화는 @8로 지연만(완전구제 아님)" },
  { label: "Split: ATK only saved?", policyId: "steadyGrowth", profileId: "baseline", target: "dangerWipe", compare: "softRampAtk", seed: 405, split: true, note: "seed405 run#0 N>D>WIPE@3 → 공격만 완화는 @7로 지연만" },
  { label: "Split: Danger only saved?", policyId: "steadyGrowth", profileId: "baseline", target: "dangerWipe", compare: "softRampDanger", seed: 405, split: true, note: "seed405 run#0 N>D>WIPE@3 → 위험전투만 완화는 @8로 지연만" },
  { label: "Split: Party-3 danger saved?", policyId: "steadyGrowth", profileId: "baseline", target: "dangerPreParty4", compare: "party3Danger", seed: 405, split: true, note: "seed405 run#0 N>D>WIPE@3 → Party-3 쿠션이 clear@14로 구제(같은 죽음 분해 표본)" },
  { label: "Split: Post fusion saved?", policyId: "fusion", profileId: "baseline", target: "postFusion", compare: "postFusion", seed: 123, split: true, note: "seed123 fusion run#0 POST_FUSION_WIPE@6 → 합체 후 보호막이 @10으로 연장" },
  { label: "N>D>WIPE autopsy", policyId: "steadyGrowth", profileId: "baseline", target: "ndWipe", seed: 405, note: "N>D>WIPE 단일 런 부검" },
  { label: "Danger pre-party4 wipe", policyId: "steadyGrowth", profileId: "baseline", target: "dangerPreParty4", seed: 405, note: "4인 미완성 위험 진입 전멸" },
  { label: "Danger post-fusion wipe", policyId: "fusion", profileId: "baseline", target: "dangerPostFusion", seed: 405, note: "합체 후 위험 진입 전멸" },
  // ── Route Grammar 02 Phase 2 — 새 문법 presets(seed는 harness로 찾은 의미있는 표본 · 없으면 closest) ──
  { label: "Recruit-first stable run", policyId: "steadyGrowth", profileId: "baseline", target: "recruitFirst", seed: 1, rgrammar: true, note: "동료의 흔적으로 4인 완성 후 안정 진행" },
  { label: "Early deep brush wipe", policyId: "aggressive", profileId: "baseline", target: "earlyDeepBrush", seed: 1, rgrammar: true, note: "4인 전 깊은 수풀 진입 직후 전멸" },
  { label: "Pre-party4 farm suspect", policyId: "aggressive", profileId: "baseline", target: "farmSuspect", seed: 1, rgrammar: true, note: "동료의 흔적 무시 + 4인 전 전투 반복" },
  { label: "First fusion after 4-party", policyId: "steadyGrowth", profileId: "baseline", target: "firstFusionAfterParty4", seed: 1, rgrammar: true, note: "4인 완성 후 결속의 공터로 첫 합체" },
  { label: "Fusion empty slot wipe", policyId: "fusionGreedy", profileId: "baseline", target: "fusionEmptySlotWipe", seed: 1, rgrammar: true, note: "seed1 합체욕심가 run#0 — 합체 후 빈자리(3인) 방치 → @5 전멸" },
  { label: "Fusion then recruit refill", policyId: "steadyGrowth", profileId: "baseline", target: "fusionThenRefill", seed: 1, rgrammar: true, note: "합체 후 동료의 흔적으로 4인 복구" },
  { label: "3-party high-tier boss attempt", policyId: "fusionGreedy", profileId: "baseline", target: "smallPartyBoss", seed: 1, rgrammar: true, note: "closest 없음 — 자동 정책으론 3인 보스 도전 미발생(3인은 위험 진입 시 일찍 전멸). deepest wipe로 대체 표시" },
  { label: "Clear with under-4 party", policyId: "fusionGreedy", profileId: "baseline", target: "clearUnder4", seed: 1, rgrammar: true, note: "closest 없음 — 자동 정책으론 3인 클리어 미발생. 인간 신중 운영 전용 좌표" },
  { label: "Wipe after skipped recruit", policyId: "fusionGreedy", profileId: "baseline", target: "skippedRecruitWipe", seed: 1, rgrammar: true, note: "seed1 합체욕심가 run#0 — 합체 후 보충 스킵 → 전멸" },
  { label: "Route grammar long run", policyId: "steadyGrowth", profileId: "baseline", target: "longRun", seed: 1, rgrammar: true, note: "가장 긴 런(전체 루트 문법 관찰)" },
];

function readControls() { return { policyId: $("rl-policy").value, profileId: $("rl-profile").value, seed: parseInt($("rl-seed").value, 10), runs: Math.max(1, Math.min(300, parseInt($("rl-runs").value, 10) || 50)), target: $("rl-target").value, customIndex: parseInt($("rl-index").value, 10) || 0 }; }
function selectTarget(rs, target, customIndex) {
  if (target === "custom") return rs[Math.max(0, Math.min(rs.length - 1, customIndex))] || null;
  return (FINDERS[target] ? FINDERS[target](rs) : null) || null;
}

function runReplay(opts) {
  const c = opts || readControls();
  const rs = replayBatch({ policyId: c.policyId, profileId: c.profileId, seed: c.seed, runs: c.runs });
  lastRuns = rs;
  const target = selectTarget(rs, c.target, c.customIndex);
  lastTarget = target; lastMeta = c; lastCompare = null;
  if (c.compare) {
    const rs2 = replayBatch({ policyId: c.policyId, profileId: c.compare, seed: c.seed, runs: c.runs });
    const t2 = target ? rs2[target.runIndex] : null; // 같은 seed·같은 index = A/B 짝
    lastCompare = { profileId: c.compare, runs: rs2, target: t2 };
  }
  renderAll();
}

function renderAll() {
  if (!lastTarget) { $("rl-autopsy").innerHTML = `<div class="rl-empty">조건에 맞는 run 없음 — seed/runs/target을 바꿔보세요.</div>`; $("rl-timeline").innerHTML = ""; $("rl-compare").innerHTML = ""; return; }
  renderAutopsy(lastTarget, lastMeta); renderTimeline(lastTarget); renderCompare();
}

const mc = (k, v, cls) => `<div class="rl-card"><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div></div>`;
const dep = (v) => (v ? `심도 ${v}` : "—");
function resultBadge(r) { return r.result === "clear" ? `<span class="rl-r clear">CLEAR</span>` : r.result === "defeat" ? `<span class="rl-r wipe">${r.bossAttempted ? "BOSS FAIL" : "WIPE"}</span>` : `<span class="rl-r inc">INCOMPLETE</span>`; }
function axisChips(r) { return ["hasHealer:힐러", "hasTank:탱커", "hasShield:보호막", "hasAoE:광역", "hasSecondClass:2차"].map((s) => { const [k, l] = s.split(":"); return `<span class="rl-ax ${r[k] ? "on" : "off"}">${l}</span>`; }).join(""); }

function renderAutopsy(r, meta) {
  const pol = (POLICIES[meta.policyId] || {}).label || meta.policyId;
  const prof = (PROFILES[meta.profileId] || {}).label || meta.profileId;
  $("rl-autopsy").innerHTML = `<h3>Run Autopsy — ${esc(pol)} · ${esc(prof)} · seed ${meta.seed} · run #${r.runIndex} &nbsp; ${resultBadge(r)}</h3>
    <div class="rl-row">${axisChips(r)}</div>
    <div class="rl-cards">
      ${mc("결과", r.result, r.result === "clear" ? "clear" : r.result === "defeat" ? "wipe" : "")}
      ${mc("최종/전멸 심도", r.finalDepth)}
      ${mc("전투 수", r.battleCount)}
      ${mc("합체/영입", `${r.fusionCount}/${r.recruitCount}`)}
      ${mc("기절 누적", r.faintCount)}
      ${mc("보스키", r.bossKeysFinal)}
      ${mc("preWipeChoice", r.preWipeChoice || "—")}
      ${mc("lastSafeMilestone", r.lastSafeMilestone)}
      ${mc("첫영입/4인", `${dep(r.firstRecruitDepth)} / ${dep(r.partySize4Depth)}`)}
      ${mc("첫합체/1차/2차", `${dep(r.firstFusionDepth)} / ${dep(r.firstFirstClassDepth)} / ${dep(r.firstSecondClassDepth)}`)}
      ${mc("첫정예/정예처치/보스키", `${dep(r.firstEliteAttemptDepth)} / ${dep(r.firstEliteKillDepth)} / ${dep(r.firstBossKeyDepth)}`)}
      ${mc("보스 도전/처치", `${dep(r.bossAttemptDepth)} / ${dep(r.bossKillDepth)}`)}
      ${mc("보스 HP50% 봄", r.bossHalfHpSeen ? "예" : "아니오")}
      ${mc("첫쉼터/첫위기", `${dep(r.firstRestDepth)} / ${dep(r.firstNearDeathDepth)}`)}
    </div>
    <div class="rl-line"><b>pathSignature:</b> <code>${esc(r.pathSignature)}</code></div>
    <div class="rl-line"><b>루트 문법:</b> ${["normal", "ally", "bond", "danger", "elite", "rest", "boss"].map((rt) => `<span class="rl-tag">${ROUTE_TOKEN[rt]}:${(r.routeCounts && r.routeCounts[rt]) || 0}</span>`).join("")} <span class="rl-meta">· 최종파티 ${r.finalPartySize}/4 · 4인완성 ${r.party4Reached ? "심도 " + (r.party4Depth || "?") : "미완성"} · 경계도@4인 ${r.alertnessAtParty4 || 0}(유효 ${r.effectiveAlertnessAtParty4 || 0})</span></div>
    <div class="rl-line"><b>합체 빈자리:</b> ${r.fusionCreatedEmptySlot ? `발생(합체후 ${r.partySizeAfterFusion}인` : "없음(합체 안 함"} · 4인미만 전투 ${r.battlesWhileUnder4AfterFusion} · 보충 ${r.recruitAfterFusionDepth ? "심도 " + r.recruitAfterFusionDepth : (r.fusionCreatedEmptySlot ? "스킵" : "—")}) · 4인전 전투 ${r.preParty4Battles}/위험 ${r.preParty4DangerCount}/영입 ${r.preParty4RecruitCount}${r.preParty4FarmSuspect ? ' <span class="rl-tag warn">FARM_SUSPECT</span>' : ""}</div>
    <div class="rl-line"><b>전멸 루트(추정):</b> ${(r.routeCauseTags || []).map((t) => `<span class="rl-tag warn">${t}</span>`).join("") || "—"}${r.routeBeforeWipe ? ` <span class="rl-meta">· 직전루트 <code>${esc(r.routeBeforeWipe)}</code> · 최근3 <code>${esc(r.lastThreeRoutesBeforeWipe || "")}</code></span>` : ""}</div>
    <div class="rl-line"><b>실패 태그(추정):</b> ${(r.failureTags || []).map((t) => `<span class="rl-tag">${t}</span>`).join("") || "—"}</div>
    <div class="rl-line"><b>위험 마커(추정):</b> ${(r.dangerMarkers || []).map((t) => `<span class="rl-tag warn">${t}</span>`).join("") || "—"}</div>
    ${(() => { const dc = dangerContextOf(r); return dc ? `<div class="rl-line"><b>위험 진입 컨텍스트(추정):</b> 심도 ${dc.depth} · ${routeName(dc.routeType)} · 파티 ${dc.partySize} · 진입HP ${fmtPct(dc.startHpAvg)}(최저 ${fmtPct(dc.startHpMin)}) · 전투후 최저HP ${fmtPct(dc.afterBattleMinHp)} · 기절 ${dc.downs == null ? "—" : dc.downs} · 힐${dc.hasHealer ? "O" : "X"}/탱${dc.hasTank ? "O" : "X"}/광${dc.hasAoE ? "O" : "X"} · 4인후 ${dc.afterParty4 ? "O" : "X"}/합체후 ${dc.afterFusion ? "O" : "X"} · preWipe <code>${esc(dc.preWipeChoice || "—")}</code></div>` : ""; })()}`;
}

const MARKERS = [
  ["firstRecruitDepth", "FIRST_RECRUIT"], ["partySize4Depth", "PARTY_4"], ["firstFusionDepth", "FIRST_FUSION"], ["firstFirstClassDepth", "FIRST_FIRST_CLASS"],
  ["firstSecondClassDepth", "FIRST_SECOND_CLASS"], ["firstEliteAttemptDepth", "FIRST_ELITE_ATTEMPT"], ["firstEliteKillDepth", "FIRST_ELITE_KILL"],
  ["firstBossKeyDepth", "FIRST_BOSS_KEY"], ["bossAttemptDepth", "BOSS_ATTEMPT"], ["bossHalfHpSeenDepth", "BOSS_HALF_HP"], ["bossKillDepth", "BOSS_KILL"], ["firstRestDepth", "FIRST_REST"], ["firstNearDeathDepth", "NEAR_DEATH"],
];
function markersByDepth(r) { const m = {}; MARKERS.forEach(([key, name]) => { const d = r[key]; if (d) (m[d] = m[d] || []).push(name); }); return m; }

function renderTimeline(r) {
  const md = markersByDepth(r); const locs = tagLocations(r); const lastStep = r.timeline.length - 1;
  const tagAt = {}; Object.entries(locs).forEach(([tag, step]) => { if (step !== "run") (tagAt[step] = tagAt[step] || []).push(tag); });
  const rows = r.timeline.map((e, i) => {
    if (e.kind === "battle") {
      const marks = (md[e.depth] || []).map((m) => `<span class="rl-mk">${m}</span>`).join("");
      const tags = (tagAt[i] || []).map((t) => `<span class="rl-tag warn">${t}</span>`).join("");
      const dangerMk = (e.route === "danger" || e.route === "elite") ? `<span class="rl-tag warn">위험진입</span>` : "";
      // Route Grammar 02 — per-row 문법 칩: 4인 전(잠복 경계도) / 합체 빈자리.
      const grammarMk = `${e.preParty4 ? `<span class="rl-tag">P&lt;4·잠복${e.latentAlertness || 0}</span>` : `<span class="rl-mk">P4·경계${e.effectiveAlertness || 0}</span>`}${e.fusedEmptySlot && e.size < 4 ? `<span class="rl-tag warn">빈자리</span>` : ""}`;
      const tcls = e.token === "BOSS" ? "boss" : e.token === "E" ? "elite" : e.token === "D" ? "danger" : "normal";
      const rcls = e.result === "wipe" ? "wipe" : e.result === "clear" ? "clear" : "";
      const danger = e.minHp <= 0.2 || e.faints > 0;
      return `<tr class="${rcls ? "row-" + rcls : ""} ${danger ? "row-danger" : ""}"><td>${e.depth}</td><td><span class="rl-tok ${tcls}">${e.token}</span></td><td class="txt">${routeName(e.route)}</td><td>${e.size}</td><td class="txt">${e.jobs.map(jobName).join("·")}</td><td class="txt">${axesMini(e.axes)}</td><td>${fmtPct(e.avgHp)}</td><td class="${e.minHp <= 0.2 ? "lowhp" : ""}">${fmtPct(e.minHp)}</td><td>${e.faints || ""}</td><td class="${rcls}">${e.result}${e.keyGain ? " 🔑" : ""}${e.bossHp != null ? ` (보스 ${fmtPct(e.bossHp)})` : ""}</td><td class="txt">${marks}${grammarMk}${dangerMk}${tags}</td></tr>`;
    }
    const icon = e.kind === "reward" ? `보상: ${esc(e.name)}` : e.kind === "fusion" ? `합체: ${esc(e.materials.join("+"))}→${esc(e.result)}` : e.kind === "recruit" ? `영입: ${esc(e.job)}` : e.kind === "rest" ? "쉼터(회복)" : e.token === "CLEAR" ? "CLEAR" : e.token === "WIPE" ? "WIPE" : esc(e.token || e.kind);
    const cls = e.kind === "fusion" ? "row-fus" : e.kind === "recruit" ? "row-rec" : e.kind === "rest" ? "row-rest" : e.token === "WIPE" ? "row-wipe" : e.token === "CLEAR" ? "row-clear" : "";
    return `<tr class="${cls}"><td>${e.depth || ""}</td><td><span class="rl-tok evt">${e.kind === "end" ? e.token : e.kind.toUpperCase().slice(0, 3)}</span></td><td class="txt" colspan="9">${icon}</td></tr>`;
  }).join("");
  const runTags = Object.entries(locs).filter(([, s]) => s === "run").map(([t]) => `<span class="rl-tag">${t}</span>`).join("");
  $("rl-timeline").innerHTML = `<h3>Run Timeline (per-step) ${runTags ? `<span class="rl-meta">· 런 전체 태그: ${runTags}</span>` : ""}</h3>
    <div class="rl-tablewrap"><table><thead><tr><th>심도</th><th>토큰</th><th class="txt">선택</th><th>파티</th><th class="txt">직업</th><th class="txt">축</th><th>평균HP</th><th>최저HP</th><th>기절</th><th>결과</th><th class="txt">마커/태그</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
const routeName = (rt) => ({ normal: "새싹 숲길", danger: "깊은 수풀(위험)", elite: "현자의 가지(정예)", boss: "보스전", ally: "동료의 흔적(영입)", bond: "결속의 공터(합체)", rest: "이슬 쉼터" }[rt] || rt);
const axesMini = (ax) => `${ax.healer ? '<span class="rl-ax on">힐</span>' : ""}${ax.tank ? '<span class="rl-ax on">탱</span>' : ""}${ax.shield ? '<span class="rl-ax on">막</span>' : ""}${ax.aoe ? '<span class="rl-ax on">광</span>' : ""}${ax.second ? '<span class="rl-ax on">2</span>' : ""}` || "—";

function renderCompare() {
  if (!lastCompare || !lastCompare.target) { $("rl-compare").innerHTML = ""; return; }
  const A = lastTarget, B = lastCompare.target;
  const profA = (PROFILES[lastMeta.profileId] || {}).label, profB = (PROFILES[lastCompare.profileId] || {}).label;
  const row = (label, fa, fb) => `<tr><td class="txt">${label}</td><td>${fa}</td><td>${fb}</td></tr>`;
  const yn = (v) => (v ? "O" : "—");
  $("rl-compare").innerHTML = `<h3>Before / After — 같은 seed·같은 run #${A.runIndex}</h3>
    <div class="rl-tablewrap"><table><thead><tr><th class="txt">지표</th><th>${esc(profA)}</th><th>${esc(profB)}</th></tr></thead><tbody>
      ${row("결과", A.result, B.result)}
      ${row("최종/전멸 심도", A.finalDepth, B.finalDepth)}
      ${row("전투 수", A.battleCount, B.battleCount)}
      ${row("4인 도달", dep(A.partySize4Depth), dep(B.partySize4Depth))}
      ${row("첫 합체", dep(A.firstFusionDepth), dep(B.firstFusionDepth))}
      ${row("첫 1차/2차", `${dep(A.firstFirstClassDepth)}/${dep(A.firstSecondClassDepth)}`, `${dep(B.firstFirstClassDepth)}/${dep(B.firstSecondClassDepth)}`)}
      ${row("보스키", A.bossKeysFinal, B.bossKeysFinal)}
      ${row("보스 시도", yn(A.bossAttempted), yn(B.bossAttempted))}
      ${row("보스 반피 봄", yn(A.bossHalfHpSeen), yn(B.bossHalfHpSeen))}
      ${row("기절 누적", A.faintCount, B.faintCount)}
      ${row("pathSignature", `<code>${esc(A.pathSignature)}</code>`, `<code>${esc(B.pathSignature)}</code>`)}
      ${row("갈라진 지점", divergePoint(A, B), divergePoint(B, A))}
      ${row("실패 태그", (A.failureTags || []).join(", ") || "—", (B.failureTags || []).join(", ") || "—")}
    </tbody></table></div>`;
}
function divergePoint(A, B) { const pa = A.path, pb = B.path; let i = 0; while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++; return i >= pa.length ? "(끝까지 동일)" : `step ${i}: ${pa[i] || "—"}`; }

function exportJSON() {
  if (!lastTarget) return "";
  return JSON.stringify({
    metadata: { tool: "run-replay-lab-01", theme: "beginner", policy: lastMeta.policyId, profile: lastMeta.profileId, seed: lastMeta.seed, runs: lastMeta.runs, runIndex: lastTarget.runIndex, target: lastMeta.target, generatedAt: new Date().toISOString() },
    // Observation Batch 01 — export 확장
    selectedProfile: lastMeta.profileId, compareProfile: (lastCompare && lastCompare.profileId) || null,
    splitProfile: isSplitProfile(lastMeta.profileId) || (lastCompare ? isSplitProfile(lastCompare.profileId) : false),
    dangerAutopsyMarkers: lastTarget.dangerMarkers || [],
    dangerEntryContext: dangerContextOf(lastTarget),
    dangerEntries: lastTarget.dangerEntries || [],
    // Route Grammar 02 — export 확장
    routeGrammarVersion: "route-grammar-02",
    routeChoiceCounts: lastTarget.routeCounts || null,
    routeTimelineTokens: lastTarget.path || [],
    preParty4Stats: { battles: lastTarget.preParty4Battles, growth: lastTarget.preParty4GrowthCount, danger: lastTarget.preParty4DangerCount, recruit: lastTarget.preParty4RecruitCount, farmSuspect: !!lastTarget.preParty4FarmSuspect, farmWarnShown: lastTarget.farmWarnShown },
    antiFarmMarkers: { preParty4FarmSuspect: !!lastTarget.preParty4FarmSuspect, ignoredAlly: !lastTarget.party4Reached && (lastTarget.routeCounts.ally || 0) === 0 },
    alertnessAtParty4: lastTarget.alertnessAtParty4, effectiveAlertnessAtParty4: lastTarget.effectiveAlertnessAtParty4, latentAlertnessAtParty4: lastTarget.latentAlertnessAtParty4,
    party4Reached: lastTarget.party4Reached, party4Depth: lastTarget.party4Depth,
    routeBeforeWipe: lastTarget.routeBeforeWipe, lastThreeRoutesBeforeWipe: lastTarget.lastThreeRoutesBeforeWipe, routeCauseSummary: lastTarget.routeCauseTags || [],
    fusionCreatedEmptySlot: lastTarget.fusionCreatedEmptySlot, partySizeAfterFusion: lastTarget.partySizeAfterFusion,
    battlesWhileUnder4AfterFusion: lastTarget.battlesWhileUnder4AfterFusion, recruitAfterFusionDepth: lastTarget.recruitAfterFusionDepth,
    skippedRecruitAfterFusion: lastTarget.skippedRecruitAfterFusion, wipeAfterFusionWithoutRefill: lastTarget.wipeAfterFusionWithoutRefill,
    clearWithUnder4Party: lastTarget.clearWithUnder4Party, bossAttemptPartySize: lastTarget.bossAttemptPartySize, finalPartySize: lastTarget.finalPartySize, highTierSmallPartyClear: lastTarget.highTierSmallPartyClear,
    summary: { ...lastTarget, jobsSeen: [...lastTarget.jobsSeen], timeline: undefined },
    timeline: lastTarget.timeline.map((e) => ({ ...e, axes: e.axes, jobs: e.jobs })),
    failureTags: lastTarget.failureTags, failureTagLocations: tagLocations(lastTarget),
    compare: lastCompare && lastCompare.target ? { profile: lastCompare.profileId, splitProfile: isSplitProfile(lastCompare.profileId), summary: { ...lastCompare.target, jobsSeen: [...lastCompare.target.jobsSeen], timeline: undefined }, dangerAutopsyMarkers: lastCompare.target.dangerMarkers || [], dangerEntryContext: dangerContextOf(lastCompare.target) } : null,
  }, null, 0);
}
async function copyOut(text, btn, label) { const done = (ok) => { if (btn) { btn.textContent = ok ? "복사됨!" : "복사 실패"; setTimeout(() => { btn.textContent = label; }, 1200); } }; try { await navigator.clipboard.writeText(text); done(true); } catch (e) { try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(true); } catch (e2) { done(false); } } }

export function initRunReplayLab() {
  const pol = $("rl-policy"); POLICY_ORDER.forEach((id) => pol.add(new Option(POLICIES[id].label, id)));
  const prof = $("rl-profile"); PROFILE_ORDER.forEach((id) => prof.add(new Option(PROFILES[id].label, id)));
  pol.value = "steadyGrowth"; prof.value = "baseline";
  $("rl-presets").innerHTML = PRESETS.map((p, i) => `<button type="button" data-preset="${i}" class="${p.split ? "rl-preset-split" : ""}${p.rgrammar ? " rl-preset-rg" : ""}" title="${esc(p.note || "")}">${esc(p.label)}</button>`).join("");
  $("rl-presets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]"); if (!b) return;
    const p = PRESETS[Number(b.dataset.preset)];
    $("rl-policy").value = p.policyId; $("rl-profile").value = p.profileId; $("rl-target").value = p.target;
    if (p.seed != null) $("rl-seed").value = p.seed;
    const seed = p.seed != null ? p.seed : parseInt($("rl-seed").value, 10);
    runReplay({ policyId: p.policyId, profileId: p.profileId, seed, runs: Math.max(1, Math.min(300, parseInt($("rl-runs").value, 10) || 50)), target: p.target, customIndex: 0, compare: p.compare });
  });
  $("rl-run").addEventListener("click", () => runReplay());
  $("rl-compare-btn").addEventListener("click", () => { const c = readControls(); runReplay({ ...c, compare: "softRamp" }); });
  $("rl-export").addEventListener("click", (e) => copyOut(exportJSON(), e.target, "JSON 복사"));
}
