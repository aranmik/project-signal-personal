import { stagePlan, BEGINNER_THEME } from "../data/stages.js";
import { availableFusions, slotPreference } from "../data/jobs.js";
import { REWARDS } from "../data/rewards.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { SLOT_ORDER, SLOT_NAMES } from "../core/state.js";

function jobName(id) {
  return UNIT_TEMPLATES.party[id]?.name || id;
}

export function renderGame(state) {
  const titleScreen = document.getElementById("title-screen");
  const jobSelect = document.getElementById("job-select");
  const growthPanel = document.getElementById("growth-panel");
  const fusionPanel = document.getElementById("fusion-panel");
  const fusionResultPanel = document.getElementById("fusion-result-panel");
  const recruitPanel = document.getElementById("recruit-panel");
  const arrangePanel = document.getElementById("arrange-panel");
  const battleView = document.getElementById("battle-view");

  titleScreen.hidden = true;
  jobSelect.hidden = true;
  growthPanel.hidden = true;
  fusionPanel.hidden = true;
  fusionResultPanel.hidden = true;
  recruitPanel.hidden = true;
  arrangePanel.hidden = true;
  battleView.hidden = true;

  if (state.screen === "title") {
    titleScreen.hidden = false;
    return;
  }

  // Game Flow Foundation 01: 직업 선택 화면 (정적 카드 — 선택 상태는 main.js가 관리)
  if (state.screen === "jobSelect") {
    jobSelect.hidden = false;
    return;
  }

  if (state.screen === "reward") {
    growthPanel.hidden = false;
    renderRewardPanel(state);
    return;
  }

  // Fusion Flow Foundation 01: 합체 / 영입 화면
  if (state.screen === "fusion") {
    fusionPanel.hidden = false;
    renderFusionPanel(state);
    return;
  }

  // Fusion Moment 01: 합체 결과(탄생) 확인 화면
  if (state.screen === "fusionResult") {
    fusionResultPanel.hidden = false;
    renderFusionResultPanel(state);
    return;
  }

  if (state.screen === "recruit") {
    recruitPanel.hidden = false;
    renderRecruitPanel(state);
    return;
  }

  // Party & Formation Integrity 01 보강: 파티 구성 변경 후 재배치 확인 화면
  if (state.screen === "arrange") {
    arrangePanel.hidden = false;
    renderArrangePanel(state);
    return;
  }

  battleView.hidden = false;
  battleView.dataset.status = state.battle.status;
  renderHud(state);
  renderUnits(state);
  renderEncounterHud(state);
  renderLogOverlay(state);
  renderResultOverlay(state);
}

// Combat Readability Polish 02 — Boss/Elite Encounter HUD.
//   tier 적의 정보(이름/HP/속도/상태)는 커진 아바타 밑이 아니라 중앙 상단 전용 HUD로 표시.
//   현재는 boss를 우선 노출(elite-mix 다수전 회귀 방지) — elite 확장은 encounterUnit만 넓히면 됨.
//   HUD에 잡힌 유닛(.is-encounter)은 아바타 부착 바/게이지/상태슬롯을 CSS로 숨긴다.
function encounterUnit(state) {
  const enemies = state.enemies || [];
  // boss 우선. (확장: || enemies.find((u) => u.tier === "elite" && !u.isDead))
  return enemies.find((u) => u.tier === "boss" && !u.isDead) || null;
}

function renderEncounterHud(state) {
  const hud = document.getElementById("encounter-hud");
  if (!hud) return;

  // 매 렌더 시 이전 표식 해제 후 현재 대상에만 부여(재배치/스테이지 전환 안전)
  document
    .querySelectorAll("#unit-layer .unit.is-encounter")
    .forEach((el) => el.classList.remove("is-encounter"));

  const unit = encounterUnit(state);
  if (!unit || dyingUnits.has(unit.instanceId) || cleanedDead.has(unit.instanceId)) {
    hud.hidden = true;
    hud.dataset.iid = "";
    return;
  }

  const el = document.querySelector(`#unit-layer [data-instance-id="${unit.instanceId}"]`);
  if (el) el.classList.add("is-encounter");

  // 구조는 대상이 바뀔 때만 재생성(매 tick HP/게이지 width만 갱신 → 바 transition 유지)
  if (hud.dataset.iid !== unit.instanceId) {
    hud.dataset.iid = unit.instanceId;
    hud.dataset.tier = unit.tier;
    const label = unit.tier === "boss" ? "BOSS" : "ELITE";
    hud.innerHTML = `
      <div class="enc-top">
        <span class="enc-label">${label}</span>
        <span class="enc-name">${unit.name}</span>
        <div class="enc-status" data-markers=""></div>
      </div>
      <span class="enc-hp"><span class="enc-hp-fill"></span></span>
      <span class="enc-tempo"><span class="enc-tempo-fill"></span></span>
    `;
  }

  const hpPct = unit.maxHp > 0
    ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100))
    : 0;
  hud.querySelector(".enc-hp-fill").style.width = `${hpPct.toFixed(1)}%`;
  const gauge = Math.max(0, Math.min(100, unit.actionGauge ?? 0));
  hud.querySelector(".enc-tempo-fill").style.width = `${gauge.toFixed(1)}%`;

  const markers = displayMarkers(unit);
  const statusEl = hud.querySelector(".enc-status");
  const key = markers.join(",");
  if (statusEl && statusEl.dataset.markers !== key) {
    statusEl.dataset.markers = key;
    statusEl.innerHTML = statusMarkersHTML(markers);
  }
  hud.hidden = false;
}

// Fusion Flow Foundation 01 — 현재 배치 한 줄 표시 (전열/후열이 읽히게).
function formationLineHTML(formation, highlightSlot) {
  return SLOT_ORDER.map((k) => {
    const job = formation?.[k];
    const hl = k === highlightSlot ? " hl" : "";
    return `<span class="form-slot${job ? "" : " empty"}${hl}">${SLOT_NAMES[k]}<b>${job ? jobName(job) : "—"}</b></span>`;
  }).join("");
}

