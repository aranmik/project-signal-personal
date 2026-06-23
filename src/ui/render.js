import { BEGINNER_THEME, STAGE_THEMES } from "../data/stages.js";
import { ROUTE_TYPES, bossTimingLabel, bossFury, bossReadinessPressure, bossMenace, depthAtmosphere, routeReward, PRESSURE_HELP, effectiveAlertness, farmWarnLevel } from "../data/routes.js";
import { availableFusions, slotPreference, combatRoleLabelOf, combatRoleOf, BASE_JOBS, ADVANCED_JOBS, SECOND_CLASS_JOBS, ACTIVE_FUSION_RECIPES } from "../data/jobs.js";
import { jobStatusOf, IMPL_LABEL, VIS_LABEL } from "../data/jobStatus.js";
import { REWARDS, rewardById, REWARD_MAX_LEVEL } from "../data/rewards.js";
// Deep Reward Pool 01 — 심층 보상 표시(태그/문구). active만 플레이 등장(scaffold/idea는 Dev 카탈로그 전용).
import { deepRewardById } from "../data/deepRewards.js";
import { UNIT_TEMPLATES } from "../data/units.js";
import { SLOT_ORDER, SLOT_NAMES, partySizeOf, LAYOUT_PREVIEW_CASES } from "../core/state.js";
import { avatarSpec, avatarFigureHTML, CODEX_ENTRIES, CODEX_STATUS_LABEL } from "../data/avatars.js";
import { loadFootprints, footprintLine, footprintTimeText, footprintsToTSV, resultLabel } from "../data/footprints.js";
// Discovery Codex Foundation 01 — 도감(유물/몬스터/발견현황) 정적 데이터 + 플레이어 진행도(읽기 전용 표시).
import { CODEX_STATUS, MONSTER_CODEX, MONSTER_KIND_LABEL, RELIC_CODEX, MAP_FRAGMENT_CODEX, monstersByTheme, relicsByTheme } from "../data/codex.js";
import { loadProgress, progressSummary } from "../core/progression.js";

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

// Dev Balance Lab 01 — 헤드리스 듀얼 시뮬레이션 동안 FX 출력을 억제하는 플래그(기본 OFF).
//   battle.js가 sim 시작/종료에 setFxSuppressed(true/false)를 호출한다. 본게임 전투에는 항상 false라
//   동작이 완전히 동일하다. sim은 화면 밖(Lab 오버레이)에서 수천 틱을 도므로, FX DOM 생성/타이머를 막아
//   성능과 화면 청결을 지킨다(계산식/피해/회복은 그대로 — 표시만 생략).
let fxSuppressed = false;
export function setFxSuppressed(v) { fxSuppressed = !!v; }

// Auto Run Report 01 — 헤드리스 자동 주회(별도 대시보드 페이지) 동안 renderGame을 통째로 no-op.
//   대시보드 페이지에는 게임 DOM(#title-screen 등)이 없어 renderGame이 그대로 돌면 크래시한다.
//   본게임에는 항상 false → 동작 동일. battle.js setHeadlessRun이 sim/주회 시작·종료에 토글한다.
let renderSuppressed = false;
export function setRenderSuppressed(v) { renderSuppressed = !!v; }

