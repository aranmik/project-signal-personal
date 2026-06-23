// =====================================================================
// Expedition Observatory — Observation Gear Reframe 01 / Phase 1 (계측 전용 dev 도구)
//   방향 전환: "클리어 심도 유도" 관측이 아니라 "귀환 / 전리품 프록시 / 욕심 / 조합 가치 / 효과 가치"를 읽는 장비.
//   클리어는 끝이 아니라 귀환. 보스문은 엔딩이 아니라 들고 있는 발견품을 집으로 가져가는 문(귀환 보험).
//   심도6 클리어든 심도60 클리어든 문제 아님 — 무엇을 들고, 언제 돌아왔고, 어디서 욕심냈는가를 본다.
//
//   분리 원칙(요청): 기존 파일을 "수정"하지 않는다. 엔진 flow 함수는 battle.js에서 import만 하고,
//     정책/프로필/역할축 로직은 (수정 대신) 독립 구현한다. → Auto Run Report / Run Replay Lab / Balance Lab 무수정.
//   오염 방지: 헤드리스 구동(setHeadlessRun) — 렌더/FX/로그/발자취/localStorage 미발생, gameState 스냅샷→복구.
//   진입: 독립 페이지 dev/expedition-observatory.html (일반 플레이 비노출).
//
//   ★lootProxy = dev-only 임시 지표. 실제 전리품 반출/유물 영구효과 시스템을 구현하지 않는다 — 관측 집계만.
//     실제 유저 보상/progress/localStorage에 영향 없음. 나중에 Extraction Loot Layer 01과 연결하기 좋은 형태로 분류.
//   ★본게임 수치/전투/직업/스킬/몬스터/보상 데이터·route 확률/경계도/보스 조건 전부 무변경(읽기만).
// =====================================================================
import { gameState, SLOT_ORDER } from "../core/state.js";
import {
  setHeadlessRun, runHeadlessBattle,
  startRun, applyReward, applyFusion, skipFusion, continueAfterFusion,
  previewRecruit, confirmRecruit, confirmArrange, chooseRoute, continueFromRest,
  partyJobIds,
} from "../core/battle.js";
import { BASE_JOBS, ADVANCED_JOBS, SECOND_CLASS_JOBS, ACTIVE_FUSION_RECIPES, availableFusions, slotPreference, combatRoleLabelOf } from "../data/jobs.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { REWARDS, REWARD_MAX_LEVEL } from "../data/rewards.js";
import { activeDeepRewards, deepRewardById } from "../data/deepRewards.js";
import { SKILLS } from "../data/skills.js";
import { depthBand, BOSS_MENACE } from "../data/routes.js";

/* ── 이름/포맷 ───────────────────────────────────────────────────── */
const jobName = (id) => (UNIT_TEMPLATES.party[id] && UNIT_TEMPLATES.party[id].name) || id;
const isSecond = (id) => SECOND_CLASS_JOBS.includes(id);
const fmt1 = (n) => (n == null || Number.isNaN(n) ? "—" : (Math.round((n || 0) * 10) / 10).toFixed(1));
const fmtPct = (n) => (n == null || Number.isNaN(n) ? "—" : (Math.round((n || 0) * 1000) / 10).toFixed(1) + "%");
const rand = () => Math.random();
const pick = (a) => a[Math.floor(rand() * a.length)];
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
const tierOf = (id) => (SECOND_CLASS_JOBS.includes(id) ? "2차" : ADVANCED_JOBS.includes(id) ? "1차" : "기본");

/* ── seed(다른 dev 도구와 동일 mulberry32) ───────────────────────── */
let savedRandom = null;
function installSeed(seed) { savedRandom = Math.random; let s = seed >>> 0; Math.random = function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function restoreRandom() { if (savedRandom) { Math.random = savedRandom; savedRandom = null; } }

/* ── 런 컨텍스트 헬퍼 ──────────────────────────────────────────── */
function aliveParty() { return gameState.party.filter((u) => !u.isDead); }
function partyHpRatio() { const a = aliveParty(); return a.length ? a.reduce((s, u) => s + u.hp / u.maxHp, 0) / a.length : 1; }
function curPartySize() { return partyJobIds().length; }
function partyHasSecond() { return partyJobIds().some(isSecond); }
function makeFormation(jobs) { const f = { f0: null, f1: null, b0: null, b1: null }; jobs.forEach((j) => { const slot = slotPreference(j).find((k) => !f[k]); if (slot) f[slot] = j; }); return f; }

/* ── 역할 축(다른 dev 도구와 명명 일치 + 독/중독 추가) ─────────────── */
const ROLE_AR = { warrior: "singleDps", guardian: "tank", archer: "singleDps", priest: "healer", cleric: "shielder", trickster: "control", rogue: "singleDps", saint: "healer", warden: "debuff", watchbow: "counter", trapper: "debuff", paladin: "tank", vanguard: "aoeDps", forbidden: "tank", wall: "tank", healbow: "healer", purifier: "healer", mage: "aoeDps", bard: "support", gatekeeper: "tank", tracker: "marker", dragonspear: "pierce", sage: "aoeDps", sunlord: "support", swordsaint: "counter", redeemer: "healer", skyarcher: "marker", plaguebringer: "debuff", dancer: "support", wardkeeper: "shielder" };
const roleAr = (id) => ROLE_AR[id] || "support";
const POISON_JOBS = ["trapper", "plaguebringer"]; // 덫꾼(독)·역병술사(감염)
const SHIELD_JOBS_EXTRA = ["wall", "forbidden", "gatekeeper", "purifier"]; // 보호막/완충 부여 계열(표시용 보강)
// 파티(직업 set) → 역할 태그(보유 여부). 조합 결과 리포트/seat value 공용.
function roleTagsOf(jobs) {
  const set = new Set(jobs);
  const any = (fn) => [...set].some(fn);
  return {
    tank: any((j) => roleAr(j) === "tank"),
    healer: any((j) => roleAr(j) === "healer"),
    aoe: any((j) => roleAr(j) === "aoeDps" || roleAr(j) === "pierce"),
    support: any((j) => roleAr(j) === "support"),
    poison: any((j) => POISON_JOBS.includes(j)),
    shield: any((j) => roleAr(j) === "shielder" || SHIELD_JOBS_EXTRA.includes(j)),
    second: any((j) => SECOND_CLASS_JOBS.includes(j)),
  };
}
const ROLE_TAG_LABELS = { tank: "탱커", healer: "힐러", aoe: "광역", support: "서포터", poison: "독/중독", shield: "보호막", second: "2차직업" };
const ROLE_TAG_ORDER = ["tank", "healer", "aoe", "support", "poison", "shield", "second"];

/* ── 상태 스냅샷/복구(본게임 오염 방지) ────────────────────────────── */
function deepClone(o) { return typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)); }
function snapshotState() { return { party: gameState.party, enemies: gameState.enemies, logs: gameState.logs, screen: gameState.screen, battle: deepClone(gameState.battle), run: deepClone(gameState.run), immortal: gameState.dev ? gameState.dev.immortal : false }; }
function restoreState(s) { gameState.party = s.party; gameState.enemies = s.enemies; gameState.logs = s.logs; gameState.screen = s.screen; gameState.battle = deepClone(s.battle); gameState.run = deepClone(s.run); if (gameState.dev) gameState.dev.immortal = s.immortal; }

/* ════════════════════════════════════════════════════════════════
   공용 기본 행동(파티 빌드 역량은 4 프로필 공통 — 차이는 "전리품/귀환 stance"뿐).
   reward는 랜덤 선택(효과 진단의 선택/미선택 자연 분산 확보), 합체/영입은 안정 성장가 기준.
   ════════════════════════════════════════════════════════════════ */
const SURVIVAL_BASE = ["priest", "cleric", "guardian"];
function baseStartFormation() { const s = pick(SURVIVAL_BASE); const o = pick(BASE_JOBS.filter((j) => j !== s)); return makeFormation([s, o]); }
function basePickReward(offer) { return pick(offer); } // 랜덤 — 효과 선택/미선택 분산(효과 진단용)
function baseDecideFusion(options) { if (partyHpRatio() < 0.45) return null; const s = options.filter((x) => isSecond(x.result)); return (s.length ? pick(s) : pick(options)).result; }
function basePickRecruit(offer) {
  if (curPartySize() < 4) {
    const owned = partyJobIds();
    const u = offer.filter((j) => ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m))));
    return pick(u.length ? u : offer);
  }
  return pick(offer);
}
const orderPick = (choices, order) => order.find((rt) => choices.includes(rt));

