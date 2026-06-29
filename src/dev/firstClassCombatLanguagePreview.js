// First Class Combat Language Preview 01 — dev-only 관측 장비.
//   1차 직업 15종의 전투 언어(행동선 + FCR01 role cue + FCR02 signature + FCP01 presence)를 실제 런 없이 확인한다.
//   ★게임 FX 함수(playActionFx/clearFxLayer)를 "호출만" 한다 — gameplay/밸런스/route/loot/storage/event 무관.
//   battle.js/render.js/styles.css 무변경(이 파일 + dev html만 신설). 새 storage key 없음.
import { playActionFx, playSupportFx, clearFxLayer } from "../ui/render.js";
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
  bard: "Dual Note Grammar — ①body note bloom(주체·머리 위에서 대각선 bloom, 시작 raise로 몸통 안 묻힘) + ②text lane note flow(전달·rhythm 순간 분리 lane에서 촤라랑). 둘 다 살림.",
};
const ROLE_ORDER = ["tank", "melee", "ranged", "support", "healer"];
const ROLE_KO = { tank: "탱커", melee: "근접딜러", ranged: "원거리딜러", support: "서포터", healer: "힐러" };

// Combat Language Grammar 01 — 공통 문법 8요소(legend). 상세: docs/17_COMBAT_LANGUAGE_GRAMMAR.md
const FCL_GRAMMAR = [
  ["Start", "누가 행동을 시작했는가 — source/actor"],
  ["Line", "어디로 향하는가 — 공격/지원/회복/방해별 색·궤도·속도"],
  ["End", "어디에 도착했는가 — 적=피격/착탄·아군=적용 (정보 과밀 금지)"],
  ["Self", "나에게 — 자기 치유/강화/보호 = source 주변 aura/body"],
  ["Target", "적에게 — 피격/착탄/표식/방해 = target 주변 hit/apply"],
  ["Ally", "아군에게 — 회복/정화/보호/지원 = 아군 대상 주변"],
  ["Delivery", "전장/아군으로 퍼지는 전달감 (지원/리듬/장판형)"],
  ["Identity FX", "직업 개성 — 위 슬롯 중 어디에 붙는지 명확해야 함"],
];
// 직업별 문법 앵커(Identity FX가 붙는 슬롯) + 상태. state: success/good/issue/candidate/seed.
//   ★문서/표시용 기준 — 실제 FX 변경 아님(이번 작업은 기준 정리). 상세는 docs/17.
const FCL_ANCHOR = {
  bard:       { tags: ["Body", "Delivery"], state: "success", note: "성공 사례 — body bloom(주체) + text lane flow(전달)." },
  paladin:    { tags: ["Self", "End"], state: "good", note: "Self aura good. End marker cleanup(작업 중·Preview Iteration): 주황 도착 X 제거 → hit ring(.fx-target) + holy mark(::before 십자, 약간 키움) 중심. Start/Line/Self 유지." },
  rogue:      { tags: ["Line", "Identity"], state: "good", note: "Line identity good(급격히 휘어 팍 꽂힘) → 후속 Full Afterimage Probe(이번 미수정)." },
  mage:       { tags: ["End", "Area"], state: "candidate", note: "End/Area Shockwave 후보(Hanabi는 2차/특수 AoE로 보존)." },
  purifier:   { tags: ["Ally"], state: "candidate", note: "Ally Cleanse 후보." },
  gatekeeper: { tags: ["Target", "Self", "Taunt"], state: "candidate", note: "Target/Self/Taunt 후보(01B) — 실제 능력=도발. 적 의도를 수문장으로 redirect + 머리위 '!'(preview-only · gameplay 미반영). Guard 01 관문 mismatch 폐기." },
  forbidden:  { tags: ["Target", "Bond", "Seal"], state: "candidate", note: "Target/Bond/Seal 후보(01B) — 실제 능력=악의 결속. 금제 피격 시 ≈40% 전가(붉은 결속선)+봉인 링(preview-only · gameplay 미반영)." },
  wall:       { tags: ["Ally", "Bond", "Protection"], state: "candidate", note: "Ally/Bond/Protection 후보(01B) — 실제 능력=선의 결속. 지정 아군 50% 대신맞기+보호막(금빛 결속선)(preview-only · gameplay 미반영). Guard 01 돌벽 mismatch 폐기." },
  warden:     { tags: ["Target", "Gauge", "Weaken"], state: "candidate", note: "Target/Gauge/Weaken 후보(01) — 습격: 게이지 높은 적 게이지 40% 드레인 + 약화 2턴(preview-only · gameplay 미반영). Rogue 처형/Tracker 표식과 구분." },
  watchbow:   { tags: ["Trigger", "Ally", "Counter"], state: "candidate", note: "Trigger/Ally/Counter 후보(01) — 반응형 보복: 후열 아군 피격 시 즉시 공격자에 원거리 counter(preview-only · gameplay 미반영). Tracker 표식/추적과 구분." },
  tracker:    { tags: ["Target"], state: "seed", note: "" },
  vanguard:   { tags: ["Line", "Ally", "Advance"], state: "candidate", note: "Line/Ally/Advance 후보(01) — 진군: 전열 적 AoE + 전열 아군 방어증가(preview-only · gameplay 미반영). 마도 광역/성벽 결속/수문장 도발과 구분." },
  trapper:    { tags: ["Target", "Status", "Venom"], state: "candidate", note: "Target/Status/Venom 후보(01) — 중독: 적 2명 2턴 상태이상(preview-only · gameplay 미반영). Tracker 표식/Mage 광역/Forbidden 결속과 구분." },
  healbow:    { tags: ["Line", "Target", "Ally"], state: "candidate", note: "Line/Target/Ally 후보(01) — 치유사격: 적 1명 저격 + 다친 아군 1명 회복(preview-only · gameplay 미반영). Watchbow counter/Saint 2인/Purifier 정화와 구분." },
  saint:      { tags: ["Ally", "Delivery", "Heal"], state: "candidate", note: "Ally/Delivery/Heal 후보(01) — 쌍치유: 저체력 아군 2명 동시 회복(preview-only · gameplay 미반영). Healbow 1인+공격/Purifier 정화/Paladin 자가회복과 구분." },
};
const ANCHOR_STATE_LABEL = { success: "✅ 성공 사례", good: "✅ good", issue: "⚠ 이슈", candidate: "후보", seed: "future seed" };

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
  const ally = $(".fcl-ally");
  if (ally) ally.hidden = true; // ally 샘플은 purifier cleanse에서만 노출
  const cur = $("#fcl-cur-name");
  if (cur) cur.textContent = `${jobName(id)} (${id}) · ${ROLE_KO[combatRoleOf(id)] || "—"}`;
  clearFxLayer();
}