// 합체 화면: "두 영웅의 힘이 하나로 모인다" — 재료 2 → 결과 탄생이 읽히게.
//   합체 실행 시 동료 영입이 이어진다는 점, 스킵 시 영입이 없다는 점을 문구로 안내.
function renderFusionPanel(state) {
  const f = state.run.formation || {};
  const jobs = SLOT_ORDER.map((k) => f[k]).filter(Boolean);
  const fusions = availableFusions(jobs);

  const rows = fusions.length
    ? fusions.map((r) =>
        `<div class="fusion-row">
          <span class="fusion-formula">${jobName(r.materials[0])} + ${jobName(r.materials[1])} <span class="fusion-arrow">→</span> <b>${jobName(r.result)} 탄생</b></span>
          <button type="button" data-fusion="${r.result}">합체한다</button>
        </div>`
      ).join("")
    : "";

  const guide = fusions.length
    ? `<p class="flow-note">두 영웅의 힘이 하나로 모입니다.<br>합체하면 빈자리를 채울 동료를 영입합니다.</p>`
    : `<p class="flow-note">지금 파티에는 합체 가능한 조합이 없습니다.<br>이번에는 합체 없이 다음 스테이지로 진행합니다.</p>`;

  const skipLabel = fusions.length ? "이번에는 합체하지 않는다" : "다음 스테이지로";
  const skipNote = fusions.length
    ? `<p class="flow-note flow-note--dim">합체하지 않으면 동료 영입은 발생하지 않습니다.</p>`
    : "";

  document.getElementById("fusion-body").innerHTML = `
    <div class="flow-kicker">${BEGINNER_THEME.name} ${state.run.stage} 클리어 — 합체의 기운</div>
    <h2 class="flow-heading">합체</h2>
    <div class="flow-formation">${formationLineHTML(f)}</div>
    ${guide}
    <div id="fusion-list">${rows}</div>
    ${skipNote}
    <button type="button" class="flow-next" data-fusion-skip>${skipLabel}</button>
  `;
}

// Fusion Moment 01 — 합체 결과(탄생) 확인 화면.
//   재료 2 카드 → 결과 카드 강조. "소실"이 아니라 "탄생"으로 읽히게. 1클릭으로 영입 진행.
function renderFusionResultPanel(state) {
  const fusion = state.run.lastFusion;
  if (!fusion) return;
  const [m1, m2] = fusion.materials;

  document.getElementById("fusion-result-body").innerHTML = `
    <div class="flow-kicker">합체 성공</div>
    <h2 class="flow-heading">${jobName(fusion.result)} 탄생!</h2>
    <div class="fusion-cast">
      <span class="cast-card cast-mat">${jobName(m1)}</span>
      <span class="cast-plus">+</span>
      <span class="cast-card cast-mat">${jobName(m2)}</span>
      <span class="cast-arrow">→</span>
      <span class="cast-card cast-result">${jobName(fusion.result)}</span>
    </div>
    <p class="flow-note">${fusion.birthLine || "두 영웅의 힘이 하나로 모였다."}<br>새로운 영웅 <b>${jobName(fusion.result)}</b> — 파티에 합류했다.</p>
    <p class="flow-note flow-note--dim">빈자리를 채울 새 동료를 영입하세요.</p>
    <button type="button" id="fusion-continue" data-fusion-continue>동료 영입하기</button>
  `;
}

// 영입 화면: 랜덤 후보(진입 시 확정, 최대 3) / 후보별 배치 예정 슬롯(선호 규칙) 안내.
function renderRecruitPanel(state) {
  const f = state.run.formation || {};
  const emptySlot = SLOT_ORDER.find((k) => !f[k]);
  // 후보는 battle.js가 진입 시 굴려둔 recruitOffer(랜덤 3) — 재렌더에도 고정.
  const candidates = emptySlot ? state.run.recruitOffer || [] : [];

  const targetSlot = (id) => slotPreference(id).find((k) => !f[k]);
  const rows = candidates.length
    ? candidates.map((id) =>
        `<button type="button" class="recruit-card" data-recruit="${id}">
          <span class="job-name">${jobName(id)}</span>
          <span class="recruit-slot">${SLOT_NAMES[targetSlot(id)] || ""} 배치</span>
        </button>`
      ).join("")
    : `<p class="flow-note">영입 가능한 동료가 없습니다.</p>`;

  // Fusion Moment 01: 문맥별 문구 — 합체 후(빈자리 보충) vs 4인 확장 영입.
  const isFusionFill = state.run.recruitContext === "fusion";
  const heading = isFusionFill ? "빈자리를 채울 동료를 선택하세요" : "새 동료를 영입하세요";
  const note = isFusionFill
    ? "합체로 파티의 한 자리가 비었습니다.<br>현재 파티에 없는 동료가 찾아왔습니다."
    : "현재 파티에 없는 기본 직업 동료가 찾아왔습니다.";

  document.getElementById("recruit-body").innerHTML = `
    <div class="flow-kicker">새 동료의 기척</div>
    <h2 class="flow-heading">${heading}</h2>
    <p class="flow-note">${note}</p>
    <div class="flow-formation">${formationLineHTML(f, emptySlot)}</div>
    <div id="recruit-list">${rows}</div>
    ${candidates.length ? "" : `<button type="button" class="flow-next" data-recruit-skip>다음으로</button>`}
  `;
}

// 재배치 화면: 슬롯 클릭(집기 → 놓기)으로 위치 교환. 직업은 위치를 강제하지 않는다 —
//   플레이어 선택이 주 규칙, 직업 선호는 자동 배치 임시값일 뿐. 확정 후 다음 스테이지.
//   pickedSlot은 main.js가 데이터셋으로 관리(재렌더 시 하이라이트 복원).
export function renderArrangePanel(state) {
  const f = state.run.formation || {};
  const picked = document.getElementById("arrange-panel").dataset.picked || "";

  const boxes = SLOT_ORDER.map((k) => {
    const job = f[k];
    return `<button type="button" class="form-slot-box${job ? " filled" : ""}${picked === k ? " picked" : ""}" data-arr-slot="${k}">
      <span class="slot-name">${SLOT_NAMES[k]}</span>
      <span class="slot-job">${job ? jobName(job) : "—"}</span>
    </button>`;
  }).join("");

  document.getElementById("arrange-body").innerHTML = `
    <div class="flow-kicker">전열은 적과 가까운 자리, 후열은 먼 자리</div>
    <h2 class="flow-heading">새 파티를 배치하세요</h2>
    <p class="flow-note">슬롯을 눌러 위치를 바꾸고, 다음 전투를 준비하세요.</p>
    <div id="arrange-grid">${boxes}</div>
    <button type="button" id="arrange-done" data-arrange-done>다음 스테이지</button>
  `;
}

// Reward & Growth 01: 누적 성장 요약("공격 훈련 Lv.2 · 회복 훈련 Lv.1") — 선택이 남아 있음을 보여준다.
function growthSummaryText(state) {
  const lv = state.run.rewardLevels || {};
  const parts = REWARDS.filter((r) => lv[r.id]).map((r) => `${r.name} Lv.${lv[r.id]}`);
  return parts.join(" · ");
}

