// Avatar Import 01 — 시그널R&D SR-01~24 CSS 아바타 본게임 이식 데이터.
//   참고 소스: presentation-lab/avatar-museum-01.html (시그널R&D 전시실).
//   각 아바타 = `.sig-av .sr <srClass>` figure + part span 목록. CSS는 src/ui/avatars.css.
//   part 문자열은 그대로 span class로 출력된다("chain left" → <span class="part chain left">).
//
//   본게임 노출 범위(중요):
//     - 실제 플레이/선택 가능 직업은 기존 그대로(전사·수호자·궁수·사제·신관·교란꾼 + 합체 도적·성직자).
//     - SR-08~SR-19, SR-21~24는 "도감 관람용"일 뿐 — 선택/전투에 노출하지 않는다.
//     - SR-25~SR-30(신규 6종)은 본게임 미이식(박물관에만 존재).

// avatarKey → 아바타 스펙. units.js의 avatarKey가 이 표의 키와 일치한다.
//   (cleric=신관→sr-shrine / holy-cleric=성직자→sr-cleric: 박물관 코드와 동일 매핑)
export const AVATAR_SPEC = {
  warrior:      { sr: "sr-warrior",     parts: ["shadow", "feet", "shield", "body", "head", "sword"] },
  guardian:     { sr: "sr-guardian",    parts: ["shadow", "feet", "shield", "body", "head", "lance"] },
  priest:       { sr: "sr-priest",      parts: ["aura", "shadow", "staff", "orb", "feet", "body", "head"] },
  cleric:       { sr: "sr-shrine",      parts: ["aura", "shadow", "halo", "staff", "feet", "body", "head"] },
  archer:       { sr: "sr-archer",      parts: ["shadow", "bow", "arrow", "feet", "body", "head"] },
  trickster:    { sr: "sr-disruptor",   parts: ["shadow", "ribbon", "spark", "feet", "body", "head", "mask"] },
  rogue:        { sr: "sr-thief",       parts: ["long-shadow", "shadow", "mark", "reverse-dagger", "feet", "body", "head", "mask"] },
  "holy-cleric":{ sr: "sr-cleric",      parts: ["aura", "shadow", "halo", "book", "feet", "body", "head"] },
};

export function avatarSpec(avatarKey) {
  return AVATAR_SPEC[avatarKey] || AVATAR_SPEC.warrior;
}

// Job Codex Entry Foundation — 직업 도감(관람용). SR-01~24만.
//   status: "base"(기본 6종) / "fusion"(합체 2종) / "wip"(준비 중 16종).
//   tier 라벨은 render에서 매핑. 여기엔 발견/저장 시스템을 두지 않는다(관람 전용).
export const CODEX_ENTRIES = [
  { code: "SR-01", name: "전사",   sr: "sr-warrior",    status: "base",   parts: ["shadow", "feet", "shield", "body", "head", "sword"] },
  { code: "SR-02", name: "수호자", sr: "sr-guardian",   status: "base",   parts: ["shadow", "feet", "shield", "body", "head", "lance"] },
  { code: "SR-03", name: "사제",   sr: "sr-priest",     status: "base",   parts: ["aura", "shadow", "staff", "orb", "feet", "body", "head"] },
  { code: "SR-04", name: "신관",   sr: "sr-shrine",     status: "base",   parts: ["aura", "shadow", "halo", "staff", "feet", "body", "head"] },
  { code: "SR-05", name: "궁수",   sr: "sr-archer",     status: "base",   parts: ["shadow", "bow", "arrow", "feet", "body", "head"] },
  { code: "SR-06", name: "교란꾼", sr: "sr-disruptor",  status: "base",   parts: ["shadow", "ribbon", "spark", "feet", "body", "head", "mask"] },
  { code: "SR-07", name: "도적",   sr: "sr-thief",      status: "fusion", parts: ["long-shadow", "shadow", "mark", "reverse-dagger", "feet", "body", "head", "mask"] },
  { code: "SR-08", name: "워든",   sr: "sr-warden",     status: "wip",    parts: ["shadow", "shield", "trident", "feet", "body", "head"] },
  { code: "SR-09", name: "파수궁", sr: "sr-watchbow",   status: "wip",    parts: ["shadow", "cloak", "beacon", "bow", "arrow", "feet", "body", "head"] },
  { code: "SR-10", name: "덫꾼",   sr: "sr-trapper",    status: "wip",    parts: ["shadow", "trap", "vial", "bubble", "feet", "body", "head"] },
  { code: "SR-11", name: "성기사", sr: "sr-paladin",    status: "wip",    parts: ["aura", "shadow", "halo", "shield", "sword", "feet", "body", "head", "headband"] },
  { code: "SR-12", name: "선봉",   sr: "sr-vanguard sr-sentinel", status: "wip", parts: ["shadow", "banner", "lance", "feet", "body", "head"] },
  { code: "SR-13", name: "금제",   sr: "sr-forbidden",  status: "wip",    parts: ["shadow", "seal", "chain left", "chain right", "feet", "body", "head", "mask"] },
  { code: "SR-14", name: "성벽",   sr: "sr-wall",       status: "wip",    parts: ["shadow", "wall", "feet", "body", "head"] },
  { code: "SR-15", name: "치유궁", sr: "sr-healbow",    status: "wip",    parts: ["aura", "shadow", "heal-trail", "bow", "arrow", "orb", "feet", "body", "head"] },
  { code: "SR-16", name: "정화사", sr: "sr-purifier",   status: "wip",    parts: ["aura", "shadow", "staff", "flame", "feet", "body", "head"] },
  { code: "SR-17", name: "마도",   sr: "sr-mage",       status: "wip",    parts: ["aura", "shadow", "orb", "cloak", "feet", "body", "head"] },
  { code: "SR-18", name: "바드",   sr: "sr-bard",       status: "wip",    parts: ["shadow", "note", "lute", "feet", "body", "head"] },
  { code: "SR-19", name: "수문장", sr: "sr-gatekeeper", status: "wip",    parts: ["shadow", "door", "key", "feet", "body", "head"] },
  { code: "SR-20", name: "성직자", sr: "sr-cleric",     status: "fusion", parts: ["aura", "shadow", "halo", "book", "feet", "body", "head"] },
  { code: "SR-21", name: "추적자", sr: "sr-tracker",    status: "wip",    parts: ["shadow", "footprint", "mark", "cloak", "rifle", "feet", "body", "head"] },
  { code: "SR-22", name: "용창",   sr: "sr-dragonspear", status: "wip",   parts: ["shadow", "wing", "tail", "horn left", "horn right", "lance", "feet", "body", "head"] },
  { code: "SR-23", name: "현자",   sr: "sr-sage",       status: "wip",    parts: ["aura", "shadow", "orb", "scroll", "feet", "body", "head"] },
  { code: "SR-24", name: "성황",   sr: "sr-sunlord",    status: "wip",    parts: ["sun", "shadow", "crown", "staff", "feet", "body", "head"] },
];

export const CODEX_STATUS_LABEL = { base: "기본 직업", fusion: "합체 직업", wip: "준비 중" };

// 아바타 figure 마크업(전투/카드/합체/도감 공통). sr/parts만 다르고 구조는 동일.
//   extraClass로 컨텍스트별 크기 조정 클래스를 덧붙인다(.av-fit이 scale 담당).
export function avatarFigureHTML(sr, parts, extraClass = "") {
  const spans = parts.map((p) => `<span class="part ${p}"></span>`).join("");
  return `<span class="av-fit ${extraClass}"><span class="sig-av sr ${sr}">${spans}</span></span>`;
}