export function renderGame(state) {
  if (renderSuppressed) return; // Auto Run Report 01 — 헤드리스 주회 중 렌더 생략
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
  renderBondLinks(state); // Combat Visibility — 금제/성벽 결속 지속선(유닛 위치 갱신 직후)
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

  // Recipe Hint Preview 01 — 결과 직업의 역할 태그를 함께 표시(예: 용창 · 후열 공격). 현재 가능한 레시피만.
  const rows = fusions.length
    ? fusions.map((r) => {
        const role = combatRoleLabelOf(r.result);
        return `<div class="fusion-row">
          <span class="fusion-formula">${jobName(r.materials[0])} + ${jobName(r.materials[1])} <span class="fusion-arrow">→</span> <b>${jobName(r.result)}</b>${role ? ` <span class="fusion-role">· ${role}</span>` : ""}</span>
          <button type="button" data-fusion="${r.result}">합체한다</button>
        </div>`;
      }).join("")
    : "";

  // Route Grammar 02B — 합체 후 자동 영입 없음 반영(빈자리는 동료의 흔적에서 보충).
  const guide = fusions.length
    ? `<p class="flow-note">두 영웅의 힘이 하나로 모입니다 — 영웅 2명이 1명으로 합쳐집니다.<br>합체 후 파티가 1명 줄어듭니다. 빈자리는 '동료의 흔적'에서 채울 수 있습니다.</p>`
    : `<p class="flow-note">지금 파티에는 합체 가능한 조합이 없습니다.<br>이번에는 합체 없이 다음 여정으로 진행합니다.</p>`;

  const skipLabel = fusions.length ? "이번에는 합체하지 않는다" : "다음 여정으로";
  const skipNote = fusions.length
    ? `<p class="flow-note flow-note--dim">합체하지 않으면 파티 구성은 그대로 유지됩니다.</p>`
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
    <p class="flow-note">${fusion.birthLine || "두 영웅의 힘이 하나로 모였다."}<br>새로운 영웅 <b>${jobName(fusion.result)}</b> — 영웅 2명이 1명으로 합쳐졌다.</p>
    <p class="flow-note flow-note--dim">합체 완료 — 파티 인원이 ${partySizeOf(state.run)}명으로 줄었습니다.<br>빈자리를 채우려면 '동료의 흔적'을, 적은 인원으로 밀어붙이려면 다른 길을 고르세요.</p>
    <button type="button" id="fusion-continue" data-fusion-continue>여정 잇기</button>
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
// Route Choice & Recruit UX Rework 01 (D) — 영입 화면 "현재 파티"는 상태 표시만(자유 재배치 없음).
//   진형 정비는 이슬 쉼터에서 한다. 영입 후보는 빈 슬롯에 자동 미리보기로 들어간다(수동 슬롯 스왑 X).
//   그래서 슬롯은 버튼이 아니라 정적 표시(div) — 전열/후열 + 아바타 + 직업명. 빈 슬롯은 빈칸.
function partyPreviewGridHTML(formation) {
  return SLOT_ORDER.map((k) => {
    const job = formation?.[k];
    const rowLabel = k.startsWith("f") ? "전열" : "후열";
    if (!job) {
      return `<div class="pf-slot pf-slot--static pf-${k} empty" aria-label="빈자리"><span class="pf-row">${rowLabel}</span><span class="pf-empty-mark">＋</span><span class="pf-empty-label">빈자리</span></div>`;
    }
    return `<div class="pf-slot pf-slot--static pf-${k} filled" aria-label="${jobName(job)}"><span class="pf-row">${rowLabel}</span><span class="pf-ava">${jobAvatarHTML(job, "av-fit--card")}</span><span class="pf-name">${jobName(job)}</span></div>`;
  }).join("");
}

// Recruit UX Rebuild 01 — 동료 선택을 한 화면에서: 현재 파티(상단) + 설명(중단) + 후보 3(하단) + 다음 여정으로(최하단).
//   후보를 누르면 현재 파티 미리보기에 즉시 반영되고, 다른 후보로 교체 가능. 별도 배치 단계 없음.
// Recipe Hint Preview 01 — 후보(candidateJob)를 데려오면 현재 파티와 즉시 열리는 합체 목록.
//   후보가 재료 중 하나이고 나머지 재료를 현재 파티가 이미 보유 + 결과를 아직 미보유일 때만(현재 가능한 것만).
function recruitFusionHint(candidateJob, ownedJobs) {
  const out = [];
  ACTIVE_FUSION_RECIPES.forEach((r) => {
    if (!r.materials.includes(candidateJob)) return;
    if (ownedJobs.includes(r.result)) return; // 이미 보유한 결과는 제외
    const others = r.materials.filter((m) => m !== candidateJob);
    if (others.length && others.every((m) => ownedJobs.includes(m))) {
      // Recruit Card Compact Hotfix 01 — 후보 이름은 카드 헤드라인에 이미 있으므로 힌트에선 생략한다.
      //   "수호자 + 신관 → 성벽"(후보 반복) → "수호자 → 성벽"(상대 직업 → 결과)로 압축해 "누구와 합치면 무엇이 되나"를 빠르게 읽힌다.
      out.push({ formula: `${others.map(jobName).join(" + ")} → ${jobName(r.result)}`, role: combatRoleLabelOf(r.result) || "" });
    }
  });
  return out;
}

function renderRecruitPanel(state) {
  const f = state.run.formation || {};
  const candidates = state.run.recruitOffer || [];
  const preview = state.run.recruitPreview;

  // Recruit Hint Snapshot Fix (B) — 합체 힌트 계산 기준을 "영입 화면 진입 시 현재 파티"로 고정한다.
  //   임시 선택(preview)된 후보는 formation 빈 슬롯에 들어가므로 기준에서 제외 → 후보 A를 골라도
  //   후보 B/C의 힌트가 바뀌지 않는다(정보 혼선 방지). 상단 4인 미리보기는 그대로(힌트 기준과 분리).
  const baseJobs = SLOT_ORDER.map((k) => f[k]).filter(Boolean).filter((j) => j !== preview);

  // Recruit Screen Redesign 01 (C) — 세로 리스트. 후보별: 아바타 + 직업명·기본역할 + "데려오면 열리는 합체" 1~2줄.
  //   좌/가운데/우 3열을 버리고 한 줄 카드(아바타 왼쪽 + 정보 오른쪽)로 — 합체 힌트가 줄바꿈으로 지저분해지지 않게.
  const cards = candidates.length
    ? candidates.map((id) => {
        const role = combatRoleLabelOf(id);
        const hints = recruitFusionHint(id, baseJobs);
        // Recruit Fusion Hint 03 — 후보 1명이 현재 파티원(최대 3명)과 가질 수 있는 합체 조합을 모두 노출(최대 3개).
        //   recruitFusionHint가 유효 레시피를 전부 수집하므로, 표시 cap만 2→3으로 올린다(영입 시 파티 ≤3 → 최대 3개).
        // Recruit Card Compact Hotfix 01 — "합체 가능" 배지를 작은 "합체 힌트" 라벨로 축소 + 결과 역할명(· 탱커 등) 제거.
        //   힌트 3개는 그대로 모두 노출(표시 cap 3 유지). 줄당 텍스트를 짧게 해 카드 높이를 줄이고 "여정 이어하기" 접근성을 높인다.
        const hintHtml = hints.length
          ? `<span class="recruit-hints"><span class="recruit-hint-label">합체 힌트</span>${hints.slice(0, 3).map((h) => `<span class="recruit-hint-line">${h.formula}</span>`).join("")}</span>`
          : `<span class="recruit-hints recruit-hints--none">새 조합 탐색</span>`;
        return `<button type="button" class="recruit-card recruit-card--row${preview === id ? " selected" : ""}" data-recruit="${id}" aria-label="${jobName(id)}">
          <span class="recruit-ava">${jobAvatarHTML(id, "av-fit--card")}</span>
          <span class="recruit-info">
            <span class="recruit-headline"><b class="recruit-name">${jobName(id)}</b>${role ? ` <span class="recruit-role">· ${role}</span>` : ""}</span>
            ${hintHtml}
          </span>
        </button>`;
      }).join("")
    : `<p class="flow-note">영입 가능한 동료가 없습니다.</p>`;

  // Route Grammar 02 — 영입은 동료의 흔적(ally)의 명시적 선택. 문맥 문구 정리(합체 자동 영입 제거).
  const ctx = state.run.recruitContext;
  const heading = ctx === "ally" ? "동료의 흔적 — 새 동료를 영입하세요" : "새 동료를 영입하세요";
  const note = "현재 파티에 없는 동료가 찾아왔습니다. 후보를 눌러 미리 배치하고, 다음 여정으로 이어가세요.";

  // 후보가 있으면 선택해야 활성, 후보가 없으면(영입 불가) 바로 진행 가능.
  const canProceed = !!preview || candidates.length === 0;

  document.getElementById("recruit-body").innerHTML = `
    <div class="flow-kicker">현재 편성된 파티</div>
    <div class="party-preview-grid">${partyPreviewGridHTML(f)}</div>
    <p class="flow-note flow-note--dim recruit-arrange-note">진형 정비는 이슬 쉼터에서 할 수 있습니다.</p>
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
  const body = document.getElementById("rest-body");
  if (!body) return;
  // Rest Grove 01 — 쉼터 = "정비": 전원 회복 + 진형 정리(슬롯 탭 교체) + 다음 빌드 기회 안내(빌드 포기 아님).
  // Rest Grove Avatar Hotfix 02 — 모닥불 주변 아바타 줄(.rest-heroes)을 빼고, 아래 "현재 파티 그리드"를
  //   유일한 파티 표시로 둔다(아바타가 둘로 중복되어 지저분해지지 않게 — 기능 그리드 가독성 우선).
  //   아바타가 실제로 보이는 건 #rest-panel에 av-stage가 붙은 덕분(index.html). 모닥불 불꽃은 분위기로 유지.
  const picked = (document.getElementById("rest-panel").dataset.picked) || null;
  // Rest Grove Mood 01 — "밤의 숲 캠프" 분위기 복원: 별빛 + 모닥불 글로우(장식 레이어). 기능 그리드는 그대로 유지
  //   (시스템 편성창이 아니라 밤에 정비하는 캠프처럼). 중복 아바타 줄은 되살리지 않음(분위기는 배경/빛으로만).
  const STAR_POS = [
    [10, 16], [24, 9], [38, 22], [52, 12], [66, 19], [80, 10], [90, 26], [16, 32], [72, 33], [44, 6],
  ];
  const stars = STAR_POS.map(([x, y], i) =>
    `<span class="rest-star" style="left:${x}%;top:${y}%;animation-delay:${(i % 5) * 0.4}s"></span>`
  ).join("");
  body.innerHTML = `
    <h2 class="flow-heading">이슬 쉼터 — 정비</h2>
    <div class="rest-scene rest-scene--night">
      <div class="rest-stars" aria-hidden="true">${stars}</div>
      <div class="rest-campfire" aria-hidden="true">
        <span class="rest-glow"></span>
        <span class="rest-flame"></span>
        <span class="rest-flame rest-flame--b"></span>
        <span class="rest-embers"></span>
        <span class="rest-logs"></span>
      </div>
    </div>
    <p class="flow-note">밤의 숲에서 숨을 고르고 진형을 정비합니다 — 전원 회복.<br>이번 기회를 날린 게 아닙니다. 다음 여정에서 빌드(영입·합체) 기회가 이어집니다.</p>
    <div class="flow-kicker">현재 파티 · 진형 정비 — 슬롯을 눌러 위치를 바꿔 다음 전투를 준비하세요</div>
    <div class="party-preview-grid party-preview-grid--rest">${restPartyGridHTML(state, picked)}</div>
    <button type="button" class="route-card rest-continue" data-rest-continue>정비 완료 — 여정을 잇는다</button>
  `;
}

// Rest Grove Visual Hotfix 01 — 쉼터 화면 "현재 파티" 그리드: 슬롯별 아바타(티어 링 포함) + 직업명 + HP바(정비 후 전원 회복 반영)
//   + 전열/후열 표시. 슬롯 탭 교체(data-pf-slot)는 recruit/arrange와 동일 문법. 빈 슬롯은 빈칸으로.
function restPartyGridHTML(state, pickedSlot) {
  const f = state.run.formation || {};
  const hpByJob = {};
  (state.party || []).forEach((u) => { if (u.jobId) hpByJob[u.jobId] = { hp: Math.max(0, u.hp), maxHp: u.maxHp }; });
  return SLOT_ORDER.map((k) => {
    const job = f[k];
    const rowLabel = k.startsWith("f") ? "전열" : "후열";
    const pick = k === pickedSlot ? " picked" : "";
    if (!job) {
      return `<button type="button" class="pf-slot pf-slot--rest pf-${k} empty${pick}" data-pf-slot="${k}" aria-label="빈자리"><span class="pf-row">${rowLabel}</span><span class="pf-empty-mark">＋</span><span class="pf-empty-label">빈자리</span></button>`;
    }
    const h = hpByJob[job] || { hp: 1, maxHp: 1 };
    const pctv = h.maxHp ? Math.round((h.hp / h.maxHp) * 100) : 0;
    return `<button type="button" class="pf-slot pf-slot--rest pf-${k} filled${pick}" data-pf-slot="${k}" aria-label="${jobName(job)}">
      <span class="pf-row">${rowLabel}</span>
      <span class="pf-ava">${jobAvatarHTML(job, "av-fit--card")}</span>
      <span class="pf-name">${jobName(job)}</span>
      <span class="pf-hpbar" aria-hidden="true"><span class="pf-hpfill" style="width:${pctv}%"></span></span>
    </button>`;
  }).join("");
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
      const tag = rw.cardTag ? `<span class="route-reward-tag route-reward-tag--${rw.rewardTier}">${rw.cardTag}</span>` : "";
      // Route Grammar 02 — 4인 전 위험/정예 진입 경고(즉시 처벌 아님 — "큰 피해를 입을 수 있다" 예고).
      let warn = "";
      if ((id === "danger" || id === "elite") && !state.run.party4Reached && partySizeOf(state.run) < 4) {
        pressureClass = " route-card--prewarn";
        warn = `<span class="route-prewarn">파티가 아직 완성되지 않았습니다 — 지금 들어가면 큰 피해를 입을 수 있습니다.</span>`;
      }
      extra = tag + warn;
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

  // Route Grammar 02 — 4인 전엔 경계도가 "잠복"임을 읽힌다(즉시 처벌 아님). 4인 완성 후엔 전면 작동.
  const psize = partySizeOf(state.run);
  const eff = effectiveAlertness(state.run);
  const latent = !state.run.party4Reached;
  const alertNote = latent ? ` <span class="route-latent">(잠복 ${eff})</span>` : "";
  // 4인 전 준비 구간 안내 / 파밍 경고(예고).
  let runwayLine = "";
  if (latent) {
    const fw = farmWarnLevel(state.run.preParty4Battles || 0);
    const msg = fw >= 2 ? "동료를 모으지 않고 헤매면 잠복 경계도가 누설됩니다 — '동료의 흔적'으로 파티를 완성하세요."
      : fw === 1 ? "파티 미완성 — 숲의 시선이 모이고 있습니다. '동료의 흔적'을 권합니다."
      : "파티 완성 전 — 준비 구간입니다(숲이 본격 반응하기 전). '동료의 흔적'으로 4인을 채우세요.";
    runwayLine = `<p class="route-runway route-runway--${fw}">${msg}</p>`;
  } else {
    runwayLine = `<p class="route-runway route-runway--ready">파티 완성 — 숲이 본격적으로 반응합니다.</p>`;
  }
  document.getElementById("route-body").innerHTML = `
    <div class="flow-kicker">${BEGINNER_THEME.name} · 심도 ${state.run.depth}</div>
    <h2 class="flow-heading">다음 여정을 고르세요</h2>
    <p class="flow-note">전투는 자동이지만, 여정은 내가 고른다. 영입·합체·위험은 각각의 선택입니다.</p>
    <div class="route-status">
      <span class="route-stat">심도 <b>${state.run.depth}</b></span>
      <span class="route-stat">파티 <b>${psize}</b>/4</span>
      <span class="route-stat">경계도 <b>${state.run.alertness}</b>${alertNote}</span>
      <span class="route-stat">보스 열쇠 <b>${state.run.bossKeys}</b></span>
    </div>
    ${runwayLine}
    ${atmoLine}
    <p class="route-help">${PRESSURE_HELP}</p>
    <div id="route-list">${cards}</div>
    <button type="button" class="route-abandon" data-abandon>🏳 런 포기 (발자취 기록 후 타이틀)</button>
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
// Codex Recipe Sync 01 — 합체식 표시: 기존 레시피 데이터(ACTIVE_FUSION_RECIPES = FUSION_RECIPES + SECOND_CLASS_RECIPES)에서
//   결과 직업으로 역참조해 "합체식: 한글명 + 한글명". 기본 직업은 레시피 없음(빈 문자열). 데이터/합체 로직 변경 없음(읽기만).
function recipeLabelFor(jobId) {
  const r = ACTIVE_FUSION_RECIPES.find((x) => x.result === jobId);
  if (!r) return "";
  return `합체식: ${jobName(r.materials[0])} + ${jobName(r.materials[1])}`;
}

// Discovery Codex Foundation 01 — 도감 = 4탭(영웅/유물/몬스터/발견 현황). 영웅 탭은 기존 직업 도감 구조 재사용.
//   활성 탭은 #codex-screen dataset.tab(기본 heroes). 미발견 항목은 실루엣/???로 "아직 못 찾은 목표"처럼 보이게.
const CODEX_TABS = [
  { id: "heroes",    label: "영웅" },
  { id: "relics",    label: "유물" },
  { id: "monsters",  label: "몬스터" },
  { id: "discovery", label: "발견 현황" },
];

export function renderCodex() {
  const host = document.getElementById("codex-inner");
  if (!host) return;
  const screen = document.getElementById("codex-screen");
  const tab = (screen && screen.dataset.tab) || "heroes";

  const tabBar = `<div class="codex-tabs" role="tablist">${CODEX_TABS.map((t) =>
    `<button type="button" class="codex-tab${t.id === tab ? " is-active" : ""}" data-codex-tab="${t.id}" role="tab" aria-selected="${t.id === tab}">${t.label}</button>`
  ).join("")}</div>`;

  let body = "";
  if (tab === "relics") body = codexRelicsHTML();
  else if (tab === "monsters") body = codexMonstersHTML();
  else if (tab === "discovery") body = codexDiscoveryHTML();
  else body = codexHeroesHTML();

  host.innerHTML = `
    <div class="codex-header">
      <button type="button" id="codex-back" data-codex-back>← 타이틀로</button>
      <div class="codex-title-wrap">
        <h2>도감</h2>
        <p>발자취가 무엇을 열었는지 — 발견할수록 채워지는 목표판.</p>
      </div>
    </div>
    ${tabBar}
    <div class="codex-tabbody">${body}</div>
    ${tab === "heroes" ? `<div id="codex-detail" class="codex-detail" data-open-job="" hidden></div>` : ""}
    <button type="button" class="flow-next" data-codex-back>타이틀로 돌아가기</button>
  `;
}

// 영웅 탭 — 기존 직업 도감 그리드 재사용 + 상태 배지(발견/해금). ※테스트 빌드에선 2차도 실제로 잠그지 않는다
//   (상태는 표시용 — 구조만 미발견/잠김/해금/???를 표현할 수 있게). 카드 클릭 시 상세 아코디언은 기존 그대로.
function heroCodexStatus(jobId) {
  // 표시용 permissive 판정(실제 게임플레이 합체 가능 여부는 불변): 기본=발견 / 1·2차=해금. 미발견/잠김은 향후.
  if (BASE_JOBS.includes(jobId)) return CODEX_STATUS.discovered;
  return CODEX_STATUS.unlocked;
}
function codexHeroesHTML() {
  const cardHTML = (e) => {
    const fig = avatarFigureHTML(e.sr, e.parts, "av-fit--codex");
    const roleLabel = combatRoleLabelOf(e.job);
    const roleLine = roleLabel ? `<span class="codex-role">성향: ${roleLabel}</span>` : "";
    const recipe = recipeLabelFor(e.job);
    const recipeLine = recipe ? `<span class="codex-recipe">${recipe}</span>` : "";
    const place = slotPreference(e.job)[0].startsWith("f") ? "전열" : "후열";
    const st = heroCodexStatus(e.job);
    return `<button type="button" class="codex-card" data-codex-job="${e.job}" aria-label="${e.name} 상태판 열기">
      <span class="cdx-status ${st.cls}">${st.label}</span>
      <div class="codex-stage">${fig}</div>
      <div class="codex-meta">
        <span class="codex-code">${e.code}</span>
        <span class="codex-name">${e.name}</span>
        <span class="codex-place">추천: ${place}</span>
        ${roleLine}
        ${recipeLine}
      </div>
    </button>`;
  };
  const inTier = (arr) => CODEX_ENTRIES.filter((e) => arr.includes(e.job));
  const section = (title, sub, entries) => entries.length ? `
    <section class="codex-section">
      <div class="codex-section-head"><h3>${title}</h3><span class="codex-section-sub">${sub}</span></div>
      <div class="codex-grid">${entries.map(cardHTML).join("")}</div>
    </section>` : "";
  return `
    ${section("기본 직업", "6종 · 기존 그림자", inTier(BASE_JOBS))}
    ${section("1차 합체", "15종 · 은색 발밑 링", inTier(ADVANCED_JOBS))}
    ${section("2차 합체", "9종 · 금색 발밑 링", inTier(SECOND_CLASS_JOBS))}
    <section class="codex-section codex-section--wip">
      <div class="codex-section-head"><h3>미확정 / 준비 중</h3><span class="codex-section-sub">SR-31~SR-36 · 6칸</span></div>
      <p class="codex-wip-note">남은 2차 6칸은 아직 미확정입니다(역할 빈자리). 확정되면 도감에 합류합니다.</p>
    </section>`;
}

// 유물 탭 — "다음 테마가 공정해지는 준비 도구". 이번엔 전부 미발견(준비 중) — 실제 획득/효과 미구현.
function codexRelicsHTML() {
  const prog = loadProgress();
  const discovered = new Set(prog.discoveredRelics || []);
  const cards = RELIC_CODEX.map((r) => {
    const found = discovered.has(r.id);
    const st = found ? CODEX_STATUS.discovered : CODEX_STATUS.wip;
    return `<div class="cdx-card cdx-relic ${found ? "" : "is-undiscovered"}">
      <span class="cdx-status ${st.cls}">${st.label}</span>
      <div class="cdx-card-body">
        <span class="cdx-name">${found ? r.name : "???"}</span>
        <span class="cdx-effect">${found ? r.effectDraft : "초보자 숲에서 발견되는 유물"}</span>
        <span class="cdx-note">${found ? r.note : "중독 늪 대응 준비 도구"}</span>
      </div>
    </div>`;
  }).join("");
  return `
    <p class="codex-tab-note">유물은 "강해져서 압살"이 아니라 <b>다음 테마(중독 늪)가 공정해지는 준비</b>입니다. (효과 수치는 표시용 초안 — 아직 전투에 적용되지 않습니다.)</p>
    <div class="cdx-list">${cards}</div>`;
}

// 몬스터 탭 — 초보자 숲 몬스터 + 히든/변종. 상태(미발견/발견/처치)는 진행도에서. 히든은 실루엣/???.
function codexMonstersHTML() {
  const prog = loadProgress();
  const seen = new Set(prog.discoveredMonsters || []);
  const slain = new Set(prog.defeatedMonsters || []);
  const card = (m) => {
    const isHidden = m.kind === "hidden";
    const found = seen.has(m.id);
    const killed = slain.has(m.id);
    const st = killed ? CODEX_STATUS.defeated : found ? CODEX_STATUS.discovered : CODEX_STATUS.undiscovered;
    const reveal = found || killed; // 미발견이면 실루엣/??? (히든은 발견 전까지 항상 가림)
    const kindBadge = `<span class="cdx-kind cdx-kind--${m.kind}">${MONSTER_KIND_LABEL[m.kind]}</span>`;
    return `<div class="cdx-card cdx-monster ${reveal ? "" : "is-undiscovered"}">
      <span class="cdx-status ${st.cls}">${st.label}</span>
      ${kindBadge}
      <div class="cdx-card-body">
        <span class="cdx-name">${reveal ? m.name : (isHidden ? "??? (히든)" : "???")}</span>
        <span class="cdx-note">${reveal ? `${m.role} — ${m.note}` : "아직 마주치지 못한 생물"}</span>
      </div>
    </div>`;
  };
  const group = (title, kinds) => {
    const list = MONSTER_CODEX.filter((m) => kinds.includes(m.kind));
    if (!list.length) return "";
    const foundCount = list.filter((m) => seen.has(m.id)).length;
    return `<section class="codex-section">
      <div class="codex-section-head"><h3>${title}</h3><span class="codex-section-sub">${foundCount}/${list.length} 발견</span></div>
      <div class="cdx-list">${list.map(card).join("")}</div>
    </section>`;
  };
  return `
    <p class="codex-tab-note">새싹 숲의 생물들. 반복 탐험으로 <b>히든·변종</b>까지 채워보세요. (히든 몬스터의 실제 출현은 아직 구현되지 않았습니다.)</p>
    ${group("소형", ["small"])}
    ${group("정예 · 보스", ["elite", "boss"])}
    ${group("히든 · 변종", ["hidden"])}`;
}

// 발견 현황 탭 — 다음 목표 한눈에. 진행도 요약 + 지도 조각 + 다음 목표 안내.
function codexDiscoveryHTML() {
  const prog = loadProgress();
  const s = progressSummary(prog);
  const totalMonsters = MONSTER_CODEX.length;
  const totalRelics = RELIC_CODEX.length;
  const stat = (label, val) => `<div class="cdx-stat"><span class="cdx-stat-val">${val}</span><span class="cdx-stat-label">${label}</span></div>`;
  const stats = `
    <div class="cdx-stats">
      ${stat("사자왕 클리어", s.kingClears)}
      ${stat("최고 심도", s.bestDepthBeginner)}
      ${stat("발견 몬스터", `${s.discoveredMonsters}/${totalMonsters}`)}
      ${stat("처치 몬스터", `${s.defeatedMonsters}/${totalMonsters}`)}
      ${stat("2차 레시피 해금", s.unlockedRecipes)}
      ${stat("유물 발견", `${s.discoveredRelics}/${totalRelics}`)}
    </div>`;
  const fragments = MAP_FRAGMENT_CODEX.map((f) => {
    const mf = (prog.mapFragments && prog.mapFragments[f.id]) || { runFound: 0, kept: 0 };
    return `<div class="cdx-fragment">
      <div class="cdx-fragment-head"><span class="cdx-name">${f.name}</span><span class="cdx-fragment-count">${mf.kept || 0}/${f.total}</span></div>
      <div class="cdx-fragment-bar"><span style="width:${Math.round(((mf.kept || 0) / f.total) * 100)}%"></span></div>
      <span class="cdx-note">${f.note}</span>
    </div>`;
  }).join("");
  const hasAny = s.kingClears || s.bestDepthBeginner || s.discoveredMonsters;
  return `
    <p class="codex-tab-note">${hasAny ? "지금까지의 발자취가 연 것들입니다." : "아직 발견이 없습니다 — 첫 탐험을 시작해 보세요."}</p>
    ${stats}
    <section class="codex-section">
      <div class="codex-section-head"><h3>지도 조각</h3><span class="codex-section-sub">다음 테마 해금</span></div>
      <div class="cdx-fragments">${fragments}</div>
    </section>
    <div class="cdx-next-goal">다음 목표 — 초보자 숲을 더 탐험해 중독 늪의 단서를 찾아보세요.</div>`;
}

// Hero UX Polish 01C — 도감 상세 아코디언 토글: 클릭한 카드의 "행 끝" 뒤로 상세 패널을 옮겨 카드 바로 아래(전폭)에 펼친다.
//   같은 직업이 열려 있으면 닫는다(토글). 항상 하나만 열림(단일 패널을 이동). jobStatus 데이터/전투 로직 변경 없음.
export function toggleCodexDetail(jobId) {
  const el = document.getElementById("codex-detail");
  if (!el) return;
  if (!el.hidden && el.dataset.openJob === jobId) { closeCodexDetail(); return; }
  // Codex Recipe Sync 01 — 섹션이 여러 그리드라, 클릭한 카드를 전 섹션에서 찾아 그 카드가 속한 그리드에 상세를 넣는다.
  const card = document.querySelector(`.codex-card[data-codex-job="${jobId}"]`);
  const grid = card && card.closest(".codex-grid");
  if (!card || !grid) return;
  const cards = [...grid.querySelectorAll(".codex-card")];
  const idx = cards.indexOf(card);
  // 2열 그리드: 왼쪽 카드(짝수)면 같은 행 오른쪽 카드 뒤, 오른쪽 카드면 자기 뒤 → 행 아래 전폭.
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
  if (SECOND_CLASS_JOBS.includes(jobId)) return "2차"; // Codex Recipe Sync 01 — 정식 해금 반영("2차 씨앗"→"2차")
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

    ${s.tagline ? `<p class="cd-tagline">${s.tagline}</p>` : ""}

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

  // Run Reward Training 01 → Deep Reward Pool 01 — 보상 id를 성장(rewards) 또는 심층(deepRewards)으로 해석.
  //   심층 보상은 Lv 대신 분류 태그(심층·임시/생존/귀환…)를 보여주고 effect 문구를 쓴다(일반 성장과 구분).
  const resolve = (id) => {
    const g = rewardById(id);
    if (g) return { id: g.id, name: g.name, desc: g.description, deep: false };
    const d = deepRewardById(id);
    return d ? { id: d.id, name: d.name, desc: d.effect, deep: true, tag: d.tag } : null;
  };
  const offerIds = state.run.rewardOffer || [];
  const choices = (offerIds.length ? offerIds.map(resolve).filter(Boolean) : REWARDS.map((r) => ({ id: r.id, name: r.name, desc: r.description, deep: false })));
  const hasDeep = choices.some((c) => c.deep);
  // E — Max 성장 대체로 심층 보상이 나오면 유저가 이상하게 느끼지 않게 문구 보강.
  const deepNote = hasDeep ? "<br><span class='growth-hint'>성장이 응축되어 이번 모험을 더 깊이 돕는 선택이 나타났습니다.</span>" : "";
  document.getElementById("growth-subtitle").innerHTML =
    `${pickWord}.${pickHint}<br><span class='growth-hint'>선택한 훈련은 이번 모험 동안 유지되고, 다음 전투부터 적용됩니다.</span>${deepNote}`;

  const lvOf = (id) => Math.min(REWARD_MAX_LEVEL, ((state.run.rewardLevels || {})[id] || 0) + 1);
  document.getElementById("growth-choices").innerHTML = choices.map((r) =>
    r.deep
      ? `<button type="button" data-reward="${r.id}">
          <span class="reward-name">${r.name} <b class="reward-tag">심층·${r.tag}</b></span>
          <span class="reward-desc">${r.desc}</span>
        </button>`
      : `<button type="button" data-reward="${r.id}">
          <span class="reward-name">${r.name} <b class="reward-lv">Lv.${lvOf(r.id)}/${REWARD_MAX_LEVEL}</b></span>
          <span class="reward-desc">${r.desc}</span>
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
    // Run Footprints 01 — 결과 카드 하단에 직전 발자취 1줄(방금 저장된 최신 기록).
    const fpEl = document.getElementById("result-footprint");
    if (fpEl) {
      const list = loadFootprints();
      const last = list[list.length - 1];
      fpEl.textContent = last ? footprintLine(last, jobName) : "";
    }
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
  }
}

// Run Footprints 01 — 발자취 패널 목록 채우기(최신 먼저). main.js가 패널을 열 때 호출한다.
//   게임 상태(gameState.screen)와 무관한 가벼운 오버레이 — 여기선 #footprints-list만 갱신.
export function renderFootprintsList() {
  const host = document.getElementById("footprints-list");
  if (!host) return;
  const list = loadFootprints().slice().reverse(); // 최신이 위로
  if (!list.length) {
    host.innerHTML = `<p class="fp-empty">아직 발자취가 없습니다. 런을 클리어/실패/포기하면 기록됩니다.</p>`;
    return;
  }
  // Run Footprints Polish 01 — 한 줄 텍스트 대신 메타(결과·심도·경계도·실측/x2환산) + 최종 파티 아바타 미니.
  //   아바타는 .av-stage 스코프 안에서만 파츠·티어 링(1차 은/2차 금)이 렌더되므로 파티 컨테이너에 av-stage를 준다.
  const ava = (p) => `<span class="fp-ava" title="${jobName(p.job)}">${jobAvatarHTML(p.job, "av-fit--fp")}</span>`;
  host.innerHTML = list.map((fp) => {
    const party = fp.party || [];
    const front = party.filter((p) => String(p.slot).startsWith("f"));
    const back = party.filter((p) => String(p.slot).startsWith("b"));
    const partyHtml = party.length
      ? `<div class="fp-party av-stage">
           <span class="fp-ava-group">${front.map(ava).join("")}</span>
           ${front.length && back.length ? `<span class="fp-sep"></span>` : ""}
           <span class="fp-ava-group">${back.map(ava).join("")}</span>
         </div>`
      : "";
    return `<div class="fp-row fp-row--${fp.result}" title="${footprintLine(fp, jobName)}">
       <div class="fp-meta">
         <span class="fp-result">${resultLabel(fp.result)}</span>
         <span class="fp-stat">심도 ${fp.depth} · 경계도 ${fp.alertness}</span>
         <span class="fp-time">${footprintTimeText(fp)}</span>
       </div>
       ${partyHtml}
     </div>`;
  }).join("");
}

// Run Footprints 01 — 복사용 TSV 텍스트(직업명 포함). main.js의 복사 핸들러가 사용.
export function footprintsCopyText() {
  return footprintsToTSV(loadFootprints(), jobName);
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
  // Route Grammar 02 — 4인 전엔 경계도가 잠복임을 HUD에서도 읽힌다.
  const latent = !state.run.party4Reached;
  const alertTxt = latent ? `${state.run.alertness} <span class="hud-latent">(잠복 ${effectiveAlertness(state.run)})</span>` : `${state.run.alertness}`;
  el.innerHTML = [
    `<span>심도 <b>${state.run.depth}</b></span>`,
    `<span>파티 <b>${partySizeOf(state.run)}</b>/4</span>`,
    `<span>경계도 <b>${alertTxt}</b></span>`,
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

  // Job Identity Tuning 02 — 결계장 지속 오오라: 결계장 생존 + 결속(wardlink) 활성 중이면 본체에 청록 오오라 글로우(발동 중 계속 노출).
  el.classList.toggle("has-ward-aura",
    unit.id === "wardkeeper" && !unit.isDead && Array.isArray(unit.statuses) && unit.statuses.some((s) => s.type === "wardlink"));

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
    // Combat Visibility — 교란/워든/바드 tempo로 게이지가 깎인 경우만 "여기였다" 마커(gaugeDropFrom→현재 깎인 구간).
    //   일반 행동 소모(게이지→0)는 플래그가 없어 마커가 뜨지 않는다.
    if (tempoBar && unit.gaugeDropFrom != null) {
      spawnGaugeDropMark(tempoBar, unit.gaugeDropFrom, gauge);
      unit.gaugeDropFrom = null;
    }
    // Job Identity Tuning 01 — 무희 피날레로 게이지가 오른 경우: 상승 구간을 분홍으로 잠깐 보여준다("단숨에 나아간다").
    if (tempoBar && unit.gaugeRiseFrom != null) {
      spawnGaugeRiseMark(tempoBar, unit.gaugeRiseFrom, gauge);
      unit.gaugeRiseFrom = null;
    }
    if (tempoBar) {
      tempoBar.classList.toggle("ready-soon", (unit.actionGauge ?? 0) >= 88);
    }
  }
}

// Combat Visibility — 게이지 감소 마커: tempo-bar 안에 "깎인 구간"(toPct→fromPct)을 잠깐 보여줬다 사라지게.
//   교란/워든/바드 tempo가 게이지를 깎은 순간 "여기였는데 깎였다"가 파랑 게이지 위에서 읽히게 한다.
function spawnGaugeDropMark(tempoBar, fromPct, toPct) {
  const from = Math.max(0, Math.min(100, fromPct));
  const to = Math.max(0, Math.min(100, toPct));
  if (from - to < 1) return; // 거의 안 깎였으면 생략
  const m = document.createElement("span");
  m.className = "tempo-drop";
  m.style.left = `${to}%`;
  m.style.width = `${from - to}%`;
  m.addEventListener("animationend", () => m.remove());
  tempoBar.appendChild(m);
}

// Job Identity Tuning 01 — 게이지 상승 마커: 무희 피날레로 오른 구간(from→to)을 분홍으로 잠깐 보여준다.
function spawnGaugeRiseMark(tempoBar, fromPct, toPct) {
  const from = Math.max(0, Math.min(100, fromPct));
  const to = Math.max(0, Math.min(100, toPct));
  if (to - from < 1) return;
  const m = document.createElement("span");
  m.className = "tempo-rise";
  m.style.left = `${from}%`;
  m.style.width = `${to - from}%`;
  m.addEventListener("animationend", () => m.remove());
  tempoBar.appendChild(m);
}

// Combat Visibility — 금제(악의 결속)/성벽(선의 결속) 지속 결속선.
//   행동선처럼 떴다 사라지지 않고, 결속(bondOffenseTarget/bondDefenseTarget)이 유지되는 동안 매 렌더 갱신해 계속 노출한다.
//   두 대상 사이 반투명 사슬선(흐르는 dash) + 중앙 자물쇠. reconcile(키 기반)이라 위치만 갱신되고 흐름 애니메이션은 끊기지 않는다.
function renderBondLinks(state) {
  const layer = document.getElementById("bond-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  if (state.battle.previewKind === "layout") { layer.innerHTML = ""; return; }
  const fieldRect = field.getBoundingClientRect();
  const all = [...(state.party || []), ...(state.enemies || [])];
  const byId = (id) => all.find((u) => u.instanceId === id && !u.isDead);
  const pairs = [];
  (state.party || []).forEach((u) => {
    if (u.isDead) return;
    if (u.bondOffenseTarget) { const t = byId(u.bondOffenseTarget); if (t) pairs.push({ key: u.instanceId + ">" + t.instanceId, a: u, b: t, kind: "offense" }); }
    if (u.bondDefenseTarget) { const t = byId(u.bondDefenseTarget); if (t) pairs.push({ key: u.instanceId + ">" + t.instanceId, a: u, b: t, kind: "defense" }); }
  });
  const keep = new Set(pairs.map((p) => p.key));
  // 해제된 결속 제거(사라진 것만).
  [...layer.children].forEach((c) => { if (!keep.has(c.dataset.bondKey)) c.remove(); });
  const w = field.clientWidth, h = field.clientHeight;
  // Combat Target-Link Polish 01 — 결속선 시작/끝을 아바타 "몸통 중앙(가슴)" 기준으로 연결(둘이 직접 묶인 느낌).
  const BOND_ANCHOR = { fx: 0.5, fy: 0.46 };
  pairs.forEach(({ key, a, b, kind }) => {
    const pa = unitPoint(a.instanceId, BOND_ANCHOR, fieldRect);
    const pb = unitPoint(b.instanceId, BOND_ANCHOR, fieldRect);
    if (!pa || !pb) return;
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2 - 8; // 살짝만 휨 — 더 직접 연결 느낌
    let svg = [...layer.children].find((c) => c.dataset.bondKey === key);
    if (!svg) {
      svg = document.createElementNS(SVG_NS, "svg");
      svg.dataset.bondKey = key;
      svg.setAttribute("class", `bond-svg bond-svg--${kind}`);
      // Combat Target-Link Polish 01 — 연결 코어(가는 실선) + 체인 마디(흐르는 dash) + 중앙 자물쇠(본체+고리) = "봉인/연결" 시각 언어.
      const core = document.createElementNS(SVG_NS, "path"); core.setAttribute("class", "bond-core");
      const chain = document.createElementNS(SVG_NS, "path"); chain.setAttribute("class", "bond-chain");
      const lock = document.createElementNS(SVG_NS, "g"); lock.setAttribute("class", "bond-lock");
      const shackle = document.createElementNS(SVG_NS, "path");
      shackle.setAttribute("class", "bond-lock-shackle");
      shackle.setAttribute("d", "M -2.4 -0.4 L -2.4 -2.6 A 2.4 2.4 0 0 1 2.4 -2.6 L 2.4 -0.4");
      const body = document.createElementNS(SVG_NS, "rect");
      body.setAttribute("class", "bond-lock-body");
      body.setAttribute("x", "-3.6"); body.setAttribute("y", "-0.4"); body.setAttribute("width", "7.2"); body.setAttribute("height", "6.2"); body.setAttribute("rx", "1.5");
      lock.appendChild(shackle); lock.appendChild(body);
      svg.appendChild(core); svg.appendChild(chain); svg.appendChild(lock);
      layer.appendChild(svg);
    }
    svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const d = `M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`;
    svg.querySelector(".bond-core").setAttribute("d", d);
    svg.querySelector(".bond-chain").setAttribute("d", d);
    svg.querySelector(".bond-lock").setAttribute("transform", `translate(${mx} ${my})`);
  });
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
  // Combat Grammar Follow-up 01 — 성황 성역(damageImmune 파생, 표시 전용 — 효과는 damageImmune이 담당).
  sanctuary: { t: "성역", c: "sanctuary" },
  // Job Identity Tuning 01 — 성황 수호 오오라(실제 aegis 상태 — 받는 피해 고정 감소). 방어 버프칩.
  aegis: { t: "방어", c: "aegis" },
  // Job Identity Tuning 02 — 결계장 파티 결속(실제 wardlink 상태) / 검성 간파 준비(합성 — parryReady 파생, 분쇄는 동적 표기).
  wardlink: { t: "결계", c: "ward" },
  parry: { t: "간파", c: "ready" },
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
  // Combat Visibility — 결속 칩은 "사용자"에만(금제 bondOffenseTarget / 성벽 bondDefenseTarget). 적용 대상(protectedBy)엔 미표시 — 지속 결속선으로 인지.
  if (!unit.isDead && (unit.bondOffenseTarget || unit.bondDefenseTarget)) chips.push("bond");
  // Second Class Batch 2 — 무희 박자(불리언/숫자 필드 unit.beat) → 무희에만 '리듬' 합성 칩(예측 가능한 박자 진행 표시).
  if (unit.id === "dancer" && !unit.isDead && unit.beat) chips.push("rhythm");
  // Combat Grammar Follow-up 01 — 성역(성황 부여) 받은 아군: damageImmune → [성역] 버프칩(1회 무효 소모 시 사라짐). 표시 전용.
  if (!unit.isDead && unit.damageImmune) chips.push("sanctuary");
  // Job Identity Tuning 02 — 검성 간파 준비(parryReady) / 분쇄 스택(crushStacks>0, 동적 표기). 표시 전용.
  if (unit.id === "swordsaint" && !unit.isDead && unit.parryReady !== false) chips.push("parry");
  if (unit.id === "swordsaint" && !unit.isDead && (unit.crushStacks || 0) > 0) chips.push("crush");
  return chips;
}
function statusChipsHTML(unit) {
  const chips = statusChips(unit);
  if (chips.length === 0) return "";
  return chips.slice(0, 4)
    .map((t) => {
      // Job Identity Tuning 02 — 분쇄는 현재 스택을 동적으로 표기(축약 "분쇄N").
      if (t === "crush") return `<span class="status-chip status-chip--crush">분쇄${unit.crushStacks}</span>`;
      return `<span class="status-chip status-chip--${STATUS_CHIP[t].c}">${STATUS_CHIP[t].t}</span>`;
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
export function playSupportFx({ casterInstanceId, text, kind, heals = [], guardInstanceId, buffs = [] }) {
  if (fxSuppressed) return; // Dev Balance Lab 01 — 헤드리스 sim 중 표시 생략
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();

  if (text) spawnActionShout(casterInstanceId, text, fieldRect, { tier: "skill", kind });

  // Combat Visibility Polish 01 — 시전자 몸통 시작점(행동선 공통 시작 문법). heal/support 선이 여기서 출발해
  //   "누가 누구에게 무엇을"이 텍스트 없이 읽힌다. 영웅/몬스터(풀양·올빼미·사슴 등) 공통.
  const s = unitPoint(casterInstanceId, BODY_MID_FRAC, fieldRect);

  heals.forEach((h) => {
    if (dyingUnits.has(h.targetInstanceId) || cleanedDead.has(h.targetInstanceId)) return;
    const p = unitPoint(h.targetInstanceId, { fx: 0.5, fy: 0.46 }, fieldRect);
    // 실제 회복(amount>0)이고 자기 자신이 아닐 때만 heal 선(보호막용 더미 amount 0 / 자가 회복은 선 생략 — 과밀 방지).
    if (s && p && h.amount > 0 && h.targetInstanceId !== casterInstanceId) {
      spawnStartPulse(layer, s, "heal");
      spawnLine(layer, s, p, "heal", kind, "heal");
    }
    if (p) spawnPulse(layer, p, true); // heal end — 민트 펄스(뾰로롱)
    if (h.amount > 0 && p) spawnNumber(layer, { x: p.x, y: Math.max(24, p.y - 16) }, h.targetInstanceId, true, h.amount);
    reactUnit(h.targetInstanceId, true);
  });

  if (guardInstanceId && !dyingUnits.has(guardInstanceId) && !cleanedDead.has(guardInstanceId)) {
    const g = unitPoint(guardInstanceId, { fx: 0.5, fy: 0.46 }, fieldRect);
    if (g) {
      // Combat Visibility Polish 01 — 보호(guard/ward)=방패 end / 그 외(buff/support/command)=능력치 상승 end.
      const isGuardKind = kind === "guard" || kind === "ward";
      const variant = isGuardKind ? "guard" : "support";
      // 아군 대상이면 시전자→대상 지원선(자기 자신 대상이면 0길이라 선 생략).
      if (s && guardInstanceId !== casterInstanceId) {
        spawnStartPulse(layer, s, variant);
        spawnLine(layer, s, g, "support", kind, variant);
      }
      if (isGuardKind) spawnGuardEndPulse(layer, g);
      else spawnBuffPulse(layer, g);
    }
  }

  // Combat Visibility Job Grammar 01 — 아군 버프 대상들(바드 리듬·무희 1박 등): 시전자→대상 지원선 + 상승 end per 대상.
  //   "누가 누구에게"가 대상 수만큼 읽힌다. 회복(heal)과 결이 다른 support/buff 문법(치유 FX와 안 섞임).
  buffs.forEach((id) => {
    if (!id || id === casterInstanceId) return;
    if (dyingUnits.has(id) || cleanedDead.has(id)) return;
    const g = unitPoint(id, { fx: 0.5, fy: 0.46 }, fieldRect);
    if (!g) return;
    if (s) {
      spawnStartPulse(layer, s, "support");
      spawnLine(layer, s, g, "support", kind, "support");
    }
    spawnBuffPulse(layer, g);
    reactUnit(id, true);
  });
}

// Action Emphasis 01: 시선 우선순위 = acting > line > target reaction > idle.
//   현재 행동 중(acting cue 표시 중)인 유닛 추적 → 그 사이 들어오는
//   target reaction은 생략(같은 유닛에 선언과 피격이 겹쳐 시선이 꼬이지 않게).
const actingUnits = new Set();

// battle.js에서 행동 발생 시 호출 (전투 계산과 분리된 FX 이벤트)
export function playActionFx(event) {
  if (fxSuppressed) return; // Dev Balance Lab 01 — 헤드리스 sim 중 표시 생략
  // Job Grammar 01: kind = 직업 행동 분류(strike/protect/snipe/heal/attack).
  //   현재는 행동선 data-kind 기록만 — 시각 변화 없음. 미래 직업별 FX/로그 확장 hook.
  const { sourceInstanceId, sourceUnitId, targetInstanceId, lineType, kind, isHeal, amount,
    shoutText, shoutKind, shoutTier, numberVariant, delayExtra = 0, chained = false, noLine = false } = event;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;

  const fieldRect = field.getBoundingClientRect();
  // Action Line Visibility 01 — 시작점을 무기끝 앵커에서 몸통 중앙 쪽으로 끌어와 "이 캐릭터의 몸에서 출발"을 명확히.
  //   전열/후열 겹침에서 시작 actor가 모호해지던 문제 해소(source 쪽만 보정 — target 위치는 그대로).
  const rawFrac = SOURCE_ANCHORS[sourceUnitId] || { fx: 0.5, fy: 0.45 };
  const srcFrac = {
    fx: rawFrac.fx + (BODY_MID_FRAC.fx - rawFrac.fx) * START_BODY_BIAS,
    fy: rawFrac.fy + (BODY_MID_FRAC.fy - rawFrac.fy) * START_BODY_BIAS,
  };
  const variant = actionLineVariant(lineType, kind);

  // 좌표는 .unit wrap rect 기준 → acting scale(자식 .fig-react)에 영향받지 않음(안정)
  // Basic Action Breath 01: 시작점 = 공격자 몸통(srcFrac), 도착점 = 대상 테두리 중
  //   공격자(치유자)와 가장 가까운 지점(borderPointToward). 중심 직격이 아니라 "닿는" 느낌.
  const s = unitPoint(sourceInstanceId, srcFrac, fieldRect);
  const t = s
    ? impactPoint(targetInstanceId, sourceInstanceId, s, fieldRect) || unitPoint(targetInstanceId, TARGET_HIT, fieldRect)
    : null;
  if (!s || !t) return;

  // Combat Visibility Job Grammar 01 — chained(체인 관통 2번째 선 등)은 행동자 선언/외침/대상큐를 생략하고
  //   "이어지는 선 + 도착 hit"만 그린다(이미 1번째 선에서 선언했으므로 중복 방지).
  if (!chained) {
    // 1) 행동자 선언("나야 지금!") — source unit이 먼저 짧게 보인다. (noLine=광역 폭발 등은 per-대상 선언 생략)
    if (!noLine) cueActor(sourceInstanceId, lineType);
    // 1a) 행동 텍스트(외침). Hero Skill 01: event.shoutText로 "공격!"/스킬명 모두 처리. (noLine에서도 시전자 외침은 유지)
    if (shoutText) {
      spawnActionShout(sourceInstanceId, shoutText, fieldRect, { tier: shoutTier, kind: shoutKind });
    }
    // 1b) 대상 신호("잡혔다") — actor보다 약한 보조 신호. 선이 도착하기 전 대상을 가리킨다.
    if (!noLine) spawnTargetCue(targetInstanceId, isHeal);
  }

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
  // Combat Visibility Polish 01 — 피해 숫자를 머리 위가 아니라 "타격 지점(End=hit ring) 바로 위"에 붙인다.
  //   "피해가 실제 적중 지점에서 발생"하는 느낌 강화. 큰 대상은 기존(28px 위)·소형도 End 기준 16px 위(화면 안 clamp).
  const tn = bigTarget
    ? { x: t.x, y: Math.max(56, Math.min(fieldRect.height - 18, t.y - 28)) }
    : { x: t.x, y: Math.max(24, Math.min(fieldRect.height - 14, t.y - 16)) };
  const fire = () => {
    // Action Line Visibility 01 — 시작점 pulse로 "이 actor가 행동선의 출발점"을 1회 번쩍(과하지 않게).
    //   Combat Grammar Follow-up 01 — noLine(광역 폭발 등)은 선/시작펄스 생략하고 도착 hit(펄스/숫자/반응)만 남긴다.
    if (!noLine) {
      spawnStartPulse(layer, s, variant);
      spawnLine(layer, s, t, lineType, kind, variant);
    }
    spawnPulse(layer, t, isHeal);
    // First Class Expansion 01: 피해/회복 0(상태 부여형 스킬: 중독 등)은 숫자 생략.
    // Combat Grammar Foundation 01: numberVariant(crit 등)로 피해 숫자 규격 분기.
    if (amount > 0) spawnNumber(layer, tn, targetInstanceId, isHeal, amount, numberVariant);
    reactUnit(targetInstanceId, isHeal);
  };
  setTimeout(fire, lead + delayExtra);
}

// Status & Effect Foundation 01 — 상태 tick FX(poison 등).
//   행동선/펄스/리액션 없이 작은 숫자만 — 기존 숫자 상한(MAX_FX_NUMBERS)을 공유해
//   MAX/다수전에서도 과밀해지지 않는다. 죽는 중/정리된 유닛은 생략.
export function playStatusTickFx({ targetInstanceId, amount, kind }) {
  if (fxSuppressed) return; // Dev Balance Lab 01 — 헤드리스 sim 중 표시 생략
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
  if (fxSuppressed) return; // Dev Balance Lab 01 — 헤드리스 sim 중 표시 생략
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

// Combat Visibility Job Grammar 01 — 적 진영 중앙점(살아있는 적 unitPoint 평균). 집속/확산 기준.
function enemyCenter(enemyIds, fieldRect) {
  const pts = (enemyIds || []).map((id) => unitPoint(id, { fx: 0.5, fy: 0.5 }, fieldRect)).filter(Boolean);
  if (!pts.length) return null;
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
}

// Combat Grammar Follow-up 01 — 적 전장 고정 중앙(폴백): 상단 중앙-우측 근처(적 진형 영역).
function fieldEnemyAnchor(fieldRect) {
  return { x: fieldRect.width * 0.56, y: fieldRect.height * 0.26 };
}

// Combat Grammar Follow-up 01 — 마도/현자 충전 씨앗 좌표(field 비율로 고정). 충전 때 정해 발동 때 "그 자리"에서 폭발.
const chargeSeeds = new Map(); // casterInstanceId → { fx, fy }

// 마도/현자 집중 전조: 시전자→적 전장 고정 중앙 선 + 그 좌표에 "마력이 모이는 씨앗"(수렴 링).
//   중앙 좌표는 충전 시점에 고정(발동 때 남은 적 수와 무관 — "씨앗을 그 자리에 던져둔다").
function spawnChargeGather(casterInstanceId, enemyIds) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const c = enemyCenter(enemyIds, fieldRect) || fieldEnemyAnchor(fieldRect);
  chargeSeeds.set(casterInstanceId, { fx: c.x / (fieldRect.width || 1), fy: c.y / (fieldRect.height || 1) });
  const s = unitPoint(casterInstanceId, BODY_MID_FRAC, fieldRect);
  if (s) { spawnStartPulse(layer, s, "special"); spawnLine(layer, s, c, "ranged", "charge", "special"); }
  const el = document.createElement("span");
  el.className = "fx-gather fx-var--special";
  el.style.left = `${c.x}px`;
  el.style.top = `${c.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// 광역 발동: 충전 때 고정한 "그 좌표(씨앗)"에서 보라 충격파 원이 커지며 적 전체 영역으로 퍼진다("그 자리에서 터진다").
//   시전자→각 적 선은 그리지 않는다(battle.js noLine). 반경 = 현재 적 전체를 덮게(없으면 고정).
function spawnAoeSpread(casterInstanceId, enemyIds) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const seed = chargeSeeds.get(casterInstanceId);
  chargeSeeds.delete(casterInstanceId);
  const c = seed
    ? { x: seed.fx * fieldRect.width, y: seed.fy * fieldRect.height }
    : (enemyCenter(enemyIds, fieldRect) || fieldEnemyAnchor(fieldRect));
  const pts = (enemyIds || []).map((id) => unitPoint(id, { fx: 0.5, fy: 0.5 }, fieldRect)).filter(Boolean);
  const maxR = pts.length ? Math.max(80, ...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) + 50 : 170;
  // Combat Feedback Polish 02 → Mage/Sage AoE Shockwave Polish 01 — "팡!" 코어 + 바깥으로 밀려나가는 충격파 원 3겹
  //   (1차 강한 파동 + 약한 잔향). 코어 플래시만 보이지 않게, 원이 "바깥으로 확장"하며 적 전체로 퍼지는 게 읽히게 한다.
  const core = document.createElement("span");
  core.className = "fx-blast-core fx-var--special";
  core.style.left = `${c.x}px`;
  core.style.top = `${c.y}px`;
  core.addEventListener("animationend", () => core.remove());
  layer.appendChild(core);
  [0, 120, 240].forEach((delay, i) => {
    const ring = document.createElement("span");
    ring.className = "fx-aoe-spread fx-var--special" + (i === 2 ? " fx-aoe-spread--echo" : ""); // 마지막은 약한 잔향
    ring.style.left = `${c.x}px`;
    ring.style.top = `${c.y}px`;
    ring.style.setProperty("--aoe-r", `${maxR}px`);
    if (delay) ring.style.animationDelay = `${delay}ms`;
    ring.addEventListener("animationend", () => ring.remove());
    layer.appendChild(ring);
  });
  // Mage AoE Presence 01 — 적 진영 전체를 덮는 큰 마력 파동(dome) 1겹: 두껍고 느리게 확산("광역" 스케일 강조).
  const dome = document.createElement("span");
  dome.className = "fx-aoe-dome fx-var--special";
  dome.style.left = `${c.x}px`;
  dome.style.top = `${c.y}px`;
  dome.style.setProperty("--aoe-r", `${maxR + 30}px`);
  dome.addEventListener("animationend", () => dome.remove());
  layer.appendChild(dome);
  // Mage AoE Presence 01 — 적별 동시 피격 펄스: "모두에게 동시에 맞았다"가 눈에 읽히게(코어 폭발 직후 거의 동시 + 미세 stagger).
  pts.forEach((p, i) => {
    const hit = document.createElement("span");
    hit.className = "fx-aoe-hit fx-var--special";
    hit.style.left = `${p.x}px`;
    hit.style.top = `${p.y}px`;
    hit.style.animationDelay = `${90 + i * 26}ms`;
    hit.addEventListener("animationend", () => hit.remove());
    layer.appendChild(hit);
  });
  // Mage AoE Presence 01 — 작은 화면 흔들림(꽈광). 전장 전체가 한 번 울린다.
  triggerFieldShake(field);
}

// Mage AoE Presence 01 — 광역 폭발 순간 전장(#battle-field)에 짧은 흔들림 클래스. playActorFx가 fxSuppressed 가드 뒤에서만
//   spawnAoeSpread를 부르므로 헤드리스/Lab sim에선 호출되지 않는다(전투 계산/수치 불변, presentation 전용).
function triggerFieldShake(field) {
  if (!field) return;
  field.classList.remove("fx-field-shake");
  void field.offsetWidth; // reflow로 애니메이션 재시작 보장
  field.classList.add("fx-field-shake");
  setTimeout(() => field.classList.remove("fx-field-shake"), 380);
}

// Combat Grammar Follow-up 01 — 성황 성역: 시전자(성황) 중심 노랑 성역 파동이 아군 전체 영역으로 퍼진다 + 각 아군 금빛 보호 펄스.
//   "방어/보호의 권위" 느낌. 아군의 [성역] 버프칩(damageImmune 파생)으로 상태도 인지.
function spawnSanctuarySpread(casterInstanceId, allyIds) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const c = unitPoint(casterInstanceId, BODY_MID_FRAC, fieldRect);
  if (!c) return;
  const pts = (allyIds || []).map((id) => unitPoint(id, { fx: 0.5, fy: 0.5 }, fieldRect)).filter(Boolean);
  const maxR = pts.length ? Math.max(80, ...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) + 50 : 150;
  const el = document.createElement("span");
  el.className = "fx-sanctuary";
  el.style.left = `${c.x}px`;
  el.style.top = `${c.y}px`;
  el.style.setProperty("--aoe-r", `${maxR}px`);
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
  pts.forEach((p) => spawnGuardEndPulse(layer, p));
}

// Job Identity Tuning 01 — 성황 수호의 오오라: 아바타보다 큰 이글이글 오오라가 성황에 켜짐 + 아군 전체 금빛 파동 + 보호 펄스.
function spawnAura(casterInstanceId, allyIds) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const c = unitPoint(casterInstanceId, { fx: 0.5, fy: 0.5 }, fieldRect);
  if (!c) return;
  const aura = document.createElement("span");
  aura.className = "fx-aura";
  aura.style.left = `${c.x}px`;
  aura.style.top = `${c.y}px`;
  aura.addEventListener("animationend", () => aura.remove());
  layer.appendChild(aura);
  const cb = unitPoint(casterInstanceId, BODY_MID_FRAC, fieldRect) || c;
  const pts = (allyIds || []).map((id) => unitPoint(id, { fx: 0.5, fy: 0.5 }, fieldRect)).filter(Boolean);
  const maxR = pts.length ? Math.max(80, ...pts.map((p) => Math.hypot(p.x - cb.x, p.y - cb.y))) + 50 : 150;
  const wave = document.createElement("span");
  wave.className = "fx-sanctuary";
  wave.style.left = `${cb.x}px`;
  wave.style.top = `${cb.y}px`;
  wave.style.setProperty("--aoe-r", `${maxR}px`);
  wave.addEventListener("animationend", () => wave.remove());
  layer.appendChild(wave);
  pts.forEach((p) => spawnGuardEndPulse(layer, p));
}

// Job Identity Tuning 01 — 무희 피날레: 효과 받은 아군에게 분홍 뾰로롱(스파클) + 무희 중심 분홍 파동("단숨에 나아간다").
function spawnFinaleFx(casterInstanceId, allyIds) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const pts = (allyIds || []).map((id) => unitPoint(id, { fx: 0.5, fy: 0.46 }, fieldRect)).filter(Boolean);
  pts.forEach((p) => {
    const el = document.createElement("span");
    el.className = "fx-finale";
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.addEventListener("animationend", () => el.remove());
    layer.appendChild(el);
  });
  const c = unitPoint(casterInstanceId, BODY_MID_FRAC, fieldRect);
  if (c && pts.length) {
    const maxR = Math.max(80, ...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) + 40;
    const wave = document.createElement("span");
    wave.className = "fx-finale-wave";
    wave.style.left = `${c.x}px`;
    wave.style.top = `${c.y}px`;
    wave.style.setProperty("--aoe-r", `${maxR}px`);
    wave.addEventListener("animationend", () => wave.remove());
    layer.appendChild(wave);
  }
}

// 추적자/천궁 표식 부여: 시전자→대상 점선 조준선 + 대상 몸통 스코프 표식(item 6).
function spawnMarkFx(casterInstanceId, targetInstanceId) {
  if (!targetInstanceId) return;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  if (dyingUnits.has(targetInstanceId) || cleanedDead.has(targetInstanceId)) return;
  const fieldRect = field.getBoundingClientRect();
  const s = unitPoint(casterInstanceId, BODY_MID_FRAC, fieldRect);
  const t = unitPoint(targetInstanceId, { fx: 0.5, fy: 0.46 }, fieldRect);
  if (!t) return;
  if (s) { spawnStartPulse(layer, s, "special"); spawnLine(layer, s, t, "mark", "mark", "special"); }
  const el = document.createElement("span");
  el.className = "fx-scope fx-var--special";
  el.style.left = `${t.x}px`;
  el.style.top = `${t.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// 표식 추적 성공 hit: 스코프 위치에서 사방으로 터지는 강한 hit(일반 hit ring보다 큼·강함, item 8).
function spawnMarkBurst(targetInstanceId) {
  if (!targetInstanceId) return;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const t = unitPoint(targetInstanceId, { fx: 0.5, fy: 0.46 }, fieldRect);
  if (!t) return;
  const el = document.createElement("span");
  el.className = "fx-markburst";
  el.style.left = `${t.x}px`;
  el.style.top = `${t.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// Job Identity Tuning 02 — 성기사 자가 회복: 본인 머리 위 노란 성휘 뾰로롱 + 노란 회복 숫자(일반 민트 치유와 구분).
function spawnSelfHealFx(casterInstanceId, amount) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const p = unitPoint(casterInstanceId, { fx: 0.5, fy: 0.16 }, fieldRect);
  if (!p) return;
  const el = document.createElement("span");
  el.className = "fx-selfheal";
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
  if (amount > 0) {
    const tn = numberAnchor(casterInstanceId, fieldRect);
    if (tn) spawnNumber(layer, tn, casterInstanceId, true, amount, "selfheal");
  }
}

// Job Identity Tuning 02 — 결계장 결계 펼침(켜짐 1회): 청록 결계 파동이 결계장 중심에서 아군 전체로(성황 금빛과 구분).
function spawnWardAura(casterInstanceId, allyIds) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  const c = unitPoint(casterInstanceId, BODY_MID_FRAC, fieldRect);
  if (!c) return;
  const pts = (allyIds || []).map((id) => unitPoint(id, { fx: 0.5, fy: 0.5 }, fieldRect)).filter(Boolean);
  const maxR = pts.length ? Math.max(80, ...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) + 50 : 150;
  const el = document.createElement("span");
  el.className = "fx-wardwave";
  el.style.left = `${c.x}px`;
  el.style.top = `${c.y}px`;
  el.style.setProperty("--aoe-r", `${maxR}px`);
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// Job Identity Tuning 02 — 피해 분산: 결속 아군 각자에게 작은 청록 피해 튐(여럿이 나눠 받음이 보이게).
function spawnWardSplash(allyIds) {
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;
  const fieldRect = field.getBoundingClientRect();
  (allyIds || []).forEach((id) => {
    if (dyingUnits.has(id) || cleanedDead.has(id)) return;
    const p = unitPoint(id, { fx: 0.5, fy: 0.46 }, fieldRect);
    if (!p) return;
    const el = document.createElement("span");
    el.className = "fx-wardsplash";
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.addEventListener("animationend", () => el.remove());
    layer.appendChild(el);
  });
}

// Actor FX 디스패처 — battle.js trait가 역할별로 호출. opts: { wardId, targetId, allyIds, sourceId, enemyIds, amount }.
export function playActorFx(kind, casterId, opts = {}) {
  if (fxSuppressed) return; // Dev Balance Lab 01 — 헤드리스 sim 중 표시 생략
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
    // Combat Visibility Job Grammar 01 — 마도/현자 집중 전조 / 광역 확산 / 추적자·천궁 표식 / 표식 추적 강한 hit.
    case "chargeGather": spawnChargeGather(casterId, opts.enemyIds || []); break;
    case "aoeSpread":    spawnAoeSpread(casterId, opts.enemyIds || []); break;
    case "sanctuarySpread": spawnSanctuarySpread(casterId, opts.allyIds || []); break;
    case "aura":         spawnAura(casterId, opts.allyIds || []); break;
    case "finale":       spawnFinaleFx(casterId, opts.allyIds || []); break;
    case "selfHeal":     spawnSelfHealFx(casterId, opts.amount || 0); break;
    case "wardAura":     spawnWardAura(casterId, opts.allyIds || []); break;
    case "wardSplash":   spawnWardSplash(opts.allyIds || []); break;
    case "mark":         spawnMarkFx(casterId, opts.targetId); break;
    case "markBurst":    spawnMarkBurst(opts.targetId); break;
  }
}

// Monster Identity 02 — 새 전투 시작 시 FX 레이어 정리. 화면 전환(전투→보상/타이틀) 도중 애니메이션이
//   끝나지 않은 FX 요소가 hidden 레이어에 남는 기존 동작이 있어, 새 전투 시작에서 한 번 비워 누적을 막는다.
export function clearFxLayer() {
  const layer = document.getElementById("fx-layer");
  if (layer) layer.innerHTML = "";
  // Combat Visibility — 결속 지속선도 새 전투 시작 시 정리(이전 런의 잔여 사슬 방지).
  const bond = document.getElementById("bond-layer");
  if (bond) bond.innerHTML = "";
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
  // Combat Visibility Polish 01 — 일반 공격 = 흰색 단일 선(ghost 2라인 제거). 단순·명확.
  attack:   { bowF: 0.28, bowMin: 18, bowMax: 64, flip: 1,  head: "x",      draw: true, ghost: false },
  // Combat Visibility Polish 01 — 원거리 = 2라인(본선 + 뒤따르는 잔상선) + 과녁. "쏘아진 두 줄" 느낌(일반공격에서 이동).
  ranged:   { bowF: 0.74, bowMin: 52, bowMax: 150, flip: 1, head: "target", draw: true, ghost: true },
  // Combat Breath Hotfix 01: 치유선 곡률↑(아군 간격 좁아도 아바타 사이에 안 묻히게 위로 크게 호).
  heal:     { bowF: 0.50, bowMin: 34, bowMax: 92, flip: -1, head: "cross",  draw: false },
  // Combat Visibility Polish 01 — 서포터/버프 행동선(지원 대상 연결). 얇은 점선 + 작은 표식(공격/회복선과 구분).
  support:  { bowF: 0.34, bowMin: 20, bowMax: 70, flip: -1, head: "spark",  draw: false },
  // Combat Visibility Job Grammar 01 — 용창 관통(붉은/주황 공격 스킬선, 단일·체인) / 추적자·천궁 표식(점선 조준선).
  pierce:   { bowF: 0.30, bowMin: 18, bowMax: 70, flip: 1,  head: "x",     draw: true, ghost: false },
  // Combat Grammar Follow-up 01 — 특수 공격선 family 후속 확장 준비(주황/붉은 강조 — actionLineVariant가 pierce 색으로 묶음).
  //   분쇄(crush)=묵직한 베기 / 처형(execute)=날카로운 일격. skill에서 lineType만 지정하면 바로 사용 가능(모양만 여기서 분기).
  crush:    { bowF: 0.34, bowMin: 20, bowMax: 78, flip: 1,  head: "slash", draw: true, ghost: true },
  execute:  { bowF: 0.26, bowMin: 16, bowMax: 64, flip: 1,  head: "x",     draw: true, ghost: false },
  mark:     { bowF: 0.18, bowMin: 12, bowMax: 40, flip: 1,  head: "spark", draw: false },
  // Combat Target-Link Polish 01 — 추적 사격(추적자 추격/천궁 사격): 직선 저격선(녹색 유지). 시작 굵고 끝 얇은 테이퍼 + 화살촉("꿰뚫는다").
  snipe:    { bowF: 0.03, bowMin: 1,  bowMax: 6,  flip: 1,  head: "arrow", draw: false, taper: true, taperStart: 3.4, taperEnd: 0.5 },
  // Hero Skill 01: 교란 — 보라/분홍 거친 왜곡선(짧게 흔들림). 작은 혼란 표식(spark).
  disrupt:  { bowF: 0.22, bowMin: 14, bowMax: 44, flip: 1,  head: "spark",  draw: false, rough: true },
  // Combat Grammar Foundation 01: 도발 — 노랑 점선(공격선/회복선과 구분). 화려하지 않게.
  taunt:    { bowF: 0.20, bowMin: 14, bowMax: 44, flip: 1,  head: "spark",  draw: false },
  // legacy(미사용)
  straight: { bowF: 0.05, bowMin: 3,  bowMax: 8,  flip: 1,  head: "arrow", draw: true },
  slash:    { bowF: 0.36, bowMin: 26, bowMax: 82, flip: 1,  head: "slash", draw: true, ghost: true },
  enemy:    { bowF: 0.16, bowMin: 8,  bowMax: 22, flip: 1,  head: "claw",  draw: false, rough: true },
};

// Combat Grammar Follow-up 01 — 특수 공격선 family(흰 일반공격과 구분되는 주황/붉은 강조). 후속 분쇄/처형 등은 여기에 lineType만
//   추가하고 LINE_STYLE에 모양을 정의하면 자동으로 강조 색(actionLineVariant→"pierce" 색)을 받는다. 확장 단일 출처.
const SPECIAL_ATTACK_LINETYPES = new Set(["pierce", "crush", "execute"]);

// Action Line Visibility 01 — 공통 행동선 variant(색 언어). lineType(선 모양/장식)와 분리:
//   variant = 행동 "성격" 색. 영웅/몬스터 공통(같은 lineType/kind 경로를 쓰므로 자동 적용).
//   현재 battle/render에서 알 수 있는 lineType/kind로 가능한 만큼만 매핑하고, 애매하면 normal fallback.
//   30종 개별 전용 문법표는 후속(Combat Visibility Grammar 01).
function actionLineVariant(lineType, kind) {
  // lineType이 행동 성격을 이미 잘 인코딩한다(heal/ranged/taunt/disrupt). attack은 항상 "피해 기본공격"이므로
  //   유닛 문법(kind=heal/protect 등)으로 색을 바꾸면 오해(피해선이 회복색)가 생긴다 → strike만 따뜻한 melee로.
  if (lineType === "heal") return "heal";
  if (lineType === "ranged" || lineType === "snipe") return "ranged"; // Combat Target-Link Polish 01 — 저격선도 녹색 유지
  if (lineType === "taunt") return "guard";
  if (lineType === "disrupt") return "debuff";
  if (lineType === "support") return "support";
  // Combat Grammar Follow-up 01 — 특수 공격선 계열: 흰 일반공격선과 구분되는 주황/붉은 강조(pierce 호평 → 후속 확장 family).
  //   후속 분쇄(crush)/처형(execute) 등도 lineType만 추가하면 같은 강조 색(fx-var--pierce)을 받는다. 모양은 LINE_STYLE에서 분기.
  if (SPECIAL_ATTACK_LINETYPES.has(lineType)) return "pierce";
  if (lineType === "mark") return "special";     // Combat Visibility Job Grammar 01 — 추적자/천궁 표식 = 보라빛 조준선
  if (lineType === "attack") {
    // 영웅 근접(strike) = 따뜻한 melee. 그 외(몬스터 기본공격 kind="attack" / 비근접 문법의 기본공격) = 중립 normal.
    return kind === "strike" ? "melee" : "normal";
  }
  return "normal"; // 미지의 lineType → 중립 fallback
}

// Action Line Visibility 01 — 행동선 시작점을 actor 몸통 중앙 쪽으로 끌어오는 비율(0=무기끝 유지 … 1=완전 몸통중앙).
//   전열/후열 겹침에서 "이 칸/이 캐릭터의 몸에서 선이 출발"이 읽히도록. 약간의 무기 방향성은 남긴다.
const START_BODY_BIAS = 0.6;
const BODY_MID_FRAC = { fx: 0.5, fy: 0.52 };

// FX Density Guard 01: 동시에 떠 있는 행동선/숫자 상한 — 다수전·MAX 누적 방지.
const MAX_FX_LINES = 7;
const MAX_FX_NUMBERS = 8;

// Action Line Visibility 01 — 행동선 시작점 ring(actor 출발점 신호). variant 색 공통(currentColor).
//   작게(16px)·짧게(0.42s) — 숫자/HP바/피격 FX를 가리지 않고, MAX에서도 라인과 함께 떠 시작점이 흐려지지 않게.
function spawnStartPulse(layer, s, variant) {
  if (!s) return;
  const el = document.createElement("span");
  el.className = `fx-startpulse fx-var--${variant || "normal"}`;
  el.style.left = `${s.x}px`;
  el.style.top = `${s.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

function spawnLine(layer, s, t, lineType, kind, variant) {
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
  // Action Line Visibility 01 — 모양은 lineType(fx-svg--), 색은 variant(fx-var--)로 분리(영웅/몬스터 공통).
  const v = variant || actionLineVariant(lineType, kind);
  svg.setAttribute("class", `fx-svg fx-svg--${lineType} fx-var--${v}`);
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
  // Action Line Visibility 01 — 시작부 alpha 상향(0→0.22)으로 "이 actor에게서 시작"이 읽히게. 끝점은 여전히 선명.
  //   Combat Target-Link Polish 01 — 저격선(taper)은 시작(굵은 쪽)이 또렷하게 — 시작부터 진하게.
  grad.innerHTML = cfg.taper
    ? '<stop offset="0%" stop-color="currentColor" stop-opacity="0.9"></stop>' +
      '<stop offset="100%" stop-color="currentColor" stop-opacity="0.95"></stop>'
    : '<stop offset="0%" stop-color="currentColor" stop-opacity="0.22"></stop>' +
      '<stop offset="50%" stop-color="currentColor" stop-opacity="0.5"></stop>' +
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

  if (cfg.taper) {
    // Combat Target-Link Polish 01 — 저격선: 스트로크가 아니라 "시작 굵고 끝 얇은" 필드 폴리곤(s쪽 넓고 t쪽 한 점).
    //   직선 + 테이퍼 + 화살촉으로 "팟! 꿰뚫는다"가 일반 곡선 원거리와 구분된다.
    const sH = cfg.taperStart ?? 3.2, eH = cfg.taperEnd ?? 0.6;
    const poly = document.createElementNS(SVG_NS, "path");
    poly.setAttribute("class", "fx-taper"); // fx-path(fill:none) 제외 — 인라인 그라데이션 fill 유지
    poly.setAttribute("d",
      `M ${s.x + px * sH} ${s.y + py * sH}` +
      ` L ${t.x + px * eH} ${t.y + py * eH}` +
      ` L ${t.x - px * eH} ${t.y - py * eH}` +
      ` L ${s.x - px * sH} ${s.y - py * sH} Z`);
    poly.setAttribute("fill", `url(#${gid})`);
    svg.appendChild(poly);
  } else {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", "fx-path");
    path.setAttribute("d", `M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`);
    path.setAttribute("stroke", `url(#${gid})`);
    // dash draw-in 타입만 pathLength 정규화로 "그려짐"(꽂힘).
    //   점선 타입(heal/enemy)은 실제 dash 패턴이라 정규화하지 않는다.
    if (cfg.draw) path.setAttribute("pathLength", "1");
    svg.appendChild(path);
  }

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

// Combat Visibility Polish 01 — 보호(방패) end 펄스: 금빛 링(능력 상승과 결 구분).
function spawnGuardEndPulse(layer, p) {
  const el = document.createElement("span");
  el.className = "fx-pulse fx-pulse--guard";
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// Combat Visibility Polish 01 — 버프/지원 end 펄스: 하늘빛 "능력치 상승"(위로 솟음 — 회복/방패와 다른 결).
function spawnBuffPulse(layer, p) {
  const el = document.createElement("span");
  el.className = "fx-pulse fx-pulse--buff";
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.addEventListener("animationend", () => el.remove());
  layer.appendChild(el);
}

// Run Structure 01C — 피해 숫자 규격: 의미별로만 색을 둔다(임의 색 줄이기). 영웅/몬스터 동일 규칙.
//   기본=빨강(dmg) / 치명=주황(crit, 굵게·크게·폭발 후 축소) / 중독=보라(poison) / 회복=청록(heal).
//   알 수 없는 변주(roar/hit 등)는 기본 빨강으로 흡수 → "알록달록" 방지.
//   tag(향후 관통/분쇄/처형): 빨강 숫자 앞에 짧은 텍스트 태그. 구조만 준비(현재 미사용).
function damageNumberClass(isHeal, variant) {
  if (isHeal && variant === "selfheal") return "fx-number--selfheal"; // Job Identity Tuning 02 — 성기사 자가회복(노랑, 민트 치유와 구분)
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
