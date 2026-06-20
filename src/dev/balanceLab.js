// =====================================================================
// Dev Balance Lab 02 — Role Value Metrics (계측 전용 Dev 도구)
//   (Balance Lab 01 Duel/Damage Meter 위 확장 — DPS만으로 못 보는 역할 가치를 수치화)
//
//   목적: 딜러는 DPS, 생존형은 피해억제/순손실, 회복형은 유효회복/순보존, 광역형은 다중효율,
//         조건부 직업은 발동/표식/반격, 파티 조합은 클리어/잔여HP/기절 수로 본다.
//   진입: ?dev=1 에서만 타이틀에 버튼 노출(main.js). 일반 플레이엔 절대 노출되지 않는다.
//   분리: 실제 전투 엔진(battle.js runLabScenario)을 헤드리스로 재사용 — 전투 공식/직업 스탯/스킬/
//         몬스터 데이터/합체/보상/localStorage/발자취는 일절 건드리지 않는다. 결과는 메모리 전용(저장 X).
//   모드: 1:1(아군1 vs 적1, 공세+생존+회복 전 지표) / 다중(아군1 vs 적N) / 파티(아군4 vs 웨이브).
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

// 실험용 더미 — Lab 내부에서만 만드는 가짜 적(본게임 UNIT_TEMPLATES 무변경). 무저항·불사(순수 표적).
const DUMMY_TEMPLATE = { id: "dummy", name: "더미(무저항)", team: "enemy", type: "dummy", role: "front", maxHp: 100000, atk: 0, speed: 0 };
const ENEMY_KEYS = ["dummy", "bear", "fox", "bird", "dewslime", "lamb", "owl", "deer", "lion"];
function enemyTemplateOf(key) { return key === "dummy" ? DUMMY_TEMPLATE : UNIT_TEMPLATES.enemies[key]; }
function jobName(id) { return (UNIT_TEMPLATES.party[id] && UNIT_TEMPLATES.party[id].name) || id; }
function enemyName(key) { const t = enemyTemplateOf(key); return (t && t.name) || key; }

// 적 그룹(다중/파티 공용). keys = 적 템플릿 키 배열.
const ENEMY_GROUPS = [
  { id: "g_small3", label: "소형 3 (잎여우3)", keys: ["fox", "fox", "fox"] },
  { id: "g_f2b2", label: "전열2+후열2 (곰·여우·새·이슬)", keys: ["bear", "fox", "bird", "dewslime"] },
  { id: "g_elite2", label: "정예+소형2 (올빼미·여우·새)", keys: ["owl", "fox", "bird"] },
  { id: "g_smallWave", label: "초보자 소형 웨이브 (곰·여우·새·이슬)", keys: ["bear", "fox", "bird", "dewslime"] },
  { id: "g_eliteWave", label: "초보자 정예 웨이브 (사슴·여우·새)", keys: ["deer", "fox", "bird"] },
  { id: "g_boss", label: "보스 웨이브 (사자왕)", keys: ["lion"] },
];
const groupOf = (id) => ENEMY_GROUPS.find((g) => g.id === id) || ENEMY_GROUPS[0];
const groupTemplates = (id) => groupOf(id).keys.map(enemyTemplateOf);

// 파티 프리셋(4인). jobs = 직업 id 배열.
const PARTY_PRESETS = [
  { id: "p_base", label: "기본 기준 (전사·수호자·궁수·사제)", jobs: ["warrior", "guardian", "archer", "priest"] },
  { id: "p_attack", label: "공격 (전사·도적·궁수·마도)", jobs: ["warrior", "rogue", "archer", "mage"] },
  { id: "p_stable", label: "안정 (수호자·전사·사제·신관)", jobs: ["guardian", "warrior", "priest", "cleric"] },
  { id: "p_first", label: "1차 혼합 (성직자·파수궁·선봉·도적)", jobs: ["saint", "watchbow", "vanguard", "rogue"] },
  { id: "p_second", label: "2차 포함 (검성·성직자·수문장·천궁)", jobs: ["swordsaint", "saint", "gatekeeper", "skyarcher"] },
  { id: "p_exp", label: "실험 (현자·용창·결계장·구원자)", jobs: ["sage", "dragonspear", "wardkeeper", "redeemer"] },
];
const partyOf = (id) => PARTY_PRESETS.find((p) => p.id === id) || PARTY_PRESETS[0];