/* ════════════════════════════════════════════════════════════════
   Expedition Profile 4종 — route stance만 다르다(전리품 욕심 ↔ 귀환).
   route(ctx) → 선택할 루트 id. ctx: { choices, depth, size, hp, bossKeys, bossReadyDoor, loot, treasure, sinceBossReady }
     · bossReadyDoor = 보스문이 이번 오퍼에 떴는지(열쇠 2 + rollRouteOffer 노출).
     · loot = lootProxyTotal(누적, discovery 포함) / treasure = 의도적 전리품(danger·elite·deepReward, discovery 제외).
   ════════════════════════════════════════════════════════════════ */
const EXPEDITIONS = {
  // 3-1. 전리품 없는 최단 귀환 — 빨리 보스문 열고 사자왕 잡아 귀환. 위험 회피, 위험하면 쉼터.
  bossRush: {
    id: "bossRush", label: "최단 귀환", sub: "No Loot Boss Rush", color: "#7fb0e8",
    desc: "전리품 욕심 없이 보스키→보스문→귀환. 깊은 수풀 회피, 위험하면 정비.",
    route(c) {
      if (c.size < 4 && c.choices.includes("ally")) return "ally";
      if (c.hp < 0.5 && c.choices.includes("rest")) return "rest";
      if (c.choices.includes("boss")) return "boss"; // 문 열리면 바로 귀환
      // 키 모으기(정예)·빌드(합체)는 하되 깊은 수풀(danger)은 피한다.
      return orderPick(c.choices, ["bond", "elite", "normal", "rest", "ally"]) || c.choices.find((x) => x !== "danger") || c.choices[0];
    },
  },
  // 3-2. 전리품 1회 후 귀환 — treasure 1개 챙긴 뒤 보스문/귀환 우선. 위험하면 쉼터/안전.
  oneLoot: {
    id: "oneLoot", label: "1전리품 귀환", sub: "One Loot Then Return", color: "#7fd1a8",
    desc: "전리품 프록시 1개 확보 전까지 전리품성 route 선호 → 1회 후 보스/귀환 우선.",
    route(c) {
      if (c.size < 4 && c.choices.includes("ally")) return "ally";
      if (c.hp < 0.5 && c.choices.includes("rest")) return "rest";
      if (c.treasure < 1) return orderPick(c.choices, ["danger", "elite", "normal", "rest", "bond"]) || c.choices[0];
      if (c.choices.includes("boss")) return "boss"; // 1개 챙겼으면 귀환
      return orderPick(c.choices, ["elite", "normal", "rest", "bond", "danger"]) || c.choices[0];
    },
  },
  // 3-3. 최대한 회수 후 사자왕 귀환 — 보스문 열려도 더 노림. HP/파티 나빠지면 귀환. 죽기 전엔 보스 귀환 시도.
  collector: {
    id: "collector", label: "회수 귀환", sub: "Collector Return", color: "#e6c578",
    desc: "보스문 열려도 즉시 안 나가고 더 회수. 위험/깊은 수풀/정예/심층 선호. HP 나빠지면 귀환.",
    route(c) {
      if (c.size < 4 && c.choices.includes("ally")) return "ally";
      const fragile = c.hp < 0.45;
      // 죽기 전 귀환: 위태롭거나, 보스문 열린 뒤 충분히 머물렀으면(욕심 한도) 보스로 나간다.
      if (c.choices.includes("boss") && (fragile || (c.sinceBossReady != null && c.sinceBossReady >= 4))) return "boss";
      if (c.hp < 0.55 && c.choices.includes("rest")) return "rest";
      return orderPick(c.choices, ["danger", "elite", "normal", "bond", "rest"]) || c.choices.find((x) => x !== "boss") || c.choices[0];
    },
  },
  // 3-4. 끝까지 회수 시도하다 실패 — 보스문 열려도 진입 미룸. 위험/정예/깊은 수풀 계속. 쉼터는 절박할 때만.
  greed: {
    id: "greed", label: "욕심 전멸", sub: "Greed Until Wipe", color: "#f0a0a0",
    desc: "보스문 열려도 진입 미루고 계속 회수. 위험/정예/깊은 수풀 우선. 전멸/고위험까지.",
    route(c) {
      if (c.size < 4 && c.choices.includes("ally")) return "ally"; // 파티 빌드는 함
      if (c.hp < 0.3 && c.choices.includes("rest")) return "rest"; // 절박할 때만 정비
      // 보스는 미룬다 — 끝까지 욕심.
      return orderPick(c.choices, ["danger", "elite", "normal", "bond", "rest"]) || c.choices.find((x) => x !== "boss") || c.choices[0];
    },
  },
};
const EXPEDITION_ORDER = ["bossRush", "oneLoot", "collector", "greed"];

/* ── lootProxy 분류 키(나중에 Extraction Loot Layer와 연결하기 좋은 형태) ── */
const LOOT_TYPES = ["dangerRoute", "elite", "bossKey", "deepReward", "discovery", "postBossReadyGreed"];
const LOOT_TYPE_LABELS = { dangerRoute: "깊은 수풀 생존", elite: "정예 생존", bossKey: "보스 열쇠", deepReward: "심층 보상", discovery: "발견(심도밴드)", postBossReadyGreed: "보스문 후 욕심" };

/* ════════════════════════════════════════════════════════════════
   상세 드라이버 — 1런을 lootProxy 집계 + 조합/역할 캡처와 함께 구동.
   ════════════════════════════════════════════════════════════════ */
const MAX_DECISIONS = 600, MAX_BATTLES = 90;
const ROUTE_TOKEN = { normal: "N", danger: "D", elite: "E", boss: "BOSS", ally: "ALLY", bond: "BOND", rest: "REST" };