function renderRewardPanel(state) {
  document.getElementById("growth-stage-label").textContent =
    `${BEGINNER_THEME.name} ${state.run.stage} / ${state.run.maxStage} 클리어!`;
  document.getElementById("growth-subtitle").innerHTML =
    "훈련을 하나 선택하세요.<br><span class='growth-hint'>선택한 훈련은 이번 모험 동안 유지되고, 다음 전투부터 적용됩니다.</span>";

  // 보상 버튼은 REWARDS 데이터에서 렌더 — 보상 추가는 데이터만 늘리면 된다.
  document.getElementById("growth-choices").innerHTML = REWARDS.map(
    (r) =>
      `<button type="button" data-reward="${r.id}">
        <span class="reward-name">${r.name}</span>
        <span class="reward-desc">${r.description}</span>
      </button>`
  ).join("");

  const summary = growthSummaryText(state);
  document.getElementById("growth-log").textContent =
    summary ? `현재 성장 — ${summary}` : "";
}

// 결과 오버레이 — 전투 종료(클리어/패배)에서만 노출
function renderResultOverlay(state) {
  const overlay = document.getElementById("result-overlay");
  const titleEl = document.getElementById("result-title");
  const restartBtn = document.getElementById("result-restart");
  if (!overlay) return;

  const ended = state.battle.status === "ended";
  const result = state.run.result;

  if (ended && (result === "clear" || result === "defeat")) {
    // Game Flow Foundation 01: Run Clear / 모험 실패
    if (result === "clear") {
      titleEl.textContent = "초보자의 길 클리어!";
      restartBtn.textContent = "다시 시작";
    } else {
      titleEl.textContent = "모험 실패";
      restartBtn.textContent = "다시 시작";
    }
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
  }
}

function renderHud(state) {
  // Game Flow Foundation 01: "초보자의 길 3 / 10 · 일반 전투" — 스테이지 위치/타입이 읽힌다.
  //   프리뷰 장면은 정식 런이 아니므로 PREVIEW 표기.
  const stageEl = document.getElementById("stage-label");
  if (state.battle.previewKind) {
    stageEl.textContent = "PREVIEW";
  } else {
    const plan = stagePlan(state.run.stage);
    stageEl.textContent =
      `${BEGINNER_THEME.name} ${state.run.stage} / ${state.run.maxStage} · ${plan.label}`;
  }
  document.getElementById("status-label").textContent = state.battle.status;
  renderPartyBonus(state.run.bonuses);

  // Combat Breath Preview 01: 배속 라벨(1x~MAX) + 강조 + 전장 --tick/data-fast
  //   --tick(=현재 tick 간격)으로 tempo fill transition을 cadence에 자동 정합 → 모든 배속 부드럽게.
  //   data-fast(>1x)로 FX/acting 지속시간 단축 오버라이드를 일괄 적용.
  const speed = state.battle.speed ?? 1;
  const label = state.battle.speedLabel ?? `${speed}x`;
  const speedBtn = document.getElementById("speed-toggle");
  if (speedBtn) {
    speedBtn.textContent = label;
    speedBtn.classList.toggle("fast", speed > 1);
  }
  const field = document.getElementById("battle-field");
  if (field) {
    field.dataset.speed = label;
    field.dataset.fast = speed > 1 ? "1" : "0";
    const tick = state.battle.tickInterval ?? 500;
    field.style.setProperty("--tick", `${tick}ms`);
  }
}

function renderPartyBonus(bonuses) {
  const el = document.getElementById("party-bonus");
  const { atk = 0, maxHp = 0, heal = 0 } = bonuses;
  if (atk === 0 && maxHp === 0 && heal === 0) {
    el.hidden = true;
    return;
  }
  const parts = [];
  if (atk > 0) parts.push(`공격 +${atk}`);
  if (maxHp > 0) parts.push(`최대 HP +${maxHp}`);
  if (heal > 0) parts.push(`회복 +${heal}`); // Reward & Growth 01: 회복 훈련도 HUD 요약에
  el.textContent = `파티 강화: ${parts.join(" · ")}`;
  el.hidden = false;
}

// Battle Screen Baseline 01: 전장 위 absolute 유닛 배치
// 루다 monster-battlefield-mockup.html "1. 기본 대치" 파츠 구조 이식
const AVATAR_PARTS = {
  warrior: ["aura", "base", "stance", "body", "head", "shield"],
  priest: ["aura", "base", "stance", "body", "head", "staff"],
  archer: ["aura", "base", "stance", "body", "head", "bow", "arrow"],
  // Party Join 01: 수호자 — 기존 공통 파츠 + 창(lance)로 최소 실루엣 구분
  guardian: ["aura", "base", "stance", "body", "head", "lance"],
  slime: ["shadow", "slime-body", "shine", "eye left", "eye right"],
  goblin: ["shadow", "ear left", "ear right", "goblin-body", "goblin-head", "eye left", "eye right", "mouth"],
  wolf: ["shadow", "tail", "wolf-body", "leg one", "leg two", "wolf-head", "ear left", "ear right", "snout", "eye"],
};

// Tempo Smooth 01: 매 tick innerHTML 전체 교체 → instanceId 키 기반 reconcile.
//   유닛 DOM(아바타/파츠)을 유지해 idle 애니메이션이 tick마다 리셋되지 않게 한다.
//   변하는 값(HP/속도 게이지/사망 상태)만 기존 요소에 갱신 → 전투 흐름이 끊기지 않음.
//   instanceId는 스테이지/재시작 간에도 안정(hero-warrior-1 / enemy-slime-1 …)이라
//   요소가 그대로 재사용되고, FX/리액션 계산(getBoundingClientRect)도 영향 없음.
// Combat Lifecycle Polish 01: 사망 생명주기 추적(전투 계산과 분리된 "표시" 상태).
//   dyingUnits  = 사망 연출(.dying) 진행 중 instanceId
//   cleanedDead = 사망 연출 끝 + 전장에서 제거됨(Field Cleanup) instanceId — 다시 안 그림
const dyingUnits = new Set();
const cleanedDead = new Set();