const DURATIONS = [30, 60, 120];
const MODES = [
  { id: "duel", label: "1:1" },
  { id: "multi", label: "다중" },
  { id: "party", label: "파티" },
];

// 프리셋(처음 열었을 때 바로 비교 — 모드별 대표 예시).
const PRESETS = [
  { mode: "duel", heroJob: "warrior", enemyKey: "dummy", seconds: 60, label: "전사 vs 더미 60" },
  { mode: "duel", heroJob: "swordsaint", enemyKey: "lion", seconds: 120, label: "검성 vs 사자왕 120" },
  { mode: "duel", heroJob: "paladin", enemyKey: "lion", seconds: 120, label: "성기사 vs 사자왕 120" },
  { mode: "duel", heroJob: "healbow", enemyKey: "lion", seconds: 120, label: "치유궁 vs 사자왕 120" },
  { mode: "multi", heroJob: "mage", groupId: "g_small3", seconds: 60, label: "마도 vs 소형3 60" },
  { mode: "party", partyId: "p_base", groupId: "g_smallWave", seconds: 120, label: "기본파티 vs 소형웨이브 120" },
];

const fmtInt = (n) => Math.round(n || 0).toLocaleString("en-US");
const fmtF1 = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const fmtPct = (n) => (Math.round((n || 0) * 1000) / 10).toFixed(1) + "%";
const dash = (v, f) => (v == null ? "—" : f(v));
const netLossOf = (a) => (a.dmgTaken || 0) - (a.shieldBlocked || 0) - (a.healDone || 0); // 순손실(음수=과회복)

/* ── 모듈 상태(메모리 전용 — localStorage 미사용) ──────────────────── */
let els = null;
let sel = { mode: "duel", heroJob: "warrior", enemyKey: "bear", groupId: "g_small3", partyId: "p_base", seconds: 60 };
let lastResult = null, lastMeta = null;
const rows = [];                                  // 비교표 누적
const dummyDpsCache = new Map();                  // 다중효율용 단일 더미 DPS 캐시(heroJob:seconds)

