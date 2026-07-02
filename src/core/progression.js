// Discovery Codex Foundation 01 — 플레이어 진행도(발견/처치/해금/클리어) 저장 레이어.
//   "유물 = 다음 테마를 공정하게 만드는 준비 / 레시피·지도·히든 = 반복 클리어를 유도하는 발견 목표."
//   ★이 파일은 진행도 데이터만 다룬다 — 실제 전투 효과/레시피 잠금/지도 드랍/히든 출현은 적용하지 않는다.
//   localStorage 단일 키(versioned). 발자취(signal_personal_footprints_v1)와 별개 키라 충돌하지 않는다.
//   저장 실패/깨진 데이터는 조용히 기본값으로 복구한다(플레이 방해 X).

export const PROGRESS_KEY = "signal_personal_progress_v1";
export const PROGRESS_VERSION = 1;

// Return Deck Foundation 01 — "들고 돌아온 전리품이 다음 토벌 준비가 된다."
//   귀환/클리어 결과를 progress 안의 작은 하위 필드(returnDeck)로 누적한다. ★영구 전투 버프/재화/상점 아님 —
//   "다음 토벌 준비도(huntPrep) + 최근 귀환 기록"만 쌓는 감정/표시 레이어. 기존 세이브엔 없어도 안전 기본값(migrate).
export const RETURN_DECK_RECENT_CAP = 3; // 최근 귀환 기록 보존 수(작게)
export function defaultReturnDeck() {
  return {
    huntPrep: 0,     // 누적 토벌 준비도(귀환/클리어로 쌓임)
    returns: 0,      // 귀환/클리어 누적 횟수
    lootSecured: 0,  // 누적 확보 전리품 수
    bestDepth: 0,    // 귀환 덱 기준 최고 도달 심도
    recent: [],      // 최근 귀환 기록(최신 우선, 최대 RETURN_DECK_RECENT_CAP)
  };
}

// 기본 진행도(빈 상태). 배열/객체는 매 호출 새로 생성(공유 참조 방지).
export function defaultProgress() {
  return {
    version: PROGRESS_VERSION,
    discoveredHeroes: [],   // jobId[]
    unlockedRecipes: [],    // resultJobId[] (실제 잠금은 미적용 — 표시용)
    discoveredRelics: [],   // relicId[]
    discoveredMonsters: [], // monsterId[]
    defeatedMonsters: [],   // monsterId[]
    mapFragments: {},       // { fragmentId: { runFound: 0, kept: 0 } } — 런중 임시 vs 클리어 후 보존 분리
    themeClears: {},        // { themeId: count }
    bestDepthByTheme: {},   // { themeId: depth }
    kingClears: 0,          // 사자왕 클리어 누적(초보자 테마 보스)
    returnDeck: defaultReturnDeck(), // Return Deck Foundation 01 — 다음 토벌 준비 누적
  };
}

// 깨진/구버전 데이터 → 기본값 위에 안전하게 병합(migration). 알 수 없는 형태는 기본값으로.
function migrate(raw) {
  const base = defaultProgress();
  if (!raw || typeof raw !== "object") return base;
  const out = { ...base };
  // 단순 필드: 타입이 맞을 때만 채택.
  for (const k of ["discoveredHeroes", "unlockedRecipes", "discoveredRelics", "discoveredMonsters", "defeatedMonsters"]) {
    if (Array.isArray(raw[k])) out[k] = raw[k].filter((x) => typeof x === "string");
  }
  if (raw.mapFragments && typeof raw.mapFragments === "object") out.mapFragments = { ...raw.mapFragments };
  if (raw.themeClears && typeof raw.themeClears === "object") out.themeClears = { ...raw.themeClears };
  if (raw.bestDepthByTheme && typeof raw.bestDepthByTheme === "object") out.bestDepthByTheme = { ...raw.bestDepthByTheme };
  if (Number.isFinite(raw.kingClears)) out.kingClears = raw.kingClears;
  // Return Deck Foundation 01 — 구세이브(필드 없음)/깨진 값은 기본값 유지. 숫자/배열 타입이 맞을 때만 채택(안전 병합).
  if (raw.returnDeck && typeof raw.returnDeck === "object") {
    const rd = out.returnDeck; const src = raw.returnDeck;
    for (const k of ["huntPrep", "returns", "lootSecured", "bestDepth"]) {
      if (Number.isFinite(src[k]) && src[k] >= 0) rd[k] = src[k];
    }
    if (Array.isArray(src.recent)) rd.recent = src.recent.filter((r) => r && typeof r === "object").slice(0, RETURN_DECK_RECENT_CAP);
  }
  out.version = PROGRESS_VERSION; // 항상 현재 버전으로 정규화
  return out;
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return defaultProgress();
    return migrate(JSON.parse(raw));
  } catch (e) {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    return true;
  } catch (e) {
    return false;
  }
}