function renderUnits(state) {
  const layer = document.getElementById("unit-layer");
  if (!layer) return;

  const all = [...state.party, ...state.enemies];
  const seen = new Set();

  all.forEach((unit) => {
    const iid = unit.instanceId;
    seen.add(iid);

    // 같은 instanceId가 "살아있는 새 유닛"으로 재사용됨(스테이지/재시작) → 사망 추적 초기화.
    //   (reconcile 키가 안정적이라 battle.js와 결합 없이 여기서 자동 복구)
    if (!unit.isDead && (cleanedDead.has(iid) || dyingUnits.has(iid))) {
      cleanedDead.delete(iid);
      dyingUnits.delete(iid);
      const stale = layer.querySelector(`[data-instance-id="${iid}"]`);
      if (stale) stale.remove();
    }

    if (cleanedDead.has(iid)) return; // 이미 정리됨 — 다시 만들지 않음(Field Cleanup)

    let el = layer.querySelector(`[data-instance-id="${iid}"]`);
    if (!el) {
      if (unit.isDead) return; // 죽은 채로 요소가 없으면 새로 만들지 않음(방어)
      layer.appendChild(createFieldUnit(unit));
    } else if (
      unit.team === "party" &&
      (el.dataset.slotKey || "") !== (unit.slotKey || "")
    ) {
      // Party & Formation Integrity 01: 같은 instanceId가 다른 슬롯으로 재배치됨
      //   (새 런/합체/영입). 위치 클래스는 생성 시에만 박히므로 요소를 재생성해야
      //   슬롯-좌표 계약이 유지된다 — 이것이 "두 영웅 겹침" 버그의 원인이었다.
      el.remove();
      layer.appendChild(createFieldUnit(unit));
    } else {
      updateFieldUnit(el, unit);
    }
  });

  // 더 이상 없는 유닛만 제거 (현재 구조상 거의 발생하지 않음)
  Array.from(layer.children).forEach((child) => {
    const iid = child.dataset.instanceId;
    if (iid && !seen.has(iid)) child.remove();
  });
}

// 기존 요소의 변하는 값만 갱신 (DOM 재생성 없음 → idle 연속)
function updateFieldUnit(el, unit) {
  // Combat Lifecycle Polish 01: HP 0 → 사망 연출 시작(한 번만). 이후 HP/게이지 갱신 정지.
  if (unit.isDead) {
    if (!dyingUnits.has(unit.instanceId) && !el.classList.contains("dying")) {
      startDeath(el, unit);
    }
    return;
  }

  // Combat Readability Foundation 01: 상태 마커는 변경 시에만 갱신(매 tick 재생성 방지).
  //   Status & Effect Foundation 01: 마커는 실제 상태(statuses) + 표시 전용(statusMarkers) 파생.
  const slots = el.querySelector(".status-slots");
  if (slots) {
    const markers = displayMarkers(unit);
    const key = markers.join(",");
    if (slots.dataset.markers !== key) {
      slots.dataset.markers = key;
      slots.innerHTML = statusMarkersHTML(markers);
    }
  }

  const hpFill = el.querySelector(".hp-bar-fill");
  if (hpFill) {
    const hpPct = unit.maxHp > 0
      ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100))
      : 0;
    hpFill.style.width = `${hpPct.toFixed(1)}%`;
  }

  const tempoBar = el.querySelector(".tempo-bar");
  const tempoFill = el.querySelector(".tempo-bar-fill");
  if (tempoFill) {
    const gauge = Math.max(0, Math.min(100, unit.actionGauge ?? 0));
    const prev = parseFloat(tempoFill.style.width) || 0;
    if (gauge < prev - 0.5) {
      // 행동 후 리셋(급강하)은 보간 없이 즉시 — 천천히 빠지는 어색함 방지
      tempoFill.style.transition = "none";
      tempoFill.style.width = `${gauge.toFixed(1)}%`;
      void tempoFill.offsetWidth; // reflow로 snap 확정
      tempoFill.style.transition = ""; // 다음 차오름은 다시 부드럽게(스타일시트 0.9s)
    } else {
      // 차오름은 1초 tick 사이를 부드럽게 보간
      tempoFill.style.width = `${gauge.toFixed(1)}%`;
    }
    if (tempoBar) {
      tempoBar.classList.toggle("ready-soon", (unit.actionGauge ?? 0) >= 88);
    }
  }
}

// Combat Lifecycle Polish 01 — Death Reaction + Field Cleanup.
//   HP 0 유닛에 .dying 부여 → CSS 짧은 퇴장 연출(.unit opacity fade + .fig-react 무너짐).
//   진행 중이던 반응(hit/heal/acting)은 죽음이 우선이라 제거. 작은 dust로 "정리" 감각.
//   .unit 자체 애니메이션(opacity fade) 종료 시 DOM 제거 + cleanedDead 등록 → 다시 안 그림.
function startDeath(el, unit) {
  dyingUnits.add(unit.instanceId);
  el.classList.add("dying");

  const fig = el.querySelector(".fig-react");
  if (fig) fig.classList.remove("react-hit", "react-heal", "acting", "acting-soft");

  spawnDeathDust(unit.instanceId, unit.team === "party");

  el.addEventListener("animationend", function done(e) {
    if (e.target !== el) return; // .unit 본체(opacity fade) 종료에서만 (자식 transform 제외)
    el.removeEventListener("animationend", done);
    dyingUnits.delete(unit.instanceId);
    cleanedDead.add(unit.instanceId);
    el.remove();
  });
}

// 사망 지점에 약한 dust 한 번 — "쓰러져 정리됐다" 감각(과하지 않게).
function spawnDeathDust(instanceId, isParty) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const p = unitPoint(instanceId, { fx: 0.5, fy: 0.62 }, field.getBoundingClientRect());
  if (!p) return;
  const d = document.createElement("span");
  d.className = `fx-dust${isParty ? " fx-dust--party" : ""}`;
  d.style.left = `${p.x}px`;
  d.style.top = `${p.y}px`;
  d.addEventListener("animationend", () => d.remove());
  layer.appendChild(d);
}

// Combat Readability Foundation 01 — Target Signal: 행동 대상에 짧은 "잡혔다" ring.
//   actor cue보다 약한 보조 신호(연결 강화). FX 레이어 ring이라 유닛 transform과 충돌 없음.
//   ring 크기는 대상 rect에 비례(보스 scale 2.8에서도 안정). 죽는 중/정리됨은 생략.
//   상한(MAX_FX_TARGETS) + MAX 단축으로 과밀 방지.
const MAX_FX_TARGETS = 5;
function spawnTargetCue(targetInstanceId, isHeal) {
  if (dyingUnits.has(targetInstanceId) || cleanedDead.has(targetInstanceId)) return;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  const el = document.querySelector(`#unit-layer [data-instance-id="${targetInstanceId}"]`);
  if (!layer || !field || !el) return;

  const cues = layer.querySelectorAll(".fx-target");
  if (cues.length >= MAX_FX_TARGETS) cues[0].remove();

  const r = el.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  const cx = r.left - fieldRect.left + r.width / 2;
  const cy = r.top - fieldRect.top + r.height * 0.46; // 몸통 중앙 약간 위
  const size = Math.max(34, Math.min(124, r.width * 0.92));

  const c = document.createElement("span");
  c.className = `fx-target${isHeal ? " fx-target--heal" : ""}`;
  c.style.left = `${cx}px`;
  c.style.top = `${cy}px`;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  c.addEventListener("animationend", () => c.remove());
  layer.appendChild(c);
}