function playExpedition(profile, runIndex, seed) {
  const loot = { dangerRoute: 0, elite: 0, bossKey: 0, deepReward: 0, discovery: 0, postBossReadyGreed: 0 };
  const rec = {
    runIndex, seed, profile: profile.id, result: null,
    clearDepth: 0, deathDepth: 0, finalDepth: 0, bossAttemptDepth: 0, bossReadyDepth: 0,
    battleCount: 0, fusionCount: 0, recruitCount: 0, faintCount: 0, bossAttempted: false,
    loot, lootProxyTotal: 0, lootDeep21: 0, lootDeep30: 0,
    lootAtBossReady: null, lootAtClear: null, lootAtDeath: null,
    postBossReadyDepth: 0,
    jobsSeen: new Set(), finalParty: [], bossParty: [], deathParty: [],
    rewardsTaken: new Set(), deepRewardsTaken: new Set(),
    path: [], notableEvents: [],
    hpAtDeath: null, partySizeAtDeath: null, alertnessAtDeath: 0, routeBeforeWipe: "",
  };
  let pendingRoute = "normal", lootTotal = 0, sinceFusion = null;
  let bossReadyReached = false, prevBossKeys = 0, lastBandId = 0;
  const note = (s) => { if (rec.notableEvents.length < 14) rec.notableEvents.push(s); };
  const treasure = () => loot.dangerRoute + loot.elite + loot.deepReward; // 의도적 전리품(discovery 제외)
  const bumpBand = (depth) => { const b = depthBand(depth).id; if (b > lastBandId) { const inc = b - lastBandId; loot.discovery += inc; lootTotal += inc; lastBandId = b; } };

  startRun(profile.startFormation ? profile.startFormation() : baseStartFormation());
  bumpBand(gameState.run.depth || 1);
  let decisions = 0;
  while (true) {
    const depth = gameState.run.depth || 0;
    if (gameState.run.result === "clear") { rec.result = "clear"; rec.clearDepth = depth; rec.lootAtClear = lootTotal; rec.path.push("CLEAR"); note(`심도 ${depth} 사자왕 격파 — 귀환(전리품 ${lootTotal})`); break; }
    if (gameState.run.result === "defeat") {
      rec.result = "defeat"; rec.deathDepth = depth; rec.lootAtDeath = lootTotal; rec.path.push("WIPE");
      rec.hpAtDeath = partyHpRatio(); rec.partySizeAtDeath = curPartySize(); rec.alertnessAtDeath = gameState.run.alertness || 0;
      rec.routeBeforeWipe = rec.path[rec.path.length - 2] || "";
      rec.deathParty = SLOT_ORDER.map((k) => (gameState.run.formation || {})[k]).filter(Boolean);
      note(`심도 ${depth} 전멸 — 파티 ${rec.partySizeAtDeath}인 · 전리품 ${lootTotal}`);
      if (bossReadyReached && !rec.bossAttempted) note(`⚠ 심도 ${rec.bossReadyDepth}에서 보스문이 열렸으나 ${depth - rec.bossReadyDepth}심도 더 욕심내다 전멸 — "거기서 나왔어야"`);
      break;
    }
    if (++decisions > MAX_DECISIONS || rec.battleCount > MAX_BATTLES) { rec.result = "incomplete"; rec.path.push("CAP"); break; }

    const screen = gameState.screen;
    if (screen === "battle") {
      partyJobIds().forEach((j) => rec.jobsSeen.add(j));
      const route = pendingRoute, wasBossReady = bossReadyReached;
      const keysBefore = gameState.run.bossKeys || 0;
      rec.battleCount += 1; rec.path.push(ROUTE_TOKEN[route] || "B");
      const ok = runHeadlessBattle();
      if (!ok) { rec.result = "incomplete"; rec.path.push("TIMEOUT"); break; }
      const res = gameState.run.result === "defeat" ? "wipe" : (gameState.run.result === "clear" ? "clear" : "win");
      const deadNow = gameState.party.filter((u) => u.isDead).length;
      if (res !== "wipe") {
        rec.faintCount += deadNow;
        // ── lootProxy 집계(생존한 전투에서만) ──
        if (route === "danger") { loot.dangerRoute += 1; lootTotal += 1; note(`심도 ${depth} 깊은 수풀 생존(+전리품)`); }
        if (route === "elite") { loot.elite += 1; lootTotal += 1; }
        const keysAfter = gameState.run.bossKeys || 0;
        if (keysAfter > keysBefore) {
          const d = keysAfter - keysBefore; loot.bossKey += d; lootTotal += d;
          if (!bossReadyReached && keysAfter >= BOSS_MENACE.keysToSeal) {
            bossReadyReached = true; rec.bossReadyDepth = depth; rec.lootAtBossReady = lootTotal;
            note(`심도 ${depth} 보스문 개방(열쇠 ${keysAfter}) — 전리품 ${lootTotal}`);
          }
        }
        if (wasBossReady && route !== "boss") { loot.postBossReadyGreed += 1; lootTotal += 1; }
      }
      prevBossKeys = gameState.run.bossKeys || 0;
      sinceFusion = sinceFusion == null ? null : sinceFusion + 1;
    } else if (screen === "reward") {
      const offer = gameState.run.rewardOffer || []; if (!offer.length) { rec.result = "incomplete"; break; }
      const beforeDeep = gameState.run.deepRewardTaken || 0;
      const id = profile.pickReward ? profile.pickReward(offer) : basePickReward(offer);
      const isDeep = !!deepRewardById(id);
      applyReward(id);
      const afterDeep = gameState.run.deepRewardTaken || 0;
      if (afterDeep > beforeDeep) {
        const d = afterDeep - beforeDeep; loot.deepReward += d; lootTotal += d;
        rec.deepRewardsTaken.add(id);
        if (depth >= 30) rec.lootDeep30 += d; else if (depth >= 21) rec.lootDeep21 += d;
        note(`심도 ${depth} 심층 보상 — ${jobNameSafeDeep(id)}`);
      } else if (!isDeep) rec.rewardsTaken.add(id);
    } else if (screen === "fusion") {
      const options = availableFusions(partyJobIds());
      const choiceId = options.length ? (profile.decideFusion ? profile.decideFusion(options) : baseDecideFusion(options)) : null;
      if (choiceId) { rec.fusionCount += 1; sinceFusion = 0; applyFusion(choiceId); rec.jobsSeen.add(choiceId); }
      else skipFusion();
    } else if (screen === "fusionResult") { continueAfterFusion(); }
    else if (screen === "recruit") {
      const offer = gameState.run.recruitOffer || [];
      if (offer.length) { const jobId = profile.pickRecruit ? profile.pickRecruit(offer) : basePickRecruit(offer); if (jobId) { previewRecruit(jobId); rec.recruitCount += 1; rec.jobsSeen.add(jobId); } }
      confirmRecruit();
    } else if (screen === "arrange") { confirmArrange(); }
    else if (screen === "route") {
      const choices = gameState.run.routeChoices || ["normal"];
      const ctx = {
        choices, depth, size: curPartySize(), hp: partyHpRatio(), bossKeys: gameState.run.bossKeys || 0,
        bossReadyDoor: choices.includes("boss"), loot: lootTotal, treasure: treasure(),
        sinceBossReady: bossReadyReached ? depth - rec.bossReadyDepth : null,
      };
      let rt = profile.route(ctx);
      if (!choices.includes(rt)) rt = choices[0];
      if (rt === "boss") { rec.bossAttempted = true; if (!rec.bossAttemptDepth) rec.bossAttemptDepth = depth; rec.bossParty = partyJobIds().slice(); note(`심도 ${depth} 보스 도전 — 파티 ${ctx.size}인 · 전리품 ${lootTotal}`); }
      pendingRoute = rt; chooseRoute(rt);
    } else if (screen === "rest") { rec.path.push("REST"); continueFromRest(); }
    else { rec.result = "incomplete"; break; }
  }

  // ── 마무리 집계 ──
  rec.finalDepth = gameState.run.depth || 0;
  rec.finalParty = SLOT_ORDER.map((k) => (gameState.run.formation || {})[k]).filter(Boolean);
  rec.finalParty.forEach((j) => rec.jobsSeen.add(j));
  rec.finalPartySize = rec.finalParty.length;
  rec.bossKeysFinal = gameState.run.bossKeys || 0;
  rec.fusionCountFinal = gameState.run.fusionCount || 0;
  rec.lootProxyTotal = lootTotal;
  rec.lootProxyByType = { ...loot };
  rec.treasureTotal = treasure();
  rec.roleTags = roleTagsOf(rec.finalParty);
  rec.bossRoleTags = roleTagsOf(rec.bossParty);
  rec.deathRoleTags = roleTagsOf(rec.deathParty);
  rec.gotSecondClass = [...rec.jobsSeen].some(isSecond);
  rec.cleared = rec.result === "clear";
  rec.wiped = rec.result === "defeat";
  if (bossReadyReached) rec.postBossReadyDepth = Math.max(0, rec.finalDepth - rec.bossReadyDepth);
  rec.bossReadyReached = bossReadyReached;
  rec.pathSignature = rec.path.join(">");
  rec.jobsSeenList = [...rec.jobsSeen];
  return rec;
}
function jobNameSafeDeep(id) { const d = deepRewardById(id); return d ? d.name : id; }

/* ════════════════════════════════════════════════════════════════
   배치 실행 — 4 프로필을 같은 seed(공유 RNG)로 주회(공정 A/B). 헤드리스 + 상태 복구.
   ════════════════════════════════════════════════════════════════ */
const yieldUI = () => new Promise((r) => setTimeout(r, 0));
export async function runExpeditionAll({ seed, runs, onProgress }) {
  const useSeed = seed != null && !Number.isNaN(seed);
  const snap = snapshotState();
  const profiles = {};
  try {
    setHeadlessRun(true);
    if (gameState.dev) gameState.dev.immortal = false;
    for (const id of EXPEDITION_ORDER) {
      if (useSeed) installSeed(seed); // 같은 seed에서 출발(프로필 간 공정 비교)
      const out = [];
      for (let i = 0; i < runs; i++) {
        out.push(playExpedition(EXPEDITIONS[id], i, useSeed ? seed : 0));
        if (i % 40 === 39) { if (onProgress) onProgress(id, i + 1); await yieldUI(); }
      }
      if (useSeed) restoreRandom();
      profiles[id] = out;
      if (onProgress) onProgress(id, runs, true);
      await yieldUI();
    }
  } finally { setHeadlessRun(false); restoreRandom(); restoreState(snap); }
  return profiles;
}

