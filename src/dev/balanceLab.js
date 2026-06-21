// =====================================================================
// Dev Balance Lab 03 — Matchup Matrix & Role Diagnostics (계측 전용 Dev 도구)
//   (Balance Lab 02 Role Value Metrics 위 확장 — 전투/직업/파티/테마 적합성 "현미경")
//
//   목적: 재미가 있을 법한 좌표·이상한 조합·억울한 직업·과성능 직업·테마 병목을 좁혀준다.
//         사람이 모든 조합을 손으로 찾으면 늙어죽으므로, 도구가 먼저 좌표를 좁힌다.
//   진입: ?dev=1 에서만 타이틀 버튼(main.js). 일반 플레이엔 절대 노출 안 됨.
//   분리: 실제 전투 엔진(battle.js runLabScenario)을 헤드리스로 재사용 — 전투식/직업/스킬/몬스터/보상/
//         스테이지/합체 데이터·localStorage·발자취는 일절 안 건드린다. 결과는 메모리 전용(저장 X).
//   battle.js 무변경: 02의 per-unit 미터가 dmgDone/dmgTaken/shield/heal/counters/marks/overkill/생존시간 등
//         원자료를 이미 노출 → 매트릭스/역할진단/낭비진단/watch tag/Visibility Gap을 전부 여기서 파생·집계한다.
//   모드: 1:1 / 다중 / 파티 / 매트릭스(직업·파티 × 적·그룹) / 역할진단(역할군별 PASS·WATCH).
// =====================================================================
import { runLabScenario } from "../core/battle.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { BASE_JOBS, ADVANCED_JOBS, SECOND_CLASS_JOBS, combatRoleLabelOf } from "../data/jobs.js";

/* ── 선택지 카탈로그 ─────────────────────────────────────────────── */
const HERO_GROUPS = [
  { label: "기본 6종", jobs: BASE_JOBS },
  { label: "1차 15종", jobs: ADVANCED_JOBS },
  { label: "2차 (해금 SR-22~30)", jobs: SECOND_CLASS_JOBS },
];
const ALL_JOBS = [...BASE_JOBS, ...ADVANCED_JOBS, ...SECOND_CLASS_JOBS].filter((j) => UNIT_TEMPLATES.party[j]);

const DUMMY_TEMPLATE = { id: "dummy", name: "더미(무저항)", team: "enemy", type: "dummy", role: "front", maxHp: 100000, atk: 0, speed: 0 };
const ENEMY_KEYS = ["dummy", "bear", "fox", "bird", "dewslime", "lamb", "owl", "deer", "lion"];
function enemyTemplateOf(key) { return key === "dummy" ? DUMMY_TEMPLATE : UNIT_TEMPLATES.enemies[key]; }
function jobName(id) { return (UNIT_TEMPLATES.party[id] && UNIT_TEMPLATES.party[id].name) || id; }
function enemyName(key) { const t = enemyTemplateOf(key); return (t && t.name) || key; }

const ENEMY_GROUPS = [
  { id: "g_small3", label: "소형 3 (잎여우3)", keys: ["fox", "fox", "fox"], theme: "beginner" },
  { id: "g_f2b2", label: "전열2+후열2 (곰·여우·새·이슬)", keys: ["bear", "fox", "bird", "dewslime"], theme: "beginner" },
  { id: "g_elite2", label: "정예+소형2 (올빼미·여우·새)", keys: ["owl", "fox", "bird"], theme: "beginner" },
  { id: "g_smallWave", label: "초보자 소형 웨이브 (곰·여우·새·이슬)", keys: ["bear", "fox", "bird", "dewslime"], theme: "beginner" },
  { id: "g_eliteWave", label: "초보자 정예 웨이브 (사슴·여우·새)", keys: ["deer", "fox", "bird"], theme: "beginner" },
  { id: "g_boss", label: "보스 웨이브 (사자왕)", keys: ["lion"], theme: "beginner" },
];
const groupOf = (id) => ENEMY_GROUPS.find((g) => g.id === id) || ENEMY_GROUPS[0];
const groupTemplates = (id) => groupOf(id).keys.map(enemyTemplateOf);

const PARTY_PRESETS = [
  { id: "p_base", label: "기본 기준 (전사·수호자·궁수·사제)", jobs: ["warrior", "guardian", "archer", "priest"] },
  { id: "p_attack", label: "공격 (전사·도적·궁수·마도)", jobs: ["warrior", "rogue", "archer", "mage"] },
  { id: "p_stable", label: "안정 (수호자·전사·사제·신관)", jobs: ["guardian", "warrior", "priest", "cleric"] },
  { id: "p_first", label: "1차 혼합 (성직자·파수궁·선봉·도적)", jobs: ["saint", "watchbow", "vanguard", "rogue"] },
  { id: "p_second", label: "2차 포함 (검성·성직자·수문장·천궁)", jobs: ["swordsaint", "saint", "gatekeeper", "skyarcher"] },
  { id: "p_exp", label: "실험 (현자·용창·결계장·구원자)", jobs: ["sage", "dragonspear", "wardkeeper", "redeemer"] },
];
const partyOf = (id) => PARTY_PRESETS.find((p) => p.id === id) || PARTY_PRESETS[0];

// 테마 프리셋 구조(현재 초보자 숲만 enabled — 미래 테마는 그룹만 추가하면 됨).
const THEMES = [
  { id: "beginner", label: "초보자 숲 / Beginner Forest", enabled: true },
  { id: "poison", label: "독무 늪지 / Poison Marsh (준비 중)", enabled: false },
  { id: "citadel", label: "장갑 성채 / Armored Citadel (준비 중)", enabled: false },
  { id: "shadow", label: "그림자 습격대 / Shadow Raiders (준비 중)", enabled: false },
  { id: "goblin", label: "고블린 캠프 / Goblin Camp (준비 중)", enabled: false },
  { id: "troll", label: "트롤 굴 / Troll Den (준비 중)", enabled: false },
  { id: "toxic", label: "중독 늪 / Toxic Swamp (준비 중)", enabled: false },
];
const groupsForTheme = (themeId) => ENEMY_GROUPS.filter((g) => g.theme === themeId);

const DURATIONS = [30, 60, 120];
const MODES = [
  { id: "duel", label: "1:1" }, { id: "multi", label: "다중" }, { id: "party", label: "파티" },
  { id: "matrix", label: "매트릭스" }, { id: "role", label: "역할진단" },
];

/* ── 역할군 / 티어 (초기값 — 나라/유키가 객체만 고쳐 조정) ───────────────── */
const ROLE_GROUP = {
  warrior: "singleDps", guardian: "tank", archer: "singleDps", priest: "healer", cleric: "shielder", trickster: "control",
  rogue: "singleDps", saint: "healer", warden: "debuff", watchbow: "counter", trapper: "debuff", paladin: "tank",
  vanguard: "aoeDps", forbidden: "tank", wall: "tank", healbow: "healer", purifier: "healer", mage: "aoeDps",
  bard: "support", gatekeeper: "tank", tracker: "marker",
  dragonspear: "pierce", sage: "aoeDps", sunlord: "support", swordsaint: "counter", redeemer: "healer",
  skyarcher: "marker", plaguebringer: "debuff", dancer: "support", wardkeeper: "shielder",
};
const ROLE_LABEL = {
  singleDps: "단일딜", aoeDps: "광역딜", pierce: "관통", tank: "탱커", healer: "힐러", shielder: "보호막",
  counter: "반격", marker: "표식", debuff: "디버프", control: "제어", support: "지원", secondClassCarry: "2차캐리", experimental: "실험",
};
const ROLE_ORDER = ["singleDps", "aoeDps", "pierce", "tank", "healer", "shielder", "counter", "marker", "debuff", "control", "support"];
const roleGroupOf = (id) => ROLE_GROUP[id] || "support";
const roleLabelOf = (id) => ROLE_LABEL[roleGroupOf(id)] || roleGroupOf(id);
const tierOf = (id) => (SECOND_CLASS_JOBS.includes(id) ? "2차" : ADVANCED_JOBS.includes(id) ? "1차" : "기본");
// 조건부/지표 묻히기 쉬운 역할(Visibility Gap 후보).
const CONDITIONAL_ROLES = new Set(["counter", "marker", "debuff", "control", "support", "shielder"]);