// Combat Readability Foundation 01 — Status Slot Foundation.
//   유닛 위에 작은 상태 마커(최대 3)를 올릴 자리. 실제 상태 계산과 결합하지 않음 —
//   unit.statusMarkers(표시용 배열)만 읽는다. preview/test 용도.
const STATUS_MARKERS = {
  poison: "sm-poison", // 중독 후보 — 초록 점
  guard: "sm-guard",   // 보호 후보 — 파란 사각
  mark: "sm-mark",     // 표식 후보 — 호박 점
  buff: "sm-buff",     // 강화 후보 — 보라 마름모
};

function statusMarkersHTML(markers) {
  if (!Array.isArray(markers) || markers.length === 0) return "";
  return markers
    .slice(0, 3)
    .map((m) => {
      const cls = STATUS_MARKERS[m];
      return cls ? `<span class="status-marker ${cls}" aria-label="${m}"></span>` : "";
    })
    .join("");
}

// Status & Effect Foundation 01 — 표시 마커 파생.
//   실제 상태(unit.statuses)에서 마커를 파생하고, statusMarkers(표시 전용 — preview 등)는
//   뒤에 합친다(중복 제거, 최대 3 유지). 실데이터와 표시 데이터가 여기서만 합류한다.
function displayMarkers(unit) {
  const derived = (unit.statuses || []).map((s) => s.type);
  const displayOnly = (unit.statusMarkers || []).filter((m) => !derived.includes(m));
  return [...derived, ...displayOnly].slice(0, 3);
}

function createFieldUnit(unit) {
  const id = unit.id || "unknown";
  const isParty = unit.team === "party";
  const deadClass = unit.isDead ? " dead" : "";

  // Combat HUD 01a: 아바타 facing 규칙
  //   전투 구도 = 아군 좌하단 / 적 우상단.
  //   아군은 오른쪽 위(NE)를 향해 싸우고, 적은 왼쪽 아래(SW)를 향한다.
  //   face-ne / face-sw 클래스를 방향 규칙의 단일 진입점으로 둔다.
  //   (미래: 상대 진영 영웅은 team과 무관하게 face-sw를 받을 수 있어야 함)
  const facingClass = isParty ? "face-ne" : "face-sw";

  // Combat Breath Preview 01: 프리뷰 적은 slot으로 배치(enemy-slot-N), sizeClass로 정예/보스 크기.
  //   Fusion Flow 01: 아군은 배치 슬롯(slotKey → hero-slot-*) 기준 — 전열/후열이 화면에서 읽힌다.
  //   slotKey 없는 구버전 경로는 기존 {id}-pos 유지. 하드코딩 좌표는 모두 CSS(클래스)로만.
  const posClass =
    unit.team === "enemy" && unit.slot !== undefined
      ? `enemy-slot-${unit.slot}`
      : isParty && unit.slotKey
      ? `hero-slot-${unit.slotKey}`
      : `${id}-pos`;
  const sizeClass = unit.sizeClass ? ` ${unit.sizeClass}` : "";

  const wrap = document.createElement("div");
  wrap.className = `unit ${unit.team} ${posClass}${sizeClass} ${facingClass}${deadClass}`;
  wrap.dataset.instanceId = unit.instanceId;
  // Party & Formation Integrity 01: 슬롯-좌표 계약 추적 키(reconcile에서 재배치 감지용)
  if (unit.team === "party") wrap.dataset.slotKey = unit.slotKey || "";
  // Boss Presence Foundation 01: 정예/보스 존재감 hook(일반 적/아군엔 없음). 크기와 분리된 tier.
  if (unit.tier) wrap.dataset.tier = unit.tier;

  // Fusion Flow 01: 신규 직업은 전용 실루엣 전까지 비주얼 donor(visual) 파츠 + CSS 틴트 재사용.
  //   Combat Readability Polish 02: avatar-{avatarKey} 스캐폴드 클래스도 함께 — 추후 루다
  //   CSS 아바타를 이 클래스에 꽂으면 job id 하드코딩 없이 교체된다(전투/카드 공통 hook).
  const visual = unit.visual || id;
  const avatarKey = unit.avatarKey || id;
  const figClass = isParty ? "avatar" : "monster";
  const parts = (AVATAR_PARTS[visual] || [])
    .map((p) => `<span class="part ${p}"></span>`)
    .join("");
  const hpPct = unit.maxHp > 0
    ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)).toFixed(1)
    : "0";

  // Combat Tempo 01: actionGauge(0~100, 100에서 행동) 비율 → 속도 게이지
  //   HP바와 분리된 보조 채널(곧 행동할 기척). 숫자 없음.
  const gaugePct = Math.max(0, Math.min(100, unit.actionGauge ?? 0)).toFixed(1);
  const readyClass = (unit.actionGauge ?? 0) >= 88 ? " ready-soon" : "";

  // Combat HUD 01a: 전투 필드는 아바타 + HP바 중심.
  // 직업/몬스터 이름·HP 숫자 텍스트는 제거 (실루엣으로 전달 / 로컬라이즈 레이아웃 보호).
  // 접근성용 이름은 aria-label로만 보존.
  // Hit Reaction 01: 아바타를 .fig-react로 감싼다.
  //   transform 충돌 회피용 전용 레이어 — .unit(scale) / .fig-react(피격·회복 반응) / .avatar(idle)
  //   세 요소가 각자 transform을 가져 곱연산으로 합성된다.
  // Combat Readability Foundation 01:
  //   - role-pip: 아군 직업 역할 보조 신호(작은 pip, 좌상단, 아바타 안 가림). 이름/숫자 아님.
  //   - status-slots: 상태 마커가 올라갈 자리(상단 중앙). 비어 있으면 표시 없음.
  const rolePip = isParty ? `<span class="role-pip role-${id}" aria-hidden="true"></span>` : "";
  const markers = displayMarkers(unit);
  const markersKey = markers.join(",");
  // Boss Presence Foundation 01: 정예/보스만 약한 존재감 aura(느린 호흡). 아바타 뒤(낮은 z).
  const presenceAura = unit.tier ? `<span class="presence-aura" aria-hidden="true"></span>` : "";

  wrap.setAttribute("aria-label", unit.name);
  wrap.innerHTML = `
    ${presenceAura}
    ${rolePip}
    <div class="status-slots" data-markers="${markersKey}">${statusMarkersHTML(markers)}</div>
    <div class="fig-react">
      <div class="${figClass} ${visual} job-${id} avatar-${avatarKey}">${parts}</div>
    </div>
    <span class="hp-bar"><span class="hp-bar-fill" style="width:${hpPct}%"></span></span>
    <span class="tempo-bar${readyClass}"><span class="tempo-bar-fill" style="width:${gaugePct}%"></span></span>
  `;

  return wrap;
}

