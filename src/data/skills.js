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
    // Batch 01C — 독 표식 서포터: 임의의 적 최대 2명 중독(독 대상 공격 시 치명 보정은 battle.js performAttack).
    logic: { type: "poison", duration: 2, count: 2 } },

  paladin:   { id: "holylight", name: "성휘", kind: "support",
    logic: { type: "strikeHealShield", target: "front", mult: 1.0, selfHeal: 6, allyShield: 8 } },

  vanguard:  { id: "advance", name: "진군", kind: "attack",
    // Batch 01B — 선봉 정체성 정렬: 회복 제거(healFactor 삭제) → 전열 적 AoE + 전열 아군 방어 증가(battle.js).
    logic: { type: "aoeStrike", scope: "front", mult: 0.9 } },

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
    // Batch 01C — 완전 랜덤 음유시인: 아군/적·대상·효과 랜덤(아군 atkUp/critUp, 적 speedDown/게이지↓). battle.js bardRandom.
    logic: { type: "bardRandom" } },

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

  // Second Class Mechanics Batch 1A — SR-25/27/30 2차 전투 씨앗(정식 미해금, Dev 전투 테스트용).
  //   검성 결투: 결투 표식 우선타격 + 간파 반격(triggerSwordsaintCounter) + HP35%↓ 마무리 일섬.
  swordsaint:{ id: "duel", name: "결투", kind: "attack",
    logic: { type: "duel", mult: 1.1, executeThreshold: 0.35, executeMult: 1.4, counterMult: 0.7 } },
  //   천궁 천표식: 표식 대상 받는 피해↑(defDown 재사용) + 표식 우선 하늘사격.
  skyarcher: { id: "skymark", name: "하늘 표식", kind: "ranged",
    logic: { type: "skymark", mult: 1.3, dmgUpPct: 0.12 } },
  //   결계장 진형 결계: 첫 행동 파티 보호막(전열 추가/후열 완충) + 주기적 앵커 보강. 성황 피해무효와 분리(감소/완충).
  wardkeeper:{ id: "wardfield", name: "진형 결계", kind: "guard",
    logic: { type: "wardfield", partyShield: 6, frontShield: 10, backGuardPct: 0.15, backGuardTurns: 2 } },

  // Second Class Mechanics Batch 2 — SR-26/28/29 2차 전투 씨앗(정식 미해금, Dev 전투 테스트용).
  //   구원자 구원선: 첫 행동에 아군 1명 '구원' 부여 → 치명 피해 직전 1회 개입(dealRaw/triggerSalvation). 보조=정화 우선+소량 회복.
  redeemer:     { id: "rescue", name: "구원선", kind: "support",
    logic: { type: "rescue", healPct: 0.20, shield: 7, rescueHeal: 5 } },
  //   역병술사 감염: 적 1명 '감염'(지속 피해+defDown) → 행동 2회마다 1명 제한 확산(최대 3). 감염 대상 우선 공격.
  plaguebringer:{ id: "plague", name: "감염", kind: "support",
    logic: { type: "infect", mult: 1.0, infectTurns: 3, infectTick: 2, infectDefDown: 0.12, maxInfected: 3, spreadEvery: 2 } },
  //   무희 박자: 행동마다 1박씩 진행(예측 가능). 1박 고양(atkUp) / 2박 회전(회복·보호막) / 3박 피날레(전체 보호막).
  dancer:       { id: "dance", name: "박자", kind: "support",
    logic: { type: "dance", exaltPct: 0.10, healAmt: 5, beat2Shield: 4, finaleShield: 3 } },
};

export function skillOf(jobId) {
  return SKILLS[jobId] || null;
}