/* ════════════════════════════════════════════════════════════════
   집계 — 프로필 요약 / 조합 TOP / 역할 태그 / depth band / seat value / effect value.
   ════════════════════════════════════════════════════════════════ */
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const rate = (n, d) => (d ? n / d : null);
const max = (arr) => (arr.length ? Math.max(...arr) : null);

function profileSummary(runs) {
  const n = runs.length;
  const clears = runs.filter((r) => r.cleared);
  const wipes = runs.filter((r) => r.wiped);
  const bossAtt = runs.filter((r) => r.bossAttempted);
  const bossReady = runs.filter((r) => r.bossReadyReached);
  return {
    runs: n,
    winRate: rate(clears.length, n), wipeRate: rate(wipes.length, n),
    avgClearDepth: mean(clears.map((r) => r.clearDepth)),
    avgDeathDepth: mean(wipes.map((r) => r.deathDepth)),
    avgFinalDepth: mean(runs.map((r) => r.finalDepth)),
    avgBossAttemptDepth: mean(bossAtt.map((r) => r.bossAttemptDepth)),
    bossReadyRate: rate(bossReady.length, n),
    avgBossReadyDepth: mean(bossReady.map((r) => r.bossReadyDepth)),
    avgBattles: mean(runs.map((r) => r.battleCount)),
    avgLootProxy: mean(runs.map((r) => r.lootProxyTotal)),
    maxLootProxy: max(runs.map((r) => r.lootProxyTotal)),
    avgTreasure: mean(runs.map((r) => r.treasureTotal)),
    avgLootAtBossReady: mean(bossReady.map((r) => r.lootAtBossReady || 0)),
    avgLootAtClear: mean(clears.map((r) => r.lootAtClear || 0)),
    avgLootAtDeath: mean(wipes.map((r) => r.lootAtDeath || 0)),
    avgPostBossReadyDepth: mean(bossReady.map((r) => r.postBossReadyDepth)),
    lootByType: LOOT_TYPES.reduce((o, t) => { o[t] = mean(runs.map((r) => r.lootProxyByType[t] || 0)); return o; }, {}),
    // oneLoot 전용: 1전리품 후 보스 클리어 성공률
    oneLootBossClearRate: rate(runs.filter((r) => r.treasureTotal >= 1 && r.cleared).length, runs.filter((r) => r.treasureTotal >= 1).length || 0),
    // collector 전용: 회수량 대비 생존(전리품 3+ 런의 클리어율)
    highLootSurvivalRate: rate(runs.filter((r) => r.lootProxyTotal >= 3 && r.cleared).length, runs.filter((r) => r.lootProxyTotal >= 3).length || 0),
  };
}

// 조합 TOP — partyField(finalParty/bossParty/deathParty)의 직업 조합별 집계.
function comboTop(runs, partyField, { minCount = 2, top = 8 } = {}) {
  const map = new Map();
  runs.forEach((r) => {
    const jobs = r[partyField] || [];
    if (!jobs.length) return;
    const key = jobs.map(jobName).slice().sort().join(" · ");
    const e = map.get(key) || { key, count: 0, clears: 0, wipes: 0, depthSum: 0, lootSum: 0 };
    e.count += 1; if (r.cleared) e.clears += 1; if (r.wiped) e.wipes += 1; e.depthSum += r.finalDepth; e.lootSum += r.lootProxyTotal;
    map.set(key, e);
  });
  return [...map.values()].filter((e) => e.count >= minCount)
    .map((e) => ({ key: e.key, count: e.count, winRate: rate(e.clears, e.count), wipeRate: rate(e.wipes, e.count), avgDepth: e.depthSum / e.count, avgLoot: e.lootSum / e.count }))
    .sort((a, b) => b.count - a.count).slice(0, top);
}

// 역할 태그별 결과(보유/미보유 승률·평균심도·평균 전리품). field = roleTags / bossRoleTags / deathRoleTags.
function roleTagReport(runs, field = "roleTags") {
  return ROLE_TAG_ORDER.map((tag) => {
    const present = runs.filter((r) => r[field] && r[field][tag]);
    const absent = runs.filter((r) => !(r[field] && r[field][tag]));
    return {
      tag, label: ROLE_TAG_LABELS[tag],
      presentCount: present.length, absentCount: absent.length,
      presentWin: rate(present.filter((r) => r.cleared).length, present.length),
      absentWin: rate(absent.filter((r) => r.cleared).length, absent.length),
      presentDepth: mean(present.map((r) => r.finalDepth)), absentDepth: mean(absent.map((r) => r.finalDepth)),
      presentLoot: mean(present.map((r) => r.lootProxyTotal)), absentLoot: mean(absent.map((r) => r.lootProxyTotal)),
    };
  });
}

// depth band별 조합(1-10/11-20/21-30/31-40/41+) — 도달 심도 기준 대표 조합.
const PARTY_DEPTH_BANDS = [
  { id: "1-10", min: 1, max: 10 }, { id: "11-20", min: 11, max: 20 }, { id: "21-30", min: 21, max: 30 },
  { id: "31-40", min: 31, max: 40 }, { id: "41+", min: 41, max: Infinity },
];
function depthBandReport(runs) {
  return PARTY_DEPTH_BANDS.map((b) => {
    const inBand = runs.filter((r) => r.finalDepth >= b.min && r.finalDepth <= b.max);
    const top = comboTop(inBand, "finalParty", { minCount: 1, top: 3 });
    return { band: b.id, count: inBand.length, winRate: rate(inBand.filter((r) => r.cleared).length, inBand.length), topCombos: top };
  });
}

/* ── Job Seat Value — 직업별 보유(present=런 중 등장)/미보유 비교. 전 프로필 결합 풀 기준(표본 확보·stance 편향 완화). ── */
const ALL_JOBS = [...BASE_JOBS, ...ADVANCED_JOBS, ...SECOND_CLASS_JOBS];
function jobSeatValue(runs) {
  const n = runs.length;
  return ALL_JOBS.map((job) => {
    const present = runs.filter((r) => r.jobsSeen.has ? r.jobsSeen.has(job) : (r.jobsSeenList || []).includes(job));
    const absent = runs.filter((r) => !(r.jobsSeen.has ? r.jobsSeen.has(job) : (r.jobsSeenList || []).includes(job)));
    const finalHeld = runs.filter((r) => (r.finalParty || []).includes(job)).length;
    const bossHeld = runs.filter((r) => (r.bossParty || []).includes(job)).length;
    const clearHeld = runs.filter((r) => r.cleared && (r.finalParty || []).includes(job)).length;
    const deathHeld = runs.filter((r) => r.wiped && (r.deathParty || []).includes(job)).length;
    const pWin = rate(present.filter((r) => r.cleared).length, present.length);
    const aWin = rate(absent.filter((r) => r.cleared).length, absent.length);
    const pDepth = mean(present.map((r) => r.finalDepth)), aDepth = mean(absent.map((r) => r.finalDepth));
    const pLoot = mean(present.map((r) => r.lootProxyTotal)), aLoot = mean(absent.map((r) => r.lootProxyTotal));
    return {
      job, name: jobName(job), tier: tierOf(job), role: roleAr(job), roleLabel: combatRoleLabelOf(job) || "—",
      presentCount: present.length, absentCount: absent.length,
      finalHeld, bossHeld, clearHeld, deathHeld,
      presentWin: pWin, absentWin: aWin, presentDepth: pDepth, absentDepth: aDepth, presentLoot: pLoot, absentLoot: aLoot,
      seatWin: pWin != null && aWin != null ? pWin - aWin : null,
      seatDepth: pDepth != null && aDepth != null ? pDepth - aDepth : null,
      seatLoot: pLoot != null && aLoot != null ? pLoot - aLoot : null,
    };
  });
}
// 직접 비교(덫꾼 vs 도적 / 바드 vs 1차 딜러평균 / 무희 vs 2차 딜러평균 / 마도·현자 AoE / 힐 계열 / 탱커 계열).
const DEALER_FIRST = ["rogue", "warden", "watchbow", "mage", "tracker"];
const DEALER_SECOND = ["dragonspear", "skyarcher", "swordsaint"];
const HEAL_JOBS = ["priest", "saint", "healbow", "purifier", "redeemer"];
const TANK_JOBS = ["guardian", "gatekeeper", "paladin", "forbidden", "wall", "wardkeeper"];
function avgSeat(seatRows, jobs, key) { const xs = jobs.map((j) => seatRows.find((s) => s.job === j)).filter((s) => s && s[key] != null).map((s) => s[key]); return mean(xs); }
function seatComparisons(seatRows) {
  const get = (j) => seatRows.find((s) => s.job === j) || {};
  return {
    trapperVsRogue: { a: get("trapper"), b: get("rogue") },
    bardVsDealer: { a: get("bard"), avgSeatWin: avgSeat(seatRows, DEALER_FIRST, "seatWin"), avgSeatLoot: avgSeat(seatRows, DEALER_FIRST, "seatLoot"), avgSeatDepth: avgSeat(seatRows, DEALER_FIRST, "seatDepth") },
    dancerVsDealer: { a: get("dancer"), avgSeatWin: avgSeat(seatRows, DEALER_SECOND, "seatWin"), avgSeatLoot: avgSeat(seatRows, DEALER_SECOND, "seatLoot"), avgSeatDepth: avgSeat(seatRows, DEALER_SECOND, "seatDepth") },
    mageSage: { mage: get("mage"), sage: get("sage") },
    healAvg: { avgSeatWin: avgSeat(seatRows, HEAL_JOBS, "seatWin"), avgSeatLoot: avgSeat(seatRows, HEAL_JOBS, "seatLoot") },
    tankAvg: { avgSeatWin: avgSeat(seatRows, TANK_JOBS, "seatWin"), avgSeatDepth: avgSeat(seatRows, TANK_JOBS, "seatDepth") },
  };
}

