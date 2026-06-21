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
    pickRoute: (c) => { if (c.includes("boss")) return "boss"; return ["danger", "elite", "normal", "rest"].find((rt) => c.includes(rt)) || c[0]; },
  },
  steady: {
    id: "steady", label: "안정 운영가", startFormation: () => { const s = pick(SURVIVAL_BASE); const o = pick(BASE_JOBS.filter((j) => j !== s)); return makeFormation([s, o]); },
    pickReward: (o) => preferIds(o, SURVIVAL_REWARDS), decideFusion: (op) => (partyHpRatio() < 0.6 ? null : pick(op).result), pickRecruit: (o) => preferIds(o, SURVIVAL_BASE),
    pickRoute: (c) => { const hurt = partyHpRatio() < 0.55; if (hurt && c.includes("rest")) return "rest"; if (c.includes("boss") && curPartySize() >= 4 && partyHpRatio() >= 0.6) return "boss"; if (curPartySize() < 4) { if (!hurt && c.includes("danger")) return "danger"; if (c.includes("rest")) return "rest"; if (c.includes("normal")) return "normal"; } const order = hurt ? ["rest", "normal", "elite", "danger"] : ["normal", "elite", "danger", "rest"]; return order.find((rt) => c.includes(rt)) || c[0]; },
  },
  steadyGrowth: {
    id: "steadyGrowth", label: "안정 성장가", startFormation: () => { const s = pick(SURVIVAL_BASE); const o = pick(BASE_JOBS.filter((j) => j !== s)); return makeFormation([s, o]); },
    pickReward: (o) => preferIds(o, BALANCED_REWARDS), decideFusion: (op) => { if (partyHpRatio() < 0.45) return null; const s = op.filter((x) => isSecond(x.result)); if (s.length) return pick(s).result; return pick(op).result; },
    pickRecruit: (o) => { if (curPartySize() < 4) { const owned = partyJobIds(); const u = o.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m)))); return pick(u.length ? u : o); } return pick(o); },
    pickRoute: (c) => { const hurt = partyHpRatio() < 0.5; if (hurt && c.includes("rest")) return "rest"; if (c.includes("boss") && curPartySize() >= 4 && partyHpRatio() >= 0.55) return "boss"; if (curPartySize() < 4) { if (!hurt && c.includes("danger")) return "danger"; if (c.includes("normal")) return "normal"; if (c.includes("rest")) return "rest"; } const order = hurt ? ["rest", "normal", "elite", "danger"] : ["elite", "danger", "normal", "rest"]; return order.find((rt) => c.includes(rt)) || c[0]; },
  },
  aggressive: {
    id: "aggressive", label: "공격 욕심가", startFormation: () => makeFormation(twoDistinct(ATTACK_BASE)), pickReward: (o) => preferIds(o, ATTACK_REWARDS),
    decideFusion: (op) => { const d = op.filter((x) => isDealer(x.result)); return (d.length ? pick(d) : pick(op)).result; }, pickRecruit: (o) => preferIds(o, ATTACK_BASE),
    pickRoute: (c) => { if (partyHpRatio() < 0.25 && c.includes("rest")) return "rest"; if (c.includes("boss")) return "boss"; return ["danger", "elite", "normal", "rest"].find((rt) => c.includes(rt)) || c[0]; },
  },
  secondChaser: {
    id: "secondChaser", label: "2차 추적가", startFormation: () => makeFormation([...(pick(BASE_RECIPES) || { materials: ["warrior", "archer"] }).materials]), pickReward: (o) => preferIds(o, SURVIVAL_REWARDS),
    decideFusion: (op) => { if (partyHpRatio() < 0.4) return null; const s = op.filter((x) => isSecond(x.result)); if (s.length) return pick(s).result; const t = op.filter((x) => SECOND_MATERIALS.has(x.result)); return (t.length ? pick(t) : pick(op)).result; },
    pickRecruit: (o) => { const owned = partyJobIds(); const u = o.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m)))); return pick(u.length ? u : o); },
    pickRoute: (c) => { if (partyHpRatio() < 0.4 && c.includes("rest")) return "rest"; if (c.includes("boss") && partyHasSecond()) return "boss"; return ["danger", "elite", "normal", "rest"].find((rt) => c.includes(rt)) || c[0]; },
  },
};
const POLICY_ORDER = ["random", "fusion", "steady", "steadyGrowth", "aggressive", "secondChaser"];

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
};
const PROFILE_ORDER = ["baseline", "cushion", "cushion2", "recruitSafe", "fusionSafe", "softRamp", "guided", "safeElite"];

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
const ROUTE_TOKEN = { normal: "N", danger: "D", elite: "E", boss: "BOSS" };
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
      push({ kind: "battle", token: ROUTE_TOKEN[pendingRoute] || "B", route: pendingRoute, depth, size, jobs, axes: axesOf(new Set(jobs)), avgHp: hp0.avg, minHp: after.min, faints: deadNow, result: res, keyGain, bossHp });
      sinceFusion = sinceFusion == null ? null : sinceFusion + 1;
    } else if (screen === "reward") {
      const offer = gameState.run.rewardOffer || []; if (!offer.length) { rec.result = "incomplete"; break; }
      const id = policy.pickReward(offer); applyReward(id); push({ kind: "reward", depth: gameState.run.depth, name: rewardName(id) });
    } else if (screen === "fusion") {
      const options = availableFusions(partyJobIds()); const choiceId = options.length ? policy.decideFusion(options) : null;
      if (choiceId) { rec.fusionCount += 1; if (!rec.firstFusionDepth) rec.firstFusionDepth = gameState.run.depth; if (rec.fusionBattleIdx == null) rec.fusionBattleIdx = rec.battleCount; sinceFusion = 0; rec.path.push("FUS"); const recp = ACTIVE_FUSION_RECIPES.find((r) => r.result === choiceId); push({ kind: "fusion", depth: gameState.run.depth, result: jobName(choiceId), materials: recp ? recp.materials.map(jobName) : [] }); applyFusion(choiceId); }
      else skipFusion();
    } else if (screen === "fusionResult") { continueAfterFusion(); }
    else if (screen === "recruit") {
      const offer = gameState.run.recruitOffer || [];
      if (offer.length) { const jobId = policy.pickRecruit(offer); if (jobId) { previewRecruit(jobId); rec.recruitCount += 1; if (!rec.firstRecruitDepth) rec.firstRecruitDepth = gameState.run.depth; rec.path.push("REC"); push({ kind: "recruit", depth: gameState.run.depth, job: jobName(jobId) }); } }
      confirmRecruit();
    } else if (screen === "arrange") { confirmArrange(); }
    else if (screen === "route") {
      const choices = gameState.run.routeChoices || ["normal"]; let rt = policy.pickRoute(choices); if (profile.route) rt = profile.route(rt, choices, ctx());
      if (rt === "rest" && !rec.firstRestDepth) rec.firstRestDepth = gameState.run.depth;
      if (rt === "elite" || rt === "danger") { if (!rec.firstEliteAttemptDepth) rec.firstEliteAttemptDepth = gameState.run.depth; rec.eliteEnterBattleIdx = rec.battleCount; }
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
  return rec;
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
    <div class="rl-line"><b>실패 태그(추정):</b> ${(r.failureTags || []).map((t) => `<span class="rl-tag">${t}</span>`).join("") || "—"}</div>`;
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
      const tcls = e.token === "BOSS" ? "boss" : e.token === "E" ? "elite" : e.token === "D" ? "danger" : "normal";
      const rcls = e.result === "wipe" ? "wipe" : e.result === "clear" ? "clear" : "";
      const danger = e.minHp <= 0.2 || e.faints > 0;
      return `<tr class="${rcls ? "row-" + rcls : ""} ${danger ? "row-danger" : ""}"><td>${e.depth}</td><td><span class="rl-tok ${tcls}">${e.token}</span></td><td class="txt">${routeName(e.route)}</td><td>${e.size}</td><td class="txt">${e.jobs.map(jobName).join("·")}</td><td class="txt">${axesMini(e.axes)}</td><td>${fmtPct(e.avgHp)}</td><td class="${e.minHp <= 0.2 ? "lowhp" : ""}">${fmtPct(e.minHp)}</td><td>${e.faints || ""}</td><td class="${rcls}">${e.result}${e.keyGain ? " 🔑" : ""}${e.bossHp != null ? ` (보스 ${fmtPct(e.bossHp)})` : ""}</td><td class="txt">${marks}${tags}</td></tr>`;
    }
    const icon = e.kind === "reward" ? `보상: ${esc(e.name)}` : e.kind === "fusion" ? `합체: ${esc(e.materials.join("+"))}→${esc(e.result)}` : e.kind === "recruit" ? `영입: ${esc(e.job)}` : e.kind === "rest" ? "쉼터(회복)" : e.token === "CLEAR" ? "CLEAR" : e.token === "WIPE" ? "WIPE" : esc(e.token || e.kind);
    const cls = e.kind === "fusion" ? "row-fus" : e.kind === "recruit" ? "row-rec" : e.kind === "rest" ? "row-rest" : e.token === "WIPE" ? "row-wipe" : e.token === "CLEAR" ? "row-clear" : "";
    return `<tr class="${cls}"><td>${e.depth || ""}</td><td><span class="rl-tok evt">${e.kind === "end" ? e.token : e.kind.toUpperCase().slice(0, 3)}</span></td><td class="txt" colspan="9">${icon}</td></tr>`;
  }).join("");
  const runTags = Object.entries(locs).filter(([, s]) => s === "run").map(([t]) => `<span class="rl-tag">${t}</span>`).join("");
  $("rl-timeline").innerHTML = `<h3>Run Timeline (per-step) ${runTags ? `<span class="rl-meta">· 런 전체 태그: ${runTags}</span>` : ""}</h3>
    <div class="rl-tablewrap"><table><thead><tr><th>심도</th><th>토큰</th><th class="txt">선택</th><th>파티</th><th class="txt">직업</th><th class="txt">축</th><th>평균HP</th><th>최저HP</th><th>기절</th><th>결과</th><th class="txt">마커/태그</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
const routeName = (rt) => ({ normal: "일반 전투", danger: "깊은 수풀(위험)", elite: "현자의 가지(정예)", boss: "보스전" }[rt] || rt);
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
    summary: { ...lastTarget, jobsSeen: [...lastTarget.jobsSeen], timeline: undefined },
    timeline: lastTarget.timeline.map((e) => ({ ...e, axes: e.axes, jobs: e.jobs })),
    failureTags: lastTarget.failureTags, failureTagLocations: tagLocations(lastTarget),
    compare: lastCompare && lastCompare.target ? { profile: lastCompare.profileId, summary: { ...lastCompare.target, jobsSeen: [...lastCompare.target.jobsSeen], timeline: undefined } } : null,
  }, null, 0);
}
async function copyOut(text, btn, label) { const done = (ok) => { if (btn) { btn.textContent = ok ? "복사됨!" : "복사 실패"; setTimeout(() => { btn.textContent = label; }, 1200); } }; try { await navigator.clipboard.writeText(text); done(true); } catch (e) { try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(true); } catch (e2) { done(false); } } }

