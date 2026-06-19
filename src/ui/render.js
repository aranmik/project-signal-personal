import { BEGINNER_THEME, STAGE_THEMES } from "../data/stages.js";
import { ROUTE_TYPES, bossTimingLabel, bossFury, bossReadinessPressure, bossMenace, depthAtmosphere, routeReward, PRESSURE_HELP } from "../data/routes.js";
import { availableFusions, slotPreference, combatRoleLabelOf, combatRoleOf, BASE_JOBS, ADVANCED_JOBS, SECOND_CLASS_JOBS } from "../data/jobs.js";
import { jobStatusOf, IMPL_LABEL, VIS_LABEL } from "../data/jobStatus.js";
import { REWARDS, rewardById, REWARD_MAX_LEVEL } from "../data/rewards.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { SLOT_ORDER, SLOT_NAMES, partySizeOf, LAYOUT_PREVIEW_CASES } from "../core/state.js";
import { avatarSpec, avatarFigureHTML, CODEX_ENTRIES, CODEX_STATUS_LABEL } from "../data/avatars.js";

function jobName(id) {
  return UNIT_TEMPLATES.party[id]?.name || id;
}

// Avatar Import 01: 직업 id → SR 아바타 미니 figure(합체 결과/영입 카드 공통).
//   avatarKey 기반 — 전투 유닛/직업 카드와 같은 아바타가 카드에도 보인다.
function jobAvatarHTML(id, extraClass = "av-fit--cast") {
  const key = UNIT_TEMPLATES.party[id]?.avatarKey || id;
  const spec = avatarSpec(key);
  return avatarFigureHTML(spec.sr, spec.parts, extraClass);
}