/* ── Effect Value — 현재 효과 값 표(데이터에서 직접 읽음) + 선택/보유별 효율 지표. ── */
function effectValueTable() {
  const rows = [];
  // 성장 보상(공격력/HP/회복) — 현재 값을 그대로 읽는다.
  REWARDS.forEach((r) => {
    const statLabel = r.stat === "atk" ? "공격력" : r.stat === "maxHp" ? "최대 HP" : r.stat === "healRecv" ? "받는 치유량" : r.stat;
    const extra = r.extra ? ` (+${r.extra.value} ${r.extra.stat === "healRecv" ? "받는치유" : r.extra.stat})` : "";
    rows.push({ group: "성장 보상", name: r.name, id: r.id, target: r.target, value: `${statLabel} +${r.value}${extra}`, note: `런 중 최대 ${REWARD_MAX_LEVEL}회 선택` });
  });
  // 심층 보상(active) — 회복/보호막 값.
  activeDeepRewards().forEach((d) => {
    const v = d.apply && d.apply.kind === "heal" ? `현재HP +${d.apply.amount} 회복` : d.apply && d.apply.kind === "shield" ? `${d.apply.scope === "front" ? "전열" : "전원"} 보호막 ${Math.round(d.apply.pct * 100)}%(다음 전투 1회)` : "—";
    rows.push({ group: "심층 보상", name: d.name, id: d.id, target: d.apply ? d.apply.scope || "all" : "—", value: v, note: `심도 ${d.depthMin}+ 등장 · ${d.tag}` });
  });
  // 독/중독·버프·디버프·탱커·AoE 핵심 스킬 값(skills.js logic에서 발췌).
  const sk = (id, label, valFn, note) => { const s = SKILLS[id]; if (s) rows.push({ group: "스킬 효과", name: `${jobName(id)} · ${s.name}`, id, target: "—", value: valFn(s), note }); };
  sk("trapper", "중독", (s) => `중독 ${s.logic.count}명 / ${s.logic.duration}턴`, "독 표식(공격 시 치명 보정)");
  sk("plaguebringer", "감염", (s) => `감염 틱 ${s.logic.infectTick} / ${s.logic.infectTurns}턴 · 확산 최대 ${s.logic.maxInfected}`, "방어↓ " + Math.round(SKILLS.plaguebringer.logic.infectDefDown * 100) + "%");
  sk("dancer", "박자", (s) => `고양 atk +${Math.round(s.logic.exaltPct * 100)}% · 치명 +${Math.round(s.logic.critPct * 100)}% · 피날레 게이지 +${s.logic.finaleGauge}`, "서포터 버프");
  sk("bard", "리듬&템포", () => "완전 랜덤(아군 atk/치명 · 적 속도/게이지)", "값 고정 없음");
  sk("sunlord", "성역", (s) => `받는 피해 -${s.logic.auraFlat}(고정) / ${s.logic.auraTurns}턴`, "탱커/보호 오오라");
  sk("vanguard", "진군", (s) => `전열 AoE ×${s.logic.mult} (scope ${s.logic.scope})`, "광역딜");
  sk("mage", "마력집중", (s) => `전체 충전폭발 ×${s.logic.mult} (scope ${s.logic.scope})`, "광역딜(충전형)");
  sk("sage", "예지집중", (s) => `전체 ×${s.logic.mult} + 아군 ${s.logic.allyHaste.count}명 가속 ${Math.round(s.logic.allyHaste.pct * 100)}%`, "광역딜+가속");
  sk("wall", "선의 결속", (s) => `최저 아군 보호막 +${s.logic.shield}`, "보호막");
  sk("wardkeeper", "파티 결계", (s) => `피해 분산 완충 ${Math.round((1 - s.logic.bufferPct) * 100)}% 근사`, "보호/완충");
  return rows;
}
// 효과 선택/보유별 효율 지표 — 선택 런 vs 미선택 런(또는 보유 vs 미보유). 결합 풀 기준.
function effectDiagnostics(runs) {
  const sel = (pred) => { const a = runs.filter(pred); const b = runs.filter((r) => !pred(r)); return { selCount: a.length, notCount: b.length, selWin: rate(a.filter((r) => r.cleared).length, a.length), notWin: rate(b.filter((r) => r.cleared).length, b.length), selDepth: mean(a.map((r) => r.finalDepth)), notDepth: mean(b.map((r) => r.finalDepth)), selLoot: mean(a.map((r) => r.lootProxyTotal)), notLoot: mean(b.map((r) => r.lootProxyTotal)) }; };
  const tookAny = (r, ids) => ids.some((id) => r.rewardsTaken.has ? r.rewardsTaken.has(id) : (r.rewardsTakenList || []).includes(id));
  const hasRole = (r, tag) => r.roleTags && r.roleTags[tag];
  const took = (r, id) => r.deepRewardsTaken.has ? r.deepRewardsTaken.has(id) : (r.deepRewardsTakenList || []).includes(id);
  const out = [];
  out.push({ key: "attackUp", label: "공격력 증가 선택(공세/근접/원거리/후열)", ...sel((r) => tookAny(r, ["offense", "melee", "ranged", "backline"])) });
  out.push({ key: "hpUp", label: "HP 증가 선택(생존/전열/탱커/서포터/균형)", ...sel((r) => tookAny(r, ["survival", "frontline", "tank", "support", "balance"])) });
  out.push({ key: "healUp", label: "회복 증가 선택(회복/균형)", ...sel((r) => tookAny(r, ["recovery", "balance"])) });
  out.push({ key: "shieldDeep", label: "보호막 심층 보상 선택(응축된 성장/전열 다짐)", ...sel((r) => took(r, "condensed_growth") || took(r, "front_resolve")) });
  out.push({ key: "poison", label: "독/중독 보유(덫꾼/역병술사)", ...sel((r) => hasRole(r, "poison")) });
  out.push({ key: "aoe", label: "광역(AoE) 보유", ...sel((r) => hasRole(r, "aoe")) });
  out.push({ key: "healer", label: "힐러 보유", ...sel((r) => hasRole(r, "healer")) });
  out.push({ key: "support", label: "서포터 보유", ...sel((r) => hasRole(r, "support")) });
  out.push({ key: "tank", label: "탱커 보유", ...sel((r) => hasRole(r, "tank")) });
  out.push({ key: "shield", label: "보호막 직업 보유", ...sel((r) => hasRole(r, "shield")) });
  // 효율 태그(자동 수치 변경/단정 금지 — "낮아/높아 보이는 후보" 표시만).
  out.forEach((e) => {
    if (e.selWin == null || e.notWin == null || e.selCount < 10 || e.notCount < 10) { e.tag = "표본부족"; return; }
    const d = e.selWin - e.notWin;
    e.delta = d;
    e.tag = d >= 0.05 ? "높아 보임" : d <= 0.0 ? "낮아 보임" : "보통";
  });
  return out;
}

