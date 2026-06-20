// =====================================================================
// Auto Run Report 01 — Blind Spot Explorer / 100+ Run Stats Dashboard
//
//   목적: 나라가 인간의 시간으로 직접 검증할 수 없는 영역(안 해본 조합, 100회+ 반복,
//         평균 클리어율, 자주 죽는 구간, 이상하게 강한 루트)을 자동 주회로 대신 탐색하고
//         사람이 판단 가능한 대시보드로 보여주는 Dev 전용 "통계 관측소".
//   분리: 본게임 전투 엔진/런 흐름(battle.js)을 헤드리스로 그대로 구동한다 — 정책이 UI 대신
//         flow 함수(applyReward/chooseRoute/applyFusion/confirmRecruit…)를 호출할 뿐, 전투 공식·
//         런 규칙·보상/합체/스테이지 데이터는 일절 바꾸지 않는다(계측 전용).
//   오염: 발자취/localStorage 미기록(battle.js headless 가드), 본게임 state는 스냅샷→복구.
//         이 페이지는 index.html(본게임)과 분리된 별도 엔트리(dev/auto-run-report.html)다.
// =====================================================================
import { gameState, SLOT_ORDER } from "../core/state.js";
import {
  setHeadlessRun, runHeadlessBattle,
  startRun, applyReward, applyFusion, skipFusion, continueAfterFusion,
  previewRecruit, confirmRecruit, confirmArrange, chooseRoute, continueFromRest,
  partyJobIds,
} from "../core/battle.js";
import {
  BASE_JOBS, SECOND_CLASS_JOBS, ACTIVE_FUSION_RECIPES, availableFusions, slotPreference,
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

/* ── 시작 편성(2인, 본게임과 동일) ───────────────────────────────── */
function makeFormation(jobs) {
  const f = { f0: null, f1: null, b0: null, b1: null };
  jobs.forEach((j) => { const slot = slotPreference(j).find((k) => !f[k]); if (slot) f[slot] = j; });
  return f;
}
function randomStartFormation() { return makeFormation(shuffle(BASE_JOBS).slice(0, 2)); }
const BASE_RECIPES = ACTIVE_FUSION_RECIPES.filter((r) => r.materials.every((m) => BASE_JOBS.includes(m)));

/* ── 자동 플레이 정책 ────────────────────────────────────────────── */
//   각 정책은 UI 결정점을 대신 고른다(전투/런 규칙은 본게임 함수가 처리).
const POLICIES = {
  // 1) 랜덤 탐험가 — 상상 못 한 조합/루트 탐색. 거의 균등 랜덤.
  random: {
    id: "random", label: "랜덤 탐험가",
    desc: "선택지를 거의 균등 랜덤으로 — 안 해본 조합/루트를 넓게 탐색한다.",
    startFormation: randomStartFormation,
    pickReward: (offer) => pick(offer),
    decideFusion: (options) => (rand() < 0.5 ? pick(options).result : null), // 낮은 확률 합체
    pickRecruit: (offer) => pick(offer),                                     // 후보는 본래 미보유 직업
    pickRoute: (choices) => pick(choices),
  },
  // 2) 합체 우선가 — 현재 합체 구조/2차 직업 가치 확인. 합체 가능하면 합체(2차 우선).
  fusion: {
    id: "fusion", label: "합체 우선가",
    desc: "합체 가능하면 합체(2차 결과 우선), 영입은 합체 재료에 유리하게, 열쇠 모이면 보스 도전.",
    startFormation: () => makeFormation([...(pick(BASE_RECIPES) || { materials: ["warrior", "archer"] }).materials]),
    pickReward: (offer) => pick(offer),
    decideFusion: (options) => {
      const second = options.filter((o) => isSecond(o.result));
      return (second.length ? pick(second) : pick(options)).result; // 항상 합체, 2차 우선
    },
    pickRecruit: (offer) => {
      const owned = partyJobIds();
      const useful = offer.filter((j) =>
        ACTIVE_FUSION_RECIPES.some((r) => r.materials.includes(j) && r.materials.some((m) => owned.includes(m))));
      return pick(useful.length ? useful : offer);
    },
    pickRoute: (choices) => {
      if (choices.includes("boss")) return "boss";              // 문이 열리면(열쇠 2) 도전
      const order = ["danger", "elite", "normal", "rest"];      // 깊은수풀(영입/합체) > 정예(열쇠) > 일반 > 휴식
      return order.find((rt) => choices.includes(rt)) || choices[0];
    },
  },
};

/* ── 풀-런 1회 구동(screen 전이 상태머신) ─────────────────────────── */
const MAX_DECISIONS = 400;
const MAX_BATTLES = 60;

function playOneRun(policy, runIndex) {
  const rec = {
    runIndex, policy: policy.id, result: null, finalDepth: 0,
    battleCount: 0, fusionCount: 0, recruitCount: 0, faintCount: 0,
    bossAttempted: false, bossKilled: false,
    finalParty: [], secondClassCount: 0, gotSecondClass: false,
    selectedRewards: [], routeChoices: [], endReason: "",
    jobsSeen: new Set(),
  };

  startRun(policy.startFormation());

  let decisions = 0;
  while (true) {
    if (gameState.run.result === "clear") { rec.result = "clear"; rec.endReason = "clear"; rec.bossKilled = true; break; }
    if (gameState.run.result === "defeat") { rec.result = "defeat"; rec.endReason = "defeat"; break; }
    if (++decisions > MAX_DECISIONS || rec.battleCount > MAX_BATTLES) { rec.result = "incomplete"; rec.endReason = "cap"; break; }

    const screen = gameState.screen;
    if (screen === "battle") {
      partyJobIds().forEach((j) => rec.jobsSeen.add(j)); // 이번 전투에 나선 편성 기록(등장)
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
      if (choiceId) { rec.fusionCount += 1; applyFusion(choiceId); }
      else skipFusion();
    } else if (screen === "fusionResult") {
      continueAfterFusion();
    } else if (screen === "recruit") {
      const offer = gameState.run.recruitOffer || [];
      if (offer.length) {
        const jobId = policy.pickRecruit(offer);
        if (jobId) { previewRecruit(jobId); rec.recruitCount += 1; }
      }
      confirmRecruit();
    } else if (screen === "arrange") {
      confirmArrange();
    } else if (screen === "route") {
      const choices = gameState.run.routeChoices || ["normal"];
      const rt = policy.pickRoute(choices);
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
  if (!rec.result) { rec.result = "incomplete"; rec.endReason = rec.endReason || "incomplete"; }
  return rec;
}

/* ── 상태 스냅샷/복구(본게임 state 오염 방지) ───────────────────────── */
// Auto Run Report 01A — State Restore Hotfix.
//   실행 중 gameState.run / gameState.battle은 in-place로 변형되고 "새 key"가 추가될 수 있다
//   (예: resetBattle이 run.partyHp를 신설). 기존 Object.assign 복구는 snapshot에 있는 key만 덮어써서
//   실행 중 새로 생긴 key(run.partyHp 등)를 지우지 못했다 → 잔류 오염.
//   → snapshot을 deep clone으로 떠 두고, run/battle은 "통째 교체"(deep clone 재할당)로 복구한다.
//     이러면 ① 실행 중 새로 생긴 key 잔류 0, ② 중첩 객체가 snapshot과 공유되지 않아 이후 변형이
//     snapshot을 오염시키지 않는다. party/enemies/logs는 실행 중 "재할당"되므로 원본 배열은
//     변형되지 않는다 → 참조 복원만으로 정확히 원복된다(불필요한 clone 없이).
function deepClone(o) {
  if (typeof structuredClone === "function") return structuredClone(o);
  return JSON.parse(JSON.stringify(o)); // 폴백: run/battle은 순수 데이터(함수/DOM 없음)라 안전
}
function snapshotState() {
  return {
    party: gameState.party, enemies: gameState.enemies, logs: gameState.logs,
    screen: gameState.screen,
    battle: deepClone(gameState.battle),
    run: deepClone(gameState.run),
    immortal: gameState.dev ? gameState.dev.immortal : false,
  };
}
function restoreState(s) {
  gameState.party = s.party;
  gameState.enemies = s.enemies;
  gameState.logs = s.logs;
  gameState.screen = s.screen;
  gameState.battle = deepClone(s.battle); // 통째 교체 — 실행 중 추가/변형된 key 잔류 0
  gameState.run = deepClone(s.run);
  if (gameState.dev) gameState.dev.immortal = s.immortal;
}

/* ── 배치 러너(chunk 처리 + 진행률 + 취소) ──────────────────────────── */
let cancelFlag = false;
const nextTick = () => new Promise((r) => setTimeout(r, 0));

export async function runBatch({ count, policyId, seed, onProgress }) {
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
    // chunk 단위로 진행률 갱신 + 브라우저 양보(멈춤 방지). 마지막 청크엔 trailing yield를 두지 않는다
    //   (백그라운드 탭의 setTimeout 스로틀로 완료가 지연되는 것을 막는다 — 포그라운드에선 무영향).
    const CHUNK = 20;
    for (let i = 0; i < count; i++) {
      if (cancelFlag) break;
      runs.push(playOneRun(policy, i));
      if (onProgress) onProgress(i + 1, count);
      if ((i + 1) % CHUNK === 0 && i + 1 < count) await nextTick();
    }
  } finally {
    setHeadlessRun(false);
    if (useSeed) restoreRandom();
    restoreState(snap); // immortal 포함 본게임 state 원복
  }
  return { runs, elapsed: performance.now() - t0, policyId, count, seed: useSeed ? seed : null, canceled: cancelFlag };
}
export function cancelBatch() { cancelFlag = true; }

/* ── 집계 ───────────────────────────────────────────────────────── */
const DEATH_BANDS = [
  { label: "1–8", min: 1, max: 8 },
  { label: "9–16", min: 9, max: 16 },
  { label: "17–24", min: 17, max: 24 },
  { label: "25–30", min: 25, max: 30 },
  { label: "31+", min: 31, max: Infinity },
];
const bandOf = (d) => (DEATH_BANDS.find((b) => d >= b.min && d <= b.max) || DEATH_BANDS[DEATH_BANDS.length - 1]).label;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const partySig = (jobs) => jobs.slice().map(jobName).sort().join(" + ") || "(빈 파티)";

function topGroups(runs, valueFn) {
  const map = new Map();
  runs.forEach((r) => {
    const key = partySig(r.finalParty);
    const g = map.get(key) || { key, count: 0, depthSum: 0, secondSum: 0, results: {} };
    g.count += 1; g.depthSum += r.finalDepth; g.secondSum += r.secondClassCount;
    g.results[r.result] = (g.results[r.result] || 0) + 1;
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

  // 직업별 성과
  const jobIds = Object.keys(UNIT_TEMPLATES.party);
  const jobs = jobIds.map((id) => {
    const appear = runs.filter((r) => r.jobsSeen.has(id));
    const inClear = clears.filter((r) => r.jobsSeen.has(id));
    return {
      id, name: jobName(id), second: isSecond(id),
      appear: appear.length,
      inClear: inClear.length,
      inclusion: appear.length ? inClear.length / appear.length : 0,
      avgDepth: mean(appear.map((r) => r.finalDepth)),
      bossKillRate: appear.length ? appear.filter((r) => r.bossKilled).length / appear.length : 0,
    };
  }).filter((j) => j.appear > 0).sort((a, b) => b.appear - a.appear);

  // 2차 직업별
  const secondJobs = SECOND_CLASS_JOBS.map((id) => {
    const appear = runs.filter((r) => r.jobsSeen.has(id));
    const inClear = clears.filter((r) => r.jobsSeen.has(id));
    return { id, name: jobName(id), appear: appear.length, inClear: inClear.length, inclusion: appear.length ? inClear.length / appear.length : 0 };
  }).filter((j) => j.appear > 0).sort((a, b) => b.appear - a.appear);

  // 보상 TOP(이름 기준 — 계열 태그 없음)
  const rewardCount = (subset) => {
    const m = new Map();
    subset.forEach((r) => r.selectedRewards.forEach((id) => m.set(id, (m.get(id) || 0) + 1)));
    return [...m.entries()].map(([id, c]) => ({ name: rewardName(id), count: c })).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  // 전멸 구간
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
    deathBand,
    clearParty: topGroups(clears),
    wipeParty: topGroups(wipes),
    jobs, secondJobs,
    rewardAll: rewardCount(runs), rewardClear: rewardCount(clears), rewardWipe: rewardCount(wipes),
  };
}

/* ── TSV / JSON ─────────────────────────────────────────────────── */
const TSV_COLS = [
  "runIndex", "policy", "result", "finalDepth", "battleCount", "fusionCount", "recruitCount",
  "faintCount", "bossAttempted", "bossKilled", "finalParty", "secondClassCount",
  "selectedRewards", "endReason", "routeChoices", "deathDepthBand",
];
export function runsToTSV(runs) {
  const lines = [TSV_COLS.join("\t")];
  runs.forEach((r) => {
    lines.push([
      r.runIndex, r.policy, r.result, r.finalDepth, r.battleCount, r.fusionCount, r.recruitCount,
      r.faintCount, r.bossAttempted ? 1 : 0, r.bossKilled ? 1 : 0,
      r.finalParty.map(jobName).join("+"), r.secondClassCount,
      r.selectedRewards.map(rewardName).join("|"), r.endReason,
      r.routeChoices.join(">"), r.result === "defeat" ? bandOf(r.finalDepth) : "",
    ].join("\t"));
  });
  return lines.join("\n");
}
function runsToJSON(runs) {
  return JSON.stringify(runs.map((r) => ({ ...r, jobsSeen: [...r.jobsSeen] })), null, 0);
}

/* ── 렌더 ───────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function card(k, v, sub) { return `<div class="ar-card"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`; }

function renderSummary(a, meta) {
  const policyLabel = (POLICIES[meta.policyId] || {}).label || meta.policyId;
  $("ar-summary").innerHTML =
    `<h3>요약 — ${esc(policyLabel)} · ${a.attempts}회 ${meta.seed != null ? `· seed ${meta.seed}` : ""} <span class="ar-meta">(${(meta.elapsed / 1000).toFixed(1)}s${meta.canceled ? " · 취소됨" : ""})</span></h3>
     <div class="ar-cards">
       ${card("총 시도", a.attempts)}
       ${card("클리어", a.clears, fmtPct(a.clearRate))}
       ${card("전멸", a.wipes)}
       ${card("미완(캡/교착)", a.incompletes)}
       ${card("평균 심도", fmt1(a.avgDepth))}
       ${card("중앙값 심도", fmt1(a.medianDepth))}
       ${card("최고 심도", a.maxDepth)}
       ${card("최저 심도", a.minDepth)}
       ${card("평균 전투 수", fmt1(a.avgBattles))}
       ${card("평균 합체", fmt1(a.avgFusion))}
       ${card("평균 영입", fmt1(a.avgRecruit))}
       ${card("평균 기절", fmt1(a.avgFaint))}
       ${card("보스 도전", a.bossAttempts)}
       ${card("보스 처치", a.bossKills)}
       ${card("2차 확보런", a.secondRuns)}
       ${card("2차 확보런 클리어율", fmtPct(a.secondClearRate))}
     </div>`;
}

function renderDeathBand(a) {
  const max = Math.max(1, ...a.deathBand.map((b) => b.count));
  const bars = a.deathBand.map((b) =>
    `<div class="ar-bar-row"><span class="lab">${b.label}</span>
       <span class="bar"><span class="fill" style="width:${(b.count / max) * 100}%"></span></span>
       <span class="num">${b.count}</span></div>`).join("");
  $("ar-deathband").innerHTML = `<h3>전멸 구간 (심도별 전멸 수)</h3><div class="ar-bars">${bars}</div>`;
}

function partyTable(title, groups, note) {
  if (!groups.length) return `<h3>${title}</h3><div class="ar-empty">${note || "데이터 없음"}</div>`;
  const rows = groups.map((g) => {
    const rep = Object.entries(g.results).sort((a, b) => b[1] - a[1])[0];
    return `<tr><td class="txt">${esc(g.key)}</td><td>${g.count}</td><td>${fmt1(g.depthSum / g.count)}</td>
      <td>${fmt1(g.secondSum / g.count)}</td><td>${rep ? esc(rep[0]) : "-"}</td></tr>`;
  }).join("");
  return `<h3>${title}</h3><div class="ar-tablewrap"><table>
    <thead><tr><th class="txt">파티 구성</th><th>횟수</th><th>평균심도</th><th>2차수</th><th>대표결과</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderParties(a) {
  $("ar-clearparty").innerHTML = partyTable("클리어 파티 TOP 10", a.clearParty, "아직 클리어한 파티가 없습니다.");
  $("ar-wipeparty").innerHTML = partyTable("전멸 파티 TOP 10", a.wipeParty, "전멸 기록이 없습니다.");
}

function renderJobs(a) {
  const rows = a.jobs.map((j) =>
    `<tr><td class="txt">${esc(j.name)}${j.second ? ' <span class="ar-2nd">2차</span>' : ""}</td>
      <td>${j.appear}</td><td>${j.inClear}</td><td>${fmtPct(j.inclusion)}</td>
      <td>${fmt1(j.avgDepth)}</td><td>${fmtPct(j.bossKillRate)}</td></tr>`).join("");
  $("ar-jobs").innerHTML = `<h3>직업별 성과표 (등장 ${a.jobs.length}종)</h3><div class="ar-tablewrap"><table>
    <thead><tr><th class="txt">직업</th><th>등장</th><th>클리어 포함</th><th>클리어 포함률</th><th>포함시 평균심도</th><th>보스처치율</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderSecond(a) {
  const max = Math.max(a.secondClearRate, a.nonSecondClearRate, 0.0001);
  const bar = (label, v) =>
    `<div class="ar-bar-row"><span class="lab">${label}</span>
      <span class="bar"><span class="fill alt" style="width:${(v / max) * 100}%"></span></span>
      <span class="num">${fmtPct(v)}</span></div>`;
  const rows = a.secondJobs.map((j) =>
    `<tr><td class="txt">${esc(j.name)}</td><td>${j.appear}</td><td>${j.inClear}</td><td>${fmtPct(j.inclusion)}</td></tr>`).join("");
  $("ar-second").innerHTML = `<h3>2차 직업 분석</h3>
    <div class="ar-cards">
      ${card("2차 확보런", a.secondRuns)}
      ${card("2차 확보런 클리어율", fmtPct(a.secondClearRate))}
      ${card("2차 미확보런 클리어율", fmtPct(a.nonSecondClearRate))}
    </div>
    <div class="ar-bars">${bar("2차 확보", a.secondClearRate)}${bar("2차 미확보", a.nonSecondClearRate)}</div>
    ${a.secondJobs.length ? `<div class="ar-tablewrap"><table>
      <thead><tr><th class="txt">2차 직업</th><th>등장</th><th>클리어 포함</th><th>클리어 포함률</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<div class="ar-empty">등장한 2차 직업이 없습니다.</div>`}`;
}

function rewardList(title, list) {
  if (!list.length) return `<div class="ar-rewardcol"><h4>${title}</h4><div class="ar-empty">없음</div></div>`;
  return `<div class="ar-rewardcol"><h4>${title}</h4><ol>${list.map((r) => `<li>${esc(r.name)} <b>${r.count}</b></li>`).join("")}</ol></div>`;
}
function renderRewards(a) {
  $("ar-rewards").innerHTML = `<h3>보상 선택 TOP (이름 기준 — 계열 태그 없음)</h3>
    <div class="ar-rewards">${rewardList("전체", a.rewardAll)}${rewardList("클리어런", a.rewardClear)}${rewardList("전멸런", a.rewardWipe)}</div>`;
}

/* ── 컨트롤/엔트리 ───────────────────────────────────────────────── */
let lastRuns = null;

function setProgress(done, total) {
  const pct = total ? (done / total) * 100 : 0;
  $("ar-progress-fill").style.width = pct + "%";
  $("ar-progress-text").textContent = `${done} / ${total}`;
}

function renderAll(runs, meta) {
  lastRuns = runs;
  if (!runs.length) { $("ar-summary").innerHTML = `<div class="ar-empty">실행 결과가 없습니다.</div>`; return; }
  const a = aggregate(runs);
  renderSummary(a, meta); renderDeathBand(a); renderParties(a); renderJobs(a); renderSecond(a); renderRewards(a);
  $("ar-exports").hidden = false;
}

async function run(count) {
  const policyId = $("ar-policy").value;
  const seedRaw = $("ar-seed").value.trim();
  const seed = seedRaw === "" ? null : parseInt(seedRaw, 10);
  $("ar-run-btns").querySelectorAll("button").forEach((b) => (b.disabled = true));
  $("ar-cancel").disabled = false;
  $("ar-progress").hidden = false;
  setProgress(0, count);
  const meta = await runBatch({ count, policyId, seed, onProgress: setProgress });
  renderAll(meta.runs, meta);
  $("ar-run-btns").querySelectorAll("button").forEach((b) => (b.disabled = false));
  $("ar-cancel").disabled = true;
  $("ar-progress").hidden = true;
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

export function initAutoRunReport() {
  $("ar-run-btns").addEventListener("click", (e) => { const b = e.target.closest("[data-count]"); if (b) run(Number(b.dataset.count)); });
  $("ar-cancel").addEventListener("click", cancelBatch);
  $("ar-copy-tsv").addEventListener("click", (e) => { if (lastRuns) copy(runsToTSV(lastRuns), e.target, "복사됨!"); });
  $("ar-copy-json").addEventListener("click", (e) => { if (lastRuns) copy(runsToJSON(lastRuns), e.target, "복사됨!"); });
}
