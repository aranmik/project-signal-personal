import { gameState, SLOT_ORDER } from "./state.js";
import { slotPreference } from "../data/jobs.js";
import { renderGame } from "../ui/render.js";
import { avatarSpec, avatarFigureHTML } from "../data/avatars.js";
import {
  startRun, goTitle, applyReward, cycleSpeed, startPreview, showJobSelect,
  applyFusion, skipFusion, previewRecruit, confirmRecruit,
  swapFormationSlots, confirmArrange, continueAfterFusion, showCodex,
  showStageSelect, chooseRoute, startLayoutPreview, showDevPreview,
} from "./battle.js";

console.log("Project Signal Personal — init", gameState);

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
  if (e.target.closest("[data-codex-back]")) goTitle();
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

// Recruit UX Rebuild 01 → Arrange Hotfix 01 — 단일 화면 영입: 후보 클릭=미리배치/교체,
//   파티 슬롯 탭=위치 교체(집기→놓기), "다음 여정으로"=확정. picked는 패널 dataset에 둬 재렌더에도 유지.
const recruitPanel = document.getElementById("recruit-panel");
recruitPanel.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.recruit) { recruitPanel.dataset.picked = ""; previewRecruit(b.dataset.recruit); return; }
  if ("recruitConfirm" in b.dataset) { recruitPanel.dataset.picked = ""; confirmRecruit(); return; }
  // 파티 슬롯 위치 교체: 첫 탭=집기, 다른 슬롯 탭=교체, 같은 슬롯 재탭=해제. 빈↔빈은 변화 없음.
  const slot = b.dataset.pfSlot;
  if (!slot) return;
  const picked = recruitPanel.dataset.picked || "";
  if (!picked) {
    recruitPanel.dataset.picked = slot;
    b.classList.add("picked");
  } else if (picked === slot) {
    recruitPanel.dataset.picked = "";
    b.classList.remove("picked");
  } else {
    recruitPanel.dataset.picked = "";
    swapFormationSlots(picked, slot); // formation 교체 + 재렌더
  }
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
document.getElementById("route-panel").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-route]");
  if (b) chooseRoute(b.dataset.route);
});

// 결과 오버레이 → 다시 시작 (시작 배치 유지로 새 런)
document.getElementById("result-restart").addEventListener("click", () => startRun());

// 결과 오버레이 / 상단 → 타이틀로
document.getElementById("result-title-btn").addEventListener("click", goTitle);
document.getElementById("to-title-btn").addEventListener("click", goTitle);

// Combat Breath Preview 01: 상단 HUD 배속 순환 (2x/MAX)
document.getElementById("speed-toggle").addEventListener("click", cycleSpeed);

// Combat Grammar Polish 02: 프리뷰 디버깅 바 제거 — UI 진입점 없음(startPreview는 dev 전용 잔존).

// Reward & Growth 01: 보상 버튼은 REWARDS 데이터로 렌더 — 위임으로 처리
document.getElementById("growth-choices").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-reward]");
  if (b) applyReward(b.dataset.reward);
});