const DURATION_DEFAULT = 60;
const fmtInt = (n) => Math.round(n || 0).toLocaleString("en-US");
const fmtF1 = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const fmtPct = (n) => (Math.round((n || 0) * 1000) / 10).toFixed(1) + "%";
const dash = (v, f) => (v == null ? "—" : f(v));

/* ── 프리셋(처음 열었을 때 바로 예시) ────────────────────────────────── */
const PRESETS = [
  { mode: "duel", heroJob: "warrior", enemyKey: "dummy", seconds: 60, label: "전사 vs 더미 60" },
  { mode: "duel", heroJob: "paladin", enemyKey: "lion", seconds: 120, label: "성기사 vs 사자왕 120" },
  { mode: "multi", heroJob: "mage", groupId: "g_small3", seconds: 60, label: "마도 vs 소형3 60" },
  { mode: "matrix", mScope: "jobsVsEnemy", mJobSet: "all", enemyKey: "lion", seconds: 120, label: "전체직업 × 사자왕 120" },
  { mode: "matrix", mScope: "partiesVsGroup", groupId: "g_smallWave", seconds: 120, label: "전체파티 × 소형웨이브 120" },
  { mode: "role", enemyKey: "lion", roleEnemyType: "enemy", seconds: 120, label: "역할진단 × 사자왕 120" },
];

/* ── 모듈 상태(메모리 전용 — localStorage 미사용) ──────────────────── */
let els = null;
let sel = {
  mode: "duel", theme: "beginner", heroJob: "warrior", enemyKey: "bear", groupId: "g_small3", partyId: "p_base", seconds: 60,
  mScope: "jobsVsEnemy", mJobSet: "all", roleEnemyType: "enemy",
  sortKey: "dps", sortDir: -1, filterTier: "all", filterRole: "all",
};
let lastResult = null, lastMeta = null;     // 단일 모드 결과
let lastMatrix = null;                       // 매트릭스/역할 결과(fullRow[])
const rows = [];                             // 비교표 누적(fullRow)
const dummyDpsCache = new Map();             // 단일 더미 DPS 캐시
let running = false;

/* ── 파생 지표 / fullRow 빌더 ───────────────────────────────────────
   하나의 실험(직업 or 파티 × 적 or 그룹)을 통일된 fullRow로 만든다.
   netDamageTaken = 받은피해 - 보호막흡수 - 유효회복. multiEfficiency = dps / 단일더미dps. */
function dummyDps(job, seconds) {
  const key = `${job}:${seconds}`;
  if (dummyDpsCache.has(key)) return dummyDpsCache.get(key);
  const r = runLabScenario({ allyJobs: [job], enemyTemplates: [DUMMY_TEMPLATE], seconds, sustained: true });
  const v = r ? r.dps : 0; dummyDpsCache.set(key, v); return v;
}
// 직업 1명 vs 적/그룹 → fullRow
function jobRow(job, enemyTemplates, enemyLabel, seconds, sustained, opts = {}) {
  const r = runLabScenario({ allyJobs: [job], enemyTemplates, seconds, sustained });
  if (!r) return null;
  const a = r.allies[0] || {};
  const net = (a.dmgTaken || 0) - (a.shieldBlocked || 0) - (a.healDone || 0);
  const base = opts.multiEff ? dummyDps(job, seconds) : 0;
  return {
    subjectType: "job", subject: job, name: jobName(job), tier: tierOf(job), roleGroup: roleGroupOf(job), roleLabel: roleLabelOf(job),
    scenarioType: opts.scenarioType || (sustained ? "sustained" : "battle"), enemyLabel, seconds,
    totalDamage: r.totalDamage, dps: r.dps, attacks: a.hits || 0, crits: a.crits || 0,
    skillTriggers: a.skillCasts || 0, skillDamage: a.skillDamage || 0, counters: a.counters || 0, marks: a.marks || 0,
    damageTaken: a.dmgTaken || 0, netDamageTaken: net, healingDone: a.healDone || 0, overHealing: a.overHeal || 0,
    shieldApplied: a.shieldApplied || 0, shieldAbsorbed: a.shieldBlocked || 0,
    kills: r.killCount, targetsHit: r.targetsHit, firstKillTime: r.firstKillTime, overkillLoss: r.overkillLoss,
    singleDummyDps: base, multiEfficiency: base > 0 ? r.dps / base : null,
    survivalTime: a.survivalTime, fainted: !!a.fainted, enemyCount: r.enemies.length,
    perTarget: r.enemies.map((e) => ({ name: e.name, dmgTaken: e.dmgTaken, overkill: e.overkillTaken, deaths: e.deaths })),
    result: null, members: null,
    ...derived({ totalDamage: r.totalDamage, overkillLoss: r.overkillLoss, healingDone: a.healDone || 0, overHealing: a.overHeal || 0, shieldApplied: a.shieldApplied || 0, shieldAbsorbed: a.shieldBlocked || 0, targetsHit: r.targetsHit, skillTriggers: a.skillCasts || 0, skillDamage: a.skillDamage || 0 }),
  };
}
// 파티 vs 그룹 → fullRow (자연 종료)
function partyRow(partyId, enemyTemplates, enemyLabel, seconds) {
  const p = partyOf(partyId);
  const r = runLabScenario({ allyJobs: p.jobs, enemyTemplates, seconds, sustained: false });
  if (!r) return null;
  const net = r.totalDamageTaken - r.totalShieldAbsorbed - r.totalHealing;
  const totalShieldApplied = r.allies.reduce((s, m) => s + (m.shieldApplied || 0), 0);
  return {
    subjectType: "party", subject: partyId, name: p.label.split(" (")[0], tier: "—", roleGroup: "party", roleLabel: "파티",
    scenarioType: "party", enemyLabel, seconds,
    totalDamage: r.totalDamage, dps: null, attacks: null, crits: null, skillTriggers: null, skillDamage: null, counters: null, marks: null,
    damageTaken: r.totalDamageTaken, netDamageTaken: net, healingDone: r.totalHealing, overHealing: r.allies.reduce((s, m) => s + (m.overHeal || 0), 0),
    shieldApplied: totalShieldApplied, shieldAbsorbed: r.totalShieldAbsorbed,
    kills: r.killCount, targetsHit: r.targetsHit, firstKillTime: r.firstKillTime, overkillLoss: r.overkillLoss,
    singleDummyDps: null, multiEfficiency: null, survivalTime: null, fainted: r.faintCount > 0, enemyCount: r.enemies.length,
    perTarget: r.enemies.map((e) => ({ name: e.name, dmgTaken: e.dmgTaken, overkill: e.overkillTaken, deaths: e.deaths })),
    result: r.result, clearTime: r.clearTime, remainingHp: r.remainingHp, remainingHpPercent: r.remainingHpRatio,
    faintCount: r.faintCount, survivorCount: r.survivorCount,
    members: r.allies.map((m) => ({ job: m.id, name: m.name, damage: m.dmgDone || 0, healing: m.healDone || 0, shieldApplied: m.shieldApplied || 0, shieldAbsorbed: m.shieldBlocked || 0, damageTaken: m.dmgTaken || 0, netDamageTaken: (m.dmgTaken || 0) - (m.shieldBlocked || 0) - (m.healDone || 0), finalHp: m.finalHp, dead: m.isDead })),
    ...derived({ totalDamage: r.totalDamage, overkillLoss: r.overkillLoss, healingDone: r.totalHealing, overHealing: r.allies.reduce((s, m) => s + (m.overHeal || 0), 0), shieldApplied: totalShieldApplied, shieldAbsorbed: r.totalShieldAbsorbed, targetsHit: r.targetsHit, skillTriggers: 0, skillDamage: 0 }),
  };
}
function derived(x) {
  const okBase = (x.totalDamage || 0) + (x.overkillLoss || 0);
  const ohBase = (x.healingDone || 0) + (x.overHealing || 0);
  return {
    overkillRate: okBase > 0 ? (x.overkillLoss || 0) / okBase : 0,
    overHealingRate: ohBase > 0 ? (x.overHealing || 0) / ohBase : 0,
    shieldWasted: Math.max(0, (x.shieldApplied || 0) - (x.shieldAbsorbed || 0)),
    damagePerTarget: (x.totalDamage || 0) / Math.max(1, x.targetsHit || 1),
    valuePerTrigger: x.skillTriggers > 0 ? (x.skillDamage || 0) / x.skillTriggers : 0,
  };
}