/* ── 스타일(1회 주입, Dev 전용 — styles.css 오염 없음) ─────────────── */
const STYLE = `
#balancelab-overlay{position:fixed;inset:0;z-index:300;display:flex;align-items:flex-start;justify-content:center;background:rgba(6,10,14,0.82);overflow:auto;padding:18px 10px;}
#balancelab-overlay[hidden]{display:none;}
#balancelab-card{width:min(960px,100%);background:#11161d;border:1px solid #2c3a46;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,0.55);color:#dfe9f2;font-size:13px;line-height:1.45;}
#balancelab-card .bl-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #243039;}
#balancelab-card .bl-title{font-weight:800;font-size:14px;letter-spacing:.02em;}
#balancelab-card .bl-tag{font-size:10px;font-weight:800;color:#7fd1a8;border:1px solid #2f5e47;background:rgba(60,180,120,.1);border-radius:999px;padding:2px 8px;}
#balancelab-card .bl-x{margin-left:auto;background:none;border:none;color:#9fb3c4;font-size:18px;cursor:pointer;line-height:1;}
#balancelab-card .bl-body{padding:12px 14px;}
#balancelab-card .bl-note{font-size:11px;color:#9fb3c4;margin:0 0 10px;}
#balancelab-card .bl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;}
#balancelab-card .bl-row .bl-lab{font-size:11px;color:#8aa0b2;min-width:42px;}
#balancelab-card select{background:#1b232c;color:#e7f0f7;border:1px solid #34434f;border-radius:8px;padding:7px 8px;font-size:13px;min-width:150px;max-width:100%;}
#balancelab-card .bl-seg{display:inline-flex;border:1px solid #34434f;border-radius:8px;overflow:hidden;}
#balancelab-card .bl-seg button{background:#1b232c;color:#cfe0ee;border:none;padding:7px 12px;font-size:13px;cursor:pointer;}
#balancelab-card .bl-seg button.on{background:#2f6fb0;color:#fff;font-weight:800;}
#balancelab-card .bl-btn{border:1px solid #3a5a76;border-radius:8px;background:#23415b;color:#eaf3fb;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;}
#balancelab-card .bl-btn:active{transform:translateY(1px);}
#balancelab-card .bl-btn.run{background:#2f7d50;border-color:#3c8f60;}
#balancelab-card .bl-btn.ghost{background:#1b232c;color:#cfe0ee;}
#balancelab-card .bl-presets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
#balancelab-card .bl-presets button{font-size:11px;padding:6px 9px;border:1px dashed #3a5a76;border-radius:8px;background:rgba(60,120,180,.08);color:#bcd6ec;cursor:pointer;}
#balancelab-card .bl-result{border:1px solid #28333d;border-radius:10px;padding:10px;margin:6px 0 12px;background:#0d1217;}
#balancelab-card .bl-result h4{margin:0 0 8px;font-size:12px;color:#bcd6ec;font-weight:700;}
#balancelab-card .bl-result h5{margin:10px 0 6px;font-size:11px;color:#9fb8cc;font-weight:700;}
#balancelab-card .bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px;}
#balancelab-card .bl-metric{background:#151c24;border:1px solid #232e38;border-radius:8px;padding:7px 9px;}
#balancelab-card .bl-metric.req{border-color:#39597a;}
#balancelab-card .bl-metric .k{font-size:10px;color:#8aa0b2;}
#balancelab-card .bl-metric .v{font-size:15px;font-weight:800;color:#eef6ff;}
#balancelab-card .bl-metric.req .v{color:#bfe3ff;}
#balancelab-card .bl-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
#balancelab-card .bl-tablewrap{overflow-x:auto;border:1px solid #28333d;border-radius:10px;margin-bottom:6px;}
#balancelab-card table{border-collapse:collapse;width:100%;font-size:12px;white-space:nowrap;}
#balancelab-card th,#balancelab-card td{padding:6px 8px;border-bottom:1px solid #222c35;text-align:right;}
#balancelab-card th.txt,#balancelab-card td.txt{text-align:left;}
#balancelab-card thead th{position:sticky;top:0;background:#1a232c;color:#9fb8cc;font-weight:700;}
#balancelab-card tbody tr:nth-child(odd){background:rgba(255,255,255,.015);}
#balancelab-card .bl-empty{color:#7990a2;font-size:12px;padding:10px;text-align:center;}
#balancelab-card .bl-foot{font-size:10px;color:#6f8497;margin-top:8px;}
#balancelab-card .res-clear{color:#7fd1a8;font-weight:800;}
#balancelab-card .res-wipe{color:#f0a0a0;font-weight:800;}
#balancelab-card .res-timeout{color:#e6c578;font-weight:800;}
`;
function injectStyle() {
  if (document.getElementById("balancelab-style")) return;
  const s = document.createElement("style"); s.id = "balancelab-style"; s.textContent = STYLE; document.head.appendChild(s);
}

/* ── 컨트롤 HTML ─────────────────────────────────────────────────── */
function heroSelectHTML(id, value) {
  const groups = HERO_GROUPS.map((g) => {
    const opts = g.jobs.filter((j) => UNIT_TEMPLATES.party[j]).map((j) => {
      const role = combatRoleLabelOf(j);
      return `<option value="${j}"${j === value ? " selected" : ""}>${role ? `${jobName(j)} · ${role}` : jobName(j)}</option>`;
    }).join("");
    return `<optgroup label="${g.label}">${opts}</optgroup>`;
  }).join("");
  return `<select id="${id}">${groups}</select>`;
}
function enemySelectHTML() {
  const opts = ENEMY_KEYS.map((k) => {
    const t = enemyTemplateOf(k);
    const note = k === "dummy" ? "무저항·불사" : `HP ${t.maxHp}/공 ${t.atk}`;
    return `<option value="${k}"${k === sel.enemyKey ? " selected" : ""}>${enemyName(k)} (${note})</option>`;
  }).join("");
  return `<select id="bl-enemy">${opts}</select>`;
}
function groupSelectHTML() {
  return `<select id="bl-group">${ENEMY_GROUPS.map((g) => `<option value="${g.id}"${g.id === sel.groupId ? " selected" : ""}>${g.label}</option>`).join("")}</select>`;
}
function partySelectHTML() {
  return `<select id="bl-party">${PARTY_PRESETS.map((p) => `<option value="${p.id}"${p.id === sel.partyId ? " selected" : ""}>${p.label}</option>`).join("")}</select>`;
}
function modeSegHTML() {
  return `<span class="bl-seg" id="bl-mode">${MODES.map((m) => `<button type="button" data-mode="${m.id}" class="${m.id === sel.mode ? "on" : ""}">${m.label}</button>`).join("")}</span>`;
}
function durationSegHTML() {
  return `<span class="bl-seg" id="bl-dur">${DURATIONS.map((d) => `<button type="button" data-dur="${d}" class="${d === sel.seconds ? "on" : ""}">${d}초</button>`).join("")}</span>`;
}
function presetsHTML() {
  return PRESETS.map((p, i) => `<button type="button" data-preset="${i}">${p.label}</button>`).join("");
}