export function initRunReplayLab() {
  const pol = $("rl-policy"); POLICY_ORDER.forEach((id) => pol.add(new Option(POLICIES[id].label, id)));
  const prof = $("rl-profile"); PROFILE_ORDER.forEach((id) => prof.add(new Option(PROFILES[id].label, id)));
  pol.value = "steadyGrowth"; prof.value = "baseline";
  $("rl-presets").innerHTML = PRESETS.map((p, i) => `<button type="button" data-preset="${i}">${p.label}</button>`).join("");
  $("rl-presets").addEventListener("click", (e) => { const b = e.target.closest("[data-preset]"); if (!b) return; const p = PRESETS[Number(b.dataset.preset)]; $("rl-policy").value = p.policyId; $("rl-profile").value = p.profileId; $("rl-target").value = p.target; runReplay({ policyId: p.policyId, profileId: p.profileId, seed: parseInt($("rl-seed").value, 10), runs: Math.max(1, Math.min(300, parseInt($("rl-runs").value, 10) || 50)), target: p.target, customIndex: 0, compare: p.compare }); });
  $("rl-run").addEventListener("click", () => runReplay());
  $("rl-compare-btn").addEventListener("click", () => { const c = readControls(); runReplay({ ...c, compare: "softRamp" }); });
  $("rl-export").addEventListener("click", (e) => copyOut(exportJSON(), e.target, "JSON 복사"));
}
