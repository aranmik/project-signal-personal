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

// First Class Expansion 01 — 확장 16종 아바타 키를 도감 데이터에서 자동 보강.
//   key = 첫 sr 클래스에서 "sr-" 제거(예: "sr-warden sr-x" → "warden"). 이미 있으면 유지.
//   덕분에 units.js의 avatarKey(=직업 id)가 전투/카드에서 SR 아바타로 그대로 렌더된다.
//   (CODEX_ENTRIES는 아래에서 정의되므로 hoist된 const 참조 — 모듈 평가 시점엔 채워져 있다.)

// Job Codex Entry Foundation → First Class Trial 01 — 직업 도감(관람용). SR-01~24만.
//   status: "base"(기본 6종) / "fusion"(합체 가능 1차 15종) / "wip"(준비 중 2차 3종).
//   First Class Trial 01: 6기본 직업의 모든 2조합이 1차 15종으로 합체 가능 → 해당 13종을
//   "wip"→"fusion"으로 정렬(도감/스킬/합체 데이터 일치). 2차 3종(용창/현자/성황)은 데이터만
//   준비되고 Trial 01에선 비노출이므로 "wip" 유지. tier 라벨은 render에서 매핑(관람 전용).
//   Role Category Foundation 01 — job = 직업 id(전투 유닛/스킬/성향 매핑 공용 키).
//     도감 상세에서 jobs.js combatRoleLabelOf(job)로 "성향"을 조회한다(표시 전용).
//     sr 클래스에서 직접 키를 빼면 신관(sr-shrine→cleric)·성직자(sr-cleric→saint)가 어긋나므로
//     명시적 job 필드로 연결한다.
export const CODEX_ENTRIES = [
  { code: "SR-01", name: "전사",   job: "warrior",     sr: "sr-warrior",    status: "base",   parts: ["shadow", "feet", "shield", "body", "head", "sword"] },
  { code: "SR-02", name: "수호자", job: "guardian",    sr: "sr-guardian",   status: "base",   parts: ["shadow", "feet", "shield", "body", "head", "lance"] },
  { code: "SR-03", name: "사제",   job: "priest",      sr: "sr-priest",     status: "base",   parts: ["aura", "shadow", "staff", "orb", "feet", "body", "head"] },
  { code: "SR-04", name: "신관",   job: "cleric",      sr: "sr-shrine",     status: "base",   parts: ["aura", "shadow", "halo", "staff", "feet", "body", "head"] },
  { code: "SR-05", name: "궁수",   job: "archer",      sr: "sr-archer",     status: "base",   parts: ["shadow", "bow", "arrow", "feet", "body", "head"] },
  { code: "SR-06", name: "교란꾼", job: "trickster",   sr: "sr-disruptor",  status: "base",   parts: ["shadow", "ribbon", "spark", "feet", "body", "head", "mask"] },
  { code: "SR-07", name: "도적",   job: "rogue",       sr: "sr-thief",      status: "fusion", parts: ["long-shadow", "shadow", "mark", "reverse-dagger", "feet", "body", "head", "mask"] },
  { code: "SR-08", name: "워든",   job: "warden",      sr: "sr-warden",     status: "fusion", parts: ["shadow", "shield", "trident", "feet", "body", "head"] },
  { code: "SR-09", name: "파수궁", job: "watchbow",    sr: "sr-watchbow",   status: "fusion", parts: ["shadow", "cloak", "beacon", "bow", "arrow", "feet", "body", "head"] },
  { code: "SR-10", name: "덫꾼",   job: "trapper",     sr: "sr-trapper",    status: "fusion", parts: ["shadow", "trap", "vial", "bubble", "feet", "body", "head"] },
  { code: "SR-11", name: "성기사", job: "paladin",     sr: "sr-paladin",    status: "fusion", parts: ["aura", "shadow", "halo", "shield", "sword", "feet", "body", "head", "headband"] },
  { code: "SR-12", name: "선봉",   job: "vanguard",    sr: "sr-vanguard sr-sentinel", status: "fusion", parts: ["shadow", "banner", "lance", "feet", "body", "head"] },
  { code: "SR-13", name: "금제",   job: "forbidden",   sr: "sr-forbidden",  status: "fusion", parts: ["shadow", "seal", "chain left", "chain right", "feet", "body", "head", "mask"] },
  { code: "SR-14", name: "성벽",   job: "wall",        sr: "sr-wall",       status: "fusion", parts: ["shadow", "wall", "feet", "body", "head"] },
  { code: "SR-15", name: "치유궁", job: "healbow",     sr: "sr-healbow",    status: "fusion", parts: ["aura", "shadow", "heal-trail", "bow", "arrow", "orb", "feet", "body", "head"] },
  { code: "SR-16", name: "정화사", job: "purifier",    sr: "sr-purifier",   status: "fusion", parts: ["aura", "shadow", "staff", "flame", "feet", "body", "head"] },
  { code: "SR-17", name: "마도",   job: "mage",        sr: "sr-mage",       status: "fusion", parts: ["aura", "shadow", "orb", "cloak", "feet", "body", "head"] },
  { code: "SR-18", name: "바드",   job: "bard",        sr: "sr-bard",       status: "fusion", parts: ["shadow", "note", "lute", "feet", "body", "head"] },
  { code: "SR-19", name: "수문장", job: "gatekeeper",  sr: "sr-gatekeeper", status: "fusion", parts: ["shadow", "door", "key", "feet", "body", "head"] },
  { code: "SR-20", name: "성직자", job: "saint",       sr: "sr-cleric",     status: "fusion", parts: ["aura", "shadow", "halo", "book", "feet", "body", "head"] },
  { code: "SR-21", name: "추적자", job: "tracker",     sr: "sr-tracker",    status: "fusion", parts: ["shadow", "footprint", "mark", "cloak", "rifle", "feet", "body", "head"] },
  { code: "SR-22", name: "용창",   job: "dragonspear", sr: "sr-dragonspear", status: "wip",   parts: ["shadow", "wing", "tail", "horn left", "horn right", "lance", "feet", "body", "head"] },
  { code: "SR-23", name: "현자",   job: "sage",        sr: "sr-sage",       status: "wip",    parts: ["aura", "shadow", "orb", "scroll", "feet", "body", "head"] },
  { code: "SR-24", name: "성황",   job: "sunlord",     sr: "sr-sunlord",    status: "wip",    parts: ["sun", "shadow", "crown", "staff", "feet", "body", "head"] },
];

export const CODEX_STATUS_LABEL = { base: "기본 직업", fusion: "합체 직업", wip: "준비 중" };

// 아바타 figure 마크업(전투/카드/합체/도감 공통). sr/parts만 다르고 구조는 동일.
//   extraClass로 컨텍스트별 크기 조정 클래스를 덧붙인다(.av-fit이 scale 담당).
export function avatarFigureHTML(sr, parts, extraClass = "") {
  const spans = parts.map((p) => `<span class="part ${p}"></span>`).join("");
  return `<span class="av-fit ${extraClass}"><span class="sig-av sr ${sr}">${spans}</span></span>`;
}

// First Class Expansion 01 — 도감 24종으로 AVATAR_SPEC 미존재 키를 자동 보강(확장 직업 아바타).
for (const e of CODEX_ENTRIES) {
  const key = e.sr.split(" ")[0].replace("sr-", "");
  if (!AVATAR_SPEC[key]) AVATAR_SPEC[key] = { sr: e.sr, parts: e.parts };
}
