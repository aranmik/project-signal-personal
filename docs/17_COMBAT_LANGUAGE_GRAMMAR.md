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

## 3. Paladin End clutter → Impact Grammar Cleanup 01 (작업 중 · Preview Iteration)

- **현상:** 성기사 End 지점에 **주황 X(도착 마커) + 주황 hit ring(.fx-target) + 회청 펄스 + 성기사 십자**가 겹쳐 정보가 많았다(End 과밀).
- **좋은 점(유지):** Self aura(후광/자가치유 presence)·주황 행동선·Start/Line/Self는 그대로 유지.
- **정리(Impact Grammar Cleanup 01):** 성기사 행동선의 **도착 X 제거**(paladin signature 행동선에만 — `data-fx-signature="paladin"`, 용창/vanguard 등 다른 pierce 선의 X는 유지) + **holy impact mark(::before 십자) 약간 키움**. 목표 구조 = **hit ring + holy impact mark**(주 정보 2개).
- **상태:** 작업 중 · Preview Iteration Mode(커밋 전 나라 프리뷰 확인 대기). battle.js/payload/storage 무변경.

---

## 3-B. Guard Grammar Preview 01 → 01B — Ability-Aligned Bond / Taunt (방어계 재정렬 · Preview Iteration)

> **방향 전환 원칙:** 전투 시인성 강화는 **직업 이름의 상징**이 아니라 **현재 구현된 실제 능력**을 더 잘 읽히게 하는 작업이다.

**Guard 01의 문제(나라 프리뷰 판정):** 관문(gatekeeper)·돌벽(wall) 후보는 직업명 이미지에 끌려가 실제 능력과 **mismatch**. 실제 코드(`skills.js`/`battle.js`)를 보면 셋 다 정체성은 **도발 / 결속**이다 → **01B에서 실제 능력 기반으로 재정렬**(관문·돌벽 폐기, 봉인 링은 결속과 함께 재사용).

| 직업 | 실제 능력 (skills.js/battle.js) | 01B 앵커 | 표현(preview-only) | 읽힘 목표 |
|------|------|----------|---------------------|-----------|
| **gatekeeper / 수문장** | `taunt` — 최대 3명 도발, 도발당한 적의 다음 기본공격이 수문장으로 redirect | Target / Self / **Taunt** | 적 2~3명 머리 위 노랑 '!' + 적이 아군 노리던 의도가 수문장으로 꺾임(redirect) + 주목 펄스 | "적의 공격 의도를 자신에게 고정해 아군 대신 맞는다" |
| **wall / 성벽** | `goodbond` — 다친 아군 1명과 결속, 그 아군 피해의 50%를 성벽이 대신 + 보호막10 | Ally / Bond / **Protection** | 성벽↔지정 아군 금빛 결속선+자물쇠 + 보호 링 + 아군 피격 시 피해 분담(아군 일부/성벽 대신맞기) | "지정 아군과 결속해 그 아군 피해를 대신 받아준다" |
| **forbidden / 금제** | `evilbond` — 적과 악의 결속, 금제가 받은 피해의 40%를 결속 적에게 전가 | Target / Bond / **Seal** | 적 봉인 링(유지) + 금제↔적 붉은 결속선+자물쇠 + 금제 피격 시 일부 전가('금제가 맞았는데 적도 깎인다') | "적과 악의 결속을 맺고 받은 피해 일부를 되돌린다" |

- **실제 게임 시각 언어와 정렬:** 게임엔 이미 결속선이 구현돼 있음 — `bond-svg--defense`(금빛 사슬+자물쇠=선의 결속)·`bond-svg--offense`(붉은 사슬+자물쇠=악의 결속)·`taunt` 노랑 점선+머리위 '!'. 01B preview는 이 색/모티프(금빛/붉은/노랑·자물쇠)를 그대로 차용해 "실제로 전투에서 보이는 것"을 재현.
- **폐기:** Guard 01 관문(`.fcl-gate`)·돌벽(`.fcl-wall`) CSS/버튼/FX 제거. 봉인 링(`.fcl-seal`)은 금제 결속과 함께 유지(나라 "단일 봉인 방향 PASS").
- **구현 위치:** `dev/first-class-combat-language-preview.html`(CSS), `src/dev/firstClassCombatLanguagePreview.js`(버튼/FX) 만. **render.js/styles.css/battle.js 무변경 · gameplay 미반영 · 수치는 preview 예시.**
- **Rogue / Tracker:** 실제 [은신] 메커니즘 미구현 → **Stealth Foundation 전까지 HOLD**(잔상/표식 FX 추가 금지).
- **상태:** Preview Iteration Mode (커밋 전 나라 프리뷰 확인 대기).

