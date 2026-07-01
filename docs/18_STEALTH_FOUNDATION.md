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

---

## Rogue Stealth Preview 01 — 은신 체감 미리보기 (preview-only)

> Stealth Interaction Batch 01 / Phase A. **이 단계(A)는 preview-only였다 · Tracker 무변경.** (★현재 상태: Rogue 급습 후 은신/공격 시 reveal은 Phase C에서 실제 전투[core]에 연결됨 — 아래 Phase C 참조. 이 A 섹션은 당시 phase-scoped 기록.)

- **목적:** Foundation 계약(hidden veil / 은신 chip / reveal shimmer)을 First Class Combat Language Preview stage에서 "연출만" 재현해 Rogue 은신 체감을 나라/유키가 폰에서 확인.
- **변경 파일(preview 3종만):** `dev/first-class-combat-language-preview.html`(preview CSS) + `src/dev/firstClassCombatLanguagePreview.js`(버튼·시퀀스) + 본 문서. **★`src/core/battle.js`·`src/data/skills.js`·`src/core/main.js`·`src/core/state.js`·`index.html`·`render.js`·`styles.css` 무변경.**
- **버튼:** Rogue 카드 `Play stealth → ambush → reveal ▶`(`data-act="rogue-stealth"` · FCL_EXTRA.rogue · `tags:"Stealth / Ambush / Reveal"`).
- **시퀀스(`rogueStealth()` · 1x ≈ 2s):**
  - **① 은신 진입** — 슥 사라짐: `.fcl-stealth-in` 잿빛 연무 퍼프(0.55s) + `.fcl-src`에 `hidden-veil` 부여(아바타 0.25s 페이드 = '슥') + 은신 chip + 발밑 `.fcl-stealth-here` 마커.
  - **② 은신 유지** — 완전히 사라지지 않고 흐릿하게 위치 보임(veil+chip+발밑 마커). HP/게이지/레이아웃 불변.
  - **③ 공격 → reveal** — 실 게임 행동선 `playActionFx`(rogue slash) 재생 → 공격 순간 veil/chip 제거(0.25s 페이드백) + 실 게임 `playActorFx("revealShimmer","fcl-src")`.
- **재사용(신규 최소):** reveal 순간 = 실 게임 `.fx-reveal-shimmer`(render.js 무변경 · 호출만) · chip 팔레트 = 게임 `.status-chip--hidden` · veil = 게임 `.unit.hidden-veil` 값을 `.fcl-src`(.unit 아님)에 동일 미러(preview CSS). 신규 preview 클래스: `.fcl-stealth-in`/`.fcl-stealth-chip`/`.fcl-stealth-here`.
- **안정성:** `resetStealthPreview()`를 `setStageJob` 진입에 연결 → 직업 전환/반복 실행 시 veil/chip/타이머 정리(누적 0). `ex.tags` optional 필드(없으면 기존 anchor tags fallback = 기존 카드 무영향).
- **회귀 안전:** gameplay/balance/event/payload/storage/route/reward/loot 변경 0 · Rogue/Tracker 스킬 무변경 · normal gameplay hidden 자동 부여 없음 · 기존 First Class Combat Language preview·Runtime Parity Hotfix 무회귀 · 390 overflow 0.

---

## Tracker Reveal / Mark Preview 01 — 은신 탐지·표식·reveal 미리보기 (preview-only)

> Stealth Interaction Batch 01 / Phase B. **이 단계(B)는 preview-only였다 · 상태 시스템 mark 미추가 · Rogue preview 무회귀.** (★현재 상태: Tracker의 은신 적 reveal rider는 Phase C에서 실제 core[aim 조준]에 연결됨 — 단 현행 적 은신 소스가 없어 dormant. 아래 Phase C 참조. 이 B 섹션은 당시 phase-scoped 기록.)

- **목적:** "추적자가 은신 대상을 찾아내는 맛"(흔적 읽기 → 표식 → 드러남)을 preview stage에서 연출만 재현.
- **변경 파일(preview 3종만):** `dev/first-class-combat-language-preview.html`(preview CSS) + `src/dev/firstClassCombatLanguagePreview.js`(버튼·시퀀스) + 본 문서. **★battle.js·skills.js·render.js·styles.css·main.js·state.js·index.html 무변경.**
- **버튼:** Tracker 카드 `Play track → mark → reveal ▶`(`data-act="tracker-track"` · FCL_EXTRA.tracker · `tags:"Track / Mark / Reveal"`).
- **은신 대상 구성(preview DOM only):** `.fcl-tgt`(대상 박스)에 흐림 클래스 `.fcl-hidden-tgt`(opacity 0.4·SR 아바타 아닌 박스라 직접 흐림) + 은신 chip(게임 `.status-chip--hidden` 팔레트). **★normal gameplay hidden 자동 부여 아님 · 상태 배열 미변경.**
- **시퀀스(`trackerTrack()` · 1x ≈ 2.2s):**
  - **① 탐지 준비** — 추적자 집중 reticle `.fcl-track-focus`(호박 조준 십자) + tracker→대상 경로 발자국 점 `.fcl-track-step` 3개(흔적 읽기). 전역 스캔/레이더 아님 · Rogue 잿빛 연무(self)와 색·형태로 구분.
  - **② 표식** — 실 게임 Tracker mark `playActorFx("mark", …)`(점선 조준선 + 대상 스코프) + 추적 mark chip `.fcl-track-chip`(호박·대상 박스 아래). 상태 mark 미추가(DOM only).
  - **③ 드러남** — 대상 은신 해제(`.fcl-hidden-tgt`·은신 chip 제거) + 실 게임 `playActorFx("markBurst", …)` + `playActorFx("revealShimmer","fcl-tgt")`(shimmer가 **대상** 위). Rogue "공격하며 self reveal"과 달리 "탐지해서 대상을 reveal".
