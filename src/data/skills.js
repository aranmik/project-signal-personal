// Hero Skill Foundation 01 → First Class Expansion 01 — 1차 직업 18종 스킬 메타/로직.
//   모든 영웅은 기본 "공격"을 갖고, 자기 턴에 cond를 만족하면 스킬, 아니면 공격 fallback.
//   kind = 스킬명 텍스트 색 계층: attack(빨강/주황) / ranged(초록) / heal·support(청록·금) / disrupt(보라).
//
//   기본 6 + 도적/성직자(8종)는 battle.js trySkill의 "전용 케이스"가 처리한다(검증된 동작 유지).
//   확장 16종은 logic 디스크립터를 battle.js의 데이터 executor(runDataSkill)가 해석한다.
//   logic.type = 효과 종류, logic.target = 대상 선택, logic.cond = 발동 조건(미지정=상황 의존).
//   "개성 확인용 foundation" — 수치는 보수적. 반응형(결속 redirect/보복 counter/성역 면역)은
//   안전 최소 구현(마커/근사)으로 두고 정밀 동작은 WATCH.
export const SKILLS = {
  // ── 기본 6 + 합체 2 (battle.js 전용 케이스) ──
  warrior:   { id: "smash",     name: "강타", kind: "attack"  },
  guardian:  { id: "guardcall", name: "수호", kind: "support" },
  archer:    { id: "snipe",     name: "저격", kind: "ranged"  },
  priest:    { id: "heal",      name: "치유", kind: "heal"    },
  cleric:    { id: "bless",     name: "축복", kind: "support" },
  trickster: { id: "disrupt",   name: "교란", kind: "disrupt" },
  rogue:     { id: "ambush",    name: "급습", kind: "attack"  },
  // 01A: 성직자는 쌍치유(저체력 아군 2인 회복, 사제와 동일 회복량). "성역"은 성황 전용으로 분리.
  saint:     { id: "dualheal",  name: "쌍치유", kind: "heal"   },

  // ── 확장 16종 (데이터 executor) ──
  warden:    { id: "raid",   name: "습격", kind: "attack",
    logic: { type: "gaugeStrike", target: "highGaugeEnemy", mult: 1.2, drainPct: 0.4, atkDownPct: 0.2, atkDownTurns: 2 } },

  // 01A: 파수궁 보복 = 반응형(후열 아군 피격 시 공격자에게 즉시 보복). 자기 턴엔 logic 없음
  //   → 기본 원거리 "공격". 실제 트리거는 battle.js performAttack의 후열 피격 감지에서 처리.
  watchbow:  { id: "riposte", name: "보복", kind: "ranged" },

  trapper:   { id: "venom", name: "중독", kind: "disrupt",
    logic: { type: "poison", target: "frontNoPoison", duration: 2 } },

  paladin:   { id: "holylight", name: "성휘", kind: "support",
    logic: { type: "strikeHealShield", target: "front", mult: 1.0, selfHeal: 6, allyShield: 8 } },

  vanguard:  { id: "advance", name: "진군", kind: "attack",
    logic: { type: "aoeStrike", scope: "front", mult: 0.9, healFactor: 0.375 } },

  forbidden: { id: "evilbond", name: "악의 결속", kind: "disrupt",
    // 피해 전가(redirect)는 위험 → 근사: 타격 + 악의 결속 마커. (WATCH: 실제 40% 전가)
    logic: { type: "bondOffense", target: "front", mult: 1.0 } },

  wall:      { id: "goodbond", name: "선의 결속", kind: "support",
    // 피해 분담(redirect)은 위험 → 근사: 최저 아군 보호막 + 선의 결속 마커. (WATCH: 실제 50% 분담)
    logic: { type: "bondDefense", target: "lowAlly", shield: 10 } },

  healbow:   { id: "healshot", name: "치유사격", kind: "heal",
    logic: { type: "snipeHeal", target: "lowHpEnemy", mult: 1.0, healFactor: 0.6 } },

  purifier:  { id: "purify", name: "정화", kind: "support",
    logic: { type: "cleanse", target: "lowAlly", healFactor: 0.8, shield: 6 } },

  mage:      { id: "arcane", name: "마력집중", kind: "disrupt",
    logic: { type: "charge", chargeName: "마력집중", releaseName: "마력폭발", scope: "all", mult: 1.1 } },

  bard:      { id: "rhythm", name: "리듬&템포", kind: "disrupt",
    logic: { type: "rhythmTempo", allyCrit: 1, enemyTempo: 2, drainPct: 0.2, slowPct: 0.4 } },

  gatekeeper:{ id: "taunt", name: "도발", kind: "support",
    logic: { type: "taunt", turns: 1, alsoStrike: true } },

  tracker:   { id: "aimshot", name: "조준", kind: "ranged",
    logic: { type: "aim", target: "highHpEnemy", releaseName: "추격", mult: 1.8, fullHpBonus: 0.4 } },

  dragonspear:{ id: "pierce", name: "관통", kind: "attack",
    logic: { type: "pierce", mult: 1.1 } },

  sage:      { id: "foresee", name: "예지집중", kind: "support",
    logic: { type: "charge", chargeName: "예지집중", releaseName: "현자의 파동", scope: "all", mult: 1.0, allyHaste: { count: 2, pct: 0.3 } } },

  sunlord:   { id: "aegis", name: "성역", kind: "support",
    logic: { type: "sanctuary", allyHpThreshold: 0.5 } },
};

export function skillOf(jobId) {
  return SKILLS[jobId] || null;
}
