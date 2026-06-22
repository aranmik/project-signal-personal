// Discovery Codex Foundation 01 — 도감(발견/해금) 정적 데이터.
//   "발자취 = 내가 어떤 런을 했는가 / 도감 = 그 런들이 무엇을 열었는가."
//   이 파일은 표시용 정적 데이터만 — 실제 전투 효과/레시피 잠금/지도 드랍/히든 출현은 구현하지 않는다.
//   플레이어 진행도(발견/처치/해금 여부)는 src/core/progression.js가 별도로 보관한다(여기엔 상태 저장 없음).
//
//   영웅 도감은 기존 데이터를 재사용한다(avatars.js CODEX_ENTRIES + jobs.js 티어/역할/레시피) — 여기서 중복 정의하지 않는다.
//   여기서 새로 정의하는 것: 유물(relic) / 몬스터(monster) / 지도 조각(map fragment) 카탈로그 + 상태 라벨.

// 도감 항목 상태 — 미발견/발견/처치/잠김/해금/준비중/???. UI 클래스 hook 포함(미발견은 실루엣 처리).
export const CODEX_STATUS = {
  undiscovered: { id: "undiscovered", label: "미발견", cls: "cdx-st--undiscovered" },
  discovered:   { id: "discovered",   label: "발견",   cls: "cdx-st--discovered" },
  defeated:     { id: "defeated",     label: "처치",   cls: "cdx-st--defeated" },
  locked:       { id: "locked",       label: "잠김",   cls: "cdx-st--locked" },
  unlocked:     { id: "unlocked",     label: "해금",   cls: "cdx-st--unlocked" },
  wip:          { id: "wip",          label: "준비 중", cls: "cdx-st--wip" },
  unknown:      { id: "unknown",      label: "???",    cls: "cdx-st--unknown" },
};

// 테마 키 — 현재는 초보자 숲(beginner)만 플레이 가능. 중독 늪(venom_swamp)은 장기 목표(미구현).
export const CODEX_THEMES = {
  beginner: { id: "beginner", name: "새싹 숲", playable: true },
  venom_swamp: { id: "venom_swamp", name: "중독 늪", playable: false },
};

/* =========================================================
   몬스터 도감 — 초보자 숲 기존 몬스터(코드 명칭 기준) + 히든/변종 예시.
   id = units.js 적 템플릿 type(곰방패=bear …). 히든/변종은 이번에 실제 전투 출현을 구현하지 않는다(목표판 표시만).
   kind: small(소형) / elite(정예) / boss / hidden(히든·변종). themeId로 묶는다.
   ========================================================= */
export const MONSTER_CODEX = [
  // 소형(마주침 빈도 높음)
  { id: "bear",     name: "곰방패",        kind: "small", themeId: "beginner", role: "전열 방벽", note: "앞을 막아 후열을 가린다." },
  { id: "fox",      name: "잎여우",        kind: "small", themeId: "beginner", role: "근접 기습", note: "빈틈을 노려 빠르게 문다." },
  { id: "bird",     name: "깃새",          kind: "small", themeId: "beginner", role: "후열 견제", note: "전열 너머 후열을 노린다." },
  { id: "dewslime", name: "이슬말랑",      kind: "small", themeId: "beginner", role: "약화",      note: "아군의 힘을 깎아낸다." },
  { id: "lamb",     name: "풀양",          kind: "small", themeId: "beginner", role: "회복",      note: "동료를 치유해 전투를 끈다." },
  // 정예(보스 열쇠)
  { id: "owl",      name: "숲올빼미 현자", kind: "elite", themeId: "beginner", role: "지휘",      note: "정예 호위를 강화한다.", keyHint: "보스 열쇠 1" },
  { id: "deer",     name: "사슴수호자",    kind: "elite", themeId: "beginner", role: "결계",      note: "보호막으로 화력을 분산시킨다.", keyHint: "보스 열쇠 1" },
  // 보스
  { id: "lion",     name: "새싹숲 사자왕", kind: "boss",  themeId: "beginner", role: "최종 도전", note: "새싹 숲의 지배자. 위압과 분노를 두른다." },
  // 히든/변종(이번엔 전투 출현 미구현 — "아직 발견하지 못한 생물")
  { id: "golden_lamb",   name: "황금 풀양",     kind: "hidden", themeId: "beginner", variantOf: "lamb",     note: "소문 속의 빛나는 풀양." },
  { id: "blue_dewslime", name: "푸른 이슬말랑", kind: "hidden", themeId: "beginner", variantOf: "dewslime", note: "맑은 물가에서만 보인다는 변종." },
  { id: "night_owl",     name: "밤깃 올빼미",   kind: "hidden", themeId: "beginner", variantOf: "owl",      note: "밤에만 깨어난다는 정예 변종." },
  { id: "red_fox",       name: "붉은 잎여우",   kind: "hidden", themeId: "beginner", variantOf: "fox",      note: "단풍 무렵에만 나타난다는 잎여우." },
];

