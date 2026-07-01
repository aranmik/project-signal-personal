# 18 — Stealth Foundation (은신 상태 계약)

> 은신은 멋진 잔상 FX가 아니라, 도적/추적자 전투 정체성을 만들기 위한 **최소 상태 계약**이다.

이 문서는 Rogue/Tracker의 은신 시스템을 확장할 때 따르는 기준판이다. (전투 연출 문법은 `17_COMBAT_LANGUAGE_GRAMMAR.md`.)

---

## Stealth Foundation 01 — Minimal Hidden State Contract

- **목적:** Rogue/Tracker 시인성 작업을 바로 시작하는 대신, `hidden` 상태 계약을 먼저 깐다. **★Rogue/Tracker 스킬/FX 변경 없음(HOLD)·normal gameplay 미연결.**
- **상태 구조:** 기존 status 구조 재사용 — `unit.statuses[{ type: "hidden", duration, source }]`. 내부 key `hidden` / 표시명 `은신`.
- **helper (`src/core/battle.js`):**
  - `isHidden(unit)` — 은신 여부.
  - `applyHidden(unit, turns=2, source=null)` — `applyStatus`로 hidden 부여.
  - `clearHidden(unit, reason)` — hidden 제거 + reveal shimmer(`playActorFx("revealShimmer")`).
  - `shouldRevealOnAction(unit, actionKind)` — 은신 유닛이 공격 계열(attack/ranged/disrupt) 행동 시 reveal 후보 판정(**판정만·실제 자동 연결은 future**).
  - `filterHiddenTargets(candidates)` — visible 후보 있으면 은신 제외 / 전부 은신이면 fallback 전체.
- **타깃 계약:** 적대 단일 타깃 `selectAttackTarget`·`selectArcherTarget`이 `filterHiddenTargets` 적용. **★hidden을 부여하는 스킬이 아직 없어(HOLD) 일반 플레이에선 어떤 유닛도 hidden이 아님 → 타깃/밸런스 영향 0.** 아군 heal/support 타깃은 미변경.
- **UI (`render.js`/`styles.css`):** 은신 chip(`STATUS_CHIP.hidden` → `.status-chip--hidden` "은신") + 아바타 veil(`.unit.hidden-veil` figure/svg opacity 0.42·HP/게이지/chip은 유지) + reveal shimmer(`.fx-reveal-shimmer`). **최소·잔상/암살 느낌 아님·레이아웃 불변.**
- **dev 검증(dev-only):** `src/core/battle.js` `devStealth(cmd, instanceId, turns)` export — `apply`/`clear`/`isHidden`/`list`/`reveal`/`pickPartyTarget`. **★main gameplay 미노출(signalDev에 안 붙임)·storage 무관·상태만 조작.** dev preview/콘솔에서 import로만.

### 회귀 안전
- normal gameplay에서 Rogue/Tracker 자동 은신 없음·신규 FX 없음. gameplay/balance/event/payload/storage/route/reward/loot 변경 0. 기존 first class combat visibility·common heal·13종 무회귀.

### 다음 후보
- `Rogue Stealth Preview 01` — 은신 진입/은신 중 시인성.
- `Tracker Reveal / Mark Preview 01` — 은신 적 탐지·표식·reveal.
- `Stealth In-Game Apply 01` — 실제 Rogue/Tracker 스킬에 hidden 부여/reveal 연결.