---

## 3-C. Watchbow Riposte Preview 01 — Counter Trigger Readability (반응형 보복 인과 · Preview Iteration)

**Watchbow / 파수궁은 반응형 보복 직업이다.** 실제 능력 `riposte`(skills.js·battle.js): **후열 아군이 실제 피해를 입으면** 살아있는 파수궁이 **즉시 1회 공격자에게 원거리 보복**(자기 턴 외 반응형, `counterReady`). 현재 전투 표현은 보복 발동 시 원거리 공격선 정도라 **"언제·왜·누가 맞아서·어느 적에게"의 인과가 약하게** 보인다.

- **핵심 문법:** **Trigger / Ally / Counter** — 후열 아군 피격(Trigger)과 파수궁 보복(Counter) 사이의 **인과**를 보여주는 것이 목표.
- **표현 흐름(preview-only):** ①후열 아군 피격(적→아군 회색 공격선 + 작은 붉은 hit ring) → ②피격 지점→파수궁 **감지선(호박)** → ③파수궁 **반응 마커(연두 조준 십자 펄스)** → ④파수궁→공격자 **보복 화살(녹색 ranged)** → ⑤공격자 **counter hit(짧은 녹색 burst)**.
- **색 정렬:** 보복 화살 = 녹색(실 게임 `.fx-svg--ranged`)·반응 = 연두(`.fx-sig-watchbow`)·감지 Trigger = 호박(일반 지원선/표식과 구분).
- **Tracker 표식/추적과 구분:** Tracker는 "적에 점선 mark를 붙이고 → 추격 저격"(표식이 적에 붙음). Watchbow는 "**아군 피격을 감지 → 파수궁 자신이 반응 → 공격자에게 counter**"(반응 마커가 파수궁 자신에게, 표식 아님). 은신/표식 톤 회피.
- **구현 위치:** `dev/...preview.html`(CSS), `firstClassCombatLanguagePreview.js`(버튼/FX) 만. **render.js/styles.css/battle.js 무변경 · gameplay 미반영 · 보복 로직/반응 조건/수치 불변.**
- **Rogue / Tracker:** 여전히 **Stealth Foundation 전까지 HOLD**(이번 작업 미접촉).
- **상태:** Preview Iteration Mode (커밋 전 나라 프리뷰 확인 대기).

---

## 3-D. Vanguard / Trapper Grammar Preview 01 — Advance Line / Venom State (Preview Iteration)

실제 구현 능력 기반 시인성 후보(직업명 상징 아님).

### Vanguard / 선봉 — 전열 압박 + 전열 방어증가
- **실제 능력** `advance`(aoeStrike scope:front, battle.js 1478): **전열 적 AoE(×0.9)** + **전열 아군 방어 증가(defUp)**.
- **핵심 문법:** **Line / Ally / Advance** — 적 전열 타격과 아군 전열 brace가 **함께** 읽혀야 함.
- **표현(preview-only):** ①선봉 전진 chevron(주황·앞으로 밀고 나감) → ②적 전열 2명에 짧은 전열 타격선+hit(광역 아님) → ③동시에 아군 전열 brace(하늘 방패 호·defUp).
- **구분:** 마도 area shockwave(적 전역 광역) ✗ / 성벽 1명 결속·대신맞기 ✗ / 수문장 도발 redirect ✗ → 선봉은 **전열 압박 + 전열 다수 방어**. 색: 적 압박 주황(`.fx-sig-vanguard`)·아군 brace 하늘(`.fx-var--support` defUp).

