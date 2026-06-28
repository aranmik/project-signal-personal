# 17 — Combat Language Grammar (전투 언어 문법)

> **전투 시인성 강화 = 공통 문법 + 직업 개성의 가독화**

이 문서는 Project Signal Personal의 전투 연출을 확장할 때 따르는 **기준판**이다.
새 연출을 대량으로 추가하기 위한 것이 아니라, "앞으로 어떤 연출을 어디에 붙일지"를 판단하는 공통 규칙이다.

- 시작 릴리즈: `Combat Language Grammar 01 — Start Line End Rule` (HEAD 3f1e245 = Bard Presence 02 위)
- 성격: dev/docs 기준 정리 (gameplay/battle.js/event/storage 변경 없음)
- 확인 도구: First Class Combat Language Preview (`dev/first-class-combat-language-preview.html`)

---

## 0. 정의

**전투 시인성 강화 = 공통 문법 + 직업 개성의 가독화.**

- **공통 문법**: 모든 직업이 공유하는 "행동의 뼈대" (Start / Line / End / Self / Target / Ally / Delivery).
- **직업 개성의 가독화(Identity FX)**: 직업마다 다른 개성 연출. 단, 공통 문법의 **어느 슬롯**에 붙는지가 명확해야 한다.

개성 FX가 문법 어디에도 붙지 않으면(= 그냥 장식이면) **실패로 본다.**

---

## 1. 공통 문법 8요소

| # | 요소 | 무엇을 읽히는가 | 위치 |
|---|------|----------------|------|
| 1 | **Start** | 누가 행동을 시작했는가 (source/actor) | source 주변 |
| 2 | **Line** | 행동이 어디로 향하는가 (공격/지원/회복/방해별 색·궤도·속도·움직임) | source → end |
| 3 | **End** | 행동이 어디에 도착했는가 (적=피격/착탄, 아군=적용/회복/보호) | end 지점 |
| 4 | **Self** | 나에게 적용 (자기 치유/강화/보호) | source 주변 aura/body FX |
| 5 | **Target** | 적에게 적용 (피격/착탄/표식/방해) | target 주변 hit/apply FX |
| 6 | **Ally** | 아군에게 적용 (회복/정화/보호/지원) | 아군 대상 주변 |
| 7 | **Delivery** | 효과가 전장/아군으로 **퍼지는** 전달감 | 분리된 lane / 전파 경로 |
| 8 | **Identity FX** | 직업 개성 — 위 1~7 중 **어디에 붙는지 명확**해야 함 | (붙는 슬롯에 종속) |

**End 규칙:** End 지점에는 정보가 **과하게 겹치면 안 된다.** hit ring + 핵심 마크 1개 수준으로 읽히게 한다.

---

## 2. 좋은 사례 — Bard Dual Note Grammar

바드가 이 문법의 첫 성공 기준을 만들었다(`Bard Presence 02 — Dual Note Grammar`). 한 직업이 **2개 슬롯**을 또렷이 분리한다.

1. **Body note bloom = 본체 개성 (Identity FX @ Self/Body)**
   - 바드 본체 주변에서 음표가 **왼쪽 위 / 위 / 오른쪽 위**로 포로롱 피어남.
   - 시작 위치를 머리 위로 올려(raise) 몸통에 묻히지 않게 함.
   - "행동의 주체는 바드"라는 개성.

2. **Text lane note flow = 음악 전달감 (Identity FX @ Delivery)**
   - 바드 rhythm/support 순간에 음표 3개가 **분리된 lane**에서 촤라랑 흐름.
   - "음악이 아군/전장으로 전달된다"는 감각.
   - 구현: `playSupportFx`에서 caster instanceId(`hero-bard-N`)로 바드만 판별 → 자동 발동 (battle.js/payload 무변경).

→ **역할 분리:** 공격(tempo/기본) = Body(주체), rhythm/support = Delivery(전달). 한 행동에 한 층만 → 과밀 0.

---

## 3. 현재 확인된 개선 필요 사례 — Paladin End clutter

> ★이 문서는 **이슈 기록만** 한다. 이번 작업에서 실제 FX는 수정하지 않는다.