/* ── 대표 샘플 런 ── */
function sampleRuns(combined) {
  const clears = combined.filter((r) => r.cleared);
  const pickMin = (arr, f) => arr.slice().sort((a, b) => f(a) - f(b))[0] || null;
  const pickMax = (arr, f) => arr.slice().sort((a, b) => f(b) - f(a))[0] || null;
  const shortestReturn = pickMin(clears, (r) => r.clearDepth);
  const oneLootClear = pickMin(clears.filter((r) => r.treasureTotal >= 1), (r) => Math.abs(r.treasureTotal - 1) * 100 + r.clearDepth);
  const collectorClear = pickMax(clears, (r) => r.lootProxyTotal);
  const greedWipe = pickMax(combined.filter((r) => r.wiped && r.bossReadyReached), (r) => r.postBossReadyDepth);
  return [
    { label: "최단 귀환 성공", rec: shortestReturn },
    { label: "1전리품 귀환 성공", rec: oneLootClear },
    { label: "많이 회수하고 귀환 성공", rec: collectorClear },
    { label: "욕심내다 실패", rec: greedWipe || pickMax(combined.filter((r) => r.wiped), (r) => r.lootProxyTotal) },
  ];
}

/* ── 전체 리포트 빌드 ── */
function buildReport(profiles, meta) {
  const combined = EXPEDITION_ORDER.flatMap((id) => profiles[id]);
  const seat = jobSeatValue(combined);
  return {
    meta, profiles,
    summaries: EXPEDITION_ORDER.reduce((o, id) => { o[id] = profileSummary(profiles[id]); return o; }, {}),
    combined,
    seat, seatComparisons: seatComparisons(seat),
    effectTable: effectValueTable(), effectDiag: effectDiagnostics(combined),
    samples: sampleRuns(combined),
  };
}

