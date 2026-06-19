// Fusion Flow Foundation 01 / Combat Readability Polish 02:
//   grammar   = 직업 행동 문법(strike/protect/snipe/heal/harass) — battle.js가 이 필드로 분기.
//   visual    = 아바타 비주얼 donor(전용 실루엣 전까지 기존 파츠 + CSS 틴트 재사용).
//   avatarKey = 아바타 자산 키. render는 .avatar-{avatarKey} 클래스로 출력 →
//               추후 "루다 CSS 아바타 → 본게임 이식 → 직업카드/전투유닛/도감" 공통 hook.
//               (이번엔 틀만 — 실제 30종 아바타 이식/디자인 확정은 하지 않는다.)
//   role은 기본값일 뿐 — 실제 전열/후열은 배치(formation slot)가 덮어쓴다.
export const UNIT_TEMPLATES = {
  party: {
    warrior: {
      id: "warrior",
      name: "전사",
      team: "party",
      job: "warrior",
      role: "front",
      grammar: "strike",
      avatarKey: "warrior",
      maxHp: 120,
      atk: 14,
      speed: 8,
    },

    priest: {
      id: "priest",
      name: "사제",
      team: "party",
      job: "priest",
      role: "back",
      grammar: "heal",
      avatarKey: "priest",
      maxHp: 80,
      atk: 8,
      speed: 7,
    },

    archer: {
      id: "archer",
      name: "궁수",
      team: "party",
      job: "archer",
      role: "back",
      grammar: "snipe",
      avatarKey: "archer",
      maxHp: 75,
      atk: 16,
      speed: 9,
    },

    // Party Join 01: 4번째 동료(수호자). 직업 확장 아님 — 기본 공격형.
    //   2x2 후열 back-right 자리를 채워 4인 파티 전투를 확인하는 용도.
    //   speed 6(가장 느림)·maxHp 105(묵직)로 기존 3인과 박자/체감 구분.
    guardian: {
      id: "guardian",
      name: "수호자",
      team: "party",
      job: "guardian",
      role: "back",
      grammar: "protect",
      avatarKey: "guardian",
      maxHp: 105,
      atk: 11,
      speed: 6,
    },

    // Fusion Flow Foundation 01 — 기본 직업 6종 확보(신관/교란꾼).
    //   수치/문법은 임시 최소 구현 — 최종 개성 문법은 추후 작업.
    cleric: {
      id: "cleric",
      name: "신관",
      team: "party",
      job: "cleric",
      role: "back",
      grammar: "heal", // 임시: 사제와 같은 회복 문법(수치만 약하게)
      visual: "priest",
      avatarKey: "cleric",
      maxHp: 82,
      atk: 7,
      speed: 7,
    },

    trickster: {
      id: "trickster",
      name: "교란꾼",
      team: "party",
      job: "trickster",
      role: "back",
      grammar: "harass", // 임시: 일반 공격(방해 효과는 추후 — mark/debuff 미연결)
      visual: "archer",
      avatarKey: "trickster",
      maxHp: 72,
      atk: 13,
      speed: 9,
    },

    // 1차 직업 (합체 결과 전용 — 수치 임시)
    rogue: {
      id: "rogue",
      name: "도적",
      team: "party",
      job: "rogue",
      role: "front",
      grammar: "snipe", // 전사+궁수 — 빠르고 약점을 노리는 마무리
      visual: "warrior",
      avatarKey: "rogue",
      maxHp: 110,
      atk: 19,
      speed: 9,
    },

    saint: {
      id: "saint",
      name: "성직자",
      team: "party",
      job: "saint",
      role: "back",
      grammar: "heal", // 사제+신관 — 더 단단한 회복 담당
      visual: "priest",
      avatarKey: "holy-cleric",
      maxHp: 100,
      atk: 11,
      speed: 7,
    },

    // First Class Expansion 01 — 1차 직업 확장 16종.
    //   "개성 확인용 foundation": grammar는 fallback 기본공격 타겟팅만 결정(스킬은 skills.js logic).
    //   visual = FX/파츠 donor, avatarKey = SR 아바타 키(=직업 id, avatars.js AVATAR_SPEC 자동 매핑).
    //   수치는 보수적 임시값(밸런스 아님). 즉시 선택 가능 직업은 아님 — 데이터/스킬 hook 확보용.
    warden:     { id: "warden",     name: "워든",   team: "party", job: "warden",     role: "front", grammar: "strike", visual: "warrior", avatarKey: "warden",     maxHp: 112, atk: 14, speed: 7 },
    watchbow:   { id: "watchbow",   name: "파수궁", team: "party", job: "watchbow",   role: "back",  grammar: "snipe",  visual: "archer",  avatarKey: "watchbow",   maxHp: 80,  atk: 15, speed: 8 },
    trapper:    { id: "trapper",    name: "덫꾼",   team: "party", job: "trapper",    role: "back",  grammar: "snipe",  visual: "archer",  avatarKey: "trapper",    maxHp: 78,  atk: 12, speed: 7 },
    paladin:    { id: "paladin",    name: "성기사", team: "party", job: "paladin",    role: "front", grammar: "strike", visual: "warrior", avatarKey: "paladin",    maxHp: 118, atk: 13, speed: 6 },
    vanguard:   { id: "vanguard",   name: "선봉",   team: "party", job: "vanguard",   role: "front", grammar: "strike", visual: "warrior", avatarKey: "vanguard",   maxHp: 102, atk: 12, speed: 8 },
    forbidden:  { id: "forbidden",  name: "금제",   team: "party", job: "forbidden",  role: "front", grammar: "strike", visual: "warrior", avatarKey: "forbidden",  maxHp: 98,  atk: 12, speed: 7 },
    wall:       { id: "wall",       name: "성벽",   team: "party", job: "wall",       role: "front", grammar: "protect",visual: "guardian",avatarKey: "wall",       maxHp: 145, atk: 9,  speed: 5 },
    healbow:    { id: "healbow",    name: "치유궁", team: "party", job: "healbow",    role: "back",  grammar: "snipe",  visual: "archer",  avatarKey: "healbow",    maxHp: 82,  atk: 11, speed: 7 },
    purifier:   { id: "purifier",   name: "정화사", team: "party", job: "purifier",   role: "back",  grammar: "heal",   visual: "priest",  avatarKey: "purifier",   maxHp: 84,  atk: 9,  speed: 7 },
    mage:       { id: "mage",       name: "마도",   team: "party", job: "mage",       role: "back",  grammar: "snipe",  visual: "archer",  avatarKey: "mage",       maxHp: 74,  atk: 16, speed: 7 },
    bard:       { id: "bard",       name: "바드",   team: "party", job: "bard",       role: "back",  grammar: "harass", visual: "archer",  avatarKey: "bard",       maxHp: 86,  atk: 10, speed: 8 },
    gatekeeper: { id: "gatekeeper", name: "수문장", team: "party", job: "gatekeeper", role: "front", grammar: "protect",visual: "guardian",avatarKey: "gatekeeper", maxHp: 122, atk: 11, speed: 6 },
    tracker:    { id: "tracker",    name: "추적자", team: "party", job: "tracker",    role: "back",  grammar: "snipe",  visual: "archer",  avatarKey: "tracker",    maxHp: 80,  atk: 15, speed: 8 },
    dragonspear:{ id: "dragonspear",name: "용창",   team: "party", job: "dragonspear",role: "front", grammar: "strike", visual: "warrior", avatarKey: "dragonspear",maxHp: 108, atk: 15, speed: 7 },
    sage:       { id: "sage",       name: "현자",   team: "party", job: "sage",       role: "back",  grammar: "snipe",  visual: "priest",  avatarKey: "sage",       maxHp: 82,  atk: 12, speed: 7 },
    sunlord:    { id: "sunlord",    name: "성황",   team: "party", job: "sunlord",    role: "back",  grammar: "heal",   visual: "priest",  avatarKey: "sunlord",    maxHp: 104, atk: 11, speed: 6 },
    // Second Class Mechanics Batch 1A — SR-25/27/30 2차 전투 씨앗(정식 미해금, Dev 전투 테스트용).
    //   수치는 보수적 임시값(밸런스 아님). 역할: 검성=전열 처형딜러 / 천궁=후열 표식저격 / 결계장=전열 보호탱커.
    swordsaint: { id: "swordsaint", name: "검성",   team: "party", job: "swordsaint", role: "front", grammar: "strike", visual: "warrior", avatarKey: "swordsaint", maxHp: 110, atk: 16, speed: 8 },
    skyarcher:  { id: "skyarcher",  name: "천궁",   team: "party", job: "skyarcher",  role: "back",  grammar: "snipe",  visual: "archer",  avatarKey: "skyarcher",  maxHp: 82,  atk: 15, speed: 8 },
    wardkeeper: { id: "wardkeeper", name: "결계장", team: "party", job: "wardkeeper", role: "front", grammar: "protect",visual: "guardian",avatarKey: "wardkeeper", maxHp: 130, atk: 10, speed: 6 },
    // Second Class Mechanics Batch 2 — SR-26/28/29 2차 전투 씨앗(정식 미해금, Dev 전투 테스트용).
    //   구원자=위기구조 힐러 / 역병술사=감염 디버퍼 / 무희=예측가능 박자 버퍼. 보수적 임시 수치(밸런스 아님).
    redeemer:     { id: "redeemer",     name: "구원자",   team: "party", job: "redeemer",     role: "back", grammar: "heal",   visual: "priest", avatarKey: "redeemer",     maxHp: 90, atk: 9,  speed: 7 },
    plaguebringer:{ id: "plaguebringer",name: "역병술사", team: "party", job: "plaguebringer",role: "back", grammar: "snipe",  visual: "archer", avatarKey: "plaguebringer",maxHp: 80, atk: 12, speed: 8 },
    dancer:       { id: "dancer",       name: "무희",     team: "party", job: "dancer",       role: "back", grammar: "harass", visual: "archer", avatarKey: "dancer",       maxHp: 84, atk: 10, speed: 8 },
  },

  enemies: {
    // 레거시 임시 몬스터(슬라임/고블린/늑대) — 프리뷰/dev 및 향후 고블린 전용 테마용으로 보존.
    //   초보자 테마(stages.js)는 더 이상 이들을 쓰지 않는다(Beginner Theme Actor 01에서 교체).
    slime: {
      id: "slime",
      name: "슬라임",
      team: "enemy",
      type: "slime",
      role: "front",
      maxHp: 45,
      atk: 6,
      speed: 5,
    },

    goblin: {
      id: "goblin",
      name: "고블린",
      team: "enemy",
      type: "goblin",
      role: "front",
      maxHp: 60,
      atk: 8,
      speed: 6,
    },

    wolf: {
      id: "wolf",
      name: "늑대",
      team: "enemy",
      type: "wolf",
      role: "back",
      maxHp: 50,
      atk: 10,
      speed: 8,
    },

    // Beginner Theme Actor 01 — 초보자 "동물 연합 / 새싹 숲" 라인업(루다 presentation-lab avatar-museum-01).
    //   btClass = R&D 조합형 CSS 클래스(bt-{개체} bt-{역할} [bt-elite|bt-boss]). render는 .monster.bt.bt-actor에
    //   이 클래스를 얹고 6파츠(shadow/extra/role/body/head/ears)를 그린다(아바타 박스 76×82 = R&D 동일).
    //   수치는 기존 임시 소형/정예/보스 범위 내(밸런스 변경 아님 — 얼굴 교체). 정예/보스는 stages의
    //   :elite/:boss 접미사로 RANK_OVERRIDES(170/520 등) 적용 → 기존 정예/보스 난이도 그대로.
    //   keepName: 고유명 정예/보스는 "정예/보스" 접두 중복을 막는다(HUD가 ELITE/BOSS 라벨을 따로 표시).
    //   Monster Identity 01 — trait = 전투 개성 키(battle.js가 적 행동 시 분기). "한 줄 개성" 1차.
    //     guard(곰방패 보호) / hunter(잎여우 빈틈) / rangedFocus(깃새 후열견제) / weaken(이슬말랑 약화) /
    //     healAlly(풀양 회복) / command(올빼미 지휘) / ward(사슴 결계) / bossRoar(사자왕 포효).
    bear:     { id: "bear",     name: "곰방패",        team: "enemy", type: "bear",     btClass: "bt-bear bt-tank",                role: "front", maxHp: 60, atk: 6,  speed: 5, trait: "guard" },
    fox:      { id: "fox",      name: "잎여우",        team: "enemy", type: "fox",      btClass: "bt-fox bt-melee",                role: "front", maxHp: 48, atk: 10, speed: 8, trait: "hunter" },
    bird:     { id: "bird",     name: "깃새",          team: "enemy", type: "bird",     btClass: "bt-bird bt-ranged",              role: "back",  maxHp: 42, atk: 9,  speed: 9, trait: "rangedFocus" },
    dewslime: { id: "dewslime", name: "이슬말랑",      team: "enemy", type: "dewslime", btClass: "bt-slime bt-support",            role: "back",  maxHp: 52, atk: 6,  speed: 6, trait: "weaken" },
    lamb:     { id: "lamb",     name: "풀양",          team: "enemy", type: "lamb",     btClass: "bt-lamb bt-healer",              role: "back",  maxHp: 50, atk: 5,  speed: 6, trait: "healAlly" },
    owl:      { id: "owl",      name: "숲올빼미 현자", team: "enemy", type: "owl",      btClass: "bt-owl bt-elite bt-support", keepName: true, role: "back",  maxHp: 170, atk: 12, speed: 5, trait: "command" },
    deer:     { id: "deer",     name: "사슴수호자",    team: "enemy", type: "deer",     btClass: "bt-deer bt-elite bt-healer", keepName: true, role: "front", maxHp: 170, atk: 12, speed: 5, trait: "ward" },
    lion:     { id: "lion",     name: "새싹숲 사자왕", team: "enemy", type: "lion",     btClass: "bt-lion bt-boss",            keepName: true, role: "front", maxHp: 520, atk: 15, speed: 5, trait: "bossRoar" },
  },
};
