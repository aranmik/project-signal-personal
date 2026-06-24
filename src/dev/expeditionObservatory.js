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
import { depthBand, BOSS_MENACE, BOSS_FLOOR } from "../data/routes.js";

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
      const battleJobs = partyJobIds();
      battleJobs.forEach((j) => rec.jobsSeen.add(j));
      const route = pendingRoute, wasBossReady = bossReadyReached;
      // Phase 1.5 — 보스문이 열린 뒤 욕심(비-보스) 전투에 들고 들어간 직업 집계(postBossReady lens).
      if (wasBossReady && route !== "boss") battleJobs.forEach((j) => rec.postBossReadyJobs.add(j));
      const keysBefore = gameState.run.bossKeys || 0;
      rec.battleCount += 1; rec.path.push(ROUTE_TOKEN[route] || "B");
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
    metadata: { tool: "expedition-observatory", phase: "2B", theme: "beginner", seed: rep.meta.seed, runsPerProfile: rep.meta.runs, profiles: EXPEDITION_ORDER, sampleMin: rep.sampleMin, generatedAt: new Date().toISOString(),
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
  EXPEDITION_ORDER.forEach((id) => { const s = rep.summaries[id]; const c = EXPEDITIONS[id]; L.push(`· ${c.label}(${c.sub}): 승률 ${fmtPct(s.winRate)} / 전멸 ${fmtPct(s.wipeRate)} / 평균전리품 ${fmt1(s.avgLootProxy)} / 평균클리어심도 ${fmt1(s.avgClearDepth)} / 보스문후 +${fmt1(s.avgPostBossReadyDepth)}심도`); });
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
  { label: "평균 lootProxy", get: (s) => s.avgLootProxy },
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
  ["eo-run100", "eo-run300", "eo-sb-baseline", "eo-sb-variant", "eo-sb-compare", "eo-sf-run"].forEach((id) => { const b = $(id); if (b) b.disabled = on; });
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
    status.textContent = `Compare 완료 — seed ${variantReport.meta.seed} · 프로필당 ${runs}런 (Baseline↔Variant)`;
    $("eo-compare").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    status.textContent = "에러: " + (e && e.message); console.error(e);
  } finally { setRunningUI(false); running = false; }
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

export function initExpeditionObservatory() {
  $("eo-run100").addEventListener("click", () => runObservatory(100, "baseline"));
  $("eo-run300").addEventListener("click", () => runObservatory(300, "baseline"));
  $("eo-export-json").addEventListener("click", (e) => copyOut(exportJSON(), e.target, "JSON 복사"));
  $("eo-export-tsv").addEventListener("click", (e) => copyOut(exportTSV(), e.target, "Run TSV 복사"));
  const seatBtn = $("eo-export-seat-tsv");
  if (seatBtn) seatBtn.addEventListener("click", (e) => copyOut(exportSeatTSV(), e.target, "Seat TSV 복사"));
  $("eo-export-txt").addEventListener("click", (e) => copyOut(exportSummaryText(), e.target, "요약 복사"));
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
}
