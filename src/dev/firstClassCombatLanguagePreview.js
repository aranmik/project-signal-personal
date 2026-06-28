// First Class Combat Language Preview 01 — dev-only 관측 장비.
//   1차 직업 15종의 전투 언어(행동선 + FCR01 role cue + FCR02 signature + FCP01 presence)를 실제 런 없이 확인한다.
//   ★게임 FX 함수(playActionFx/clearFxLayer)를 "호출만" 한다 — gameplay/밸런스/route/loot/storage/event 무관.
//   battle.js/render.js/styles.css 무변경(이 파일 + dev html만 신설). 새 storage key 없음.
import { playActionFx, clearFxLayer } from "../ui/render.js";
import { avatarSpec, avatarFigureHTML } from "../data/avatars.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { combatRoleOf, combatRoleLabelOf, ADVANCED_JOBS } from "../data/jobs.js";

// FCP01 presence가 실제 구현된 직업(나머지는 future seed).
const PRESENCE_JOBS = new Set(["paladin", "bard", "rogue"]);

// 대표 행동선(preview 근사) — 정확한 스킬 lineType이 아니라 직업 정체성을 보여주는 샘플.
//   LINE_STYLE에 없는 키는 render.js가 straight로 폴백하므로 안전.
const FCL_LINE = {
  gatekeeper: "straight", paladin: "pierce", forbidden: "straight", wall: "pierce",
  rogue: "slash", warden: "slash",
  watchbow: "snipe", mage: "straight", tracker: "mark",
  vanguard: "pierce", trapper: "straight", bard: "support",
  healbow: "snipe", saint: "support", purifier: "support",
};
// 대표 외침(preview 샘플 — 실제 스킬명 아님).
const FCL_SHOUT = {
  gatekeeper: "수문!", paladin: "심판!", forbidden: "봉인!", wall: "버틴다!",
  rogue: "기습!", warden: "속박!",
  watchbow: "조준!", mage: "마력탄!", tracker: "표식!",
  vanguard: "돌격!", trapper: "덫!", bard: "리듬!",
  healbow: "치유사격!", saint: "가호!", purifier: "정화!",
};
// 카드 QA note(현재 감성 판정 반영).
const FCL_NOTE = {
  paladin: "PASS — 후광/자가치유 presence 적절 · 2차 성황 무침범.",
  rogue: "PASS — body 장식보다 line identity(급격히 휘어 팍 꽂히는 기습감)가 핵심.",
  bard: "PARTIAL — 행동선/효과 식별 OK. note pop이 아바타 몸통에 묻힘 → 후보=텍스트 레인 note pop(아래 비교).",
};
const ROLE_ORDER = ["tank", "melee", "ranged", "support", "healer"];
const ROLE_KO = { tank: "탱커", melee: "근접딜러", ranged: "원거리딜러", support: "서포터", healer: "힐러" };

function jobName(id) { return (UNIT_TEMPLATES.party[id] && UNIT_TEMPLATES.party[id].name) || id; }
function jobAvatarHTML(id) {
  try {
    const key = (UNIT_TEMPLATES.party[id] && UNIT_TEMPLATES.party[id].avatarKey) || id;
    const spec = avatarSpec(key);
    return avatarFigureHTML(spec.sr, spec.parts, "av-fit--cast");
  } catch (e) { return ""; }
}

const $ = (sel) => document.querySelector(sel);
const stage = () => $("#battle-field");
function setStatus(msg) { const el = $("#fcl-status"); if (el) el.textContent = msg; }
function setStageJob(id) {
  const src = $(".fcl-src");
  if (src) src.innerHTML = jobAvatarHTML(id);
  const cur = $("#fcl-cur-name");
  if (cur) cur.textContent = `${jobName(id)} (${id}) · ${ROLE_KO[combatRoleOf(id)] || "—"}`;
  clearFxLayer();
}

