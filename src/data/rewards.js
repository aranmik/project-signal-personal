// Reward & Growth Foundation 01 → Run Reward Training 01 — 로그라이크식 훈련 보상 풀.
//   일반 전투 승리 후 "훈련" 3택 중 1개를 고른다. 단순 공격력 몰빵이 정답이 되지 않도록
//   역할(combatRole)/배치(전열·후열)/문법(회복) 기반 훈련을 섞는다.
//
//   각 훈련: target(적용 대상) + stat(증가 스탯) + value. 적용은 battle.js applyReward가 라우팅:
//     - target "all"  : run.bonuses[stat] (전역) — createUnit이 전 아군에 반영(기존 경로).
//     - stat "heal"   : run.bonuses.heal (전역 회복 가산) — 회복 주체가 힐러라 힐러 훈련으로 제시.
//     - 그 외(target=front/back/tank/melee/ranged/support): run.training[target][stat] (대상 필터 성장).
//       → createInitialParty가 유닛의 배치(전열/후열)·combatRole에 맞춰 atk/maxHp를 가산.
//   수치는 보수적 임시값(밸런스 아님). 영구 치명/방어/보호막 효과량 성장은 후속 Foundation.
export const REWARDS = [
  // 범용(항상 후보 가능) — 공격력 몰빵 격하: "공세"도 매우 소폭만.
  { id: "offense",  name: "공세 훈련", description: "모든 아군의 공격 피해 +1", target: "all", stat: "atk",   value: 1 },
  { id: "survival", name: "생존 훈련", description: "모든 아군의 최대 HP +4",   target: "all", stat: "maxHp", value: 4 },
  { id: "balance",  name: "균형 훈련", description: "모든 아군의 최대 HP +2",   target: "all", stat: "maxHp", value: 2 },

  // 배치 기반
  { id: "frontline", name: "전열 단련", description: "전열 아군의 최대 HP +6", target: "front", stat: "maxHp", value: 6 },
  { id: "backline",  name: "후열 집중", description: "후열 아군의 공격 피해 +2", target: "back",  stat: "atk",   value: 2 },

  // 역할(combatRole) 기반
  { id: "tank",    name: "탱커 훈련",   description: "탱커 영웅의 최대 HP +8",   target: "tank",    stat: "maxHp", value: 8 },
  { id: "melee",   name: "근접 훈련",   description: "근접딜러 영웅의 공격 +2",  target: "melee",   stat: "atk",   value: 2 },
  { id: "ranged",  name: "원거리 훈련", description: "원거리딜러 영웅의 공격 +2", target: "ranged",  stat: "atk",   value: 2 },
  { id: "support", name: "서포터 훈련", description: "서포터 영웅의 최대 HP +6",  target: "support", stat: "maxHp", value: 6 },
  { id: "healer",  name: "힐러 훈련",   description: "힐러의 회복량 +2",         target: "healer",  stat: "heal",  value: 2 },
];

export function rewardById(id) {
  return REWARDS.find((r) => r.id === id) || null;
}