// 모드에 따라 아군/적 선택 줄을 다시 그린다(1:1=영웅+적 / 다중=영웅+그룹 / 파티=파티+그룹).
function selectionRowHTML() {
  if (sel.mode === "party") return `<span class="bl-lab">파티</span>${partySelectHTML()}<span class="bl-lab">적군</span>${groupSelectHTML()}`;
  if (sel.mode === "multi") return `<span class="bl-lab">아군</span>${heroSelectHTML("bl-hero", sel.heroJob)}<span class="bl-lab">적군</span>${groupSelectHTML()}`;
  return `<span class="bl-lab">아군</span>${heroSelectHTML("bl-hero", sel.heroJob)}<span class="bl-lab">적</span>${enemySelectHTML()}`;
}

function build() {
  injectStyle();
  const overlay = document.createElement("div");
  overlay.id = "balancelab-overlay"; overlay.hidden = true;
  overlay.innerHTML = `
    <div id="balancelab-card">
      <div class="bl-head">
        <span class="bl-title">🧪 Balance Lab — Role Value Metrics</span>
        <span class="bl-tag">계측 전용 · 밸런스 조정 아님</span>
        <button type="button" class="bl-x" data-bl-close aria-label="닫기">✕</button>
      </div>
      <div class="bl-body">
        <p class="bl-note">실제 전투 엔진을 헤드리스로 돌려 역할 가치를 계측합니다(본게임 진행/스탯/저장 무영향). 측정 시간은 x2 배속 환산.
          1:1=공세+생존+회복 / 다중=광역·다중효율 / 파티=클리어·잔여HP·기절. 1:1·다중은 사망 즉시 부활로 측정시간 지속, 파티는 자연 종료.</p>
        <div class="bl-presets" data-bl-presets>${presetsHTML()}</div>
        <div class="bl-row"><span class="bl-lab">모드</span>${modeSegHTML()}<span class="bl-lab">시간</span>${durationSegHTML()}</div>
        <div class="bl-row" data-bl-selrow>${selectionRowHTML()}</div>
        <div class="bl-row"><button type="button" class="bl-btn run" data-bl-run>실험 실행 ▶</button></div>
        <div class="bl-result" data-bl-result></div>
        <div class="bl-actions">
          <button type="button" class="bl-btn" data-bl-add>＋ 비교표에 추가</button>
          <button type="button" class="bl-btn ghost" data-bl-copy>TSV 복사</button>
          <button type="button" class="bl-btn ghost" data-bl-clear>비교표 초기화</button>
        </div>
        <div class="bl-tablewrap" data-bl-table></div>
        <p class="bl-foot">결과는 새로고침 전까지만 유지(저장 안 함). 치명/랜덤으로 실행마다 약간 달라집니다. 생존/다중 비교는 같은 적에 "전사"·"단일 더미"를 함께 돌려 비교표에서 대조하세요.</p>
      </div>
    </div>`;
  (document.getElementById("game-frame") || document.body).appendChild(overlay);
  els = { overlay, selrow: overlay.querySelector("[data-bl-selrow]"), dur: overlay.querySelector("#bl-dur"), mode: overlay.querySelector("#bl-mode"), result: overlay.querySelector("[data-bl-result]"), table: overlay.querySelector("[data-bl-table]") };
  wire(overlay);
  renderResult(); renderTable();
}

