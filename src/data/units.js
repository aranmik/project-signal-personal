export const UNIT_TEMPLATES = {
  party: {
    warrior: {
      id: "warrior",
      name: "전사",
      team: "party",
      job: "warrior",
      role: "front",
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
      maxHp: 105,
      atk: 11,
      speed: 6,
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