/* ── 역할별 PASS/WATCH 판정 + Watch Tags ─────────────────────────────
   목표값/임계는 cohort(같은 적을 친 행 묶음) 상대 + 절대 혼합. 객체 상수로 조정 가능. */
const ROLE_THRESH = { aoeMultiEff: 1.5, aoeTargets: 3, pierceTargets: 2, tankNetCut: 0.7, overHealWatch: 0.40 };
function roleVerdict(row, base) {
  const rg = row.roleGroup;
  if (rg === "singleDps") return row.dps >= base.medianDps ? "PASS" : "WATCH";
  if (rg === "aoeDps") return (row.multiEfficiency >= ROLE_THRESH.aoeMultiEff || row.targetsHit >= ROLE_THRESH.aoeTargets) ? "PASS" : "WATCH";
  if (rg === "pierce") return row.targetsHit >= ROLE_THRESH.pierceTargets ? "PASS" : "WATCH";
  if (rg === "tank") return (base.warriorNet > 0 && row.netDamageTaken <= base.warriorNet * ROLE_THRESH.tankNetCut) ? "PASS" : (row.netDamageTaken < base.warriorNet ? "WATCH" : "WATCH");
  if (rg === "healer") return row.healingDone > 0 && row.netDamageTaken < row.damageTaken ? (row.overHealingRate > ROLE_THRESH.overHealWatch ? "WATCH" : "PASS") : "WATCH";
  if (rg === "shielder") return (row.shieldAbsorbed > 0 || row.shieldApplied > 0) ? "PASS" : "WATCH";
  if (rg === "counter") return row.counters > 0 ? "PASS" : "WATCH";
  if (rg === "marker") return row.marks > 0 ? "PASS" : "WATCH";
  // debuff/control/support: 측정 가치가 잡히면 PASS, 아니면 가시성 워치.
  const measured = (row.counters || 0) + (row.marks || 0) + (row.healingDone || 0) + (row.shieldAbsorbed || 0);
  return measured > 0 || row.dps >= base.medianDps ? "PASS" : "WATCH";
}
// 절대 태그(행 단독). cohort 상대 태그는 tagCohort에서 추가.
function tagRow(row, base) {
  const t = [];
  const skillJob = (UNIT_TEMPLATES.party[row.subject] && UNIT_TEMPLATES.party[row.subject].grammar) ? true : false;
  if (row.counters > 0) t.push("Counter Value");
  if (row.marks > 0) t.push("Mark Value");
  if (row.healingDone > 0 && row.netDamageTaken < row.damageTaken) t.push("Heal Value");
  if (row.shieldAbsorbed > 0) t.push("Shield Value");
  if (row.subjectType === "job" && row.skillTriggers === 0 && skillJob && CONDITIONAL_ROLES.has(row.roleGroup)) t.push("Trigger Not Seen");
  if (row.multiEfficiency != null && row.multiEfficiency >= ROLE_THRESH.aoeMultiEff && row.targetsHit >= ROLE_THRESH.aoeTargets) t.push("AoE Specialist");
  if (row.multiEfficiency != null && row.multiEfficiency < 1.15 && (row.roleGroup === "singleDps")) t.push("Single Target Specialist");
  // 지표 미포착(Visibility Gap): 조건부 역할인데 측정된 가치가 없고 딜도 평범 이하.
  if (row.subjectType === "job" && CONDITIONAL_ROLES.has(row.roleGroup)
    && (row.counters || 0) === 0 && (row.marks || 0) === 0 && (row.healingDone || 0) === 0 && (row.shieldAbsorbed || 0) === 0
    && row.dps < base.medianDps) t.push("Visibility Gap");
  if (row.tier === "2차" && row.dps != null && row.dps < base.medianDps && (row.counters || 0) === 0 && (row.marks || 0) === 0 && (row.healingDone || 0) === 0 && (row.shieldAbsorbed || 0) === 0) t.push("Second Class Identity Watch");
  return t;
}
function tagCohort(list) {
  const dpsArr = list.filter((r) => r.dps != null).map((r) => r.dps).sort((a, b) => a - b);
  const netArr = list.map((r) => r.netDamageTaken).sort((a, b) => a - b);
  const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
  const dHi = q(dpsArr, 0.75), dLo = q(dpsArr, 0.25), nHi = q(netArr, 0.75), nLo = q(netArr, 0.25);
  const okHi = q(list.map((r) => r.overkillRate).sort((a, b) => a - b), 0.80);
  const ohHi = q(list.filter((r) => r.healingDone > 0).map((r) => r.overHealingRate).sort((a, b) => a - b), 0.75);
  const base = { medianDps: q(dpsArr, 0.5), warriorNet: (list.find((r) => r.subject === "warrior") || {}).netDamageTaken || q(netArr, 0.5) };
  list.forEach((r) => {
    const t = tagRow(r, base);
    if (r.dps != null && r.dps >= dHi && dHi > 0) t.push("High DPS");
    if (r.dps != null && r.dps <= dLo) t.push("Low DPS");
    if (r.netDamageTaken <= nLo) t.push("Low Net Loss");
    if (r.netDamageTaken >= nHi && nHi > 0) t.push("High Net Loss");
    if (r.overkillRate >= okHi && okHi > 0.15) t.push("Overkill Waste");
    if (r.healingDone > 0 && r.overHealingRate >= ohHi && ohHi > 0.2) t.push("Overheal Waste");
    if (r.subjectType === "party") { if (r.result === "clear" && r.remainingHpPercent >= 0.85) t.push("Party Carry"); if (r.result !== "clear" || r.faintCount > 0) t.push("Party Liability"); }
    r.roleVerdict = r.subjectType === "job" ? roleVerdict(r, base) : "—";
    if (r.roleVerdict === "PASS") t.push("Role Pass");
    if (r.tier === "2차" && r.dps != null && r.dps >= dHi) t.push("Second Class Power");
    r.watchTags = [...new Set(t)];
  });
  return base;
}