/* ── 이벤트 배선 ─────────────────────────────────────────────────── */
function bindSelects() {
  const h = els.overlay.querySelector("#bl-hero"); if (h) h.onchange = (e) => { sel.heroJob = e.target.value; };
  const en = els.overlay.querySelector("#bl-enemy"); if (en) en.onchange = (e) => { sel.enemyKey = e.target.value; };
  const g = els.overlay.querySelector("#bl-group"); if (g) g.onchange = (e) => { sel.groupId = e.target.value; };
  const p = els.overlay.querySelector("#bl-party"); if (p) p.onchange = (e) => { sel.partyId = e.target.value; };
}
function refreshSelectionRow() { els.selrow.innerHTML = selectionRowHTML(); bindSelects(); }

function wire(overlay) {
  bindSelects();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-bl-close]")) { close(); return; }
    const modeBtn = e.target.closest("[data-mode]"); if (modeBtn) { setMode(modeBtn.dataset.mode); return; }
    const durBtn = e.target.closest("[data-dur]"); if (durBtn) { setDuration(Number(durBtn.dataset.dur)); return; }
    const preset = e.target.closest("[data-preset]"); if (preset) { applyPreset(Number(preset.dataset.preset)); return; }
    if (e.target.closest("[data-bl-run]")) { runExperiment(); return; }
    if (e.target.closest("[data-bl-add]")) { addRow(); return; }
    if (e.target.closest("[data-bl-clear]")) { clearRows(); return; }
    if (e.target.closest("[data-bl-copy]")) { copyTSV(e.target.closest("[data-bl-copy]")); return; }
  });
}
function setMode(m) {
  sel.mode = m;
  els.mode.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  refreshSelectionRow();
}
function setDuration(d) {
  sel.seconds = d;
  els.dur.querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.dur) === d));
}
function applyPreset(i) {
  const p = PRESETS[i]; if (!p) return;
  sel = { ...sel, ...p };
  setMode(p.mode); setDuration(p.seconds);
  // refreshSelectionRow가 sel 기반으로 새 select를 그리므로 값 동기화는 자동.
  runExperiment();
}

/* ── 실험 실행 ──────────────────────────────────────────────────── */
function runExperiment() {
  let result = null, meta = null;
  if (sel.mode === "party") {
    const party = partyOf(sel.partyId); const grp = groupOf(sel.groupId);
    result = runLabScenario({ allyJobs: party.jobs, enemyTemplates: groupTemplates(sel.groupId), seconds: sel.seconds, sustained: false });
    meta = { mode: "party", allyLabel: party.label.split(" (")[0], enemyLabel: grp.label.split(" (")[0], seconds: sel.seconds };
  } else if (sel.mode === "multi") {
    const grp = groupOf(sel.groupId);
    result = runLabScenario({ allyJobs: [sel.heroJob], enemyTemplates: groupTemplates(sel.groupId), seconds: sel.seconds, sustained: true });
    if (result) result.multiEff = multiEfficiency(sel.heroJob, sel.seconds, result.dps); // 단일 더미 DPS 대비
    meta = { mode: "multi", allyLabel: jobName(sel.heroJob), enemyLabel: grp.label.split(" (")[0], seconds: sel.seconds };
  } else {
    result = runLabScenario({ allyJobs: [sel.heroJob], enemyTemplates: [enemyTemplateOf(sel.enemyKey)], seconds: sel.seconds, sustained: true });
    meta = { mode: "duel", allyLabel: jobName(sel.heroJob), enemyLabel: enemyName(sel.enemyKey), seconds: sel.seconds };
  }
  lastResult = result; lastMeta = result ? meta : null;
  renderResult();
}