### Trapper / 덫꾼 — 2대상 중독 상태
- **실제 능력** `venom`(poison count:2 duration:2, battle.js 1448): **적 최대 2명에 중독 2턴**.
- **핵심 문법:** **Target / Status / Venom** — "적 둘에게 독을 걸고 그 독이 상태로 남는다".
- **표현(preview-only):** ①덫꾼→적 2명 낮은 독 적용선(보라 점선·지면 깔림) → ②각 적 발밑 snare ring(연보라 점선·**적용**) + 몸통 보라 독방울 3개(**상태 유지**) → ③짧게 지속 상태.
- **Scale Tuning 01(방향 PASS 후 body readability 확대):** 독방울(poison wisp/orb)을 **≈2배 확대(7→14px)** + 대상당 **2→3개** 삼각 분산으로 **몸통 점유↑**("독이 적 몸에 크게 남아 있다"). 올라가는 양은 줄여 몸통에 머무름. 역할 분리: **발밑 snare=적용 / 몸통 독방울=상태 유지**. 단 "몸통을 꽤 채우되 완전히 가리지 않는" 수준(2대상 국소 유지·mage 광역 아님).
- **구분:** Tracker 1명 조준/추적 표식(몸통) ✗ / Mage 적 전역 광역 ✗ / Forbidden 결속·전가(src↔적 사슬+자물쇠) ✗ → 덫꾼은 **정확히 2대상 발밑 적용+몸통 상태**. 색: 보라 poison(`#c79bff`)·연보라 snare(`.fx-sig-trapper`). Rogue/Stealth 톤 회피.

- **구현 위치:** `dev/...preview.html`(CSS), `firstClassCombatLanguagePreview.js`(버튼/FX) 만. **render.js/styles.css/battle.js 무변경 · gameplay 미반영 · 스킬/수치/중독 턴 불변.**
- **Rogue / Tracker:** 여전히 **Stealth Foundation 전까지 HOLD**(이번 작업 미접촉).
- **상태:** Preview Iteration Mode (커밋 전 나라 프리뷰 확인 대기).

---

## 3-E. Healbow / Saint Grammar Preview 01 — Shot Heal / Dual Heal (Preview Iteration)

회복계 2종의 회복 **대상/방식**이 읽히게(직업명 상징 아님·실제 능력 기반).

### 단순 치유 공통 문법 (Healer Delivery Grammar Tuning 01)
나라 방향: **단순 치유는 공통 delivery 문법**을 쓴다 — 4요소:
1. **연녹/민트 계열**(`#9fe6cf`·rgba159,230,207)
2. **점선**(실선 아님)
3. **곡선 delivery**(SVG quadratic·위로 휨)
4. **End 치유 십자 심볼**(민트 +) + 대상 **"뾰로롱" 수신**(작은 밝은 민트 sparkle 3개 톡톡)

→ Healbow의 **회복 파트**와 Saint의 **2인 회복** 모두 이 공통 문법 사용(능력 방향은 불변).

### Healbow / 치유궁 — 적 저격 + 단일 아군 회복
- **실제 능력** `healshot`(snipeHeal target:lowHpEnemy healFactor:0.6, battle.js 1515): **적 1명 저격 + 다친 아군 1명 회복**.
- **핵심 문법:** **Line / Target / Ally** — 적 공격선과 아군 회복선이 **분리**되어야 함.
- **표현(preview-only):** ①적 1명 저격(녹색 **실선**·자기 행동·유지)+적 hit → ②다친 아군 1명에게 **공통 치유 문법**(민트 **점선 곡선** 회복선) → ③End **치유 십자** + **뾰로롱 sparkle** + "+N"(단일).
- **구분:** Watchbow 반응형 점선 counter(아군 피격 트리거) ✗ / Saint 2인 회복 ✗ / Purifier 직선 즉시 cleanse ✗ / Paladin 금빛 자가회복 ✗ → 치유궁은 **공격 대상(적)+회복 대상(아군1) 분리**. 색: 저격 녹색 실선(`.fx-svg--ranged`)·회복 민트 곡선 점선.

