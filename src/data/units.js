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