/* ── 스타일 ──────────────────────────────────────────────────────── */
const STYLE = `
#balancelab-overlay{position:fixed;inset:0;z-index:300;display:flex;align-items:flex-start;justify-content:center;background:rgba(6,10,14,0.82);overflow:auto;padding:16px 8px;}
#balancelab-overlay[hidden]{display:none;}
#balancelab-card{width:min(1080px,100%);background:#11161d;border:1px solid #2c3a46;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,0.55);color:#dfe9f2;font-size:13px;line-height:1.45;}
#balancelab-card .bl-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #243039;}
#balancelab-card .bl-title{font-weight:800;font-size:14px;}
#balancelab-card .bl-tag{font-size:10px;font-weight:800;color:#7fd1a8;border:1px solid #2f5e47;background:rgba(60,180,120,.1);border-radius:999px;padding:2px 8px;}
#balancelab-card .bl-x{margin-left:auto;background:none;border:none;color:#9fb3c4;font-size:18px;cursor:pointer;}
#balancelab-card .bl-body{padding:12px 14px;}
#balancelab-card .bl-note{font-size:11px;color:#9fb3c4;margin:0 0 10px;}
#balancelab-card .bl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;}
#balancelab-card .bl-row .bl-lab{font-size:11px;color:#8aa0b2;min-width:40px;}
#balancelab-card select{background:#1b232c;color:#e7f0f7;border:1px solid #34434f;border-radius:8px;padding:6px 8px;font-size:13px;min-width:120px;max-width:100%;}
#balancelab-card .bl-seg{display:inline-flex;border:1px solid #34434f;border-radius:8px;overflow:hidden;flex-wrap:wrap;}
#balancelab-card .bl-seg button{background:#1b232c;color:#cfe0ee;border:none;padding:6px 11px;font-size:13px;cursor:pointer;}
#balancelab-card .bl-seg button.on{background:#2f6fb0;color:#fff;font-weight:800;}
#balancelab-card .bl-btn{border:1px solid #3a5a76;border-radius:8px;background:#23415b;color:#eaf3fb;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;}
#balancelab-card .bl-btn:active{transform:translateY(1px);}
#balancelab-card .bl-btn:disabled{opacity:.5;cursor:default;}
#balancelab-card .bl-btn.run{background:#2f7d50;border-color:#3c8f60;}
#balancelab-card .bl-btn.ghost{background:#1b232c;color:#cfe0ee;}
#balancelab-card .bl-presets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
#balancelab-card .bl-presets button{font-size:11px;padding:6px 9px;border:1px dashed #3a5a76;border-radius:8px;background:rgba(60,120,180,.08);color:#bcd6ec;cursor:pointer;}
#balancelab-card .bl-result{border:1px solid #28333d;border-radius:10px;padding:10px;margin:6px 0 12px;background:#0d1217;}
#balancelab-card .bl-result h4{margin:0 0 8px;font-size:12px;color:#bcd6ec;}
#balancelab-card .bl-result h5{margin:10px 0 6px;font-size:11px;color:#9fb8cc;}
#balancelab-card .bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:6px;}
#balancelab-card .bl-metric{background:#151c24;border:1px solid #232e38;border-radius:8px;padding:7px 9px;}
#balancelab-card .bl-metric.req{border-color:#39597a;}
#balancelab-card .bl-metric .k{font-size:10px;color:#8aa0b2;}
#balancelab-card .bl-metric .v{font-size:15px;font-weight:800;color:#eef6ff;}
#balancelab-card .bl-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
#balancelab-card .bl-tablewrap{overflow-x:auto;border:1px solid #28333d;border-radius:10px;margin-bottom:6px;}
#balancelab-card table{border-collapse:collapse;width:100%;font-size:11.5px;white-space:nowrap;}
#balancelab-card th,#balancelab-card td{padding:5px 7px;border-bottom:1px solid #222c35;text-align:right;}
#balancelab-card th.txt,#balancelab-card td.txt{text-align:left;}
#balancelab-card thead th{position:sticky;top:0;background:#1a232c;color:#9fb8cc;font-weight:700;}
#balancelab-card tbody tr:nth-child(odd){background:rgba(255,255,255,.015);}
#balancelab-card .bl-empty{color:#7990a2;font-size:12px;padding:10px;text-align:center;}
#balancelab-card .bl-foot{font-size:10px;color:#6f8497;margin-top:8px;}
#balancelab-card .res-clear{color:#7fd1a8;font-weight:800;}#balancelab-card .res-wipe{color:#f0a0a0;font-weight:800;}#balancelab-card .res-timeout{color:#e6c578;font-weight:800;}
#balancelab-card .bl-v{display:inline-block;font-size:9px;font-weight:800;border-radius:4px;padding:0 5px;}
#balancelab-card .bl-v.pass{color:#0c1a12;background:#6fd19a;}#balancelab-card .bl-v.watch{color:#1c1606;background:#e6c578;}
#balancelab-card .tag{display:inline-block;font-size:9px;border-radius:4px;padding:0 5px;margin:1px 2px 0 0;background:#21303d;color:#9fc4dd;border:1px solid #2c4150;white-space:nowrap;}
#balancelab-card .tag.warn{background:#3a2a1a;color:#e6c578;border-color:#5a4326;}
#balancelab-card .tag.gap{background:#3a1f24;color:#f0a0a0;border-color:#5a3036;}
#balancelab-card .tag.good{background:#1b3326;color:#7fd1a8;border-color:#2f5e47;}
#balancelab-card .bl-prog{font-size:11px;color:#9fb3c4;}
#balancelab-card .bl-rolehdr{font-size:12px;color:#bcd6ec;font-weight:700;margin:12px 0 4px;}
`;
function injectStyle() { if (document.getElementById("balancelab-style")) return; const s = document.createElement("style"); s.id = "balancelab-style"; s.textContent = STYLE; document.head.appendChild(s); }

/* ── 컨트롤 HTML ─────────────────────────────────────────────────── */
function heroSelectHTML(id, value) {
  const groups = HERO_GROUPS.map((g) => `<optgroup label="${g.label}">${g.jobs.filter((j) => UNIT_TEMPLATES.party[j]).map((j) => { const role = combatRoleLabelOf(j); return `<option value="${j}"${j === value ? " selected" : ""}>${role ? `${jobName(j)} · ${role}` : jobName(j)}</option>`; }).join("")}</optgroup>`).join("");
  return `<select id="${id}">${groups}</select>`;
}
function enemySelectHTML(id, value, withAll) {
  const all = withAll ? `<option value="__all"${value === "__all" ? " selected" : ""}>전체 적</option>` : "";
  return `<select id="${id}">${all}${ENEMY_KEYS.map((k) => { const t = enemyTemplateOf(k); const note = k === "dummy" ? "무저항" : `HP${t.maxHp}`; return `<option value="${k}"${k === value ? " selected" : ""}>${enemyName(k)} (${note})</option>`; }).join("")}</select>`;
}
function groupSelectHTML(id, value, withAll) {
  const gs = groupsForTheme(sel.theme);
  const all = withAll ? `<option value="__all"${value === "__all" ? " selected" : ""}>전체 그룹</option>` : "";
  return `<select id="${id}">${all}${gs.map((g) => `<option value="${g.id}"${g.id === value ? " selected" : ""}>${g.label}</option>`).join("")}</select>`;
}
function partySelectHTML() { return `<select id="bl-party">${PARTY_PRESETS.map((p) => `<option value="${p.id}"${p.id === sel.partyId ? " selected" : ""}>${p.label}</option>`).join("")}</select>`; }
function segHTML(id, items, cur) { return `<span class="bl-seg" id="${id}">${items.map((it) => `<button type="button" data-${id}="${it.id}" class="${it.id === cur ? "on" : ""}">${it.label}</button>`).join("")}</span>`; }
function presetsHTML() { return PRESETS.map((p, i) => `<button type="button" data-preset="${i}">${p.label}</button>`).join(""); }

function selectionRowHTML() {
  if (sel.mode === "party") return `<span class="bl-lab">파티</span>${partySelectHTML()}<span class="bl-lab">적군</span>${groupSelectHTML("bl-group", sel.groupId)}`;
  if (sel.mode === "multi") return `<span class="bl-lab">아군</span>${heroSelectHTML("bl-hero", sel.heroJob)}<span class="bl-lab">적군</span>${groupSelectHTML("bl-group", sel.groupId)}`;
  if (sel.mode === "role") return `<span class="bl-lab">대상</span>${segHTML("bl-roletype", [{ id: "enemy", label: "적1" }, { id: "group", label: "적그룹" }], sel.roleEnemyType)}` + (sel.roleEnemyType === "enemy" ? `${enemySelectHTML("bl-enemy", sel.enemyKey)}` : `${groupSelectHTML("bl-group", sel.groupId)}`);
  if (sel.mode === "matrix") {
    const scope = segHTML("bl-mscope", [{ id: "jobsVsEnemy", label: "직업×적" }, { id: "jobsVsGroup", label: "직업×그룹" }, { id: "partiesVsGroup", label: "파티×그룹" }], sel.mScope);
    if (sel.mScope === "partiesVsGroup") return `${scope}<span class="bl-lab">적군</span>${groupSelectHTML("bl-group", sel.groupId, true)}`;
    const jobset = segHTML("bl-mjobset", [{ id: "all", label: "전체" }, { id: "기본", label: "기본" }, { id: "1차", label: "1차" }, { id: "2차", label: "2차" }], sel.mJobSet);
    const target = sel.mScope === "jobsVsEnemy" ? `<span class="bl-lab">적</span>${enemySelectHTML("bl-enemy", sel.enemyKey, true)}` : `<span class="bl-lab">그룹</span>${groupSelectHTML("bl-group", sel.groupId, true)}`;
    return `${scope}<span class="bl-lab">직업</span>${jobset}${target}`;
  }
  return `<span class="bl-lab">아군</span>${heroSelectHTML("bl-hero", sel.heroJob)}<span class="bl-lab">적</span>${enemySelectHTML("bl-enemy", sel.enemyKey)}`;
}