// 공통 cue 호출(기존 게임 payload 필드만 사용 — schema 무확장).
function baseEvent(id, extra) {
  return Object.assign({
    sourceInstanceId: "fcl-src", sourceUnitId: id, targetInstanceId: "fcl-tgt",
    lineType: FCL_LINE[id] || "straight", kind: "attack", isHeal: false, amount: 7,
  }, extra || {});
}
function playLine(id) {
  setStageJob(id); clearFxLayer();
  playActionFx(baseEvent(id));
  setStatus(`행동선: ${jobName(id)} — lineType "${FCL_LINE[id]}" + FCR01 role(${ROLE_KO[combatRoleOf(id)]}) tint + FCR02 signature(.fx-sig-${id})${PRESENCE_JOBS.has(id) ? " + FCP01 presence" : ""}`);
}
function playPresence(id) {
  setStageJob(id); clearFxLayer();
  if (PRESENCE_JOBS.has(id)) {
    // noLine + amount:0 → 행동선/숫자 없이 임팩트 + source 아바타 주변 presence(FCP01)에 집중.
    playActionFx(baseEvent(id, { noLine: true, amount: 0 }));
    const what = id === "paladin" ? "금빛 오오라 shell" : id === "bard" ? "음표 ♪♫(몸통 주변)" : "암습 잔상";
    setStatus(`presence: ${jobName(id)} — source 아바타 주변 ${what} (implemented)`);
  } else {
    setStatus(`presence: ${jobName(id)} — not yet · future seed (FCR01 role + FCR02 signature만 존재, FCP01 presence 미구현)`);
  }
}
function playTextCue(id) {
  setStageJob(id); clearFxLayer();
  playActionFx(baseEvent(id, { noLine: true, amount: 0, shoutText: FCL_SHOUT[id] || "행동", shoutKind: "attack", shoutTier: "skill" }));
  const extra = id === "bard" ? " · bard note pop(현재)은 아바타 몸통에 함께 떠 식별이 어렵다 → proposed 비교 참고" : "";
  setStatus(`text cue: ${jobName(id)} — shoutText "${FCL_SHOUT[id]}" (source 위)${extra}`);
}
// bard 개선 후보: 텍스트 레인 note pop(preview-only·gameplay 미반영). 아바타 몸통과 분리된 별도 레인에 또렷하게.
function bardProposed() {
  const lane = $("#fcl-textlane");
  if (!lane) return;
  ["♪", "♫", "♪"].forEach((g, i) => {
    const n = document.createElement("span");
    n.className = "fcl-lane-note";
    n.textContent = g;
    n.style.left = `${24 + i * 64}px`;
    n.style.animationDelay = `${i * 120}ms`;
    n.addEventListener("animationend", () => n.remove());
    lane.appendChild(n);
  });
  setStatus("proposed(bard): 텍스트 레인 note pop — preview-only · gameplay 미반영. 아바타 몸통과 분리되어 또렷하게 읽힘(개선 후보 위치).");
}

function badge(on, text) { return `<span class="fcl-badge fcl-badge--${on ? "on" : "seed"}">${text}</span>`; }
function cardHTML(id) {
  const role = combatRoleOf(id);
  const hasPresence = PRESENCE_JOBS.has(id);
  const note = FCL_NOTE[id] || `FCR01 role(${ROLE_KO[role]}) + FCR02 signature(.fx-sig-${id}). FCP01 presence는 미구현(future seed).`;
  const compare = id === "bard" ? `
    <div class="fcl-compare">
      <div class="fcl-cmp-row"><span class="fcl-cmp-k">current</span><button type="button" data-job="bard" data-act="presence">avatar/body note pop ▶</button><span class="fcl-id">아바타 몸통에 묻힘</span></div>
      <div class="fcl-cmp-row"><span class="fcl-cmp-k">proposed</span><button type="button" data-job="bard" data-act="proposed">text lane note pop ▶</button><span class="fcl-id">preview-only · gameplay 미반영</span></div>
    </div>` : "";
  return `<div class="fcl-card" data-card="${id}">
    <div class="fcl-card-head"><span class="fcl-name">${jobName(id)}</span><span class="fcl-id">${id}</span><span class="fcl-role">· ${ROLE_KO[role] || "—"}</span></div>
    <div class="fcl-badges">
      ${badge(true, `FCR01 role: ${ROLE_KO[role]}`)}
      ${badge(true, `FCR02 sig: .fx-sig-${id}`)}
      ${badge(hasPresence, hasPresence ? "FCP01 presence: body" : "FCP01: not yet · future seed")}
    </div>
    <div class="fcl-btns">
      <button type="button" data-job="${id}" data-act="line">Play line ▶</button>
      <button type="button" data-job="${id}" data-act="presence"${hasPresence ? "" : ' class="fcl-na"'}>Play presence ▶</button>
      <button type="button" data-job="${id}" data-act="text">Play text cue ▶</button>
    </div>
    <p class="fcl-note">${note}</p>
    ${compare}
  </div>`;
}

function buildList() {
  const host = $("#fcl-list");
  if (!host) return;
  const byRole = {};
  ADVANCED_JOBS.forEach((id) => { const r = combatRoleOf(id) || "etc"; (byRole[r] = byRole[r] || []).push(id); });
  let html = "";
  ROLE_ORDER.forEach((r) => {
    const jobs = byRole[r] || [];
    if (!jobs.length) return;
    html += `<div class="fcl-group-h">${ROLE_KO[r]} <span class="fcl-id">(${jobs.length})</span></div>`;
    jobs.forEach((id) => { html += cardHTML(id); });
  });
  host.innerHTML = html;
}

function wire() {
  // 카드 버튼 위임
  $("#fcl-list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-job][data-act]");
    if (!b) return;
    const id = b.dataset.job, act = b.dataset.act;
    if (act === "line") playLine(id);
    else if (act === "presence") playPresence(id);
    else if (act === "text") playTextCue(id);
    else if (act === "proposed") { setStageJob(id); bardProposed(); }
  });
  // 속도 토글(MAX 과밀 확인용)
  document.querySelector(".fcl-speed").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-speed]"); if (!b) return;
    const sp = b.dataset.speed;
    stage().dataset.speed = sp;
    document.querySelectorAll(".fcl-speed button").forEach((x) => x.classList.toggle("on", x === b));
    setStatus(`속도: ${sp} (FCX duration override 확인용 — presence/펄스가 더 짧아짐)`);
  });
}

buildList();
wire();
// 첫 직업을 stage에 미리 올려둔다(빈 화면 방지).
setStageJob(ADVANCED_JOBS[0]);
console.log("First Class Combat Language Preview — ready", { jobs: ADVANCED_JOBS.length, presence: [...PRESENCE_JOBS] });
