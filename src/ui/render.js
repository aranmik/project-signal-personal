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
  slime: ["shadow", "slime-body", "shine", "eye left", "eye right"],
  goblin: ["shadow", "ear left", "ear right", "goblin-body", "goblin-head", "eye left", "eye right", "mouth"],
  wolf: ["shadow", "tail", "wolf-body", "leg one", "leg two", "wolf-head", "ear left", "ear right", "snout", "eye"],
};

function renderUnits(state) {
  const layer = document.getElementById("unit-layer");
  if (!layer) return;
  layer.innerHTML = "";

  state.party.forEach((unit) => layer.appendChild(createFieldUnit(unit)));
  state.enemies.forEach((unit) => layer.appendChild(createFieldUnit(unit)));
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

function spawnLine(layer, s, t, lineType) {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;

  const line = document.createElement("span");
  line.className = `fx-line fx-line--${lineType}`;
  line.style.left = `${s.x}px`;
  line.style.top = `${s.y}px`;
  line.style.width = `${len}px`;
  line.style.transform = `rotate(${ang}deg)`;
  line.addEventListener("animationend", () => line.remove());
  layer.appendChild(line);
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