export const MONSTER_KIND_LABEL = { small: "소형", elite: "정예", boss: "보스", hidden: "히든" };

/* =========================================================
   유물 도감 — "다음 테마가 공정해지는 준비 도구"(강해져서 압살이 아님).
   초보자 숲에서 얻어 중독 늪(venom_swamp) 대응력을 주는 방향. effectDraft = 표시용 초안(실제 전투 미적용).
   이번 작업에선 전부 status 기본 "wip/미발견" — 실제 획득/효과 적용은 미구현.
   ========================================================= */
export const RELIC_CODEX = [
  { id: "dew_charm",    name: "맑은 이슬 부적", themeId: "beginner", counter: "venom_swamp",
    effectDraft: "첫 독 피해 1회 완화", note: "처음 받는 독을 가볍게 흘려보낸다." },
  { id: "leaf_brooch",  name: "푸른 잎 브로치", themeId: "beginner", counter: "venom_swamp",
    effectDraft: "독 상태 아군 회복량 +소폭", note: "중독된 동료를 조금 더 돌본다." },
  { id: "purify_bell",  name: "정화의 작은 종", themeId: "beginner", counter: "venom_swamp",
    effectDraft: "쉼터에서 디버프 정화", note: "이슬 쉼터의 종소리가 독을 씻어낸다." },
  { id: "squish_vial",  name: "말랑 이슬병",   themeId: "beginner", counter: "venom_swamp",
    effectDraft: "전투 시작 시 약한 보호막", note: "전투를 시작할 때 옅은 막이 감싼다." },
  { id: "poison_ward",  name: "독 가림막",     themeId: "beginner", counter: "venom_swamp",
    effectDraft: "독 피해 소폭 감소", note: "스며드는 독기를 한 겹 막아준다." },
  { id: "recovery_moss", name: "회복 이끼",    themeId: "beginner", counter: "venom_swamp",
    effectDraft: "중독 적 상대 회복 보정", note: "중독을 다루는 적 앞에서 회복이 살아난다." },
];

/* =========================================================
   지도 조각 도감 — 다음 테마 해금의 장기 목표. 실제 드랍/보존은 미구현(진행도 표시만).
   스키마는 "런 중 임시 발견(runFound)"과 "클리어 후 보존(kept)"을 분리할 수 있게 둔다(progression.js에서 사용).
   ========================================================= */
export const MAP_FRAGMENT_CODEX = [
  { id: "venom_swamp_map", themeId: "venom_swamp", name: "중독 늪 지도 조각", total: 4,
    note: "초보자 숲을 더 탐험해 중독 늪의 단서를 모아보세요." },
];

// 헬퍼: 테마별 필터.
export function monstersByTheme(themeId) { return MONSTER_CODEX.filter((m) => m.themeId === themeId); }
export function relicsByTheme(themeId) { return RELIC_CODEX.filter((r) => r.themeId === themeId); }