/* ════════════════════════════════════════════════════════════════
   UI
   ════════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
let lastReport = null;

function delta(v) { if (v == null) return ""; const cls = v > 0.0005 ? "up" : v < -0.0005 ? "down" : "zero"; const sign = v > 0 ? "+" : ""; return `<span class="eo-d ${cls}">${sign}${fmt1(v)}</span>`; }
function deltaPct(v) { if (v == null) return ""; const cls = v > 0.0005 ? "up" : v < -0.0005 ? "down" : "zero"; const sign = v > 0 ? "+" : ""; return `<span class="eo-d ${cls}">${sign}${(Math.round(v * 1000) / 10).toFixed(1)}%p</span>`; }

function renderSummary(rep) {
  const head = EXPEDITION_ORDER.map((id) => `<th>${esc(EXPEDITIONS[id].label)}<div class="eo-sub">${esc(EXPEDITIONS[id].sub)}</div></th>`).join("");
  const row = (label, fn, fmt) => `<tr><td class="txt">${label}</td>${EXPEDITION_ORDER.map((id) => `<td>${fmt(fn(rep.summaries[id]))}</td>`).join("")}</tr>`;
  const lootRows = LOOT_TYPES.map((t) => `<tr><td class="txt eo-indent">· ${ROLE_TAG_LABELS_FALLBACK(t)}</td>${EXPEDITION_ORDER.map((id) => `<td>${fmt1(rep.summaries[id].lootByType[t])}</td>`).join("")}</tr>`).join("");
  $("eo-summary").innerHTML = `<h3>A. Expedition Summary <span class="eo-meta">· seed ${rep.meta.seed} · 프로필당 ${rep.meta.runs}런</span></h3>
    <div class="eo-cards">${EXPEDITION_ORDER.map((id) => { const s = rep.summaries[id]; const c = EXPEDITIONS[id]; return `<div class="eo-card" style="border-top:3px solid ${c.color}"><div class="eo-cn">${esc(c.label)}</div><div class="eo-cd">${esc(c.desc)}</div><div class="eo-crow"><span>승률</span><b class="${(s.winRate || 0) > 0 ? "clear" : ""}">${fmtPct(s.winRate)}</b></div><div class="eo-crow"><span>전멸률</span><b class="wipe">${fmtPct(s.wipeRate)}</b></div><div class="eo-crow"><span>평균 전리품</span><b>${fmt1(s.avgLootProxy)}</b></div></div>`; }).join("")}</div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">지표</th>${head}</tr></thead><tbody>
      ${row("승률(귀환 성공)", (s) => s.winRate, fmtPct)}
      ${row("전멸률", (s) => s.wipeRate, fmtPct)}
      ${row("보스문 개방률", (s) => s.bossReadyRate, fmtPct)}
      ${row("평균 클리어 심도", (s) => s.avgClearDepth, fmt1)}
      ${row("평균 보스 시도 심도", (s) => s.avgBossAttemptDepth, fmt1)}
      ${row("평균 전멸 심도", (s) => s.avgDeathDepth, fmt1)}
      ${row("평균 도달 심도", (s) => s.avgFinalDepth, fmt1)}
      ${row("평균 전투 수", (s) => s.avgBattles, fmt1)}
      ${row("평균 lootProxy", (s) => s.avgLootProxy, fmt1)}
      ${row("최대 lootProxy", (s) => s.maxLootProxy, (v) => v == null ? "—" : v)}
      ${row("평균 전리품(의도적)", (s) => s.avgTreasure, fmt1)}
      ${row("보스문 시점 lootProxy", (s) => s.avgLootAtBossReady, fmt1)}
      ${row("클리어 시점 lootProxy", (s) => s.avgLootAtClear, fmt1)}
      ${row("전멸 시점 lootProxy", (s) => s.avgLootAtDeath, fmt1)}
      ${row("보스문 후 추가 심도", (s) => s.avgPostBossReadyDepth, fmt1)}
      ${row("1전리품 후 보스 클리어율", (s) => s.oneLootBossClearRate, fmtPct)}
      ${row("회수3+ 런 생존율", (s) => s.highLootSurvivalRate, fmtPct)}
      <tr class="eo-grouprow"><td class="txt" colspan="${EXPEDITION_ORDER.length + 1}">lootProxy 평균 분해(byType)</td></tr>
      ${lootRows}
    </tbody></table></div>`;
}
function ROLE_TAG_LABELS_FALLBACK(t) { return LOOT_TYPE_LABELS[t] || t; }

function comboTable(title, rows) {
  if (!rows.length) return `<div class="eo-line"><b>${title}</b> <span class="eo-meta">— 표본 없음</span></div>`;
  return `<div class="eo-line"><b>${title}</b></div><div class="eo-tablewrap"><table><thead><tr><th class="txt">조합</th><th>런</th><th>승률</th><th>전멸률</th><th>평균심도</th><th>평균전리품</th></tr></thead><tbody>${rows.map((e) => `<tr><td class="txt">${esc(e.key)}</td><td>${e.count}</td><td class="${(e.winRate || 0) > 0 ? "clear" : ""}">${fmtPct(e.winRate)}</td><td class="wipe">${fmtPct(e.wipeRate)}</td><td>${fmt1(e.avgDepth)}</td><td>${fmt1(e.avgLoot)}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderParty(rep) {
  const combined = rep.combined;
  const succ = combined.filter((r) => r.cleared);
  const fail = combined.filter((r) => r.wiped);
  const rt = roleTagReport(combined, "roleTags");
  const bandRep = depthBandReport(combined);
  $("eo-party").innerHTML = `<h3>B. Party Result <span class="eo-meta">· 전 프로필 결합 ${combined.length}런</span></h3>
    ${comboTable("성공(귀환) 조합 TOP — 최종 파티", comboTop(succ, "finalParty", { minCount: 2 }))}
    ${comboTable("실패(전멸) 조합 TOP — 전멸 파티", comboTop(fail, "deathParty", { minCount: 2 }))}
    ${comboTable("보스 시도 조합 TOP — 보스 파티", comboTop(combined.filter((r) => r.bossAttempted), "bossParty", { minCount: 2 }))}
    <div class="eo-line"><b>역할 태그별 결과(최종 파티 보유 여부)</b></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">역할</th><th>보유런</th><th>보유 승률</th><th>미보유 승률</th><th>Δ승률</th><th>보유 평균심도</th><th>보유 평균전리품</th></tr></thead><tbody>
      ${rt.map((e) => `<tr><td class="txt">${e.label}</td><td>${e.presentCount}</td><td class="${(e.presentWin || 0) > 0 ? "clear" : ""}">${fmtPct(e.presentWin)}</td><td>${fmtPct(e.absentWin)}</td><td>${deltaPct(e.presentWin != null && e.absentWin != null ? e.presentWin - e.absentWin : null)}</td><td>${fmt1(e.presentDepth)}</td><td>${fmt1(e.presentLoot)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="eo-line"><b>depth band별 대표 조합(도달 심도)</b></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">밴드</th><th>런</th><th>승률</th><th class="txt">대표 조합(최종 파티)</th></tr></thead><tbody>
      ${bandRep.map((b) => `<tr><td class="txt">${b.band}</td><td>${b.count}</td><td>${fmtPct(b.winRate)}</td><td class="txt">${b.topCombos.map((c) => `${esc(c.key)} <span class="eo-meta">(${c.count}·${fmtPct(c.winRate)})</span>`).join("<br>") || "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function seatRowHtml(s, highlight) {
  return `<tr class="${highlight ? "eo-hl" : ""}"><td class="txt">${esc(s.name)} <span class="eo-meta">${s.tier}·${esc(s.roleLabel)}</span></td><td>${s.presentCount}</td><td>${s.finalHeld}</td><td>${s.bossHeld}</td><td>${s.clearHeld}</td><td>${s.deathHeld}</td><td class="${(s.presentWin || 0) > 0 ? "clear" : ""}">${fmtPct(s.presentWin)}</td><td>${fmtPct(s.absentWin)}</td><td>${deltaPct(s.seatWin)}</td><td>${fmt1(s.presentDepth)}</td><td>${delta(s.seatDepth)}</td><td>${fmt1(s.presentLoot)}</td><td>${delta(s.seatLoot)}</td></tr>`;
}
function renderSeat(rep) {
  const seat = rep.seat.slice().sort((a, b) => (b.presentCount - a.presentCount));
  const HL = new Set(["trapper", "rogue", "bard", "dancer"]);
  const cmp = rep.seatComparisons;
  const cmpRow = (label, a, b, bLabel) => `<tr><td class="txt">${label}</td><td>${fmtPct(a.presentWin)}</td><td>${deltaPct(a.seatWin)}</td><td>${fmt1(a.presentLoot)}</td><td>${delta(a.seatLoot)}</td><td class="txt eo-meta">${bLabel}</td></tr>`;
  $("eo-seat").innerHTML = `<h3>C. Job Seat Value <span class="eo-meta">· 결합 ${rep.combined.length}런 · 보유=런 중 등장</span></h3>
    <div class="eo-note">"이 직업을 한 자리 넣을 이유가 있나?" — 보유(present)=런 중 파티에 등장. Seat Value = 보유−미보유 차이(승률 Δ%p / 심도 Δ / 전리품 Δ). 통계 모델 아님(판단 보조).</div>
    <div class="eo-line"><b>직접 비교 — 덫꾼 vs 도적 / 바드·무희 seat value</b></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">대상</th><th>보유 승률</th><th>Δ승률</th><th>보유 전리품</th><th>Δ전리품</th><th class="txt">비교군</th></tr></thead><tbody>
      ${cmpRow("덫꾼(독)", cmp.trapperVsRogue.a, cmp.trapperVsRogue.b, `도적 Δ승률 ${deltaPctText(cmp.trapperVsRogue.b.seatWin)} · 도적 보유승률 ${fmtPct(cmp.trapperVsRogue.b.presentWin)}`)}
      ${cmpRow("도적", cmp.trapperVsRogue.b, cmp.trapperVsRogue.a, `덫꾼 Δ승률 ${deltaPctText(cmp.trapperVsRogue.a.seatWin)}`)}
      ${cmpRow("바드", cmp.bardVsDealer.a, cmp.bardVsDealer.a, `1차 딜러 평균 Seat Δ승률 ${deltaPctText(cmp.bardVsDealer.avgSeatWin)} · Δ전리품 ${fmt1(cmp.bardVsDealer.avgSeatLoot)}`)}
      ${cmpRow("무희", cmp.dancerVsDealer.a, cmp.dancerVsDealer.a, `2차 딜러 평균 Seat Δ승률 ${deltaPctText(cmp.dancerVsDealer.avgSeatWin)} · Δ전리품 ${fmt1(cmp.dancerVsDealer.avgSeatLoot)}`)}
      ${cmpRow("마도(AoE)", cmp.mageSage.mage, cmp.mageSage.mage, `현자 Seat Δ승률 ${deltaPctText(cmp.mageSage.sage.seatWin)}`)}
    </tbody></table></div>
    <div class="eo-line"><b>전 직업 Seat Value</b> <span class="eo-meta">(덫꾼/도적/바드/무희 강조)</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">직업</th><th>보유런</th><th>최종</th><th>보스</th><th>클리어</th><th>전멸</th><th>보유승률</th><th>미보유</th><th>Δ승률</th><th>보유심도</th><th>Δ심도</th><th>보유전리품</th><th>Δ전리품</th></tr></thead><tbody>
      ${seat.map((s) => seatRowHtml(s, HL.has(s.job))).join("")}
    </tbody></table></div>`;
}
function deltaPctText(v) { return v == null ? "—" : (v > 0 ? "+" : "") + (Math.round(v * 1000) / 10).toFixed(1) + "%p"; }

function renderEffect(rep) {
  const tbl = rep.effectTable;
  const groups = ["성장 보상", "심층 보상", "스킬 효과"];
  const diag = rep.effectDiag;
  $("eo-effect").innerHTML = `<h3>D. Effect Value <span class="eo-meta">· 현재 효과 값(데이터 직접 읽음) + 선택/보유별 효율</span></h3>
    <div class="eo-note">현재 값을 "읽어서 보여주는" 표 + 관측 지표. 이번 1차는 값을 바꾸지 않는다. 효율 태그는 "낮아/높아 보이는 후보"일 뿐 — 자동 수치 변경/밸런스 단정 아님.</div>
    ${groups.map((g) => `<div class="eo-line"><b>${g}</b></div><div class="eo-tablewrap"><table><thead><tr><th class="txt">효과</th><th class="txt">대상</th><th class="txt">현재 값</th><th class="txt">비고</th></tr></thead><tbody>${tbl.filter((r) => r.group === g).map((r) => `<tr><td class="txt">${esc(r.name)}</td><td class="txt">${esc(r.target)}</td><td class="txt eo-val">${esc(r.value)}</td><td class="txt eo-meta">${esc(r.note)}</td></tr>`).join("")}</tbody></table></div>`).join("")}
    <div class="eo-line"><b>효과 선택/보유별 효율 지표</b> <span class="eo-meta">(선택/보유 런 vs 미선택/미보유 런 · 결합 ${rep.combined.length}런)</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">효과</th><th>선택/보유</th><th>미선택</th><th>선택 승률</th><th>미선택 승률</th><th>Δ승률</th><th>선택 전리품</th><th>선택 심도</th><th>태그</th></tr></thead><tbody>
      ${diag.map((e) => `<tr><td class="txt">${esc(e.label)}</td><td>${e.selCount}</td><td>${e.notCount}</td><td class="${(e.selWin || 0) > 0 ? "clear" : ""}">${fmtPct(e.selWin)}</td><td>${fmtPct(e.notWin)}</td><td>${deltaPct(e.selWin != null && e.notWin != null ? e.selWin - e.notWin : null)}</td><td>${fmt1(e.selLoot)}</td><td>${fmt1(e.selDepth)}</td><td><span class="eo-tag ${e.tag === "높아 보임" ? "hi" : e.tag === "낮아 보임" ? "lo" : ""}">${esc(e.tag || "—")}</span></td></tr>`).join("")}
    </tbody></table></div>`;
}

function renderSamples(rep) {
  const card = (label, rec) => {
    if (!rec) return `<div class="eo-scard"><div class="eo-sl">${esc(label)}</div><div class="eo-meta">해당 샘플 없음</div></div>`;
    const prof = EXPEDITIONS[rec.profile];
    const tl = rec.path.join(" › ");
    return `<div class="eo-scard"><div class="eo-sl">${esc(label)} <span class="eo-tag">${esc(prof.label)}</span></div>
      <div class="eo-srow"><span>결과</span><b class="${rec.cleared ? "clear" : rec.wiped ? "wipe" : ""}">${rec.cleared ? "귀환 성공" : rec.wiped ? "전멸" : "미완"}</b> <span>seed</span><b>${rec.seed}#${rec.runIndex}</b></div>
      <div class="eo-srow"><span>클리어/전멸 심도</span><b>${rec.cleared ? rec.clearDepth : rec.deathDepth}</b> <span>lootProxy</span><b>${rec.lootProxyTotal}</b> <span>보스문</span><b>${rec.bossReadyReached ? "심도 " + rec.bossReadyDepth : "미개방"}</b></div>
      <div class="eo-sline"><b>최종 파티:</b> ${rec.finalParty.map(jobName).map(esc).join(" · ") || "—"}</div>
      <div class="eo-sline"><b>route:</b> <code>${esc(tl)}</code></div>
      <div class="eo-sline"><b>notable:</b> ${rec.notableEvents.map(esc).map((s) => `<div class="eo-ev">${s}</div>`).join("") || "—"}</div></div>`;
  };
  $("eo-samples").innerHTML = `<h3>E. Run Samples</h3>${rep.samples.map((s) => card(s.label, s.rec)).join("")}`;
}

function renderAll(rep) { renderSummary(rep); renderParty(rep); renderSeat(rep); renderEffect(rep); renderSamples(rep); }

/* ── Export ── */
function buildRunsForExport(combined) {
  return combined.map((r) => ({
    profileName: EXPEDITIONS[r.profile].label, profile: r.profile, seed: r.seed, runIndex: r.runIndex, result: r.result,
    clearDepth: r.clearDepth, deathDepth: r.deathDepth, finalDepth: r.finalDepth, bossAttemptDepth: r.bossAttemptDepth, bossReadyDepth: r.bossReadyDepth,
    lootProxyTotal: r.lootProxyTotal, lootProxyByType: r.lootProxyByType, treasureTotal: r.treasureTotal,
    lootAtBossReady: r.lootAtBossReady, lootAtClear: r.lootAtClear, lootAtDeath: r.lootAtDeath, postBossReadyDepth: r.postBossReadyDepth,
    finalParty: r.finalParty.map(jobName), bossParty: r.bossParty.map(jobName), deathParty: r.deathParty.map(jobName),
    roleTags: Object.keys(r.roleTags).filter((k) => r.roleTags[k]),
    rewardsTaken: [...r.rewardsTaken], deepRewardsTaken: [...r.deepRewardsTaken],
    notableEvents: r.notableEvents, pathSignature: r.pathSignature,
  }));
}
function exportJSON() {
  if (!lastReport) return "";
  const rep = lastReport;
  return JSON.stringify({
    metadata: { tool: "expedition-observatory-01", theme: "beginner", seed: rep.meta.seed, runsPerProfile: rep.meta.runs, profiles: EXPEDITION_ORDER, generatedAt: new Date().toISOString(),
      note: "lootProxy = dev-only 임시 지표(실제 전리품/유물 시스템 아님). 본게임 수치/저장 무영향." },
    summaries: rep.summaries,
    jobSeatValue: rep.seat.map((s) => ({ job: s.job, name: s.name, tier: s.tier, role: s.role, presentCount: s.presentCount, finalHeld: s.finalHeld, bossHeld: s.bossHeld, clearHeld: s.clearHeld, deathHeld: s.deathHeld, presentWin: s.presentWin, absentWin: s.absentWin, seatWin: s.seatWin, seatDepth: s.seatDepth, seatLoot: s.seatLoot })),
    seatComparisons: rep.seatComparisons,
    effectTable: rep.effectTable, effectDiagnostics: rep.effectDiag,
    samples: rep.samples.map((s) => s.rec ? { label: s.label, profile: s.rec.profile, seed: s.rec.seed, runIndex: s.rec.runIndex, result: s.rec.result, clearDepth: s.rec.clearDepth, deathDepth: s.rec.deathDepth, lootProxyTotal: s.rec.lootProxyTotal, finalParty: s.rec.finalParty.map(jobName), path: s.rec.path, notableEvents: s.rec.notableEvents } : { label: s.label, rec: null }),
    runs: buildRunsForExport(rep.combined),
  }, null, 0);
}
function exportTSV() {
  if (!lastReport) return "";
  const cols = ["profileName", "seed", "runIndex", "result", "clearDepth", "deathDepth", "bossAttemptDepth", "bossReadyDepth", "lootProxyTotal", ...LOOT_TYPES.map((t) => "loot_" + t), "treasureTotal", "postBossReadyDepth", "finalParty", "bossParty", "deathParty", "roleTags", "notableEvents"];
  const rows = lastReport.combined.map((r) => [
    EXPEDITIONS[r.profile].label, r.seed, r.runIndex, r.result, r.clearDepth, r.deathDepth, r.bossAttemptDepth, r.bossReadyDepth, r.lootProxyTotal,
    ...LOOT_TYPES.map((t) => r.lootProxyByType[t] || 0), r.treasureTotal, r.postBossReadyDepth,
    r.finalParty.map(jobName).join("+"), r.bossParty.map(jobName).join("+"), r.deathParty.map(jobName).join("+"),
    Object.keys(r.roleTags).filter((k) => r.roleTags[k]).join(","), r.notableEvents.join(" | "),
  ].join("\t"));
  return [cols.join("\t"), ...rows].join("\n");
}
function exportSummaryText() {
  if (!lastReport) return "";
  const rep = lastReport;
  const L = [];
  L.push(`[Expedition Observatory] seed ${rep.meta.seed} · 프로필당 ${rep.meta.runs}런`);
  EXPEDITION_ORDER.forEach((id) => { const s = rep.summaries[id]; const c = EXPEDITIONS[id]; L.push(`· ${c.label}(${c.sub}): 승률 ${fmtPct(s.winRate)} / 전멸 ${fmtPct(s.wipeRate)} / 평균전리품 ${fmt1(s.avgLootProxy)} / 평균클리어심도 ${fmt1(s.avgClearDepth)} / 보스문후 +${fmt1(s.avgPostBossReadyDepth)}심도`); });
  const seatHl = ["trapper", "rogue", "bard", "dancer"].map((j) => rep.seat.find((s) => s.job === j)).filter(Boolean);
  L.push("Seat Value(보유−미보유 Δ승률): " + seatHl.map((s) => `${s.name} ${deltaPctText(s.seatWin)}`).join(" / "));
  return L.join("\n");
}
async function copyOut(text, btn, label) { const done = (ok) => { if (btn) { btn.textContent = ok ? "복사됨!" : "복사 실패"; setTimeout(() => { btn.textContent = label; }, 1200); } }; try { await navigator.clipboard.writeText(text); done(true); } catch (e) { try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(true); } catch (e2) { done(false); } } }