function build() {
  injectStyle();
  const overlay = document.createElement("div");
  overlay.id = "balancelab-overlay"; overlay.hidden = true;
  overlay.innerHTML = `
    <div id="balancelab-card">
      <div class="bl-head"><span class="bl-title">🧪 Balance Lab — Matchup Matrix & Role Diagnostics</span>
        <span class="bl-tag">계측 전용 · 밸런스 조정 아님</span>
        <button type="button" class="bl-x" data-bl-close aria-label="닫기">✕</button></div>
      <div class="bl-body">
        <p class="bl-note">실제 전투 엔진을 헤드리스로 돌려 직업/파티/테마 적합성을 계측합니다(본게임 무영향). 매트릭스=여러 직업/파티 한 번에, 역할진단=역할군별 PASS/WATCH.
          지표 미포착(예: 덫꾼 제어 가치)은 Visibility Gap으로 표시합니다.</p>
        <div class="bl-presets" data-bl-presets>${presetsHTML()}</div>
        <div class="bl-row"><span class="bl-lab">테마</span><select id="bl-theme"></select><span class="bl-lab">모드</span>${segHTML("bl-mode", MODES, sel.mode)}<span class="bl-lab">시간</span>${segHTML("bl-dur", DURATIONS.map((d) => ({ id: String(d), label: d + "초" })), String(sel.seconds))}</div>
        <div class="bl-row" data-bl-selrow>${selectionRowHTML()}</div>
        <div class="bl-row"><button type="button" class="bl-btn run" data-bl-run>실험 실행 ▶</button><span class="bl-prog" data-bl-prog></span></div>
        <div class="bl-result" data-bl-result></div>
        <div class="bl-actions">
          <button type="button" class="bl-btn" data-bl-add>＋ 비교표에 추가</button>
          <button type="button" class="bl-btn ghost" data-bl-copy>TSV 복사</button>
          <button type="button" class="bl-btn ghost" data-bl-json>JSON 복사</button>
          <button type="button" class="bl-btn ghost" data-bl-clear>비교표 초기화</button>
        </div>
        <div class="bl-tablewrap" data-bl-table></div>
        <p class="bl-foot">결과는 새로고침 전까지만 유지(저장 안 함). 매트릭스/역할진단은 실행 시 전체 행이 비교표에 자동 누적됩니다. 치명/랜덤으로 실행마다 약간 변동.</p>
      </div>
    </div>`;
  (document.getElementById("game-frame") || document.body).appendChild(overlay);
  els = { overlay, selrow: overlay.querySelector("[data-bl-selrow]"), result: overlay.querySelector("[data-bl-result]"), table: overlay.querySelector("[data-bl-table]"), prog: overlay.querySelector("[data-bl-prog]"), theme: overlay.querySelector("#bl-theme") };
  THEMES.forEach((t) => { const o = new Option(t.label, t.id); o.disabled = !t.enabled; els.theme.add(o); });
  els.theme.value = sel.theme;
  wire(overlay); renderResult(); renderTable();
}

/* ── 배선 ────────────────────────────────────────────────────────── */
function bindSelects() {
  const q = (id) => els.overlay.querySelector(id);
  const bind = (id, key) => { const e = q(id); if (e) e.onchange = (ev) => { sel[key] = ev.target.value; }; };
  bind("#bl-hero", "heroJob"); bind("#bl-enemy", "enemyKey"); bind("#bl-group", "groupId"); bind("#bl-party", "partyId");
}
function refreshSelectionRow() { els.selrow.innerHTML = selectionRowHTML(); bindSelects(); }
function wire(overlay) {
  bindSelects();
  els.theme.addEventListener("change", (e) => { sel.theme = e.target.value; refreshSelectionRow(); });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-bl-close]")) { close(); return; }
    const seg = (name, key, after) => {
      const b = e.target.closest(`[data-${name}]`); if (!b) return false;
      const val = b.getAttribute("data-" + name);
      sel[key] = name === "bl-dur" ? Number(val) : val;
      overlay.querySelectorAll(`#${name} button`).forEach((x) => x.classList.toggle("on", x === b));
      if (after) after(); return true;
    };
    if (seg("bl-mode", "mode", refreshSelectionRow)) return;
    if (seg("bl-dur", "seconds")) return;
    if (seg("bl-mscope", "mScope", refreshSelectionRow)) return;
    if (seg("bl-mjobset", "mJobSet")) return;
    if (seg("bl-roletype", "roleEnemyType", refreshSelectionRow)) return;
    const preset = e.target.closest("[data-preset]"); if (preset) { applyPreset(Number(preset.dataset.preset)); return; }
    const sortTh = e.target.closest("[data-sort]"); if (sortTh) { setSort(sortTh.getAttribute("data-sort")); return; }
    if (e.target.closest("[data-bl-run]")) { runExperiment(); return; }
    if (e.target.closest("[data-bl-add]")) { addCurrent(); return; }
    if (e.target.closest("[data-bl-clear]")) { rows.length = 0; renderTable(); return; }
    if (e.target.closest("[data-bl-copy]")) { copyOut(tsvText(), e.target.closest("[data-bl-copy]"), "TSV 복사"); return; }
    if (e.target.closest("[data-bl-json]")) { copyOut(jsonText(), e.target.closest("[data-bl-json]"), "JSON 복사"); return; }
  });
  els.overlay.addEventListener("change", (e) => {
    if (e.target.id === "bl-ftier") { sel.filterTier = e.target.value; renderMatrixTable(); }
    if (e.target.id === "bl-frole") { sel.filterRole = e.target.value; renderMatrixTable(); }
    if (e.target.id === "bl-sort") { sel.sortKey = e.target.value; renderMatrixTable(); }
  });
}
function applyPreset(i) {
  const p = PRESETS[i]; if (!p) return;
  sel = { ...sel, ...p };
  els.overlay.querySelectorAll("#bl-mode button").forEach((x) => x.classList.toggle("on", x.getAttribute("data-bl-mode") === sel.mode));
  els.overlay.querySelectorAll("#bl-dur button").forEach((x) => x.classList.toggle("on", Number(x.getAttribute("data-bl-dur")) === sel.seconds));
  refreshSelectionRow(); runExperiment();
}

/* ── 실행 ────────────────────────────────────────────────────────── */
const nextTick = () => new Promise((r) => setTimeout(r, 0));
function setProg(t) { if (els) els.prog.textContent = t; }
async function runExperiment() {
  if (running) return; running = true;
  els.overlay.querySelector("[data-bl-run]").disabled = true;
  try {
    if (sel.mode === "matrix" || sel.mode === "role") await runMatrix();
    else runSingle();
  } finally { running = false; els.overlay.querySelector("[data-bl-run]").disabled = false; setProg(""); }
}
function runSingle() {
  lastMatrix = null;
  if (sel.mode === "party") { lastResult = partyOf(sel.partyId) && rawParty(); }
  else if (sel.mode === "multi") { lastResult = rawMulti(); }
  else { lastResult = rawDuel(); }
  renderResult();
}
function rawDuel() { const r = runLabScenario({ allyJobs: [sel.heroJob], enemyTemplates: [enemyTemplateOf(sel.enemyKey)], seconds: sel.seconds, sustained: true }); lastMeta = r ? { mode: "duel", allyLabel: jobName(sel.heroJob), enemyLabel: enemyName(sel.enemyKey), seconds: sel.seconds } : null; return r; }
function rawMulti() { const r = runLabScenario({ allyJobs: [sel.heroJob], enemyTemplates: groupTemplates(sel.groupId), seconds: sel.seconds, sustained: true }); if (r) { const d = dummyDps(sel.heroJob, sel.seconds); r.multiEff = { singleDps: d, ratio: d > 0 ? r.dps / d : 0 }; } lastMeta = r ? { mode: "multi", allyLabel: jobName(sel.heroJob), enemyLabel: groupOf(sel.groupId).label.split(" (")[0], seconds: sel.seconds } : null; return r; }
function rawParty() { const p = partyOf(sel.partyId); const r = runLabScenario({ allyJobs: p.jobs, enemyTemplates: groupTemplates(sel.groupId), seconds: sel.seconds, sustained: false }); lastMeta = r ? { mode: "party", allyLabel: p.label.split(" (")[0], enemyLabel: groupOf(sel.groupId).label.split(" (")[0], seconds: sel.seconds } : null; return r; }