// 다중 효율 = 다중 총 DPS / 동일 직업 단일 더미 DPS. 단일 더미 DPS는 캐시(가벼운 추가 sim 1회).
function multiEfficiency(heroJob, seconds, multiDps) {
  const key = `${heroJob}:${seconds}`;
  let base = dummyDpsCache.get(key);
  if (base == null) {
    const r = runLabScenario({ allyJobs: [heroJob], enemyTemplates: [DUMMY_TEMPLATE], seconds, sustained: true });
    base = r ? r.dps : 0; dummyDpsCache.set(key, base);
  }
  return { singleDps: base, ratio: base > 0 ? multiDps / base : 0 };
}

/* ── 결과 패널(모드별) ───────────────────────────────────────────── */
const metricCard = (k, v, req) => `<div class="bl-metric${req ? " req" : ""}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

function renderResult() {
  if (!els) return;
  if (!lastResult) { els.result.innerHTML = `<div class="bl-empty">실험을 실행하면 결과가 여기에 표시됩니다.</div>`; return; }
  const r = lastResult, m = lastMeta;
  if (m.mode === "party") return renderPartyResult(r, m);
  if (m.mode === "multi") return renderMultiResult(r, m);
  return renderDuelResult(r, m);
}

function renderDuelResult(r, m) {
  const a = r.allies[0] || {};
  const off = [
    metricCard("총 피해량", fmtInt(r.totalDamage), true), metricCard("DPS", fmtF1(r.dps), true),
    metricCard("공격 횟수", fmtInt(a.hits), true), metricCard("평균 피해", fmtF1(a.hits ? a.dmgDone / a.hits : 0)),
    metricCard("최대 피해", fmtInt(a.maxHit)), metricCard("치명 횟수", fmtInt(a.crits), true),
    metricCard("스킬 발동", fmtInt(a.skillCasts), true), metricCard("스킬 피해", fmtInt(a.skillDamage)),
    metricCard("반격 횟수", fmtInt(a.counters)), metricCard("표식 부여", fmtInt(a.marks)),
  ].join("");
  const surv = [
    metricCard("받은 피해량", fmtInt(a.dmgTaken), true), metricCard("받은 DPS", fmtF1((a.dmgTaken || 0) / r.seconds), true),
    metricCard("순손실", fmtInt(netLossOf(a))), metricCard("보호막 막음", fmtInt(a.shieldBlocked)),
    metricCard("생존 시간", `${fmtF1(a.survivalTime)}s`), metricCard("기절", a.fainted ? "예" : "아니오"),
    metricCard("회복량", fmtInt(a.healDone)), metricCard("유효 회복", fmtInt(a.healDone)),
    metricCard("초과 회복", fmtInt(a.overHeal)), metricCard("보호막 부여", fmtInt(a.shieldApplied)),
  ].join("");
  els.result.innerHTML = `<h4>${m.allyLabel} vs ${m.enemyLabel} · ${r.seconds}초 (틱 ${r.ticks})</h4>
    <h5>공세</h5><div class="bl-grid">${off}</div>
    <h5>생존 / 회복 / 보호막</h5><div class="bl-grid">${surv}</div>`;
}

function renderMultiResult(r, m) {
  const a = r.allies[0] || {};
  const eff = r.multiEff || { singleDps: 0, ratio: 0 };
  const cards = [
    metricCard("총 피해량", fmtInt(r.totalDamage), true), metricCard("총 DPS", fmtF1(r.dps), true),
    metricCard("피해 대상 수", `${r.targetsHit}/${r.enemies.length}`, true), metricCard("총 킬 수", fmtInt(r.killCount), true),
    metricCard("첫 킬 시간", r.firstKillTime != null ? `${fmtF1(r.firstKillTime)}s` : "—"), metricCard("오버킬 손실", fmtInt(r.overkillLoss)),
    metricCard("단일 더미 DPS", fmtF1(eff.singleDps)), metricCard("다중 효율", fmtPct(eff.ratio), true),
    metricCard("스킬 발동", fmtInt(a.skillCasts)), metricCard("받은 피해", fmtInt(a.dmgTaken)),
  ].join("");
  const rows = r.enemies.map((e) => `<tr><td class="txt">${e.name}</td><td>${fmtInt(e.dmgTaken)}</td><td>${fmtInt(e.overkillTaken)}</td><td>${e.deaths}</td></tr>`).join("");
  els.result.innerHTML = `<h4>${m.allyLabel} vs ${m.enemyLabel} · ${r.seconds}초 (틱 ${r.ticks})</h4>
    <div class="bl-grid">${cards}</div>
    <h5>대상별 피해</h5><div class="bl-tablewrap"><table><thead><tr><th class="txt">적</th><th>받은 피해</th><th>오버킬</th><th>처치 수</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderPartyResult(r, m) {
  const resClass = r.result === "clear" ? "res-clear" : r.result === "wipe" ? "res-wipe" : "res-timeout";
  const resLabel = r.result === "clear" ? "클리어" : r.result === "wipe" ? "전멸" : "시간초과";
  const net = r.totalDamageTaken - r.totalHealing - r.totalShieldAbsorbed;
  const cards = [
    `<div class="bl-metric req"><div class="k">결과</div><div class="v ${resClass}">${resLabel}</div></div>`,
    metricCard("클리어 시간", r.clearTime != null ? `${fmtF1(r.clearTime)}s` : "—", true),
    metricCard("남은 HP", `${fmtInt(r.remainingHp)}/${fmtInt(r.maxHpTotal)}`, true), metricCard("남은 HP 비율", fmtPct(r.remainingHpRatio), true),
    metricCard("기절자 수", `${r.faintCount}`, true), metricCard("생존자 수", `${r.survivorCount}/${r.allies.length}`, true),
    metricCard("파티 총 피해", fmtInt(r.totalDamage)), metricCard("파티 총 회복", fmtInt(r.totalHealing)),
    metricCard("파티 보호막 흡수", fmtInt(r.totalShieldAbsorbed)), metricCard("파티 순손실", fmtInt(net)),
  ].join("");
  const rows = r.allies.map((a) => `<tr><td class="txt">${a.name}</td><td>${fmtInt(a.dmgDone)}</td><td>${fmtInt(a.healDone)}</td><td>${fmtInt(a.shieldApplied)}</td><td>${fmtInt(a.shieldBlocked)}</td><td>${fmtInt(a.dmgTaken)}</td><td>${fmtInt(a.finalHp)}/${fmtInt(a.maxHp)}</td><td>${a.isDead ? "기절" : "생존"}</td></tr>`).join("");
  els.result.innerHTML = `<h4>${m.allyLabel} vs ${m.enemyLabel} · 최대 ${r.seconds}초 (틱 ${r.ticks})</h4>
    <div class="bl-grid">${cards}</div>
    <h5>캐릭터별 기여</h5><div class="bl-tablewrap"><table><thead><tr><th class="txt">캐릭터</th><th>딜</th><th>회복</th><th>보호막부여</th><th>보호막흡수</th><th>받은피해</th><th>HP</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ── 비교표(모드 통합 누적) ─────────────────────────────────────────── */
const MODE_LABEL = { duel: "1:1", multi: "다중", party: "파티" };
// 통합 행 추출: 모드별로 채울 수 있는 값만 채우고 나머지는 null(—).
function toRow(result, meta) {
  const a = result.allies[0] || {};
  if (meta.mode === "party") {
    const net = result.totalDamageTaken - result.totalHealing - result.totalShieldAbsorbed;
    return { mode: "party", ally: meta.allyLabel, enemy: meta.enemyLabel, seconds: meta.seconds,
      dmgDone: result.totalDamage, dps: null, dmgTaken: result.totalDamageTaken, netLoss: net,
      healing: result.totalHealing, shieldAbs: result.totalShieldAbsorbed, kills: null, targets: null,
      survival: result.clearTime, outcome: result.result, remainPct: result.remainingHpRatio };
  }
  if (meta.mode === "multi") {
    return { mode: "multi", ally: meta.allyLabel, enemy: meta.enemyLabel, seconds: meta.seconds,
      dmgDone: result.totalDamage, dps: result.dps, dmgTaken: a.dmgTaken, netLoss: null,
      healing: a.healDone, shieldAbs: a.shieldBlocked, kills: result.killCount, targets: result.targetsHit,
      survival: null, outcome: result.multiEff ? "효율" + fmtPct(result.multiEff.ratio) : null, remainPct: null };
  }
  return { mode: "duel", ally: meta.allyLabel, enemy: meta.enemyLabel, seconds: meta.seconds,
    dmgDone: result.totalDamage, dps: result.dps, dmgTaken: a.dmgTaken, netLoss: netLossOf(a),
    healing: a.healDone, shieldAbs: a.shieldBlocked, kills: null, targets: null,
    survival: a.survivalTime, outcome: a.fainted ? "기절" : "생존", remainPct: null };
}
function addRow() { if (lastResult && lastMeta) { rows.push(toRow(lastResult, lastMeta)); renderTable(); } }
function clearRows() { rows.length = 0; renderTable(); }

const COMP_COLS = [
  { k: "mode", label: "모드", txt: true, get: (r) => MODE_LABEL[r.mode] },
  { k: "ally", label: "아군/파티", txt: true, get: (r) => r.ally },
  { k: "enemy", label: "적/그룹", txt: true, get: (r) => r.enemy },
  { k: "seconds", label: "시간", get: (r) => r.seconds + "초" },
  { k: "dmgDone", label: "총피해", get: (r) => dash(r.dmgDone, fmtInt) },
  { k: "dps", label: "DPS", get: (r) => dash(r.dps, fmtF1) },
  { k: "dmgTaken", label: "받은피해", get: (r) => dash(r.dmgTaken, fmtInt) },
  { k: "netLoss", label: "순손실", get: (r) => dash(r.netLoss, fmtInt) },
  { k: "healing", label: "회복", get: (r) => dash(r.healing, fmtInt) },
  { k: "shieldAbs", label: "보호막흡수", get: (r) => dash(r.shieldAbs, fmtInt) },
  { k: "kills", label: "킬", get: (r) => dash(r.kills, fmtInt) },
  { k: "targets", label: "대상", get: (r) => dash(r.targets, fmtInt) },
  { k: "survival", label: "생존/클리어", get: (r) => dash(r.survival, (v) => fmtF1(v) + "s") },
  { k: "outcome", label: "결과", get: (r) => r.outcome || "—" },
  { k: "remainPct", label: "잔여HP%", get: (r) => dash(r.remainPct, fmtPct) },
];
function renderTable() {
  if (!els) return;
  if (!rows.length) { els.table.innerHTML = `<div class="bl-empty">비교표가 비어 있습니다. 실험 후 “비교표에 추가”를 누르세요.</div>`; return; }
  const head = COMP_COLS.map((c) => `<th class="${c.txt ? "txt" : ""}">${c.label}</th>`).join("");
  const body = rows.map((r) => `<tr>${COMP_COLS.map((c) => `<td class="${c.txt ? "txt" : ""}">${c.get(r)}</td>`).join("")}</tr>`).join("");
  els.table.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* ── TSV ────────────────────────────────────────────────────────── */
const tsvRaw = (v, isNum) => (v == null ? "" : isNum ? v : v);
function tsvText() {
  const header = COMP_COLS.map((c) => c.label).join("\t");
  const lines = rows.map((r) => COMP_COLS.map((c) => {
    const raw = r[c.k];
    if (raw == null) return "";
    if (c.k === "remainPct") return Math.round(raw * 1000) / 10;       // % 원시값
    if (c.k === "dps") return Math.round(raw * 10) / 10;
    if (c.k === "seconds") return raw;
    if (c.k === "survival") return Math.round(raw * 10) / 10;
    if (typeof raw === "number") return Math.round(raw);
    if (c.k === "mode") return MODE_LABEL[raw] || raw;
    return raw;
  }).join("\t"));
  return [header, ...lines].join("\n");
}
async function copyTSV(btn) {
  if (!rows.length) return;
  const text = tsvText();
  const done = (ok) => { if (btn) { btn.textContent = ok ? "복사됨!" : "복사 실패"; setTimeout(() => { btn.textContent = "TSV 복사"; }, 1200); } };
  try { await navigator.clipboard.writeText(text); done(true); }
  catch (err) {
    try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(true); }
    catch (e2) { done(false); }
  }
}

/* ── 공개 API ───────────────────────────────────────────────────── */
export function openBalanceLab() { if (!els) build(); els.overlay.hidden = false; }
function close() { if (els) els.overlay.hidden = true; }