// Coverage 02 — fx-layer 기준 좌표(preview-only FX 배치용). unitPoint와 동등하되 dev 페이지 내부 계산.
function fclPoint(iid) {
  const el = document.querySelector(`#unit-layer [data-instance-id="${iid}"]`);
  const layer = $("#fx-layer");
  if (!el || !layer) return null;
  const r = el.getBoundingClientRect(), lr = layer.getBoundingClientRect();
  return { x: r.left - lr.left + r.width / 2, y: r.top - lr.top + r.height / 2 };
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
// Bard Presence 02 — 음악 전달 FX(전달 layer)를 "실제로" 재생한다.
//   caster를 hero-bard-N 형식으로 둬 render.js의 isBardInstance/spawnBardNoteFlow가 그대로 발동(실 게임 rhythm 경로와 동일).
//   실 게임에선 바드 rhythm(playSupportFx, casterInstanceId=hero-bard-1) 순간에 자동 발동 — 프리뷰는 그 경로를 호출만.
function bardDelivery() {
  const src = $(".fcl-src");
  if (src) { src.dataset.instanceId = "hero-bard-1"; src.innerHTML = jobAvatarHTML("bard"); }
  clearFxLayer();
  playSupportFx({ casterInstanceId: "hero-bard-1", text: "리듬!", kind: "buff" }); // 동기 spawn(아바타 위쪽 분리 lane으로 촤라랑)
  if (src) src.dataset.instanceId = "fcl-src"; // 즉시 복원(다른 카드 버튼은 fcl-src 사용)
  const lane = $("#fcl-textlane"); // 참고: "완전히 분리된 레인" 감각(나라 호평)을 별도 strip에도 미러
  if (lane) ["♪", "♫", "♪"].forEach((g, i) => {
    const n = document.createElement("span");
    n.className = "fcl-lane-note"; n.textContent = g;
    n.style.left = `${24 + i * 64}px`; n.style.animationDelay = `${i * 120}ms`;
    n.addEventListener("animationend", () => n.remove());
    lane.appendChild(n);
  });
  const cur = $("#fcl-cur-name"); if (cur) cur.textContent = `${jobName("bard")} (bard) · 서포터`;
  setStatus("전달(text lane note flow): 바드 위쪽(아바타와 분리)에서 음표 3개가 촤라랑 흐름 — 실 게임 rhythm(playSupportFx) 순간에 자동 발동.");
}

// Coverage 02 — 직업별 추가 샘플 버튼(End/Area·Ally/Cleanse 등). preview-only 후보 vs 실 FX 구분.
const FCL_EXTRA = {
  mage: { act: "mage-area", label: "Play area / shockwave ▶", tag: "preview-only 후보",
    desc: "End/Area 후보 — 적 진영을 아우르는 쇼크웨이브. End 착탄(실 FX) 후 중심 flash + outward ring 3겹이 적 진영 전역으로 넓게 퍼짐(preview-only). ※기존 마도/현자 충전 AoE(Mage Hanabi)는 별개 2차/특수 연출." },
  purifier: { act: "purifier-cleanse", label: "Play ally cleanse ▶", tag: "preview-only 후보",
    desc: "Ally/Cleanse 후보 — 아군에게 즉시 꽂히는 맑은 정화. 적이 아니라 아군(샘플)에게 직선 정화 선 + 닿아 퍼지는 세척 ring(preview-only). heal mint/성기사 holy와 구분되는 투명한 청록 정화감." },
  // Guard Grammar Preview 01B — 실제 구현 능력(도발/선의 결속/악의 결속) 기반 재정렬. 전부 preview-only · gameplay 미반영 · battle/event/storage 무관.
  //   ★Guard 01 관문(gate)·돌벽(barrier) 후보는 실제 능력과 mismatch(나라 판정)라 폐기 — 버튼/FX 제거. 봉인 링은 금제 후보로 재사용.
  gatekeeper: { act: "gatekeeper-taunt", label: "Play taunt / redirect ▶", tag: "preview-only 후보",
    desc: "Target/Self/Taunt 후보 — 실제 능력=도발(taunt). 적 2~3명 머리 위 노랑 '!' + 적이 아군을 노리던 공격 의도가 수문장으로 꺾임(redirect) + 수문장 주목 펄스(preview-only). 관문 설치가 아니라 '적의 공격 의도를 자신에게 고정'. ※Guard 01 철 관문 후보는 mismatch라 폐기." },
  wall: { act: "wall-bond", label: "Play bond / protect ▶", tag: "preview-only 후보",
    desc: "Ally/Bond/Protection 후보 — 실제 능력=선의 결속(goodbond). 성벽↔지정 아군 금빛 결속선+자물쇠 + 아군 보호 링 + 아군 피격 시 피해가 둘로 나뉨(아군 일부 / 성벽 대신맞기)(preview-only). 물리 벽이 아니라 '너를 방어해준다'. ※Guard 01 돌벽 slab 후보는 mismatch라 폐기." },
  forbidden: { act: "forbidden-evilbond", label: "Play evil bond / transfer ▶", tag: "preview-only 후보",
    desc: "Target/Bond/Seal 후보 — 실제 능력=악의 결속(evilbond). 적 봉인 링(유지) + 금제↔적 붉은 결속선+자물쇠 + 금제 피격 시 받은 피해 일부가 결속 적에게 전가('금제가 맞았는데 적도 깎인다')(preview-only). holy 금십자·cleanse 청록과 구분되는 붉은 결속." },
  // Watchbow Riposte Preview 01 — 반응형 보복 인과(후열 아군 피격→감지→반응→공격자 보복). preview-only · gameplay 미반영.
  watchbow: { act: "watchbow-riposte", label: "Play riposte / counter ▶", tag: "preview-only 후보",
    desc: "Trigger/Ally/Counter 후보 — 실제 능력=보복(riposte·반응형). 후열 아군이 피격되면 파수궁이 즉시 1회 공격자에게 원거리 보복. preview는 인과(아군 피격→파수궁 감지→조준/반격 준비→공격자 보복)를 한 흐름으로 보여줌(preview-only). Tracker 표식/추적(적에 붙는 점선 mark→추격)과 달리 '감지→반응→counter'(파수궁 자신 반응·녹색 ranged 보복)." },
  // Vanguard / Trapper Grammar Preview 01 — 선봉 진군(전열 압박+전열 방어증가) / 덫꾼 중독(2대상 상태). preview-only · gameplay 미반영.
  vanguard: { act: "vanguard-advance", label: "Play advance / brace ▶", tag: "preview-only 후보",
    desc: "Line/Ally/Advance 후보 — 실제 능력=진군(advance). 전열 적 AoE(×0.9) + 전열 아군 방어 증가. preview는 선봉 전진(주황 chevron) → 적 전열 2명 타격 + 동시에 아군 전열 brace(하늘 방패 호)를 한 흐름으로(preview-only). 마도 광역 shockwave/성벽 1명 결속/수문장 도발과 구분=전열 압박+전열 방어." },
  trapper: { act: "trapper-venom", label: "Play venom / trap ▶", tag: "preview-only 후보",
    desc: "Target/Status/Venom 후보(Scale Tuning) — 실제 능력=중독(venom). 적 최대 2명에 중독 2턴. preview는 적 2명에 낮은 독 적용선 + 발밑 snare ring(적용) + 몸통에 크게 부푸는 보라 독방울 3개(상태 유지·몸통 점유↑)(preview-only). Tracker 1명 조준 표식/Mage 광역/Forbidden 결속과 구분=적 2명 상태이상 부여." },
  // Healbow / Saint Grammar Preview 01 — 치유궁(적 저격+아군1 회복) / 성직자(아군2 동시 회복). preview-only · gameplay 미반영.
  healbow: { act: "healbow-shotheal", label: "Play shot / heal ▶", tag: "preview-only 후보",
    desc: "Line/Target/Ally 후보 — 실제 능력=치유사격(healshot). 적 1명 저격 + 다친 아군 1명 회복. preview는 녹색 실선 저격(적 hit) → 공통 치유 문법(민트 점선 곡선 회복선 + End 치유 십자 + 뾰로롱 sparkle)으로 아군1 회복(preview-only). Watchbow 점선 counter/Purifier 직선 cleanse/Paladin 금빛 자가회복과 구분=공격 대상+회복 대상 분리." },
  saint: { act: "saint-dualheal", label: "Play dual heal ▶", tag: "preview-only 후보",
    desc: "Ally/Delivery/Heal 후보 — 실제 능력=쌍치유(dualheal). 저체력 아군 2명 회복. preview는 성직자 회복 glow → 아군 2명에게 거의 동시 공통 치유 문법(민트 점선 곡선 회복선 + 각 End 치유 십자 + 뾰로롱 sparkle)(preview-only). 순수 2인 회복. Healbow 1인+공격/Purifier 직선 cleanse/Paladin 금빛 자가회복과 구분." },
  // Warden Raid Preview 01 — 게이지 높은 적 습격 → 게이지 드레인 + 약화. preview-only · gameplay 미반영.
  warden: { act: "warden-raid", label: "Play raid / drain ▶", tag: "preview-only 후보",
    desc: "Target/Gauge/Weaken 후보 — 실제 능력=습격(raid). 게이지 높은 적 1명 공격 + 게이지 40% 드레인 + 약화 2턴. preview는 높은 게이지 적 식별(파랑 게이지 바) → 습격선(올리브그린) → 게이지 드레인(파랑 조각 아래로·-40%) + 약화 마커(회색)를 한 흐름으로(preview-only). Rogue 처형/Tracker 표식추적/Watchbow counter/Trapper 독/Gatekeeper 도발과 구분=게이지 높은 적 제어." },
};

// Coverage 02 — mage End/Area: 실 게임 Line+End 착탄(playActionFx) 후, preview-only 쇼크웨이브(flash + outward ring 2)로 Area를 본다.
function mageArea() {
  setStageJob("mage"); clearFxLayer();
  playActionFx(baseEvent("mage", { lineType: "straight", amount: 7 })); // 실 FX: Line + End 착탄
  const layer = $("#fx-layer"); const p = fclPoint("fcl-tgt");
  if (layer && p) setTimeout(() => {   // 착탄(End) 직후 Area가 퍼지게
    const flash = document.createElement("span");
    flash.className = "fcl-shock-flash"; flash.style.left = `${p.x}px`; flash.style.top = `${p.y}px`;
    flash.addEventListener("animationend", () => flash.remove()); layer.appendChild(flash);
    // Coverage 02B — outward ring 3겹(stagger)이 적 진영 전역으로 넓게 퍼지게(단일 적 1명 느낌 완화).
    [["", 0], ["fcl-shock-ring--b", 130], ["fcl-shock-ring--c", 260]].forEach(([cls, d]) => {
      const ring = document.createElement("span");
      ring.className = "fcl-shock-ring" + (cls ? " " + cls : "");
      ring.style.left = `${p.x}px`; ring.style.top = `${p.y}px`; ring.style.animationDelay = `${d}ms`;
      ring.addEventListener("animationend", () => ring.remove()); layer.appendChild(ring);
    });
  }, 230);
  setStatus("mage End/Area 후보: Line→End 착탄(실 FX) 후 중심 flash + outward ring 3겹이 '적 진영 전역'으로 넓게 퍼짐(preview-only 후보 · gameplay 미반영). 단일 적이 아니라 적 전장을 아우르는 Area.");
}

// Coverage 02 — purifier Ally/Cleanse: ally 샘플 노출 + src→ally 맑은 정화 선 + ally 세척 ring(전부 preview-only).
function purifierCleanse() {
  setStageJob("purifier");
  const ally = $(".fcl-ally"); if (ally) ally.hidden = false;
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const a = fclPoint("fcl-ally");
  if (layer && s && a) {
    const line = document.createElement("span");
    line.className = "fcl-cleanse-line";
    const dx = a.x - s.x, dy = a.y - s.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    line.style.left = `${s.x}px`; line.style.top = `${s.y}px`; line.style.width = `${len}px`; line.style.transform = `rotate(${ang}deg)`;
    line.addEventListener("animationend", () => line.remove()); layer.appendChild(line);
    setTimeout(() => {
      const ring = document.createElement("span");
      ring.className = "fcl-cleanse-ring"; ring.style.left = `${a.x}px`; ring.style.top = `${a.y}px`;
      ring.addEventListener("animationend", () => ring.remove()); layer.appendChild(ring);
    }, 190);
  }
  const cur = $("#fcl-cur-name"); if (cur) cur.textContent = `${jobName("purifier")} (purifier) · 힐러`;
  setStatus("purifier Ally/Cleanse 후보: 적이 아니라 아군(샘플)에게 즉시 꽂히는 직선 정화 선 + 더 크게 닿아 퍼지는 세척 ring(preview-only 후보 · gameplay 미반영). 정화사는 'Ally에 적용되는 읽힘'이 핵심.");
}

// Guard Grammar Preview 01B — preview-only 보조 헬퍼(전부 DOM 직접 생성·게임 함수/payload 무관).
function fclAppend(layer, el) { el.addEventListener("animationend", () => el.remove()); layer.appendChild(el); return el; }
function fclLineEl(cls, p1, p2) { // 두 점 사이 선/화살(각도·길이 계산). transform=rotate(inline)·애니는 opacity만이라 보존됨.
  const el = document.createElement("span"); el.className = cls;
  const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
  el.style.left = `${p1.x}px`; el.style.top = `${p1.y}px`; el.style.width = `${len}px`; el.style.transform = `rotate(${ang}deg)`;
  return el;
}
function fclAt(cls, p, text) { // 한 점에 마커/숫자/링 배치.
  const el = document.createElement("span"); el.className = cls; if (text != null) el.textContent = text;
  el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; return el;
}
function fclMid(p1, p2) { return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }; }
// Healer Delivery Grammar Tuning 01 — 공통 치유 delivery: 민트 곡선 점선(SVG quadratic) + 대상 '뾰로롱' sparkle. preview-only.
const FCL_SVG_NS = "http://www.w3.org/2000/svg";
function fclHealCurve(layer, p1, p2) { // src→대상 위로 휜 곡선 점선 회복선(정화사 직선과 구분).
  const w = layer.clientWidth, h = layer.clientHeight;
  const svg = document.createElementNS(FCL_SVG_NS, "svg");
  svg.setAttribute("class", "fcl-heal-curve");
  svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const mx = (p1.x + p2.x) / 2, my = Math.min(p1.y, p2.y) - 22; // 제어점을 위로 → 부드러운 곡선
  const path = document.createElementNS(FCL_SVG_NS, "path");
  path.setAttribute("d", `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`);
  svg.appendChild(path);
  path.addEventListener("animationend", () => svg.remove());
  layer.appendChild(svg);
  return svg;
}
function fclHealSparkle(layer, p) { // 대상 주변 작은 민트 sparkle 3개가 톡톡 튀어오름(뾰로롱 수신감).
  [[-8, -11], [1, -14], [9, -9]].forEach(([sx, sy], i) => {
    const sp = fclAt("fcl-heal-spark", p);
    sp.style.setProperty("--sx", `${sx}px`); sp.style.setProperty("--sy", `${sy}px`);
    sp.style.animationDelay = `${i * 70}ms`;
    fclAppend(layer, sp);
  });
}