// 매트릭스/역할진단: 대상(직업들/파티들) × 적(들) 데카르트곱 실행(청크 양보).
function buildJobList() {
  if (sel.mScope === "partiesVsGroup") return null;
  if (sel.mJobSet === "all") return ALL_JOBS;
  return ALL_JOBS.filter((j) => tierOf(j) === sel.mJobSet);
}
async function runMatrix() {
  const isRole = sel.mode === "role";
  const subjects = []; // {type, id, enemyTemplates, enemyLabel, sustained}
  const seconds = sel.seconds;
  if (sel.mode === "matrix" && sel.mScope === "partiesVsGroup") {
    const groups = sel.groupId === "__all" ? groupsForTheme(sel.theme) : [groupOf(sel.groupId)];
    groups.forEach((g) => PARTY_PRESETS.forEach((p) => subjects.push({ type: "party", id: p.id, tmpls: g.keys.map(enemyTemplateOf), label: g.label.split(" (")[0] })));
  } else {
    const jobs = isRole ? ALL_JOBS : buildJobList();
    let enemies; // [{tmpls,label,sustained}]
    if (isRole) {
      enemies = sel.roleEnemyType === "enemy" ? [{ tmpls: [enemyTemplateOf(sel.enemyKey)], label: enemyName(sel.enemyKey), me: true }] : [{ tmpls: groupTemplates(sel.groupId), label: groupOf(sel.groupId).label.split(" (")[0], me: groupTemplates(sel.groupId).length > 1 }];
    } else if (sel.mScope === "jobsVsEnemy") {
      const keys = sel.enemyKey === "__all" ? ENEMY_KEYS : [sel.enemyKey];
      enemies = keys.map((k) => ({ tmpls: [enemyTemplateOf(k)], label: enemyName(k), me: false }));
    } else {
      const gs = sel.groupId === "__all" ? groupsForTheme(sel.theme) : [groupOf(sel.groupId)];
      enemies = gs.map((g) => ({ tmpls: g.keys.map(enemyTemplateOf), label: g.label.split(" (")[0], me: g.keys.length > 1 }));
    }
    enemies.forEach((en) => jobs.forEach((j) => subjects.push({ type: "job", id: j, tmpls: en.tmpls, label: en.label, me: en.me })));
  }
  const out = []; const total = subjects.length;
  for (let i = 0; i < total; i++) {
    const s = subjects[i];
    const row = s.type === "party" ? partyRow(s.id, s.tmpls, s.label, seconds) : jobRow(s.id, s.tmpls, s.label, seconds, true, { multiEff: !!s.me });
    if (row) out.push(row);
    if ((i + 1) % 6 === 0 || i + 1 === total) { setProg(`실행 ${i + 1}/${total} …`); await nextTick(); }
  }
  tagCohort(out);
  lastMatrix = { mode: sel.mode, scope: sel.mScope, rows: out, seconds, theme: sel.theme };
  lastResult = null;
  out.forEach((r) => rows.push(r)); // 비교표 자동 누적
  renderResult(); renderTable();
}

