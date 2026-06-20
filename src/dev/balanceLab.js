// =====================================================================
// Dev Balance Lab 01 — Duel Simulator / Damage Meter (계측 전용 Dev 도구)
//
//   목적: 나라가 아군 1명 vs 적 1명을 같은 조건으로 돌려 직업별 DPS/피해/스킬 발동 등을
//         "감"이 아니라 "계측"으로 비교한다. 밸런스 조정 도구가 아니라 계측 장비다.
//   진입: ?dev=1 에서만 타이틀에 버튼 노출(main.js). 일반 플레이엔 절대 노출되지 않는다.
//   분리: 실제 전투 엔진(battle.js runDuelSimulation)을 헤드리스로 재사용 — 전투 공식/직업 스탯/
//         스킬 수치/몬스터 데이터/합체/보상/localStorage/발자취는 일절 건드리지 않는다.
//   결과: 새로고침 전까지만 유지(메모리). localStorage 미사용(01에서는 그게 더 안전).
//
//   향후 Auto Run Report 01은 같은 sim/미터 구조를 다회 주회로 확장할 수 있게 남겨둔다(이번엔 1:1만).
// =====================================================================
import { runDuelSimulation } from "../core/battle.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { BASE_JOBS, ADVANCED_JOBS, SECOND_CLASS_JOBS, combatRoleLabelOf } from "../data/jobs.js";

/* ── 선택지 카탈로그 ─────────────────────────────────────────────── */

// 아군: 기본 6 / 1차 15 / 2차 해금분 9(SR-22~30). SR-31~36은 템플릿이 없어 자연히 선택 불가.
const HERO_GROUPS = [
  { label: "기본 6종", jobs: BASE_JOBS },
  { label: "1차 15종", jobs: ADVANCED_JOBS },
  { label: "2차 (해금 SR-22~30)", jobs: SECOND_CLASS_JOBS },
];

// 실험용 더미 — Lab 내부에서만 만드는 가짜 적(본게임 UNIT_TEMPLATES는 건드리지 않는다).
//   speed:0 → 행동 게이지가 차지 않아 공격하지 않는다(순수 표적). maxHp 거대 → 죽지 않는다.
//   = "반격/사망 없이 순수 지속 공세 DPS"를 보는 기준 표적. (처형/저HP 스킬 확인은 실제 몬스터로.)
const DUMMY_TEMPLATE = {
  id: "dummy", name: "더미(무저항)", team: "enemy", type: "dummy",
  role: "front", maxHp: 100000, atk: 0, speed: 0,
};

// 적 선택지(나라 요청 우선 순서). 더미 + 새싹 숲 라인업.
const ENEMY_KEYS = ["dummy", "bear", "fox", "bird", "dewslime", "lamb", "owl", "deer", "lion"];

function enemyTemplateOf(key) {
  return key === "dummy" ? DUMMY_TEMPLATE : UNIT_TEMPLATES.enemies[key];
}
function jobName(id) { return (UNIT_TEMPLATES.party[id] && UNIT_TEMPLATES.party[id].name) || id; }
function enemyName(key) { const t = enemyTemplateOf(key); return (t && t.name) || key; }

const DURATIONS = [30, 60, 120]; // 측정 시간(x2 환산 게임 초)

// 기본 프리셋(처음 열었을 때 바로 비교 가능).
const PRESETS = [
  { heroJob: "warrior",    enemyKey: "bear", seconds: 30 },
  { heroJob: "rogue",      enemyKey: "bear", seconds: 30 },
  { heroJob: "swordsaint", enemyKey: "bear", seconds: 30 },
  { heroJob: "warrior",    enemyKey: "lion", seconds: 60 },
  { heroJob: "rogue",      enemyKey: "lion", seconds: 60 },
];