### Saint / 성직자 — 2인 동시 회복
- **실제 능력** `dualheal`(저체력 아군 2명 회복, battle.js performDualHeal): **순수 회복 2명**.
- **핵심 문법:** **Ally / Delivery / Heal** — 아군 2명이 **동시**에 회복됨이 선명해야 함.
- **표현(preview-only):** ①성직자 회복 준비 glow(민트) → ②아군 2명에게 거의 **동시** **공통 치유 문법**(민트 점선 곡선 회복선) → ③각 End **치유 십자** + **뾰로롱 sparkle** + "+N".
- **구분:** Healbow 1인+적 공격 ✗ / Purifier 정화·보호·분기 ✗ / Paladin 금빛 자가회복+holy mark ✗ → 성직자는 **순수 2인 동시 회복**. 단일·전체 파티 회복처럼 보이지 않게(정확히 2명).

### 예외(공통 힐 문법에 흡수하지 않음·미변경)
- **Purifier / 정화사:** **직선** 즉시 cleanse line + cleanse ring(상태이상 제거/보호). 곡선 점선 힐 delivery가 아니라 빠르고 곧은 cleanse — **유지**.
- **Paladin / 성기사:** 금빛 holy mark + 자가회복(self-heal) 개성 — **유지**.

- **구현 위치:** `dev/...preview.html`(CSS: `.fcl-heal-curve`/`.fcl-heal-cross`/`.fcl-heal-spark`·기존 `.fcl-heal-line`/`.fcl-heal-ring` 폐기), `firstClassCombatLanguagePreview.js`(`fclHealCurve`/`fclHealSparkle` 헬퍼) 만. **render.js/styles.css/battle.js 무변경 · gameplay 미반영 · 회복량/타깃 수 불변.**
- **Rogue / Tracker:** 여전히 **Stealth Foundation 전까지 HOLD**(이번 작업 미접촉).
- **상태:** Preview Iteration Mode (커밋 전 나라 프리뷰 확인 대기).

---

## 3-F. Warden Raid Preview 01 — Gauge Drain / Weaken (Preview Iteration)

**Warden / 워든은 게이지 높은 적을 제어하는 직업이다.** 실제 능력 `raid`(gaugeStrike target:highGaugeEnemy mult:1.2 drainPct:0.4 atkDownTurns:2, battle.js 1432): **게이지 높은 적 1명 공격 + 행동 게이지 40% 드레인 + 약화 2턴**. 분류 = 공격 + 제어.

