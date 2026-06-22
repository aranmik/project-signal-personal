// Discovery Codex Foundation 01 — 플레이어 진행도(발견/처치/해금/클리어) 저장 레이어.
//   "유물 = 다음 테마를 공정하게 만드는 준비 / 레시피·지도·히든 = 반복 클리어를 유도하는 발견 목표."
//   ★이 파일은 진행도 데이터만 다룬다 — 실제 전투 효과/레시피 잠금/지도 드랍/히든 출현은 적용하지 않는다.
//   localStorage 단일 키(versioned). 발자취(signal_personal_footprints_v1)와 별개 키라 충돌하지 않는다.
//   저장 실패/깨진 데이터는 조용히 기본값으로 복구한다(플레이 방해 X).

export const PROGRESS_KEY = "signal_personal_progress_v1";
export const PROGRESS_VERSION = 1;

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
