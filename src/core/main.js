import { gameState, SLOT_ORDER } from "./state.js";
import { slotPreference } from "../data/jobs.js";
import { renderGame, toggleCodexDetail, closeCodexDetail, renderFootprintsList, footprintsCopyText } from "../ui/render.js";
import { avatarSpec, avatarFigureHTML } from "../data/avatars.js";
import { clearFootprints } from "../data/footprints.js";
// Dev Balance Lab 01 — Dev(?dev=1) 전용 계측 도구(1:1 듀얼 시뮬레이터/데미지 미터). 일반 플레이엔 노출 안 됨.
import { openBalanceLab } from "../dev/balanceLab.js";
import {
  startRun, goTitle, applyReward, cycleSpeed, startPreview, showJobSelect,
  applyFusion, skipFusion, previewRecruit, confirmRecruit,
  swapFormationSlots, confirmArrange, continueAfterFusion, showCodex,
  showStageSelect, chooseRoute, continueFromRest, startLayoutPreview, showDevPreview,
  abandonRun,
} from "./battle.js";

console.log("Project Signal Personal — init", gameState);

// Dev Cheat Mode 01 — 불사 테스트가 켜져 있으면(=URL ?dev=1&immortal=1) 화면에 배지 + 콘솔 안내.
//   기본 OFF. 일반 Pages 접속에선 이 블록이 아무것도 하지 않는다.
if (gameState.dev && gameState.dev.immortal) {
  const badge = document.createElement("div");
  badge.id = "dev-immortal-badge";
  badge.textContent = "불사 테스트";
  (document.getElementById("game-frame") || document.body).appendChild(badge);
  console.log("[DEV] Immortal Mode ON — 아군 최소 HP 1 유지. 끄려면 URL에서 ?dev=1&immortal=1 제거.");
}

// Second Class Test Access 01 — Dev(?dev=1)일 때만 타이틀에 "2차 직업 테스트" 패널을 노출.
//   정식 해금이 아님 — 2차 씨앗(용창/현자/성황)의 전투 기능을 즉석 확인하기 위한 Dev 전용 접근.
//   안전성: 각 버튼은 startRun(formation)으로 "새 런"을 시작(직업 선택 시작과 동일 경로) → 파티 4인·중복 없음·
//   슬롯/스탯/아바타/상태칩이 정상 구성된다. 일반 합체/영입/레시피/흐름은 일절 건드리지 않음.
if (gameState.dev && gameState.dev.on) {
  const TESTS = [
    { label: "용창 테스트", formation: { f0: "dragonspear", f1: "warrior", b0: "archer", b1: "priest" } },
    { label: "현자 테스트", formation: { f0: "warrior", f1: "guardian", b0: "sage", b1: "priest" } },
    { label: "성황 테스트", formation: { f0: "warrior", f1: "guardian", b0: "sunlord", b1: "priest" } },
    { label: "2차 3종 함께", formation: { f0: "dragonspear", f1: "sunlord", b0: "sage", b1: "priest" } },
    // Second Class Mechanics Batch 1A — SR-25 검성 / SR-27 천궁 / SR-30 결계장 Dev 전투 씨앗.
    { label: "검성 테스트", formation: { f0: "swordsaint", f1: "warrior", b0: "archer", b1: "priest" } },
    { label: "천궁 테스트", formation: { f0: "warrior", f1: "guardian", b0: "skyarcher", b1: "priest" } },
    { label: "결계장 테스트", formation: { f0: "wardkeeper", f1: "warrior", b0: "archer", b1: "priest" } },
    { label: "2차 Batch1 함께", formation: { f0: "swordsaint", f1: "wardkeeper", b0: "skyarcher", b1: "priest" } },
    // Second Class Mechanics Batch 2 — SR-26 구원자 / SR-28 역병술사 / SR-29 무희 Dev 전투 씨앗.
    { label: "구원자 테스트", formation: { f0: "warrior", f1: "guardian", b0: "redeemer", b1: "archer" } },
    { label: "역병술사 테스트", formation: { f0: "warrior", f1: "guardian", b0: "plaguebringer", b1: "priest" } },
    { label: "무희 테스트", formation: { f0: "warrior", f1: "guardian", b0: "dancer", b1: "archer" } },
    { label: "2차 Batch2 함께", formation: { f0: "guardian", f1: "dancer", b0: "redeemer", b1: "plaguebringer" } },
  ];
  const panel = document.createElement("div");
  panel.id = "dev-2nd-panel";
  panel.innerHTML =
    `<div class="dev-2nd-title">DEV 2차 직업 테스트 · 정식 해금 아님</div>` +
    `<div class="dev-2nd-btns">${TESTS.map((t, i) => `<button type="button" data-dev2nd="${i}">${t.label}</button>`).join("")}</div>`;
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dev2nd]");
    if (!b) return;
    const t = TESTS[Number(b.dataset.dev2nd)];
    if (t) startRun({ ...t.formation });
  });
  (document.getElementById("title-inner") || document.body).appendChild(panel);
  console.log("[DEV] 2차 직업 테스트 패널 ON (?dev=1). 정식 해금 아님 — 버튼으로 2차 씨앗 파티 전투 시작.");

  // Dev Balance Lab 01 — 타이틀에 "🧪 Balance Lab" 진입 버튼(계측 전용). dev.on일 때만 생성 → 일반 플레이 비노출.
  const labBtn = document.createElement("button");
  labBtn.id = "dev-balancelab-btn";
  labBtn.type = "button";
  labBtn.textContent = "🧪 Balance Lab (계측)";
  // Dev 전용 — styles.css 오염 없이 인라인으로 톤만 맞춘다(계측 도구 = teal). 모바일에서도 깨지지 않게 full-width.
  labBtn.style.cssText =
    "display:block;width:100%;margin-top:10px;padding:9px 10px;font-size:12px;font-weight:800;cursor:pointer;" +
    "border:1px dashed #2f5e47;border-radius:10px;background:rgba(60,180,120,.1);color:#7fd1a8;";
  labBtn.addEventListener("click", openBalanceLab);
  (document.getElementById("title-inner") || document.body).appendChild(labBtn);
  console.log("[DEV] Balance Lab 진입 버튼 ON (?dev=1) — 1:1 듀얼 시뮬레이터/데미지 미터. 본게임 무영향.");
}