/* ── 결과 렌더(단일 모드) ───────────────────────────────────────────── */
const mc = (k, v, req) => `<div class="bl-metric${req ? " req" : ""}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
function renderResult() {
  if (!els) return;
  if (lastMatrix) return renderMatrixResult();
  if (!lastResult) { els.result.innerHTML = `<div class="bl-empty">실험을 실행하면 결과가 여기에 표시됩니다.</div>`; return; }
  const m = lastMeta;
  if (m.mode === "party") return renderPartyResult(lastResult, m);
  if (m.mode === "multi") return renderMultiResult(lastResult, m);
  return renderDuelResult(lastResult, m);
}
function renderDuelResult(r, m) {
  const a = r.allies[0] || {}; const net = (a.dmgTaken || 0) - (a.shieldBlocked || 0) - (a.healDone || 0);
  els.result.innerHTML = `<h4>${m.allyLabel} vs ${m.enemyLabel} · ${r.seconds}초 (틱 ${r.ticks})</h4>
    <h5>공세</h5><div class="bl-grid">${[mc("총 피해량", fmtInt(r.totalDamage), 1), mc("DPS", fmtF1(r.dps), 1), mc("공격 횟수", fmtInt(a.hits), 1), mc("평균 피해", fmtF1(a.hits ? a.dmgDone / a.hits : 0)), mc("최대 피해", fmtInt(a.maxHit)), mc("치명", fmtInt(a.crits), 1), mc("스킬 발동", fmtInt(a.skillCasts), 1), mc("스킬 피해", fmtInt(a.skillDamage)), mc("반격", fmtInt(a.counters)), mc("표식", fmtInt(a.marks))].join("")}</div>
    <h5>생존 / 회복 / 보호막</h5><div class="bl-grid">${[mc("받은 피해", fmtInt(a.dmgTaken), 1), mc("받은 DPS", fmtF1((a.dmgTaken || 0) / r.seconds), 1), mc("순손실", fmtInt(net)), mc("보호막 막음", fmtInt(a.shieldBlocked)), mc("생존 시간", `${fmtF1(a.survivalTime)}s`), mc("기절", a.fainted ? "예" : "아니오"), mc("회복량", fmtInt(a.healDone)), mc("초과 회복", fmtInt(a.overHeal)), mc("보호막 부여", fmtInt(a.shieldApplied))].join("")}</div>`;
}
function renderMultiResult(r, m) {
  const a = r.allies[0] || {}; const eff = r.multiEff || { singleDps: 0, ratio: 0 };
  const cards = [mc("총 피해량", fmtInt(r.totalDamage), 1), mc("총 DPS", fmtF1(r.dps), 1), mc("피해 대상", `${r.targetsHit}/${r.enemies.length}`, 1), mc("총 킬", fmtInt(r.killCount), 1), mc("첫 킬", r.firstKillTime != null ? `${fmtF1(r.firstKillTime)}s` : "—"), mc("오버킬", fmtInt(r.overkillLoss)), mc("단일더미 DPS", fmtF1(eff.singleDps)), mc("다중효율", fmtPct(eff.ratio), 1), mc("스킬 발동", fmtInt(a.skillCasts)), mc("받은 피해", fmtInt(a.dmgTaken))].join("");
  const rows2 = r.enemies.map((e) => `<tr><td class="txt">${e.name}</td><td>${fmtInt(e.dmgTaken)}</td><td>${fmtInt(e.overkillTaken)}</td><td>${e.deaths}</td></tr>`).join("");
  els.result.innerHTML = `<h4>${m.allyLabel} vs ${m.enemyLabel} · ${r.seconds}초 (틱 ${r.ticks})</h4><div class="bl-grid">${cards}</div>
    <h5>대상별 피해</h5><div class="bl-tablewrap"><table><thead><tr><th class="txt">적</th><th>받은 피해</th><th>오버킬</th><th>처치</th></tr></thead><tbody>${rows2}</tbody></table></div>`;
}
function renderPartyResult(r, m) {
  const cls = r.result === "clear" ? "res-clear" : r.result === "wipe" ? "res-wipe" : "res-timeout";
  const lab = r.result === "clear" ? "클리어" : r.result === "wipe" ? "전멸" : "시간초과";
  const net = r.totalDamageTaken - r.totalHealing - r.totalShieldAbsorbed;
  const cards = [`<div class="bl-metric req"><div class="k">결과</div><div class="v ${cls}">${lab}</div></div>`, mc("클리어 시간", r.clearTime != null ? `${fmtF1(r.clearTime)}s` : "—", 1), mc("남은 HP", `${fmtInt(r.remainingHp)}/${fmtInt(r.maxHpTotal)}`, 1), mc("남은 비율", fmtPct(r.remainingHpRatio), 1), mc("기절자", `${r.faintCount}`, 1), mc("생존자", `${r.survivorCount}/${r.allies.length}`, 1), mc("파티 총 피해", fmtInt(r.totalDamage)), mc("파티 총 회복", fmtInt(r.totalHealing)), mc("보호막 흡수", fmtInt(r.totalShieldAbsorbed)), mc("순손실", fmtInt(net))].join("");
  const rows2 = r.allies.map((a) => `<tr><td class="txt">${a.name}</td><td>${fmtInt(a.dmgDone)}</td><td>${fmtInt(a.healDone)}</td><td>${fmtInt(a.shieldApplied)}</td><td>${fmtInt(a.shieldBlocked)}</td><td>${fmtInt(a.dmgTaken)}</td><td>${fmtInt(a.finalHp)}/${fmtInt(a.maxHp)}</td><td>${a.isDead ? "기절" : "생존"}</td></tr>`).join("");
  els.result.innerHTML = `<h4>${m.allyLabel} vs ${m.enemyLabel} · 최대 ${r.seconds}초 (틱 ${r.ticks})</h4><div class="bl-grid">${cards}</div>
    <h5>캐릭터별 기여</h5><div class="bl-tablewrap"><table><thead><tr><th class="txt">캐릭터</th><th>딜</th><th>회복</th><th>보호막부여</th><th>흡수</th><th>받은피해</th><th>HP</th><th>상태</th></tr></thead><tbody>${rows2}</tbody></table></div>`;
}

/* ── 매트릭스 / 역할진단 렌더 ──────────────────────────────────────── */
const tagHtml = (tags) => (tags || []).map((t) => `<span class="tag ${/Gap|Liability|Watch/.test(t) ? "gap" : /Value|Pass|Power|Carry|Specialist/.test(t) ? "good" : /Waste|Watch|Not Seen/.test(t) ? "warn" : ""}">${t}</span>`).join("");
const MATRIX_COLS = [
  { k: "name", label: "대상", txt: 1, get: (r) => r.name, sort: 0 },
  { k: "tier", label: "티어", txt: 1, get: (r) => r.tier, sort: 0 },
  { k: "roleGroup", label: "역할", txt: 1, get: (r) => r.roleLabel, sort: 0 },
  { k: "totalDamage", label: "총피해", get: (r) => dash(r.totalDamage, fmtInt) },
  { k: "dps", label: "DPS", get: (r) => dash(r.dps, fmtF1) },
  { k: "multiEfficiency", label: "다중효율", get: (r) => dash(r.multiEfficiency, fmtPct) },
  { k: "targetsHit", label: "대상수", get: (r) => dash(r.targetsHit, fmtInt) },
  { k: "kills", label: "킬", get: (r) => dash(r.kills, fmtInt) },
  { k: "overkillLoss", label: "오버킬", get: (r) => dash(r.overkillLoss, fmtInt) },
  { k: "damageTaken", label: "받은피해", get: (r) => dash(r.damageTaken, fmtInt) },
  { k: "netDamageTaken", label: "순손실", get: (r) => dash(r.netDamageTaken, fmtInt) },
  { k: "healingDone", label: "회복", get: (r) => dash(r.healingDone, fmtInt) },
  { k: "overHealing", label: "초과회복", get: (r) => dash(r.overHealing, fmtInt) },
  { k: "shieldAbsorbed", label: "보호막흡수", get: (r) => dash(r.shieldAbsorbed, fmtInt) },
  { k: "survivalTime", label: "생존", get: (r) => dash(r.survivalTime, (v) => fmtF1(v) + "s") },
  { k: "counters", label: "반격", get: (r) => dash(r.counters, fmtInt) },
  { k: "marks", label: "표식", get: (r) => dash(r.marks, fmtInt) },
  { k: "skillTriggers", label: "발동", get: (r) => dash(r.skillTriggers, fmtInt) },
  { k: "result", label: "결과/판정", txt: 1, get: (r) => r.subjectType === "party" ? (r.result === "clear" ? `<span class="res-clear">클리어 ${fmtF1(r.clearTime)}s ${fmtPct(r.remainingHpPercent)}</span>` : r.result === "wipe" ? `<span class="res-wipe">전멸</span>` : `<span class="res-timeout">시간초과</span>`) : `<span class="bl-v ${String(r.roleVerdict).toLowerCase()}">${r.roleVerdict}</span>` },
  { k: "watchTags", label: "Watch Tags", txt: 1, get: (r) => tagHtml(r.watchTags) },
];
const SORT_KEYS = ["dps", "totalDamage", "netDamageTaken", "survivalTime", "healingDone", "shieldAbsorbed", "multiEfficiency", "overkillLoss", "overHealing", "targetsHit", "remainingHpPercent", "clearTime"];
function setSort(k) { sel.sortKey = k; renderMatrixTable(); }
function sortedFilteredMatrix() {
  let list = lastMatrix.rows.slice();
  if (sel.filterTier !== "all") list = list.filter((r) => r.tier === sel.filterTier);
  if (sel.filterRole !== "all") list = list.filter((r) => r.roleGroup === sel.filterRole);
  const k = sel.sortKey;
  list.sort((a, b) => { const av = a[k] == null ? -Infinity : a[k]; const bv = b[k] == null ? -Infinity : b[k]; return (k === "netDamageTaken" || k === "overkillLoss" || k === "overHealing" || k === "clearTime") ? av - bv : bv - av; });
  return list;
}
function topCards(rows0) {
  const top = (key, label, fmt, lowBetter) => { const valid = rows0.filter((r) => r[key] != null); if (!valid.length) return ""; const best = valid.reduce((x, y) => (lowBetter ? (y[key] < x[key] ? y : x) : (y[key] > x[key] ? y : x))); return mc(label, `${best.name} · ${fmt(best[key])}`); };
  return [top("dps", "DPS TOP", fmtF1), top("netDamageTaken", "순손실 TOP(낮음)", fmtInt, true), top("survivalTime", "생존 TOP", (v) => fmtF1(v) + "s"), top("multiEfficiency", "다중효율 TOP", fmtPct), top("healingDone", "회복 TOP", fmtInt), top("shieldAbsorbed", "보호막흡수 TOP", fmtInt), top("overkillLoss", "오버킬손실 TOP", fmtInt), top("overHealing", "초과회복 TOP", fmtInt)].filter(Boolean).join("");
}
function renderMatrixResult() {
  if (!lastMatrix || !lastMatrix.rows.length) { els.result.innerHTML = `<div class="bl-empty">결과가 없습니다.</div>`; return; }
  const isRole = lastMatrix.mode === "role";
  const head = `<h4>${isRole ? "역할진단" : "매트릭스"} · ${lastMatrix.rows.length}행 · ${lastMatrix.seconds}초</h4>`;
  const watchTop = mc("WATCH 직업", String(lastMatrix.rows.filter((r) => r.subjectType === "job" && r.roleVerdict === "WATCH").length) + "종");
  const controls = `<div class="bl-row"><span class="bl-lab">정렬</span><select id="bl-sort">${SORT_KEYS.map((k) => `<option value="${k}"${k === sel.sortKey ? " selected" : ""}>${(MATRIX_COLS.find((c) => c.k === k) || { label: k }).label}</option>`).join("")}</select>
    <span class="bl-lab">티어</span><select id="bl-ftier"><option value="all">전체</option><option value="기본">기본</option><option value="1차">1차</option><option value="2차">2차</option></select>
    <span class="bl-lab">역할</span><select id="bl-frole"><option value="all">전체</option>${ROLE_ORDER.map((r) => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join("")}</select></div>`;
  els.result.innerHTML = head + `<div class="bl-grid">${topCards(lastMatrix.rows)}${watchTop}</div>` + controls + (isRole ? roleDiagBlocks() : "") + `<div data-bl-matrix></div>`;
  renderMatrixTable();
}
function renderMatrixTable() {
  const wrap = els.result.querySelector("[data-bl-matrix]"); if (!wrap || !lastMatrix) return;
  const list = sortedFilteredMatrix();
  const head = MATRIX_COLS.map((c) => `<th class="${c.txt ? "txt" : ""} ${c.sort === 0 ? "" : "sortable"}" ${c.sort === 0 ? "" : `data-sort="${c.k}"`}>${c.label}</th>`).join("");
  const body = list.map((r) => `<tr>${MATRIX_COLS.map((c) => `<td class="${c.txt ? "txt" : ""}">${c.get(r)}</td>`).join("")}</tr>`).join("");
  wrap.innerHTML = `<div class="bl-tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  const s = els.overlay.querySelector("#bl-sort"); if (s) s.value = sel.sortKey;
}
// 역할진단: 역할군별 요약 + 해석.
function roleDiagBlocks() {
  const byRole = {};
  lastMatrix.rows.forEach((r) => { (byRole[r.roleGroup] = byRole[r.roleGroup] || []).push(r); });
  return ROLE_ORDER.filter((rg) => byRole[rg]).map((rg) => {
    const list = byRole[rg].slice().sort((a, b) => (b.dps || 0) - (a.dps || 0));
    const pass = list.filter((r) => r.roleVerdict === "PASS").length;
    const watch = list.filter((r) => r.roleVerdict === "WATCH");
    const watchNames = watch.map((r) => r.name).join(", ") || "없음";
    return `<div class="bl-rolehdr">${ROLE_LABEL[rg]} (${list.length}종 · PASS ${pass} / WATCH ${watch.length})</div>
      <div class="bl-foot" style="margin:0 0 4px">WATCH: ${watchNames}${rg === "debuff" || rg === "control" ? " — 제어/디버프 가치 일부 미포착(Visibility Gap 가능)" : ""}</div>`;
  }).join("");
}

