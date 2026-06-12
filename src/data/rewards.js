// Reward & Growth Foundation 01 — 런 성장 보상 데이터.
//   보상은 버튼이 아니라 "다음 전투에 남는 성장" — 선택 시 run.bonuses[stat]에 누적되고,
//   다음 스테이지 파티 재생성(createInitialParty) 때 아군 전체에 반영된다(적 미적용).
//   수치는 임시값(밸런스 아님). 유물/장비/직업별 성장은 다음 Foundation — 이 배열만 늘린다.
export const REWARDS = [
  {
    id: "atk",
    name: "공격 훈련",
    description: "모든 아군의 공격 피해 +1",
    stat: "atk",
    value: 1,
  },
  {
    id: "maxHp",
    name: "체력 훈련",
    description: "모든 아군의 최대 HP +4",
    stat: "maxHp",
    value: 4,
  },
  {
    id: "heal",
    name: "회복 훈련",
    description: "모든 회복량 +2",
    stat: "heal",
    value: 2,
  },
];

export function rewardById(id) {
  return REWARDS.find((r) => r.id === id) || null;
}
