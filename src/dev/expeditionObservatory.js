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
// Current Director Snapshot 01 — 현재 Forest Director encounter 생성을 read-only로 그대로 호출(순수·gameState 무변경).
import { createRouteEnemies, DEFAULT_FORMATION, partySizeOf } from "../core/state.js";
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
import { depthBand, BOSS_MENACE, BOSS_FLOOR } from "../data/routes.js";
// Current Director Snapshot 01 — 현재 depth/alertness/route → encounter pressure 생성 규칙(전부 read-only).
import {
  DEPTH_BANDS, directorCount, directorScale, directorRoles, eliteEscortCount, combatDirectorTag,
  ROUTE_TYPES, bossFury, bossReadinessPressure, bossMenace, effectiveAlertness, MAX_ALERTNESS, ROLE_ACTOR, depthScale,
  // Depth Band Director 01 — Forest Pressure Wave: 결정적 pressure band(파형) 표시 연동(read-only).
  pressureBand, PRESSURE_BANDS,
} from "../data/routes.js";

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

/* ════════════════════════════════════════════════════════════════
   Nara Sandbox — Stat Override (dev-only A/B 실험 장비, Phase 2B).
   ★원본 데이터(UNIT_TEMPLATES / 코어 상수)는 절대 mutate하지 않는다 — 읽기만.
     override는 "전투 진입 시점에 새로 생성된 per-battle 클론"(gameState.party/enemies)에만 적용한다.
     advanceStage가 매 전투 createInitialParty/createRouteEnemies로 인스턴스를 새로 만들므로(템플릿 fresh read),
     클론에 적용 → 다음 전투에서 다시 fresh → 누적/오염 없음. 배치 종료 시 restoreState가 클론을 통째로 되돌린다.
   ★두 레이어:
     · 절대 기본값 편집(absolute) — 영웅(party.*) + 일반 몹(enemies.* normal pool). 템플릿 기본값 대비 delta(영웅)/factor(몹)로 클론에 주입.
     · 배수(%) — 영웅전체/일반/정예/보스. 정예·보스는 코어 상수(RANK_OVERRIDES state.js / BOSS_FLOOR routes.js)가 기준이라
       템플릿 편집이 닿지 않음 → 배수로만 조정(전투 클론에 곱). 정직한 한계 표기.
   ★본게임/저장/route/스킬/합체/영입/보상 무변경. lootProxy와 동일하게 dev 임시 실험 — localStorage 무영향(헤드리스).
   ════════════════════════════════════════════════════════════════ */
const HERO_FIELDS = ["maxHp", "atk", "speed"];     // 실제 데이터에 존재하는 수치형 필드만(units.js)
const MONSTER_FIELDS = ["maxHp", "atk", "speed"];  // defense/damageReduction 등은 기본 필드로 존재하지 않음 — 신설 금지
const FIELD_LABEL = { maxHp: "HP", atk: "ATK", speed: "SPD" };
// 초보자 테마 "동물 연합" 일반 몹(템플릿 기준 편집 = 전투에 반영). 레거시 slime/goblin/wolf는 초보자 테마 미사용.
const NORMAL_MONSTERS = ["bear", "fox", "bird", "dewslime", "lamb"];
// 정예/보스 본체 type(표시·참조용). 이들의 실효 스탯은 코어 상수가 결정 → 배수로만.
const ELITE_TYPES = ["owl", "deer"];
const BOSS_TYPE = "lion";
const MULT_KEYS = ["heroAll", "monNormal", "monElite", "monBoss"];
const MULT_LABEL = { heroAll: "영웅 전체", monNormal: "일반 몹", monElite: "정예", monBoss: "보스(사자왕)" };
// 정예 코어 기준(state.js RANK_OVERRIDES.elite — export 안 됨이라 표시용 참조 상수). 보스는 BOSS_FLOOR import.
const ELITE_REF = { maxHp: 170, atk: 12, speed: 5 };

function emptyOverrides() {
  return {
    hero: {},      // { jobId: { maxHp?, atk?, speed? } } — 절대 기본값(템플릿 대비 delta로 클론 주입)
    monster: {},   // { type: { maxHp?, atk?, speed? } } — 일반 몹 절대 기본값(템플릿 대비 factor로 클론 주입)
    mult: { heroAll: { hp: 1, atk: 1 }, monNormal: { hp: 1, atk: 1 }, monElite: { hp: 1, atk: 1 }, monBoss: { hp: 1, atk: 1 } },
  };
}
// 영웅/몹 기본값(템플릿에서 직접 읽음 — 표시 + delta/factor 기준). 원본은 읽기만.
const heroBase = (jobId) => { const t = UNIT_TEMPLATES.party[jobId] || {}; return { maxHp: t.maxHp, atk: t.atk, speed: t.speed }; };
const monsterBase = (type) => { const t = UNIT_TEMPLATES.enemies[type] || {}; return { maxHp: t.maxHp, atk: t.atk, speed: t.speed }; };

const m1 = (v) => (v == null || v === 1 ? false : true); // 배수가 의미있게 설정됐는가
function hasActiveOverrides(ov) {
  if (!ov) return false;
  for (const j in ov.hero) for (const f of HERO_FIELDS) { const v = ov.hero[j][f]; if (v != null && v !== heroBase(j)[f]) return true; }
  for (const t in ov.monster) for (const f of MONSTER_FIELDS) { const v = ov.monster[t][f]; if (v != null && v !== monsterBase(t)[f]) return true; }
  for (const k of MULT_KEYS) { const m = ov.mult[k] || {}; if (m1(m.hp) || m1(m.atk)) return true; }
  return false;
}
// 사람이 읽는 override 요약(인디케이터/리포트용).
function describeOverrides(ov) {
  if (!ov) return [];
  const out = [];
  for (const j of Object.keys(ov.hero)) { const b = heroBase(j); HERO_FIELDS.forEach((f) => { const v = ov.hero[j][f]; if (v != null && v !== b[f]) out.push(`${jobName(j)} ${FIELD_LABEL[f]} ${b[f]}→${v}`); }); }
  for (const t of Object.keys(ov.monster)) { const b = monsterBase(t); const nm = (UNIT_TEMPLATES.enemies[t] && UNIT_TEMPLATES.enemies[t].name) || t; MONSTER_FIELDS.forEach((f) => { const v = ov.monster[t][f]; if (v != null && v !== b[f]) out.push(`${nm} ${FIELD_LABEL[f]} ${b[f]}→${v}`); }); }
  for (const k of MULT_KEYS) { const m = ov.mult[k] || {}; if (m1(m.hp)) out.push(`${MULT_LABEL[k]} HP ×${m.hp}`); if (m1(m.atk)) out.push(`${MULT_LABEL[k]} ATK ×${m.atk}`); }
  return out;
}

// ★override 적용 — 전투 진입 시점(playExpedition screen==="battle")에 호출. gameState의 per-battle 클론만 건드림.
//   영웅: 절대 기본값 = 템플릿 대비 delta(가산 모델 — 인스턴스 maxHp = 템플릿+성장). HP비율 보존. 그 뒤 배수.
//   몹: 절대 기본값 = 템플릿 대비 factor(곱셈 모델 — 인스턴스 = 템플릿×심도스케일). 그 뒤 tier 배수. 적은 항상 풀피로 스폰.
export function applyCombatOverrides(ov) {
  if (!ov) return;
  const hm = (ov.mult && ov.mult.heroAll) || null;
  (gameState.party || []).forEach((u) => {
    const tpl = u.jobId && UNIT_TEMPLATES.party[u.jobId];
    if (!tpl) return;
    const ratio = u.maxHp > 0 ? u.hp / u.maxHp : 1; // 이월된 HP 비율 보존
    const oh = (ov.hero && ov.hero[u.jobId]) || null;
    if (oh) {
      if (oh.maxHp != null) u.maxHp = Math.max(1, u.maxHp + (oh.maxHp - tpl.maxHp));
      if (oh.atk != null) u.atk = Math.max(1, u.atk + (oh.atk - tpl.atk));
      if (oh.speed != null) u.speed = Math.max(1, u.speed + (oh.speed - tpl.speed));
    }
    if (hm) {
      if (m1(hm.hp)) u.maxHp = Math.max(1, Math.round(u.maxHp * hm.hp));
      if (m1(hm.atk)) u.atk = Math.max(1, Math.round(u.atk * hm.atk));
    }
    u.hp = Math.max(1, Math.min(u.maxHp, Math.round(u.maxHp * ratio)));
  });
  (gameState.enemies || []).forEach((e) => {
    const tierKey = e.tier === "boss" ? "monBoss" : e.tier === "elite" ? "monElite" : "monNormal";
    if (tierKey === "monNormal") { // 일반 몹만 절대 기본값 편집(템플릿 대비 factor)
      const tpl = e.type && UNIT_TEMPLATES.enemies[e.type];
      const om = (ov.monster && ov.monster[e.type]) || null;
      if (tpl && om) {
        if (om.maxHp != null && tpl.maxHp) e.maxHp = Math.max(1, Math.round(e.maxHp * (om.maxHp / tpl.maxHp)));
        if (om.atk != null && tpl.atk) e.atk = Math.max(1, Math.round(e.atk * (om.atk / tpl.atk)));
        if (om.speed != null && tpl.speed) e.speed = Math.max(1, Math.round(e.speed * (om.speed / tpl.speed)));
      }
    }
    const tm = (ov.mult && ov.mult[tierKey]) || null;
    if (tm) {
      if (m1(tm.hp)) e.maxHp = Math.max(1, Math.round(e.maxHp * tm.hp));
      if (m1(tm.atk)) { e.atk = Math.max(1, Math.round(e.atk * tm.atk)); if (e.menaceBaseAtk) e.menaceBaseAtk = Math.max(1, Math.round(e.menaceBaseAtk * tm.atk)); }
    }
    e.hp = e.maxHp; // 적은 스폰 시 항상 풀피
  });
}

// Band Observatory 01 — per-encounter band 캡처(gated). captureBands=true일 때만 rec.encounters에 적재.
//   ★band은 deterministic이라 state.js/routes.js 변경 없이 pressureBand로 재계산(게임이 실제 쓴 값과 동일).
//   기존 run path(Baseline/Variant/Multi-Seed 등)는 captureBands=false → push 0·동작 무변경.
let captureBands = false;
function captureEncounter(rec, route, depth, wasBossReady, lootProxy, treasureProxy) {
  const eAlert = effectiveAlertness(gameState.run);
  const pb = pressureBand(route, depth, eAlert, gameState.run.bandSeed || 0);
  const party = partyJobIds();
  const rtg = roleTagsOf(party);
  rec.encounters.push({
    step: rec.battleCount, depth, route, alertness: eAlert, band: pb.id,
    bandCountDelta: pb.runwayCountDelta, bandRoleDelta: pb.roleAlertDelta,
    enemyCount: (gameState.enemies || []).length,
    rawCount: (route === "boss" || route === "elite") ? null : directorCount(route, depth),
    partySize: party.length, hasHealer: !!rtg.healer, hasTank: !!rtg.tank, hasAoE: !!rtg.aoe, hasShield: !!rtg.shield,
    lootProxy, treasureProxy, wasBossReady, isBoss: route === "boss", isElite: route === "elite",
    friction: route === "normal" || route === "ally" || route === "bond",
  });
}

