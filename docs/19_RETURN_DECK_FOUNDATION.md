# 19 — Return Deck Foundation (귀환 덱 기초)

> **"들고 돌아온 전리품이 다음 토벌 준비가 된다."** — 귀환 결과가 다음 보스 도전 준비로 쌓이는 그릇.

이 문서는 Return Deck → Boss Challenge / Hunt 축을 확장할 때 따르는 기준판이다. (전리품/귀환 감정 코어는 Return & Loot Core 01, 씨앗 장부는 `16_SIGNAL_PERSONAL_SEEDS.md`.)

---

## Return Deck Foundation 01 — Carry Loot Becomes Next Hunt Prep

- **목적:** 보스 토벌 런타임을 만들기 전에, **귀환(return)/클리어(clear) 결과가 "다음 토벌 준비"로 누적되는 최소 상태 + 표시**를 먼저 깐다. Return Deck = 카드게임이 아니라 **귀환 기록이 다음 토벌 준비로 정리되는 그릇**.
- **상태 구조(`src/core/progression.js` · localStorage 기존 키 `signal_personal_progress_v1` 안 하위 필드 — 새 storage key 없음):**
  ```
  progress.returnDeck = {
    huntPrep: 0,     // 누적 토벌 준비도
    returns: 0,      // 귀환/클리어 누적 횟수
    lootSecured: 0,  // 누적 확보 전리품 수
    bestDepth: 0,    // 귀환 덱 기준 최고 심도
    recent: [ { result, depth, alertness, bossKeys, loot:[id], prep, ts } ] // 최근 3건(RETURN_DECK_RECENT_CAP)
  }
  ```
- **준비도 공식(`computeReturnPrep` · 순수 계산·아주 단순):** 전리품 tier 가중(흔함1/드묾2/귀함3 합) + 심도 ⌊depth/5⌋ + 보스키 ×2 + 클리어 보너스 3. **★표시/감정용 점수 — 전투 수치/입장권/소모/게이트 아님(밸런스 영향 0).**
- **기록 훅(`recordReturnDeck` · 비throw):** `battle.js recordFootprint`의 **return/clear에서만** 호출(defeat/abort 제외 = 귀환 덱 오염 방지 · headless 주회는 recordFootprint 진입에서 이미 차단 = localStorage 무오염). return/clear에선 carriedLoot == secured(getRunLootSummary 규칙)라 그대로 접는다. 이번 기여(prep)는 `run.returnDeckContrib`(메모리 전용·비저장)로 결과 카드에 전달.
- **UI(`render.js renderReturnedDeckCard` 확장 · index.html 무변경):** 기존 "귀환 덱" 카드(return/clear에만 표시) 안에 `.deck-prep` 소형 블록 — `귀환 덱에 기록됨 · 토벌 준비 +N` + `사자왕 토벌 준비 <누적> · 귀환 <n>회 · 누적 전리품 <n>` + 단계 문구. 복잡한 카드 UI 아님·390px 한 칸.
- **Boss Hunt future contract (dormant):** `HUNT_PREP_STAGES`(0/1/8/20 → "아직 흔적이 없다"→"흔적이 조금 모였다"→"토벌의 단서가 모이고 있다"→"사자왕 토벌 준비가 무르익었다") + `bossHuntReadiness(huntPrep)`. **이번 단계에선 표시만** — Boss Challenge / Hunt Contract 01이 이 단계/threshold를 이어받아 도전 계약(선택/조건/보상)을 정의한다.
- **dev 확인:** `returnDeckSummary()` export — dev 콘솔에서 `import('/src/core/progression.js').then(m=>m.returnDeckSummary())`로 즉시 관측(추가 dev UI 없음·최소).

### 이번 단계에서 구현하지 않은 것 (금지 준수)
- 보스 선택 화면 / 보스별 덱 소모·입장권 / 토벌 보상 시스템 / 토벌 랭크·도감 대형 시스템 / 신규 보스 / 전투 난이도·밸런스 변경 / 덱 편집 화면 / 카드 효과 — 전부 **미구현**(future).

### 안전/호환
- **기존 세이브:** `migrate`가 returnDeck 없는 구세이브에 안전 기본값 주입(타입 맞는 값만 병합·깨진 값은 기본값). 저장 실패는 조용히 무시(비throw).
- **오염 0:** 새 storage key 없음(기존 progress 키 내부 하위 필드) · battle event schema/payload 무변경 · route/reward/loot 로직 무변경(carriedLoot 드랍/확보 규칙 그대로 **읽기만**) · main.js/state.js/index.html 구조 무변경(run.returnDeckContrib는 런타임 메모리 필드·비저장) · base/2차 직업 무관.
- **모바일:** `.deck-prep`는 기존 `.deck-card`(max-width 300px) 내부 — 390px overflow 0.

### 다음 후보
- `Boss Challenge / Hunt Contract 01` — HUNT_PREP_STAGES/threshold를 이어받아 토벌 도전 계약(도전 조건·선택·보상 골격) 정의.
- `Route / Return Pressure Recheck 01` — 초반 1~8 생존 밴드 재점검(Run Feel Recheck 01 권고).
- 최근 귀환 recent 기록의 표시(발자취/도감 연계)는 future(이번엔 저장만).