- **재사용(신규 최소):** mark/markBurst/revealShimmer = 실 게임 render 함수(render.js 무변경·호출만) · 은신 chip = 게임 `.status-chip--hidden`. 신규 preview 클래스: `.fcl-hidden-tgt`/`.fcl-track-focus`/`.fcl-track-step`/`.fcl-track-chip`.
- **안정성:** `resetStealthPreview()`에 Tracker 요소(대상 흐림·reticle·발자국·추적 chip) 정리 추가 → 직업 전환/반복 실행 시 누적 0. Phase A(Rogue) 시퀀스·double-run·정리 무회귀.
- **회귀 안전:** gameplay/balance/event/payload/storage/route/reward/loot 변경 0 · Rogue/Tracker 스킬 무변경 · 상태 시스템 mark 미추가 · normal gameplay hidden/reveal/mark 자동 적용 없음 · 기존 FCL preview·Phase A 무회귀 · 390 overflow 0.

### 다음 후보
- ~~`Rogue Stealth Preview 01`~~ ✅ (Phase A · preview-only).
- ~~`Tracker Reveal / Mark Preview 01`~~ ✅ (Phase B · preview-only).
- ~~`Stealth In-Game Apply 01`~~ ✅ (Phase C · 실제 gameplay 연결 — 아래).

---

## Stealth In-Game Apply 01 — 실제 gameplay 연결 (Phase C)

> Stealth Interaction Batch 01 / Phase C. **★Phase A/B는 preview-only였고, 여기서부터 실제 전투(gameplay) 적용이 시작된다.** 범위 최소.

- **선행 FIX — in-game hidden veil selector:** `src/ui/styles.css` `.unit.hidden-veil` 셀렉터에 실제 SR 아바타 마운트 `.av-fit`(+ 적 몬스터 `.monster`)를 추가. 기존 `figure/.av-stage/svg`는 호환 유지. **전부 `.unit.hidden-veil` 스코프 안 = 비은신 유닛 영향 0.** → 실 전투에서 hidden 유닛 아바타가 opacity 0.42로 흐려지고, HP바/게이지/칩/레이아웃은 유지(유닛 전체 opacity 안 낮춤·아바타[.av-fit/.monster]만).
- **C-1 Rogue 실제 은신:** `src/core/battle.js` `trySkill` rogue 케이스 — 급습(마무리, HP≤40% 적) **성공 직후** `applyHidden(unit, 2, "ambush")`(Foundation 계약 재사용). ambush 스킬 id/name/log/수치 무변경(급습 자체 그대로) + 한 줄 추가. duration 2턴(짧게)·조건부(마무리 성공 시에만)·저빈도. **무한/상시/시작 즉시 영구 은신 아님.**
- **C-2 공격 시 reveal:** `performAttack` 진입부에 `if (shouldRevealOnAction(attacker,"attack")) clearHidden(attacker,"attack");`(Foundation 계약). 은신 유닛이 공격하면 그 순간 은신 해제 + `clearHidden` 내부 `playActorFx("revealShimmer")`. **event schema/payload/피해 계산 무관.** 흐름: 급습→은신→(다음 공격)reveal shimmer+해제→(그 공격이 또 급습이면)재은신. 공격 후 은신 잔류 없음.
- **C-3 Tracker 상호작용(최소·dormant):** `runDataSkill` `aim` 케이스 조준(첫 행동) 앞에 짧은 rider — `aliveEnemies()` 중 은신한 **적**이 있으면 `playActorFx("mark")`(탐지 표식) + `clearHidden(foe,"tracker")`로 1명 reveal + 로그. **★대상은 `gameState.enemies`뿐 → 아군 rogue 은신은 절대 대상 아님(rogue 은신 맛 보존).** aimshot 조준/추격/표식 로직·로그 정체성 무변경. **신규 mark status 미추가**(기존 mark FX만 호출). Tracker=Rogue 카운터/은신 삭제 시스템 아님(대상 1명·표식+shimmer만). **★현행엔 적 은신 소스가 없어 사실상 dormant(적이 hidden일 때만 발동) — devStealth로 적에 hidden 부여해 검증.** Rogue reveal(자기 slash 후 shimmer)과 Tracker reveal(탐지 표식선+대상 shimmer)은 표현 구분.
- **C-4 Target filter 안전성:** `filterHiddenTargets`/`selectAttackTarget`/`selectArcherTarget` **무변경**(Foundation 그대로). visible 우선 / all-hidden fallback 유지. 현행 gameplay에서 실제 hidden은 아군 rogue뿐 → 적의 party 타겟팅에서 rogue 제외(치고 사라짐 방어감)·all-party-hidden이면 fallback.
- **C-5 Preview 보존:** Phase A/B preview(rogue-stealth·tracker-track 버튼/시퀀스) **무삭제·무회귀**. preview 파일 3종 그대로.
- **변경 파일:** `src/ui/styles.css`(veil selector) + `src/core/battle.js`(C-1/2/3) + 본 문서. **★skills.js/main.js/state.js/index.html/render.js 무변경 · event/payload/storage/route/reward/loot 변경 0 · 신규 status 타입 0 · 타 직업/base/2차 오염 0.**
- **남은 WATCH:** ①Tracker 적-은신 reveal은 dormant(적 은신 소스 생기면 활성) — 유키 판단 필요. ②나라 폰에서 실 전투 rogue 은신 veil/chip·급습→은신→공격 reveal 체감 확인. ③밸런스: 급습 후 은신으로 적이 rogue를 1회 스킵하는 방어 이득 — 보수적이나 장기 관측 권장.