renderGame(gameState);

// First Class Expansion 01 — dev 테스트 훅(일반 UI 무관). 콘솔에서 임의 4직업 파티로 전투 시작:
//   signalDev.testParty(["warden","watchbow","trapper","paladin"])
//   확장 16종 스킬을 즉석에서 확인하기 위한 용도 — 정식 직업 선택 흐름은 기존 6종 그대로.
window.signalDev = {
  testParty(jobs) {
    const slots = ["f0", "f1", "b0", "b1"];
    const formation = {};
    slots.forEach((k, i) => { if (jobs[i]) formation[k] = jobs[i]; });
    startRun(formation);
  },
};

// Avatar Import 01: 정적 직업 카드의 placeholder 칩(.job-ava)에 SR 아바타 주입.
//   data-avatar(avatarKey)로 스펙 조회 — 전투 유닛과 동일 키. (1회, 카드는 정적)
document.querySelectorAll("#job-grid .job-card").forEach((card) => {
  const spec = avatarSpec(card.dataset.avatar);
  const slot = card.querySelector(".job-ava");
  if (slot) slot.innerHTML = avatarFigureHTML(spec.sr, spec.parts, "av-fit--card");
});

// Start Flow UX Polish 01: 타이틀 → 스테이지 선택 → (초보자의 길) → 직업 선택.
document.getElementById("title-start").addEventListener("click", showStageSelect);

document.getElementById("stage-select").addEventListener("click", (e) => {
  if (e.target.closest("[data-stage-back]")) { goTitle(); return; }
  const card = e.target.closest(".theme-card");
  if (!card || card.classList.contains("locked")) return; // 잠금 테마는 진입 불가
  if (card.dataset.theme === "beginner") showJobSelect();
});

// 파티 준비 화면 좌상단 → 스테이지 선택으로 복귀.
document.getElementById("to-stage-btn").addEventListener("click", showStageSelect);

// Job Codex Entry Foundation: 타이틀 → 직업 도감 / 도감 → 타이틀.
document.getElementById("title-codex").addEventListener("click", showCodex);

// Battlefield Preview & Layout Tune 01: 타이틀 → Dev 전장 레이아웃 프리뷰. 케이스 전환 바는 위임 처리.
document.getElementById("title-dev-preview").addEventListener("click", showDevPreview);
document.getElementById("dev-bar").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if ("devExit" in b.dataset) goTitle();
  else if (b.dataset.devCase) startLayoutPreview(b.dataset.devCase);
});
document.getElementById("codex-screen").addEventListener("click", (e) => {
  if (e.target.closest("[data-codex-back]")) { goTitle(); return; }
  // Hero UX Polish 01C — 상세 닫기(×) 우선 처리.
  if (e.target.closest("[data-codex-detail-close]")) { closeCodexDetail(); return; }
  // Codex Detail Status 01 → 01C — 직업 카드 클릭 시 카드 바로 아래 상세 패널 토글(아코디언). 게임 상태 변경 없음.
  const card = e.target.closest("[data-codex-job]");
  if (card) toggleCodexDetail(card.dataset.codexJob);
});