- **현상:** 성기사 End 지점에 **주황 X + 큰 원 + 성기사 문양**이 겹쳐 정보가 많다(End 과밀).
- **좋은 점(유지):** Self aura(후광/자가치유 presence)는 적절하고 2차 성황을 침범하지 않는다.
- **후속 후보(별도 작업):** `Impact Grammar Cleanup` — End에서 X 제거, **hit ring + holy impact mark** 중심으로 정리.
- **상태:** 기준/이슈로만 기록 (not implemented).

---

## 4. 직업별 앵커 후보 (1차 15종)

각 직업의 Identity FX가 어느 문법 슬롯에 붙는지(또는 붙을지)의 **후보**. 구현 상태는 preview 기준.

| 직업 | 역할 | 앵커(슬롯) | 상태 |
|------|------|-----------|------|
| **bard** | 서포터 | **Body + Delivery** | ✅ 성공 사례 (구현) |
| **paladin** | 탱커 | **Self(✅) + End(⚠ 과밀)** | good + 이슈 → Impact Grammar Cleanup 후속 |
| **rogue** | 근접 | **Line + Identity(afterimage)** | ✅ Line identity good → Full Afterimage Probe 후속 |
| **mage** | 원거리 | End / Area Shockwave | 후보 (Hanabi는 2차/특수 AoE로 보존) |
| **purifier** | 힐러 | Ally Cleanse | 후보 |
| gatekeeper | 탱커 | Self / End (gate) | future seed |
| forbidden | 탱커 | Self / End (seal) | future seed |
| wall | 탱커 | End (plate) | future seed |
| warden | 근접 | Line / End (root) | future seed |
| watchbow | 원거리 | Line / End (aim) | future seed |
| tracker | 원거리 | Target (mark) | future seed |
| vanguard | 서포터 | Line / End (push) | future seed |
| trapper | 서포터 | Target (snare) | future seed |
| healbow | 힐러 | Ally / Line | future seed |
| saint | 힐러 | Ally / Self | future seed |

상태 범례: ✅ 구현/good · ⚠ 이슈 · 후보(candidate) · future seed(미구현).

---

## 5. 금지 기준 (Anti-patterns)

1. **모든 직업에 동일한 장식을 붙이지 말 것.** (역할/개성 차이가 사라진다.)
2. **End 지점에 정보 3개 이상을 무작정 겹치지 말 것.** (Paladin End clutter가 그 예.)
3. **개성 FX가 Start/Line/End/Self/Target/Ally/Delivery 중 어디에도 붙지 않으면 실패로 본다.** (목적 없는 장식 금지.)
4. **2차 직업급 대형 연출을 1차에 남발하지 말 것.** (성황/무희/검성/현자 급 침범 금지.)
5. 공통 문법(Start/Line/End 등)을 **방해하는** 개성 FX 금지. (가독성이 1순위, 개성은 그 위에.)

---

## 6. 적용 절차 (확장 시)

1. 추가하려는 연출이 **어느 슬롯**(Start~Delivery)에 붙는지 먼저 정한다.
2. 그 슬롯에 이미 정보가 과밀하지 않은지 확인한다(특히 End).
3. 2차 직업 존재감을 침범하지 않는 강도인지 확인한다(1차 < 2차).
4. First Class Combat Language Preview에서 행동선/role/signature/presence와 함께 읽히는지 확인한다.
5. 회귀(Role Tint / heal mint / Hanabi / Status Presence / Bard Dual Note / FCR01·02 / FCP01)를 확인한다.

---

### 관련 문서/릴리즈
- `10_EFFECT_DICTIONARY.md` (효과 사전), `11_FIRST_CLASS_OFFICIAL_SPEC.md` (1차 스펙), `14_HERO_READABILITY_ALIGNMENT_01.md` (가독성 정렬)
- 릴리즈: Hit Effect Identity 01(Role Tint) → Status Presence 01 → First Class Readability 01/02 → First Class Presence 01 → First Class Combat Language Preview 01 → Bard Presence 02 → **Combat Language Grammar 01(본 문서)**
