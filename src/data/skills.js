// Hero Skill Foundation 01 — 8종 영웅(기본 6 + 합체 2) 첫 스킬 메타데이터.
//   모든 영웅은 기본 "공격"을 갖고, 자기 턴에 조건을 만족하면 스킬을 쓴다(아니면 공격).
//   여기엔 "표시 메타"만 둔다(이름/텍스트 색 계층). 조건·효과·타겟은 battle.js trySkill에서
//   계산식 최소 변경 원칙으로 처리한다(데이터로 표현하기 어려운 분기라 코드에 둠).
//   kind = 스킬명 텍스트 색 계층: attack(빨강/주황) / ranged(초록) / heal·support(청록/금) / disrupt(보라).
export const SKILLS = {
  warrior:   { id: "smash",     name: "강타", kind: "attack"  },
  guardian:  { id: "guardcall", name: "수호", kind: "support" },
  archer:    { id: "snipe",     name: "저격", kind: "ranged"  },
  priest:    { id: "heal",      name: "치유", kind: "heal"    },
  cleric:    { id: "bless",     name: "축복", kind: "support" },
  trickster: { id: "disrupt",   name: "교란", kind: "disrupt" },
  rogue:     { id: "ambush",    name: "급습", kind: "attack"  },
  saint:     { id: "sanctuary", name: "성역", kind: "heal"    },
};

export function skillOf(jobId) {
  return SKILLS[jobId] || null;
}