- **핵심 문법:** **Target / Gauge / Weaken** — "게이지 높은 적을 습격해 게이지를 깎고 약화"가 읽혀야 함.
- **표현 흐름(preview-only):** ①높은 게이지 적 **식별**(적 위 파랑 게이지 바·차오름) → ②워든 **습격선**(올리브그린·날카롭고 짧게)+적 hit → ③**게이지 드레인**(파랑 게이지 조각이 아래로 뚝뚝·"-40%") → ④**약화**(적 발밑 회색 약화 마커).
- **색 정렬:** 게이지 = 파랑(`tempo-bar` rgba96,165,226·#8cc4f6, **가장 중요한 표현**) / 습격 = 올리브그린(`.fx-sig-warden`) / 약화 = 회색(`atkDown` 칩). 게이지 드레인(파랑)과 약화(회색)가 서로 다르게 읽힘.
- **구분:** Rogue 처형(저체력 마무리) ✗ / Tracker 표식→추적(몸통 점선 오래) ✗ / Watchbow 노랑 정보→녹색 counter ✗ / Trapper 보라 독방울 ✗ / Gatekeeper 도발 redirect ✗ → 워든은 **게이지 높은 적 즉시 제어**(게이지 바+드레인이 핵심·은신/처형 아님).
- **구현 위치:** `dev/...preview.html`(CSS), `firstClassCombatLanguagePreview.js`(버튼/FX) 만. **render.js/styles.css/battle.js 무변경 · gameplay 미반영 · 드레인 수치/약화 턴 불변.**
- **Rogue / Tracker:** 여전히 **Stealth Foundation 전까지 HOLD**(이번 작업 미접촉).
- **상태:** Preview Iteration Mode (커밋 전 나라 프리뷰 확인 대기).

---

## 4. 직업별 앵커 후보 (1차 15종)

각 직업의 Identity FX가 어느 문법 슬롯에 붙는지(또는 붙을지)의 **후보**. 구현 상태는 preview 기준.

| 직업 | 역할 | 앵커(슬롯) | 상태 |
|------|------|-----------|------|
| **bard** | 서포터 | **Body + Delivery** | ✅ 성공 사례 (구현) |
| **paladin** | 탱커 | **Self(✅) + End** | good · End cleanup 작업 중(X 제거 → hit ring + holy mark) |
| **rogue** | 근접 | **Line + Identity(afterimage)** | ✅ Line identity good → Full Afterimage Probe 후속 |
| **mage** | 원거리 | End / Area Shockwave | preview candidate added (preview-only · gameplay 미구현 · Hanabi는 2차/특수 AoE로 보존) |
| **purifier** | 힐러 | Ally / Cleanse | preview candidate added (preview-only · gameplay 미구현 · ally 대상 샘플) |
| **gatekeeper** | 탱커 | Target / Self / **Taunt** | 01B 재정렬 (preview-only · 실제 능력=도발/redirect · Guard 01 관문 mismatch 폐기) |
| **forbidden** | 탱커 | Target / Bond / **Seal** | 01B 재정렬 (preview-only · 실제 능력=악의 결속/40% 전가 · 봉인 링 유지) |
| **wall** | 탱커 | Ally / Bond / **Protection** | 01B 재정렬 (preview-only · 실제 능력=선의 결속/50% 대신맞기 · Guard 01 돌벽 mismatch 폐기) |
| **warden** | 근접 | Target / Gauge / **Weaken** | preview candidate added (preview-only · 실제 능력=게이지 높은 적 게이지 40% 드레인+약화 · Rogue 처형/Tracker 표식과 구분) |
| **watchbow** | 원거리 | Target / Ally / **Counter** | preview candidate added (preview-only · 실제 능력=반응형 보복 · 후열 아군 피격→공격자 counter · Tracker 표식과 구분) |
| tracker | 원거리 | Target (mark) | future seed |
| **vanguard** | 서포터 | Line / Ally / **Advance** | preview candidate added (preview-only · 실제 능력=전열 AoE+전열 방어증가 · 마도 광역/성벽 결속/수문장 도발과 구분) |
| **trapper** | 서포터 | Target / Status / **Venom** | preview candidate added (preview-only · 실제 능력=적 2명 중독 2턴 · Tracker 표식/Mage 광역/Forbidden 결속과 구분) |
| **healbow** | 힐러 | Line / Target / **Ally** | preview candidate added (preview-only · 실제 능력=적 저격+아군1 회복 · Watchbow counter/Saint 2인/Purifier 정화와 구분) |
| **saint** | 힐러 | Ally / Delivery / **Heal** | preview candidate added (preview-only · 실제 능력=아군 2인 동시 회복 · Healbow/Purifier/Paladin과 구분) |

상태 범례: ✅ 구현/good · ⚠ 이슈 · 후보(candidate) · future seed(미구현).

---

## 4-A. In-Game Apply 01 — Active Preview Grammar Integration (실제 전투 적용 매핑)

Preview에서 승인된 active 13종 문법을 **실제 전투 FX**에 반영하는 단계. **핵심 발견:** Preview 카드들은 처음부터 **실제 게임 FX 함수/시각을 차용·재현**해 만든 관측 장비였으므로, 승인된 문법의 **대부분이 이미 in-game render.js/styles.css에 구현**되어 있다. 따라서 이번 적용은 "신규 이식"이 아니라 "이미 구현된 in-game FX와 preview 승인 문법의 1:1 매핑 확인 + payload 부족 누락 식별"이다. **battle.js/event/payload/storage/gameplay 무변경**(원칙 준수).

| 직업 | 승인된 preview 문법 | in-game 실제 FX (이미 구현) | 적용 |
|------|------|------|------|
| **paladin** | End X 제거·hit ring·holy 십자·금빛 자가회복 | `playActionFx`(pierce, `data-fx-signature=paladin` → `.fx-head--x{display:none}`)+hit ring(.fx-target)+`.fx-sig-paladin` holy mark + `spawnSelfHealFx`(금빛) | ✅ 이미 적용(Paladin Cleanup 01 미커밋) |
| **bard** | body note bloom 3 + text lane note flow 3 | `spawnFirstClassPresence`(bard body bloom) + `spawnBardNoteFlow`(note flow·`isBardInstance`) | ✅ 이미 적용 |
| **mage** | 적 진영 전역 3-ring shockwave | `spawnAoeSpread`(코어+outward ring 3겹 stagger+dome+Hanabi 폭죽·maxR 적 거리 기반) | ✅ 이미 적용 |
| **gatekeeper** | 노랑 도발선 + 머리 위 '!' + redirect | `applyTauntMany`→`playActionFx`(lineType `taunt` 노랑선)+`.taunt-mark`('!')+`redirectIfTaunted` | ✅ 도발선/'!'/redirect 효과 적용 · ⚠ "의도 꺾임" 시각만 PARTIAL |
| **wall** | 금빛 결속선+자물쇠+보호막+대신맞기 | `renderBondLinks`(`.bond-svg--defense` 금빛 사슬+자물쇠)+보호막 guard 펄스+`protectedBy` 50% 분담 | ✅ 이미 적용 |
| **forbidden** | 붉은 결속선+자물쇠+봉인링+전가 | `renderBondLinks`(`.bond-svg--offense` 붉은 사슬+자물쇠)+`bondOffenseTarget` 40% 전가(applyDamage) | ✅ 결속선 적용 · ⚠ "전가 순간" 시각만 PARTIAL |
| **watchbow** | 노랑 감지선→녹색 counter | 후열 아군 피격→`performAttack`(ranged 보복선·1회) | ✅ 보복 counter 적용 · ⚠ "노랑 감지선(아군→파수궁)" PARTIAL |
| **vanguard** | 전열 적 타격+아군 전열 brace(defUp) | `aoeStrike`(전열 `performAttack`)+`applyCombatStatus(defUp)`+`playSupportFx`(guard 펄스) | ✅ 이미 적용 |
| **trapper** | 적 2명 독선+발밑 snare+큰 독방울 | `playActionFx`(disrupt 독선)+`applyStatus(poison)`+`spawnBodyPresence`(poison 15px wisp×2) | ✅ 독선/wisp 적용 · ⚠ "큰 독방울 3개" 일부(presence 2개·공통 poison) |
| **healbow** | 녹색 저격선 + 공통 힐(점선곡선+십자+뾰로롱) | 저격 `performAttack`(ranged)+`playSupportFx` heal(`.fx-svg--heal` 점선 `dasharray 1 6` 곡선+`.fx-head--cross` 십자+`.fx-mote` spark+`.fx-pulse--heal` 뾰로롱 펄스) | ✅ 이미 적용 |
| **saint** | 아군 2명 공통 힐(점선곡선+십자+뾰로롱) | `performDualHeal`→`playSupportFx` heal×2(위와 동일 점선곡선+십자+뾰로롱) | ✅ 이미 적용 |
| **warden** | 게이지 식별→습격→게이지 드레인 조각→약화 | `gaugeStrike`+`spawnGaugeDropMark`(게이지 드롭 마커)+`atkDown` 칩 | ✅ 게이지 드레인/약화 적용 · 식별 전조 일부 |
| **purifier** | 직선 cleanse line + cleanse ring | `playSupportFx`(위급=heal 점선곡선 / 정화=guard 방패 펄스) | ⚠ "직선 cleanse line+ring" preview 전용 시각은 in-game 미구현(heal/guard 재사용) → PARTIAL |

> **공통 힐 문법 = 이미 in-game 완비:** heal 선(`.fx-svg--heal`)은 **민트 점선(`stroke-dasharray: 1 6`) 곡선**, head는 **치유 십자(`.fx-head--cross` = `.fx-plus` +) + spark mote**, 대상 펄스는 **민트 뾰로롱(`.fx-pulse--heal`)**. → healbow/saint/priest/cleric 모든 순수 회복이 공통 문법을 그대로 따른다. **paladin 자가회복은 `spawnSelfHealFx`(금빛·예외 유지)**.

**PARTIAL (battle.js payload 부족 → 이번 작업 미반영·별도 작업으로 분리):**
1. **forbidden 피해 전가 순간 시각** — `applyDamage`가 금제60/적40을 `dealRaw` 2회로 분배하지만 "전가 튐" FX 없음. 추가하려면 battle.js applyDamage에 FX 호출 필요.
2. **watchbow 노랑 감지선(아군 피격→파수궁)** — 보복 `performAttack`(파수궁→적)은 있으나 "아군 피격 정보가 파수궁에 전달되는 노랑 감지선"은 payload 없음. battle.js 보복 트리거에서 추가 신호 필요.
3. **gatekeeper redirect 꺾임 시각** — 도발선+'!'은 있으나 "적 공격 의도가 원래 아군→수문장으로 꺾이는" 순간 시각은 `redirectIfTaunted`(공격 시점)에 payload 없음.
4. **purifier 직선 cleanse line+ring** — preview 전용. in-game purifier는 heal/guard FX 재사용. 직선 cleanse 전용 시각은 `playSupportFx`에서 purifier 판별 분기가 필요(casterInstanceId 형식 의존).
5. **trapper 큰 독방울 3개** — 공통 poison presence(`spawnBodyPresence` 2개·15px)라 trapper 전용 3개·확대는 sourceUnitId 판별 필요(status tick 경로엔 없음).

→ 위 5건은 **battle.js/payload 변경이 필요하므로 이번 in-game apply 범위 밖**. 별도 Foundation으로 분리.

### 4-A.1 In-Game Apply 01B — Runtime Signal Parity (PARTIAL 5건 닫음)

01의 PARTIAL 5건을 **visual-only signal bridge**로 닫는다. battle.js는 발동 지점에서 `playActorFx`(이미 import)에 **신호만** 보내고(gameplay/payload/수치/타깃/event schema 무변경), render.js가 span 기반 짧은 선/마커로 그린다(`fxSignalLine`/`fxSignalAt` helper·animationend 정리).

| gap | 처리 | 위치(visual-only) | 색·표현 |
|------|------|------|---------|
| **forbidden 전가 순간** | ✅ | `applyDamage` 전가 분배 직후 → `playActorFx("forbiddenTransfer", 금제, {toId:적})` → `spawnTransferFx` | 금제→적 **붉은 튕김선**(.bond-svg--offense 톤)+적 전가 hit |
| **watchbow 감지선** | ✅ | `triggerWatchbowCounter(attacker, victim)` 보복 직전 → `playActorFx("watchbowDetect", 파수궁, {fromId:피격아군})` → `spawnDetectLine` | 피격 아군→파수궁 **호박 점선 감지선**+반응 pulse(보복선은 그대로) |
| **gatekeeper redirect 꺾임** | ✅ | `redirectIfTaunted`에서 `taunter.id==="gatekeeper"`일 때 → `playActorFx("gatekeeperRedirect", 수문장, {fromId:원래타겟})` → `spawnRedirectFx` | 원래 타겟→수문장 **노랑 꺾임선**+focus pulse(redirect 결과 불변·다른 도발자 무오염) |
| **purifier 직선 cleanse** | ✅ | `render.js playSupportFx`에서 `isPurifierInstance`(hero-purifier-N) 판별 → 공통 힐(점선곡선) 대신 `spawnCleanseDelivery`(직선 청록 line+ring)·정화(guard)도 cleanse+보호막 펄스 | **직선 청록 cleanse line+ring**(공통 힐 점선곡선/십자/뾰로롱과 구분·battle.js 무변경) |
| **trapper 큰 독방울 3개** | ✅ | venom poison case(trapper 전용) `applyStatus` 직후 → `playActorFx("trapperVenom", trapper, {targetId:적})` → `spawnVenomBody` | 적 몸통 **큰 보라 독방울 3개**(14px·공통 poison tick 무변경·다른 직업 무오염) |

- **battle.js 변경 = visual-only signal bridge만**: 4곳(applyDamage 1줄·triggerWatchbowCounter 인자+1줄·redirectIfTaunted 1줄·venom case 1줄). **피해/회복/버프/디버프 수치·타깃·결속/보복/도발/중독/정화 로직·event schema·storage 전부 불변.** purifier는 battle.js 무변경(render.js만).
- **헤드리스 안전:** `playActorFx`는 `fxSuppressed` 가드 + spawn 함수는 fx-layer 없으면 return → sim 무영향.
- **회귀 보호:** redirect는 gatekeeper 전용(guardian 등 base 도발 무오염), venom body는 trapper venom 적용 순간만(공통 poison tick 무변경), purifier는 hero-purifier-N만(다른 healer 공통 힐 유지·paladin 자가회복 금빛 예외 유지).

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