// dev/디버그 전용 — 진행도 초기화. 일반 플레이 동선에서는 호출하지 않는다.
export function resetProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch (e) { /* noop */ }
  return defaultProgress();
}

// 내부: 배열에 중복 없이 추가 후 저장. 모든 record* 함수는 절대 throw하지 않는다(전투 흐름 보호).
function addUnique(arr, id) {
  if (!arr.includes(id)) arr.push(id);
}

/* =========================================================
   기록 훅 — 안전한 스캐폴딩. 호출부(battle.js)는 headless 주회 중엔 호출하지 않는다(오염 차단).
   각 함수는 load→수정→save로 자기 완결(상태 공유 없음), 실패는 조용히 무시.
   ========================================================= */

// 런 종료 1건 반영: 클리어면 테마 클리어/사자왕 +1, 항상 최고 심도 갱신.
export function recordRunResult({ result, depth = 0, themeId = "beginner" } = {}) {
  try {
    const p = loadProgress();
    if (result === "clear") {
      p.themeClears[themeId] = (p.themeClears[themeId] || 0) + 1;
      if (themeId === "beginner") p.kingClears = (p.kingClears || 0) + 1;
    }
    const best = p.bestDepthByTheme[themeId] || 0;
    if (depth > best) p.bestDepthByTheme[themeId] = depth;
    saveProgress(p);
  } catch (e) { /* noop */ }
}

/* =========================================================
   Return Deck Foundation 01 — "들고 돌아온 전리품이 다음 토벌 준비가 된다."
   귀환(return)/클리어(clear) 1건을 returnDeck에 접어 넣는다. defeat/abort는 호출부에서 제외(귀환 덱 오염 방지).
   ★준비도(huntPrep)는 표시/감정용 누적 점수 — 전투 수치/입장권/소모 시스템이 아니다(밸런스 영향 0).
   ========================================================= */

// 이번 귀환 1건의 준비도 기여(순수 계산·저장 안 함). 아주 단순한 공식(대개편 금지):
//   전리품 tier 가중(흔함1/드묾2/귀함3) + 심도 ⌊depth/5⌋ + 보스키 ×2 + 클리어 보너스 3.
const LOOT_PREP_WEIGHT = { common: 1, uncommon: 2, rare: 3 };
export function computeReturnPrep({ result = "return", depth = 0, bossKeys = 0, securedLoot = [] } = {}) {
  const lootPrep = (Array.isArray(securedLoot) ? securedLoot : [])
    .reduce((s, l) => s + (LOOT_PREP_WEIGHT[l && l.tier] || 1), 0);
  const depthPrep = Math.floor(Math.max(0, depth) / 5);
  const keyPrep = Math.max(0, bossKeys) * 2;
  const clearBonus = result === "clear" ? 3 : 0;
  return { prep: lootPrep + depthPrep + keyPrep + clearBonus, lootPrep, depthPrep, keyPrep, clearBonus };
}

// 귀환/클리어 1건을 returnDeck에 누적(비throw·자기 완결 load→수정→save). 반환값 = 이번 기여(prep 등·UI 표시용).
export function recordReturnDeck({ result = "return", depth = 0, alertness = 0, bossKeys = 0, securedLoot = [] } = {}) {
  try {
    const contrib = computeReturnPrep({ result, depth, bossKeys, securedLoot });
    const p = loadProgress();
    const rd = p.returnDeck || (p.returnDeck = defaultReturnDeck());
    rd.huntPrep = (rd.huntPrep || 0) + contrib.prep;
    rd.returns = (rd.returns || 0) + 1;
    rd.lootSecured = (rd.lootSecured || 0) + (Array.isArray(securedLoot) ? securedLoot.length : 0);
    if (depth > (rd.bestDepth || 0)) rd.bestDepth = depth;
    rd.recent.unshift({
      result, depth, alertness: alertness || 0, bossKeys: bossKeys || 0,
      loot: (Array.isArray(securedLoot) ? securedLoot : []).map((l) => l && l.id).filter(Boolean), // id만(저장 최소)
      prep: contrib.prep, ts: Date.now(),
    });
    rd.recent = rd.recent.slice(0, RETURN_DECK_RECENT_CAP);
    saveProgress(p);
    return contrib;
  } catch (e) { return null; }
}