/* ── 결과 지표 정의(결과 패널 + 비교표 + TSV 공용) ───────────────── */
// key = result 필드, label = 표시명, fmt = 표시 포맷, req = 필수 지표(강조), col = 비교표/TSV 포함.
const METRICS = [
  { key: "totalDamage",  label: "총 피해량",     fmt: "int", req: true,  col: true },
  { key: "dps",          label: "DPS",           fmt: "f1",  req: true,  col: true },
  { key: "attacks",      label: "공격 횟수",     fmt: "int", req: true,  col: true },
  { key: "avgDamage",    label: "평균 피해",     fmt: "f1",  req: false, col: false },
  { key: "maxDamage",    label: "최대 피해",     fmt: "int", req: false, col: false },
  { key: "crits",        label: "치명 횟수",     fmt: "int", req: true,  col: true },
  { key: "skillCasts",   label: "스킬 발동",     fmt: "int", req: true,  col: true },
  { key: "skillDamage",  label: "스킬 피해량",   fmt: "int", req: false, col: false },
  { key: "damageTaken",  label: "받은 피해량",   fmt: "int", req: true,  col: true },
  { key: "dpsTaken",     label: "받은 DPS",      fmt: "f1",  req: true,  col: true },
  { key: "shieldBlocked",label: "보호막 막음",   fmt: "int", req: false, col: false },
  { key: "heal",         label: "회복량",        fmt: "int", req: false, col: false },
];

const fmtInt = (n) => Math.round(n || 0).toLocaleString("en-US");
const fmtF1 = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
function fmtVal(v, fmt) { return fmt === "f1" ? fmtF1(v) : fmtInt(v); }
// TSV용 원시 숫자(천단위 구분 없음 — 스프레드시트 붙여넣기용).
function rawVal(v, fmt) { return fmt === "f1" ? (Math.round((v || 0) * 10) / 10) : Math.round(v || 0); }

/* ── 모듈 상태(메모리 전용 — localStorage 미사용) ──────────────────── */
let els = null;                                   // 캐시한 DOM 참조(지연 생성)
let sel = { heroJob: "warrior", enemyKey: "bear", seconds: 30 };
let lastResult = null;                            // 직전 실험 결과
let lastMeta = null;                              // 직전 실험의 조건(아군/적/시간)
const rows = [];                                  // 비교표 누적 행