/* ── 비교표(통합 fullRow) / TSV / JSON ─────────────────────────────── */
function addCurrent() {
  if (lastMatrix) return; // 매트릭스는 실행 시 자동 누적
  if (!lastResult || !lastMeta) return;
  let row;
  if (lastMeta.mode === "party") row = partyRowFromResult();
  else row = jobRowFromResult();
  if (row) { tagCohort([row]); rows.push(row); renderTable(); }
}
function jobRowFromResult() { const r = lastResult, a = r.allies[0] || {}; const net = (a.dmgTaken || 0) - (a.shieldBlocked || 0) - (a.healDone || 0); return { subjectType: "job", subject: sel.heroJob, name: jobName(sel.heroJob), tier: tierOf(sel.heroJob), roleGroup: roleGroupOf(sel.heroJob), roleLabel: roleLabelOf(sel.heroJob), scenarioType: lastMeta.mode, enemyLabel: lastMeta.enemyLabel, seconds: r.seconds, totalDamage: r.totalDamage, dps: r.dps, attacks: a.hits, crits: a.crits, skillTriggers: a.skillCasts, skillDamage: a.skillDamage, counters: a.counters, marks: a.marks, damageTaken: a.dmgTaken, netDamageTaken: net, healingDone: a.healDone, overHealing: a.overHeal, shieldApplied: a.shieldApplied, shieldAbsorbed: a.shieldBlocked, kills: r.killCount, targetsHit: r.targetsHit, firstKillTime: r.firstKillTime, overkillLoss: r.overkillLoss, multiEfficiency: r.multiEff ? r.multiEff.ratio : null, survivalTime: a.survivalTime, fainted: a.fainted, result: null, ...derived({ totalDamage: r.totalDamage, overkillLoss: r.overkillLoss, healingDone: a.healDone, overHealing: a.overHeal, shieldApplied: a.shieldApplied, shieldAbsorbed: a.shieldBlocked, targetsHit: r.targetsHit, skillTriggers: a.skillCasts, skillDamage: a.skillDamage }) }; }
function partyRowFromResult() { const r = lastResult; const net = r.totalDamageTaken - r.totalHealing - r.totalShieldAbsorbed; return { subjectType: "party", subject: sel.partyId, name: lastMeta.allyLabel, tier: "—", roleGroup: "party", roleLabel: "파티", scenarioType: "party", enemyLabel: lastMeta.enemyLabel, seconds: r.seconds, totalDamage: r.totalDamage, dps: null, damageTaken: r.totalDamageTaken, netDamageTaken: net, healingDone: r.totalHealing, overHealing: r.allies.reduce((s, m) => s + (m.overHeal || 0), 0), shieldApplied: r.allies.reduce((s, m) => s + (m.shieldApplied || 0), 0), shieldAbsorbed: r.totalShieldAbsorbed, kills: r.killCount, targetsHit: r.targetsHit, overkillLoss: r.overkillLoss, result: r.result, clearTime: r.clearTime, remainingHpPercent: r.remainingHpRatio, faintCount: r.faintCount, survivorCount: r.survivorCount, fainted: r.faintCount > 0, ...derived({ totalDamage: r.totalDamage, overkillLoss: r.overkillLoss, healingDone: r.totalHealing, overHealing: 0, shieldApplied: 0, shieldAbsorbed: r.totalShieldAbsorbed, targetsHit: r.targetsHit, skillTriggers: 0, skillDamage: 0 }) }; }

const TSV_COLS = ["mode", "scenarioType", "theme", "subjectType", "subject", "name", "tier", "roleGroup", "enemy", "duration", "totalDamage", "dps", "damageTaken", "netDamageTaken", "healingDone", "overHealing", "shieldApplied", "shieldAbsorbed", "kills", "targetsHit", "multiEfficiency", "overkillLoss", "overkillRate", "overHealingRate", "shieldWasted", "valuePerTrigger", "survivalTime", "fainted", "counters", "marks", "skillTriggers", "result", "clearTime", "remainingHpPercent", "roleVerdict", "watchTags"];
const num = (v) => (v == null ? "" : Math.round(v));
const f1 = (v) => (v == null ? "" : Math.round(v * 10) / 10);
const pct = (v) => (v == null ? "" : Math.round(v * 1000) / 10);
function rowMode(r) { return r.subjectType === "party" ? "party" : (r.multiEfficiency != null && r.targetsHit > 1 ? "multi" : (r.enemyCount > 1 ? "multi" : "duel")); }
function rowTsvVals(r) {
  return [rowMode(r), r.scenarioType, sel.theme, r.subjectType, r.subject, r.name, r.tier, r.roleGroup, r.enemyLabel, r.seconds, num(r.totalDamage), f1(r.dps), num(r.damageTaken), num(r.netDamageTaken), num(r.healingDone), num(r.overHealing), num(r.shieldApplied), num(r.shieldAbsorbed), num(r.kills), num(r.targetsHit), pct(r.multiEfficiency), num(r.overkillLoss), pct(r.overkillRate), pct(r.overHealingRate), num(r.shieldWasted), f1(r.valuePerTrigger), f1(r.survivalTime), r.fainted ? 1 : 0, num(r.counters), num(r.marks), num(r.skillTriggers), r.result || "", f1(r.clearTime), pct(r.remainingHpPercent), r.roleVerdict || "", (r.watchTags || []).join("|")];
}
function tsvText() { return [TSV_COLS.join("\t"), ...rows.map((r) => rowTsvVals(r).join("\t"))].join("\n"); }
function jsonText() {
  return JSON.stringify({
    metadata: { tool: "balance-lab-03", theme: sel.theme, generatedAt: new Date().toISOString(), version: "03", durationDefault: DURATION_DEFAULT },
    rows: rows.map((r) => ({ ...r, perTarget: undefined, members: r.members || undefined })),
  }, null, 0);
}
function renderTable() {
  if (!els) return;
  if (!rows.length) { els.table.innerHTML = `<div class="bl-empty">비교표가 비어 있습니다. 단일 실험은 “비교표에 추가”, 매트릭스/역할진단은 실행 시 자동 누적됩니다.</div>`; return; }
  const cols = [{ k: "scenarioType", label: "시나리오", g: (r) => r.scenarioType }, { k: "name", label: "대상", g: (r) => r.name }, { k: "tier", label: "티어", g: (r) => r.tier }, { k: "roleLabel", label: "역할", g: (r) => r.roleLabel || "—" }, { k: "enemyLabel", label: "적/그룹", g: (r) => r.enemyLabel }, { k: "dps", label: "DPS", g: (r) => dash(r.dps, fmtF1), n: 1 }, { k: "totalDamage", label: "총피해", g: (r) => dash(r.totalDamage, fmtInt), n: 1 }, { k: "netDamageTaken", label: "순손실", g: (r) => dash(r.netDamageTaken, fmtInt), n: 1 }, { k: "healingDone", label: "회복", g: (r) => dash(r.healingDone, fmtInt), n: 1 }, { k: "shieldAbsorbed", label: "보호막흡수", g: (r) => dash(r.shieldAbsorbed, fmtInt), n: 1 }, { k: "multiEfficiency", label: "다중효율", g: (r) => dash(r.multiEfficiency, fmtPct), n: 1 }, { k: "survivalTime", label: "생존", g: (r) => dash(r.survivalTime, (v) => fmtF1(v) + "s"), n: 1 }, { k: "result", label: "결과/판정", g: (r) => r.subjectType === "party" ? (r.result || "—") : (r.roleVerdict || "—") }, { k: "tags", label: "Watch", g: (r) => tagHtml(r.watchTags) }];
  const head = cols.map((c) => `<th class="${c.n ? "" : "txt"}">${c.label}</th>`).join("");
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.n ? "" : "txt"}">${c.g(r)}</td>`).join("")}</tr>`).join("");
  els.table.innerHTML = `<div class="bl-foot" style="margin:0 0 4px">비교표 ${rows.length}행 (TSV/JSON에 전체 컬럼 포함)</div><div class="bl-tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function copyOut(text, btn, label) {
  const done = (ok) => { if (btn) { btn.textContent = ok ? "복사됨!" : "복사 실패"; setTimeout(() => { btn.textContent = label; }, 1200); } };
  try { await navigator.clipboard.writeText(text); done(true); }
  catch (e) { try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(true); } catch (e2) { done(false); } }
}

/* ── 공개 API ───────────────────────────────────────────────────── */
export function openBalanceLab() { if (!els) build(); els.overlay.hidden = false; }
function close() { if (els) els.overlay.hidden = true; }