// ── Boss Hunt future contract (dormant) ─────────────────────────────────────
//   Boss Challenge / Hunt Contract 01이 이 단계 문구/threshold를 이어받는다 — 이번 단계에선 "표시만"(게이트/소모/입장 없음).
//   단계는 사자왕 톤: 준비도 0=아직 흔적 없음 → 낮음 → 모임 → 충분(토벌의 단서가 손에 잡힌다).
export const HUNT_PREP_STAGES = [
  { min: 0,  label: "아직 흔적이 없다" },
  { min: 1,  label: "흔적이 조금 모였다" },
  { min: 8,  label: "토벌의 단서가 모이고 있다" },
  { min: 20, label: "사자왕 토벌 준비가 무르익었다" },
];
export function bossHuntReadiness(huntPrep = 0) {
  let stage = HUNT_PREP_STAGES[0], idx = 0;
  HUNT_PREP_STAGES.forEach((s, i) => { if (huntPrep >= s.min) { stage = s; idx = i; } });
  return { huntPrep, stageIndex: idx, stageCount: HUNT_PREP_STAGES.length, label: stage.label };
}

// 귀환 덱 요약(읽기 전용 파생값 — dev/콘솔/표시 공용). 표시는 render가 담당.
export function returnDeckSummary(p = loadProgress()) {
  const rd = (p && p.returnDeck) || defaultReturnDeck();
  return { ...rd, readiness: bossHuntReadiness(rd.huntPrep || 0) };
}

// 몬스터 마주침/처치 1건 반영(처치는 발견을 함의). ids = monsterId[] 또는 단일.
export function recordMonstersDefeated(ids) {
  try {
    const list = Array.isArray(ids) ? ids : [ids];
    const clean = list.filter((x) => typeof x === "string" && x);
    if (!clean.length) return;
    const p = loadProgress();
    clean.forEach((id) => { addUnique(p.discoveredMonsters, id); addUnique(p.defeatedMonsters, id); });
    saveProgress(p);
  } catch (e) { /* noop */ }
}

export function recordMonstersDiscovered(ids) {
  try {
    const list = Array.isArray(ids) ? ids : [ids];
    const clean = list.filter((x) => typeof x === "string" && x);
    if (!clean.length) return;
    const p = loadProgress();
    clean.forEach((id) => addUnique(p.discoveredMonsters, id));
    saveProgress(p);
  } catch (e) { /* noop */ }
}

// 향후 배치용(이번엔 호출부 미연결): 영웅/유물/레시피 발견. 실제 잠금/효과는 적용하지 않는다.
export function recordHeroDiscovered(jobId) {
  try { const p = loadProgress(); addUnique(p.discoveredHeroes, jobId); saveProgress(p); } catch (e) { /* noop */ }
}
export function recordRelicDiscovered(relicId) {
  try { const p = loadProgress(); addUnique(p.discoveredRelics, relicId); saveProgress(p); } catch (e) { /* noop */ }
}
export function recordRecipeUnlocked(resultJobId) {
  try { const p = loadProgress(); addUnique(p.unlockedRecipes, resultJobId); saveProgress(p); } catch (e) { /* noop */ }
}

// 발견 현황 탭용 요약(읽기 전용 파생값). 표시는 render가 담당.
export function progressSummary(p = loadProgress()) {
  return {
    kingClears: p.kingClears || 0,
    bestDepthBeginner: p.bestDepthByTheme.beginner || 0,
    discoveredMonsters: (p.discoveredMonsters || []).length,
    defeatedMonsters: (p.defeatedMonsters || []).length,
    unlockedRecipes: (p.unlockedRecipes || []).length,
    discoveredRelics: (p.discoveredRelics || []).length,
  };
}