export function renderGame(state) {
  const titleScreen = document.getElementById("title-screen");
  const jobSelect = document.getElementById("job-select");
  const growthPanel = document.getElementById("growth-panel");
  const fusionPanel = document.getElementById("fusion-panel");
  const fusionResultPanel = document.getElementById("fusion-result-panel");
  const recruitPanel = document.getElementById("recruit-panel");
  const arrangePanel = document.getElementById("arrange-panel");
  const routePanel = document.getElementById("route-panel");
  const restPanel = document.getElementById("rest-panel");
  const codexScreen = document.getElementById("codex-screen");
  const stageSelect = document.getElementById("stage-select");
  const battleView = document.getElementById("battle-view");

  titleScreen.hidden = true;
  jobSelect.hidden = true;
  if (codexScreen) codexScreen.hidden = true;
  if (stageSelect) stageSelect.hidden = true;
  growthPanel.hidden = true;
  fusionPanel.hidden = true;
  fusionResultPanel.hidden = true;
  recruitPanel.hidden = true;
  arrangePanel.hidden = true;
  if (routePanel) routePanel.hidden = true;
  if (restPanel) restPanel.hidden = true;
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

  // Start Flow UX Polish 01: 스테이지 테마 선택 — 초보자의 길만 진입 가능.
  if (state.screen === "stageSelect") {
    if (stageSelect) {
      stageSelect.hidden = false;
      renderStageSelect();
    }
    return;
  }

  // Job Codex Entry Foundation: 직업 도감(관람용) — SR-01~24만, 선택/시작 없음.
  if (state.screen === "codex") {
    if (codexScreen) {
      codexScreen.hidden = false;
      renderCodex();
    }
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

  // Run Structure 01A: 여정 선택 화면 (전투 후 다음 길을 고른다)
  if (state.screen === "route") {
    if (routePanel) {
      routePanel.hidden = false;
      renderRoutePanel(state);
    }
    return;
  }

  // Rest Route Polish 01: 이슬 쉼터 휴식 장면
  if (state.screen === "rest") {
    if (restPanel) {
      restPanel.hidden = false;
      renderRestPanel(state);
    }
    return;
  }

  battleView.hidden = false;
  battleView.dataset.status = state.battle.status;
  renderHud(state);
  renderUnits(state);
  renderEncounterHud(state);
  renderLogOverlay(state);
  renderResultOverlay(state);
  renderDevBar(state); // Battlefield Preview & Layout Tune 01 — 레이아웃 프리뷰 케이스 전환 바
}

// Battlefield Preview & Layout Tune 01 — Dev 레이아웃 프리뷰에서만 케이스 전환 바를 노출.
function renderDevBar(state) {
  const bar = document.getElementById("dev-bar");
  if (!bar) return;
  if (state.battle.previewKind !== "layout") { bar.hidden = true; return; }
  bar.hidden = false;
  const active = state.run.layoutCase;
  const cases = LAYOUT_PREVIEW_CASES.map(
    (c) => `<button type="button" class="dev-case${c.id === active ? " active" : ""}" data-dev-case="${c.id}">${c.label}</button>`
  ).join("");
  bar.innerHTML = `<span class="dev-bar-label">Dev 프리뷰</span>${cases}<button type="button" class="dev-case dev-exit" data-dev-exit>타이틀로</button>`;
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
    // Run Structure 01B — 보스 심도 강화 단계를 라벨에 반영(분노/광폭).
    // Boss Readiness Pressure 02 — 위압 활성(보스에 menace 메타) 시 라벨에 "· 위압" 추가(분노/광폭과 별개 축).
    const label = unit.tier === "boss"
      ? (unit.bossFury >= 2 ? "BOSS · 광폭" : unit.bossFury >= 1 ? "BOSS · 분노" : "BOSS") + (unit.menace ? " · 위압" : "")
      : "ELITE";
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

  // Start Flow UX Polish 01 — 합체 성공 강조: 큰 프레임 + 결과 sparkle/glow + 진입 축하 파티클.
  //   프레임 안 직업명 텍스트는 계속 제거(아바타 단독). 결과 프레임만 특별 강조.
  document.getElementById("fusion-result-body").innerHTML = `
    <div class="flow-kicker">합체 성공</div>
    <h2 class="flow-heading">${jobName(fusion.result)} 탄생!</h2>
    <div class="fusion-cast fusion-cast--big">
      <span class="cast-card cast-mat" aria-label="${jobName(m1)}">${jobAvatarHTML(m1, "av-fit--castbig")}</span>
      <span class="cast-plus">+</span>
      <span class="cast-card cast-mat" aria-label="${jobName(m2)}">${jobAvatarHTML(m2, "av-fit--castbig")}</span>
      <span class="cast-arrow">→</span>
      <span class="cast-card cast-result" aria-label="${jobName(fusion.result)}">
        ${jobAvatarHTML(fusion.result, "av-fit--castbig")}
        <span class="cast-glow" aria-hidden="true"></span>
        <span class="cast-sparkles" aria-hidden="true"></span>
      </span>
    </div>
    <p class="flow-note">${fusion.birthLine || "두 영웅의 힘이 하나로 모였다."}<br>새로운 영웅 <b>${jobName(fusion.result)}</b> — 파티에 합류했다.</p>
    <p class="flow-note flow-note--dim">빈자리를 채울 새 동료를 영입하세요.</p>
    <button type="button" id="fusion-continue" data-fusion-continue>동료 영입하기</button>
  `;
  spawnFusionCelebration();
}

// Start Flow UX Polish 01 — 합체 성공 진입 축하 연출(짧고 가벼운 confetti + 결과 sparkle).
//   결과 프레임 안 .cast-sparkles에 작은 파티클을 잠깐 띄우고 animationend로 정리(누적 방지).
//   반복 합체 시 이전 파티클을 먼저 비워 잔여가 남지 않게 한다.
function spawnFusionCelebration() {
  const host = document.querySelector("#fusion-result-body .cast-sparkles");
  if (!host) return;
  host.innerHTML = ""; // 이전 잔여 정리
  const COLORS = ["#f0d36a", "#9fe6cf", "#9ad4f0", "#ffd2d8", "#c7a2ff"];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const p = document.createElement("span");
    p.className = "cast-confetti";
    const ang = (Math.PI * 2 * i) / N + Math.random() * 0.4;
    const dist = 38 + Math.random() * 30;
    p.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(ang) * dist - 10}px`);
    p.style.background = COLORS[i % COLORS.length];
    p.style.animationDelay = `${Math.random() * 90}ms`;
    p.addEventListener("animationend", () => p.remove());
    host.appendChild(p);
  }
}

// Recruit Panel Polish/Arrange Hotfix 01 — 현재 편성 파티 2×2: "아바타와 빈자리"만(전열/후열/직업명 텍스트 X).
//   채워진 슬롯=아바타만(직업명은 aria-label로만), 빈 슬롯=＋ + "빈자리". 각 슬롯은 탭하면 위치 교체(swap)되는 버튼.
//   pickedSlot=교체용으로 선택된 슬롯(테두리 빛남). 내부 슬롯 키(f0/f1/b0/b1=전열/후열)는 그대로 유지.
function partyPreviewGridHTML(formation, pickedSlot) {
  return SLOT_ORDER.map((k) => {
    const job = formation?.[k];
    const inner = job
      ? `<span class="pf-ava">${jobAvatarHTML(job, "av-fit--card")}</span>`
      : `<span class="pf-empty-mark">＋</span><span class="pf-empty-label">빈자리</span>`;
    return `<button type="button" class="pf-slot pf-${k}${job ? " filled" : " empty"}${k === pickedSlot ? " picked" : ""}" data-pf-slot="${k}" aria-label="${job ? jobName(job) : "빈자리"}">${inner}</button>`;
  }).join("");
}

// Recruit UX Rebuild 01 — 동료 선택을 한 화면에서: 현재 파티(상단) + 설명(중단) + 후보 3(하단) + 다음 여정으로(최하단).
//   후보를 누르면 현재 파티 미리보기에 즉시 반영되고, 다른 후보로 교체 가능. 별도 배치 단계 없음.
function renderRecruitPanel(state) {
  const f = state.run.formation || {};
  // Recruit Panel Arrange Hotfix 01 — 위치 교체용으로 선택된 슬롯(재렌더에도 유지되게 패널 dataset에 보관).
  const pickedSlot = document.getElementById("recruit-panel").dataset.picked || null;
  const candidates = state.run.recruitOffer || [];
  const preview = state.run.recruitPreview;

  const cards = candidates.length
    ? candidates.map((id) =>
        `<button type="button" class="recruit-card${preview === id ? " selected" : ""}" data-recruit="${id}" aria-label="${jobName(id)}">
          <span class="recruit-ava">${jobAvatarHTML(id, "av-fit--recruit")}</span>
          <span class="recruit-name">${jobName(id)}</span>
        </button>`
      ).join("")
    : `<p class="flow-note">영입 가능한 동료가 없습니다.</p>`;

  // Deep Forest Reward Rebuild 01 — 문맥별 문구(합체 보충 / 깊은 수풀 보상 / 4인 확장).
  const ctx = state.run.recruitContext;
  const heading = ctx === "fusion" ? "빈자리를 채울 동료를 선택하세요"
    : ctx === "deepforest" ? "수풀에서 새 동료를 만났습니다"
    : "새 동료를 영입하세요";
  const note = ctx === "deepforest"
    ? "깊은 수풀의 보상 — 현재 파티에 없는 동료입니다. 후보를 눌러 미리 배치해보세요."
    : "현재 파티에 없는 동료가 찾아왔습니다. 후보를 눌러 미리 배치해보세요.";

  // 후보가 있으면 선택해야 활성, 후보가 없으면(영입 불가) 바로 진행 가능.
  const canProceed = !!preview || candidates.length === 0;

  document.getElementById("recruit-body").innerHTML = `
    <div class="flow-kicker">현재 편성된 파티</div>
    <div class="party-preview-grid">${partyPreviewGridHTML(f, pickedSlot)}</div>
    <h2 class="flow-heading">${heading}</h2>
    <p class="flow-note">${note}</p>
    <div id="recruit-list">${cards}</div>
    <button type="button" class="flow-next recruit-next${canProceed ? "" : " is-disabled"}" data-recruit-confirm ${canProceed ? "" : "disabled"}>다음 여정으로</button>
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

// Boss Early Challenge Pressure 01 — 현재 런 상태에서 보스 준비 압박을 계산(카드/HUD 공용).
//   파티 인원은 state.js와 동일하게 formation 기준(partySizeOf)으로 본다 — 보스 스케일과 라벨 일치.
function readinessOf(state) {
  return bossReadinessPressure({
    depth: state.run.depth,
    bossKeys: state.run.bossKeys || 0,
    fusionCount: state.run.fusionCount || 0,
    partySize: partySizeOf(state.run),
  });
}

// Run Structure 01A — 여정 선택 화면.
//   "전투는 자동이지만, 여정은 내가 고른다." 2~3개 카드(읽히는 반고정). 각 카드는 짧은 이름/설명.
//   보스문 카드는 열쇠 보유 시에만 오퍼에 포함되며 도전 타이밍 감각(이른/빠른/적정…)을 함께 보여준다.
// Rest Route Polish 01 — 이슬 쉼터 휴식 장면(전투가 아닌 회복/정비 선택지).
//   파티 아바타가 작은 모닥불 주변에서 숨을 고르는 느낌 + 회복 안내. CSS/HTML 기반의 가벼운 연출.
//   회복은 chooseRoute(rest)에서 이미 적용됨 — 이 화면은 "쉬어간다"를 읽히게 하고 여정으로 잇는다.
function renderRestPanel(state) {
  const f = state.run.formation || {};
  const jobs = SLOT_ORDER.map((k) => f[k]).filter(Boolean);
  const heroes = jobs
    .map((id) => `<span class="rest-hero" aria-label="${jobName(id)}">${jobAvatarHTML(id, "av-fit--card")}<span class="rest-hp">＋</span></span>`)
    .join("");
  const body = document.getElementById("rest-body");
  if (!body) return;
  body.innerHTML = `
    <h2 class="flow-heading">이슬 쉼터</h2>
    <div class="rest-scene">
      <div class="rest-heroes">${heroes}</div>
      <div class="rest-campfire" aria-hidden="true">
        <span class="rest-flame"></span>
        <span class="rest-flame rest-flame--b"></span>
        <span class="rest-embers"></span>
        <span class="rest-logs"></span>
      </div>
    </div>
    <p class="flow-note">이슬 쉼터에서 잠시 숨을 고릅니다.<br>파티가 완전히 회복했습니다.</p>
    <button type="button" class="route-card rest-continue" data-rest-continue>여정을 잇는다</button>
  `;
}

function renderRoutePanel(state) {
  const choices = state.run.routeChoices || [];
  const cards = choices.map((id) => {
    const rt = ROUTE_TYPES[id];
    if (!rt) return "";
    let extra = "";
    let pressureClass = "";
    if (id === "boss") {
      // Run Structure 01B — 보스 카드에 도전 타이밍 + 심도 강화 단계(분노/광폭)를 함께 보여준다.
      const fury = bossFury(state.run.depth);
      const furyTag = fury.label ? ` · ${fury.label}` : "";
      // Boss Early Challenge Pressure 01 — 준비 상태(현재/권장)와 무모/성급 경고를 카드에서 읽힌다.
      //   보스문은 그래도 누를 수 있다(하드락 없음) — 경고는 "이대로 가면 압도당한다"는 신호.
      //   준비 양호(level 0)면 경고 테두리를 붙이지 않는다(적정 도전 오경보 방지).
      const ready = readinessOf(state);
      const warnClass = ready.level >= 2 ? " route-readiness--reckless" : ready.level === 1 ? " route-readiness--hasty" : "";
      const warnTag = ready.label ? ` · <b>${ready.label}</b>` : "";
      if (ready.level > 0) pressureClass = " route-card--boss-pressure";
      // Boss Readiness Pressure 02 — Elite Key Seal: 열쇠 진행도 + 위압 남음/해제 상태를 카드에서 읽힌다.
      //   열쇠 1개=문은 열리되 위압 남음(빠르지만 무모) / 열쇠 2개+=위압 해제(정예를 모두 넘은 정상 도전).
      const menace = bossMenace(state.run.bossKeys || 0);
      const keysShown = Math.min(state.run.bossKeys || 0, menace.needKeys);
      if (menace.active) pressureClass = " route-card--boss-pressure";
      const menaceHtml = menace.active
        ? `<span class="route-menace route-menace--active"><b>열쇠 ${keysShown}/${menace.needKeys} · 위압 남음</b><br>사자왕이 피해를 덜 받고, 매턴 강해집니다.<br>두 번째 정예를 넘으면 위압 해제</span>`
        : `<span class="route-menace route-menace--sealed"><b>열쇠 ${keysShown}/${menace.needKeys} · 위압 해제</b><br>정예의 시험을 넘어 사자왕의 가호가 약해졌습니다.</span>`;
      extra = `<span class="route-timing">${bossTimingLabel(state.run.depth)}${furyTag}</span>
        ${menaceHtml}
        <span class="route-readiness${warnClass}">${ready.current}${warnTag}</span>
        <span class="route-recommend">${ready.recommend}</span>`;
    } else {
      // Reward Pressure 01 — 일반/위험/정예/휴식 카드에 보상·위험 성격 태그(고민하는 맛).
      const rw = routeReward(id);
      if (rw.cardTag) extra = `<span class="route-reward-tag route-reward-tag--${rw.rewardTier}">${rw.cardTag}</span>`;
    }
    return `<button type="button" class="route-card route-card--${id}${pressureClass}" data-route="${id}">
      <span class="route-title">${rt.title}</span>
      <span class="route-sub">${rt.sub}</span>
      ${extra}
    </button>`;
  }).join("");

  // Run Structure 01C — 여정 선택 화면에서도 심도 분위기를 보여 "지금 너무 깊다"가 읽히게.
  const atmo = depthAtmosphere(state.run.depth);
  const atmoLine = atmo.label
    ? `<p class="route-atmo route-atmo--${atmo.tier}">${atmo.label}</p>`
    : "";

  document.getElementById("route-body").innerHTML = `
    <div class="flow-kicker">${BEGINNER_THEME.name} · 심도 ${state.run.depth}</div>
    <h2 class="flow-heading">다음 여정을 고르세요</h2>
    <p class="flow-note">전투는 자동이지만, 여정은 내가 고른다.</p>
    <div class="route-status">
      <span class="route-stat">심도 <b>${state.run.depth}</b></span>
      <span class="route-stat">경계도 <b>${state.run.alertness}</b></span>
      <span class="route-stat">보스 열쇠 <b>${state.run.bossKeys}</b></span>
    </div>
    ${atmoLine}
    <p class="route-help">${PRESSURE_HELP}</p>
    <div id="route-list">${cards}</div>
  `;
}

// Start Flow UX Polish 01 — 스테이지 테마 선택 화면.
//   5개 테마를 보여주되 초보자의 길만 진입 가능(나머지 잠금/dimmed). 전투 로직 불변.
function renderStageSelect() {
  const host = document.getElementById("stage-select-inner");
  if (!host) return;

  const cards = STAGE_THEMES.map((t) => {
    const lock = t.locked
      ? `<span class="theme-lock">잠김</span>`
      : `<span class="theme-go">▶</span>`;
    return `<button type="button" class="theme-card${t.locked ? " locked" : ""}"
        data-theme="${t.id}"${t.locked ? " disabled aria-disabled=\"true\"" : ""}>
      <span class="theme-name">${t.name}</span>
      <span class="theme-desc">${t.desc}</span>
      ${lock}
    </button>`;
  }).join("");

  host.innerHTML = `
    <div class="stage-header">
      <button type="button" id="stage-back" data-stage-back>← 타이틀로</button>
      <div class="stage-title-wrap">
        <h2>스테이지 선택</h2>
        <p>지금은 <b>초보자의 길</b>만 열려 있습니다. 다른 길은 곧 공개됩니다.</p>
      </div>
    </div>
    <div class="theme-list">${cards}</div>
  `;
}

// Job Codex Entry Foundation — 직업 도감(관람용 창구).
//   SR-01~24를 카드 그리드로 보여준다. 기본/합체/준비 중 상태만 표시 —
//   직업을 눌러도 파티/게임에 아무 변화가 없다(관람 전용, 발견/저장 시스템 없음).
function renderCodex() {
  const host = document.getElementById("codex-inner");
  if (!host) return;

  // Codex Detail Status 01 — 카드를 클릭 가능한 버튼으로(직업 선택 시 하단 상태판 표시). data-job = 직업 id.
  const cards = CODEX_ENTRIES.map((e) => {
    const fig = avatarFigureHTML(e.sr, e.parts, "av-fit--codex");
    const statusLabel = CODEX_STATUS_LABEL[e.status] || "";
    const roleLabel = combatRoleLabelOf(e.job);
    const roleLine = roleLabel ? `<span class="codex-role">성향: ${roleLabel}</span>` : "";
    return `<button type="button" class="codex-card codex-card--${e.status}" data-codex-job="${e.job}" aria-label="${e.name} 상태판 열기">
      <div class="codex-stage">${fig}</div>
      <div class="codex-meta">
        <span class="codex-code">${e.code}</span>
        <span class="codex-name">${e.name}</span>
        ${roleLine}
      </div>
      <span class="codex-tag codex-tag--${e.status}">${statusLabel}</span>
    </button>`;
  }).join("");

  host.innerHTML = `
    <div class="codex-header">
      <button type="button" id="codex-back" data-codex-back>← 타이틀로</button>
      <div class="codex-title-wrap">
        <h2>직업 도감</h2>
        <p>SR-01 ~ SR-24. 직업을 누르면 <b>현재 구현 상태판</b>이 열립니다(개발/기획 확인용).</p>
      </div>
    </div>
    <div class="codex-grid">
      ${cards}
      <!-- Hero UX Polish 01C — 상세 패널을 그리드 안에 두고(전폭) 클릭한 카드 행 아래로 이동시키는 아코디언. 기본 닫힘. -->
      <div id="codex-detail" class="codex-detail" data-open-job="" hidden></div>
    </div>
    <button type="button" class="flow-next" data-codex-back>타이틀로 돌아가기</button>
  `;
}

// Hero UX Polish 01C — 도감 상세 아코디언 토글: 클릭한 카드의 "행 끝" 뒤로 상세 패널을 옮겨 카드 바로 아래(전폭)에 펼친다.
//   같은 직업이 열려 있으면 닫는다(토글). 항상 하나만 열림(단일 패널을 이동). jobStatus 데이터/전투 로직 변경 없음.
export function toggleCodexDetail(jobId) {
  const grid = document.querySelector(".codex-grid");
  const el = document.getElementById("codex-detail");
  if (!grid || !el) return;
  if (!el.hidden && el.dataset.openJob === jobId) { closeCodexDetail(); return; }
  const cards = [...grid.querySelectorAll(".codex-card")];
  const idx = cards.findIndex((c) => c.dataset.codexJob === jobId);
  if (idx < 0) return;
  // 2열 그리드: 왼쪽 카드(짝수 인덱스)면 같은 행 오른쪽 카드 뒤에, 오른쪽 카드면 자기 뒤에 삽입 → 행 아래 전폭.
  const rowEndIdx = idx % 2 === 0 ? Math.min(idx + 1, cards.length - 1) : idx;
  cards[rowEndIdx].insertAdjacentElement("afterend", el);
  renderCodexDetail(jobId);
  el.dataset.openJob = jobId;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function closeCodexDetail() {
  const el = document.getElementById("codex-detail");
  if (!el) return;
  el.hidden = true;
  el.dataset.openJob = "";
}

// Codex Detail Status 01 — 직업 단계(기본/1차/2차 씨앗) 파생(배열 소속 단일 출처).
function jobTierLabel(jobId) {
  if (BASE_JOBS.includes(jobId)) return "기본";
  if (ADVANCED_JOBS.includes(jobId)) return "1차";
  if (SECOND_CLASS_JOBS.includes(jobId)) return "2차 씨앗";
  return "미정";
}

// Codex Detail Status 01 — combatRole → 성장(훈련) 방향 한 줄(보상 UI는 미변경, 참고 표시만).
function trainingHintFor(jobId) {
  const role = combatRoleOf(jobId);
  // Diversification 02 — 회복은 역할(healer) 훈련이 아니라 "회복 훈련(파티 공통, 받는 치유량)"으로 분리됨.
  const roleTrain = { tank: "탱커 훈련", melee: "근접 훈련", ranged: "원거리 훈련", support: "서포터 훈련" }[role];
  const parts = [];
  if (roleTrain) parts.push(`성향 → ${roleTrain} 대상`);
  parts.push("전열 배치 시 전열 단련 / 후열 배치 시 후열 집중 대상");
  return parts.join(" · ");
}

function chipList(arr, cls) {
  if (!arr || arr.length === 0) return `<span class="cd-empty">—</span>`;
  return arr.map((t) => `<span class="cd-chip ${cls || ""}">${t}</span>`).join("");
}

// Codex Detail Status 01 — 선택 직업의 내부 구현 상태판을 #codex-detail에 렌더(개발/기획 확인용, 직설적).
export function renderCodexDetail(jobId) {
  const host = document.getElementById("codex-detail");
  if (!host) return;
  const s = jobStatusOf(jobId);
  const entry = CODEX_ENTRIES.find((e) => e.job === jobId);
  const name = jobName(jobId) || (entry && entry.name) || jobId;
  if (!s) {
    host.innerHTML = `<p class="codex-detail-hint">${name}: 상태 데이터가 없습니다.</p>`;
    return;
  }
  const role = combatRoleLabelOf(jobId) || "미분류";
  const implL = IMPL_LABEL[s.implementation] || s.implementation;
  const visL = VIS_LABEL[s.visibility] || s.visibility;

  host.innerHTML = `
    <div class="cd-head">
      <span class="cd-name">${name}</span>
      <button type="button" class="cd-close" data-codex-detail-close aria-label="상세 닫기">✕</button>
      <span class="cd-badges">
        <span class="cd-badge cd-tier">${jobTierLabel(jobId)}</span>
        <span class="cd-badge cd-role">${role}</span>
        <span class="cd-badge cd-impl cd-impl--${s.implementation}">${implL}</span>
        <span class="cd-badge cd-vis cd-vis--${s.visibility}">시인성: ${visL}</span>
      </span>
    </div>

    <div class="cd-section">
      <h4>실제 구현</h4>
      <p>${s.behavior}</p>
    </div>

    <div class="cd-section">
      <h4>타겟 / 효과</h4>
      <p class="cd-sub">타겟: ${s.targetRule}</p>
      <div class="cd-chips">${chipList(s.effects, "cd-chip--eff")}</div>
    </div>

    <div class="cd-section">
      <h4>현재 시인성</h4>
      <p class="cd-sub">보이는 것</p>
      <div class="cd-chips">${chipList(s.visibleNow, "cd-chip--on")}</div>
      <p class="cd-sub">잘 안 보이는 것</p>
      <div class="cd-chips">${chipList(s.hiddenNow, "cd-chip--off")}</div>
    </div>

    <div class="cd-section">
      <h4>작업 필요 / 다음 후보</h4>
      <div class="cd-chips">${chipList(s.todo, "cd-chip--todo")}</div>
    </div>

    <div class="cd-section">
      <h4>성장 방향(참고)</h4>
      <p class="cd-sub">${trainingHintFor(jobId)}</p>
    </div>

    <div class="cd-section cd-note">
      <h4>메모</h4>
      <p>${s.note || "—"}</p>
    </div>
  `;
}

// Reward & Growth 01: 누적 성장 요약("공격 훈련 Lv.2 · 회복 훈련 Lv.1") — 선택이 남아 있음을 보여준다.
function growthSummaryText(state) {
  const lv = state.run.rewardLevels || {};
  const parts = REWARDS.filter((r) => lv[r.id]).map((r) => `${r.name} Lv.${lv[r.id]}`);
  return parts.join(" · ");
}

function renderRewardPanel(state) {
  // Reward Pressure 01 — 방금 고른 길의 보상 성격(일반/위험/정예)과 남은 선택 횟수를 보여준다.
  const rw = routeReward(state.run.currentRouteType);
  const remaining = state.run.rewardPicks || 1;
  const labelSuffix = rw.resultLabel ? ` · ${rw.resultLabel}` : "";
  document.getElementById("growth-stage-label").textContent =
    `${BEGINNER_THEME.name} · 심도 ${state.run.depth} 클리어!${labelSuffix}`;
  const pickWord = remaining >= 2 ? `훈련을 ${remaining}개 선택하세요` : "훈련을 하나 선택하세요";
  const pickHint = remaining >= 2 ? ` <b class="growth-picks">남은 선택 ${remaining}</b>` : "";
  document.getElementById("growth-subtitle").innerHTML =
    `${pickWord}.${pickHint}<br><span class='growth-hint'>선택한 훈련은 이번 모험 동안 유지되고, 다음 전투부터 적용됩니다.</span>`;

  // Run Reward Training 01 → Diversification 02 — 3택만 렌더 + 이번 선택 후 Lv 표시(현재 카운트+1, MAX 3).
  const offer = (state.run.rewardOffer || []).map((id) => rewardById(id)).filter(Boolean);
  const choices = offer.length ? offer : REWARDS;
  const lvOf = (id) => Math.min(REWARD_MAX_LEVEL, ((state.run.rewardLevels || {})[id] || 0) + 1);
  document.getElementById("growth-choices").innerHTML = choices.map(
    (r) =>
      `<button type="button" data-reward="${r.id}">
        <span class="reward-name">${r.name} <b class="reward-lv">Lv.${lvOf(r.id)}/${REWARD_MAX_LEVEL}</b></span>
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
  // Run Structure 01A: "초보자의 길 · 심도 5 · 정예 전투" — 여정 깊이/현재 인카운터 타입이 읽힌다.
  //   프리뷰 장면은 정식 런이 아니므로 PREVIEW 표기.
  const stageEl = document.getElementById("stage-label");
  if (state.battle.previewKind) {
    stageEl.textContent = "PREVIEW";
  } else {
    const rt = ROUTE_TYPES[state.run.currentRouteType];
    stageEl.textContent =
      `${BEGINNER_THEME.name} · 심도 ${state.run.depth} · ${rt ? rt.hud : "전투"}`;
  }
  document.getElementById("status-label").textContent = state.battle.status;
  renderPartyBonus(state.run.bonuses);
  renderRunStatus(state);

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
    // Run Structure 01C — 심도 분위기 class hook(전장 배경 붉은 기운). 프리뷰는 분위기 없음.
    field.dataset.depthTier = state.battle.previewKind ? "" : depthAtmosphere(state.run.depth).tier;
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

// Run Structure 01A — 상단 run 표시(심도 / 보스 열쇠 / 위험도 / 현재 여정 타입).
//   전투 화면 한 줄 요약. 프리뷰는 정식 런이 아니므로 숨긴다.
function renderRunStatus(state) {
  const el = document.getElementById("run-status");
  if (!el) return;
  if (state.battle.previewKind) {
    el.hidden = true;
    return;
  }
  const rt = ROUTE_TYPES[state.run.currentRouteType];
  // Run Structure 01B — 위험도 표시를 경계도로 교체(심도/경계도/열쇠). 보스전이면 심도 강화 단계도.
  let hud = rt ? rt.hud : "";
  if (state.run.currentRouteType === "boss") {
    const fury = bossFury(state.run.depth);
    if (fury.label) hud += ` · ${fury.label}`;
    // Boss Early Challenge Pressure 01 — 전투 중에도 준비 부족 압박을 라벨로(분노/광폭과 별개 축).
    const ready = readinessOf(state);
    if (ready.label) hud += ` · ${ready.label}`;
    // Boss Readiness Pressure 02 — 위압 상태(활성/해제)도 전투 HUD에 표시(열쇠 기반).
    hud += ` · ${bossMenace(state.run.bossKeys || 0).label}`;
  }
  // Run Structure 01C — 심도 분위기 문구(30+ 위협 / 40+ 분노). 일반 전투에서도 "숲이 거칠어졌다"가 읽힘.
  const atmo = depthAtmosphere(state.run.depth);
  el.innerHTML = [
    `<span>심도 <b>${state.run.depth}</b></span>`,
    `<span>경계도 <b>${state.run.alertness}</b></span>`,
    `<span>열쇠 <b>${state.run.bossKeys}</b></span>`,
    `<span>${hud}</span>`,
    atmo.label ? `<span class="depth-atmo depth-atmo--${atmo.tier}">${atmo.label}</span>` : "",
  ].join("");
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

// Beginner Theme Actor 01 — 조합형 bt 액터의 고정 6파츠(개체/역할/등급은 btClass로 결정).
//   R&D avatar-museum-01의 .bt 구조(shadow/extra/role/body/head/ears)를 그대로 가져온다.
const BT_PARTS = ["shadow", "extra", "role", "body", "head", "ears"];

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

  // Legacy Marker Cleanup 01 — 아바타 위 점 마커(status-slots) 갱신 제거(렌더에서 빠짐).
  // Combat Grammar Foundation 01 — 버프/디버프 상태칩(게이지 하단)은 변경 시에만 갱신(매 tick 재생성 방지).
  const chipsEl = el.querySelector(".status-chips");
  if (chipsEl) {
    const chipsKey = statusChips(unit).join(",");
    if (chipsEl.dataset.chips !== chipsKey) {
      chipsEl.dataset.chips = chipsKey;
      chipsEl.innerHTML = statusChipsHTML(unit);
    }
  }
  // 도발 머리 위 "!" — tauntedBy 상태가 바뀌면 추가/제거.
  const hasTauntMark = !!el.querySelector(".taunt-mark");
  if (!!unit.tauntedBy !== hasTauntMark) {
    if (unit.tauntedBy) {
      const m = document.createElement("span");
      m.className = "taunt-mark";
      m.setAttribute("aria-label", "도발됨");
      m.textContent = "!";
      el.appendChild(m);
    } else {
      el.querySelector(".taunt-mark")?.remove();
    }
  }

  const hpFill = el.querySelector(".hp-bar-fill");
  if (hpFill) {
    const hpPct = unit.maxHp > 0
      ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100))
      : 0;
    hpFill.style.width = `${hpPct.toFixed(1)}%`;
  }

  // Combat Grammar Polish 02: 보호막 덮개 갱신(피해로 줄면 같이 줄어듦).
  const shieldEl = el.querySelector(".hp-shield");
  if (shieldEl) {
    const shPct = unit.maxHp > 0
      ? Math.max(0, Math.min(100, ((unit.shield || 0) / unit.maxHp) * 100))
      : 0;
    shieldEl.style.width = `${shPct.toFixed(1)}%`;
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
// Impact Anchor Polish 01 — 히트 이펙트 링 통일 크기(대상 tier 무관). 소형 몬스터 기준 감각 유지.
const TARGET_CUE_SIZE = 50;
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
  // Impact Anchor Polish 01 — 히트 이펙트 링 크기 통일.
  //   기존: 대상 rect 비례(보스 scale에서 124px까지 → 보스 전체를 덮어 미적 저하).
  //   변경: 대상 크기와 무관하게 동일 size. "큰 보스 몸 안에서 작은 타격점이 반짝"는 느낌.
  //   Boss/Elite/Small 모두 같은 기본 ring size 사용.
  const size = TARGET_CUE_SIZE;

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
  poison: "sm-poison", // 중독 — 초록 점
  guard: "sm-guard",   // 보호 — 파란 사각
  mark: "sm-mark",     // 표식/조준/결속 — 호박 점
  buff: "sm-buff",     // 강화 — 보라 마름모
  // First Class Expansion 01 — 확장 상태 마커(작은 점, 색만 구분).
  taunt: "sm-taunt",     // 도발 — 빨강
  slow: "sm-slow",       // 감속 — 하늘
  atkDown: "sm-atkdown", // 공격력↓ — 회색
  rhythm: "sm-rhythm",   // 리듬(치명 예약) — 금색
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

// Combat Grammar Foundation 01 — 버프/디버프 상태칩(HP/속도 게이지 하단). 작은 텍스트 기호로 읽힘.
//   8종 공통 상태 + 도발. 점 마커(위)와 분리 — 이쪽은 "수치 효과"를 글자로 보여준다. 최대 4개(과밀 방지).
const STATUS_CHIP = {
  atkUp: { t: "공↑", c: "up" }, atkDown: { t: "공↓", c: "down" },
  defUp: { t: "방↑", c: "up" }, defDown: { t: "방↓", c: "down" },
  critUp: { t: "치↑", c: "up" }, critDown: { t: "치↓", c: "down" },
  speedUp: { t: "속↑", c: "up" }, speedDown: { t: "속↓", c: "down" },
  taunted: { t: "도발", c: "taunt" },
  // Hero Readability Polish 01A — 덫꾼 독 표식(중독 상태 가시화) / 파수궁 보복 준비(합성 칩).
  poison: { t: "독", c: "poison" },
  counterReady: { t: "보복 준비", c: "ready" },
  // Hero Readability Polish 01B — 추적자 표식(실제 mark 상태) / 마도 충전(합성) / 금제·성벽 결속(합성).
  mark: { t: "표식", c: "mark" },
  // Second Class Batch 1A — 검성 결투 표식(전용 칩, mark 색 공유). 천궁은 mark("표식")+defDown("방↓") 재사용.
  duel: { t: "결투", c: "mark" },
  // Second Class Batch 2 — 구원자 구원선(실제 salvation 상태) / 역병술사 감염(실제 infection 상태) / 무희 리듬(합성).
  salvation: { t: "구원", c: "up" },
  infection: { t: "감염", c: "poison" },
  rhythm: { t: "리듬", c: "up" },
  charging: { t: "충전", c: "charge" },
  bond: { t: "결속", c: "bond" },
};
function statusChips(unit) {
  const chips = (unit.statuses || []).map((s) => s.type).filter((t) => STATUS_CHIP[t]);
  // Hero Readability Polish 01A — 파수궁 보복 준비는 상태 배열이 아니라 unit.counterReady 속성 → 합성 칩으로 표시.
  //   살아 있고 counterReady가 false가 아닐 때(undefined=충전됨 포함)만. 로직/수치는 변경하지 않음(표시 전용).
  if (unit.id === "watchbow" && !unit.isDead && unit.counterReady !== false) chips.push("counterReady");
  // Hero Readability Polish 01B — 마도 충전 상태(불리언 필드 unit.charging) → 마도에만 합성 칩. 표시 전용.
  if (unit.id === "mage" && !unit.isDead && unit.charging) chips.push("charging");
  // Hero Readability Polish 01B — 결속: 금제(bondOffenseTarget) 또는 성벽 보호 아군(protectedBy) 링크가 살아 있으면 합성 칩.
  //   (mark는 위 상태 배열에서 이미 '표식' 칩으로 표시 — 추적자 조준 대상/결속 대상 공통.)
  if (!unit.isDead && (unit.bondOffenseTarget || unit.protectedBy)) chips.push("bond");
  // Second Class Batch 2 — 무희 박자(불리언/숫자 필드 unit.beat) → 무희에만 '리듬' 합성 칩(예측 가능한 박자 진행 표시).
  if (unit.id === "dancer" && !unit.isDead && unit.beat) chips.push("rhythm");
  return chips;
}
function statusChipsHTML(unit) {
  const chips = statusChips(unit);
  if (chips.length === 0) return "";
  return chips.slice(0, 4)
    .map((t) => `<span class="status-chip status-chip--${STATUS_CHIP[t].c}">${STATUS_CHIP[t].t}</span>`)
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
  // Beginner Theme Actor 01: bt 액터는 .unit에 is-bt 마커 — 정예/보스 컨테이너 스케일을 bt 전용으로
  //   오버라이드(bt-elite/bt-boss가 파츠를 이미 키우므로 mon-elite/mon-boss 과확대 방지).
  const btUnit = unit.btClass ? " is-bt" : "";

  const wrap = document.createElement("div");
  wrap.className = `unit ${unit.team} ${posClass}${sizeClass}${btUnit} ${facingClass}${deadClass}`;
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
  // Avatar Import 01: 아군은 SR 아바타(.sig-av) — avatarKey로 스펙 조회(job id 하드코딩 없음).
  //   적은 기존 donor 파츠(.monster) 그대로(적 비주얼/밸런스 불변).
  let figureHTML;
  if (isParty) {
    const spec = avatarSpec(avatarKey);
    figureHTML = avatarFigureHTML(spec.sr, spec.parts);
  } else if (unit.btClass) {
    // Beginner Theme Actor 01: 조합형 bt 액터 — .monster.bt.bt-actor에 개체/역할/등급 클래스를 얹고
    //   고정 6파츠를 그린다. 박스 76×82(R&D 좌표계 그대로). 아군 SR 아바타와 동일하게 .av-fit
    //   래퍼로 전투 scale(0.8)을 받아 유닛 박스에 맞춘다(idle은 자식 .monster가 담당, 합성).
    const parts = BT_PARTS.map((p) => `<span class="part ${p}"></span>`).join("");
    figureHTML = `<div class="av-fit"><div class="monster bt bt-actor ${unit.btClass} job-${id}">${parts}</div></div>`;
  } else {
    const parts = (AVATAR_PARTS[visual] || [])
      .map((p) => `<span class="part ${p}"></span>`)
      .join("");
    figureHTML = `<div class="monster ${visual} job-${id} avatar-${avatarKey}">${parts}</div>`;
  }
  const hpPct = unit.maxHp > 0
    ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)).toFixed(1)
    : "0";
  // Combat Grammar Polish 02: 보호막 덮개 비율 = min(shield/maxHp, 1).
  const shieldPct = unit.maxHp > 0
    ? Math.max(0, Math.min(100, ((unit.shield || 0) / unit.maxHp) * 100)).toFixed(1)
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
  // Legacy Marker Cleanup 01 — 아바타 위 점 마커(status-slots)는 의미가 불명확한 임시 도형이라 제거.
  //   상태 정보는 "규칙이 정해진" 버프/디버프 칩(status-chips, 게이지 하단) + 도발 "!"만 남긴다.
  //   상태 계산/도발/위압/치명 로직은 불변 — "표시"만 정리한다(displayMarkers는 Boss HUD에서만 계속 사용).
  const presenceAura = unit.tier ? `<span class="presence-aura" aria-hidden="true"></span>` : "";

  // Combat Grammar Foundation 01 — 도발당한 대상 머리 위 "!"(작지만 명확). 행동 후 해제되면 사라진다.
  const tauntMark = unit.tauntedBy ? `<span class="taunt-mark" aria-label="도발됨">!</span>` : "";
  const chipsHTML = statusChipsHTML(unit);
  const chipsKey = statusChips(unit).join(",");

  wrap.setAttribute("aria-label", unit.name);
  wrap.innerHTML = `
    ${presenceAura}
    ${tauntMark}
    <div class="fig-react">
      ${figureHTML}
    </div>
    <span class="hp-bar"><span class="hp-bar-fill" style="width:${hpPct}%"></span><span class="hp-shield" style="width:${shieldPct}%"></span></span>
    <span class="tempo-bar${readyClass}"><span class="tempo-bar-fill" style="width:${gaugePct}%"></span></span>
    <div class="status-chips" data-chips="${chipsKey}">${chipsHTML}</div>
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
  // Beginner Theme Actor 01: bt 액터 시작점(적은 좌하단 영웅을 대면) — 없으면 중심 fallback.
  bear: { fx: 0.42, fy: 0.5 },     // 곰 몸통/방패 앞
  fox: { fx: 0.3, fy: 0.5 },       // 잎여우 앞발/주둥이
  bird: { fx: 0.32, fy: 0.42 },    // 깃새 부리/사선
  dewslime: { fx: 0.5, fy: 0.55 }, // 슬라임 몸 앞
  lamb: { fx: 0.45, fy: 0.5 },     // 풀양 앞
  owl: { fx: 0.5, fy: 0.45 },      // 정예 — 중앙 상체
  deer: { fx: 0.42, fy: 0.46 },    // 정예 — 앞쪽
  lion: { fx: 0.5, fy: 0.5 },      // 보스 — 몸 중앙
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

// First Loop Micro Polish 01 — 피해/회복 숫자 시작점.
//   일반 유닛: 기존 head anchor(상단 8%) 유지.
//   보스/정예(큰 rect): fy 비율로 잡으면 머리보다 한참 위에서 시작 → 위로 float하며 화면 밖 이탈.
//   → 큰 rect는 rect 상단에서 작은 고정 오프셋만 두고, 최종 y는 전장 안으로 clamp.
//   Boss HUD(상단 중앙)와 겹치지 않도록 아래쪽으로 충분히 내린다(상단 여백 확보).
function numberAnchor(targetInstanceId, fieldRect) {
  const el = document.querySelector(
    `#unit-layer [data-instance-id="${targetInstanceId}"]`
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const big = el.dataset.tier === "boss" || el.dataset.tier === "elite";
  const x = r.left - fieldRect.left + 0.5 * r.width;
  let y = big
    ? r.top - fieldRect.top + 18 // 큰 rect: 상단 근처 고정 오프셋(머리 위 과도 거리 방지)
    : r.top - fieldRect.top + 0.08 * r.height;
  // float-up(약 -24px)을 감안해 위/아래로 화면을 벗어나지 않게 clamp.
  //   보스는 Boss HUD가 상단을 쓰므로 최소 y를 더 낮춰(=아래로) 겹침을 피한다.
  const minY = big ? 64 : 30;
  y = Math.max(minY, Math.min(fieldRect.height - 18, y));
  return { x, y };
}

// Basic Action Breath 01 — 도착점 = 대상 테두리 중 from(공격자/치유자)과 가장 가까운 지점.
//   대상 중심에서 from 방향으로 ~rect의 40% 이동 → 모서리보다 살짝 안쪽(타격점/닿는 지점).
function borderPointToward(targetInstanceId, from, fieldRect) {
  const el = document.querySelector(
    `#unit-layer [data-instance-id="${targetInstanceId}"]`
  );
  if (!el || !from) return null;
  const r = el.getBoundingClientRect();
  const cx = r.left - fieldRect.left + r.width / 2;
  const cy = r.top - fieldRect.top + r.height / 2;
  let dx = from.x - cx;
  let dy = from.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  return { x: cx + dx * r.width * 0.40, y: cy + dy * r.height * 0.40 };
}

// Combat Grammar Polish 02 / Impact Anchor Polish 01 — 행동선 도착점(피격점) 분기.
//   boss 대상: 보스 몸 내부 9분할 중 랜덤(큰 몸 여러 지점 타격). 바깥 허공/HUD로 안 나감.
//   elite 대상: 보스보다 작으므로 2×2(4분할) 랜덤(중형 몸 4지점 타격).
//   small 대상(영웅→소형 몬스터): 분산하지 않고 몸통 중심에 정확히 꽂힘(타격감 우선).
//   몬스터→영웅: 영웅 몸통(가슴) 쪽 — 테두리 허공이 아니라 몸에 닿게.
//   그 외 fallback: 기존 테두리 가까운 지점.
const BOSS_GRID_X = [0.30, 0.5, 0.70];
const BOSS_GRID_Y = [0.32, 0.5, 0.66];
// Impact Anchor Polish 01 — elite 2×2 anchor 후보(중앙 한 점 고정이 아니라 몸의 4지점에 분산).
const ELITE_GRID_X = [0.38, 0.62];
const ELITE_GRID_Y = [0.40, 0.60];
function impactPoint(targetInstanceId, sourceInstanceId, s, fieldRect) {
  const tgtEl = document.querySelector(
    `#unit-layer [data-instance-id="${targetInstanceId}"]`
  );
  if (!tgtEl || !s) return null;
  const r = tgtEl.getBoundingClientRect();
  const left = r.left - fieldRect.left;
  const top = r.top - fieldRect.top;
  const tier = tgtEl.dataset.tier;

  if (tier === "boss") {
    const gx = BOSS_GRID_X[(Math.random() * 3) | 0];
    const gy = BOSS_GRID_Y[(Math.random() * 3) | 0];
    return { x: left + gx * r.width, y: top + gy * r.height };
  }
  if (tier === "elite") {
    const gx = ELITE_GRID_X[(Math.random() * 2) | 0];
    const gy = ELITE_GRID_Y[(Math.random() * 2) | 0];
    return { x: left + gx * r.width, y: top + gy * r.height };
  }

  const srcEl = sourceInstanceId
    ? document.querySelector(`#unit-layer [data-instance-id="${sourceInstanceId}"]`)
    : null;
  if (srcEl && srcEl.classList.contains("enemy") && tgtEl.classList.contains("party")) {
    return { x: left + 0.5 * r.width, y: top + 0.46 * r.height }; // 영웅 몸통(가슴)
  }

  // 소형 몬스터: 분산 없이 몸통 중심에 정확히 꽂힘(미세 어긋남 제거 → 타격감↑)
  if (tgtEl.classList.contains("enemy")) {
    return { x: left + 0.5 * r.width, y: top + 0.5 * r.height };
  }

  return borderPointToward(targetInstanceId, s, fieldRect);
}

// Basic Action Breath 01 → Hero Skill 01 — 행동 텍스트 외침.
//   "공격!"(basic, 가장 작음) / 스킬명(skill, 더 큼) 계층. 색은 kind별.
//   Combat Breath Hotfix 01: 시작점을 머리 근처(얼굴 위)로 내려 "대사를 외치는" 느낌.
//   행동 주체 얼굴 근처에서 떠 위로 올라가며 fade. 과밀 방지 상한 + 화면 안 clamp.
const MAX_FX_SHOUTS = 5;
function spawnActionShout(sourceInstanceId, text, fieldRect, opts = {}) {
  const layer = document.getElementById("fx-layer");
  if (!layer) return;
  const isSkill = opts.tier === "skill";
  // Combat Grammar Polish 02: 얼굴/머리 근처에서 "대사처럼" 시작. 스킬도 아바타 가까이로 내림.
  const fy = isSkill ? 0.16 : 0.2;
  const p = unitPoint(sourceInstanceId, { fx: 0.5, fy }, fieldRect);
  if (!p) return;
  const shouts = layer.querySelectorAll(".fx-shout");
  if (shouts.length >= MAX_FX_SHOUTS) shouts[0].remove();
  // "공격!"(basic)은 직업색 없이 흰색 통일 — kind 색은 스킬 외침에만.
  const el = document.createElement("span");
  el.className =
    "fx-shout" +
    (isSkill ? " fx-shout--skill" : "") +
    (isSkill && opts.kind ? ` fx-shout--${opts.kind}` : "");
  el.textContent = text;
  el.style.left = `${p.x}px`;
  el.style.top = `${Math.max(8, p.y)}px`; // 화면 상단 밖으로 시작하지 않게 clamp
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// Hero Skill Foundation 01 — 비-라인 지원 스킬 FX(수호/축복/성역).
//   시전자에 스킬 외침 + 각 회복 대상에 회복 pulse/숫자 + guard 대상에 방패 pulse.
//   라인 없이 "파티에 닿았다"를 표현(다수 대상은 area pulse처럼 읽힘). 과밀 상한 공유.
export function playSupportFx({ casterInstanceId, text, kind, heals = [], guardInstanceId }) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();

  if (text) spawnActionShout(casterInstanceId, text, fieldRect, { tier: "skill", kind });

  heals.forEach((h) => {
    if (dyingUnits.has(h.targetInstanceId) || cleanedDead.has(h.targetInstanceId)) return;
    const p = unitPoint(h.targetInstanceId, { fx: 0.5, fy: 0.46 }, fieldRect);
    if (p) spawnPulse(layer, p, true);
    if (h.amount > 0) {
      const tn = numberAnchor(h.targetInstanceId, fieldRect);
      if (tn) spawnNumber(layer, tn, h.targetInstanceId, true, h.amount);
    }
    reactUnit(h.targetInstanceId, true);
  });

  if (guardInstanceId && !dyingUnits.has(guardInstanceId) && !cleanedDead.has(guardInstanceId)) {
    const g = unitPoint(guardInstanceId, { fx: 0.5, fy: 0.46 }, fieldRect);
    if (g) {
      const s = document.createElement("span");
      s.className = "fx-pulse fx-pulse--guard";
      s.style.left = `${g.x}px`;
      s.style.top = `${g.y}px`;
      s.addEventListener("animationend", () => s.remove());
      layer.appendChild(s);
    }
  }
}

// Action Emphasis 01: 시선 우선순위 = acting > line > target reaction > idle.
//   현재 행동 중(acting cue 표시 중)인 유닛 추적 → 그 사이 들어오는
//   target reaction은 생략(같은 유닛에 선언과 피격이 겹쳐 시선이 꼬이지 않게).
const actingUnits = new Set();

// battle.js에서 행동 발생 시 호출 (전투 계산과 분리된 FX 이벤트)
export function playActionFx(event) {
  // Job Grammar 01: kind = 직업 행동 분류(strike/protect/snipe/heal/attack).
  //   현재는 행동선 data-kind 기록만 — 시각 변화 없음. 미래 직업별 FX/로그 확장 hook.
  const { sourceInstanceId, sourceUnitId, targetInstanceId, lineType, kind, isHeal, amount,
    shoutText, shoutKind, shoutTier, numberVariant } = event;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;

  const fieldRect = field.getBoundingClientRect();
  const srcFrac = SOURCE_ANCHORS[sourceUnitId] || { fx: 0.5, fy: 0.45 };

  // 좌표는 .unit wrap rect 기준 → acting scale(자식 .fig-react)에 영향받지 않음(안정)
  // Basic Action Breath 01: 시작점 = 공격자 팔/무기(srcFrac), 도착점 = 대상 테두리 중
  //   공격자(치유자)와 가장 가까운 지점(borderPointToward). 중심 직격이 아니라 "닿는" 느낌.
  const s = unitPoint(sourceInstanceId, srcFrac, fieldRect);
  const t = s
    ? impactPoint(targetInstanceId, sourceInstanceId, s, fieldRect) || unitPoint(targetInstanceId, TARGET_HIT, fieldRect)
    : null;
  if (!s || !t) return;

  // 1) 행동자 선언("나야 지금!") — source unit이 먼저 짧게 보인다.
  cueActor(sourceInstanceId, lineType);
  // 1a) 행동 텍스트(외침). Hero Skill 01: event.shoutText로 "공격!"/스킬명 모두 처리.
  //   (이전엔 공격만 하드코딩 → 이제 스킬명도 같은 채널로. heal 단일 치유도 텍스트가 뜬다.)
  if (shoutText) {
    spawnActionShout(sourceInstanceId, shoutText, fieldRect, { tier: shoutTier, kind: shoutKind });
  }
  // 1b) 대상 신호("잡혔다") — actor보다 약한 보조 신호. 선이 도착하기 전 대상을 가리킨다.
  spawnTargetCue(targetInstanceId, isHeal);

  // 2) 짧은 선행 뒤 행동선 발사 + 대상 반응. 배속이면 리듬만 살게 더 짧게.
  const speed = Number(field.dataset.speed) || 1;
  const lead = speed === 2 ? 80 : 120;
  // 숫자 시작점.
  //   Hero/Small: 기존 head anchor(머리 위) 유지.
  //   Impact Anchor Polish 01 — Boss/Elite: 실제 타격이 터진 End 지점(t) 기준 위쪽에 노출.
  //     End가 여러 군데에서 터질 때 "이 지점에 맞았고 이 피해가 떴다"는 연결감.
  //     아바타 내부에 묻히지 않게 End보다 살짝 위(약 28px) + 화면 안 clamp.
  //     기존 방식 복귀는 numberAnchor만 다시 쓰면 됨(구조 단순 유지).
  const tgtTierEl = document.querySelector(
    `#unit-layer [data-instance-id="${targetInstanceId}"]`
  );
  const bigTarget = tgtTierEl &&
    (tgtTierEl.dataset.tier === "boss" || tgtTierEl.dataset.tier === "elite");
  const tn = bigTarget
    ? { x: t.x, y: Math.max(56, Math.min(fieldRect.height - 18, t.y - 28)) }
    : (numberAnchor(targetInstanceId, fieldRect) || t);
  const fire = () => {
    spawnLine(layer, s, t, lineType, kind);
    spawnPulse(layer, t, isHeal);
    // First Class Expansion 01: 피해/회복 0(상태 부여형 스킬: 중독 등)은 숫자 생략.
    // Combat Grammar Foundation 01: numberVariant(crit 등)로 피해 숫자 규격 분기.
    if (amount > 0) spawnNumber(layer, tn, targetInstanceId, isHeal, amount, numberVariant);
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
  const t = numberAnchor(targetInstanceId, field.getBoundingClientRect());
  if (!t) return;
  spawnNumber(layer, t, targetInstanceId, false, amount, kind);
}

// Combat Grammar Foundation 01 — 상태 적용 FX(머리 위 짧은 기호 팝). 버프/디버프가 "걸렸다"를 읽게.
//   과하지 않게 — 작은 텍스트(공↑/속↓ 등)가 머리 위로 살짝 떠올랐다 사라진다. variant=up/down 색 구분.
export function playStatusApplyFx(targetInstanceId, label, variant = "") {
  if (!label) return;
  if (dyingUnits.has(targetInstanceId) || cleanedDead.has(targetInstanceId)) return;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const p = unitPoint(targetInstanceId, { fx: 0.5, fy: 0.16 }, field.getBoundingClientRect());
  if (!p) return;
  const el = document.createElement("span");
  el.className = `fx-status-pop${variant ? ` fx-status-pop--${variant}` : ""}`;
  el.textContent = label;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// ── Monster Identity 02 — Actor 역할 읽힘 FX ──────────────────────────────
//   "로그를 안 읽어도 누가 뭘 하는지 전장만 보고 안다." 기존 pulse/shout/status-pop 문법 안에서,
//   과하지 않게(단일 링 1개, 0.3~0.5초). readability 우선 — 파티클 폭발 금지.
//   유닛 중심 확장 링(보호/회복/지휘/위압/포효). variant로 색·크기·리듬 구분.
function spawnUnitRing(instanceId, variant, fy = 0.46) {
  if (dyingUnits.has(instanceId) || cleanedDead.has(instanceId)) return;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const p = unitPoint(instanceId, { fx: 0.5, fy }, field.getBoundingClientRect());
  if (!p) return;
  const el = document.createElement("span");
  el.className = `fx-ring fx-ring--${variant}`;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// 보호 펄스(금빛 방패 느낌) — 기존 fx-pulse--guard 재사용. 대상 위에 짧게.
function spawnGuardPulse(instanceId) {
  if (dyingUnits.has(instanceId) || cleanedDead.has(instanceId)) return;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const p = unitPoint(instanceId, { fx: 0.5, fy: 0.46 }, field.getBoundingClientRect());
  if (!p) return;
  const s = document.createElement("span");
  s.className = "fx-pulse fx-pulse--guard";
  s.style.left = `${p.x}px`;
  s.style.top = `${p.y}px`;
  s.addEventListener("animationend", () => s.remove());
  layer.appendChild(s);
}

// 깃새 투사체 — source→target으로 작은 점이 "날아간다". 선보다 약한 보조 감각(과하지 않게).
function spawnProjectile(sourceId, targetId) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const s = unitPoint(sourceId, { fx: 0.5, fy: 0.4 }, fieldRect);
  const t = unitPoint(targetId, { fx: 0.5, fy: 0.42 }, fieldRect);
  if (!s || !t) return;
  const el = document.createElement("span");
  el.className = "fx-proj";
  el.style.left = `${s.x}px`;
  el.style.top = `${s.y}px`;
  layer.appendChild(el);
  // 다음 프레임에 목표로 이동(CSS transition) → "날아간다"
  requestAnimationFrame(() => {
    el.style.transform = `translate(${t.x - s.x}px, ${t.y - s.y}px)`;
    el.style.opacity = "0";
  });
  setTimeout(() => el.remove(), 360);
}

// 잎여우 추격 lunge — 공격 직전 짧은 전진감(.fig-react에 잠깐 lunge 클래스).
function cueLunge(instanceId) {
  requestAnimationFrame(() => {
    const unit = document.querySelector(`#unit-layer [data-instance-id="${instanceId}"]`);
    const fig = unit && unit.querySelector(".fig-react");
    if (!fig) return;
    fig.classList.remove("lunge");
    void fig.offsetWidth; // reflow → 재진입 시 재시작
    fig.classList.add("lunge");
    fig.addEventListener("animationend", () => fig.classList.remove("lunge"), { once: true });
  });
}

// Actor FX 디스패처 — battle.js trait가 역할별로 호출. opts: { wardId, targetId, allyIds, sourceId }.
export function playActorFx(kind, casterId, opts = {}) {
  switch (kind) {
    case "guard": // 곰방패: 보호 대상 가드 펄스 + 곰 주변 보호 링("앞에서 지켜준다")
      spawnGuardPulse(opts.wardId || casterId);
      spawnUnitRing(casterId, "guard");
      break;
    case "weaken": // 이슬말랑: 대상 머리 위 약화 표식("힘 빠뜨린다")
      playStatusApplyFx(opts.targetId, "공↓", "down");
      break;
    case "heal": // 풀양: 회복자(양) 주변 초록 반짝("아군을 돌본다"). 대상 펄스는 playSupportFx가 담당
      spawnUnitRing(casterId, "heal");
      break;
    case "command": // 올빼미: 지휘 radial signal("뒤에서 지휘한다"). 대상 펄스는 playSupportFx
      spawnUnitRing(casterId, "command");
      break;
    case "ward": // 사슴: 자신 barrier 링 + 후열 아군에 보호 펄스("길막는 수호자")
      spawnUnitRing(casterId, "guard");
      (opts.allyIds || []).forEach((id) => { if (id !== casterId) spawnGuardPulse(id); });
      break;
    case "roar": // 사자왕: 예고 gather → radial shock("포효 온다 → 포효!")
      spawnUnitRing(casterId, "gather");
      setTimeout(() => spawnUnitRing(casterId, "roar"), 200);
      break;
    case "rage": // 사자왕: 위압 증가 subtle rage cue(존재감 상승)
      spawnUnitRing(casterId, "rage");
      break;
    case "lunge": cueLunge(casterId); break;
    case "projectile": spawnProjectile(opts.sourceId || casterId, opts.targetId); break;
  }
}

// Monster Identity 02 — 새 전투 시작 시 FX 레이어 정리. 화면 전환(전투→보상/타이틀) 도중 애니메이션이
//   끝나지 않은 FX 요소가 hidden 레이어에 남는 기존 동작이 있어, 새 전투 시작에서 한 번 비워 누적을 막는다.
export function clearFxLayer() {
  const layer = document.getElementById("fx-layer");
  if (layer) layer.innerHTML = "";
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
// Basic Action Breath 01 — 행동선 문법:
//   attack = 빨강 곡선 + X 타격점(영웅 근접/기타 + 몬스터 일반 공격 공통)
//   ranged = 녹색 "크게 휘는" 곡선(곡률 attack 대비 ~2배+) + 과녁(원거리 기본 공격)
//   heal   = 청록 점선 + 십자가(회복)
//   (구버전 straight/slash/enemy는 미사용 — 호환 위해 정의만 남겨둔다)
const LINE_STYLE = {
  attack:   { bowF: 0.32, bowMin: 22, bowMax: 74, flip: 1,  head: "x",      draw: true, ghost: true },
  ranged:   { bowF: 0.74, bowMin: 52, bowMax: 150, flip: 1, head: "target", draw: true },
  // Combat Breath Hotfix 01: 치유선 곡률↑(아군 간격 좁아도 아바타 사이에 안 묻히게 위로 크게 호).
  heal:     { bowF: 0.50, bowMin: 34, bowMax: 92, flip: -1, head: "cross",  draw: false },
  // Hero Skill 01: 교란 — 보라/분홍 거친 왜곡선(짧게 흔들림). 작은 혼란 표식(spark).
  disrupt:  { bowF: 0.22, bowMin: 14, bowMax: 44, flip: 1,  head: "spark",  draw: false, rough: true },
  // Combat Grammar Foundation 01: 도발 — 노랑 점선(공격선/회복선과 구분). 화려하지 않게.
  taunt:    { bowF: 0.20, bowMin: 14, bowMax: 44, flip: 1,  head: "spark",  draw: false },
  // legacy(미사용)
  straight: { bowF: 0.05, bowMin: 3,  bowMax: 8,  flip: 1,  head: "arrow", draw: true },
  slash:    { bowF: 0.36, bowMin: 26, bowMax: 82, flip: 1,  head: "slash", draw: true, ghost: true },
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
    // Basic Action Breath 01 — 기본 공격: X 타격점
    type === "x"
      ? makeNS("g", {
          class: "fx-head fx-head--x",
          transform: `translate(${t.x} ${t.y}) rotate(${ang})`,
        },
          '<path class="fx-xcut" d="M -8 -8 L 8 8"></path>' +
          '<path class="fx-xcut fx-xcut--b" d="M -8 8 L 8 -8"></path>')
    // Basic Action Breath 01 — 원거리: 과녁/조준점
    : type === "target"
      ? makeNS("g", {
          class: "fx-head fx-head--target",
          transform: `translate(${t.x} ${t.y})`,
        },
          '<circle class="fx-ring" cx="0" cy="0" r="9.5"></circle>' +
          '<circle class="fx-ring fx-ring--in" cx="0" cy="0" r="5"></circle>' +
          '<circle class="fx-bull" cx="0" cy="0" r="1.8"></circle>')
    // Basic Action Breath 01 — 회복: 십자가
    : type === "cross"
      ? makeNS("g", {
          class: "fx-head fx-head--cross",
          transform: `translate(${t.x} ${t.y})`,
        },
          '<path class="fx-crossline" d="M 0 -8.5 L 0 8.5 M -8.5 0 L 8.5 0"></path>' +
          '<circle class="fx-mote" cx="7" cy="-6" r="1.5"></circle>')
    : type === "arrow"
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

// Run Structure 01C — 피해 숫자 규격: 의미별로만 색을 둔다(임의 색 줄이기). 영웅/몬스터 동일 규칙.
//   기본=빨강(dmg) / 치명=주황(crit, 굵게·크게·폭발 후 축소) / 중독=보라(poison) / 회복=청록(heal).
//   알 수 없는 변주(roar/hit 등)는 기본 빨강으로 흡수 → "알록달록" 방지.
//   tag(향후 관통/분쇄/처형): 빨강 숫자 앞에 짧은 텍스트 태그. 구조만 준비(현재 미사용).
function damageNumberClass(isHeal, variant) {
  if (isHeal) return "fx-number--heal";
  if (variant === "poison") return "fx-number--poison";
  if (variant === "crit") return "fx-number--crit";
  return "fx-number--dmg";
}

function spawnNumber(layer, t, targetInstanceId, isHeal, amount, variant, tag) {
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
  n.className = `fx-number ${damageNumberClass(isHeal, variant)}`;
  const sign = isHeal ? "+" : "-";
  if (tag) {
    // 향후 특수 피해(관통/분쇄/처형) — 빨강 숫자에 짧은 텍스트 태그가 붙는 구조.
    n.classList.add("fx-number--tagged");
    n.innerHTML = `<span class="fx-number-tag">${tag}</span>${sign}${amount}`;
  } else {
    n.textContent = `${sign}${amount}`;
  }
  n.style.left = `${t.x}px`;
  n.style.top = `${Math.max(2, t.y - step * 15)}px`; // 위로 쌓기(화면 상단 밖 이탈 방지 clamp)
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
