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

  // Battle Speed 01: 배속 버튼 라벨/강조 + 전장 data-speed
  //   data-speed로 tempo fill transition 시간을 cadence에 맞춘다(CSS) → 2x에서도 끊김 없이.
  const speed = state.battle.speed ?? 1;
  const speedBtn = document.getElementById("speed-toggle");
  if (speedBtn) {
    speedBtn.textContent = `${speed}x`;
    speedBtn.classList.toggle("fast", speed === 2);
  }
  const field = document.getElementById("battle-field");
  if (field) field.dataset.speed = String(speed);
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
function renderUnits(state) {
  const layer = document.getElementById("unit-layer");
  if (!layer) return;

  const all = [...state.party, ...state.enemies];
  const seen = new Set();

  all.forEach((unit) => {
    seen.add(unit.instanceId);
    let el = layer.querySelector(
      `[data-instance-id="${unit.instanceId}"]`
    );
    if (!el) {
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
  el.classList.toggle("dead", !!unit.isDead);

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

  const wrap = document.createElement("div");
  wrap.className = `unit ${unit.team} ${id}-pos ${facingClass}${deadClass}`;
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

// battle.js에서 행동 발생 시 호출 (전투 계산과 분리된 FX 이벤트)
export function playActionFx(event) {
  const { sourceInstanceId, sourceUnitId, targetInstanceId, lineType, isHeal, amount } = event;
  const layer = document.getElementById("fx-layer");
  const field = document.getElementById("battle-field");
  if (!layer || !field) return;

  const fieldRect = field.getBoundingClientRect();
  const srcFrac = SOURCE_ANCHORS[sourceUnitId] || { fx: 0.5, fy: 0.45 };
  const tgtFrac = isHeal ? TARGET_HEAL : TARGET_HIT;

  const s = unitPoint(sourceInstanceId, srcFrac, fieldRect);
  const t = unitPoint(targetInstanceId, tgtFrac, fieldRect);
  if (!s || !t) return;

  spawnLine(layer, s, t, lineType);
  spawnPulse(layer, t, isHeal);
  spawnNumber(layer, t, targetInstanceId, isHeal, amount);
  reactUnit(targetInstanceId, isHeal);
}

// Hit Reaction 01: 맞은/회복받은 유닛 본체가 짧게 반응
//   unit-layer는 매 tick 재구성되므로, 이번 tick의 renderGame 이후(rAF)
//   새로 그려진 .fig-react 요소에 반응 클래스를 얹는다.
function reactUnit(targetInstanceId, isHeal) {
  requestAnimationFrame(() => {
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

// Combat Feel Polish 01: 행동선을 직선 span → SVG 곡선 path로.
//   source→target 문법/anchor 구조 유지(좌표는 동일하게 s,t에서 계산).
//   약한 bow(곡선) + 시작 투명→끝 선명 그라데이션 + 끝점 쐐기(화살촉)
//   + 빠른 draw-in 후 느린 fade("팟! 꽂혔다 → 스스슥 사라진다").
const SVG_NS = "http://www.w3.org/2000/svg";
let __fxLineSeq = 0;

function spawnLine(layer, s, t, lineType) {
  const w = layer.clientWidth || layer.offsetWidth;
  const h = layer.clientHeight || layer.offsetHeight;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;

  // 수직 단위벡터로 중간점을 살짝 밀어 약한 곡선(arc)을 만든다.
  //   길이에 비례하되 과하지 않게 clamp. heal은 반대로 휘어 공격선과 결을 구분.
  const px = -dy / len;
  const py = dx / len;
  const bow = Math.min(20, Math.max(6, len * 0.12)) * (lineType === "heal" ? -1 : 1);
  const mx = (s.x + t.x) / 2 + px * bow;
  const my = (s.y + t.y) / 2 + py * bow;

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

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", "fx-path");
  path.setAttribute("d", `M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`);
  path.setAttribute("stroke", `url(#${gid})`);
  path.setAttribute("pathLength", "1"); // dash draw-in 정규화
  svg.appendChild(path);

  // 끝점 쐐기 — 끝 접선 방향(t - control)으로 회전, "대상에 꽂혔다"
  const tanAng = (Math.atan2(t.y - my, t.x - mx) * 180) / Math.PI;
  const head = document.createElementNS(SVG_NS, "path");
  head.setAttribute("class", "fx-head");
  head.setAttribute("d", "M 0 0 L -9 -4.5 L -9 4.5 Z");
  head.setAttribute("transform", `translate(${t.x} ${t.y}) rotate(${tanAng})`);
  svg.appendChild(head);

  // 제거는 svg 자체의 수명 애니메이션 종료에서만(자식 animationend 버블 제외)
  svg.addEventListener("animationend", (e) => {
    if (e.target === svg) svg.remove();
  });
  layer.appendChild(svg);
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
