// Reward & Growth Foundation 01 → Run Reward Training 01 → Diversification 02 — 로그라이크식 훈련 보상 풀.
//   일반 전투 승리 후 "훈련" 3택 중 1개를 고른다. 단순 공격력 몰빵이 정답이 되지 않도록
//   역할(combatRole)/배치(전열·후열)/회복 기반 훈련을 섞는다.
//
//   Diversification 02:
//     - 모든 훈련은 런 중 최대 3회(MAX 3)까지만 선택 가능(rewardLevels로 카운트, Lv.3 이후 후보 제외).
//     - "힐러 훈련" → "회복 훈련": 힐러 회복량이 아니라 파티 전체가 "받는 치유량(healRecv)"을 올린다.
//     - "균형 훈련": 최대 HP + 받는 치유량(extra)으로 차별화.
//
//   각 훈련: target(적용/적격 대상) + stat(증가 스탯) + value [+ extra:{stat,value}]. battle.js applyReward 라우팅:
//     - stat "healRecv" : run.bonuses.healRecv (전역, 받는 치유량) — createUnit이 유닛 healReceivedBonus로 반영.
//     - target "all"    : run.bonuses[stat] (전역 atk/maxHp) — createUnit이 전 아군에 반영.
//     - 그 외(front/back/tank/melee/ranged/support): run.training[target][stat] (대상 필터 성장).
//   수치는 보수적 임시값(밸런스 아님). Lv가 올라도 효과 수치는 동일 — 선택 1회당 효과 1회 적용(누적).
export const REWARDS = [
  // 범용(항상 후보 가능)
  { id: "offense",  name: "공세 훈련", description: "모든 아군의 공격 피해 +1", target: "all", stat: "atk",   value: 1 },
  { id: "survival", name: "생존 훈련", description: "모든 아군의 최대 HP +4",   target: "all", stat: "maxHp", value: 4 },
  // 균형 — HP + 받는 치유량(생존 훈련과 차별화)
  { id: "balance",  name: "균형 훈련", description: "모든 아군 최대 HP +2, 받는 치유량 +1", target: "all", stat: "maxHp", value: 2, extra: { stat: "healRecv", value: 1 } },

  // 배치 기반
  { id: "frontline", name: "전열 단련", description: "전열 아군의 최대 HP +6", target: "front", stat: "maxHp", value: 6 },
  { id: "backline",  name: "후열 집중", description: "후열 아군의 공격 피해 +2", target: "back",  stat: "atk",   value: 2 },

  // 역할(combatRole) 기반
  { id: "tank",    name: "탱커 훈련",   description: "탱커 영웅의 최대 HP +8",   target: "tank",    stat: "maxHp", value: 8 },
  { id: "melee",   name: "근접 훈련",   description: "근접딜러 영웅의 공격 +2",  target: "melee",   stat: "atk",   value: 2 },
  { id: "ranged",  name: "원거리 훈련", description: "원거리딜러 영웅의 공격 +2", target: "ranged",  stat: "atk",   value: 2 },
  { id: "support", name: "서포터 훈련", description: "서포터 영웅의 최대 HP +6",  target: "support", stat: "maxHp", value: 6 },

  // 회복 — 파티 전체가 "받는 치유량"을 올린다(힐러 본인 회복량이 아님). 후열 공격 몰빵과 회복 유지력 분리.
  { id: "recovery", name: "회복 훈련", description: "파티 전체가 받는 치유량 +2", target: "all", stat: "healRecv", value: 2 },
];

// Diversification 02 — 훈련 최대 선택 횟수(이후 일반 보상 후보 제외).
export const REWARD_MAX_LEVEL = 3;

export function rewardById(id) {
  return REWARDS.find((r) => r.id === id) || null;
}