/* =========================================================
   Action Feedback 01 — source → target 행동선 / 피격 / 숫자
   루다 action-line-rnd-03-5 문법 이식 (좌표는 실제 유닛 rect에서 계산)
   ========================================================= */

// source anchor: 유닛 박스 내 비율 위치 (확장 가능한 anchor 구조)
const SOURCE_ANCHORS = {
  archer: { fx: 0.18, fy: 0.42 },  // bow
  priest: { fx: 0.82, fy: 0.30 },  // staff tip
  warrior: { fx: 0.70, fy: 0.50 }, // weapon/front
  guardian: { fx: 0.74, fy: 0.26 }, // lance tip (우상단)
  // Fusion Flow 01: 신규 직업은 비주얼 donor의 anchor 재사용
  cleric: { fx: 0.82, fy: 0.30 },   // = priest (staff)
  trickster: { fx: 0.18, fy: 0.42 }, // = archer (bow)
  rogue: { fx: 0.70, fy: 0.50 },    // = warrior (front)
  saint: { fx: 0.82, fy: 0.30 },    // = priest (staff)
  wolf: { fx: 0.16, fy: 0.52 },    // snout (적은 좌측 대면)
  slime: { fx: 0.5, fy: 0.55 },    // body front
  goblin: { fx: 0.5, fy: 0.52 },
};
const TARGET_HIT = { fx: 0.5, fy: 0.5 };       // body / hit-point
const TARGET_HEAL = { fx: 0.5, fy: 0.32 };     // heal-point (상단)
// Combat Readability Polish 02: 피해/회복 숫자는 머리 위에서 시작 → 위로 float.
const TARGET_NUMBER = { fx: 0.5, fy: 0.08 };   // head anchor (유닛 상단)

// Combat Readability Polish 02: 대상별로 현재 떠 있는 숫자 수 — queue/stagger 판단용.
//   같은 유닛에 짧은 간격으로 숫자가 겹치면 위로 쌓고(y-offset) 살짝 delay를 줘서
//   겹쳐 터지지 않게 한다. 대상이 다르면 각자 병렬로 뜬다(서로 영향 없음).
const activeNumbers = new Map();

function unitPoint(instanceId, frac, fieldRect) {
  const el = document.querySelector(
    `#unit-layer [data-instance-id="${instanceId}"]`
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.left - fieldRect.left + frac.fx * r.width,
    y: r.top - fieldRect.top + frac.fy * r.height,
  };
}

// Action Emphasis 01: 시선 우선순위 = acting > line > target reaction > idle.
//   현재 행동 중(acting cue 표시 중)인 유닛 추적 → 그 사이 들어오는
//   target reaction은 생략(같은 유닛에 선언과 피격이 겹쳐 시선이 꼬이지 않게).
const actingUnits = new Set();

// battle.js에서 행동 발생 시 호출 (전투 계산과 분리된 FX 이벤트)
export function playActionFx(event) {
  // Job Grammar 01: kind = 직업 행동 분류(strike/protect/snipe/heal/attack).
  //   현재는 행동선 data-kind 기록만 — 시각 변화 없음. 미래 직업별 FX/로그 확장 hook.
  const { sourceInstanceId, sourceUnitId, targetInstanceId, lineType, kind, isHeal, amount } = event;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;

  const fieldRect = field.getBoundingClientRect();
  const srcFrac = SOURCE_ANCHORS[sourceUnitId] || { fx: 0.5, fy: 0.45 };
  const tgtFrac = isHeal ? TARGET_HEAL : TARGET_HIT;

  // 좌표는 .unit wrap rect 기준 → acting scale(자식 .fig-react)에 영향받지 않음(안정)
  const s = unitPoint(sourceInstanceId, srcFrac, fieldRect);
  const t = unitPoint(targetInstanceId, tgtFrac, fieldRect);
  if (!s || !t) return;

  // 1) 행동자 선언("나야 지금!") — source unit이 먼저 짧게 보인다.
  cueActor(sourceInstanceId, lineType);
  // 1b) 대상 신호("잡혔다") — actor보다 약한 보조 신호. 선이 도착하기 전 대상을 가리킨다.
  spawnTargetCue(targetInstanceId, isHeal);

  // 2) 짧은 선행 뒤 행동선 발사 + 대상 반응. 배속이면 리듬만 살게 더 짧게.
  const speed = Number(field.dataset.speed) || 1;
  const lead = speed === 2 ? 80 : 120;
  // 숫자는 머리 위(head anchor)에서 시작 — 선/펄스는 타격 지점(t) 그대로.
  const tn = unitPoint(targetInstanceId, TARGET_NUMBER, fieldRect) || t;
  const fire = () => {
    spawnLine(layer, s, t, lineType, kind);
    spawnPulse(layer, t, isHeal);
    spawnNumber(layer, tn, targetInstanceId, isHeal, amount);
    reactUnit(targetInstanceId, isHeal);
  };
  setTimeout(fire, lead);
}

// Status & Effect Foundation 01 — 상태 tick FX(poison 등).
//   행동선/펄스/리액션 없이 작은 숫자만 — 기존 숫자 상한(MAX_FX_NUMBERS)을 공유해
//   MAX/다수전에서도 과밀해지지 않는다. 죽는 중/정리된 유닛은 생략.
export function playStatusTickFx({ targetInstanceId, amount, kind }) {
  if (dyingUnits.has(targetInstanceId) || cleanedDead.has(targetInstanceId)) return;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const t = unitPoint(targetInstanceId, TARGET_NUMBER, field.getBoundingClientRect());
  if (!t) return;
  spawnNumber(layer, t, targetInstanceId, false, amount, kind);
}