// Guard Grammar Preview 01B — gatekeeper 도발: 적 머리 위 '!' + 적 공격 의도가 수문장으로 redirect + 주목 펄스. 전부 preview-only(게임 함수 호출 없음·DOM 직접).
function gatekeeperTaunt() {
  setStageJob("gatekeeper");
  const ally = $(".fcl-ally"); if (ally) ally.hidden = false; // 아군(수문장이 대신 맞아줄 대상) 노출
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const a = fclPoint("fcl-ally"); const t = fclPoint("fcl-tgt");
  if (layer && s && t) {
    // 적 2~3명(메인 적 + 가상 적 — 도발 최대 3명) 머리 위 노랑 '!'(stagger).
    const foes = [t, { x: t.x, y: t.y - 40 }, { x: t.x, y: t.y + 40 }];
    foes.forEach((e, i) => setTimeout(() => fclAppend(layer, fclAt("fcl-taunt-mark", { x: e.x, y: e.y - 30 }, "!")), i * 120));
    // 메인 적: 원래 아군을 노리던 의도선(흐림) → 수문장으로 꺾이는 redirect(노랑 화살).
    if (a) setTimeout(() => fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--intent", t, a)), 380);
    setTimeout(() => fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--taunt", t, s)), 560);
    // 수문장 주목 펄스(어그로 고정).
    setTimeout(() => fclAppend(layer, fclAt("fcl-ring fcl-aggro-ring", s)), 580);
  }
  setStatus("gatekeeper Target/Self/Taunt 후보(01B): 적 2~3명 머리 위 노랑 '!' + 적이 아군을 노리던 공격 의도가 수문장으로 꺾임(redirect) + 수문장 주목 펄스(preview-only · gameplay 미반영). 수문장=관문 설치가 아니라 '적 공격 의도를 자신에게 고정'.");
}

// Guard Grammar Preview 01B — wall 선의 결속: 성벽↔지정 아군 금빛 결속선+자물쇠 + 아군 보호 링 + 아군 피격 시 피해 분담(아군 일부/성벽 대신맞기). preview-only.
function wallBond() {
  setStageJob("wall");
  const ally = $(".fcl-ally"); if (ally) ally.hidden = false; // 지정 아군(결속 대상) 노출
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const a = fclPoint("fcl-ally"); const t = fclPoint("fcl-tgt");
  if (layer && s && a) {
    // 금빛 결속선(지속) + 중앙 자물쇠 + 아군 보호 링.
    fclAppend(layer, fclLineEl("fcl-bond fcl-bond--good", s, a));
    fclAppend(layer, fclAt("fcl-lock fcl-lock--good", fclMid(s, a)));
    fclAppend(layer, fclAt("fcl-protect-ring", a));
    // 잠시 후 적이 아군을 공격 → 피해가 둘로 나뉨(아군 절반 / 성벽 절반 대신맞기).
    if (t) setTimeout(() => fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--intent", t, a)), 760);
    setTimeout(() => {
      fclAppend(layer, fclAt("fcl-dmg-num fcl-dmg-num--hit", a, "-4"));        // 아군: 절반만
      fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--share-good", a, s));    // 절반이 성벽으로
    }, 1060);
    setTimeout(() => fclAppend(layer, fclAt("fcl-dmg-num fcl-dmg-num--share-good", s, "-4")), 1320); // 성벽: 대신맞기
  }
  setStatus("wall Ally/Bond/Protection 후보(01B): 성벽↔지정 아군 금빛 결속선+자물쇠 + 아군 보호 링 + 아군 피격 시 피해가 둘로 나뉨(아군 -4 / 성벽이 -4 대신맞기)(preview-only · gameplay 미반영). 물리 벽이 아니라 '너를 방어해준다'. 수치는 예시.");
}

// Guard Grammar Preview 01B — forbidden 악의 결속: 적 봉인 링 + 금제↔적 붉은 결속선+자물쇠 + 금제 피격 시 일부 피해가 결속 적에게 전가. preview-only.
function forbiddenEvilBond() {
  setStageJob("forbidden"); clearFxLayer();
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const t = fclPoint("fcl-tgt");
  if (layer && s && t) {
    // 적 봉인 링(Guard 01 유지) + 붉은 결속선 + 중앙 자물쇠.
    fclAppend(layer, fclAt("fcl-seal", t));
    fclAppend(layer, fclLineEl("fcl-bond fcl-bond--evil", s, t));
    fclAppend(layer, fclAt("fcl-lock fcl-lock--evil", fclMid(s, t)));
    // 금제 피격(-6) → 받은 피해 일부(≈40%)가 결속 적에게 전가(붉은 화살 → 적 -2).
    setTimeout(() => {
      fclAppend(layer, fclAt("fcl-ring fcl-hit-ring", s));
      fclAppend(layer, fclAt("fcl-dmg-num fcl-dmg-num--hit", s, "-6"));
    }, 820);
    setTimeout(() => fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--share-evil", s, t)), 1060);
    setTimeout(() => fclAppend(layer, fclAt("fcl-dmg-num fcl-dmg-num--share-evil", t, "-2")), 1300);
  }
  setStatus("forbidden Target/Bond/Seal 후보(01B): 적 봉인 링 + 금제↔적 붉은 결속선+자물쇠 + 금제 피격(-6) 시 일부(-2≈40%)가 결속 적에게 전가('금제가 맞았는데 적도 깎인다')(preview-only · gameplay 미반영). holy/cleanse와 구분되는 붉은 결속. 수치는 예시.");
}

// Watchbow Riposte Preview 01 — 파수궁 반응형 보복 인과: 후열 아군 피격 → 파수궁 감지/반응 → 공격자에게 즉시 보복. preview-only(게임 함수 호출 없음·DOM 직접).
function watchbowRiposte() {
  setStageJob("watchbow");
  const ally = $(".fcl-ally"); if (ally) ally.hidden = false; // 후열 아군(피격당하는 자)
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const a = fclPoint("fcl-ally"); const t = fclPoint("fcl-tgt");
  if (layer && s && a && t) {
    // (1) 공격자(적)가 후열 아군을 때림 — 회색 공격선 + 아군 작은 피격 hit ring(트리거).
    fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--intent", t, a));
    setTimeout(() => fclAppend(layer, fclAt("fcl-ring fcl-hit-ring", a)), 240);
    // (2) 피격 지점 → 파수궁 감지선(호박·Trigger). 일반 지원선과 구분.
    setTimeout(() => fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--detect", a, s)), 460);
    // (3) 파수궁 반응 마커(조준/반격 준비·연두 십자 펄스). tracker 표식과 달리 '자기 자신'.
    setTimeout(() => fclAppend(layer, fclAt("fcl-aim-ring", s)), 660);
    // (4) 파수궁 → 공격자 즉시 보복 화살(녹색 ranged) + (5) 적 counter End(짧은 녹색 burst).
    setTimeout(() => fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--counter", s, t)), 880);
    setTimeout(() => fclAppend(layer, fclAt("fcl-counter-burst", t)), 1100);
  }
  setStatus("watchbow Trigger/Ally/Counter 후보(01): 후열 아군 피격(회색 공격선+붉은 hit) → 파수궁 감지(호박 감지선) → 조준/반격 준비(연두 십자 펄스) → 공격자에게 즉시 보복 화살(녹색 ranged)+counter hit(preview-only · gameplay 미반영). 파수궁=일반 원거리 공격이 아니라 '후열 아군 피격에 반응한 보복'. Tracker 표식/추적과 구분.");
}

// Vanguard / Trapper Grammar Preview 01 — vanguard 진군: 전열 압박(주황 chevron 전진+전열 적 2명 타격) + 전열 아군 방어증가(하늘 brace). preview-only(게임 함수 호출 없음·DOM 직접).
function vanguardAdvance() {
  setStageJob("vanguard");
  const ally = $(".fcl-ally"); if (ally) ally.hidden = false; // 전열 아군(brace 대상)
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const a = fclPoint("fcl-ally"); const t = fclPoint("fcl-tgt");
  if (layer && s && t) {
    // (1) 선봉 전진 chevron 펄스(앞으로 밀고 나감).
    fclAppend(layer, fclAt("fcl-advance-push", { x: s.x + 26, y: s.y }));
    // (2) 적 전열 2명에 짧은 전열 타격선(광역 아님) + 작은 hit. 마도 전역 shockwave와 달리 전열만.
    const foes = [t, { x: t.x, y: t.y - 40 }];
    foes.forEach((e, i) => setTimeout(() => {
      fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--advance", s, e));
      setTimeout(() => fclAppend(layer, fclAt("fcl-ring fcl-hit-ring", e)), 180);
    }, 240 + i * 140));
    // (3) 동시에 아군 전열 brace(하늘 방패 호·방어증가) — 전열 아군(ally) + 선봉 자신(전열). 성벽 1명 결속과 달리 전열 다수.
    setTimeout(() => {
      if (a) fclAppend(layer, fclAt("fcl-brace-ring", a));
      fclAppend(layer, fclAt("fcl-brace-ring", { x: s.x, y: s.y + 4 }));
    }, 380);
  }
  setStatus("vanguard Line/Ally/Advance 후보(01): 선봉 전진 chevron(앞으로 밀고 나감) → 적 전열 2명에 짧은 전열 타격선+hit(광역 아님) + 동시에 아군 전열 brace(하늘 방패 호·방어증가)(preview-only · gameplay 미반영). 마도 광역/성벽 1명 결속/수문장 도발과 구분=전열 압박+전열 방어.");
}

// Vanguard / Trapper Grammar Preview 01 — trapper 중독: 적 2명에 낮은 독 적용선 + 발밑 snare ring + 독 wisp(지속 상태). preview-only.
function trapperVenom() {
  setStageJob("trapper"); clearFxLayer();
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const t = fclPoint("fcl-tgt");
  if (layer && s && t) {
    // 적 2명(메인 적 + 가상 적) — Tracker 1명 표식/Mage 전역 광역과 달리 정확히 2대상 상태 부여.
    const foes = [t, { x: t.x, y: t.y - 42 }];
    foes.forEach((e, i) => setTimeout(() => {
      // (1) 낮고 짧은 독 적용선(보라 점선·지면 깔림 느낌). 일반 화살/광역 아님.
      fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--venom", s, e));
      // (2) 발밑 snare ring(적용) + (3) 몸통 보라 독방울 3개(상태 유지·Scale Tuning 01: 확대+삼각 분산으로 몸통 점유↑).
      setTimeout(() => {
        fclAppend(layer, fclAt("fcl-venom-snare", { x: e.x, y: e.y + 16 }));
        // 3개의 보라 독방울이 적 몸통 영역을 삼각으로 채움(완전히 가리지 않음). 약간 시차로 보글거림.
        [[-3, -12, 0], [9, -1, 90], [-8, 8, 170]].forEach(([dx, dy, delay]) => {
          const w = fclAt("fcl-venom-wisp", { x: e.x + dx, y: e.y + dy });
          w.style.animationDelay = `${delay}ms`;
          fclAppend(layer, w);
        });
      }, 180);
    }, i * 210));
  }
  setStatus("trapper Target/Status/Venom 후보(01·Scale Tuning): 덫꾼 → 적 2명에 낮은 독 적용선(보라 점선) → 각 적 발밑 snare ring(적용) + 몸통에 크게 부푸는 보라 독방울 3개(상태 유지·몸통 점유↑)(preview-only · gameplay 미반영). 적 2명 상태 부여=Tracker 1명 표식/Mage 광역/Forbidden 결속과 구분.");
}

// Healbow / Saint Grammar Preview 01 — healbow 치유사격: 적 1명 저격(녹색 실선) + 다친 아군 1명 회복(민트). preview-only(게임 함수 호출 없음·DOM 직접).
function healbowShotHeal() {
  setStageJob("healbow");
  const ally = $(".fcl-ally"); if (ally) ally.hidden = false; // 회복 대상 아군 1명
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const a = fclPoint("fcl-ally"); const t = fclPoint("fcl-tgt");
  if (layer && s && t) {
    // (1) 적 1명 저격(녹색 실선·watchbow 점선 counter와 구분=자기 행동) + (2) 적 hit.
    fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--shot", s, t));
    setTimeout(() => fclAppend(layer, fclAt("fcl-counter-burst", t)), 200);
    // (3) 다친 아군 1명에게 공통 치유 문법: 민트 점선 곡선 회복선 → (4) End 치유 십자 + 뾰로롱 sparkle + "+N"(단일).
    if (a) {
      setTimeout(() => fclHealCurve(layer, s, a), 360);
      setTimeout(() => {
        fclAppend(layer, fclAt("fcl-heal-cross", a));
        fclHealSparkle(layer, a);
        fclAppend(layer, fclAt("fcl-dmg-num fcl-dmg-num--heal", a, "+5"));
      }, 640);
    }
  }
  setStatus("healbow Line/Target/Ally 후보(01·Heal Grammar): 적 1명 저격(녹색 실선·자기 행동)+적 hit → 다친 아군 1명에게 공통 치유 문법(민트 점선 곡선 회복선 + End 치유 십자 + 뾰로롱 sparkle + 숫자)(preview-only · gameplay 미반영). 공격 대상(적)과 회복 대상(아군1) 분리. Watchbow 점선 counter/Purifier 직선 cleanse/Paladin 금빛 자가회복과 구분. 수치는 예시.");
}

// Healbow / Saint Grammar Preview 01 — saint 쌍치유: 저체력 아군 2명 동시 회복(민트). preview-only.
function saintDualHeal() {
  setStageJob("saint");
  const ally = $(".fcl-ally"); if (ally) ally.hidden = false; // 아군 1명(샘플 슬롯)
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const a = fclPoint("fcl-ally");
  if (layer && s && a) {
    // 아군 2명(실제 ally + 가상 아군) — 단일 회복/전체 파티 회복과 구분=정확히 2명 동시.
    const allies = [a, { x: a.x + 16, y: a.y - 34 }];
    // (1) 성직자 회복 준비 glow(민트·holy 금빛 공격 아님·순수 회복).
    fclAppend(layer, fclAt("fcl-heal-glow", s));
    // (2) 두 아군에게 거의 동시 공통 치유 문법: 민트 점선 곡선 회복선 → (3) 각 End 치유 십자 + 뾰로롱 sparkle + "+N".
    allies.forEach((p, i) => {
      setTimeout(() => fclHealCurve(layer, s, p), 260 + i * 70);
      setTimeout(() => {
        fclAppend(layer, fclAt("fcl-heal-cross", p));
        fclHealSparkle(layer, p);
        fclAppend(layer, fclAt("fcl-dmg-num fcl-dmg-num--heal", p, "+6"));
      }, 540 + i * 70);
    });
  }
  setStatus("saint Ally/Delivery/Heal 후보(01·Heal Grammar): 성직자 회복 준비 glow(민트) → 저체력 아군 2명에게 거의 동시 공통 치유 문법(민트 점선 곡선 회복선 + 각 End 치유 십자 + 뾰로롱 sparkle + 숫자)(preview-only · gameplay 미반영). 순수 2인 동시 회복. Healbow 1인+공격/Purifier 직선 cleanse/Paladin 금빛 자가회복과 구분. 수치는 예시.");
}

// Warden Raid Preview 01 — 워든 습격: 게이지 높은 적 식별 → 습격 → 게이지 드레인 + 약화. preview-only(게임 함수 호출 없음·DOM 직접).
function wardenRaid() {
  setStageJob("warden"); clearFxLayer();
  const layer = $("#fx-layer"); const s = fclPoint("fcl-src"); const t = fclPoint("fcl-tgt");
  if (layer && s && t) {
    const top = { x: t.x, y: t.y - 34 }; // 적 머리 위(게이지 바·드레인 위치)
    // (1) 높은 게이지 적 식별 — 적 위 파랑 게이지 바(차오름).
    fclAppend(layer, fclAt("fcl-gauge-mark", top));
    // (2) 워든 습격선(올리브그린·날카롭게) + 적 hit.
    setTimeout(() => {
      fclAppend(layer, fclLineEl("fcl-arrow fcl-arrow--raid", s, t));
      setTimeout(() => fclAppend(layer, fclAt("fcl-ring fcl-hit-ring", t)), 160);
    }, 440);
    // (3a) 게이지 드레인 — 파랑 게이지 조각이 아래로 뚝뚝 떨어짐 + "-40%"(가장 중요한 표현).
    setTimeout(() => {
      [[-6, 0], [2, 90], [8, 170]].forEach(([dx, delay]) => {
        const d = fclAt("fcl-gauge-drop", { x: top.x + dx, y: top.y + 5 });
        d.style.animationDelay = `${delay}ms`;
        fclAppend(layer, d);
      });
      fclAppend(layer, fclAt("fcl-dmg-num fcl-dmg-num--gauge", { x: t.x + 20, y: t.y - 8 }, "-40%"));
    }, 700);
    // (3b) 약화 — 적 발밑 회색 약화 마커(게이지 드레인 파랑과 구분·보조 정보).
    setTimeout(() => fclAppend(layer, fclAt("fcl-weaken-mark", { x: t.x, y: t.y + 18 }, "약화")), 1000);
  }
  setStatus("warden Target/Gauge/Weaken 후보(01): 게이지 높은 적 식별(파랑 게이지 바·차오름) → 워든 습격선(올리브그린·날카롭게)+hit → 적 게이지 드레인(파랑 조각 아래로 뚝·-40%) + 약화 마커(회색)(preview-only · gameplay 미반영). 게이지 높은 적을 제어. Rogue 처형/Tracker 표식추적/Watchbow counter/Trapper 독/Gatekeeper 도발과 구분. 수치는 예시.");
}

function badge(on, text) { return `<span class="fcl-badge fcl-badge--${on ? "on" : "seed"}">${text}</span>`; }
function cardHTML(id) {
  const role = combatRoleOf(id);
  const hasPresence = PRESENCE_JOBS.has(id);
  const note = FCL_NOTE[id] || `FCR01 role(${ROLE_KO[role]}) + FCR02 signature(.fx-sig-${id}). FCP01 presence는 미구현(future seed).`;
  const compare = id === "bard" ? `
    <div class="fcl-compare">
      <div class="fcl-cmp-row"><span class="fcl-cmp-k">주체 · body</span><button type="button" data-job="bard" data-act="presence">body note bloom ▶</button><span class="fcl-id">바드 본체의 개성 FX · 머리 위에서 대각선으로 피어남</span></div>
      <div class="fcl-cmp-row"><span class="fcl-cmp-k">전달 · lane</span><button type="button" data-job="bard" data-act="delivery">text lane note flow ▶</button><span class="fcl-id">리듬/음악 전달 FX · 분리된 위치에서 촤라랑(실 게임 rhythm 자동 발동)</span></div>
    </div>` : "";
  const ex = FCL_EXTRA[id];
  const extra = ex ? `
    <div class="fcl-compare">
      <div class="fcl-cmp-row"><span class="fcl-cmp-k">${(FCL_ANCHOR[id] && FCL_ANCHOR[id].tags.join(" / ")) || ""}</span><button type="button" data-job="${id}" data-act="${ex.act}">${ex.label}</button><span class="fcl-id">${ex.tag}</span></div>
      <div class="fcl-cmp-row"><span class="fcl-id">${ex.desc}</span></div>
    </div>` : "";
  const anc = FCL_ANCHOR[id] || { tags: [], state: "seed", note: "" };
  const anchorRow = `<div class="fcl-anchors">
      <span class="fcl-anchor-k">문법 앵커</span>
      ${anc.tags.map((t) => `<span class="fcl-anchor fcl-anchor--${anc.state}">${t}</span>`).join("")}
      <span class="fcl-anchor-state fcl-anchor-state--${anc.state}">${ANCHOR_STATE_LABEL[anc.state]}</span>
    </div>${anc.note ? `<p class="fcl-anchor-note">${anc.note}</p>` : ""}`;
  return `<div class="fcl-card" data-card="${id}">
    <div class="fcl-card-head"><span class="fcl-name">${jobName(id)}</span><span class="fcl-id">${id}</span><span class="fcl-role">· ${ROLE_KO[role] || "—"}</span></div>
    <div class="fcl-badges">
      ${badge(true, `FCR01 role: ${ROLE_KO[role]}`)}
      ${badge(true, `FCR02 sig: .fx-sig-${id}`)}
      ${badge(hasPresence, hasPresence ? "FCP01 presence: body" : "FCP01: not yet · future seed")}
    </div>
    ${anchorRow}
    <div class="fcl-btns">
      <button type="button" data-job="${id}" data-act="line">Play line ▶</button>
      <button type="button" data-job="${id}" data-act="presence"${hasPresence ? "" : ' class="fcl-na"'}>Play presence ▶</button>
      <button type="button" data-job="${id}" data-act="text">Play text cue ▶</button>
    </div>
    <p class="fcl-note">${note}</p>
    ${compare}
    ${extra}
  </div>`;
}

function buildList() {
  const host = $("#fcl-list");
  if (!host) return;
  const byRole = {};
  ADVANCED_JOBS.forEach((id) => { const r = combatRoleOf(id) || "etc"; (byRole[r] = byRole[r] || []).push(id); });
  // Combat Language Grammar 01 — 상단 grammar legend(공통 문법 8요소 + 기준 문장 + 금지 기준).
  const legend = `<section class="fcl-grammar">
    <div class="fcl-grammar-core">전투 시인성 강화 = <b>공통 문법 + 직업 개성의 가독화</b></div>
    <details class="fcl-grammar-d" open>
      <summary>🧭 Combat Language Grammar — 공통 문법 8요소 (펼치기/접기)</summary>
      <div class="fcl-grammar-grid">${FCL_GRAMMAR.map(([k, v]) => `<div class="fcl-gr-item"><span class="fcl-gr-k">${k}</span><span class="fcl-gr-v">${v}</span></div>`).join("")}</div>
      <p class="fcl-gr-rule"><b>금지:</b> End 정보 과밀 · 개성 FX가 어느 슬롯에도 안 붙음 · 2차급 대형 연출 1차 남발 · 모든 직업에 동일 장식. <span class="fcl-id">(상세: docs/17_COMBAT_LANGUAGE_GRAMMAR.md)</span></p>
    </details>
  </section>`;
  let html = "";
  ROLE_ORDER.forEach((r) => {
    const jobs = byRole[r] || [];
    if (!jobs.length) return;
    html += `<div class="fcl-group-h">${ROLE_KO[r]} <span class="fcl-id">(${jobs.length})</span></div>`;
    jobs.forEach((id) => { html += cardHTML(id); });
  });
  host.innerHTML = legend + html;
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
    else if (act === "delivery") bardDelivery();
    else if (act === "mage-area") mageArea();
    else if (act === "purifier-cleanse") purifierCleanse();
    else if (act === "gatekeeper-taunt") gatekeeperTaunt();
    else if (act === "wall-bond") wallBond();
    else if (act === "forbidden-evilbond") forbiddenEvilBond();
    else if (act === "watchbow-riposte") watchbowRiposte();
    else if (act === "vanguard-advance") vanguardAdvance();
    else if (act === "trapper-venom") trapperVenom();
    else if (act === "healbow-shotheal") healbowShotHeal();
    else if (act === "saint-dualheal") saintDualHeal();
    else if (act === "warden-raid") wardenRaid();
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