/* ── 스타일(1회 주입, Dev 전용 — styles.css 오염 없음) ─────────────── */
const STYLE = `
#balancelab-overlay{position:fixed;inset:0;z-index:300;display:flex;align-items:flex-start;justify-content:center;
  background:rgba(6,10,14,0.82);overflow:auto;padding:18px 10px;}
#balancelab-overlay[hidden]{display:none;}
#balancelab-card{width:min(880px,100%);background:#11161d;border:1px solid #2c3a46;border-radius:14px;
  box-shadow:0 18px 60px rgba(0,0,0,0.55);color:#dfe9f2;font-size:13px;line-height:1.45;}
#balancelab-card .bl-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #243039;}
#balancelab-card .bl-title{font-weight:800;font-size:14px;letter-spacing:.02em;}
#balancelab-card .bl-tag{font-size:10px;font-weight:800;color:#7fd1a8;border:1px solid #2f5e47;
  background:rgba(60,180,120,.1);border-radius:999px;padding:2px 8px;}
#balancelab-card .bl-x{margin-left:auto;background:none;border:none;color:#9fb3c4;font-size:18px;cursor:pointer;line-height:1;}
#balancelab-card .bl-body{padding:12px 14px;}
#balancelab-card .bl-note{font-size:11px;color:#9fb3c4;margin:0 0 10px;}
#balancelab-card .bl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;}
#balancelab-card .bl-row .bl-lab{font-size:11px;color:#8aa0b2;min-width:46px;}
#balancelab-card select{background:#1b232c;color:#e7f0f7;border:1px solid #34434f;border-radius:8px;
  padding:7px 8px;font-size:13px;min-width:150px;}
#balancelab-card .bl-seg{display:inline-flex;border:1px solid #34434f;border-radius:8px;overflow:hidden;}
#balancelab-card .bl-seg button{background:#1b232c;color:#cfe0ee;border:none;padding:7px 12px;font-size:13px;cursor:pointer;}
#balancelab-card .bl-seg button.on{background:#2f6fb0;color:#fff;font-weight:800;}
#balancelab-card .bl-btn{border:1px solid #3a5a76;border-radius:8px;background:#23415b;color:#eaf3fb;
  padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;}
#balancelab-card .bl-btn:active{transform:translateY(1px);}
#balancelab-card .bl-btn.run{background:#2f7d50;border-color:#3c8f60;}
#balancelab-card .bl-btn.ghost{background:#1b232c;color:#cfe0ee;}
#balancelab-card .bl-presets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
#balancelab-card .bl-presets button{font-size:11px;padding:6px 9px;border:1px dashed #3a5a76;border-radius:8px;
  background:rgba(60,120,180,.08);color:#bcd6ec;cursor:pointer;}
#balancelab-card .bl-result{border:1px solid #28333d;border-radius:10px;padding:10px;margin:6px 0 12px;background:#0d1217;}
#balancelab-card .bl-result h4{margin:0 0 8px;font-size:12px;color:#bcd6ec;font-weight:700;}
#balancelab-card .bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;}
#balancelab-card .bl-metric{background:#151c24;border:1px solid #232e38;border-radius:8px;padding:7px 9px;}
#balancelab-card .bl-metric.req{border-color:#39597a;}
#balancelab-card .bl-metric .k{font-size:10px;color:#8aa0b2;}
#balancelab-card .bl-metric .v{font-size:16px;font-weight:800;color:#eef6ff;}
#balancelab-card .bl-metric.req .v{color:#bfe3ff;}
#balancelab-card .bl-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
#balancelab-card .bl-tablewrap{overflow-x:auto;border:1px solid #28333d;border-radius:10px;}
#balancelab-card table{border-collapse:collapse;width:100%;font-size:12px;white-space:nowrap;}
#balancelab-card th,#balancelab-card td{padding:6px 8px;border-bottom:1px solid #222c35;text-align:right;}
#balancelab-card th:first-child,#balancelab-card td:first-child,
#balancelab-card th.txt,#balancelab-card td.txt{text-align:left;}
#balancelab-card thead th{position:sticky;top:0;background:#1a232c;color:#9fb8cc;font-weight:700;}
#balancelab-card tbody tr:nth-child(odd){background:rgba(255,255,255,.015);}
#balancelab-card .bl-empty{color:#7990a2;font-size:12px;padding:10px;text-align:center;}
#balancelab-card .bl-foot{font-size:10px;color:#6f8497;margin-top:8px;}
`;