// Action Emphasis 01: source unit "행동 선언" cue.
//   .fig-react(reaction 전용 transform 레이어)에 acting 클래스를 얹는다 —
//   발밑 고정 scale pop + 살짝 들썩(위치는 .unit 기준이라 안 밀림).
//   unit-layer는 매 tick reconcile되므로 이번 tick 렌더 이후(rAF) 적용.
//   우선순위: 진행 중이던 target reaction을 지우고 acting을 올린다(acting > reaction).
function cueActor(sourceInstanceId, lineType) {
  requestAnimationFrame(() => {
    const unit = document.querySelector(
      `#unit-layer [data-instance-id="${sourceInstanceId}"]`
    );
    if (!unit) return;
    const fig = unit.querySelector(".fig-react");
    if (!fig) return;
    const cls = lineType === "heal" ? "acting-soft" : "acting";
    fig.classList.remove("react-hit", "react-heal", "acting", "acting-soft");
    actingUnits.add(sourceInstanceId);
    void fig.offsetWidth; // reflow — 재진입 시 애니메이션 재시작 보장
    fig.classList.add(cls);
    fig.addEventListener(
      "animationend",
      () => {
        fig.classList.remove(cls);
        actingUnits.delete(sourceInstanceId);
      },
      { once: true }
    );
  });
}

// Hit Reaction 01: 맞은/회복받은 유닛 본체가 짧게 반응
//   unit-layer는 매 tick 재구성되므로, 이번 tick의 renderGame 이후(rAF)
//   새로 그려진 .fig-react 요소에 반응 클래스를 얹는다.
//   Action Emphasis 01: 그 유닛이 지금 행동 선언 중이면 reaction은 생략(acting 우선).
function reactUnit(targetInstanceId, isHeal) {
  requestAnimationFrame(() => {
    if (actingUnits.has(targetInstanceId)) return; // acting > target reaction
    // Combat Lifecycle Polish 01: 죽는 중/정리된 유닛은 hit 반응 생략(죽음 연출 우선·중복 방지).
    if (dyingUnits.has(targetInstanceId) || cleanedDead.has(targetInstanceId)) return;
    const unit = document.querySelector(
      `#unit-layer [data-instance-id="${targetInstanceId}"]`
    );
    if (!unit) return;
    const fig = unit.querySelector(".fig-react");
    if (!fig) return;
    const cls = isHeal ? "react-heal" : "react-hit";
    fig.classList.remove("react-hit", "react-heal");
    void fig.offsetWidth; // reflow — 동일 클래스 재적용 시 애니메이션 재시작 보장
    fig.classList.add(cls);
    fig.addEventListener(
      "animationend",
      () => fig.classList.remove(cls),
      { once: true }
    );
  });
}

// Action Line Variety 01: 행동선을 타입별로 경로/성격이 다르게.
//   source→target 문법/anchor 구조 유지(좌표는 전부 실제 s,t·len·방향에서 파생,
//   하드코딩 좌표 없음). 모든 선이 같은 직선처럼 보이지 않게 타입별 변주:
//   - straight(궁수): 거의 직선 + 날카로운 화살촉 → "꽂혔다"
//   - slash(전사/수호자): 큰 호 + 베기 잔상 + 교차 컷 → 칼자국(빔 아님)
//   - heal(사제): 반대로 휘는 부드러운 점선 + 따뜻한 입자 → 회복
//   - enemy(몬스터): 거친 흔들림 + 거친 점선 + 갈퀴 → 어둡고 다른 결
//   공통: 시작 투명→끝 선명, 끝 impact 장식, 빠른 등장 후 느린 fade(스스슥).
const SVG_NS = "http://www.w3.org/2000/svg";
let __fxLineSeq = 0;

// 타입별 경로/끝점 성격. bowF=길이비례 곡률, flip=휘는 방향, head=끝 장식.
//   Living Battle Screen 04: 궁수는 직선성 유지, 전사/수호자(slash)만 곡률을 적극 강화
//   ("바나나슛" — 빈 공간(우하/좌상)을 살짝 경유해 휘어 꽂힘). 직선↔곡선 대비 유지.
const LINE_STYLE = {
  straight: { bowF: 0.05, bowMin: 3,  bowMax: 8,  flip: 1,  head: "arrow", draw: true },
  slash:    { bowF: 0.36, bowMin: 26, bowMax: 82, flip: 1,  head: "slash", draw: true, ghost: true },
  heal:     { bowF: 0.34, bowMin: 20, bowMax: 56, flip: -1, head: "spark", draw: false },
  enemy:    { bowF: 0.16, bowMin: 8,  bowMax: 22, flip: 1,  head: "claw",  draw: false, rough: true },
};

// FX Density Guard 01: 동시에 떠 있는 행동선/숫자 상한 — 다수전·MAX 누적 방지.
const MAX_FX_LINES = 7;
const MAX_FX_NUMBERS = 8;