/* =========================================================
   Fusion Flow Foundation 01 — 직업 선택 + 배치(전열2/후열2)
   기본 6직업 중 정확히 3명 선택, 클릭 기반 슬롯 배치.
   draft는 UI 전용 상태 — 시작 시 formation으로 넘긴다.
   ========================================================= */
const jobCards = [...document.querySelectorAll("#job-grid .job-card")];
const slotBoxes = [...document.querySelectorAll("#formation-grid .form-slot-box")];
const jobNames = { warrior: "전사", guardian: "수호자", archer: "궁수", priest: "사제", cleric: "신관", trickster: "교란꾼" };

// Start Party Experiment 01 — 초기 출발 인원을 4/3인이 아니라 2인으로(루프 체감 실험).
//   최대 파티(4슬롯)는 유지 — 빈 2자리는 깊은 수풀 동료 영입으로 채운다. 상수만 바꾸면 되돌릴 수 있다.
const START_PARTY_SIZE = 2;
const draft = { f0: null, f1: null, b0: null, b1: null };
let pickedSlot = null; // 슬롯 교환용(첫 클릭 슬롯)

function draftCount() {
  return SLOT_ORDER.filter((k) => draft[k]).length;
}

function refreshJobSelectUI() {
  const placed = SLOT_ORDER.map((k) => draft[k]).filter(Boolean);
  jobCards.forEach((c) => c.classList.toggle("selected", placed.includes(c.dataset.job)));
  slotBoxes.forEach((box) => {
    const job = draft[box.dataset.slot];
    box.querySelector(".slot-job").textContent = job ? jobNames[job] : "—";
    box.classList.toggle("filled", !!job);
    box.classList.toggle("picked", pickedSlot === box.dataset.slot);
  });
  document.getElementById("job-start").disabled = draftCount() !== START_PARTY_SIZE;
}

jobCards.forEach((card) => {
  card.addEventListener("click", () => {
    const job = card.dataset.job;
    const inSlot = SLOT_ORDER.find((k) => draft[k] === job);
    if (inSlot) {
      draft[inSlot] = null; // 선택 해제
    } else if (draftCount() < START_PARTY_SIZE) {
      // Party & Formation Integrity 01: 직업 슬롯 선호(전열/후열) 순서로 빈 슬롯 배치.
      //   하나의 슬롯엔 최대 1명 — 점유 슬롯은 건너뛴다. (같은 직업 카드는 1장뿐 — 중복 불가)
      const empty = slotPreference(job).find((k) => !draft[k]);
      if (empty) draft[empty] = job;
    }
    pickedSlot = null;
    refreshJobSelectUI();
  });
});

// 슬롯 클릭: 첫 클릭 = 집기, 두 번째 클릭 = 자리 교환(빈 슬롯 이동 포함)
slotBoxes.forEach((box) => {
  box.addEventListener("click", () => {
    const k = box.dataset.slot;
    if (pickedSlot === null) {
      if (draft[k]) pickedSlot = k;
    } else {
      [draft[pickedSlot], draft[k]] = [draft[k], draft[pickedSlot]];
      pickedSlot = null;
    }
    refreshJobSelectUI();
  });
});

document.getElementById("job-start").addEventListener("click", () => {
  if (draftCount() !== START_PARTY_SIZE) return;
  startRun({ ...draft });
});

// Fusion Flow 01: 합체/영입 패널 — 동적 버튼은 위임으로 처리
document.getElementById("fusion-panel").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.fusion) applyFusion(b.dataset.fusion);
  else if ("fusionSkip" in b.dataset) skipFusion();
});

// Fusion Moment 01: 합체 결과(탄생) 화면 → 동료 영입
document.getElementById("fusion-result-panel").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b && "fusionContinue" in b.dataset) continueAfterFusion();
});

// Route Choice & Recruit UX Rework 01 (D) — 영입 화면은 후보 미리배치/확정만 처리한다.
//   진형 재배치(슬롯 스왑)는 제거 — 정비는 이슬 쉼터(정비소)에서. 후보는 빈 슬롯에 자동 미리보기로 들어가고,
//   현재 파티 그리드는 정적 표시(div)라 여기서 다룰 슬롯 버튼이 없다. (swapFormationSlots는 쉼터/재배치 전용으로 유지.)
const recruitPanel = document.getElementById("recruit-panel");
recruitPanel.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.recruit) { previewRecruit(b.dataset.recruit); return; }
  if ("recruitConfirm" in b.dataset) { confirmRecruit(); return; }
});