function injectStyle() {
  if (document.getElementById("balancelab-style")) return;
  const s = document.createElement("style");
  s.id = "balancelab-style";
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/* ── DOM 빌드(1회) ───────────────────────────────────────────────── */
function heroSelectHTML() {
  const groups = HERO_GROUPS.map((g) => {
    const opts = g.jobs
      .filter((id) => UNIT_TEMPLATES.party[id])
      .map((id) => {
        const role = combatRoleLabelOf(id);
        const label = role ? `${jobName(id)} · ${role}` : jobName(id);
        return `<option value="${id}"${id === sel.heroJob ? " selected" : ""}>${label}</option>`;
      }).join("");
    return `<optgroup label="${g.label}">${opts}</optgroup>`;
  }).join("");
  return `<select id="bl-hero">${groups}</select>`;
}
function enemySelectHTML() {
  const opts = ENEMY_KEYS.map((k) => {
    const t = enemyTemplateOf(k);
    const note = k === "dummy" ? "무저항·불사" : `HP ${t.maxHp}/공 ${t.atk}`;
    return `<option value="${k}"${k === sel.enemyKey ? " selected" : ""}>${enemyName(k)} (${note})</option>`;
  }).join("");
  return `<select id="bl-enemy">${opts}</select>`;
}
function durationSegHTML() {
  return `<span class="bl-seg" id="bl-dur">${DURATIONS.map((d) =>
    `<button type="button" data-dur="${d}" class="${d === sel.seconds ? "on" : ""}">${d}초</button>`).join("")}</span>`;
}
function presetsHTML() {
  return PRESETS.map((p, i) =>
    `<button type="button" data-preset="${i}">${jobName(p.heroJob)} vs ${enemyName(p.enemyKey)} · ${p.seconds}초</button>`
  ).join("");
}

function build() {
  injectStyle();
  const overlay = document.createElement("div");
  overlay.id = "balancelab-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div id="balancelab-card">
      <div class="bl-head">
        <span class="bl-title">🧪 Balance Lab — Duel Simulator</span>
        <span class="bl-tag">계측 전용 · 밸런스 조정 아님</span>
        <button type="button" class="bl-x" data-bl-close aria-label="닫기">✕</button>
      </div>
      <div class="bl-body">
        <p class="bl-note">아군 1 vs 적 1을 같은 조건으로 돌려 직업별 수치를 비교합니다. 실제 전투 엔진을 그대로 사용하며,
          본게임 진행/스탯/저장에는 전혀 영향을 주지 않습니다. 측정 시간은 x2 배속 환산 기준입니다.</p>
        <div class="bl-presets" data-bl-presets>${presetsHTML()}</div>
        <div class="bl-row">
          <span class="bl-lab">아군</span>${heroSelectHTML()}
          <span class="bl-lab">적</span>${enemySelectHTML()}
        </div>
        <div class="bl-row">
          <span class="bl-lab">시간</span>${durationSegHTML()}
          <button type="button" class="bl-btn run" data-bl-run>실험 실행 ▶</button>
        </div>
        <div class="bl-result" data-bl-result></div>
        <div class="bl-actions">
          <button type="button" class="bl-btn" data-bl-add>＋ 비교표에 추가</button>
          <button type="button" class="bl-btn ghost" data-bl-copy>TSV 복사</button>
          <button type="button" class="bl-btn ghost" data-bl-clear>비교표 초기화</button>
        </div>
        <div class="bl-tablewrap" data-bl-table></div>
        <p class="bl-foot">결과는 새로고침 전까지만 유지됩니다(저장 안 함). 같은 조건도 치명/랜덤으로 실행마다 약간 달라집니다 — 여러 번 돌려 보세요.</p>
      </div>
    </div>`;
  (document.getElementById("game-frame") || document.body).appendChild(overlay);

  els = {
    overlay,
    hero: overlay.querySelector("#bl-hero"),
    enemy: overlay.querySelector("#bl-enemy"),
    dur: overlay.querySelector("#bl-dur"),
    result: overlay.querySelector("[data-bl-result]"),
    table: overlay.querySelector("[data-bl-table]"),
    presets: overlay.querySelector("[data-bl-presets]"),
  };
  wire(overlay);
  renderResult();
  renderTable();
}

/* ── 이벤트 배선 ─────────────────────────────────────────────────── */
function wire(overlay) {
  els.hero.addEventListener("change", (e) => { sel.heroJob = e.target.value; });
  els.enemy.addEventListener("change", (e) => { sel.enemyKey = e.target.value; });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-bl-close]")) { close(); return; }
    const durBtn = e.target.closest("[data-dur]");
    if (durBtn) { setDuration(Number(durBtn.dataset.dur)); return; }
    const preset = e.target.closest("[data-preset]");
    if (preset) { applyPreset(Number(preset.dataset.preset)); return; }
    if (e.target.closest("[data-bl-run]")) { runExperiment(); return; }
    if (e.target.closest("[data-bl-add]")) { addRow(); return; }
    if (e.target.closest("[data-bl-clear]")) { clearRows(); return; }
    if (e.target.closest("[data-bl-copy]")) { copyTSV(e.target.closest("[data-bl-copy]")); return; }
  });
}

function setDuration(d) {
  sel.seconds = d;
  els.dur.querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.dur) === d));
}

function applyPreset(i) {
  const p = PRESETS[i];
  if (!p) return;
  sel = { ...p };
  els.hero.value = sel.heroJob;
  els.enemy.value = sel.enemyKey;
  setDuration(sel.seconds);
  runExperiment(); // 프리셋은 바로 실행해 결과를 보여준다
}

/* ── 실험 실행 + 결과 렌더 ───────────────────────────────────────── */
function runExperiment() {
  const tmpl = enemyTemplateOf(sel.enemyKey);
  const r = runDuelSimulation({ heroJob: sel.heroJob, enemyTemplate: tmpl, seconds: sel.seconds });
  if (!r) { lastResult = null; lastMeta = null; renderResult(); return; }
  lastResult = r;
  lastMeta = { heroJob: sel.heroJob, enemyKey: sel.enemyKey, seconds: sel.seconds };
  renderResult();
}

function renderResult() {
  if (!els) return;
  if (!lastResult) {
    els.result.innerHTML = `<div class="bl-empty">실험을 실행하면 결과가 여기에 표시됩니다.</div>`;
    return;
  }
  const r = lastResult;
  const head = `${jobName(lastMeta.heroJob)} vs ${enemyName(lastMeta.enemyKey)} · ${r.seconds}초 (게임 틱 ${r.ticks})`;
  const cells = METRICS.map((m) =>
    `<div class="bl-metric${m.req ? " req" : ""}"><div class="k">${m.label}</div><div class="v">${fmtVal(r[m.key], m.fmt)}</div></div>`
  ).join("");
  els.result.innerHTML = `<h4>${head}</h4><div class="bl-grid">${cells}</div>`;
}

/* ── 비교표 ─────────────────────────────────────────────────────── */
const COL_METRICS = METRICS.filter((m) => m.col);

function addRow() {
  if (!lastResult || !lastMeta) return;
  rows.push({
    heroName: jobName(lastMeta.heroJob),
    enemyName: enemyName(lastMeta.enemyKey),
    seconds: lastResult.seconds,
    result: lastResult,
  });
  renderTable();
}
function clearRows() { rows.length = 0; renderTable(); }

function renderTable() {
  if (!els) return;
  if (rows.length === 0) {
    els.table.innerHTML = `<div class="bl-empty">비교표가 비어 있습니다. 실험 후 “비교표에 추가”를 누르세요.</div>`;
    return;
  }
  const head = `<tr><th class="txt">아군</th><th class="txt">적</th><th>시간</th>${
    COL_METRICS.map((m) => `<th>${m.label}</th>`).join("")}</tr>`;
  const body = rows.map((row) => {
    const r = row.result;
    return `<tr><td class="txt">${row.heroName}</td><td class="txt">${row.enemyName}</td><td>${row.seconds}초</td>${
      COL_METRICS.map((m) => `<td>${fmtVal(r[m.key], m.fmt)}</td>`).join("")}</tr>`;
  }).join("");
  els.table.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function tsvText() {
  const header = ["아군", "적", "시간(초)", ...COL_METRICS.map((m) => m.label)].join("\t");
  const lines = rows.map((row) => {
    const r = row.result;
    return [row.heroName, row.enemyName, row.seconds, ...COL_METRICS.map((m) => rawVal(r[m.key], m.fmt))].join("\t");
  });
  return [header, ...lines].join("\n");
}

async function copyTSV(btn) {
  if (rows.length === 0) return;
  const text = tsvText();
  const done = (ok) => {
    if (!btn) return;
    btn.textContent = ok ? "복사됨!" : "복사 실패";
    setTimeout(() => { btn.textContent = "TSV 복사"; }, 1200);
  };
  try {
    await navigator.clipboard.writeText(text);
    done(true);
  } catch (err) {
    // 클립보드 권한 불가 시 폴백(모바일 호환) — footprints 복사와 동일 패턴.
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done(true);
    } catch (e2) { done(false); }
  }
}

/* ── 공개 API ───────────────────────────────────────────────────── */
export function openBalanceLab() {
  if (!els) build();
  els.overlay.hidden = false;
}
function close() { if (els) els.overlay.hidden = true; }