/* ── 실행 ── */
let running = false;
async function runObservatory(runs) {
  if (running) return; running = true;
  const seedRaw = parseInt($("eo-seed").value, 10);
  const seed = Number.isNaN(seedRaw) ? 405 : seedRaw;
  const status = $("eo-status");
  status.textContent = `실행 중… (seed ${seed} · 프로필당 ${runs}런)`;
  $("eo-run100").disabled = $("eo-run300").disabled = true;
  try {
    const profiles = await runExpeditionAll({ seed, runs, onProgress: (id, done, complete) => { status.textContent = complete ? `${EXPEDITIONS[id].label} 완료…` : `${EXPEDITIONS[id].label} ${done}런…`; } });
    lastReport = buildReport(profiles, { seed, runs });
    renderAll(lastReport);
    status.textContent = `완료 — seed ${seed} · 프로필당 ${runs}런 · 결합 ${lastReport.combined.length}런`;
  } catch (e) {
    status.textContent = "에러: " + (e && e.message);
    console.error(e);
  } finally { $("eo-run100").disabled = $("eo-run300").disabled = false; running = false; }
}

export function initExpeditionObservatory() {
  $("eo-run100").addEventListener("click", () => runObservatory(100));
  $("eo-run300").addEventListener("click", () => runObservatory(300));
  $("eo-export-json").addEventListener("click", (e) => copyOut(exportJSON(), e.target, "JSON 복사"));
  $("eo-export-tsv").addEventListener("click", (e) => copyOut(exportTSV(), e.target, "TSV 복사"));
  $("eo-export-txt").addEventListener("click", (e) => copyOut(exportSummaryText(), e.target, "요약 복사"));
}