// Party & Formation Integrity 01 보강: 재배치 화면 — 슬롯 집기 → 교환.
//   picked 상태는 패널 dataset에 둬서 재렌더에도 하이라이트가 유지된다.
const arrangePanel = document.getElementById("arrange-panel");
arrangePanel.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if ("arrangeDone" in b.dataset) {
    arrangePanel.dataset.picked = "";
    confirmArrange();
    return;
  }
  const slot = b.dataset.arrSlot;
  if (!slot) return;
  const picked = arrangePanel.dataset.picked || "";
  if (!picked) {
    if (b.classList.contains("filled")) {
      arrangePanel.dataset.picked = slot;
      b.classList.add("picked");
    }
  } else {
    arrangePanel.dataset.picked = "";
    swapFormationSlots(picked, slot); // 같은 슬롯 클릭이면 교환해도 동일(집기 해제)
  }
});

// Run Structure 01A: 여정 선택 — 동적 카드는 위임으로 처리
// Run Footprints 01: 같은 패널의 "런 포기" 버튼(data-abandon)도 위임 처리 — 발자취 기록 후 타이틀.
document.getElementById("route-panel").addEventListener("click", (e) => {
  if (e.target.closest("[data-abandon]")) { abandonRun(); return; }
  const b = e.target.closest("button[data-route]");
  if (b) chooseRoute(b.dataset.route);
});

// Rest Route Polish 01 → Rest Grove 01: 이슬 쉼터 = 정비 장면. "정비 완료"로 복귀 + 슬롯 탭으로 진형 정비(교체).
const restPanel = document.getElementById("rest-panel");
restPanel.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if ("restContinue" in b.dataset) { restPanel.dataset.picked = ""; continueFromRest(); return; }
  // 진형 정비: 슬롯 집기 → 다른 슬롯 탭이면 교체, 같은 슬롯 재탭이면 해제(recruit 패턴과 동일).
  const slot = b.dataset.pfSlot;
  if (!slot) return;
  const picked = restPanel.dataset.picked || "";
  if (!picked) { restPanel.dataset.picked = slot; b.classList.add("picked"); }
  else if (picked === slot) { restPanel.dataset.picked = ""; b.classList.remove("picked"); }
  else { restPanel.dataset.picked = ""; swapFormationSlots(picked, slot); }
});

// 결과 오버레이 → 다시 시작 (시작 배치 유지로 새 런)
document.getElementById("result-restart").addEventListener("click", () => startRun());

// 결과 오버레이 / 상단 → 타이틀로
document.getElementById("result-title-btn").addEventListener("click", goTitle);
document.getElementById("to-title-btn").addEventListener("click", goTitle);

// Combat Breath Preview 01: 상단 HUD 배속 순환 (2x/MAX)
document.getElementById("speed-toggle").addEventListener("click", cycleSpeed);

/* =========================================================
   Run Footprints 01 — 발자취 패널(최근 10개). gameState.screen과 무관한 가벼운 오버레이.
   타이틀 "발자취"로 열고, 닫기/복사(TSV)/초기화 처리. localStorage가 단일 출처라 항상 최신을 읽어 렌더.
   ========================================================= */
const footprintsOverlay = document.getElementById("footprints-overlay");
function openFootprints() {
  renderFootprintsList();
  if (footprintsOverlay) footprintsOverlay.hidden = false;
}
function closeFootprints() {
  if (footprintsOverlay) footprintsOverlay.hidden = true;
}
document.getElementById("title-footprints").addEventListener("click", openFootprints);
document.getElementById("footprints-close").addEventListener("click", closeFootprints);
// 배경(카드 바깥) 탭으로도 닫힘 — 카드 내부 클릭은 유지.
if (footprintsOverlay) footprintsOverlay.addEventListener("click", (e) => {
  if (e.target === footprintsOverlay) closeFootprints();
});
document.getElementById("footprints-clear").addEventListener("click", () => {
  clearFootprints();
  renderFootprintsList();
});
document.getElementById("footprints-copy").addEventListener("click", async () => {
  const text = footprintsCopyText();
  const btn = document.getElementById("footprints-copy");
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { btn.textContent = "복사됨!"; setTimeout(() => { btn.textContent = "복사(TSV)"; }, 1200); }
  } catch (err) {
    // 클립보드 권한 불가 시 폴백: 임시 textarea 선택 → execCommand 복사 시도(모바일 호환).
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      if (btn) { btn.textContent = "복사됨!"; setTimeout(() => { btn.textContent = "복사(TSV)"; }, 1200); }
    } catch (e2) {
      if (btn) { btn.textContent = "복사 실패"; setTimeout(() => { btn.textContent = "복사(TSV)"; }, 1200); }
    }
  }
});

// Combat Grammar Polish 02: 프리뷰 디버깅 바 제거 — UI 진입점 없음(startPreview는 dev 전용 잔존).

// Reward & Growth 01: 보상 버튼은 REWARDS 데이터로 렌더 — 위임으로 처리
document.getElementById("growth-choices").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-reward]");
  if (b) applyReward(b.dataset.reward);
});