function playExpedition(profile, runIndex, seed, overrides) {
  const loot = { dangerRoute: 0, elite: 0, bossKey: 0, deepReward: 0, discovery: 0, postBossReadyGreed: 0 };
  const rec = {
    runIndex, seed, profile: profile.id, result: null,
    clearDepth: 0, deathDepth: 0, finalDepth: 0, bossAttemptDepth: 0, bossReadyDepth: 0,
    battleCount: 0, fusionCount: 0, recruitCount: 0, faintCount: 0, bossAttempted: false,
    loot, lootProxyTotal: 0, lootDeep21: 0, lootDeep30: 0,
    lootAtBossReady: null, lootAtClear: null, lootAtDeath: null,
    postBossReadyDepth: 0,
    jobsSeen: new Set(), finalParty: [], bossParty: [], deathParty: [], postBossReadyJobs: new Set(),
    rewardsTaken: new Set(), deepRewardsTaken: new Set(),
    path: [], notableEvents: [], encounters: [], // encounters = Band Observatory 01 per-encounter 캡처(captureBands일 때만 채움)
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
      const battleJobs = partyJobIds();
      battleJobs.forEach((j) => rec.jobsSeen.add(j));
      const route = pendingRoute, wasBossReady = bossReadyReached;
      // Phase 1.5 — 보스문이 열린 뒤 욕심(비-보스) 전투에 들고 들어간 직업 집계(postBossReady lens).
      if (wasBossReady && route !== "boss") battleJobs.forEach((j) => rec.postBossReadyJobs.add(j));
      const keysBefore = gameState.run.bossKeys || 0;
      rec.battleCount += 1; rec.path.push(ROUTE_TOKEN[route] || "B");
      if (captureBands) captureEncounter(rec, route, depth, wasBossReady, lootTotal, treasure()); // Band Observatory 01 — per-encounter band 적재(gated)
      applyCombatOverrides(overrides); // Nara Sandbox — per-battle 클론에만 적용(템플릿 무변경). null이면 no-op.
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
  rec.postBossReadyJobsList = [...rec.postBossReadyJobs];
  return rec;
}
function jobNameSafeDeep(id) { const d = deepRewardById(id); return d ? d.name : id; }

/* ════════════════════════════════════════════════════════════════
   배치 실행 — 4 프로필을 같은 seed(공유 RNG)로 주회(공정 A/B). 헤드리스 + 상태 복구.
   ════════════════════════════════════════════════════════════════ */
const yieldUI = () => new Promise((r) => setTimeout(r, 0));
export async function runExpeditionAll({ seed, runs, onProgress, overrides = null }) {
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
        out.push(playExpedition(EXPEDITIONS[id], i, useSeed ? seed : 0, overrides));
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

/* ════════════════════════════════════════════════════════════════
   Phase 1.5 — Seat Value Readability: "봤다 / 최종 자리 / 보스 시도 / 귀환 / 전멸" 관점을 분리한다.
   각 lens는 universe(평가 모집단) + present(해당 lens 파티에 직업이 있었는가)로 정의된다.
     · rate lens(seen/final/boss): universe 내 present/absent로 갈라 clearRate·심도·전리품 Δ를 본다.
     · share lens(clear/death/postBoss): universe(클리어/전멸/욕심구간 런) 중 직업이 그 파티에 든 비율(점유율)을 본다.
   집계만(메모리 내부) — 본게임/저장/전투 무영향. lootProxy/treasure는 dev 임시 지표.
   ════════════════════════════════════════════════════════════════ */
const SAMPLE_MIN = 8;   // present 표본이 이 미만이면 "표본부족"(과해석 방지)
const RARE_AI = 5;      // seen 표본이 이 미만이면 "관측AI 미사용"(자동 주회가 거의 안 만드는 직업)
const seenOf = (r, j) => (r.jobsSeen && r.jobsSeen.has) ? r.jobsSeen.has(j) : (r.jobsSeenList || []).includes(j);
const pbrOf = (r, j) => (r.postBossReadyJobs && r.postBossReadyJobs.has) ? r.postBossReadyJobs.has(j) : (r.postBossReadyJobsList || []).includes(j);
const inArr = (arr, j) => (arr || []).includes(j);
const SEAT_LENSES = [
  { id: "seen",     label: "Seen",  full: "런에 섞임",        desc: "등장/영입/합체 경유 등 어떤 방식으로든 런에 들어옴", kind: "rate",  universe: () => true,                present: (r, j) => seenOf(r, j) },
  { id: "final",    label: "Final", full: "마지막 4자리",      desc: "런 종료 시(결과 무관) 최종 파티에 있었는가",          kind: "rate",  universe: () => true,                present: (r, j) => inArr(r.finalParty, j) },
  { id: "boss",     label: "Boss",  full: "보스 시도 순간",    desc: "귀환문에 도전하는 순간 파티에 들고 갔는가(보스 시도 런 한정)", kind: "rate", universe: (r) => r.bossAttempted,   present: (r, j) => inArr(r.bossParty, j) },
  { id: "clear",    label: "Clear", full: "귀환 성공 순간",    desc: "살아 돌아온 조합에 포함됐는가(클리어 런 한정)",        kind: "share", universe: (r) => r.cleared,          present: (r, j) => inArr(r.finalParty, j) },
  { id: "death",    label: "Death", full: "전멸 순간",        desc: "실패/욕심 전멸 조합에 포함됐는가(전멸 런 한정)",       kind: "share", universe: (r) => r.wiped,            present: (r, j) => inArr(r.deathParty, j) },
  { id: "postBoss", label: "Greed", full: "보스문 후 욕심",    desc: "보스문이 열린 뒤 추가 탐사에 들고 갔는가(욕심 구간 런 한정)", kind: "share", universe: (r) => r.bossReadyReached, present: (r, j) => pbrOf(r, j) },
];

// 한 lens에 대해 직업별 지표(present/absent 비교 + share + 평균 심도/전리품). universe로 모집단을 좁힌다.
function computeLensSeat(allRuns, lens) {
  const universe = allRuns.filter(lens.universe);
  const uN = universe.length;
  return ALL_JOBS.map((job) => {
    const present = universe.filter((r) => lens.present(r, job));
    const absent = universe.filter((r) => !lens.present(r, job));
    const pN = present.length, aN = absent.length;
    const clearP = rate(present.filter((r) => r.cleared).length, pN);
    const clearA = rate(absent.filter((r) => r.cleared).length, aN);
    const depthP = mean(present.map((r) => r.finalDepth)), depthA = mean(absent.map((r) => r.finalDepth));
    const lootP = mean(present.map((r) => r.lootProxyTotal)), lootA = mean(absent.map((r) => r.lootProxyTotal));
    // clearParty/deathParty count는 lens 무관(전역 — 표 공통 컬럼).
    const clearPartyCount = allRuns.filter((r) => r.cleared && inArr(r.finalParty, job)).length;
    const deathPartyCount = allRuns.filter((r) => r.wiped && inArr(r.deathParty, job)).length;
    return {
      job, name: jobName(job), tier: tierOf(job), role: roleAr(job), roleLabel: combatRoleLabelOf(job) || "—",
      universeN: uN, presentCount: pN, absentCount: aN, share: rate(pN, uN),
      clearCount: present.filter((r) => r.cleared).length, deathCount: present.filter((r) => r.wiped).length, bossAttemptCount: present.filter((r) => r.bossAttempted).length,
      clearRatePresent: clearP, clearRateAbsent: clearA, deltaClearRate: (clearP != null && clearA != null) ? clearP - clearA : null,
      avgDepthPresent: depthP, avgDepthAbsent: depthA, deltaAvgDepth: (depthP != null && depthA != null) ? depthP - depthA : null,
      avgClearDepthPresent: mean(present.filter((r) => r.cleared).map((r) => r.clearDepth)),
      avgDeathDepthPresent: mean(present.filter((r) => r.wiped).map((r) => r.deathDepth)),
      avgLootPresent: lootP, avgLootAbsent: lootA, deltaAvgLoot: (lootP != null && lootA != null) ? lootP - lootA : null,
      avgTreasurePresent: mean(present.map((r) => r.treasureTotal)),
      avgPostBossReadyDepthPresent: mean(present.filter((r) => r.bossReadyReached).map((r) => r.postBossReadyDepth)),
      clearPartyCount, deathPartyCount,
      sampleTag: pN < SAMPLE_MIN ? "표본부족" : null,
      readTags: [], // buildReport에서 retention 기반으로 주입
    };
  });
}

// Seen vs Final Gap / Retention — 많이 보이지만 최종에 안 남는 직업(합체 경유형) vs 끝까지 남는 직업 구분.
function jobRetention(allRuns) {
  return ALL_JOBS.map((job) => {
    const seenN = allRuns.filter((r) => seenOf(r, job)).length;
    const finalC = allRuns.filter((r) => inArr(r.finalParty, job)).length;
    const bossC = allRuns.filter((r) => r.bossAttempted && inArr(r.bossParty, job)).length;
    const clearC = allRuns.filter((r) => r.cleared && inArr(r.finalParty, job)).length;
    const deathC = allRuns.filter((r) => r.wiped && inArr(r.deathParty, job)).length;
    return {
      job, name: jobName(job), tier: tierOf(job), role: roleAr(job),
      seenCount: seenN, finalCount: finalC, bossCount: bossC, clearCount: clearC, deathCount: deathC,
      finalRetention: rate(finalC, seenN), bossRetention: rate(bossC, seenN), clearRetention: rate(clearC, seenN), deathRetention: rate(deathC, seenN),
      avgDepthFinalPresent: mean(allRuns.filter((r) => inArr(r.finalParty, job)).map((r) => r.finalDepth)),
      avgLootFinalPresent: mean(allRuns.filter((r) => inArr(r.finalParty, job)).map((r) => r.lootProxyTotal)),
    };
  });
}

// 판독 태그(관측용·단정 금지) — retention + Final lens 지표에서 도출. "약함" 대신 "표본부족/WATCH/동반" 톤.
function computeReadTags(ret, finalRow, gAvgDepth, gAvgLoot) {
  const tags = [];
  if (ret.seenCount < RARE_AI && ret.tier !== "기본") tags.push("관측AI 미사용");
  if (ret.seenCount < SAMPLE_MIN) { tags.push("표본부족"); return tags.length ? tags : ["표본부족"]; }
  if (ret.finalRetention != null && ret.finalRetention >= 0.55) tags.push("자리 후보");
  if (ret.finalRetention != null && ret.finalRetention <= 0.25) tags.push("합체 경유형 가능성");
  if (ret.clearRetention != null && ret.clearRetention >= 0.2) tags.push("귀환 동반");
  if (ret.deathRetention != null && ret.clearRetention != null && ret.deathRetention > Math.max(0.12, ret.clearRetention * 1.6)) tags.push("전멸 동반 WATCH");
  if (finalRow && finalRow.deltaClearRate != null && finalRow.deltaClearRate >= 0.05 && (finalRow.bossAttemptCount || 0) >= 3) tags.push("보스 신뢰");
  if (finalRow && finalRow.avgDepthPresent != null && gAvgDepth != null && finalRow.avgDepthPresent >= gAvgDepth + 4) tags.push("고심도 동반");
  if (finalRow && finalRow.avgLootPresent != null && gAvgLoot != null && finalRow.avgLootPresent >= gAvgLoot + 1.0) tags.push("전리품 동반");
  if (!tags.length) tags.push("중립");
  return tags;
}

// lens별 직접 비교(덫꾼 vs 도적 / 바드·무희 vs 딜러평균 / 마도·현자 / 힐 / 탱·보호막) — 선택된 lens의 rows로 계산.
const SHIELD_JOBS = ["cleric", "wall", "wardkeeper", "forbidden", "gatekeeper"];
function lensPrimary(row, kind) { return kind === "share" ? row.share : row.clearRatePresent; } // 대표 지표
function lensCompareData(lensRows, kind) {
  const get = (j) => lensRows.find((s) => s.job === j) || {};
  const avgOf = (jobs, key) => mean(jobs.map((j) => get(j)[key]).filter((v) => v != null));
  const pack = (j) => { const r = get(j); return { name: r.name, present: r.presentCount, primary: lensPrimary(r, kind), deltaClear: r.deltaClearRate, loot: r.avgLootPresent, depth: r.avgDepthPresent, sample: r.sampleTag }; };
  const groupAvg = (jobs) => ({ present: avgOf(jobs, "presentCount"), primary: mean(jobs.map((j) => lensPrimary(get(j), kind)).filter((v) => v != null)), deltaClear: avgOf(jobs, "deltaClearRate"), loot: avgOf(jobs, "avgLootPresent"), depth: avgOf(jobs, "avgDepthPresent") });
  return {
    trapper: pack("trapper"), rogue: pack("rogue"),
    bard: pack("bard"), dealerFirstAvg: groupAvg(DEALER_FIRST),
    dancer: pack("dancer"), dealerSecondAvg: groupAvg(DEALER_SECOND),
    mage: pack("mage"), sage: pack("sage"),
    healAvg: groupAvg(HEAL_JOBS),
    tankAvg: groupAvg(TANK_JOBS), shieldAvg: groupAvg(SHIELD_JOBS),
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
/* ════════════════════════════════════════════════════════════════
   Phase 3B — One Loot Failure Breakdown (1전리품 실패 해부) — 집계.
   One Loot 프로필 defeat 런이 "어디서 무너지는가"를 run record의 심도 마커로 추정 분해.
   ★이벤트 스키마/payload 무확장 — bossReadyDepth / bossAttemptDepth / postBossReadyDepth /
     deathDepth / finalPartySize / roleTags 등 기존 캡처만 사용. 마커 기반 추정이므로 estimated.
   ════════════════════════════════════════════════════════════════ */
const OL_EARLY_DEPTH = 4;        // 너무 이른 파티 붕괴 기준 심도(보조 tag)
const OL_GREED_AFTER_DOOR = 4;   // 보스문 후 "욕심" 전멸로 보는 추가 심도(estimated 임계)
const OL_WATCH_JOBS = ["trapper", "rogue", "bard", "dancer"]; // 덫꾼/도적/바드/무희(기존 WATCH 부분집합)
const OL_BUCKET_ORDER = ["preBossReadyWipe", "postBossReadyPreBossWipe", "bossAttemptWipe", "postBossReadyGreedWipe", "unknown"];
const OL_BUCKET_LABELS = {
  preBossReadyWipe: "보스문 열기 전 전멸", postBossReadyPreBossWipe: "보스문 후·보스 도전 전 전멸",
  bossAttemptWipe: "보스 도전 패배", postBossReadyGreedWipe: "보스문 후 욕심 전멸", unknown: "알 수 없음",
};
const OL_GAP_ORDER = ["noHealer", "noTank", "noAoE", "noShield", "noSecondClass", "partySizeLe3"];
const OL_GAP_LABELS = { noHealer: "힐러 없음", noTank: "탱커 없음", noAoE: "광역 없음", noShield: "보호막 없음", noSecondClass: "2차직업 없음", partySizeLe3: "파티 ≤3" };

// defeat 1런 → primary failure bucket(1~4 mutually exclusive). 우선순위: 보스 시도 > 보스문 후 > 보스문 전.
function classifyOneLootWipe(r) {
  if (r.bossAttempted) return "bossAttemptWipe";                                   // 3. 보스 도전에서 패배
  if (r.bossReadyReached) return (r.postBossReadyDepth >= OL_GREED_AFTER_DOOR)
    ? "postBossReadyGreedWipe"                                                     // 4. 보스문 후 욕심 구간 전멸
    : "postBossReadyPreBossWipe";                                                  // 2. 보스문 열었으나 보스 도전 전 전멸
  if (r.deathDepth > 0) return "preBossReadyWipe";                                 // 1. 보스문 열기 전 전멸
  return "unknown";                                                               // 6. 데이터만으로 애매(거의 0)
}

// clear 또는 defeat 그룹의 평균/비율(파티 역할은 finalParty 기준 roleTags 사용).
function olGroupStats(runs) {
  const n = runs.length;
  const reached = runs.filter((r) => r.bossReadyReached);
  const attempted = runs.filter((r) => r.bossAttempted);
  const wipes = runs.filter((r) => r.wiped);
  const tagRate = (k) => rate(runs.filter((r) => r.roleTags && r.roleTags[k]).length, n);
  const watchRate = {};
  OL_WATCH_JOBS.forEach((j) => { watchRate[j] = rate(runs.filter((r) => (r.finalParty || []).includes(j)).length, n); });
  return {
    count: n,
    avgFinalDepth: mean(runs.map((r) => r.finalDepth)),
    avgDeathDepth: mean(wipes.map((r) => r.deathDepth)),
    avgBossReadyDepth: mean(reached.map((r) => r.bossReadyDepth)),
    avgBossAttemptDepth: mean(attempted.map((r) => r.bossAttemptDepth)),
    avgPostBossReadyDepth: mean(reached.map((r) => r.postBossReadyDepth)),
    avgLootProxy: mean(runs.map((r) => r.lootProxyTotal)),
    avgPartySize: mean(runs.map((r) => r.finalPartySize)),
    healerRate: tagRate("healer"), tankRate: tagRate("tank"), aoeRate: tagRate("aoe"),
    shieldRate: tagRate("shield"), secondRate: tagRate("second"), watchRate,
  };
}

// One Loot 프로필 런 배열 → breakdown(집계만, raw run 미포함 — JSON-lightweight).
function computeOneLootBreakdown(runs) {
  const list = runs || [];
  const total = list.length;
  const clears = list.filter((r) => r.cleared);
  const defeats = list.filter((r) => r.wiped);
  const incompletes = list.filter((r) => r.result === "incomplete");
  const buckets = { preBossReadyWipe: 0, postBossReadyPreBossWipe: 0, bossAttemptWipe: 0, postBossReadyGreedWipe: 0, unknown: 0 };
  defeats.forEach((r) => { buckets[classifyOneLootWipe(r)] += 1; });
  const cnt = (fn) => defeats.filter(fn).length;
  const roleGaps = {
    noHealer: cnt((r) => !(r.roleTags && r.roleTags.healer)),
    noTank: cnt((r) => !(r.roleTags && r.roleTags.tank)),
    noAoE: cnt((r) => !(r.roleTags && r.roleTags.aoe)),
    noShield: cnt((r) => !(r.roleTags && r.roleTags.shield)),
    noSecondClass: cnt((r) => !(r.roleTags && r.roleTags.second)),
    partySizeLe3: cnt((r) => (r.finalPartySize || 0) <= 3),
  };
  const watchPresentDefeat = {};
  OL_WATCH_JOBS.forEach((j) => { watchPresentDefeat[j] = cnt((r) => (r.finalParty || []).includes(j)); });
  const earlyPartyWipe = cnt((r) => (r.deathDepth > 0 && r.deathDepth <= OL_EARLY_DEPTH) || (r.finalPartySize || 0) <= 3);
  return {
    total, clear: clears.length, defeat: defeats.length, incomplete: incompletes.length,
    clearRate: rate(clears.length, total), defeatRate: rate(defeats.length, total),
    buckets, roleGaps, watchPresentDefeat, earlyPartyWipe,
    clearStats: olGroupStats(clears), defeatStats: olGroupStats(defeats),
    meta: { earlyDepth: OL_EARLY_DEPTH, greedAfterDoor: OL_GREED_AFTER_DOOR, estimated: true },
  };
}

function buildReport(profiles, meta) {
  const combined = EXPEDITION_ORDER.flatMap((id) => profiles[id]);
  const seat = jobSeatValue(combined); // Phase 1 (seen 기반) — 호환 유지
  // Phase 1.5 — lens별 seat + retention + read tags.
  const lensSeat = {};
  SEAT_LENSES.forEach((l) => { lensSeat[l.id] = computeLensSeat(combined, l); });
  const retention = jobRetention(combined);
  const gAvgDepth = mean(combined.map((r) => r.finalDepth)), gAvgLoot = mean(combined.map((r) => r.lootProxyTotal));
  const finalRows = lensSeat.final;
  const readTagsByJob = {};
  retention.forEach((ret) => { const fr = finalRows.find((x) => x.job === ret.job); ret.readTags = computeReadTags(ret, fr, gAvgDepth, gAvgLoot); readTagsByJob[ret.job] = ret.readTags; });
  SEAT_LENSES.forEach((l) => lensSeat[l.id].forEach((row) => { row.readTags = readTagsByJob[row.job] || []; }));
  return {
    meta, profiles,
    summaries: EXPEDITION_ORDER.reduce((o, id) => { o[id] = profileSummary(profiles[id]); return o; }, {}),
    combined,
    seat, seatComparisons: seatComparisons(seat),
    lensSeat, retention, readTagsByJob, gAvgDepth, gAvgLoot,
    lensList: SEAT_LENSES.map((l) => ({ id: l.id, label: l.label, full: l.full, desc: l.desc, kind: l.kind })),
    sampleMin: SAMPLE_MIN,
    effectTable: effectValueTable(), effectDiag: effectDiagnostics(combined),
    samples: sampleRuns(combined),
    // Phase 3B — One Loot 실패 해부(집계만, raw run 미포함). 단일 Baseline/Variant·diff·JSON에서 재사용.
    oneLootBreakdown: computeOneLootBreakdown(profiles.oneLoot || []),
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

// Phase 2D — Loot Proxy 명칭 명료화. "전리품 지표"는 실제 아이템 개수가 아니라 런 가치/파밍 성향 관측치.
const LOOT_PROXY_NOTE_TEXT = "Loot Proxy(전리품 지표)는 실제 획득 아이템 개수가 아니라, 깊이/위험/정예/보스 열쇠/심층 보상/보스문 후 욕심 등 귀환 가치를 합산한 dev-only 임시 지표입니다. 예: 5.4는 아이템 5.4개가 아니라 런 가치 점수입니다(보상 경제 수치 아님).";
const LOOT_PROXY_NOTE_HTML = `<div class="eo-note"><b>전리품 지표(Loot Proxy)란?</b> ${esc(LOOT_PROXY_NOTE_TEXT)}</div>`;

function renderSummary(rep) {
  const head = EXPEDITION_ORDER.map((id) => `<th>${esc(EXPEDITIONS[id].label)}<div class="eo-sub">${esc(EXPEDITIONS[id].sub)}</div></th>`).join("");
  const row = (label, fn, fmt) => `<tr><td class="txt">${label}</td>${EXPEDITION_ORDER.map((id) => `<td>${fmt(fn(rep.summaries[id]))}</td>`).join("")}</tr>`;
  const lootRows = LOOT_TYPES.map((t) => `<tr><td class="txt eo-indent">· ${ROLE_TAG_LABELS_FALLBACK(t)}</td>${EXPEDITION_ORDER.map((id) => `<td>${fmt1(rep.summaries[id].lootByType[t])}</td>`).join("")}</tr>`).join("");
  $("eo-summary").innerHTML = `<h3>A. Expedition Summary <span class="eo-meta">· seed ${rep.meta.seed} · 프로필당 ${rep.meta.runs}런</span></h3>
    ${LOOT_PROXY_NOTE_HTML}
    <div class="eo-cards">${EXPEDITION_ORDER.map((id) => { const s = rep.summaries[id]; const c = EXPEDITIONS[id]; return `<div class="eo-card" style="border-top:3px solid ${c.color}"><div class="eo-cn">${esc(c.label)}</div><div class="eo-cd">${esc(c.desc)}</div><div class="eo-crow"><span>승률</span><b class="${(s.winRate || 0) > 0 ? "clear" : ""}">${fmtPct(s.winRate)}</b></div><div class="eo-crow"><span>전멸률</span><b class="wipe">${fmtPct(s.wipeRate)}</b></div><div class="eo-crow" title="Loot Proxy — 실제 아이템 개수 아님(dev 임시 지표)"><span>평균 전리품 지표</span><b>${fmt1(s.avgLootProxy)}</b></div></div>`; }).join("")}</div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">지표</th>${head}</tr></thead><tbody>
      ${row("승률(귀환 성공)", (s) => s.winRate, fmtPct)}
      ${row("전멸률", (s) => s.wipeRate, fmtPct)}
      ${row("보스문 개방률", (s) => s.bossReadyRate, fmtPct)}
      ${row("평균 클리어 심도", (s) => s.avgClearDepth, fmt1)}
      ${row("평균 보스 시도 심도", (s) => s.avgBossAttemptDepth, fmt1)}
      ${row("평균 전멸 심도", (s) => s.avgDeathDepth, fmt1)}
      ${row("평균 도달 심도", (s) => s.avgFinalDepth, fmt1)}
      ${row("평균 전투 수", (s) => s.avgBattles, fmt1)}
      ${row("평균 전리품 지표 (Loot Proxy)", (s) => s.avgLootProxy, fmt1)}
      ${row("최대 전리품 지표", (s) => s.maxLootProxy, (v) => v == null ? "—" : v)}
      ${row("평균 전리품 지표(의도적)", (s) => s.avgTreasure, fmt1)}
      ${row("보스문 시점 전리품 지표", (s) => s.avgLootAtBossReady, fmt1)}
      ${row("클리어 시점 전리품 지표", (s) => s.avgLootAtClear, fmt1)}
      ${row("전멸 시점 전리품 지표", (s) => s.avgLootAtDeath, fmt1)}
      ${row("보스문 후 추가 심도", (s) => s.avgPostBossReadyDepth, fmt1)}
      ${row("1전리품 후 보스 클리어율", (s) => s.oneLootBossClearRate, fmtPct)}
      ${row("회수3+ 런 생존율", (s) => s.highLootSurvivalRate, fmtPct)}
      <tr class="eo-grouprow"><td class="txt" colspan="${EXPEDITION_ORDER.length + 1}">전리품 지표(Loot Proxy) 평균 분해(byType)</td></tr>
      ${lootRows}
    </tbody></table></div>`;
}
function ROLE_TAG_LABELS_FALLBACK(t) { return LOOT_TYPE_LABELS[t] || t; }

function comboTable(title, rows) {
  if (!rows.length) return `<div class="eo-line"><b>${title}</b> <span class="eo-meta">— 표본 없음</span></div>`;
  return `<div class="eo-line"><b>${title}</b></div><div class="eo-tablewrap"><table><thead><tr><th class="txt">조합</th><th>런</th><th>승률</th><th>전멸률</th><th>평균심도</th><th title="Loot Proxy — dev 임시 지표">전리품 지표</th></tr></thead><tbody>${rows.map((e) => `<tr><td class="txt">${esc(e.key)}</td><td>${e.count}</td><td class="${(e.winRate || 0) > 0 ? "clear" : ""}">${fmtPct(e.winRate)}</td><td class="wipe">${fmtPct(e.wipeRate)}</td><td>${fmt1(e.avgDepth)}</td><td>${fmt1(e.avgLoot)}</td></tr>`).join("")}</tbody></table></div>`;
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
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">역할</th><th>보유런</th><th>보유 승률</th><th>미보유 승률</th><th>Δ승률</th><th>보유 평균심도</th><th title="Loot Proxy — dev 임시 지표">보유 전리품 지표</th></tr></thead><tbody>
      ${rt.map((e) => `<tr><td class="txt">${e.label}</td><td>${e.presentCount}</td><td class="${(e.presentWin || 0) > 0 ? "clear" : ""}">${fmtPct(e.presentWin)}</td><td>${fmtPct(e.absentWin)}</td><td>${deltaPct(e.presentWin != null && e.absentWin != null ? e.presentWin - e.absentWin : null)}</td><td>${fmt1(e.presentDepth)}</td><td>${fmt1(e.presentLoot)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="eo-line"><b>depth band별 대표 조합(도달 심도)</b></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">밴드</th><th>런</th><th>승률</th><th class="txt">대표 조합(최종 파티)</th></tr></thead><tbody>
      ${bandRep.map((b) => `<tr><td class="txt">${b.band}</td><td>${b.count}</td><td>${fmtPct(b.winRate)}</td><td class="txt">${b.topCombos.map((c) => `${esc(c.key)} <span class="eo-meta">(${c.count}·${fmtPct(c.winRate)})</span>`).join("<br>") || "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}

/* ── Phase 1.5 Seat Value (lens 탭) ── */
let currentLens = "final"; // 기본 = Final(한 자리 가치)
const LENS_HL = new Set(["trapper", "rogue", "bard", "dancer"]);
function lensChip(t) {
  const lo = ["표본부족", "관측AI 미사용", "전멸 동반 WATCH"], hi = ["자리 후보", "보스 신뢰", "귀환 동반", "고심도 동반", "전리품 동반"];
  const cls = lo.includes(t) ? "lo" : hi.includes(t) ? "hi" : "";
  return `<span class="eo-tag ${cls}">${esc(t)}</span>`;
}
const sampMark = (s) => (s.sampleTag ? ' <span class="eo-tag lo">표</span>' : "");
const tagCells = (s) => (s.readTags || []).slice(0, 3).map(lensChip).join("");
function rateLensRow(s) {
  return `<tr class="${LENS_HL.has(s.job) ? "eo-hl" : ""}"><td class="txt">${esc(s.name)} <span class="eo-meta">${s.tier}·${esc(s.roleLabel)}</span></td><td>${s.presentCount}${sampMark(s)}</td><td>${s.absentCount}</td><td class="${(s.clearRatePresent || 0) > 0 ? "clear" : ""}">${fmtPct(s.clearRatePresent)}</td><td>${fmtPct(s.clearRateAbsent)}</td><td>${deltaPct(s.deltaClearRate)}</td><td>${fmt1(s.avgDepthPresent)}</td><td>${delta(s.deltaAvgDepth)}</td><td>${fmt1(s.avgLootPresent)}</td><td>${delta(s.deltaAvgLoot)}</td><td>${s.clearPartyCount}</td><td>${s.deathPartyCount}</td><td class="txt">${tagCells(s)}</td></tr>`;
}
function shareLensRow(s) {
  return `<tr class="${LENS_HL.has(s.job) ? "eo-hl" : ""}"><td class="txt">${esc(s.name)} <span class="eo-meta">${s.tier}·${esc(s.roleLabel)}</span></td><td>${s.presentCount}${sampMark(s)}</td><td>${fmtPct(s.share)}</td><td>${fmt1(s.avgDepthPresent)}</td><td>${fmt1(s.avgLootPresent)}</td><td>${fmt1(s.avgTreasurePresent)}</td><td>${s.clearPartyCount}</td><td>${s.deathPartyCount}</td><td class="txt">${tagCells(s)}</td></tr>`;
}
function lensTable(rows, kind) {
  const sorted = rows.slice().sort((a, b) => b.presentCount - a.presentCount);
  if (kind === "share") {
    return `<div class="eo-tablewrap"><table><thead><tr><th class="txt">직업</th><th>점유런</th><th>점유율</th><th>P심도</th><th>P전리품</th><th>P전리품(의도)</th><th>clearP</th><th>deathP</th><th class="txt">판독</th></tr></thead><tbody>${sorted.map(shareLensRow).join("")}</tbody></table></div>`;
  }
  return `<div class="eo-tablewrap"><table><thead><tr><th class="txt">직업</th><th>present</th><th>absent</th><th>P승률</th><th>A승률</th><th>Δ승률</th><th>P심도</th><th>Δ심도</th><th>P전리품</th><th>Δ전리품</th><th>clearP</th><th>deathP</th><th class="txt">판독</th></tr></thead><tbody>${sorted.map(rateLensRow).join("")}</tbody></table></div>`;
}
function lensCompareTable(lensRows, kind) {
  const c = lensCompareData(lensRows, kind);
  const pLabel = kind === "share" ? "점유율" : "P승률";
  const rowJob = (label, p, vs) => (p && p.name) ? `<tr><td class="txt">${esc(label)}</td><td>${p.present || 0}${p.sample ? ' <span class="eo-tag lo">표</span>' : ""}</td><td class="${(p.primary || 0) > 0 ? "clear" : ""}">${fmtPct(p.primary)}</td><td>${deltaPct(p.deltaClear)}</td><td>${fmt1(p.loot)}</td><td>${fmt1(p.depth)}</td><td class="txt eo-meta">${esc(vs)}</td></tr>` : "";
  const rowGrp = (label, g, vs) => `<tr><td class="txt eo-indent">· ${esc(label)}</td><td>${fmt1(g.present)}</td><td>${fmtPct(g.primary)}</td><td>${deltaPct(g.deltaClear)}</td><td>${fmt1(g.loot)}</td><td>${fmt1(g.depth)}</td><td class="txt eo-meta">${esc(vs)}</td></tr>`;
  return `<div class="eo-tablewrap"><table><thead><tr><th class="txt">대상</th><th>present</th><th>${pLabel}</th><th>Δ승률</th><th>전리품</th><th>심도</th><th class="txt">비교군</th></tr></thead><tbody>
    ${rowJob("덫꾼(독)", c.trapper, "vs 도적")}
    ${rowJob("도적", c.rogue, "vs 덫꾼")}
    ${rowJob("바드", c.bard, "vs 1차 딜러 평균")}
    ${rowGrp("1차 딜러 평균", c.dealerFirstAvg, "도적/워든/파수궁/마도/추적자")}
    ${rowJob("무희", c.dancer, "vs 2차 딜러 평균")}
    ${rowGrp("2차 딜러 평균", c.dealerSecondAvg, "용창/천궁/검성")}
    ${rowJob("마도(AoE)", c.mage, "vs 현자")}
    ${rowJob("현자(AoE)", c.sage, "vs 마도")}
    ${rowGrp("힐러 계열 평균", c.healAvg, "사제/성직자/치유궁/정화사/구원자")}
    ${rowGrp("탱커 계열 평균", c.tankAvg, "수호자/수문장/성기사/금제/성벽/결계장")}
    ${rowGrp("보호막 계열 평균", c.shieldAvg, "신관/성벽/결계장/금제/수문장")}
  </tbody></table></div>`;
}
function retentionTable(retention) {
  const sorted = retention.slice().sort((a, b) => b.seenCount - a.seenCount);
  return `<div class="eo-tablewrap"><table><thead><tr><th class="txt">직업</th><th>Seen</th><th>Final</th><th>Final유지</th><th>Boss유지</th><th>Clear유지</th><th>Death유지</th><th class="txt">판독</th></tr></thead><tbody>${sorted.map((r) => `<tr class="${LENS_HL.has(r.job) ? "eo-hl" : ""}"><td class="txt">${esc(r.name)} <span class="eo-meta">${r.tier}</span></td><td>${r.seenCount}</td><td>${r.finalCount}</td><td class="${(r.finalRetention || 0) >= 0.55 ? "clear" : ""}">${fmtPct(r.finalRetention)}</td><td>${fmtPct(r.bossRetention)}</td><td>${fmtPct(r.clearRetention)}</td><td>${fmtPct(r.deathRetention)}</td><td class="txt">${(r.readTags || []).slice(0, 3).map(lensChip).join("")}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderSeat(rep) {
  const lens = rep.lensList.find((l) => l.id === currentLens) || rep.lensList[1];
  const rows = rep.lensSeat[lens.id];
  const tabs = rep.lensList.map((l) => `<button type="button" class="eo-lens-tab${l.id === currentLens ? " active" : ""}" data-lens="${l.id}">${l.label}</button>`).join("");
  const lensCards = rep.lensList.map((l) => `<div class="eo-lenscard${l.id === currentLens ? " active" : ""}"><b>${l.label}</b> <span class="eo-meta">${esc(l.full)}</span><div class="eo-cd">${esc(l.desc)}</div></div>`).join("");
  const uN = rows[0] ? rows[0].universeN : 0;
  $("eo-seat").innerHTML = `<h3>C. Job Seat Value <span class="eo-meta">· 결합 ${rep.combined.length}런 · lens별 분리 · 표본부족 present &lt; ${rep.sampleMin}</span></h3>
    <div class="eo-note">"이 직업을 봤다" vs "최종 4자리를 차지했다" vs "보스 시도/귀환/전멸 순간 있었다"를 분리해 봅니다. 기본 = Final(한 자리 가치). 판독 태그는 관측용(단정 아님 — 표본 적으면 "표본부족/관측AI 미사용"으로 표시).</div>
    <div class="eo-lenscards">${lensCards}</div>
    <div class="eo-lenstabs">${tabs}</div>
    <div class="eo-line"><b>${lens.label} Lens — ${esc(lens.full)}</b> <span class="eo-meta">${lens.kind === "share" ? `모집단 ${uN}런 중 점유율(present/모집단)` : "present/absent 비교(모집단 " + uN + "런)"} · 보유=이 lens 파티에 직업이 있던 런</span></div>
    ${lensTable(rows, lens.kind)}
    <div class="eo-line"><b>직접 비교 (${lens.label} 기준)</b> <span class="eo-meta">덫꾼vs도적 / 바드·무희 vs 딜러평균 / 마도·현자 / 힐·탱·보호막 · 표본부족은 "표"</span></div>
    ${lensCompareTable(rows, lens.kind)}
    <div class="eo-line"><b>Seen vs Final Gap / Retention</b> <span class="eo-meta">많이 보이지만 안 남음=합체 경유형 / 끝까지 남음=자리형</span></div>
    ${retentionTable(rep.retention)}`;
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
      <div class="eo-srow"><span>클리어/전멸 심도</span><b>${rec.cleared ? rec.clearDepth : rec.deathDepth}</b> <span title="Loot Proxy — dev 임시 지표">전리품 지표</span><b>${rec.lootProxyTotal}</b> <span>보스문</span><b>${rec.bossReadyReached ? "심도 " + rec.bossReadyDepth : "미개방"}</b></div>
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
    metadata: { tool: "expedition-observatory", phase: TOOL_PHASE, theme: "beginner", seed: rep.meta.seed, runsPerProfile: rep.meta.runs, profiles: EXPEDITION_ORDER, sampleMin: rep.sampleMin, generatedAt: new Date().toISOString(),
      // Phase 2B — Nara Sandbox: 이 리포트가 어떤 stat override로 돌았는지(없으면 null = baseline).
      statOverrides: (rep.meta.overrides && hasActiveOverrides(rep.meta.overrides)) ? rep.meta.overrides : null,
      statOverrideSummary: rep.meta.overrides ? describeOverrides(rep.meta.overrides) : [],
      note: "lootProxy = dev-only 임시 지표(실제 전리품/유물 시스템 아님). 본게임 수치/저장 무영향. Seat은 lens별(seen/final/boss/clear/death/postBoss)로 분리. statOverrides는 dev A/B 실험값 — 본게임 기본 스탯 무변경." },
    summaries: rep.summaries,
    jobSeatValue: rep.seat.map((s) => ({ job: s.job, name: s.name, tier: s.tier, role: s.role, presentCount: s.presentCount, finalHeld: s.finalHeld, bossHeld: s.bossHeld, clearHeld: s.clearHeld, deathHeld: s.deathHeld, presentWin: s.presentWin, absentWin: s.absentWin, seatWin: s.seatWin, seatDepth: s.seatDepth, seatLoot: s.seatLoot })),
    seatComparisons: rep.seatComparisons,
    // Phase 1.5 — lens별 seat value + retention + 판독 태그 + 표본 경고.
    lensMeta: rep.lensList,
    lensSeat: rep.lensList.reduce((o, l) => { o[l.id] = rep.lensSeat[l.id].map((s) => ({ job: s.job, name: s.name, tier: s.tier, lens: l.id, presentCount: s.presentCount, absentCount: s.absentCount, universeN: s.universeN, share: s.share, clearRatePresent: s.clearRatePresent, clearRateAbsent: s.clearRateAbsent, deltaClearRate: s.deltaClearRate, avgDepthPresent: s.avgDepthPresent, deltaAvgDepth: s.deltaAvgDepth, avgLootPresent: s.avgLootPresent, deltaAvgLoot: s.deltaAvgLoot, avgTreasurePresent: s.avgTreasurePresent, clearPartyCount: s.clearPartyCount, deathPartyCount: s.deathPartyCount, sampleTag: s.sampleTag, readTags: s.readTags })); return o; }, {}),
    retention: rep.retention.map((r) => ({ job: r.job, name: r.name, tier: r.tier, seenCount: r.seenCount, finalCount: r.finalCount, bossCount: r.bossCount, clearCount: r.clearCount, deathCount: r.deathCount, finalRetention: r.finalRetention, bossRetention: r.bossRetention, clearRetention: r.clearRetention, deathRetention: r.deathRetention, readTags: r.readTags })),
    effectTable: rep.effectTable, effectDiagnostics: rep.effectDiag,
    samples: rep.samples.map((s) => s.rec ? { label: s.label, profile: s.rec.profile, seed: s.rec.seed, runIndex: s.rec.runIndex, result: s.rec.result, clearDepth: s.rec.clearDepth, deathDepth: s.rec.deathDepth, lootProxyTotal: s.rec.lootProxyTotal, finalParty: s.rec.finalParty.map(jobName), path: s.rec.path, notableEvents: s.rec.notableEvents } : { label: s.label, rec: null }),
    // Phase 2D — Baseline↔Variant 사람이 읽는 요약(둘 다 실행됐을 때만 채워짐, 아니면 ""). 기존 필드 제거 없음.
    experimentSummaryText: buildExperimentSummary() || "",
    // Phase 3A — Multi-Seed Experiment Queue 결과(없으면 null/""). 기존 필드 제거 없음.
    multiSeedSummary: lastMultiSeed || null,
    multiSeedSummaryText: buildMultiSeedSummary() || "",
    // Phase 3B — One Loot Failure Breakdown(집계만, raw run 미포함). 없으면 null/"". 기존 필드 제거 없음.
    oneLootBreakdown: oneLootBreakdownExport(),
    oneLootBreakdownText: buildOneLootBreakdownText() || "",
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
// Phase 1.5 — lens별 seat value TSV(직업×lens 한 줄). run TSV와 별도 버튼.
function exportSeatTSV() {
  if (!lastReport) return "";
  const cols = ["jobId", "jobName", "tier", "lens", "presentCount", "absentCount", "presentClearRate", "absentClearRate", "deltaClearRate", "presentAvgDepth", "absentAvgDepth", "deltaAvgDepth", "presentAvgLoot", "absentAvgLoot", "deltaAvgLoot", "share", "clearPartyCount", "deathPartyCount", "sampleTag", "readTag"];
  const num = (v) => (v == null ? "" : Math.round(v * 1000) / 1000);
  const rows = [];
  lastReport.lensList.forEach((l) => {
    lastReport.lensSeat[l.id].forEach((s) => {
      rows.push([s.job, s.name, s.tier, l.id, s.presentCount, s.absentCount, num(s.clearRatePresent), num(s.clearRateAbsent), num(s.deltaClearRate), num(s.avgDepthPresent), num(s.avgDepthAbsent), num(s.deltaAvgDepth), num(s.avgLootPresent), num(s.avgLootAbsent), num(s.deltaAvgLoot), num(s.share), s.clearPartyCount, s.deathPartyCount, s.sampleTag || "", (s.readTags || []).join(";")].join("\t"));
    });
  });
  return [cols.join("\t"), ...rows].join("\n");
}
function exportSummaryText() {
  if (!lastReport) return "";
  const rep = lastReport;
  const L = [];
  L.push(`[Expedition Observatory] seed ${rep.meta.seed} · 프로필당 ${rep.meta.runs}런`);
  EXPEDITION_ORDER.forEach((id) => { const s = rep.summaries[id]; const c = EXPEDITIONS[id]; L.push(`· ${c.label}(${c.sub}): 승률 ${fmtPct(s.winRate)} / 전멸 ${fmtPct(s.wipeRate)} / 전리품지표 ${fmt1(s.avgLootProxy)} / 평균클리어심도 ${fmt1(s.avgClearDepth)} / 보스문후 +${fmt1(s.avgPostBossReadyDepth)}심도`); });
  const seatHl = ["trapper", "rogue", "bard", "dancer"].map((j) => rep.seat.find((s) => s.job === j)).filter(Boolean);
  L.push("Seat Value(보유−미보유 Δ승률): " + seatHl.map((s) => `${s.name} ${deltaPctText(s.seatWin)}`).join(" / "));
  return L.join("\n");
}
async function copyOut(text, btn, label) { const done = (ok) => { if (btn) { btn.textContent = ok ? "복사됨!" : "복사 실패"; setTimeout(() => { btn.textContent = label; }, 1200); } }; try { await navigator.clipboard.writeText(text); done(true); } catch (e) { try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(true); } catch (e2) { done(false); } } }

/* ════════════════════════════════════════════════════════════════
   Nara Sandbox — UI (stat override editors / presets / import-export / target guide).
   ════════════════════════════════════════════════════════════════ */
let sandbox = emptyOverrides();
let baselineReport = null, variantReport = null; // Baseline↔Variant 비교 슬롯(meta에 seed/runs/overrides 태그)
const cloneOv = (ov) => JSON.parse(JSON.stringify(ov));
const HERO_GROUPS = [
  { tier: "기본", jobs: BASE_JOBS },
  { tier: "1차", jobs: ADVANCED_JOBS },
  { tier: "2차", jobs: SECOND_CLASS_JOBS },
];
// WATCH 직업(나라 요청 — 반드시 포함). id 매핑.
const WATCH_JOBS = new Set(["archer", "watchbow", "rogue", "trapper", "cleric", "saint", "mage", "sage", "bard", "dancer", "swordsaint"]);

// sandbox.hero/monster에 값 set/clear(기본값과 같거나 빈값이면 키 제거 — export 청결).
function setHeroOv(jobId, field, raw) {
  const base = heroBase(jobId)[field];
  const v = (raw === "" || raw == null) ? null : Math.round(Number(raw));
  if (!sandbox.hero[jobId]) sandbox.hero[jobId] = {};
  if (v == null || Number.isNaN(v) || v === base) delete sandbox.hero[jobId][field];
  else sandbox.hero[jobId][field] = Math.max(1, v);
  if (!Object.keys(sandbox.hero[jobId]).length) delete sandbox.hero[jobId];
}
function setMonsterOv(type, field, raw) {
  const base = monsterBase(type)[field];
  const v = (raw === "" || raw == null) ? null : Math.round(Number(raw));
  if (!sandbox.monster[type]) sandbox.monster[type] = {};
  if (v == null || Number.isNaN(v) || v === base) delete sandbox.monster[type][field];
  else sandbox.monster[type][field] = Math.max(1, v);
  if (!Object.keys(sandbox.monster[type]).length) delete sandbox.monster[type];
}
function setMultOv(key, stat, pctRaw) {
  const pct = Number(pctRaw);
  const m = sandbox.mult[key] || (sandbox.mult[key] = { hp: 1, atk: 1 });
  m[stat] = (Number.isNaN(pct) || pct <= 0) ? 1 : Math.max(0.01, Math.min(10, Math.round(pct) / 100));
}

const PRESETS = {
  resetAll: { label: "Reset All", apply: () => { sandbox = emptyOverrides(); } },
  heroHp5:  { label: "Hero HP +5%",   apply: () => setMultOv("heroAll", "hp", 105) },
  heroHp10: { label: "Hero HP +10%",  apply: () => setMultOv("heroAll", "hp", 110) },
  monAtk5:  { label: "Monster ATK -5%",  apply: () => { setMultOv("monNormal", "atk", 95); setMultOv("monElite", "atk", 95); setMultOv("monBoss", "atk", 95); } },
  monAtk10: { label: "Monster ATK -10%", apply: () => { setMultOv("monNormal", "atk", 90); setMultOv("monElite", "atk", 90); setMultOv("monBoss", "atk", 90); } },
  bossHp10: { label: "Boss HP -10%",  apply: () => setMultOv("monBoss", "hp", 90) },
  rogueAtk2:{ label: "Rogue ATK +2",  apply: () => setHeroOv("rogue", "atk", heroBase("rogue").atk + 2) },
  sageHp10: { label: "Sage HP +10",   apply: () => setHeroOv("sage", "maxHp", heroBase("sage").maxHp + 10) },
};
const PRESET_ORDER = ["resetAll", "heroHp5", "heroHp10", "monAtk5", "monAtk10", "bossHp10", "rogueAtk2", "sageHp10"];

// 영웅 편집 표(전 직업 — 그룹/티어, WATCH 강조).
function heroEditorHTML() {
  const rows = HERO_GROUPS.map((g) => {
    const head = `<tr class="eo-grouprow"><td class="txt" colspan="4">${g.tier} 직업</td></tr>`;
    const body = g.jobs.map((j) => {
      const b = heroBase(j), ov = sandbox.hero[j] || {};
      const cell = (f) => `<td><input class="eo-sbnum" type="number" data-sb="hero" data-job="${j}" data-field="${f}" placeholder="${b[f]}" value="${ov[f] != null ? ov[f] : ""}" /></td>`;
      return `<tr class="${WATCH_JOBS.has(j) ? "eo-hl" : ""}"><td class="txt">${esc(jobName(j))}${WATCH_JOBS.has(j) ? ' <span class="eo-tag">WATCH</span>' : ""}</td>${HERO_FIELDS.map(cell).join("")}</tr>`;
    }).join("");
    return head + body;
  }).join("");
  return `<div class="eo-tablewrap"><table><thead><tr><th class="txt">직업</th>${HERO_FIELDS.map((f) => `<th>${FIELD_LABEL[f]}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
// 몹 편집(일반 절대편집) + 정예/보스 참조(배수 안내).
function monsterEditorHTML() {
  const normal = NORMAL_MONSTERS.map((t) => {
    const b = monsterBase(t), ov = sandbox.monster[t] || {};
    const nm = UNIT_TEMPLATES.enemies[t]?.name || t;
    const cell = (f) => `<td><input class="eo-sbnum" type="number" data-sb="monster" data-type="${t}" data-field="${f}" placeholder="${b[f]}" value="${ov[f] != null ? ov[f] : ""}" /></td>`;
    return `<tr><td class="txt">${esc(nm)} <span class="eo-meta">${t}</span></td>${MONSTER_FIELDS.map(cell).join("")}</tr>`;
  }).join("");
  return `<div class="eo-tablewrap"><table><thead><tr><th class="txt">일반 몹(절대 편집)</th>${MONSTER_FIELDS.map((f) => `<th>${FIELD_LABEL[f]}</th>`).join("")}</tr></thead><tbody>${normal}</tbody></table></div>
    <div class="eo-note">정예(${ELITE_TYPES.map((t) => UNIT_TEMPLATES.enemies[t]?.name || t).join("·")})·보스(${UNIT_TEMPLATES.enemies[BOSS_TYPE]?.name || BOSS_TYPE})의 실효 스탯은 <b>코어 상수</b>(정예 RANK_OVERRIDES ${ELITE_REF.maxHp}HP/${ELITE_REF.atk}ATK · 보스 BOSS_FLOOR ${BOSS_FLOOR.hp}HP/${BOSS_FLOOR.atk}ATK · 심도/분노/준비압력 스케일)가 결정합니다 — 템플릿 편집이 닿지 않아 <b>아래 배수(%)</b>로만 조정합니다(정직한 한계).</div>`;
}
function multEditorHTML() {
  const row = (k) => { const m = sandbox.mult[k] || { hp: 1, atk: 1 }; const pct = (x) => Math.round((x == null ? 1 : x) * 100);
    return `<tr><td class="txt">${MULT_LABEL[k]}</td><td><input class="eo-sbnum" type="number" data-sb="mult" data-key="${k}" data-stat="hp" value="${pct(m.hp)}" />%</td><td><input class="eo-sbnum" type="number" data-sb="mult" data-key="${k}" data-stat="atk" value="${pct(m.atk)}" />%</td></tr>`; };
  return `<div class="eo-tablewrap"><table><thead><tr><th class="txt">배수(100=기본)</th><th>HP %</th><th>ATK %</th></tr></thead><tbody>${MULT_KEYS.map(row).join("")}</tbody></table></div>`;
}
function indicatorHTML() {
  const active = hasActiveOverrides(sandbox);
  const list = describeOverrides(sandbox);
  return `<div class="eo-sb-ind ${active ? "on" : ""}">${active
    ? `● Override 적용 중 (${list.length}항목) <span class="eo-meta">${esc(list.slice(0, 8).join(" · "))}${list.length > 8 ? " …" : ""}</span>`
    : "○ Override 없음 — Variant = Baseline과 동일"}</div>`;
}
const GUIDE_RANGES = { bossRush: [0.15, 0.22], oneLoot: [0.20, 0.28], collector: [0.10, 0.16], greed: [0.00, 0.03] };
function guideHTML() {
  return `<div class="eo-note"><b>Beginner Target Guide</b> (dev 판단 보조 — 본게임 룰 아님): 빠른 귀환선
    최단귀환 15~22% · 1전리품 귀환 20~28%(하나 먹고 나가기 선명) · 회수귀환 10~16%(욕심·위험) · 욕심전멸 0~3%. Variant 결과가 범위 밖이면 ↑/↓ 표시.</div>`;
}
function renderSandbox() {
  const el = $("eo-sandbox"); if (!el) return;
  el.innerHTML = `<h3>S. Nara Sandbox <span class="eo-meta">· dev 전용 stat override A/B — 본게임 기본 스탯·코어 무변경(전투 클론에만 적용)</span></h3>
    <div class="eo-note">현재 코드의 영웅/몹 기본 스탯을 읽어 표시합니다. 숫자를 바꾸면 <b>dev 주회의 전투 클론에만</b> 적용되고(원본 템플릿은 읽기만), 같은 seed로 Baseline↔Variant를 비교합니다. 빈칸=기본값. 본게임/저장/발자취 무영향.</div>
    ${indicatorHTML()}
    <div class="eo-sb-presets">${PRESET_ORDER.map((k) => `<button type="button" class="eo-btn ghost eo-sb-mini" data-preset="${k}">${PRESETS[k].label}</button>`).join("")}</div>
    <div class="eo-line"><b>영웅 기본 스탯 편집</b> <span class="eo-meta">절대값(템플릿 대비 delta로 클론 주입) · HP비율 보존 · WATCH 강조</span></div>
    ${heroEditorHTML()}
    <div class="eo-line"><b>몹 스탯 편집</b> <span class="eo-meta">일반=절대 편집 / 정예·보스=배수</span></div>
    ${monsterEditorHTML()}
    <div class="eo-line"><b>배수(%) — 영웅전체 / 일반 / 정예 / 보스</b> <span class="eo-meta">정예·보스 조정 유일 경로(코어 상수 기준 위에 곱)</span></div>
    ${multEditorHTML()}
    <div class="eo-sb-run">
      <span><label>runs/프로필</label><input id="eo-sb-runs" type="number" value="100" /></span>
      <button type="button" id="eo-sb-baseline" class="eo-btn">Run Baseline ▶</button>
      <button type="button" id="eo-sb-variant" class="eo-btn">Run Variant ▶</button>
      <button type="button" id="eo-sb-compare" class="eo-btn">Compare B↔V ▶</button>
      <button type="button" id="eo-sb-ovexport" class="eo-btn ghost">Override JSON 복사</button>
      <button type="button" id="eo-sb-ovimport-btn" class="eo-btn ghost">Override JSON 적용</button>
    </div>
    <textarea id="eo-sb-ovimport" class="eo-sb-ta" placeholder="여기에 Override JSON을 붙여넣고 'Override JSON 적용'을 누르세요"></textarea>
    ${guideHTML()}
    <div class="eo-note">A/B 주의: 같은 seed 비교는 동일 난수표 기반 A/B 실험입니다. 단, 전투 결과 변화 이후에는 런 분기(영입/합체/route)가 달라질 수 있어 완전한 1:1 리플레이는 아닙니다.</div>`;
}
function refreshIndicator() { const host = $("eo-sandbox"); if (!host) return; const ind = host.querySelector(".eo-sb-ind"); if (ind) ind.outerHTML = indicatorHTML(); }

/* ── Baseline vs Variant 비교 렌더 ── */
const CMP_METRICS = [
  { label: "승률(귀환)", get: (s) => s.winRate, pct: true, guide: true },
  { label: "전멸률", get: (s) => s.wipeRate, pct: true },
  { label: "평균 도달 심도", get: (s) => s.avgFinalDepth },
  { label: "평균 전리품 지표 (Loot Proxy)", get: (s) => s.avgLootProxy },
  { label: "보스문 개방률", get: (s) => s.bossReadyRate, pct: true },
  { label: "평균 보스문 심도", get: (s) => s.avgBossReadyDepth },
];
function guideFlag(profileId, winRate) {
  const r = GUIDE_RANGES[profileId]; if (!r || winRate == null) return "";
  if (winRate < r[0]) return ` <span class="eo-tag lo">↓ 목표 ${Math.round(r[0]*100)}~${Math.round(r[1]*100)}%</span>`;
  if (winRate > r[1]) return ` <span class="eo-tag lo">↑ 목표 ${Math.round(r[0]*100)}~${Math.round(r[1]*100)}%</span>`;
  return ` <span class="eo-tag hi">✓ 목표 ${Math.round(r[0]*100)}~${Math.round(r[1]*100)}%</span>`;
}
function renderCompare() {
  const el = $("eo-compare"); if (!el) return;
  if (!baselineReport || !variantReport) { el.innerHTML = ""; return; }
  const sameCond = baselineReport.meta.seed === variantReport.meta.seed && baselineReport.meta.runs === variantReport.meta.runs;
  const condNote = sameCond ? `seed ${variantReport.meta.seed} · 프로필당 ${variantReport.meta.runs}런 · 동일 조건 A/B`
    : `<span class="eo-tag lo">조건 불일치</span> Baseline(seed ${baselineReport.meta.seed}/${baselineReport.meta.runs}런) ↔ Variant(seed ${variantReport.meta.seed}/${variantReport.meta.runs}런) — 다시 같은 조건으로 실행 권장`;
  const ovList = describeOverrides(variantReport.meta.overrides || emptyOverrides());
  const profBlock = (id) => {
    const bs = baselineReport.summaries[id], vs = variantReport.summaries[id], c = EXPEDITIONS[id];
    const rows = CMP_METRICS.map((m) => {
      const bv = m.get(bs), vv = m.get(vs);
      const d = (bv != null && vv != null) ? vv - bv : null;
      const dCell = m.pct ? deltaPct(d) : delta(d);
      const flag = (m.guide ? guideFlag(id, vv) : "");
      const fmt = m.pct ? fmtPct : fmt1;
      return `<tr><td class="txt">${m.label}</td><td>${fmt(bv)}</td><td class="${m.guide && (vv||0) > 0 ? "clear" : ""}">${fmt(vv)}${flag}</td><td>${dCell}</td></tr>`;
    }).join("");
    return `<div class="eo-line"><b>${esc(c.label)}</b> <span class="eo-meta">${esc(c.sub)}</span></div>
      <div class="eo-tablewrap"><table><thead><tr><th class="txt">지표</th><th>Baseline</th><th>Variant</th><th>Δ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  // WATCH 직업 Final lens seat 변화(present clearRate base↔var).
  const bFinal = baselineReport.lensSeat.final, vFinal = variantReport.lensSeat.final;
  const seatRows = [...WATCH_JOBS].map((j) => {
    const b = bFinal.find((s) => s.job === j), v = vFinal.find((s) => s.job === j); if (!b || !v) return "";
    const d = (b.clearRatePresent != null && v.clearRatePresent != null) ? v.clearRatePresent - b.clearRatePresent : null;
    return `<tr><td class="txt">${esc(jobName(j))}</td><td>${b.presentCount}→${v.presentCount}</td><td>${fmtPct(b.clearRatePresent)}</td><td class="${(v.clearRatePresent||0)>0?"clear":""}">${fmtPct(v.clearRatePresent)}</td><td>${deltaPct(d)}</td></tr>`;
  }).join("");
  el.innerHTML = `<h3>F. Baseline ↔ Variant <span class="eo-meta">· ${condNote}</span></h3>
    <div class="eo-note"><b>Variant override:</b> ${ovList.length ? esc(ovList.join(" · ")) : "없음(=Baseline)"} </div>
    ${EXPEDITION_ORDER.map(profBlock).join("")}
    <div class="eo-line"><b>WATCH 직업 자리값 변화 (Final lens · present clearRate)</b></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">직업</th><th>present B→V</th><th>Base P승률</th><th>Var P승률</th><th>Δ</th></tr></thead><tbody>${seatRows || `<tr><td colspan="5" class="eo-meta">표본 없음</td></tr>`}</tbody></table></div>`;
}

/* ════════════════════════════════════════════════════════════════
   Phase 2D — Copy Experiment Summary: Baseline↔Variant 결과를 사람이 읽는 텍스트로.
   나라가 표를 일일이 설명하지 않고 유키에게 붙여넣으면 바로 해석되게.
   ════════════════════════════════════════════════════════════════ */
const TOOL_PHASE = "3B"; // Phase 3B — One Loot Failure Breakdown (experiment/multiseed 요약 phase 라벨도 이 상수 공유)
const pctT = (v) => (v == null ? "—" : (Math.round(v * 1000) / 10).toFixed(1) + "%");
const ppT = (v) => (v == null ? "—" : (v > 0 ? "+" : "") + (Math.round(v * 1000) / 10).toFixed(1) + "%p");
const n1T = (v) => (v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1));
const dn1T = (v) => (v == null ? "—" : (v > 0 ? "+" : "") + (Math.round(v * 10) / 10).toFixed(1));
const profLine = (s) => `win ${pctT(s.winRate)}, wipe ${pctT(s.wipeRate)}, depth ${n1T(s.avgFinalDepth)}, 전리품지표 ${n1T(s.avgLootProxy)}, bossReady ${pctT(s.bossReadyRate)}, bossReadyDepth ${n1T(s.avgBossReadyDepth)}`;
function targetCheckLine(id, winRate) {
  const r = GUIDE_RANGES[id]; if (!r) return "";
  const lbl = EXPEDITIONS[id].label, lo = Math.round(r[0] * 100), hi = Math.round(r[1] * 100);
  let verdict;
  if (winRate == null) verdict = "데이터 없음";
  else if (winRate < r[0]) verdict = `${pctT(winRate)} → 목표 ${lo}~${hi}% 미만(↓)`;
  else if (winRate > r[1]) verdict = `${pctT(winRate)} → 목표 ${lo}~${hi}% 초과(↑)`;
  else verdict = `${pctT(winRate)} → 목표 ${lo}~${hi}% 범위 내(✓)`;
  return `- ${lbl}: ${verdict}`;
}
// baseRep/varRep(둘 다 있으면 full B/V/diff, 하나만 있으면 단일 요약). 없으면 null.
//   인자 미지정 시 모듈 전역(baselineReport/variantReport) 사용 — 실제 호출부는 인자 없이 호출(동작 동일).
//   export = dev 검증(Node)에서 합성 리포트로 직접 테스트 가능하게.
export function buildExperimentSummary(baseRep = baselineReport, varRep = variantReport) {
  const both = baseRep && varRep;
  if (!both && !(baseRep || varRep)) return null;
  const ref = varRep || baseRep;
  const L = [];
  L.push("[Expedition Observatory Experiment Summary]");
  L.push("phase: " + TOOL_PHASE);
  L.push("seed: " + ref.meta.seed);
  L.push("runs/profile: " + ref.meta.runs);
  L.push("profiles: " + EXPEDITION_ORDER.map((id) => EXPEDITIONS[id].label).join(", "));
  L.push("generated: " + new Date().toISOString());
  const ov = varRep && varRep.meta.overrides;
  L.push("override(Variant): " + ((ov && describeOverrides(ov).length) ? describeOverrides(ov).join(" · ") : "없음"));

  if (!both) {
    const r = baseRep || varRep;
    const which = baseRep ? "Baseline" : "Variant";
    L.push("");
    L.push(`(${which}만 실행됨 — Baseline↔Variant 비교는 Compare 실행 후 다시 복사하세요)`);
    L.push("", which + ":");
    EXPEDITION_ORDER.forEach((id) => L.push(`* ${EXPEDITIONS[id].label}: ${profLine(r.summaries[id])}`));
  } else {
    L.push("", "Baseline:");
    EXPEDITION_ORDER.forEach((id) => L.push(`* ${EXPEDITIONS[id].label}: ${profLine(baseRep.summaries[id])}`));
    L.push("", "Variant:");
    EXPEDITION_ORDER.forEach((id) => L.push(`* ${EXPEDITIONS[id].label}: ${profLine(varRep.summaries[id])}`));
    L.push("", "Diff (Variant − Baseline):");
    EXPEDITION_ORDER.forEach((id) => {
      const b = baseRep.summaries[id], v = varRep.summaries[id];
      const sub = (k) => (b[k] != null && v[k] != null) ? v[k] - b[k] : null;
      L.push(`* ${EXPEDITIONS[id].label}: win ${ppT(sub("winRate"))}, depth ${dn1T(sub("avgFinalDepth"))}, 전리품지표 ${dn1T(sub("avgLootProxy"))}, bossReady ${ppT(sub("bossReadyRate"))}`);
    });
    L.push("", "목표 범위 점검 (Variant 승률 기준):");
    EXPEDITION_ORDER.forEach((id) => L.push(targetCheckLine(id, varRep.summaries[id].winRate)));
    const bFinal = baseRep.lensSeat.final, vFinal = varRep.lensSeat.final;
    const seatDeltas = [...WATCH_JOBS].map((j) => {
      const b = bFinal.find((s) => s.job === j), v = vFinal.find((s) => s.job === j);
      if (!b || !v || b.clearRatePresent == null || v.clearRatePresent == null) return null;
      return { name: jobName(j), b: b.clearRatePresent, v: v.clearRatePresent, d: v.clearRatePresent - b.clearRatePresent, bp: b.presentCount, vp: v.presentCount };
    }).filter(Boolean).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    L.push("", "주요 직업 변화 (WATCH · Final lens present clearRate, |Δ| 상위):");
    if (seatDeltas.length) seatDeltas.slice(0, 6).forEach((s) => L.push(`* ${s.name}: ${pctT(s.b)}→${pctT(s.v)} (${ppT(s.d)}, present ${s.bp}→${s.vp})`));
    else L.push("* (표본 부족 — WATCH lens diff는 UI 표 참고)");
  }
  L.push("", "해석 주의:");
  L.push("- 같은 seed 비교는 동일 난수표 기반 A/B 실험이지만, 전투 결과 변화 이후 런 분기가 달라질 수 있어 완전한 1:1 리플레이는 아닙니다.");
  L.push("- Loot Proxy(전리품 지표)는 실제 획득 아이템 개수가 아니라 dev-only 임시 지표입니다(깊이/위험/정예/보스 열쇠/심층 보상/보스문 후 욕심 등 귀환 가치 합산).");
  L.push("- Seed Finder는 sandbox override를 적용하지 않는 코드 기본값 기준 자연 주회 탐색입니다.");
  return L.join("\n");
}

/* ════════════════════════════════════════════════════════════════
   Phase 3B — One Loot Failure Breakdown : 텍스트 / JSON / 렌더.
   단일 Baseline/Variant breakdown이 핵심. 둘 다 있으면 Baseline→Variant diff. estimated 기준·다음 실험 힌트 포함.
   ════════════════════════════════════════════════════════════════ */
// 리포트에 부착된 breakdown(없으면 profiles.oneLoot로 즉석 계산 — Node 합성 리포트 검증 대비).
const olBd = (rep) => (rep ? (rep.oneLootBreakdown || (rep.profiles && computeOneLootBreakdown(rep.profiles.oneLoot || [])) || null) : null);
const olSgn = (d) => (d == null ? "—" : (d > 0 ? "+" + d : "" + d));
const olOverrideText = (ref, varRep) => { const ov = (varRep && varRep.meta.overrides) || (ref && ref.meta.overrides); return (ov && describeOverrides(ov).length) ? describeOverrides(ov).join(" · ") : "없음"; };
const olCriteriaText = `우선순위 = 보스 시도 > 보스문 후 > 보스문 전(상호배타). 보스문 열기 전 = 보스문/보스시도 마커 없음 · 보스문 후·보스 도전 전 = 보스문 열림+보스 미시도+보스문 후 +${OL_GREED_AFTER_DOOR}심도 미만 · 보스 도전 패배 = 보스 시도 후 전멸 · 보스문 후 욕심 = 보스문 후 +${OL_GREED_AFTER_DOOR}심도 이상 진행 후 전멸. 보조 tag(primary와 중복 가능): 너무 이른 붕괴 = 전멸심도 ≤${OL_EARLY_DEPTH} 또는 최종 파티 ≤3. 전부 run record 심도 마커 기반 추정(estimated) — event schema 미확장.`;

// dev-only 다음 실험 힌트(자동 밸런스 변경 절대 없음 — 텍스트 제안만).
function oneLootHints(bd) {
  if (!bd || !bd.defeat) return ["전멸 표본이 없어 분해할 게 없습니다 — runs를 늘리거나 다른 seed를 시도하세요."];
  const out = [], b = bd.buckets, dn = bd.defeat;
  const top = OL_BUCKET_ORDER.filter((k) => k !== "unknown").map((k) => [k, b[k]]).reduce((a, c) => (c[1] > a[1] ? c : a), ["", -1]);
  if (top[0] === "preBossReadyWipe") out.push("preBossReadyWipe 우세 → 초중반 안정성 / 파티 4인 완성 / 영입 곡선 확인.");
  else if (top[0] === "bossAttemptWipe") out.push("bossAttemptWipe 우세 → 보스 전환부 / 보스 HP / 보스 피해량 확인.");
  else if (top[0] === "postBossReadyGreedWipe") out.push("postBossReadyGreedWipe 우세 → 귀환 유도 / 보스문 이후 욕심 제어 확인.");
  else if (top[0] === "postBossReadyPreBossWipe") out.push("postBossReadyPreBossWipe 우세 → 보스문 이후 위험 루트 / 쉼터 / 귀환 판단 확인.");
  if (bd.roleGaps.noHealer >= dn * 0.5 || bd.roleGaps.noTank >= dn * 0.5) out.push("전멸 다수가 힐러/탱커 결핍 → 영입 / 합체 / 역할 조합 안정성 확인.");
  if (b.unknown >= dn * 0.2) out.push("unknown 비중 큼 → 추가 run marker가 필요할 수 있음(단, 이번 Phase에서는 event schema 확장 금지).");
  return out.length ? out : ["뚜렷한 단일 실패 축이 없습니다 → seed/override를 바꿔 방향성을 재확인하세요."];
}

// export(JSON용) — 전역 baselineReport/variantReport의 breakdown(집계만). 둘 다 없으면 null.
function oneLootBreakdownExport() {
  const b = olBd(baselineReport), v = olBd(variantReport);
  if (!b && !v) return null;
  return { baseline: b || null, variant: v || null };
}

// export = Node 검증에서 합성 리포트로 직접 테스트 가능. 인자 미지정 시 전역 baselineReport/variantReport.
export function buildOneLootBreakdownText(baseRep = baselineReport, varRep = variantReport) {
  const ref = varRep || baseRep;
  if (!ref) return null;
  const bd = olBd(ref), bb = olBd(baseRep), vb = olBd(varRep);
  if (!bd) return null;
  const both = !!(baseRep && varRep);
  const which = both ? "Variant(기준)" : (varRep ? "Variant" : "Baseline");
  const L = [];
  L.push("[One Loot Failure Breakdown · 1전리품 실패 해부]");
  L.push("phase: " + TOOL_PHASE);
  L.push("seed: " + ref.meta.seed);
  L.push("runs/profile: " + ref.meta.runs);
  L.push("override(Variant): " + olOverrideText(ref, varRep));
  L.push("generated: " + new Date().toISOString());
  L.push("", `[${which}] One Loot — total ${bd.total} · clear ${bd.clear} (${pctT(bd.clearRate)}) · defeat ${bd.defeat} (${pctT(bd.defeatRate)})`);
  L.push("", "Primary failure buckets (defeat 기준, mutually exclusive · estimated):");
  OL_BUCKET_ORDER.forEach((k) => L.push(`* ${OL_BUCKET_LABELS[k]} (${k}): ${bd.buckets[k]}`));
  L.push(`보조 tag — 너무 이른 붕괴(earlyPartyWipe, primary와 중복 가능): ${bd.earlyPartyWipe}`);
  L.push("", "Role gaps among defeats:");
  OL_GAP_ORDER.forEach((k) => L.push(`* ${OL_GAP_LABELS[k]} (${k}): ${bd.roleGaps[k]}/${bd.defeat}`));
  L.push("WATCH 보유(전멸 파티): " + OL_WATCH_JOBS.map((j) => `${jobName(j)} ${bd.watchPresentDefeat[j]}/${bd.defeat}`).join(" · "));
  const cs = bd.clearStats, ds = bd.defeatStats;
  L.push("", `Clear vs Defeat (평균, ${which}):`);
  L.push(`* count: clear ${cs.count} / defeat ${ds.count}`);
  L.push(`* 평균 도달 심도: clear ${n1T(cs.avgFinalDepth)} / defeat ${n1T(ds.avgFinalDepth)}`);
  L.push(`* 전멸 심도: defeat ${n1T(ds.avgDeathDepth)} (clear 해당없음)`);
  L.push(`* 보스문 심도: clear ${n1T(cs.avgBossReadyDepth)} / defeat ${n1T(ds.avgBossReadyDepth)}`);
  L.push(`* 보스 시도 심도: clear ${n1T(cs.avgBossAttemptDepth)} / defeat ${n1T(ds.avgBossAttemptDepth)}`);
  L.push(`* 보스문 후 추가 심도: clear ${n1T(cs.avgPostBossReadyDepth)} / defeat ${n1T(ds.avgPostBossReadyDepth)}`);
  L.push(`* 전리품 지표: clear ${n1T(cs.avgLootProxy)} / defeat ${n1T(ds.avgLootProxy)}`);
  L.push(`* 평균 파티 크기: clear ${n1T(cs.avgPartySize)} / defeat ${n1T(ds.avgPartySize)}`);
  L.push(`* healer rate: clear ${pctT(cs.healerRate)} / defeat ${pctT(ds.healerRate)}`);
  L.push(`* tank rate: clear ${pctT(cs.tankRate)} / defeat ${pctT(ds.tankRate)}`);
  L.push(`* AoE rate: clear ${pctT(cs.aoeRate)} / defeat ${pctT(ds.aoeRate)}`);
  L.push(`* shield rate: clear ${pctT(cs.shieldRate)} / defeat ${pctT(ds.shieldRate)}`);
  L.push(`* 2nd class rate: clear ${pctT(cs.secondRate)} / defeat ${pctT(ds.secondRate)}`);
  L.push("* WATCH present rate(clear→defeat): " + OL_WATCH_JOBS.map((j) => `${jobName(j)} ${pctT(cs.watchRate[j])}→${pctT(ds.watchRate[j])}`).join(" · "));
  if (bb && vb) {
    L.push("", "Baseline → Variant diff:");
    L.push(`* clear rate: ${pctT(bb.clearRate)} → ${pctT(vb.clearRate)} / Δ ${ppT((vb.clearRate || 0) - (bb.clearRate || 0))}`);
    OL_BUCKET_ORDER.forEach((k) => L.push(`* ${k}: ${bb.buckets[k]} → ${vb.buckets[k]} / Δ ${olSgn(vb.buckets[k] - bb.buckets[k])}`));
    OL_GAP_ORDER.forEach((k) => L.push(`* ${k}: ${bb.roleGaps[k]} → ${vb.roleGaps[k]} / Δ ${olSgn(vb.roleGaps[k] - bb.roleGaps[k])}`));
  }
  L.push("", "다음 실험 힌트 (dev-only · 자동 밸런스 변경 아님):");
  oneLootHints(bd).forEach((h) => L.push("- " + h));
  L.push("", "estimated/주의:");
  L.push("- 모든 분류는 run record 심도 마커(bossReadyDepth/bossAttemptDepth/postBossReadyDepth/deathDepth) 기반 추정입니다 — event schema는 확장하지 않았습니다.");
  L.push(`- 보스문 후 욕심 임계 = +${OL_GREED_AFTER_DOOR}심도, 너무 이른 붕괴 = 전멸심도 ≤${OL_EARLY_DEPTH} 또는 파티 ≤3 (보조 tag, primary와 중복 가능).`);
  L.push("- Loot Proxy(전리품 지표)는 실제 아이템 개수가 아니라 dev-only 임시 지표입니다.");
  L.push("- One Loot Failure Breakdown은 단일 스탯 튜닝 정답이 아니라 실패 축 진단입니다(밸런스 확정 아님).");
  return L.join("\n");
}

function renderOneLootBreakdown() {
  const el = $("eo-ol-out");
  if (!el) return;
  const ref = variantReport || baselineReport;
  const bd = olBd(ref);
  if (!ref || !bd) { el.innerHTML = `<div class="eo-empty">Baseline / Variant(또는 Compare)를 실행하면 One Loot 프로필 전멸 해부가 여기에 표시됩니다.</div>`; return; }
  const bb = olBd(baselineReport), vb = olBd(variantReport), both = !!(bb && vb);
  const which = both ? "Variant(기준)" : (variantReport ? "Variant" : "Baseline");
  const metaLine = `<div class="eo-line"><b>${esc(which)}</b> <span class="eo-meta">· seed ${ref.meta.seed} · 프로필당 ${ref.meta.runs}런 · override ${esc(olOverrideText(ref, variantReport))} · <span class="eo-tag lo">estimated</span></span></div>
    <div class="eo-srow"><span>total</span><b>${bd.total}</b> <span>clear</span><b class="clear">${bd.clear} (${pctT(bd.clearRate)})</b> <span>defeat</span><b class="wipe">${bd.defeat} (${pctT(bd.defeatRate)})</b></div>`;
  const clearDiff = both ? `<div class="eo-srow"><span>clear rate (B→V)</span><b>${pctT(bb.clearRate)} → ${pctT(vb.clearRate)}</b> ${deltaPct((vb.clearRate || 0) - (bb.clearRate || 0))}</div>` : "";
  // Primary buckets
  const bucketHead = both ? `<th class="txt">실패 버킷 (defeat ${bd.defeat})</th><th>Baseline</th><th>Variant</th><th>Δ</th>` : `<th class="txt">실패 버킷 (defeat ${bd.defeat})</th><th>${esc(which)}</th>`;
  const bucketRows = OL_BUCKET_ORDER.map((k) => both
    ? `<tr><td class="txt">${esc(OL_BUCKET_LABELS[k])} <span class="eo-meta">${k}</span></td><td>${bb.buckets[k]}</td><td>${vb.buckets[k]}</td><td>${olSgn(vb.buckets[k] - bb.buckets[k])}</td></tr>`
    : `<tr><td class="txt">${esc(OL_BUCKET_LABELS[k])} <span class="eo-meta">${k}</span></td><td>${bd.buckets[k]}</td></tr>`).join("");
  const earlyRow = both
    ? `<tr><td class="txt eo-indent">· 너무 이른 붕괴 <span class="eo-meta">earlyPartyWipe · 보조 tag</span></td><td>${bb.earlyPartyWipe}</td><td>${vb.earlyPartyWipe}</td><td>${olSgn(vb.earlyPartyWipe - bb.earlyPartyWipe)}</td></tr>`
    : `<tr><td class="txt eo-indent">· 너무 이른 붕괴 <span class="eo-meta">earlyPartyWipe · 보조 tag</span></td><td>${bd.earlyPartyWipe}</td></tr>`;
  const bucketTable = `<div class="eo-line"><b>Primary failure buckets</b> <span class="eo-meta">mutually exclusive · defeat 기준</span></div>
    <div class="eo-tablewrap"><table><thead><tr>${bucketHead}</tr></thead><tbody>${bucketRows}${earlyRow}</tbody></table></div>`;
  // Role gaps
  const gapHead = both ? `<th class="txt">역할 결핍 (defeat ${bd.defeat})</th><th>Baseline</th><th>Variant</th><th>Δ</th>` : `<th class="txt">역할 결핍 (defeat ${bd.defeat})</th><th>${esc(which)}</th>`;
  const gapRows = OL_GAP_ORDER.map((k) => both
    ? `<tr><td class="txt">${esc(OL_GAP_LABELS[k])} <span class="eo-meta">${k}</span></td><td>${bb.roleGaps[k]}/${bb.defeat}</td><td>${vb.roleGaps[k]}/${vb.defeat}</td><td>${olSgn(vb.roleGaps[k] - bb.roleGaps[k])}</td></tr>`
    : `<tr><td class="txt">${esc(OL_GAP_LABELS[k])} <span class="eo-meta">${k}</span></td><td>${bd.roleGaps[k]}/${bd.defeat}</td></tr>`).join("");
  const watchRow = both
    ? `<tr><td class="txt eo-indent">· WATCH 보유 <span class="eo-meta">${esc(OL_WATCH_JOBS.map(jobName).join("/"))}</span></td><td>${OL_WATCH_JOBS.map((j) => bb.watchPresentDefeat[j]).join("·")}</td><td>${OL_WATCH_JOBS.map((j) => vb.watchPresentDefeat[j]).join("·")}</td><td></td></tr>`
    : `<tr><td class="txt eo-indent">· WATCH 보유 <span class="eo-meta">${esc(OL_WATCH_JOBS.map(jobName).join("/"))}</span></td><td>${OL_WATCH_JOBS.map((j) => bd.watchPresentDefeat[j]).join("·")}</td></tr>`;
  const gapTable = `<div class="eo-line"><b>Role gaps among defeats</b> <span class="eo-meta">전멸 파티 역할 결핍 수 / 전멸 수</span></div>
    <div class="eo-tablewrap"><table><thead><tr>${gapHead}</tr></thead><tbody>${gapRows}${watchRow}</tbody></table></div>`;
  // Clear vs Defeat (기준 리포트)
  const cs = bd.clearStats, ds = bd.defeatStats;
  const cv = (label, c, d) => `<tr><td class="txt">${esc(label)}</td><td>${c}</td><td>${d}</td></tr>`;
  const cvTable = `<div class="eo-line"><b>Clear vs Defeat</b> <span class="eo-meta">${esc(which)} · One Loot 평균</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">지표</th><th>Clear (${cs.count})</th><th>Defeat (${ds.count})</th></tr></thead><tbody>
      ${cv("평균 도달 심도", n1T(cs.avgFinalDepth), n1T(ds.avgFinalDepth))}
      ${cv("전멸 심도", n1T(cs.avgDeathDepth), n1T(ds.avgDeathDepth))}
      ${cv("보스문 심도", n1T(cs.avgBossReadyDepth), n1T(ds.avgBossReadyDepth))}
      ${cv("보스 시도 심도", n1T(cs.avgBossAttemptDepth), n1T(ds.avgBossAttemptDepth))}
      ${cv("보스문 후 추가 심도", n1T(cs.avgPostBossReadyDepth), n1T(ds.avgPostBossReadyDepth))}
      ${cv("전리품 지표", n1T(cs.avgLootProxy), n1T(ds.avgLootProxy))}
      ${cv("평균 파티 크기", n1T(cs.avgPartySize), n1T(ds.avgPartySize))}
      ${cv("힐러 보유율", pctT(cs.healerRate), pctT(ds.healerRate))}
      ${cv("탱커 보유율", pctT(cs.tankRate), pctT(ds.tankRate))}
      ${cv("광역 보유율", pctT(cs.aoeRate), pctT(ds.aoeRate))}
      ${cv("보호막 보유율", pctT(cs.shieldRate), pctT(ds.shieldRate))}
      ${cv("2차직업 보유율", pctT(cs.secondRate), pctT(ds.secondRate))}
      ${OL_WATCH_JOBS.map((j) => cv("WATCH " + jobName(j) + " 보유율", pctT(cs.watchRate[j]), pctT(ds.watchRate[j]))).join("")}
    </tbody></table></div>`;
  const hints = oneLootHints(bd).map((h) => `<div class="eo-ev">• ${esc(h)}</div>`).join("");
  el.innerHTML = metaLine + clearDiff
    + `<div class="eo-note"><b>분류 기준 (estimated)</b> ${esc(olCriteriaText)}</div>`
    + bucketTable + gapTable + cvTable
    + `<div class="eo-note"><b>다음 실험 힌트</b> <span class="eo-meta">dev-only · 자동 밸런스 변경 아님</span>${hints}</div>`;
}

/* ── Override / Sandbox export ── */
function exportOverrideJSON() {
  return JSON.stringify({ tool: "expedition-observatory", kind: "stat-overrides", generatedAt: new Date().toISOString(), summary: describeOverrides(sandbox), overrides: sandbox }, null, 2);
}
// import: 알려진 job/type/field만 허용(안전 sanitize).
function importOverrideJSON(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return { ok: false, msg: "JSON 파싱 실패" }; }
  const src = parsed && parsed.overrides ? parsed.overrides : parsed;
  if (!src || typeof src !== "object") return { ok: false, msg: "overrides 객체 없음" };
  const next = emptyOverrides();
  const allJobs = new Set(ALL_JOBS);
  if (src.hero && typeof src.hero === "object") for (const j in src.hero) { if (!allJobs.has(j)) continue; const oh = src.hero[j]; if (!oh || typeof oh !== "object") continue; HERO_FIELDS.forEach((f) => { const v = oh[f]; if (v != null && !Number.isNaN(Number(v))) { next.hero[j] = next.hero[j] || {}; next.hero[j][f] = Math.max(1, Math.round(Number(v))); } }); if (next.hero[j] && !Object.keys(next.hero[j]).length) delete next.hero[j]; }
  if (src.monster && typeof src.monster === "object") for (const t in src.monster) { if (!NORMAL_MONSTERS.includes(t)) continue; const om = src.monster[t]; if (!om || typeof om !== "object") continue; MONSTER_FIELDS.forEach((f) => { const v = om[f]; if (v != null && !Number.isNaN(Number(v))) { next.monster[t] = next.monster[t] || {}; next.monster[t][f] = Math.max(1, Math.round(Number(v))); } }); if (next.monster[t] && !Object.keys(next.monster[t]).length) delete next.monster[t]; }
  if (src.mult && typeof src.mult === "object") for (const k of MULT_KEYS) { const m = src.mult[k]; if (!m) continue; ["hp", "atk"].forEach((s) => { const v = Number(m[s]); if (!Number.isNaN(v) && v > 0) next.mult[k][s] = Math.max(0.01, Math.min(10, v)); }); }
  sandbox = next;
  return { ok: true, msg: `적용됨 (${describeOverrides(sandbox).length}항목)` };
}

/* ── 실행(Baseline / Variant) ── */
let running = false;
function setRunningUI(on) {
  ["eo-run100", "eo-run300", "eo-sb-baseline", "eo-sb-variant", "eo-sb-compare", "eo-sf-run", "eo-ms-run"].forEach((id) => { const b = $(id); if (b) b.disabled = on; });
}
function readSeed() { const r = parseInt($("eo-seed").value, 10); return Number.isNaN(r) ? 405 : r; }
function readSbRuns() { const r = parseInt(($("eo-sb-runs") || {}).value, 10); return (Number.isNaN(r) || r < 1) ? 100 : Math.min(500, r); }

async function execRun(runs, overrides) {
  const seed = readSeed();
  const status = $("eo-status");
  const label = overrides && hasActiveOverrides(overrides) ? "Variant" : "Baseline";
  status.textContent = `${label} 실행 중… (seed ${seed} · 프로필당 ${runs}런)`;
  const profiles = await runExpeditionAll({ seed, runs, overrides, onProgress: (id, done, complete) => { status.textContent = complete ? `${label} · ${EXPEDITIONS[id].label} 완료…` : `${label} · ${EXPEDITIONS[id].label} ${done}런…`; } });
  return buildReport(profiles, { seed, runs, overrides: overrides ? cloneOv(overrides) : null });
}

// 상단 100/300 = baseline. mode: "baseline" | "variant".
async function runObservatory(runs, mode = "baseline") {
  if (running) return; running = true; setRunningUI(true);
  const status = $("eo-status");
  try {
    const overrides = mode === "variant" ? cloneOv(sandbox) : null;
    const rep = await execRun(runs, overrides);
    lastReport = rep;
    if (mode === "variant") variantReport = rep; else baselineReport = rep;
    renderAll(lastReport);
    renderCompare();
    renderOneLootBreakdown();
    status.textContent = `${mode === "variant" ? "Variant" : "Baseline"} 완료 — seed ${rep.meta.seed} · 프로필당 ${runs}런 · 결합 ${rep.combined.length}런`;
  } catch (e) {
    status.textContent = "에러: " + (e && e.message); console.error(e);
  } finally { setRunningUI(false); running = false; }
}
async function runCompareSeq() {
  if (running) return; running = true; setRunningUI(true);
  const status = $("eo-status");
  const runs = readSbRuns();
  try {
    status.textContent = "Compare — Baseline 먼저…";
    baselineReport = await execRun(runs, null);
    status.textContent = "Compare — Variant 다음…";
    variantReport = await execRun(runs, cloneOv(sandbox));
    lastReport = variantReport;
    renderAll(lastReport);
    renderCompare();
    renderOneLootBreakdown();
    status.textContent = `Compare 완료 — seed ${variantReport.meta.seed} · 프로필당 ${runs}런 (Baseline↔Variant)`;
    $("eo-compare").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    status.textContent = "에러: " + (e && e.message); console.error(e);
  } finally { setRunningUI(false); running = false; }
}

/* ════════════════════════════════════════════════════════════════
   Phase 3A — Multi-Seed Experiment Queue.
   같은 Variant(현재 Stat Override)를 여러 seed에서 반복 비교 — 단일 seed 우연 vs 방향성 확인용 dev 관측.
   ★기존 Compare 계산 경로를 그대로 감싼다(runExpeditionAll + buildReport per seed). override/seed-finder/단일 Compare 로직 무변경.
   ════════════════════════════════════════════════════════════════ */
const MS_MAX_SEEDS = 5;
let lastMultiSeed = null;
let msRunning = false, msCancel = false;
const meanOf = (arr) => { const xs = arr.filter((v) => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
const subN = (a, b) => (a != null && b != null) ? a - b : null;

// seed list 파싱: 쉼표/공백/줄바꿈 구분, 양의 정수만, 중복 제거(순서 유지), 상한 MS_MAX_SEEDS.
function parseSeedList(raw) {
  const toks = String(raw || "").split(/[\s,]+/).filter((t) => t.length);
  const seen = new Set(); const seeds = []; let invalid = 0;
  for (const t of toks) {
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0 || n > 99999999) { invalid++; continue; }
    if (!seen.has(n)) { seen.add(n); seeds.push(n); }
  }
  const capped = seeds.length > MS_MAX_SEEDS;
  return { seeds: seeds.slice(0, MS_MAX_SEEDS), invalid, capped, total: seeds.length };
}

const seedProfileMetrics = (rep, id) => { const s = rep.summaries[id]; return { winRate: s.winRate, wipeRate: s.wipeRate, avgFinalDepth: s.avgFinalDepth, avgLootProxy: s.avgLootProxy, bossReadyRate: s.bossReadyRate, avgBossReadyDepth: s.avgBossReadyDepth }; };
// 한 seed의 baseline/variant 리포트 → 컴팩트 결과(프로필별 base/var/diff/target + WATCH lens).
function buildSeedResult(seed, baseRep, varRep) {
  const profiles = {};
  EXPEDITION_ORDER.forEach((id) => {
    const b = seedProfileMetrics(baseRep, id), v = seedProfileMetrics(varRep, id);
    const diff = { win: subN(v.winRate, b.winRate), depth: subN(v.avgFinalDepth, b.avgFinalDepth), loot: subN(v.avgLootProxy, b.avgLootProxy), bossReady: subN(v.bossReadyRate, b.bossReadyRate), bossReadyDepth: subN(v.avgBossReadyDepth, b.avgBossReadyDepth) };
    const r = GUIDE_RANGES[id];
    const targetRange = r ? { lo: r[0], hi: r[1], winRate: v.winRate, inRange: v.winRate != null && v.winRate >= r[0] && v.winRate <= r[1] } : null;
    profiles[id] = { baseline: b, variant: v, diff, targetRange };
  });
  const lensFinal = {};
  [...WATCH_JOBS].forEach((j) => {
    const b = baseRep.lensSeat.final.find((s) => s.job === j), v = varRep.lensSeat.final.find((s) => s.job === j);
    if (!b || !v) return;
    lensFinal[j] = { name: jobName(j), baseClear: b.clearRatePresent, varClear: v.clearRatePresent, dClear: subN(v.clearRatePresent, b.clearRatePresent), basePresent: b.presentCount, varPresent: v.presentCount };
  });
  return { seed, profiles, lensFinal };
}
// seedResults → 집계(프로필 평균 diff / target pass count / WATCH 평균 변화 top6).
function finalizeMultiSeed(seeds, runs, overrides, seedResults) {
  const aggregateDiffs = {}, targetRangePassCounts = {};
  EXPEDITION_ORDER.forEach((id) => {
    const diffs = seedResults.map((sr) => sr.profiles[id].diff);
    aggregateDiffs[id] = { win: meanOf(diffs.map((d) => d.win)), depth: meanOf(diffs.map((d) => d.depth)), loot: meanOf(diffs.map((d) => d.loot)), bossReady: meanOf(diffs.map((d) => d.bossReady)), bossReadyDepth: meanOf(diffs.map((d) => d.bossReadyDepth)) };
    const tr = GUIDE_RANGES[id];
    const pass = seedResults.filter((sr) => sr.profiles[id].targetRange && sr.profiles[id].targetRange.inRange).length;
    targetRangePassCounts[id] = { pass, total: seedResults.length, lo: tr ? tr[0] : null, hi: tr ? tr[1] : null };
  });
  const jobAgg = {};
  seedResults.forEach((sr) => { for (const j in sr.lensFinal) { const e = sr.lensFinal[j]; if (e.dClear == null) continue; const a = (jobAgg[j] = jobAgg[j] || { name: e.name, ds: [], bp: [], vp: [] }); a.ds.push(e.dClear); a.bp.push(e.basePresent); a.vp.push(e.varPresent); } });
  const watchFinalLensTopChanges = Object.entries(jobAgg).map(([job, a]) => ({ job, name: a.name, meanDClear: meanOf(a.ds), seeds: a.ds.length, avgBasePresent: meanOf(a.bp), avgVarPresent: meanOf(a.vp) }))
    .filter((x) => x.meanDClear != null).sort((a, b) => Math.abs(b.meanDClear) - Math.abs(a.meanDClear)).slice(0, 6);
  return { seeds, runsPerProfile: runs, profiles: EXPEDITION_ORDER.slice(), statOverrideSummary: overrides ? describeOverrides(overrides) : [], seedResults, aggregateDiffs, targetRangePassCounts, watchFinalLensTopChanges, generatedAt: new Date().toISOString() };
}

// ★Multi-Seed 핵심 엔진 — seed마다 기존 Compare 경로(runExpeditionAll + buildReport) 반복. export = Node 검증용.
export async function runMultiSeedCompare({ seeds, runs, overrides = null, onProgress, shouldCancel } = {}) {
  const list = Array.isArray(seeds) ? seeds : [];
  const seedResults = [];
  let cancelled = false;
  for (let i = 0; i < list.length; i++) {
    if (shouldCancel && shouldCancel()) { cancelled = true; break; }
    const seed = list[i];
    const baseRep = buildReport(await runExpeditionAll({ seed, runs, overrides: null }), { seed, runs, overrides: null });
    if (shouldCancel && shouldCancel()) { cancelled = true; break; }
    const varRep = buildReport(await runExpeditionAll({ seed, runs, overrides }), { seed, runs, overrides: overrides ? cloneOv(overrides) : null });
    seedResults.push(buildSeedResult(seed, baseRep, varRep));
    if (onProgress) onProgress(i + 1, list.length, seed);
  }
  const data = finalizeMultiSeed(list.slice(0, seedResults.length), runs, overrides, seedResults);
  data.cancelled = cancelled;
  return data;
}

// 사람이 읽는 Multi-Seed 요약 텍스트(export = Node 검증용).
export function buildMultiSeedSummary(ms = lastMultiSeed) {
  if (!ms || !ms.seedResults || !ms.seedResults.length) return null;
  const L = [];
  L.push("[Expedition Observatory Multi-Seed Experiment Summary]");
  L.push("phase: " + TOOL_PHASE);
  L.push("generated: " + (ms.generatedAt || new Date().toISOString()));
  L.push(`seeds: ${ms.seeds.join(", ")}  (${ms.seeds.length} seeds)`);
  L.push("runs/profile: " + ms.runsPerProfile);
  L.push("profiles: " + ms.profiles.map((id) => EXPEDITIONS[id].label).join(", "));
  L.push("override(Variant): " + (ms.statOverrideSummary && ms.statOverrideSummary.length ? ms.statOverrideSummary.join(" · ") : "없음(=Baseline)"));

  L.push("", "[seed별 Baseline/Variant/Diff]");
  ms.seedResults.forEach((sr) => {
    L.push(`seed ${sr.seed}:`);
    EXPEDITION_ORDER.forEach((id) => {
      const p = sr.profiles[id];
      const tr = p.targetRange ? ` [목표 ${Math.round(p.targetRange.lo * 100)}~${Math.round(p.targetRange.hi * 100)}%: ${pctT(p.variant.winRate)} ${p.targetRange.inRange ? "✓" : (p.variant.winRate < p.targetRange.lo ? "↓" : "↑")}]` : "";
      L.push(`  ${EXPEDITIONS[id].label}: base ${pctT(p.baseline.winRate)}/wipe ${pctT(p.baseline.wipeRate)} → var ${pctT(p.variant.winRate)}/${pctT(p.variant.wipeRate)} | Δwin ${ppT(p.diff.win)} depth ${dn1T(p.diff.depth)} 전리품지표 ${dn1T(p.diff.loot)} bossReady ${ppT(p.diff.bossReady)} bossReadyDepth ${dn1T(p.diff.bossReadyDepth)}${tr}`);
    });
  });

  L.push("", "[프로필별 평균 Diff (seed 전체 평균)]");
  EXPEDITION_ORDER.forEach((id) => {
    const a = ms.aggregateDiffs[id], t = ms.targetRangePassCounts[id];
    L.push(`- ${EXPEDITIONS[id].label}: Δwin ${ppT(a.win)}, Δdepth ${dn1T(a.depth)}, Δ전리품지표 ${dn1T(a.loot)}, ΔbossReady ${ppT(a.bossReady)} | 목표 ${Math.round(t.lo * 100)}~${Math.round(t.hi * 100)}% pass ${t.pass}/${t.total}`);
  });

  L.push("", "[목표 범위 pass 집계]");
  EXPEDITION_ORDER.forEach((id) => { const t = ms.targetRangePassCounts[id]; L.push(`- ${EXPEDITIONS[id].label}(${Math.round(t.lo * 100)}~${Math.round(t.hi * 100)}%): ${t.pass}/${t.total} seeds in range`); });

  L.push("", "[주요 직업 변화 (WATCH · Final lens present clearRate, seed 평균 |Δ| 상위 6)]");
  if (ms.watchFinalLensTopChanges.length) ms.watchFinalLensTopChanges.forEach((w) => L.push(`* ${w.name}: 평균 Δ ${ppT(w.meanDClear)} (${w.seeds} seeds, present avg ${n1T(w.avgBasePresent)}→${n1T(w.avgVarPresent)})`));
  else L.push("* (표본 부족 — seed별 표 참고)");

  L.push("", "해석 주의:");
  L.push("- 같은 seed 비교는 동일 난수표 기반이지만 전투 결과 변화 후 런 분기가 달라질 수 있어 완전한 1:1 리플레이는 아닙니다.");
  L.push("- Loot Proxy(전리품 지표)는 실제 획득 아이템 개수가 아니라 dev-only 런 가치 지표입니다.");
  L.push("- Multi-Seed 결과도 밸런스 확정이 아니라 방향성 후보 관측용입니다(seed 수가 적으면 우연일 수 있음).");
  L.push("- Seed Finder는 sandbox override를 적용하지 않는 코드 기본값 기준 자연 주회 탐색입니다.");
  if (ms.cancelled) L.push("", "※ 사용자 취소로 일부 seed만 실행됨.");
  return L.join("\n");
}

/* ── Multi-Seed UI ── */
function readMsRuns() { const r = parseInt(($("eo-ms-runs") || {}).value, 10); return (Number.isNaN(r) || r < 1) ? 100 : Math.min(500, r); }
const trMark = (tr) => tr ? (tr.inRange ? `<span class="eo-tag hi">✓ ${Math.round(tr.lo*100)}~${Math.round(tr.hi*100)}%</span>` : `<span class="eo-tag lo">${tr.winRate < tr.lo ? "↓" : "↑"} ${Math.round(tr.lo*100)}~${Math.round(tr.hi*100)}%</span>`) : "—";
function renderMultiSeed(ms) {
  const el = $("eo-ms-out"); if (!el) return;
  if (!ms || !ms.seedResults.length) { el.innerHTML = `<div class="eo-meta">결과 없음.</div>`; return; }
  const ovList = ms.statOverrideSummary;
  // seed별 표
  const seedRows = ms.seedResults.map((sr) => EXPEDITION_ORDER.map((id, i) => {
    const p = sr.profiles[id];
    return `<tr>${i === 0 ? `<td class="txt" rowspan="${EXPEDITION_ORDER.length}"><b>${sr.seed}</b></td>` : ""}<td class="txt">${esc(EXPEDITIONS[id].label)}</td><td>${fmtPct(p.baseline.winRate)}/${fmtPct(p.baseline.wipeRate)}</td><td>${fmtPct(p.variant.winRate)}/${fmtPct(p.variant.wipeRate)}</td><td>${delta(p.diff.depth)}</td><td>${delta(p.diff.loot)}</td><td>${deltaPct(p.diff.bossReady)}</td><td>${delta(p.diff.bossReadyDepth)}</td><td class="txt">${trMark(p.targetRange)}</td></tr>`;
  }).join("")).join("");
  // 집계: 프로필 평균 diff + target pass
  const aggRows = EXPEDITION_ORDER.map((id) => {
    const a = ms.aggregateDiffs[id], t = ms.targetRangePassCounts[id];
    return `<tr><td class="txt">${esc(EXPEDITIONS[id].label)}</td><td>${deltaPct(a.win)}</td><td>${delta(a.depth)}</td><td>${delta(a.loot)}</td><td>${deltaPct(a.bossReady)}</td><td>${t.pass}/${t.total} <span class="eo-meta">(${Math.round(t.lo*100)}~${Math.round(t.hi*100)}%)</span></td></tr>`;
  }).join("");
  const watchRows = ms.watchFinalLensTopChanges.length
    ? ms.watchFinalLensTopChanges.map((w) => `<tr><td class="txt">${esc(w.name)}</td><td>${deltaPct(w.meanDClear)}</td><td>${w.seeds}</td><td>${fmt1(w.avgBasePresent)}→${fmt1(w.avgVarPresent)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="eo-meta">표본 부족 — seed별 표 참고</td></tr>`;
  el.innerHTML = `<div class="eo-note"><b>seeds:</b> ${ms.seeds.join(", ")} (${ms.seeds.length}) · <b>runs/프로필:</b> ${ms.runsPerProfile} · <b>override:</b> ${ovList.length ? esc(ovList.join(" · ")) : "없음(=Baseline)"}${ms.cancelled ? ' · <span class="eo-tag lo">일부 취소됨</span>' : ""}</div>
    <div class="eo-line"><b>seed별 Baseline→Variant</b> <span class="eo-meta">win/wipe · Δdepth · Δ전리품 지표 · ΔbossReady · ΔbossReadyDepth · 목표</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">seed</th><th class="txt">profile</th><th>base win/wipe</th><th>var win/wipe</th><th>Δdepth</th><th title="Loot Proxy — dev 임시 지표">Δ전리품 지표</th><th>ΔbossReady</th><th>ΔbossRDepth</th><th class="txt">목표</th></tr></thead><tbody>${seedRows}</tbody></table></div>
    <div class="eo-line"><b>프로필별 평균 Diff + 목표 pass</b> <span class="eo-meta">seed ${ms.seeds.length}개 평균</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">profile</th><th>평균 Δwin</th><th>평균 Δdepth</th><th title="Loot Proxy">평균 Δ전리품 지표</th><th>평균 ΔbossReady</th><th>목표 pass</th></tr></thead><tbody>${aggRows}</tbody></table></div>
    <div class="eo-line"><b>WATCH 직업 변화 (Final lens · seed 평균 Δ present clearRate · 상위 6)</b></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">직업</th><th>평균 Δ승률</th><th>seeds</th><th>present avg B→V</th></tr></thead><tbody>${watchRows}</tbody></table></div>`;
}

async function runMultiSeed() {
  if (running || msRunning) return;
  const status = $("eo-ms-status");
  const parsed = parseSeedList(($("eo-ms-seeds") || {}).value);
  if (!parsed.seeds.length) { status.textContent = "유효한 seed가 없습니다 — 예: 401,402 (양의 정수, 쉼표/공백 구분)."; return; }
  const runs = readMsRuns();
  const overrides = cloneOv(sandbox);
  const notes = [];
  if (parsed.invalid) notes.push(`숫자 아닌 값 ${parsed.invalid}개 무시`);
  if (parsed.capped) notes.push(`최대 ${MS_MAX_SEEDS}개까지 — 앞 ${MS_MAX_SEEDS}개만 사용`);
  if (!hasActiveOverrides(overrides)) notes.push("override 없음 — Variant=Baseline(diff 0). Sandbox에서 수치를 먼저 바꾸세요");
  msRunning = true; msCancel = false; setRunningUI(true);
  const runBtn = $("eo-ms-run"), cancelBtn = $("eo-ms-cancel");
  if (runBtn) runBtn.disabled = true; if (cancelBtn) cancelBtn.disabled = false;
  const heavy = parsed.seeds.length * runs * 2;
  status.textContent = `Multi-Seed 실행 중… (seed ${parsed.seeds.length}개 × ${runs}런 × baseline+variant ≈ ${heavy}×4프로필)${notes.length ? " · " + notes.join(" · ") : ""}`;
  try {
    const ms = await runMultiSeedCompare({
      seeds: parsed.seeds, runs, overrides,
      onProgress: (done, total, seed) => { status.textContent = `Multi-Seed… seed ${seed} 완료 (${done}/${total})`; },
      shouldCancel: () => msCancel,
    });
    lastMultiSeed = ms;
    renderMultiSeed(ms);
    status.textContent = `Multi-Seed 완료 — seed ${ms.seeds.join(",")} · 프로필당 ${runs}런${ms.cancelled ? " (일부 취소)" : ""}${notes.length ? " · " + notes.join(" · ") : ""}`;
    $("eo-multiseed").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    status.textContent = "에러: " + (e && e.message); console.error(e);
  } finally { msRunning = false; setRunningUI(false); if (runBtn) runBtn.disabled = false; if (cancelBtn) cancelBtn.disabled = true; }
}

/* ════════════════════════════════════════════════════════════════
   Seed Finder Lite — 특정 직업이 lens(seen/final/boss/clear)에 등장하는 seed 후보를 찾는다.
   ★자연 주회 성능 ≠ 표적 실험. "이 직업이 나온 seed 후보 목록"일 뿐(규칙 만들기 아님).
   batch + progress + cancel — 브라우저 프리즈 방지. 헤드리스 + 상태 복구(본게임 무영향).
   ════════════════════════════════════════════════════════════════ */
function jobInLens(rec, job, lens) {
  if (lens === "seen") return rec.jobsSeen && rec.jobsSeen.has ? rec.jobsSeen.has(job) : (rec.jobsSeenList || []).includes(job);
  if (lens === "final") return (rec.finalParty || []).includes(job);
  if (lens === "boss") return rec.bossAttempted && (rec.bossParty || []).includes(job);
  if (lens === "clear") return rec.cleared && (rec.finalParty || []).includes(job);
  return false;
}
let sfRunning = false, sfCancel = false;
async function runSeedFinder() {
  if (sfRunning || running) return;
  const start = Math.max(1, parseInt($("eo-sf-start").value, 10) || 1);
  const end = Math.max(start, parseInt($("eo-sf-end").value, 10) || 200);
  const job = $("eo-sf-job").value;
  const lens = $("eo-sf-lens").value;
  const profSel = $("eo-sf-profile").value; // 프로필 id 또는 "all"
  const runsPer = Math.max(1, Math.min(30, parseInt($("eo-sf-runs").value, 10) || 6));
  const want = Math.max(1, Math.min(20, parseInt($("eo-sf-count").value, 10) || 3));
  const profIds = profSel === "all" ? EXPEDITION_ORDER : [profSel];
  const out = $("eo-sf-out"), prog = $("eo-sf-prog");
  const found = [];
  sfRunning = true; sfCancel = false;
  $("eo-sf-run").disabled = true; $("eo-sf-cancel").disabled = false; setRunningUI(true);
  const snap = snapshotState();
  try {
    setHeadlessRun(true);
    if (gameState.dev) gameState.dev.immortal = false;
    for (let seed = start; seed <= end; seed++) {
      if (sfCancel) { prog.textContent = `취소됨 — ${seed - start}/${end - start + 1} seed 스캔, ${found.length}개 발견`; break; }
      let matchRuns = 0;
      for (const pid of profIds) {
        installSeed(seed);
        for (let i = 0; i < runsPer; i++) { const rec = playExpedition(EXPEDITIONS[pid], i, seed); if (jobInLens(rec, job, lens)) matchRuns++; }
        restoreRandom();
      }
      if (matchRuns > 0) { found.push({ seed, matchRuns }); }
      // 진행률 렌더는 5seed/발견 시에만(가벼움), yield는 매 seed(프리즈 방지 + 취소 보장).
      if (seed % 5 === 0 || matchRuns > 0 || seed === end) { prog.textContent = `스캔 ${seed - start + 1}/${end - start + 1} · 발견 ${found.length}/${want}`; renderSeedFinderOut(out, job, lens, profSel, runsPer, found); }
      if (found.length >= want) { prog.textContent = `완료 — ${found.length}개 발견 (seed ${start}~${seed} 스캔)`; break; }
      if (seed === end) prog.textContent = `완료 — seed ${start}~${end} 스캔, ${found.length}개 발견`;
      await yieldUI(); // 매 seed yield — 브라우저 프리즈 방지 + 취소 반응성
    }
    renderSeedFinderOut(out, job, lens, profSel, runsPer, found);
  } catch (e) { prog.textContent = "에러: " + (e && e.message); console.error(e); }
  finally { setHeadlessRun(false); restoreRandom(); restoreState(snap); sfRunning = false; $("eo-sf-run").disabled = false; $("eo-sf-cancel").disabled = true; setRunningUI(false); }
}
function renderSeedFinderOut(out, job, lens, profSel, runsPer, found) {
  if (!out) return;
  const lensName = { seen: "Seen", final: "Final", boss: "Boss", clear: "Clear" }[lens] || lens;
  const profName = profSel === "all" ? "전체 4프로필" : EXPEDITIONS[profSel].label;
  out.innerHTML = found.length
    ? `<div class="eo-line"><b>${esc(jobName(job))} · ${lensName} · ${esc(profName)}</b> <span class="eo-meta">seed당 ${runsPer}런 · ${found.length}개</span></div>`
      + `<div class="eo-sf-chips">${found.map((f) => `<span class="eo-tag hi">seed ${f.seed} <span class="eo-meta">(${f.matchRuns}런)</span></span>`).join(" ")}</div>`
    : `<div class="eo-meta">아직 발견 없음 — range를 넓히거나 runs/seed를 늘려보세요.</div>`;
}

/* ════════════════════════════════════════════════════════════════
   Current Director Snapshot 01 — Depth+Alertness Encounter Pressure Snapshot.
   현재 Forest Director(routes.js)가 depth/alertness/route로 만드는 적 수·조합·스탯 램프·정예/보스 압력을
   dev-only로 "그대로 읽어서" 보여준다. ★밸런스/스탯/route/보상/loot/event 일절 변경 없음 — 기존 export 함수 호출만.
   ★encounter 생성은 deterministic(state.js에 RNG 없음) → 같은 depth/route/alertness면 항상 동일 결과(seed 무관).
   ※다음 단계 Depth Band Director의 선행 "지도"일 뿐 — 여기서 밴드 시스템을 구현하지 않는다.
   ════════════════════════════════════════════════════════════════ */
const DIR_ROUTES = ["normal", "ally", "bond", "danger", "elite", "rest", "boss"];
const DIR_ROLE_LABEL = { tank: "탱", melee: "근접", ranged: "원거리", healer: "힐", support: "서폿" };
const DIR_PRESS = {
  veryLow: { ko: "매우낮음", c: "vlo" }, low: { ko: "낮음", c: "lo" }, normal: { ko: "보통", c: "no" },
  high: { ko: "높음", c: "hi" }, veryHigh: { ko: "매우높음", c: "vhi" },
};
let dirState = { route: "normal", depthMin: 1, depthMax: 20, alertness: 3, focusDepth: 7, party4: true, seed: 401 };

// 합성 run(읽기 전용 입력) — createRouteEnemies/effectiveAlertness가 보는 필드만 채운다. gameState 미사용.
function dirRun({ depth, alertness, party4 = true, bossKeys = 2, fusionCount = 2, partySize = 4 }) {
  const formation = {};
  SLOT_ORDER.slice(0, Math.max(1, Math.min(4, partySize))).forEach((k) => { formation[k] = DEFAULT_FORMATION[k]; });
  return { depth, alertness, party4Reached: party4, preParty4Battles: 0, bossKeys, fusionCount, formation, threat: 0, recruitPower: 0, deepForestCount: 0 };
}

// dev 관측용 추정 pressure 점수(실제 전투 결과 아님): 적 수 × HP 스케일 (+ danger/elite 프리미엄). boss는 BOSS_FLOOR라 veryHigh 고정.
function dirPressureScore(routeType, count, scale, isElite, isBoss) {
  if (isBoss) return 99;
  let s = count * scale.hp;
  if (routeType === "danger") s *= 1.12;     // 깊은 수풀 stat 프리미엄(+12% HP)
  if (isElite) s += 4;                        // 정예 본체(탱키 코어) 가중
  return Math.round(s * 100) / 100;
}
function dirPressureKey(score, isBoss) {
  if (isBoss) return "veryHigh";
  if (score < 3) return "veryLow";
  if (score < 4.5) return "low";
  if (score < 6.5) return "normal";
  if (score < 9) return "high";
  return "veryHigh";
}

// 한 (route, depth, alertness) 조합의 스냅샷 — 실제 createRouteEnemies를 호출해 적 수/이름/HP/ATK를 읽는다.
// ROLE_ACTOR 역참조(생성 적 type → 역할). band 반영된 실제 조합을 읽기 위함.
const DIR_ACTOR_ROLE = { bear: "tank", fox: "melee", bird: "ranged", dewslime: "support", lamb: "healer" };
function dirSnapshot(routeType, depth, alertness, scn = {}) {
  const rt = ROUTE_TYPES[routeType] || ROUTE_TYPES.normal;
  const run = dirRun({ depth, alertness, party4: scn.party4 !== false, bossKeys: scn.bossKeys ?? 2, fusionCount: scn.fusionCount ?? 2, partySize: scn.partySize ?? 4 });
  const effAlert = effectiveAlertness(run);
  const dband = depthBand(depth);
  const scale = directorScale(depth);
  const isCombat = rt.kind !== "rest";
  const isElite = routeType === "elite";
  const isBoss = routeType === "boss";
  const tag = combatDirectorTag(routeType, depth, effAlert, run.party4Reached);
  // Depth Band Director 01 — 게임과 동일하게 seed 0(깊이 파형 고정). createRouteEnemies도 run.bandSeed 미설정 → seed 0.
  const pband = pressureBand(routeType, depth, effAlert, 0);
  let enemies = [];
  if (isCombat) { try { enemies = createRouteEnemies(routeType, run) || []; } catch (e) { enemies = []; } }
  const perEnemy = enemies.map((u) => ({ name: u.name || u.type, type: u.type, hp: u.maxHp, atk: u.atk }));
  const totalHp = enemies.reduce((s, u) => s + (u.maxHp || 0), 0);
  const totalAtk = enemies.reduce((s, u) => s + (u.atk || 0), 0);
  const count = enemies.length; // band-applied 실제 생성 적 수
  const rawCount = (isCombat && !isBoss && !isElite) ? directorCount(routeType, depth) : null; // friction raw(밴드 전) 적 수
  const roles = perEnemy.map((e) => DIR_ACTOR_ROLE[e.type]).filter(Boolean); // band 반영된 실제 역할 조합(코어 제외)
  const score = isCombat ? dirPressureScore(routeType, count, scale, isElite, isBoss) : 0;
  const pressKey = isCombat ? dirPressureKey(score, isBoss) : null;
  let bossInfo = null;
  if (isBoss) {
    bossInfo = {
      fury: bossFury(depth),
      ready: bossReadinessPressure({ depth, bossKeys: run.bossKeys, fusionCount: run.fusionCount, partySize: partySizeOf(run) }),
      menace: bossMenace(run.bossKeys), floorHp: BOSS_FLOOR.hp, floorAtk: BOSS_FLOOR.atk,
    };
  }
  return {
    routeType, label: rt.title, hud: rt.hud, kind: rt.kind, isCombat, isElite, isBoss,
    depth, band: { id: dband.id, label: dband.label }, alertness, effAlert,
    scaleHp: Math.round(scale.hp * 100) / 100, scaleAtk: Math.round(scale.atk * 100) / 100,
    count, rawCount, names: perEnemy.map((e) => e.name), pool: [...new Set(perEnemy.map((e) => e.type))],
    perEnemy, totalHp, totalAtk, roles, roleText: roles.map((r) => DIR_ROLE_LABEL[r] || r).join("·"),
    tag, score, pressure: pressKey, bossInfo,
    dangerPremium: routeType === "danger" ? "+12% HP · +1 ATK" : null,
    eliteEscort: isElite ? eliteEscortCount(depth, effAlert) : null,
    // Depth Band Director 01 — pressure band(파형) 표시 + 효과 요약.
    bandId: pband.id, bandLabel: pband.label, bandRoleAlertDelta: pband.roleAlertDelta, bandRunwayCountDelta: pband.runwayCountDelta,
    bandApplied: pband.applied, bandReason: pband.reason,
    bandCountEffect: (rawCount != null) ? count - rawCount : 0, // friction: band가 줄인 적 수(0 또는 -1)
  };
}

const dirPressCell = (key) => key ? `<span class="eo-press eo-press--${DIR_PRESS[key].c}">${DIR_PRESS[key].ko}</span>` : "—";
// Depth Band Director 01 — pressure band(파형) 표시: 라벨 칩 + band가 준 효과(적 수/조직화).
const DIR_BAND_C = { veryEasy: "vlo", easy: "lo", normal: "no", hard: "hi", veryHard: "vhi" };
const dirBandCell = (s) => {
  if (!s.isCombat || !s.bandApplied) return s.isBoss ? `<span class="eo-meta">파형 미적용</span>` : "—";
  const eff = [];
  if (s.bandRunwayCountDelta) eff.push(`적수${s.bandRunwayCountDelta}`);
  if (s.bandRoleAlertDelta) eff.push(`조직${s.bandRoleAlertDelta > 0 ? "+" : ""}${s.bandRoleAlertDelta}`);
  return `<span class="eo-press eo-press--${DIR_BAND_C[s.bandId] || "no"}">${esc(s.bandLabel)}</span>${eff.length ? ` <span class="eo-meta">${eff.join("·")}</span>` : ""}`;
};
const dirCombatLabel = (s) => s.isCombat ? (s.isBoss ? "보스" : s.isElite ? "정예" : s.routeType === "danger" ? "위험" : "일반") : "비전투(정비)";

function readDirInputs() {
  const num = (id, def) => { const v = parseInt(($(id) && $(id).value) || "", 10); return Number.isFinite(v) ? v : def; };
  let dmin = Math.max(1, num("eo-dir-dmin", 1)), dmax = Math.max(dmin, Math.min(40, num("eo-dir-dmax", 20)));
  if (dmax - dmin > 39) dmax = dmin + 39;
  dirState = {
    route: ($("eo-dir-route") && $("eo-dir-route").value) || "normal",
    depthMin: dmin, depthMax: dmax,
    alertness: Math.max(0, Math.min(MAX_ALERTNESS, num("eo-dir-alert", 3))),
    focusDepth: Math.max(1, Math.min(40, num("eo-dir-focus", 7))),
    party4: !($("eo-dir-pre4") && $("eo-dir-pre4").checked),
    seed: num("eo-dir-seed", 401),
  };
}

// 표 1 — 선택 route의 depth 램프(depthMin..depthMax). 적 수/풀/HP·ATK 스케일/총합/pressure/note. 심도 5~9 강조.
function dirDepthRampRows() {
  const st = dirState, scn = { party4: st.party4 };
  const rows = []; let prev = null;
  for (let d = st.depthMin; d <= st.depthMax; d++) {
    const s = dirSnapshot(st.route, d, st.alertness, scn);
    let note = [];
    if (prev && s.count > prev.count) note.push(`적 수 ↑${s.count - prev.count}`);
    if (prev && s.scaleHp > prev.scaleHp) note.push("HP스케일 ↑");
    if (prev && s.isCombat && prev.isCombat && s.score < prev.score - 0.001) note.push("↓ 직전보다 낮음(쉬울 수 있음)");
    if (s.bandCountEffect) note.push(`band 적 수 완충 ${s.bandCountEffect}`);
    if (s.eliteEscort != null) note.push(`정예 호위 ${s.eliteEscort}`);
    const hi = d >= 5 && d <= 9;
    rows.push({ s, note: note.join(" · "), hi });
    prev = s;
  }
  return rows;
}

function renderDirectorSnapshot() {
  const el = $("eo-dir-out");
  if (!el) return;
  readDirInputs();
  const st = dirState;
  const routeLabel = (ROUTE_TYPES[st.route] || {}).title || st.route;
  // 표 1 — depth 램프
  const ramp = dirDepthRampRows();
  const rampRows = ramp.map(({ s, note, hi }) => `<tr class="${hi ? "eo-dhi" : ""}">
    <td><b>${s.depth}</b></td><td class="txt">B${s.band.id} ${esc(s.band.label)}</td><td class="txt">${dirCombatLabel(s)}</td>
    <td>${s.isCombat ? s.count : "—"}</td><td class="txt">${s.isCombat ? esc(s.names.join(", ")) : "—"}</td>
    <td>×${s.scaleHp}</td><td>×${s.scaleAtk}</td><td>${s.isCombat ? s.totalHp : "—"}</td><td>${s.isCombat ? s.totalAtk : "—"}</td>
    <td>${dirPressCell(s.pressure)}</td><td class="txt">${dirBandCell(s)}</td><td class="txt">${esc(note)}</td></tr>`).join("");
  const t1 = `<div class="eo-line"><b>① Depth 램프 — ${esc(routeLabel)}</b> <span class="eo-meta">depth ${st.depthMin}~${st.depthMax} · 경계도 ${st.alertness}${st.party4 ? "" : " · pre-party4(잠복)"} · 심도 5~9 강조 · band=파형 레이어</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th>depth</th><th class="txt">밴드</th><th class="txt">전투</th><th>적 수</th><th class="txt">풀(생성)</th><th>HP×</th><th>ATK×</th><th>총HP</th><th>총ATK</th><th>pressure</th><th class="txt">band(파형)</th><th class="txt">note</th></tr></thead><tbody>${rampRows}</tbody></table></div>`;
  // 표 2 — focus depth에서 route 비교
  const cmp = DIR_ROUTES.map((rt) => dirSnapshot(rt, st.focusDepth, st.alertness, { party4: st.party4 }));
  const cmpRows = cmp.map((s) => `<tr>
    <td class="txt"><b>${esc(s.label)}</b> <span class="eo-meta">${s.routeType}</span></td><td class="txt">${dirCombatLabel(s)}</td>
    <td>${s.isCombat ? s.count : "—"}</td><td class="txt">${s.isCombat ? esc(s.pool.join(", ")) : "정비/회복"}</td>
    <td>${s.isCombat ? "×" + s.scaleHp : "—"}</td><td>${s.isCombat ? "×" + s.scaleAtk : "—"}</td>
    <td>${s.isCombat ? s.totalHp : "—"}</td><td>${s.isCombat ? s.totalAtk : "—"}</td><td>${dirPressCell(s.pressure)}</td><td class="txt">${dirBandCell(s)}</td>
    <td class="txt">${esc((s.tag || []).join(" "))}${s.dangerPremium ? " · " + esc(s.dangerPremium) : ""}${s.isBoss ? ` · BOSS_FLOOR ${s.bossInfo.floorHp}/${s.bossInfo.floorAtk}` : ""}</td></tr>`).join("");
  const t2 = `<div class="eo-line"><b>② Route 비교 — 심도 ${st.focusDepth}</b> <span class="eo-meta">경계도 ${st.alertness} · 각 route가 같은 심도에서 만드는 압력</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">route</th><th class="txt">전투</th><th>적 수</th><th class="txt">풀</th><th>HP×</th><th>ATK×</th><th>총HP</th><th>총ATK</th><th>pressure</th><th class="txt">band</th><th class="txt">tag/특수</th></tr></thead><tbody>${cmpRows}</tbody></table></div>`;
  // 표 3 — focus depth + 선택 route에서 경계도 sweep
  const sweep = [];
  for (let a = 0; a <= MAX_ALERTNESS; a++) sweep.push(dirSnapshot(st.route === "rest" || st.route === "boss" ? "normal" : st.route, st.focusDepth, a, { party4: st.party4 }));
  const sweepRows = sweep.map((s) => `<tr><td><b>${s.alertness}</b></td><td>${s.effAlert}</td><td>${s.count}</td><td class="txt">${esc(s.roleText)}</td><td>${s.totalHp}</td><td>${s.totalAtk}</td><td>${dirPressCell(s.pressure)}</td><td class="txt">${dirBandCell(s)}</td></tr>`).join("");
  const sweepRoute = (st.route === "rest" || st.route === "boss") ? "normal" : st.route;
  const t3 = `<div class="eo-line"><b>③ 경계도 sweep — ${esc((ROUTE_TYPES[sweepRoute] || {}).title || sweepRoute)} · 심도 ${st.focusDepth}</b> <span class="eo-meta">경계도는 적 수를 늘리지 않고 "역할 조합"만 두껍게 한다 + band(파형) 보정 — 확인용</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th>경계도</th><th>유효</th><th>적 수</th><th class="txt">역할 조합</th><th>총HP</th><th>총ATK</th><th>pressure</th><th class="txt">band</th></tr></thead><tbody>${sweepRows}</tbody></table></div>`;
  // 관측 메모(5~9 구간)
  const d5to9 = [];
  for (let d = 5; d <= 9; d++) d5to9.push(dirSnapshot(st.route, d, st.alertness, { party4: st.party4 }));
  const countStep = d5to9.find((s, i) => i > 0 && s.count > d5to9[i - 1].count);
  const noteText = `심도 5~9 구간: 적 수 ${d5to9[0].count}→${d5to9[d5to9.length - 1].count}` + (countStep ? ` (심도 ${countStep.depth}에서 적 수 step ↑)` : "") + `, HP스케일 ×${d5to9[0].scaleHp}→×${d5to9[d5to9.length - 1].scaleHp}. 적 수 step(밴드 경계 d9)과 스탯 step(d7)이 어긋나 있어, party 4인 완성 전(pre-party4=잠복 경계도)이면 이 구간이 초중반 붕괴 좌표가 되기 쉽다.`;
  // band 분포(선택 route depth 범위) + d6~9 friction 적 수 완충 목록
  const bandDist = {};
  ramp.forEach(({ s }) => { if (s.isCombat) bandDist[s.bandId] = (bandDist[s.bandId] || 0) + 1; });
  const bandDistText = PRESSURE_BANDS.map((b) => `${b.label} ${bandDist[b.id] || 0}`).join(" / ");
  const runwayBuffered = ramp.filter(({ s }) => s.bandCountEffect).map(({ s }) => `d${s.depth}(${s.bandLabel} 적수${s.bandCountEffect})`);
  const legend = `<div class="eo-note"><b>estimated pressure</b>(dev 관측용 · 실제 전투 결과/확정 판정 아님) = 적 수 × HP 스케일 (+ danger ×1.12 · 정예 코어 +4 · 보스=BOSS_FLOOR라 매우높음 고정). 라벨: ${Object.values(DIR_PRESS).map((p) => p.ko).join(" / ")}.
    <br><b>band(파형)</b> = Depth Band Director 01 — 숲의 호흡. 5단계(${PRESSURE_BANDS.map((b) => b.label).join("/")})·deterministic(같은 depth/route/경계도면 동일·seed 0 깊이 파형). band는 <b>적 수/스탯을 크게 안 흔들고</b>, ① d6~9 friction 적 수 ±1 완충 ② 역할 조직화(조직±N)만 보정. boss=파형 미적용. encounter 생성은 deterministic.</div>`;
  el.innerHTML = legend + t1 + t2 + t3
    + `<div class="eo-note"><b>관측 메모</b> ${esc(noteText)} ${st.party4 ? "" : "<b>(현재 pre-party4: 유효 경계도가 잠복돼 조합은 단순하지만, 4인 미완성 자체가 위험)</b>"}
      <br><b>band 분포</b>(${esc(routeLabel)} d${st.depthMin}~${st.depthMax}): ${esc(bandDistText)}.
      <br><b>d6~9 적 수 완충</b>: ${runwayBuffered.length ? esc(runwayBuffered.join(" · ")) : "이 구간에서 완충된 friction 전투 없음(현재 band 분포 기준)"} — 쉬움/아주쉬움 band가 뜬 friction 전투만 d9 적 수 step을 −1 완충(평이/어려움은 현재 유지).</div>`;
}

// Copy — 사람이 읽는 Summary. export = Node 검증(DOM 없으면 기본 dirState 사용).
export function buildDirectorSummaryText() {
  readDirInputs();
  const st = dirState, L = [];
  const routeLabel = (ROUTE_TYPES[st.route] || {}).title || st.route;
  L.push("[Current Director Snapshot — Depth+Alertness Encounter Pressure]");
  L.push("generated: " + new Date().toISOString());
  L.push("seed: " + st.seed + " (※Forest Director encounter + pressure band는 deterministic — band는 seed 0 깊이 파형 고정, seed가 결과를 바꾸지 않음)");
  L.push("depth range: " + st.depthMin + "~" + st.depthMax + " · 경계도(alertness): " + st.alertness + " · " + (st.party4 ? "post-party4" : "pre-party4(잠복 경계도)"));
  L.push("focus route: " + routeLabel + " (" + st.route + ") · focus depth: " + st.focusDepth);
  L.push("", `[Route 비교 @ 심도 ${st.focusDepth}] (combat / 적 수 / 총HP / pressure / band)`);
  DIR_ROUTES.forEach((rt) => { const s = dirSnapshot(rt, st.focusDepth, st.alertness, { party4: st.party4 }); L.push(`* ${s.label}(${rt}): ${dirCombatLabel(s)} / ${s.isCombat ? s.count + "마리" : "비전투"} / 총HP ${s.isCombat ? s.totalHp : "—"} / pressure ${s.isCombat ? DIR_PRESS[s.pressure].ko : "—"} / band ${s.isCombat ? s.bandLabel : "—"}`); });
  L.push("", `[Depth 램프 @ ${routeLabel}] (depth: 적 수 ×HP스케일 → pressure · band)`);
  const rampForBand = dirDepthRampRows();
  rampForBand.forEach(({ s }) => { if (s.isCombat) L.push(`* d${s.depth}(B${s.band.id}): ${s.count}마리 ×${s.scaleHp}HP/×${s.scaleAtk}ATK · 총HP ${s.totalHp} → ${DIR_PRESS[s.pressure].ko} · band ${s.bandLabel}${s.bandCountEffect ? `(적수${s.bandCountEffect})` : ""}${s.bandRoleAlertDelta ? `(조직${s.bandRoleAlertDelta > 0 ? "+" : ""}${s.bandRoleAlertDelta})` : ""}`); else L.push(`* d${s.depth}: 비전투(정비)`); });
  const bDist = {}; rampForBand.forEach(({ s }) => { if (s.isCombat) bDist[s.bandId] = (bDist[s.bandId] || 0) + 1; });
  const bufList = rampForBand.filter(({ s }) => s.bandCountEffect).map(({ s }) => `d${s.depth}(${s.bandLabel} ${s.bandCountEffect})`);
  L.push("", `[band(파형) — Depth Band Director 01]`);
  L.push("* 분포(" + routeLabel + " d" + st.depthMin + "~" + st.depthMax + "): " + PRESSURE_BANDS.map((b) => `${b.label} ${bDist[b.id] || 0}`).join(" / "));
  L.push("* d6~9 적 수 완충(쉬움/아주쉬움 friction만 −1): " + (bufList.length ? bufList.join(" · ") : "현재 band 분포 기준 없음"));
  L.push("* band 효과 범위: friction 적 수 ±1(d6~9) + 역할 조직화 ±N. raw HP/ATK·기본 스탯·danger 프리미엄·boss=BOSS_FLOOR는 무변경. 아주어려움=이번엔 일반 전투 스파이크 금지(rare label).");
  const d59 = []; for (let d = 5; d <= 9; d++) d59.push(dirSnapshot(st.route, d, st.alertness, { party4: st.party4 }));
  L.push("", "[심도 5~9 관측 메모]");
  L.push(`* 적 수 ${d59[0].count}→${d59[d59.length - 1].count} · HP스케일 ×${d59[0].scaleHp}→×${d59[d59.length - 1].scaleHp} (적 수 step=밴드경계 d9 / 스탯 step=d7로 어긋남)`);
  L.push("* 경계도는 적 수를 늘리지 않고 역할 조합만 조직화(③ sweep 참조). pre-party4면 유효 경계도가 잠복.");
  L.push("", "주의: 이 Snapshot은 dev-only 관측값이며, 실제 밸런스 변경이나 확정 판정이 아닙니다.");
  return L.join("\n");
}

// Copy — 구조화 JSON(관측 데이터). 실제 게임 저장/밸런스와 무관. export = Node 검증.
export function buildDirectorJSON() {
  readDirInputs();
  const st = dirState;
  const lite = (s) => ({ route: s.routeType, label: s.label, combat: dirCombatLabel(s), count: s.isCombat ? s.count : 0, rawCount: s.rawCount, pool: s.pool, scaleHp: s.scaleHp, scaleAtk: s.scaleAtk, totalHp: s.totalHp, totalAtk: s.totalAtk, pressure: s.pressure, tag: s.tag, depthBand: s.band, effAlert: s.effAlert, roles: s.roles, eliteEscort: s.eliteEscort, bossFloor: s.isBoss ? { hp: s.bossInfo.floorHp, atk: s.bossInfo.floorAtk } : null,
    pressureBand: { id: s.bandId, label: s.bandLabel, roleAlertDelta: s.bandRoleAlertDelta, runwayCountDelta: s.bandRunwayCountDelta, countEffect: s.bandCountEffect, applied: s.bandApplied } });
  const rampRows = dirDepthRampRows();
  const bandDist = {}; rampRows.forEach(({ s }) => { if (s.isCombat) bandDist[s.bandId] = (bandDist[s.bandId] || 0) + 1; });
  return JSON.stringify({
    tool: "current-director-snapshot", note: "dev-only 관측값 · 실제 밸런스/저장 무관 · encounter+pressure band 생성 deterministic(band=seed 0 깊이 파형). pressure band는 friction 적 수 ±1(d6~9)·역할 조직화만 보정 — raw HP/ATK·기본 스탯 무변경.",
    generatedAt: new Date().toISOString(),
    inputs: { ...st },
    pressureBands: PRESSURE_BANDS,
    bandDistribution: bandDist,
    depthRamp: rampRows.map(({ s, note, hi }) => ({ ...lite(s), depth: s.depth, note, highlight: hi })),
    routeComparison: DIR_ROUTES.map((rt) => ({ ...lite(dirSnapshot(rt, st.focusDepth, st.alertness, { party4: st.party4 })), depth: st.focusDepth })),
    alertnessSweep: (() => { const out = []; const r = (st.route === "rest" || st.route === "boss") ? "normal" : st.route; for (let a = 0; a <= MAX_ALERTNESS; a++) { const s = dirSnapshot(r, st.focusDepth, a, { party4: st.party4 }); out.push({ alertness: a, effAlert: s.effAlert, count: s.count, roles: s.roles, totalHp: s.totalHp, totalAtk: s.totalAtk, pressure: s.pressure, band: s.bandId }); } return out; })(),
  }, null, 0);
}

const DIR_PRESETS = {
  early: { depthMin: 1, depthMax: 8, alertness: 1 }, mid: { depthMin: 9, depthMax: 13, alertness: 3 }, late: { depthMin: 14, depthMax: 20, alertness: 5 },
  lowAlert: { alertness: 0 }, highAlert: { alertness: 5 }, pre4: { pre4: true }, post4: { pre4: false },
};
function applyDirPreset(name) {
  const p = DIR_PRESETS[name]; if (!p) return;
  if (p.depthMin != null && $("eo-dir-dmin")) $("eo-dir-dmin").value = p.depthMin;
  if (p.depthMax != null && $("eo-dir-dmax")) $("eo-dir-dmax").value = p.depthMax;
  if (p.alertness != null && $("eo-dir-alert")) $("eo-dir-alert").value = p.alertness;
  if (p.pre4 != null && $("eo-dir-pre4")) $("eo-dir-pre4").checked = !!p.pre4;
  renderDirectorSnapshot();
}

/* ════════════════════════════════════════════════════════════════
   Band Observatory 01 — Pressure Band Run Lens 01.
   "밴드를 튜닝하지 않는다. 밴드가 런의 어느 구간에서 숨 고르기/긴장/붕괴/귀환을 만들었는지 보여준다."
   여러 런을 헤드리스로 돌려(captureBands) per-encounter band를 모아 분포·d6~9 runway·outcome 상관·route×band·타임라인으로 본다.
   ★dev-only 관측 — 밴드/encounter/스탯/보상/loot/route 로직 일절 변경 없음(deterministic pressureBand 재계산만).
   ★band↔outcome는 상관 관측이지 원인 확정/밸런스 결론이 아니다.
   ════════════════════════════════════════════════════════════════ */
const BAND_IDS = PRESSURE_BANDS.map((b) => b.id);
const bandKo = (id) => (DIR_PRESS[id] ? DIR_PRESS[id].ko : id);
const bandChip = (id, isBoss) => isBoss ? `<span class="eo-meta">미적용</span>` : `<span class="eo-press eo-press--${(DIR_PRESS[id] || { c: "no" }).c}">${bandKo(id)}</span>`;
const boRouteLabel = (rt) => (ROUTE_TYPES[rt] || {}).title || rt;
let boRunning = false, boCancel = false, lastBandRecords = null, lastBandReport = null;

async function runBandLens({ seed, runs, profileId, onProgress, shouldCancel }) {
  const snap = snapshotState();
  const out = [];
  captureBands = true;
  try {
    setHeadlessRun(true);
    if (gameState.dev) gameState.dev.immortal = false;
    const useSeed = seed != null && !Number.isNaN(seed);
    if (useSeed) installSeed(seed);
    for (let i = 0; i < runs; i++) {
      if (shouldCancel && shouldCancel()) break;
      out.push(playExpedition(EXPEDITIONS[profileId], i, useSeed ? seed : 0, null));
      if (i % 20 === 19) { if (onProgress) onProgress(i + 1); await yieldUI(); }
    }
  } finally { captureBands = false; setHeadlessRun(false); restoreRandom(); restoreState(snap); }
  return out;
}

// per-encounter를 run 문맥과 함께 평탄화(route/outcome 필터 적용).
function flattenBandEncounters(runs, routeFilter) {
  const flat = [];
  runs.forEach((r, ri) => {
    const enc = r.encounters || []; const last = enc.length - 1;
    enc.forEach((e, ei) => { if (routeFilter === "all" || e.route === routeFilter) flat.push(Object.assign({ ri, ei, last, runResult: r.result, runCleared: r.cleared, runWiped: r.wiped, runBoss: r.bossAttempted, runTreasure: r.treasureTotal || 0 }, e)); });
  });
  return flat;
}

export function buildBandReport(records, opts = {}) {
  const routeFilter = opts.routeFilter || "all", outcomeFilter = opts.outcomeFilter || "all";
  const runs = records.filter((r) => outcomeFilter === "all" || (outcomeFilter === "clear" ? r.cleared : r.wiped));
  const flat = flattenBandEncounters(runs, routeFilter);
  const clearEnc = flat.filter((e) => e.runCleared).length, failEnc = flat.filter((e) => e.runWiped).length;
  const isWipeEnc = (e) => e.runWiped && e.ei === e.last;
  // A. Band Distribution
  const bandDist = BAND_IDS.map((id) => {
    const es = flat.filter((e) => e.band === id && !e.isBoss);
    return { band: id, n: es.length, share: rate(es.length, flat.length), avgDepth: mean(es.map((e) => e.depth)), avgEnemy: mean(es.map((e) => e.enemyCount)), avgParty: mean(es.map((e) => e.partySize)), avgLoot: mean(es.map((e) => e.treasureProxy)), wipeAt: es.filter(isWipeEnc).length, clearShare: rate(es.filter((e) => e.runCleared).length, clearEnc), failShare: rate(es.filter((e) => e.runWiped).length, failEnc) };
  });
  // B. d6~9 Runway Lens
  const runway = flat.filter((e) => e.depth >= 6 && e.depth <= 9 && !e.isBoss);
  const runwayByBand = BAND_IDS.map((id) => {
    const es = runway.filter((e) => e.band === id); if (!es.length) return null;
    const withRaw = es.filter((e) => e.rawCount != null); // raw vs 적수 비교는 같은 모집단(elite=rawCount 없음 제외)
    return { band: id, n: es.length, avgRaw: mean(withRaw.map((e) => e.rawCount)), avgEnemy: mean(withRaw.map((e) => e.enemyCount)), buffered: es.filter((e) => e.bandCountDelta < 0).length, avgParty: mean(es.map((e) => e.partySize)), healerRate: rate(es.filter((e) => e.hasHealer).length, es.length), tankRate: rate(es.filter((e) => e.hasTank).length, es.length), wipeAt: es.filter(isWipeEnc).length, pre4: es.filter((e) => e.partySize < 4).length };
  }).filter(Boolean);
  const runwaySamples = runway.slice(0, 16).map((e) => ({ depth: e.depth, route: e.route, alertness: e.alertness, band: e.band, rawCount: e.rawCount, enemyCount: e.enemyCount, partySize: e.partySize, hasHealer: e.hasHealer, hasTank: e.hasTank, lootProxy: e.treasureProxy, wipe: isWipeEnc(e), outcome: e.runResult }));
  // C. Outcome by Band (상관 관측)
  const outcomeByBand = BAND_IDS.map((id) => {
    const touched = runs.filter((r) => (r.encounters || []).some((e) => e.band === id && !e.isBoss));
    return { band: id, runsTouched: touched.length, wipeAt: flat.filter((e) => e.band === id && !e.isBoss && isWipeEnc(e)).length, within1: flat.filter((e) => e.band === id && !e.isBoss && e.runWiped && (e.last - e.ei) <= 1).length, within2: flat.filter((e) => e.band === id && !e.isBoss && e.runWiped && (e.last - e.ei) <= 2).length, oneLootReturn: touched.filter((r) => r.cleared && (r.treasureTotal || 0) >= 1).length, clears: touched.filter((r) => r.cleared).length, bossAtt: touched.filter((r) => r.bossAttempted).length };
  });
  // D. Route × Band Matrix
  const routeMatrix = DIR_ROUTES.map((rt) => {
    const es = flattenBandEncounters(runs, "all").filter((e) => e.route === rt);
    const dist = {}; BAND_IDS.forEach((id) => dist[id] = es.filter((e) => e.band === id).length);
    return { route: rt, label: boRouteLabel(rt), combat: (ROUTE_TYPES[rt] || {}).kind !== "rest", n: es.length, dist, avgEnemy: mean(es.map((e) => e.enemyCount)), wipeAdj: rate(es.filter(isWipeEnc).length, es.length), avgLoot: mean(es.map((e) => e.treasureProxy)) };
  });
  // E. Timeline samples
  const samples = pickBandSamples(runs);
  // 차트용: depth wave(depth별 평균 band index 0~4 + 평균 적수) / d6~9 depth별 band 분포
  const BAND_IDX = {}; BAND_IDS.forEach((id, i) => BAND_IDX[id] = i);
  const nonBoss = flat.filter((e) => !e.isBoss);
  const maxD = Math.min(30, nonBoss.reduce((m, e) => Math.max(m, e.depth), 1));
  const depthWave = [];
  for (let d = 1; d <= maxD; d++) { const es = nonBoss.filter((e) => e.depth === d); if (es.length) depthWave.push({ depth: d, n: es.length, avgBandIdx: mean(es.map((e) => BAND_IDX[e.band])), avgEnemy: mean(es.map((e) => e.enemyCount)) }); }
  const runwayByDepth = [6, 7, 8, 9].map((d) => { const es = runway.filter((e) => e.depth === d); const wr = es.filter((e) => e.rawCount != null); const dist = {}; BAND_IDS.forEach((id) => dist[id] = es.filter((e) => e.band === id).length); return { depth: d, n: es.length, dist, avgEnemy: mean(wr.map((e) => e.enemyCount)), avgRaw: mean(wr.map((e) => e.rawCount)), wipeAt: es.filter(isWipeEnc).length, pre4: es.filter((e) => e.partySize < 4).length }; });
  return { meta: { total: runs.length, clears: runs.filter((r) => r.cleared).length, wipes: runs.filter((r) => r.wiped).length, bossAtt: runs.filter((r) => r.bossAttempted).length, routeFilter, outcomeFilter, flatCount: flat.length, runwayCount: runway.length }, bandDist, runwayByBand, runwaySamples, outcomeByBand, routeMatrix, samples, depthWave, runwayByDepth };
}

function pickBandSamples(runs) {
  const cands = [
    ["첫 전멸 런", runs.find((r) => r.wiped)],
    ["첫 1전리품 귀환 런", runs.find((r) => r.cleared && (r.treasureTotal || 0) >= 1)],
    ["d6~9 붕괴 런", runs.find((r) => r.wiped && r.deathDepth >= 6 && r.deathDepth <= 9)],
    ["d6~9 통과(생존) 런", runs.find((r) => !r.wiped && (r.encounters || []).some((e) => e.depth > 9))],
    ["보스문 전 붕괴 런", runs.find((r) => r.wiped && r.bossReadyDepth > 0 && !r.bossAttempted)],
    ["첫 클리어 런", runs.find((r) => r.cleared)],
  ].filter(([, r]) => r);
  const seen = new Set(), out = [];
  cands.forEach(([label, r]) => { const key = r.seed + ":" + r.runIndex; if (!seen.has(key)) { seen.add(key); out.push({ label, result: r.result, deathDepth: r.deathDepth, bossReadyDepth: r.bossReadyDepth, steps: (r.encounters || []).slice(0, 16).map((e) => ({ step: e.step, depth: e.depth, route: e.route, alertness: e.alertness, band: e.band, isBoss: e.isBoss, enemyCount: e.enemyCount, partySize: e.partySize, hasHealer: e.hasHealer, lootProxy: e.treasureProxy, wasBossReady: e.wasBossReady })) }); } });
  return out.slice(0, 6);
}

function readBandInputs() {
  const num = (id, def) => { const v = parseInt(($(id) && $(id).value) || "", 10); return Number.isFinite(v) ? v : def; };
  return {
    seed: num("eo-bo-seed", 405), runs: Math.max(1, Math.min(400, num("eo-bo-runs", 100))),
    profileId: ($("eo-bo-profile") && $("eo-bo-profile").value) || "oneLoot",
    routeFilter: ($("eo-bo-route") && $("eo-bo-route").value) || "all",
    outcomeFilter: ($("eo-bo-outcome") && $("eo-bo-outcome").value) || "all",
  };
}

// ── dev-only lightweight 차트(외부 라이브러리 없음·HTML/CSS/SVG만). 색=압력 강도(완화→고압 cool→warm), 좋음/나쁨 아님. ──
const BAND_FILL = { veryEasy: "#6fcf97", easy: "#a7d8b0", normal: "#8fb8d6", hard: "#e6b65c", veryHard: "#dd8a5a" };
function chartBandDist(bandDist) {
  const maxN = Math.max(1, ...bandDist.map((b) => b.n));
  const rows = bandDist.map((b) => `<div class="eo-bar-row"><span class="eo-bar-lab">${bandKo(b.band)}</span><span class="eo-bar-track"><span class="eo-bar-fill" style="width:${Math.round(b.n / maxN * 100)}%;background:${BAND_FILL[b.band]}"></span></span><span class="eo-bar-val">${b.n} · ${fmtPct(b.share)}</span></div>`).join("");
  return `<div class="eo-chart"><div class="eo-chart-h">① Band 분포 <span class="eo-meta">전체 encounter 등장 — 한쪽 쏠림 / veryHard 과다 확인</span></div>${rows}</div>`;
}
function chartDepthWave(wave) {
  if (!wave.length) return "";
  const W = 600, H = 132, pad = 26;
  const xs = (i) => pad + (wave.length === 1 ? 0 : i / (wave.length - 1) * (W - pad * 2));
  const ys = (v) => H - pad - (Math.max(0, Math.min(4, v)) / 4) * (H - pad * 2);
  const pts = wave.map((w, i) => `${xs(i).toFixed(1)},${ys(w.avgBandIdx).toFixed(1)}`).join(" ");
  const dots = wave.map((w, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(w.avgBandIdx).toFixed(1)}" r="2.4" fill="#eef6ff"><title>d${w.depth} 평균band ${w.avgBandIdx.toFixed(2)} 적${w.avgEnemy.toFixed(1)}</title></circle>`).join("");
  const i6 = wave.findIndex((w) => w.depth >= 6), i9last = (() => { let x = -1; wave.forEach((w, i) => { if (w.depth <= 9) x = i; }); return x; })();
  const shade = (i6 >= 0 && i9last >= i6) ? `<rect x="${xs(i6).toFixed(1)}" y="${pad}" width="${Math.max(2, xs(i9last) - xs(i6)).toFixed(1)}" height="${H - pad * 2}" fill="rgba(220,170,110,.12)"/>` : "";
  const xlab = wave.map((w, i) => (i % Math.max(1, Math.ceil(wave.length / 10)) === 0 || i === wave.length - 1) ? `<text x="${xs(i).toFixed(1)}" y="${H - 6}" font-size="10" fill="#6f8497" text-anchor="middle">${w.depth}</text>` : "").join("");
  const ylab = [[0, "완화"], [2, "평이"], [4, "고압"]].map(([v, t]) => `<text x="3" y="${(ys(v) + 3).toFixed(1)}" font-size="9" fill="#6f8497">${t}</text>`).join("");
  const grid = [0, 2, 4].map((v) => `<line x1="${pad}" y1="${ys(v).toFixed(1)}" x2="${W - pad}" y2="${ys(v).toFixed(1)}" stroke="#243039" stroke-width="0.6"/>`).join("");
  return `<div class="eo-chart"><div class="eo-chart-h">② Depth Pressure Wave <span class="eo-meta">depth별 평균 band(0 완화~4 고압) — 계단이 아니라 "숲의 파형"인지 (음영=d6~9)</span></div><svg viewBox="0 0 ${W} ${H}" class="eo-svg" preserveAspectRatio="xMidYMid meet">${grid}${shade}<polyline points="${pts}" fill="none" stroke="#e6c89a" stroke-width="1.8"/>${dots}${xlab}${ylab}</svg></div>`;
}
function chartRunway(byDepth) {
  const rows = byDepth.map((d) => {
    const total = d.n || 1;
    const seg = BAND_IDS.map((id) => d.dist[id] ? `<span class="eo-seg" style="width:${(d.dist[id] / total * 100).toFixed(1)}%;background:${BAND_FILL[id]}" title="${bandKo(id)} ${d.dist[id]}"></span>` : "").join("");
    return `<div class="eo-bar-row"><span class="eo-bar-lab">d${d.depth}</span><span class="eo-bar-track eo-bar-stack">${seg}</span><span class="eo-bar-val">적 ${fmt1(d.avgEnemy)}${d.avgRaw ? `/raw ${fmt1(d.avgRaw)}` : ""} · 전멸 ${d.wipeAt} · pre4 ${d.pre4} · n${d.n}</span></div>`;
  }).join("");
  return `<div class="eo-chart"><div class="eo-chart-h">③ d6~9 Runway Focus <span class="eo-meta">★핵심 — depth별 band 구성(색=압력)·평균 적수(band 후/raw)·전멸직전·pre4. "항상 벽" vs "숨 고르기"</span></div>${rows}<div class="eo-bo-legend">${BAND_IDS.map((id) => `<span class="eo-bo-leg"><span class="eo-seg-dot" style="background:${BAND_FILL[id]}"></span>${bandKo(id)}</span>`).join("")}</div></div>`;
}
function chartOutcome(obb) {
  const cols = [["within1", "#dd8a5a", "다음1내 전멸"], ["within2", "#e6b65c", "다음2내 전멸"], ["oneLootReturn", "#6fcf97", "1전리품귀환"], ["clears", "#8fb8d6", "clear"]];
  const rows = obb.filter((b) => b.runsTouched > 0).map((b) => {
    const bars = cols.map(([k, c, lab]) => `<span class="eo-mini" title="${lab} ${b[k]}/${b.runsTouched} (${fmtPct(rate(b[k], b.runsTouched))})"><span class="eo-mini-fill" style="height:${Math.round(rate(b[k], b.runsTouched) * 100)}%;background:${c}"></span></span>`).join("");
    return `<div class="eo-obar"><div class="eo-obar-bars">${bars}</div><div class="eo-obar-lab">${bandKo(b.band)}<br><span class="eo-meta">n${b.runsTouched}</span></div></div>`;
  }).join("");
  return `<div class="eo-chart"><div class="eo-chart-h">④ Outcome by Band <span class="eo-meta">★상관 관측(원인 아님) — band 등장 런 中 비율</span></div><div class="eo-obar-wrap">${rows || "<span class='eo-meta'>데이터 없음</span>"}</div><div class="eo-bo-legend">${cols.map(([, c, lab]) => `<span class="eo-bo-leg"><span class="eo-seg-dot" style="background:${c}"></span>${lab}</span>`).join("")}</div></div>`;
}
function chartTimelineStrip(samples) {
  const blocks = samples.map((s) => {
    const chips = s.steps.map((e) => `<span class="eo-strip-cell" style="background:${e.isBoss ? "rgba(110,85,58,.35)" : BAND_FILL[e.band] + "33"};border-color:${e.isBoss ? "#6e553a" : BAND_FILL[e.band]}" title="d${e.depth} ${esc(boRouteLabel(e.route))} ${e.isBoss ? "보스(파형 미적용)" : bandKo(e.band)} · 적 ${e.enemyCount} · 파티 ${e.partySize} · 전리품 ${e.lootProxy} · ${e.hasHealer ? "힐O" : "힐X"}${e.wasBossReady ? " · 보스문" : ""}"><b>d${e.depth}</b><span class="eo-meta">${e.isBoss ? "B" : bandKo(e.band).slice(0, 1)}·${e.enemyCount}/${e.partySize}</span></span>`).join("");
    return `<div class="eo-strip"><div class="eo-strip-h"><b>${esc(s.label)}</b> <span class="eo-meta">${esc(s.result)}${s.deathDepth ? " · 전멸 d" + s.deathDepth : ""}${s.bossReadyDepth ? " · 보스문 d" + s.bossReadyDepth : ""}</span></div><div class="eo-strip-row">${chips || "<span class='eo-meta'>encounter 없음</span>"}</div></div>`;
  }).join("");
  return `<div class="eo-chart"><div class="eo-chart-h">⑤ Run Timeline Band Strip <span class="eo-meta">대표 런의 depth 순서 band 띠 — 칸=d{심도} {band}·적수/파티 (hover 상세)</span></div>${blocks || "<div class='eo-meta'>샘플 없음</div>"}</div>`;
}

function renderBandObservatory() {
  const el = $("eo-bo-out");
  if (!el) return;
  if (!lastBandRecords) { el.innerHTML = `<div class="eo-empty">Run Band Lens 를 눌러 런을 돌리면 band 호흡 관측이 표시됩니다.</div>`; return; }
  const inp = readBandInputs();
  const rep = buildBandReport(lastBandRecords, { routeFilter: inp.routeFilter, outcomeFilter: inp.outcomeFilter });
  lastBandReport = rep;
  const m = rep.meta;
  const head = `<div class="eo-line"><b>${esc(EXPEDITIONS[lastBandRecords.profileId] ? EXPEDITIONS[lastBandRecords.profileId].label : inp.profileId)}</b> <span class="eo-meta">seed ${lastBandRecords.seed} · ${lastBandRecords.length}런 · route:${inp.routeFilter} · outcome:${inp.outcomeFilter} — 표시 ${m.total}런 / clear ${m.clears} / wipe ${m.wipes} / boss시도 ${m.bossAtt} · encounter ${m.flatCount}</span></div>`;
  // A
  const aRows = rep.bandDist.map((b) => `<tr><td class="txt">${bandChip(b.band)}</td><td>${b.n}</td><td>${fmtPct(b.share)}</td><td>${fmt1(b.avgDepth)}</td><td>${fmt1(b.avgEnemy)}</td><td>${fmt1(b.avgParty)}</td><td>${fmt1(b.avgLoot)}</td><td>${b.wipeAt}</td><td>${fmtPct(b.clearShare)}</td><td>${fmtPct(b.failShare)}</td></tr>`).join("");
  const tA = `<div class="eo-line"><b>A. Band Distribution</b> <span class="eo-meta">전체 encounter 기준 · veryHard가 과도한지 확인</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">band</th><th>n</th><th>비율</th><th>평균depth</th><th>평균적수</th><th>평균파티</th><th>평균전리품*</th><th>wipe직전</th><th>clear런中</th><th>fail런中</th></tr></thead><tbody>${aRows}</tbody></table></div>`;
  // B
  const bRows = rep.runwayByBand.map((b) => `<tr><td class="txt">${bandChip(b.band)}</td><td>${b.n}</td><td>${fmt1(b.avgRaw)}</td><td>${fmt1(b.avgEnemy)}</td><td>${b.buffered}</td><td>${fmt1(b.avgParty)}</td><td>${fmtPct(b.healerRate)}</td><td>${b.pre4}</td><td>${b.wipeAt}</td></tr>`).join("");
  const bSamp = rep.runwaySamples.map((e) => `<tr class="${e.wipe ? "eo-dhi" : ""}"><td>${e.depth}</td><td class="txt">${esc(boRouteLabel(e.route))}</td><td>${e.alertness}</td><td class="txt">${bandChip(e.band)}</td><td>${e.rawCount == null ? "—" : e.rawCount}</td><td>${e.enemyCount}</td><td>${e.partySize}</td><td class="txt">${e.hasHealer ? "힐" : "—"}${e.hasTank ? "·탱" : ""}</td><td>${e.lootProxy}</td><td class="txt">${e.wipe ? "전멸" : esc(e.outcome)}</td></tr>`).join("");
  const tB = `<div class="eo-line"><b>B. d6~9 Runway Lens</b> <span class="eo-meta">★핵심 — band가 d6~9에서 숨 고르기/억까를 만드는지(raw=director 적 수, 적수=band 적용 후)</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">band</th><th>n</th><th>평균raw</th><th>평균적수</th><th>완충된 수</th><th>평균파티</th><th>힐러율</th><th>pre4(파티&lt;4)</th><th>wipe직전</th></tr></thead><tbody>${bRows}</tbody></table></div>
    <div class="eo-line"><span class="eo-meta">d6~9 샘플 encounter(최대 16):</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th>depth</th><th class="txt">route</th><th>경계</th><th class="txt">band</th><th>raw</th><th>적수</th><th>파티</th><th class="txt">역할</th><th>전리품*</th><th class="txt">결과</th></tr></thead><tbody>${bSamp}</tbody></table></div>`;
  // C
  const cRows = rep.outcomeByBand.map((b) => `<tr><td class="txt">${bandChip(b.band)}</td><td>${b.runsTouched}</td><td>${b.wipeAt}</td><td>${b.within1}</td><td>${b.within2}</td><td>${b.oneLootReturn}</td><td>${b.clears}</td><td>${b.bossAtt}</td></tr>`).join("");
  const tC = `<div class="eo-line"><b>C. Outcome by Band</b> <span class="eo-meta">★상관 관측(원인 확정 아님) — band가 등장한 런과 결과의 관계</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">band</th><th>등장 런</th><th>이 band서 전멸</th><th>다음1내 전멸</th><th>다음2내 전멸</th><th>1전리품귀환</th><th>clear</th><th>boss시도</th></tr></thead><tbody>${cRows}</tbody></table></div>`;
  // D
  const dRows = rep.routeMatrix.map((r) => `<tr><td class="txt"><b>${esc(r.label)}</b> <span class="eo-meta">${r.route}</span></td><td class="txt">${r.combat ? "전투" : "비전투"}</td><td>${r.n}</td><td class="txt">${BAND_IDS.map((id) => r.dist[id] ? `${bandKo(id).slice(0, 2)}${r.dist[id]}` : "").filter(Boolean).join(" ") || "—"}</td><td>${r.n ? fmt1(r.avgEnemy) : "—"}</td><td>${r.n ? fmtPct(r.wipeAdj) : "—"}</td><td>${r.n ? fmt1(r.avgLoot) : "—"}</td></tr>`).join("");
  const tD = `<div class="eo-line"><b>D. Route × Band Matrix</b> <span class="eo-meta">danger 정체성·non-combat(쉼터=0 encounter) 확인</span></div>
    <div class="eo-tablewrap"><table><thead><tr><th class="txt">route</th><th class="txt">전투</th><th>n</th><th class="txt">band 분포</th><th>평균적수</th><th>wipe근접률</th><th>전리품*</th></tr></thead><tbody>${dRows}</tbody></table></div>`;
  // E
  const eBlocks = rep.samples.map((s) => {
    const chips = s.steps.map((e) => `<span class="eo-bo-step" title="${esc(boRouteLabel(e.route))} 경계${e.alertness} 적${e.enemyCount} 파티${e.partySize}${e.hasHealer ? " 힐O" : " 힐X"}${e.wasBossReady ? " 보스문" : ""}">d${e.depth} ${e.isBoss ? "보스" : bandKo(e.band).slice(0, 2)}<span class="eo-meta">·${e.enemyCount}/${e.partySize}</span></span>`).join("");
    return `<div class="eo-bo-tl"><div class="eo-bo-tlh"><b>${esc(s.label)}</b> <span class="eo-meta">${esc(s.result)}${s.deathDepth ? " · 전멸 d" + s.deathDepth : ""}${s.bossReadyDepth ? " · 보스문 d" + s.bossReadyDepth : ""}</span></div><div class="eo-bo-steps">${chips || "<span class='eo-meta'>encounter 없음</span>"}</div></div>`;
  }).join("");
  const tE = `<div class="eo-line"><b>E. Run Timeline Samples</b> <span class="eo-meta">런의 "이야기"로 band 호흡 읽기 — 각 칩 = d{심도} {band} ·적수/파티</span></div>${eBlocks || "<div class='eo-meta'>샘플 없음</div>"}`;
  const note = `<div class="eo-note"><b>Band Observatory</b> — 밴드와 런 결과의 <b>관계</b>를 보는 dev-only 관측 장비입니다. <b>원인 확정이 아니라 상관 관측</b>이며, clearRate를 맞추는 튜닝 도구가 아니라 <b>숲의 호흡</b>을 읽는 도구입니다. d6~9는 runway focus 구간. 그래프/칩 색은 좋음/나쁨이 아니라 <b>압력 강도(완화→고압)</b>입니다. *전리품=dev loot proxy(treasure 집계·헤드리스라 실 carriedLoot 아님).</div>`;
  const charts = chartBandDist(rep.bandDist) + chartDepthWave(rep.depthWave) + chartRunway(rep.runwayByDepth) + chartOutcome(rep.outcomeByBand) + chartTimelineStrip(rep.samples);
  el.innerHTML = note + head
    + `<div class="eo-line"><b>📈 그래프 — 나라가 숲의 호흡을 보는 창</b> <span class="eo-meta">관측용 · 밸런스 결론 아님</span></div>` + charts
    + `<div class="eo-line"><b>📋 상세 표 — 루다/렌 검증용</b></div>` + tA + tB + tC + tD + tE;
}

// Copy — Summary(사람) / JSON(parse). export = Node 검증.
export function buildBandSummaryText(rep = lastBandReport, rec = lastBandRecords) {
  if (!rep || !rec) return null;
  const L = [];
  L.push("[Band Observatory — Pressure Band Run Lens 01]");
  L.push("generated: " + new Date().toISOString());
  L.push(`실행: ${EXPEDITIONS[rec.profileId] ? EXPEDITIONS[rec.profileId].label : rec.profileId} · seed ${rec.seed} · ${rec.length}런 (route:${rep.meta.routeFilter} / outcome:${rep.meta.outcomeFilter})`);
  L.push(`표시 런 ${rep.meta.total} · clear ${rep.meta.clears} · wipe ${rep.meta.wipes} · boss시도 ${rep.meta.bossAtt} · encounter ${rep.meta.flatCount}`);
  L.push("", "[A. Band 분포] (band: n / 비율 / 평균적수 / wipe직전)");
  rep.bandDist.forEach((b) => L.push(`* ${bandKo(b.band)}: ${b.n} / ${fmtPct(b.share)} / 적수 ${fmt1(b.avgEnemy)} / wipe직전 ${b.wipeAt}`));
  L.push("", `[B. d6~9 Runway] (band: n / 평균raw→적수 / 완충수 / 힐러율 / wipe직전) — runway encounter ${rep.meta.runwayCount}`);
  rep.runwayByBand.forEach((b) => L.push(`* ${bandKo(b.band)}: ${b.n} / raw ${fmt1(b.avgRaw)}→적수 ${fmt1(b.avgEnemy)} / 완충 ${b.buffered} / 힐러 ${fmtPct(b.healerRate)} / wipe직전 ${b.wipeAt} / pre4 ${b.pre4}`));
  L.push("", "[C. Outcome by Band] (상관 관측 — band: 등장런 / 이band서전멸 / clear / boss시도)");
  rep.outcomeByBand.forEach((b) => L.push(`* ${bandKo(b.band)}: 등장 ${b.runsTouched} / 전멸 ${b.wipeAt} / 1전리품귀환 ${b.oneLootReturn} / clear ${b.clears} / boss ${b.bossAtt}`));
  L.push("", "[D. Route × Band] (route: n / 평균적수 / wipe근접률)");
  rep.routeMatrix.forEach((r) => L.push(`* ${r.label}(${r.route}): ${r.combat ? "전투" : "비전투"} ${r.n} / 적수 ${r.n ? fmt1(r.avgEnemy) : "—"} / wipe근접 ${r.n ? fmtPct(r.wipeAdj) : "—"}`));
  L.push("", "[E. 타임라인 샘플]");
  rep.samples.forEach((s) => L.push(`* ${s.label}(${s.result}): ` + s.steps.map((e) => `d${e.depth}${e.isBoss ? "보스" : bandKo(e.band).slice(0, 2)}`).join(" ")));
  L.push("", "주의: 이 결과는 band와 outcome의 상관 관측이며, 원인 확정이나 밸런스 결론이 아닙니다.");
  L.push("주의: Band Observatory 01은 dev-only 관측 장비이며, 밴드 로직을 변경하지 않습니다.");
  return L.join("\n");
}
export function buildBandJSON(rep = lastBandReport, rec = lastBandRecords) {
  if (!rep || !rec) return JSON.stringify({ tool: "band-observatory", note: "no data — run first" }, null, 0);
  return JSON.stringify({
    tool: "band-observatory", note: "dev-only 관측 · band↔outcome 상관(원인/밸런스 결론 아님) · 밴드 로직 무변경 · *loot=dev proxy",
    generatedAt: new Date().toISOString(),
    inputs: { seed: rec.seed, runs: rec.length, profile: rec.profileId, routeFilter: rep.meta.routeFilter, outcomeFilter: rep.meta.outcomeFilter },
    bandDistribution: rep.bandDist, depthWave: rep.depthWave, runwayLens: { byBand: rep.runwayByBand, byDepth: rep.runwayByDepth, samples: rep.runwaySamples }, outcomeByBand: rep.outcomeByBand, routeBandMatrix: rep.routeMatrix, timelineSamples: rep.samples,
    warnings: ["band↔outcome는 상관 관측이며 원인 확정/밸런스 결론이 아닙니다.", "Band Observatory 01은 dev-only 관측 장비이며 밴드 로직을 변경하지 않습니다.", "전리품 수치는 dev loot proxy(treasure 집계)이며 헤드리스라 실제 carriedLoot가 아닙니다."],
  }, null, 0);
}

async function runBandObservatoryUI() {
  if (boRunning || running) return;
  boRunning = true; boCancel = false;
  const status = $("eo-bo-status"), btn = $("eo-bo-run"), cancel = $("eo-bo-cancel");
  if (btn) btn.disabled = true; if (cancel) cancel.disabled = false; setRunningUI(true);
  const inp = readBandInputs();
  try {
    if (status) status.textContent = `Band Lens 실행 중… (${EXPEDITIONS[inp.profileId].label} · seed ${inp.seed} · ${inp.runs}런)`;
    const records = await runBandLens({ seed: inp.seed, runs: inp.runs, profileId: inp.profileId, onProgress: (d) => { if (status) status.textContent = `Band Lens ${d}/${inp.runs}런…`; }, shouldCancel: () => boCancel });
    records.seed = inp.seed; records.profileId = inp.profileId; // 메타 부착(배열에)
    lastBandRecords = records;
    renderBandObservatory();
    if (status) status.textContent = `Band Lens 완료 — ${records.length}런 (seed ${inp.seed} · ${EXPEDITIONS[inp.profileId].label})${boCancel ? " · 취소됨" : ""}`;
  } catch (e) { if (status) status.textContent = "에러: " + (e && e.message); console.error(e); }
  finally { boRunning = false; if (btn) btn.disabled = false; if (cancel) cancel.disabled = true; setRunningUI(false); }
}

export function initExpeditionObservatory() {
  $("eo-run100").addEventListener("click", () => runObservatory(100, "baseline"));
  $("eo-run300").addEventListener("click", () => runObservatory(300, "baseline"));
  $("eo-export-json").addEventListener("click", (e) => copyOut(exportJSON(), e.target, "JSON 복사"));
  $("eo-export-tsv").addEventListener("click", (e) => copyOut(exportTSV(), e.target, "Run TSV 복사"));
  const seatBtn = $("eo-export-seat-tsv");
  if (seatBtn) seatBtn.addEventListener("click", (e) => copyOut(exportSeatTSV(), e.target, "Seat TSV 복사"));
  $("eo-export-txt").addEventListener("click", (e) => copyOut(exportSummaryText(), e.target, "요약 복사"));

  // ── Current Director Snapshot 01 (depth/alertness/route → encounter pressure 관측) ──
  const dirRunBtn = $("eo-dir-run"); if (dirRunBtn) dirRunBtn.addEventListener("click", renderDirectorSnapshot);
  const dirPresets = $("eo-dir-presets");
  if (dirPresets) dirPresets.addEventListener("click", (e) => { const b = e.target.closest("[data-dir-preset]"); if (b) applyDirPreset(b.dataset.dirPreset); });
  const dirCopy = (build, label) => async () => {
    const status = $("eo-dir-copy-status"), ta = $("eo-dir-text");
    const txt = build();
    if (ta) { ta.value = txt; ta.style.display = "block"; }
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; }
    catch (e) { try { ta.focus(); ta.select(); ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
    if (status) status.textContent = ok ? `${label} 복사됨.` : "클립보드 실패 — 아래 칸에서 직접 선택해 복사하세요(텍스트는 표시됨).";
  };
  const dcs = $("eo-dir-copy-sum"); if (dcs) dcs.addEventListener("click", dirCopy(buildDirectorSummaryText, "Director Summary"));
  const dcj = $("eo-dir-copy-json"); if (dcj) dcj.addEventListener("click", dirCopy(buildDirectorJSON, "Director JSON"));
  const dirToggle = $("eo-dir-toggle");
  if (dirToggle) dirToggle.addEventListener("click", () => { const ta = $("eo-dir-text"); if (!ta) return; ta.style.display = (ta.style.display === "none" || !ta.style.display) ? "block" : "none"; });
  if ($("eo-dir-out")) renderDirectorSnapshot(); // 기본 스냅샷 즉시 표시

  // ── Band Observatory 01 (Pressure Band Run Lens) ──
  const boRun = $("eo-bo-run"); if (boRun) boRun.addEventListener("click", runBandObservatoryUI);
  const boCancelBtn = $("eo-bo-cancel"); if (boCancelBtn) boCancelBtn.addEventListener("click", () => { boCancel = true; });
  ["eo-bo-route", "eo-bo-outcome"].forEach((id) => { const e = $(id); if (e) e.addEventListener("change", () => { if (lastBandRecords) renderBandObservatory(); }); });
  const boCopy = (build, label) => async () => {
    const status = $("eo-bo-copy-status"), ta = $("eo-bo-text");
    const txt = build(); if (!txt) { if (status) status.textContent = "먼저 Run Band Lens를 실행하세요."; return; }
    if (ta) { ta.value = txt; ta.style.display = "block"; }
    let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) { try { ta.focus(); ta.select(); ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
    if (status) status.textContent = ok ? `${label} 복사됨.` : "클립보드 실패 — 아래 칸에서 직접 선택해 복사하세요(텍스트는 표시됨).";
  };
  const bcs = $("eo-bo-copy-sum"); if (bcs) bcs.addEventListener("click", boCopy(buildBandSummaryText, "Band Observatory Summary"));
  const bcj = $("eo-bo-copy-json"); if (bcj) bcj.addEventListener("click", boCopy(buildBandJSON, "Band Observatory JSON"));
  const boToggle = $("eo-bo-toggle"); if (boToggle) boToggle.addEventListener("click", () => { const ta = $("eo-bo-text"); if (!ta) return; ta.style.display = (ta.style.display === "none" || !ta.style.display) ? "block" : "none"; });
  if ($("eo-bo-out")) renderBandObservatory(); // 초기 빈 상태

  // Phase 1.5 — Seat Value lens 탭 전환(재실행 없이 캐시된 리포트로 즉시 재렌더).
  $("eo-seat").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lens]");
    if (!b || !lastReport) return;
    currentLens = b.dataset.lens;
    renderSeat(lastReport);
  });

  // ── Nara Sandbox ──
  renderSandbox();
  const sb = $("eo-sandbox");
  if (sb) {
    // 입력 — 포커스 유지 위해 full re-render 없이 sandbox 갱신 + 인디케이터만 새로고침.
    sb.addEventListener("input", (e) => {
      const t = e.target; const kind = t.dataset && t.dataset.sb; if (!kind) return;
      if (kind === "hero") setHeroOv(t.dataset.job, t.dataset.field, t.value);
      else if (kind === "monster") setMonsterOv(t.dataset.type, t.dataset.field, t.value);
      else if (kind === "mult") setMultOv(t.dataset.key, t.dataset.stat, t.value);
      refreshIndicator();
    });
    // 프리셋 / 실행 / import-export 버튼.
    sb.addEventListener("click", (e) => {
      const pb = e.target.closest("[data-preset]");
      if (pb) { PRESETS[pb.dataset.preset].apply(); renderSandbox(); return; }
      const id = e.target.id;
      if (id === "eo-sb-baseline") runObservatory(readSbRuns(), "baseline");
      else if (id === "eo-sb-variant") runObservatory(readSbRuns(), "variant");
      else if (id === "eo-sb-compare") runCompareSeq();
      else if (id === "eo-sb-ovexport") copyOut(exportOverrideJSON(), e.target, "Override JSON 복사");
      else if (id === "eo-sb-ovimport-btn") {
        const res = importOverrideJSON(($("eo-sb-ovimport") || {}).value || "");
        renderSandbox();
        $("eo-status").textContent = "Override import: " + res.msg;
      }
    });
  }
  // ── Seed Finder ──
  const jobSel = $("eo-sf-job");
  if (jobSel) {
    jobSel.innerHTML = HERO_GROUPS.map((g) => `<optgroup label="${g.tier}">${g.jobs.map((j) => `<option value="${j}"${j === "dancer" ? " selected" : ""}>${esc(jobName(j))}</option>`).join("")}</optgroup>`).join("");
  }
  const profSel = $("eo-sf-profile");
  if (profSel) {
    profSel.innerHTML = `<option value="all">전체 4프로필</option>` + EXPEDITION_ORDER.map((id) => `<option value="${id}">${esc(EXPEDITIONS[id].label)}</option>`).join("");
  }
  const sfRun = $("eo-sf-run"); if (sfRun) sfRun.addEventListener("click", runSeedFinder);
  const sfCancelBtn = $("eo-sf-cancel"); if (sfCancelBtn) sfCancelBtn.addEventListener("click", () => { sfCancel = true; });

  // ── Phase 2D — Copy Experiment Summary ──
  const expCopy = $("eo-exp-copy");
  if (expCopy) expCopy.addEventListener("click", async () => {
    const status = $("eo-exp-status"), ta = $("eo-exp-text");
    const txt = buildExperimentSummary();
    if (!txt) { if (status) status.textContent = "먼저 Baseline / Variant(또는 Compare)를 실행하세요."; return; }
    if (ta) { ta.value = txt; ta.style.display = "block"; }
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; }
    catch (e) { try { ta.focus(); ta.select(); ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
    if (status) status.textContent = ok ? "실험 요약을 클립보드에 복사했습니다." : "클립보드 실패 — 아래 칸에서 직접 선택해 복사하세요(텍스트는 표시됨).";
  });
  const expToggle = $("eo-exp-toggle");
  if (expToggle) expToggle.addEventListener("click", () => {
    const ta = $("eo-exp-text"); if (!ta) return;
    if (!ta.value) { ta.value = buildExperimentSummary() || "먼저 Baseline / Variant(또는 Compare)를 실행하세요."; }
    ta.style.display = (ta.style.display === "none" || !ta.style.display) ? "block" : "none";
  });

  // ── Phase 3A — Multi-Seed Experiment Queue ──
  const msRun = $("eo-ms-run"); if (msRun) msRun.addEventListener("click", runMultiSeed);
  const msCancelBtn = $("eo-ms-cancel"); if (msCancelBtn) msCancelBtn.addEventListener("click", () => { msCancel = true; });
  const msCopy = $("eo-ms-copy");
  if (msCopy) msCopy.addEventListener("click", async () => {   // 2D fallback 구조 재사용
    const status = $("eo-ms-copy-status"), ta = $("eo-ms-text");
    const txt = buildMultiSeedSummary();
    if (!txt) { if (status) status.textContent = "먼저 Run Multi-Seed Compare를 실행하세요."; return; }
    if (ta) { ta.value = txt; ta.style.display = "block"; }
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; }
    catch (e) { try { ta.focus(); ta.select(); ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
    if (status) status.textContent = ok ? "Multi-Seed 요약을 클립보드에 복사했습니다." : "클립보드 실패 — 아래 칸에서 직접 선택해 복사하세요(텍스트는 표시됨).";
  });
  const msToggle = $("eo-ms-toggle");
  if (msToggle) msToggle.addEventListener("click", () => {
    const ta = $("eo-ms-text"); if (!ta) return;
    if (!ta.value) { ta.value = buildMultiSeedSummary() || "먼저 Run Multi-Seed Compare를 실행하세요."; }
    ta.style.display = (ta.style.display === "none" || !ta.style.display) ? "block" : "none";
  });

  // ── Phase 3B — Copy One Loot Breakdown ──
  const olCopy = $("eo-ol-copy");
  if (olCopy) olCopy.addEventListener("click", async () => {   // 2D/3A fallback 구조 재사용
    const status = $("eo-ol-status"), ta = $("eo-ol-text");
    const txt = buildOneLootBreakdownText();
    if (!txt) { if (status) status.textContent = "먼저 Baseline / Variant(또는 Compare)를 실행하세요."; return; }
    if (ta) { ta.value = txt; ta.style.display = "block"; }
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; }
    catch (e) { try { ta.focus(); ta.select(); ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
    if (status) status.textContent = ok ? "One Loot Breakdown을 클립보드에 복사했습니다." : "클립보드 실패 — 아래 칸에서 직접 선택해 복사하세요(텍스트는 표시됨).";
  });
  const olToggle = $("eo-ol-toggle");
  if (olToggle) olToggle.addEventListener("click", () => {
    const ta = $("eo-ol-text"); if (!ta) return;
    if (!ta.value) { ta.value = buildOneLootBreakdownText() || "먼저 Baseline / Variant(또는 Compare)를 실행하세요."; }
    ta.style.display = (ta.style.display === "none" || !ta.style.display) ? "block" : "none";
  });
}
