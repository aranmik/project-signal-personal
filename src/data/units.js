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
  },

  enemies: {
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
  },
};
