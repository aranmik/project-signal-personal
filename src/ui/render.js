export function renderGame(state) {
  const titleScreen = document.getElementById("title-screen");
  const growthPanel = document.getElementById("growth-panel");
  const battleView = document.getElementById("battle-view");

  titleScreen.hidden = true;
  growthPanel.hidden = true;
  battleView.hidden = true;

  if (state.screen === "title") {
    titleScreen.hidden = false;
    return;
  }

  if (state.screen === "growth") {
    growthPanel.hidden = false;
    renderGrowthPanel(state);
    return;
  }

  battleView.hidden = false;
  battleView.dataset.status = state.battle.status;
  renderHud(state);
  renderUnits(state);
  renderLogOverlay(state);
  renderResultOverlay(state);
}

function renderGrowthPanel(state) {
  document.getElementById("growth-stage-label").textContent =
    `Stage ${state.run.stage} 클리어!`;
  document.getElementById("growth-subtitle").textContent =
    "파티를 강화하세요.";
  document.getElementById("growth-log").textContent =
    state.logs[state.logs.length - 1] ?? "";
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
    if (result === "clear") {
      titleEl.textContent = "전체 클리어!";
      restartBtn.textContent = "처음부터";
    } else {
      titleEl.textContent = "전투 패배...";
      restartBtn.textContent = "다시 시작";
    }
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
  }
}

function renderHud(state) {
  document.getElementById("stage-label").textContent = `Stage ${state.run.stage}`;
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
  const { atk, maxHp } = bonuses;
  if (atk === 0 && maxHp === 0) {
    el.hidden = true;
    return;
  }
  const parts = [];
  if (atk > 0) parts.push(`공격 +${atk}`);
  if (maxHp > 0) parts.push(`최대 HP +${maxHp}`);
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
  //   정식 유닛은 기존 {id}-pos 그대로. 하드코딩 좌표는 모두 CSS(클래스)로만.
  const posClass =
    unit.team === "enemy" && unit.slot !== undefined
      ? `enemy-slot-${unit.slot}`
      : `${id}-pos`;
  const sizeClass = unit.sizeClass ? ` ${unit.sizeClass}` : "";

  const wrap = document.createElement("div");
  wrap.className = `unit ${unit.team} ${posClass}${sizeClass} ${facingClass}${deadClass}`;
  wrap.dataset.instanceId = unit.instanceId;

  const figClass = isParty ? "avatar" : "monster";
  const parts = (AVATAR_PARTS[id] || [])
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
  wrap.setAttribute("aria-label", unit.name);
  wrap.innerHTML = `
    <div class="fig-react">
      <div class="${figClass} ${id}">${parts}</div>
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
  wolf: { fx: 0.16, fy: 0.52 },    // snout (적은 좌측 대면)
  slime: { fx: 0.5, fy: 0.55 },    // body front
  goblin: { fx: 0.5, fy: 0.52 },
};
const TARGET_HIT = { fx: 0.5, fy: 0.5 };       // body / hit-point
const TARGET_HEAL = { fx: 0.5, fy: 0.32 };     // heal-point (상단)

// 같은 대상 숫자 중복 시 queue offset 판단용
const recentNumberAt = new Map();

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
  const { sourceInstanceId, sourceUnitId, targetInstanceId, lineType, isHeal, amount } = event;
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

  // 2) 짧은 선행 뒤 행동선 발사 + 대상 반응. 배속이면 리듬만 살게 더 짧게.
  const speed = Number(field.dataset.speed) || 1;
  const lead = speed === 2 ? 80 : 120;
  const fire = () => {
    spawnLine(layer, s, t, lineType);
    spawnPulse(layer, t, isHeal);
    spawnNumber(layer, t, targetInstanceId, isHeal, amount);
    reactUnit(targetInstanceId, isHeal);
  };
  setTimeout(fire, lead);
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

function spawnLine(layer, s, t, lineType) {
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

function spawnNumber(layer, t, targetInstanceId, isHeal, amount) {
  // FX Density Guard 01: 숫자 상한 초과 시 가장 오래된 것 제거(MAX/다수전 누적 방지)
  const nums = layer.querySelectorAll(".fx-number");
  if (nums.length >= MAX_FX_NUMBERS) nums[0].remove();

  const now = performance.now();
  const last = recentNumberAt.get(targetInstanceId) || 0;
  const overlap = now - last < 700; // 같은 대상에 거의 동시 → queue offset
  recentNumberAt.set(targetInstanceId, now);

  const n = document.createElement("span");
  n.className =
    `fx-number ${isHeal ? "fx-number--heal" : "fx-number--dmg"}` +
    (overlap ? " fx-number--queued" : "");
  n.textContent = `${isHeal ? "+" : "-"}${amount}`;
  n.style.left = `${t.x}px`;
  n.style.top = `${t.y}px`;
  n.addEventListener("animationend", () => n.remove());
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