function spawnLine(layer, s, t, lineType, kind) {
  // 상한 초과 시 가장 오래된 선 제거(읽힘 우선, 화면이 무너지지 않게)
  const lines = layer.querySelectorAll(".fx-svg");
  if (lines.length >= MAX_FX_LINES) lines[0].remove();

  const w = layer.clientWidth || layer.offsetWidth;
  const h = layer.clientHeight || layer.offsetHeight;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;

  const cfg = LINE_STYLE[lineType] || LINE_STYLE.straight;

  // 수직 단위벡터로 중간점을 밀어 곡선(arc). 타입별 곡률/방향 변주.
  const px = -dy / len;
  const py = dx / len;
  const bow =
    Math.min(cfg.bowMax, Math.max(cfg.bowMin, len * cfg.bowF)) * cfg.flip;
  // enemy: 길이 기반의 약한 흔들림(거친 궤적) — 하드코딩 좌표 아님
  const jitter = cfg.rough ? (Math.random() - 0.5) * Math.min(10, len * 0.06) : 0;
  const mx = (s.x + t.x) / 2 + px * (bow + jitter);
  const my = (s.y + t.y) / 2 + py * (bow + jitter);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `fx-svg fx-svg--${lineType}`);
  if (kind) svg.dataset.kind = kind; // Job Grammar 01 — 직업 행동 분류 hook(시각 변화 없음)
  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const gid = `fxg-${++__fxLineSeq}`;
  const defs = document.createElementNS(SVG_NS, "defs");
  const grad = document.createElementNS(SVG_NS, "linearGradient");
  grad.setAttribute("id", gid);
  grad.setAttribute("gradientUnits", "userSpaceOnUse");
  grad.setAttribute("x1", s.x);
  grad.setAttribute("y1", s.y);
  grad.setAttribute("x2", t.x);
  grad.setAttribute("y2", t.y);
  // 시작점 투명 → 끝점 선명
  grad.innerHTML =
    '<stop offset="0%" stop-color="currentColor" stop-opacity="0"></stop>' +
    '<stop offset="55%" stop-color="currentColor" stop-opacity="0.35"></stop>' +
    '<stop offset="100%" stop-color="currentColor" stop-opacity="0.95"></stop>';
  defs.appendChild(grad);
  svg.appendChild(defs);

  // slash: 더 크게 휜 잔상 스트로크(베기 sweep 느낌) — 본선 뒤에 깔린다
  if (cfg.ghost) {
    const gbow = bow * 1.4;
    const gx = (s.x + t.x) / 2 + px * gbow;
    const gy = (s.y + t.y) / 2 + py * gbow;
    const ghost = document.createElementNS(SVG_NS, "path");
    ghost.setAttribute("class", "fx-path fx-path--ghost");
    ghost.setAttribute("d", `M ${s.x} ${s.y} Q ${gx} ${gy} ${t.x} ${t.y}`);
    ghost.setAttribute("stroke", `url(#${gid})`);
    ghost.setAttribute("pathLength", "1");
    svg.appendChild(ghost);
  }

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", "fx-path");
  path.setAttribute("d", `M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`);
  path.setAttribute("stroke", `url(#${gid})`);
  // dash draw-in 타입만 pathLength 정규화로 "그려짐"(꽂힘).
  //   점선 타입(heal/enemy)은 실제 dash 패턴이라 정규화하지 않는다.
  if (cfg.draw) path.setAttribute("pathLength", "1");
  svg.appendChild(path);

  // 끝점 장식 — 끝 접선 방향(t - control)으로 회전, 타입별 성격
  const ang = (Math.atan2(t.y - my, t.x - mx) * 180) / Math.PI;
  appendHead(svg, cfg.head, t, ang);

  // 제거는 svg 자체의 수명 애니메이션 종료에서만(자식 animationend 버블 제외)
  svg.addEventListener("animationend", (e) => {
    if (e.target === svg) svg.remove();
  });
  layer.appendChild(svg);
}

// 끝점 장식: 타입별로 다른 "꽂힘"의 결.
function appendHead(svg, type, t, ang) {
  const el =
    type === "arrow"
      ? makeNS("path", {
          class: "fx-head fx-head--arrow",
          d: "M 0 0 L -10 -5 L -10 5 Z",
          transform: `translate(${t.x} ${t.y}) rotate(${ang})`,
        })
      : type === "slash"
      ? makeNS("g", {
          class: "fx-head fx-head--slash",
          transform: `translate(${t.x} ${t.y}) rotate(${ang})`,
        },
          '<path class="fx-cut fx-cut--a" d="M -2 -10 Q 3 0 -1 10"></path>' +
          '<path class="fx-cut fx-cut--b" d="M -10 -5 Q -1 1 7 -3"></path>')
      : type === "spark"
      ? makeNS("g", {
          class: "fx-head fx-head--spark",
          transform: `translate(${t.x} ${t.y})`,
        },
          '<path class="fx-plus" d="M 0 -7 L 0 7 M -7 0 L 7 0"></path>' +
          '<circle class="fx-mote" cx="6.5" cy="-5.5" r="1.7"></circle>' +
          '<circle class="fx-mote" cx="-6" cy="4.5" r="1.4"></circle>')
      : makeNS("g", {
          class: "fx-head fx-head--claw",
          transform: `translate(${t.x} ${t.y}) rotate(${ang})`,
        },
          '<path class="fx-claw" d="M -11 -7 L 0 0 L -11 7"></path>' +
          '<path class="fx-claw fx-claw--dim" d="M -13 -1 L -2 1"></path>');
  svg.appendChild(el);
}

function makeNS(tag, attrs, innerHTML) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (innerHTML != null) el.innerHTML = innerHTML;
  return el;
}

function spawnPulse(layer, t, isHeal) {
  const p = document.createElement("span");
  p.className = `fx-pulse${isHeal ? " fx-pulse--heal" : ""}`;
  p.style.left = `${t.x}px`;
  p.style.top = `${t.y}px`;
  p.addEventListener("animationend", () => p.remove());
  layer.appendChild(p);
}

function spawnNumber(layer, t, targetInstanceId, isHeal, amount, variant) {
  // FX Density Guard 01: 숫자 상한 초과 시 가장 오래된 것 제거(MAX/다수전 누적 방지)
  const nums = layer.querySelectorAll(".fx-number");
  if (nums.length >= MAX_FX_NUMBERS) nums[0].remove();

  // Combat Readability Polish 02 — 같은 대상에 떠 있는 숫자 수(idx)로 stagger.
  //   idx만큼 위로 쌓고(겹침 방지) 짧은 delay(최대 4단계)를 줘 순서대로 뜬다.
  //   너무 밀리지 않게 stagger 상한을 둔다(큐 누적 방지).
  const idx = activeNumbers.get(targetInstanceId) || 0;
  activeNumbers.set(targetInstanceId, idx + 1);
  const step = Math.min(idx, 4);

  const n = document.createElement("span");
  n.className =
    `fx-number ${isHeal ? "fx-number--heal" : "fx-number--dmg"}` +
    (variant ? ` fx-number--${variant}` : ""); // 상태 tick 변주(poison 등)
  n.textContent = `${isHeal ? "+" : "-"}${amount}`;
  n.style.left = `${t.x}px`;
  n.style.top = `${t.y - step * 15}px`; // 위로 쌓기
  if (step > 0) n.style.animationDelay = `${step * 80}ms`;

  const done = () => {
    n.remove();
    const c = (activeNumbers.get(targetInstanceId) || 1) - 1;
    if (c <= 0) activeNumbers.delete(targetInstanceId);
    else activeNumbers.set(targetInstanceId, c);
  };
  n.addEventListener("animationend", done);
  layer.appendChild(n);
}

// 로그 오버레이 — 최근 1~2줄만 전장 상단 좌측에 약하게
function renderLogOverlay(state) {
  const el = document.getElementById("log-overlay");
  if (!el) return;

  const recent = state.logs.slice(-2);
  if (recent.length === 0) {
    el.hidden = true;
    return;
  }
  el.innerHTML = recent
    .map((text) => `<div class="log-line">${text}</div>`)
    .join("");
  el.hidden = false;
}
