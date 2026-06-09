# DEVLOG — Project Signal Personal

Project ID: SIGNAL_PERSONAL
Project Name: Project Signal Personal
Status: active
Scope: 세로형 모바일 HTML/PWA 자동전투 개인 작업물

---

## 2026-06-09

### Phase 0 — 로컬 프로젝트 뼈대 완료

- 프로젝트 폴더 생성: `C:\Users\aranm\Dev\nara-workshop\project-signal-personal`
- 파일 생성: `index.html`, `src/core/main.js`, `src/ui/styles.css`
- 로컬 브라우저에서 실행 확인 완료
- 콘솔 에러 없음

### Phase 0.5 — GitHub 연결 및 Pages 배포 완료

- GitHub 저장소 연결: https://github.com/aranmik/project-signal-personal
- 첫 커밋: `init: Phase 0 project scaffold`
- 브랜치: `main`
- GitHub Pages 배포 완료
- PC 및 핸드폰 브라우저 접속 확인
- GitHub Pages 주소: https://aranmik.github.io/project-signal-personal/

### Phase 1 — 화면 프레임 완료

- `index.html`: game-frame 구조 확장 (top-hud / battle-field / battle-log / bottom-panel)
- `src/ui/styles.css`: 390px 세로 프레임, 모바일 safe-area 대응, 좌우 넘침 방지
- `src/core/main.js`: 초기화 로그 문구 유지
- GitHub push 완료

### Phase 2 — 게임 상태 구조 완료

- `src/core/state.js` 신규 생성: gameState 객체 export
- `src/core/main.js`: gameState import, stage-label / status-label 화면 반영
- 브라우저 콘솔에서 gameState 확인 가능
- GitHub push 완료

### Phase 2.5 — 임시 유닛 데이터 화면 출력 완료

- `src/core/state.js`: party 3명 / enemies 3마리 임시 데이터 추가
- `src/ui/render.js`: 신규 생성, renderGame / renderHud / renderUnits / renderLogs
- `src/core/main.js`: renderGame 호출 연결
- `src/ui/styles.css`: 유닛 카드 스타일 추가
- 로컬 Preview 확인 완료 / **아직 push 안 함**

### Phase 3 — 유닛 데이터 정리 완료

- `src/data/units.js`: 신규 생성, UNIT_TEMPLATES export (원본 데이터)
- `src/core/state.js`: UNIT_TEMPLATES import, createUnit / createInitialParty / createInitialEnemies 추가
- `src/ui/render.js`: instanceId 기반 DOM 식별로 수정, job/type/role 순서로 라벨 표시
- 화면 출력 Phase 2.5와 동일 유지 확인
- 로컬 Preview 확인 완료 / **아직 push 안 함**

### Phase 3.5 — 캐릭터 아바타 가이드 문서 완료

- `docs/06_CHARACTER_AVATAR_GUIDE.md`: 신규 생성
- 조립형 아바타 원칙 / 파츠 개념 / 3직업 방향 / 6직업 확장 방향 정리
- 구현 없음, 문서만 작성
- **아직 push 안 함**

### Phase 4.5a — 정합성 보정 완료

- `src/core/state.js`: `dead: false` → `isDead: false` (필드명 통일)
- `src/core/state.js`: `version` → `"v0.1-phase4.5"` 갱신
- `src/core/state.js`: 초기 로그 "Phase 3: 유닛 데이터 분리 완료." → "Phase 4.5: 자동전투 / 사제 회복 완료."
- `src/core/battle.js`: `performHeal()` 로그를 계산 회복량 → 실제 회복량(actualHeal)으로 수정
- `DEVLOG.md`: Push 상태 요약 현행화 (Phase 0~4.1 완료 / 4.5 로컬·보정 중)
- `NEXT.md`: 다음 1순위 Phase 4.5a 정합성 보정으로 갱신
- **아직 push 안 함 — 나라님 로컬 확인 후 승인 대기**

### Phase 4.5 — 사제 회복 추가 완료

- `src/core/battle.js`: 함수 구조 재정리
  - performAction(unit) — 행동 분기 (회복 또는 공격)
  - selectHealTarget(party) — 살아있는 아군 중 HP 비율 최저, 70% 미만 조건
  - performHeal(healer, target) — healAmount = Math.round(atk * 1.5), maxHp clamp
  - selectAttackTarget(pool) — 기존 front 우선 로직 분리
  - performAttack(attacker, target) — 기존 공격 로직 유지
- 사제 판별: unit.id === "priest"
- 회복량: 사제 atk 8 기준 12 회복
- 로컬 Preview 확인 완료
  - 사제가 전사 HP 70% 미만 시 "사제가 전사을(를) 회복했다. 12 회복." 로그 출력 ✓
  - 전사 HP 회복 수치 증가 확인 ✓
  - maxHp 초과 없음 ✓
  - 회복 대상 없을 시 사제 공격 정상 동작 ✓
  - 전투 승리 정상 종료 ✓
  - 콘솔 에러 없음 ✓
- **아직 push 안 함 — 나라님 로컬 확인 후 승인 대기**

### Phase 4.1 — 전투 관찰 / 재시작 보강 완료

- `src/core/battle.js`: tick interval 500ms → 1000ms 완화
- `src/core/battle.js`: resetBattle() 함수 추가 (party/enemies 완전 재생성, 상태 초기화)
- `src/core/battle.js`: 종료 로그에 "다시 시작할 수 있습니다." 추가
- `src/core/state.js`: createInitialParty / createInitialEnemies export 추가
- `src/core/main.js`: ended 상태에서 버튼 클릭 시 reset → start 연결
- `src/ui/render.js`: 버튼 텍스트 ready/running/ended 상태별 처리
  - ready → 전투 시작 / running → 전투 중... / ended → 다시 시작
- 로컬 Preview 전 흐름 확인 완료
  - 1000ms 속도로 전투 흐름 눈으로 따라갈 수 있음 ✓
  - 슬라임 DEAD → 고블린 DEAD → 늑대 DEAD → 승리 ✓
  - 종료 후 "다시 시작" 버튼 활성화 ✓
  - 재시작 시 HP / DEAD / gauge / 로그 정상 초기화 ✓
  - 두 번째 전투 정상 진행 ✓
  - 콘솔 에러 없음 ✓
- **아직 push 안 함 — 나라님 로컬 확인 후 승인 대기**

### Phase 4 — 자동전투 최소 루프 완료

- `src/core/battle.js`: 신규 생성
  - startBattle / stopBattle / battleTick / selectTarget / performAttack / checkBattleEnd
  - 500ms 간격 setInterval 루프
  - actionGauge += speed, >= 100 시 행동
  - front 우선 타겟 선택, 배열 앞쪽 우선
  - isDead 판정, tick interval 종료 처리
- `src/core/main.js`: 전투 시작 버튼 이벤트 연결
- `src/ui/render.js`: renderButton 추가 (전투 중/승리/패배 버튼 상태), DEAD 카드 표시
- `src/ui/styles.css`: dead 카드 스타일 (opacity 0.35, DEAD 라벨), 버튼 disabled 스타일
- 로컬 Preview 전투 실행 확인 완료
  - 전투 시작 → HP 감소 → DEAD 표시 → 적 전멸 → 승리 정상 동작
  - 콘솔 에러 없음
- **아직 push 안 함**

### 로컬 미리보기 환경 구축 완료

- Node.js v24.16.0 설치
- serve 패키지 전역 설치
- Claude Preview 서버 연동 (포트 3000)
- 렌 작업 화면 오른쪽 패널에서 실시간 게임 화면 확인 가능

---

### Combat Feel Polish 01 — 전투 속도/HUD/행동선 감각 정리 완료

> 새 기능 아님. 오늘 들어간 4인 파티 + 배속 + HUD + 행동선의 전투 감각을 나라 취향으로 정리.
> 오늘 push 전 마지막 작업.

**1) 기본 전투 호흡 상향** (`core/battle.js`)
- 나라 체감상 기존 2x가 기본에 가까움 → `BASE_TICK_INTERVAL` 1000→**500ms**.
- 새 1x=500ms / 새 2x=250ms(BASE/speed). 계산식 무변경, tick 간격만. startTicking 단일 진입점 유지(interval 중복 0).

**2) HP바/속도게이지 정리** (`ui/styles.css`)
- **폭 통일**: 속도게이지 52%→**78%(HP바와 동일)**. HP 바로 아래 같은 폭 정렬 → "어디까지 차면 행동"이 한눈에.
- **간격 축소**: 속도게이지 margin-top 3px→2px.
- **색 = 상태 정보 기준 통일**(진영 무관): 체력 = **빨강**(`rgba(228,92,80,.62)`, 아군/적 동일, enemy 오버라이드 제거) / 속도 = **파랑**(`rgba(96,165,226,.6)`), ready-soon 파랑 glow.
  - 근거: HP/속도는 진영이 아니라 상태 → 정보 종류로 색을 고정하는 게 직관적. 진영 구분은 위치/실루엣이 담당.
- 두께는 HP 3px / 속도 2px 유지 → 같은 폭이어도 두께+색으로 구분, 얇고 조용한 스타일(UI판 아님). 이름/HP 숫자 비노출 유지, 아바타 안 가림.

**3) 행동선 감각** (`ui/render.js spawnLine` + `ui/styles.css`)
- 직선 span → **SVG 곡선 path**로 교체(구조·anchor·source→target 문법 유지, 좌표는 동일 s/t에서 계산).
  - **곡선**: 수직벡터로 중간점을 살짝 밀어 약한 bow(Q 2차 베지어). heal은 반대로 휘어 공격선과 결 구분.
  - **그라데이션**: linearGradient 시작 opacity 0(투명) → 끝 0.95(선명).
  - **끝점 쐐기**(.fx-head): 끝 접선 방향 회전 → "대상에 꽂혔다".
  - **타이밍**: path dashoffset 1→0 빠른 draw-in(0.2s, 꽂힘) + svg 수명 0.95s로 느린 fade(잔상) = "팟! → 스스슥". 기존 0.62s보다 느리게.
  - 2x(250ms)에선 `[data-speed="2"] .fx-svg` fade 0.62s로 단축 → 선 과밀 방지.
- 색 토큰만 유지(궁수 연두/사제 초록/전사·수호자 amber/적 coral), currentColor로 stroke·head 적용.
- 화려한 연출/스킬명/다수타겟/치명타 없음. pulse·숫자는 기존 유지.

- 변경 파일: `src/core/battle.js`, `src/ui/render.js`, `src/ui/styles.css`, `DEVLOG.md`, `NEXT.md`
- 검증 (프리뷰, computed style + SVG 구조 + setInterval 계측 + 정적 선 시각 확인):
  - 게이지: HP/속도 폭 동일(48.35px), HP=빨강(아군·적 동일)·속도=파랑, 두께 3/2px, 간격 2px ✓
  - 행동선 SVG: Q 곡선·viewBox·gradient(시작 opacity 0)·끝점 쐐기 렌더 — 정적 캡처로 곡선/그라데이션/화살촉 육안 확인 ✓
  - 호흡: 1x=500ms / 2x=250ms(lastMs 250) ✓, 토글 시 cadence 500/250 정확
  - **interval: 토글·스테이지·재시작 전 구간 항상 1개, 전투 종료(2x 포함) 후 0** ✓
  - **2x FX 과밀: 244 샘플 동시 행동선 최대 2 / 숫자 최대 2** → 읽힘(과밀 아님). 2x=250ms 채택(300ms 안전값 불필요)
  - Stage 1→2→3 / 성장(수호자 포함) / 전체 클리어("전체 클리어!"·"처음부터") / 재시작(Stage1·보너스 0·4인 full HP·gauge 0) ✓
  - console error/warn 0
- **WATCH**: 2x 동시 행동선/숫자 최대 2로 현재는 무난하나, 향후 적/파티 수가 늘면 fx-number(0.9s) 누적 가능 → 그때 숫자 duration 배속 연동 재검토.
- **push 안 함 / 나라님 모바일 확인 대기 → 확인 후 오늘 묶음(Party Join 01 + Battle Speed 01 + Combat Feel Polish 01) push 예정**

---

### Party Join 01 + Battle Speed 01 — 4번째 동료 합류 + 전투 배속 완료

> Living Battle Screen 01 기준점(commit ccb8039) 위에서 진행. 두 기능 묶음.
> 목표: 4인 파티가 전장에 서고 싸운다 + 1x/2x 배속으로 흐름 조절.

**1) Party Join 01 — 4번째 동료(수호자/guardian)**
- **데이터** (`data/units.js`): `party.guardian` 추가 — 기본 공격형(직업 확장 아님).
  - role `back`, maxHp 105(묵직)·atk 11·speed 6(가장 느림) → 기존 3인과 박자/체감 구분
- **파티 합류** (`core/state.js`): `createInitialParty`에 `hero-guardian-1` 추가(instanceId reconcile 키 안정). 성장 보너스(atk/maxHp) 동일 적용.
- **배치** (`styles.css`): 예비였던 back-right anchor를 실제로 채움 — `.guardian-pos { left:158px; bottom:168px }`. 2x2(전열 전사·궁수 / 후열 사제·수호자) 완성.
- **아바타** (`render.js` AVATAR_PARTS + `styles.css`): 공통 파츠 + 창(lance)로 최소 실루엣 구분(강철+자수정 색, 창끝 삼각). 전사 방패·사제 지팡이·궁수 활과 겹치지 않음. idle delay -1.9s, face-ne 창끝 전방(NE) 겨눔.
- **전투 참여**: 기존 루프 그대로 작동 — actionGauge/HP바/속도게이지/행동선/피격 리액션 자동 적용. SOURCE_ANCHORS.guardian(창끝) 추가, attackLineType은 party 근접 → slash 재사용.
- **이름/HP 숫자 비노출 유지** (aria-label만). battle.js 계산 로직 무변경.

**2) Battle Speed 01 — 1x/2x 배속**
- **상태** (`state.js`): `battle.speed`(기본 1). 세션 내 사용자 선택 유지(battle 객체 재생성 안 하므로 스테이지/재시작에 보존).
- **interval 단일 진입점** (`battle.js`): `startTicking()` — 항상 `clearInterval` 먼저 → `setInterval(battleTick, 1000/speed)`. **중복 생성 0.** startBattle/toggleSpeed 모두 이 함수만 사용.
- **토글** (`toggleSpeed`): 1↔2. 전투 중이면 startTicking 재무장(기존 timer 정리되므로 누수 없음), 비전투면 다음 startBattle에 반영. **tick 간격만 조정 — 계산식 무변경.**
- **HUD** (`index.html` + `render.js renderHud`): 상단 우측 `#speed-toggle`(1x/2x), 2x일 때 amber `.fast` 강조. `#battle-field[data-speed]` 반영.
- **2x 부드러움** (`styles.css`): `data-speed="2"`에서 tempo fill transition 0.9s→0.45s — cadence(500ms)에 맞춰 게이지가 따라가며 끊김 방지(Tempo Smooth 01 보존).
- **정리**: 전투 종료(stopBattle)/타이틀(goTitle)/재시작(resetBattle) 모두 기존 clearInterval 유지 → 잔류 interval 없음.
- 변경 파일: `index.html`, `src/data/units.js`, `src/core/state.js`, `src/core/battle.js`, `src/core/main.js`, `src/ui/render.js`, `src/ui/styles.css`, `DEVLOG.md`, `NEXT.md`
- 검증 (프리뷰, 동적 import로 gameState 직접 관찰 + setInterval/clearInterval 계측):
  - 유닛 7개(party 4 + enemy 3), 수호자 HP·속도게이지·face-ne·창 렌더 ✓
  - 수호자 기본 공격 참여(로그 "수호자가 …를 공격했다. 12 피해" = atk 11+성장 1) ✓, FX 행동선/숫자 발생(Stage2 40/40) ✓
  - 2x 토글: state.speed 2 / data-speed 2 / 버튼 "2x"+fast ✓
  - **활성 interval 추적: 토글·스테이지 전환·재시작 전 구간에서 항상 1개**(누수 0) ✓
  - **전투 종료 후 interval 0 + tick 정지**(2x 포함) ✓
  - Stage 1→2→3 진행 / 성장(atk·maxHp, 수호자에도 적용) / 전체 클리어 결과 오버레이("전체 클리어!"·"처음부터") ✓
  - 재시작: Stage1 복귀·보너스 0·4인 full HP·gauge 0·interval 1개 ✓
  - console error/warn 0
- **WATCH**: 2x(tick 500ms)에서 fx-number(0.9s)가 다음 틱과 일부 겹칠 수 있음. 현재 단일 행동/틱이라 과밀하진 않으나, 후속에서 FX duration 배속 연동 검토 여지(이번 범위 제외).
- **push 안 함 / 나라님 모바일 확인 대기**

---

### Tempo Smooth 01 — 전투 흐름 끊김 진단 및 최소 완화 완료

> 새 기능 아님. "한 틱 한 틱 턱턱 멈추는" 체감의 원인 진단 + 부드러움 최소 회복.

- **끊김 원인 진단 (코드 구조 기준)**:
  - `battleTick`(1000ms) → `renderGame` → `renderUnits`가 매 tick `layer.innerHTML=""`로 **전 유닛 DOM 파괴·재생성**
  - → `.avatar`의 `sig-idle`(2.6s 호흡)이 **매 1초 0%로 재시작**, 주기를 완주 못 하고 전 캐릭터가 1초 간격으로 동시에 "툭" 리셋 = 체감 끊김의 주범
  - → 게이지/HP도 재생성 시점에 width가 즉시 박혀 1초 계단 점프. 매번 새 요소라 CSS transition 보간 자체가 불가능했음
  - FX는 `#fx-layer`(별도, 재구성 대상 아님)라 원인 아님 / hit reaction은 이미 `.fig-react`로 idle과 transform 분리되어 충돌 없음(후보 D 기해결)
- **완화 (후보 C 핵심 + A)**:
  - `render.js` `renderUnits`: innerHTML 전체 교체 → **instanceId 키 reconcile**. 아바타/파츠 DOM을 유지하고 변하는 값(HP/게이지/dead)만 `updateFieldUnit`로 갱신 → **idle 연속**
    - instanceId는 스테이지/재시작 간 안정 → 요소 재사용, FX getBoundingClientRect 영향 없음
    - 더 이상 없는 유닛만 제거(누적/중복 방지)
  - `styles.css`: tempo fill에 `transition: width 0.9s linear` — 요소가 유지되므로 비로소 효과. 1초 tick 사이 게이지가 부드럽게 차오름
  - 리셋(행동 후 급강하)은 `updateFieldUnit`에서 감지해 `transition:none`+reflow로 **즉시 snap** — 천천히 빠지는 어색함 방지
- **전투 계산/tick 속도/밸런스 무변경** / 새 기능 없음
- 변경 파일: `src/ui/render.js`, `src/ui/styles.css`, `DEVLOG.md`, `NEXT.md`
- 검증 (프리뷰):
  - 동일 `.unit`/`.avatar` 요소 여러 tick·스테이지 유지(`__trackEl` 동일성 true) ✓
  - **`sig-idle` currentTime 85,325ms 연속 running** — 매 tick 재시작 안 함 확정(수정 전이면 1000ms 미만) ✓
  - tempo transition 0.9s 적용, 차오름 보간/리셋 snap ✓
  - 스테이지 2 전환: 중복 0, dead 0(부활), HP 전원 리셋 ✓ / 콘솔 0
- **push 완료 (commit ccb8039) / 나라님 모바일 PASS (2026-06-09)**

---

### Combat Tempo 01 — 속도 게이지 최소 시각화 완료

> "누가 곧 행동할지"를 읽는 최소 정보. UI판 아님 — "곧 행동할 기척" 정도.

- **구조**: `actionGauge`(0~100, 100에서 행동) 비율을 보조 게이지로
  - `render.js`: HP바 아래에 `.tempo-bar > .tempo-bar-fill` 추가, width = `clamp(actionGauge, 0, 100)%`. **숫자 없음**
  - `state.js`의 `unit.actionGauge`를 그대로 읽음 (전투 계산 무변경)
- **HP바와 의도적 구분** (혼동 방지):
  - 더 얇게(2px < HP 3px) + 더 짧게(52% < HP 78%) → 보조 채널로 읽힘
  - 색 채널 분리: HP = 진영색(아군 teal / 적 coral, 생명) / Tempo = **양 진영 공통 amber**(박자) → 색만으로 "체력 아님" 전달
  - 2줄 구조: 아바타 아래 HP바 → 그 아래 속도바
- **곧 행동 기척** (`ready-soon`, gauge ≥88%): amber 밝기↑ + 약한 box-shadow glow. 가득 차면 곧 행동함이 직관적으로 읽힘
- **리셋**: 행동 시 gauge `-=100` → 다음 tick 재구성에서 짧은 바로 표시. 매 tick 새 요소라 cross-render transition 글리치 없음(자연스러운 리셋)
- **사망 유닛**: 속도 게이지 숨김(`opacity:0`) — 행동 안 함
- **battle.js 무변경** / 이름·HP 숫자 재추가 없음 / HP바·리액션 구조 유지
- 변경 파일: `src/ui/render.js`, `src/ui/styles.css`, `DEVLOG.md`, `NEXT.md`
- 검증 (프리뷰, MutationObserver):
  - 유닛별 gauge 진행도 반영(speed 차이로 폭 다름) ✓
  - ready-soon 전 유닛 ≥88%에서 발동(88~100%) ✓
  - 리셋 확인(archer 99%→8% / wolf 100%→12% / slime 95%→0%) ✓
  - HP바와 두께·길이·색 구분, 2줄 깔끔 ✓ / 행동선·숫자·리액션 충돌 없음 ✓ / 콘솔 0
- **push 완료 (commit c7535c4) / 나라님 모바일 PASS (2026-06-09)**

---

### Hit Reaction 01 — 피격/회복 리액션 최소 강화 완료

> Action Feedback 01(행동선·숫자) 위에, 맞은/회복받은 유닛 본체가 짧게 반응 → "몸에 닿았다" 강화.
> 새 정보 추가 아님. 화려함 아님. 이미 발생한 행동을 몸으로 읽히게 하는 단계.

- **transform 충돌 회피 구조** (핵심):
  - idle은 `.avatar`/`.monster`의 transform 점유, scale은 `.unit`의 transform 점유 → 같은 요소에 reaction 얹으면 충돌
  - `render.js`: 아바타를 `.fig-react` 래퍼로 감쌈 → `.unit`(scale) / `.fig-react`(reaction) / `.avatar`(idle) **세 요소가 각자 transform**, 곱연산으로 합성 (충돌 0)
  - `.fig-react { transform-origin: center bottom }` — 발밑 고정, 튀거나 밀려 보이지 않게
- **재구성 타이밍 해결**: `unit-layer`는 매 tick `innerHTML=""`로 재구성 → 행동 직후 클래스가 다음 렌더에서 소실
  - `playActionFx` → `reactUnit(targetInstanceId, isHeal)`가 `requestAnimationFrame`으로 **renderGame 이후** 새 요소에 클래스 적용
  - reaction 0.32~0.5s ≪ tick 1000ms → 다음 재구성 전 완료. `animationend`로 클래스 제거
- **hit 리액션** (`react-hit`, `@keyframes sig-hit` 0.32s): 좌우 ±2px 흔들림(순변위 0) + 짧은 brightness flash(최대 1.85) — 날카롭고 빠름
- **heal 리액션** (`react-heal`, `@keyframes sig-heal` 0.5s): scale 1→1.05 부드러운 pulse + 초록 `drop-shadow` glow(rgba 159,230,207) — 느리고 부드러움, hit과 결이 다름
- `prefers-reduced-motion`: reaction 정지 (idle과 동일 정책)
- **battle.js 무변경** — 전투 계산 로직 손대지 않음. HP바/이름 제거 구조 유지
- 변경 파일: `src/ui/render.js`, `src/ui/styles.css`, `DEVLOG.md`, `NEXT.md`
- 검증 (프리뷰, MutationObserver):
  - hit: 적(goblin/slime/wolf) + 아군(warrior 피격) 모두 react-hit 발동 ✓
  - heal: 사제→전사 회복 시 react-heal 발동(로그 "+12" 일치) ✓
  - hit/heal 클래스 매핑 정확, idle 위에서 튐 없이 제자리 복귀 ✓
  - 행동선/숫자/HP바와 충돌 없음 ✓ / 콘솔 0
- **push 완료 (commit c7535c4) / 나라님 모바일 PASS (2026-06-09)**

---

### Combat HUD 01a — 전투 텍스트 노이즈 제거 + 아바타 방향 규칙 1차 완료

> 전투 화면을 아바타 + HP바 중심으로. 직업/몬스터 이름·HP 숫자 텍스트 제거.

- **이름/HP 숫자 텍스트 제거** (`render.js createFieldUnit`):
  - `.name`(직업/몬스터명) / `.hp`(`80/80` 등 숫자) span 삭제 → 아바타 + HP바만
  - 근거: 실루엣으로 정체성 전달 / 로컬라이즈 시 이름 길이가 전장 가리는 위험 차단 / HP바·피해숫자 있으므로 HP 숫자 중복
  - 접근성용 이름은 `aria-label`로만 보존 (시각 노이즈 0, 스크린리더 유지)
  - `styles.css`: `.unit .name` / `.unit .hp` 스타일 제거, `.unit min-height 88→74`로 축소
- **HP바 재정렬** (`styles.css`): 텍스트 사라진 자리 → 아바타 바로 아래. `width 78%` 중앙 정렬, `margin 5px auto 0` (발밑에서 살짝 띄움). HP바 자체 유지
- **아바타 facing 규칙 1차** (방향 단일 진입점 확립):
  - `render.js`: 아군 `.face-ne`(우상단 향함) / 적 `.face-sw`(좌하단 향함) 클래스 부여
  - 규칙: 전투 구도 = 아군 좌하단 / 적 우상단. team이 아니라 **facing 클래스**로 무기·시선 제어 → 미래 상대 진영 영웅(아군 직업이나 SW 향함) 표현 가능
  - `styles.css` Avatar Facing 블록 + 주석으로 규칙 문서화
  - 1차 시각 조정 (큰 재작업 금지, 부위 미세 조정만):
    - 전사: 방패 `left -1px → right -1px`(전방=적 방향), `rotate -7→8deg` — 우상단 막는 자세
    - 궁수: 화살 `rotate -14→-21deg` — NE 적 고도로 더 세움
    - 사제: 지팡이 이미 우측(NE) → 조정 없음
  - `face-sw` 좌우반전 variant는 **Avatar Facing 01** 후보로 분리
- **battle.js 무변경** — 전투 계산 로직 손대지 않음
- 변경 파일: `src/ui/render.js`, `src/ui/styles.css`, `DEVLOG.md`, `NEXT.md`
- 검증 (프리뷰): 이름/HP 숫자 0개(aria-label만 보존), 화면 조용해짐 ✓ / HP바만으로 체력 읽힘(고블린 감소·슬라임 dead 숨김) ✓ / HP바 아바타 안 가림 ✓ / 전사 방패 우측·궁수 화살 NE 확인 ✓ / 콘솔 0
- **push 완료 (commit d12e9fc) / 나라님 모바일 PASS (2026-06-09)**

---

### Combat HUD 01 — HP바 최소 시각화 완료

> 전투 중 "누가 얼마나 버티는지" 읽기 위한 최소 HP 게이지. 속도 게이지 없음, 전장 분위기 유지.

- **구조**: `createFieldUnit()`에 `.hp-bar > .hp-bar-fill` 추가. width = `(unit.hp / unit.maxHp * 100).toFixed(1)%` inline style
- **스타일**:
  - 트랙: `height 3px`, `border-radius 2px`, `background rgba(255,255,255,0.06)` — 존재감 최소
  - 아군 fill: 차가운 teal `rgba(100,192,200,0.58)` / 적 fill: coral `rgba(220,108,88,0.54)`
  - 사망 유닛: `.unit.dead .hp-bar { opacity: 0 }` — 바 숨김
- **배치**: `.hp` 숫자 아래 → 캐릭터 실루엣·이름·숫자·행동선·피해 숫자와 겹침 없음
- **scale 반영**: 아군 1.2배(rendered 74px) / 적 1.04배(rendered 64px) 자동 적용
- **battle.js 변경 없음** — 전투 계산 로직 무변경
- 변경 파일: `src/ui/render.js`, `src/ui/styles.css`
- 검증 (프리뷰): 전사 86/120 teal 감소 / 고블린 46/60 coral 감소 / 슬라임 dead 바 숨김 / 전사·궁수·늑대·사제 full bar ✓. console error 0건
- **push 완료 (commit d12e9fc) / 나라님 모바일 PASS (2026-06-09)**

---

### Action Feedback 01 — source → target 행동선 / 피격 / 숫자 최소 이식 완료

> 기준: `presentation-lab/action-line-rnd-03-5.html`. FX 완성 아님, source→target 문법 1차 검증.

- **구조**: 전투 계산과 분리된 FX 이벤트. `battle.js` → `playActionFx({sourceInstanceId, sourceUnitId, targetInstanceId, lineType, isHeal, amount})` 호출
  - `index.html`: `#fx-layer` 추가 (tick 재렌더에 안 지워짐, FX는 animationend로 self-remove)
  - `render.js`: `playActionFx` export + 헬퍼(spawnLine/spawnPulse/spawnNumber)
  - 좌표는 **하드코딩 아님** — 실제 유닛 `getBoundingClientRect()`에서 anchor 비율로 계산 (밴드 offset/스케일에 안정적)
- **anchor 구조** (확장 가능): `SOURCE_ANCHORS`(archer=bow / priest=staff / warrior=weapon / wolf=snout / slime·goblin=body) + target hit(중앙) / heal(상단)
- **행동선** = source anchor에 left/top, width=거리, `rotate(atan2)`로 target 지향 (transform-origin: left center)
  - 궁수 `--straight` (연두 얇은 직선 + 화살촉)
  - 사제 `--heal` (초록 부드러운 선)
  - 전사 `--slash` (금색 connector + 베기 arc, 원거리 투사체처럼 안 보이게 낮게) — WATCH
  - 적/늑대 `--enemy` (붉은 낮은 trail + claw)
- **피격 pulse**: target 주변 14px 원, 화면 흔들림 없음
- **피해/회복 숫자**: 피해 `-N`(빨강) / 회복 `+N`(초록) float. 같은 대상 700ms 내 중복 시 `--queued`(0.12s 지연 + 우상단 offset)
- **battle.js 변경**: `performAttack`/`performHeal` 끝에 FX 이벤트 호출 + `attackLineType()` 헬퍼만 추가. **전투 계산 로직(데미지/타겟팅/사망/회복) 무변경**
- 변경 파일: index.html, src/core/battle.js, src/ui/render.js, src/ui/styles.css, DEVLOG.md, NEXT.md
- **push 완료 (commit 8667da6) / 나라님 모바일 PASS (2026-06-09)**

---

### Party Formation Spread — 아군 진영 2x2 공간 확장 정돈 완료

> 좌표 정돈만. 기능/로직/battle.js 무변경, push 없음.

- `src/ui/styles.css` 아군 좌표만 재배치 (전열2/후열2 가상 anchor 기반, 진영 폭·높이 확대):
  - front-left 전사: `left 14→8 / bottom 30→26` (좌측 벽 근접)
  - front-right 궁수: `left 118→128 / bottom 18→46` (우측으로 크게 벌림)
  - back-left 사제: `left 50→44 / bottom 134→152` (후열 중앙-좌, 높게)
  - back-right(4번째) 가상 anchor ≈ left 168 / bottom 174 — 비표시, 공간만 암시
- 효과: 캐릭터 간 간격 확대 → 행동선/숫자/HP/속도/버프/스킬 텍스트 붙을 여유 확보
- 적 진영/중앙 대각 lane 유지, 3명 기준에서도 4인 파티 진영(back-right 빈자리) 읽힘
- 검증 (프리뷰): 타이틀→전투 배치 확인, 콘솔 0, Flow 무영향
- **push 완료 (commit 8667da6)**

---

### Battle Screen Shell 01 — 타이틀/전투/결과 Flow + 전투 화면 비율 정돈 완료

> 기능 확장 아님. 모든 전투 연출/정보 UI가 올라갈 전투 화면 Shell/Flow/비율 확정.

- **Flow 구성**: `타이틀 → 전투 → (성장) → 결과` 분리
  - `state.js`: `screen` 초기값 `"battle"` → `"title"`
  - `battle.js`: `startRun()`(타이틀→스테이지1 새 런+자동 전투), `goTitle()`(전투/결과→타이틀 복귀) 추가. 기존 전투 로직/타겟팅/성장/스테이지 무변경
  - `index.html`: `#title-screen`(제목/태그라인/시작 버튼) 추가
- **하단 UI 제거**: `#battle-log`(하단 고정 로그) + `#bottom-panel`/`#start-button`(상시 버튼) 완전 제거 → 전투 영역으로 환원
  - "전투 시작"은 타이틀 `시작` 버튼으로 이동, 진입 시 자동 전투
  - 전투 중 하단 액자 0
- **로그 재배치**: 하단 로그 영역 폐지 → `#log-overlay` 최근 2줄만 전장 좌상단(빈 대각 코너)에 약하게 오버레이 (pointer-events:none)
- **결과 오버레이**: `#result-overlay` — 전투 종료(clear/defeat)에서만 노출
  - clear: "전체 클리어!" + [처음부터][타이틀로]
  - defeat: "전투 패배..." + [다시 시작][타이틀로]
  - victory(중간 스테이지)는 기존대로 성장 화면으로
- **상단 HUD 유지·정리**: Stage / status 유지, 우측에 `#hud-right`(status + `타이틀` 버튼) — 향후 속도옵션/로그/설정 들어갈 구조
- **전투 영역 확대 + 캐릭터 확대**:
  - `#unit-layer` 밴드 470px → 560px (하단 UI 제거분 환원)
  - 아군 scale 1.06 → 1.2, 적 0.94 → 1.04
  - 좌표 더 넓게 재배치 (아군 전열2/후열2 사선 + 4번째 자리 여백, 적 간격 확대)
- **변경 파일**: index.html, src/core/state.js, src/core/battle.js, src/core/main.js, src/ui/render.js, src/ui/styles.css
- **battle.js 변경**: Flow 함수 2개(startRun/goTitle) 추가만. 전투 계산 로직 무변경
- 검증 (프리뷰): 타이틀→시작→자동 전투, 로그 오버레이 2줄, 슬라임 사망 처리, 결과 오버레이 로직(eval) 정상, 콘솔 0
- **push 완료 (commit 8667da6) / 나라님 PASS (2026-06-09)**

---

### Battle Screen Baseline 01 Lock — 전장 공간 / 배경 / idle 정돈 완료

> 기능 추가 아님. 향후 HP바/속도게이지/피해·치유 숫자/버프/스킬 텍스트/행동선/피격이
> 올라갈 "기본 무대 공간"을 잠그는 정돈 작업.

- **배경 단순화** (`src/ui/styles.css` `#battle-field`):
  - 강한 사선 빛/다층 그라디언트 제거 → 거의 검은 딥네이비(`#0a0d14`) + 아주 약한 시그널식 격자(30px, rgba(120,150,190,0.04))
  - B안(격자) 채택. A안(완전 단색)은 `background-image: none` 한 줄로 토글 가능
  - `#battle-field::before`: 사다리꼴 강한 빛 → 중앙 세로 약한 발광(공허함 방지, 행동선 무대 암시)
  - 결과: 캐릭터 실루엣이 배경보다 먼저 읽힘
- **유닛 무대 밴드** (`#unit-layer`): `inset:0` → 화면 중앙 세로 고정 밴드 `height: min(100%, 470px)`, `top:50% translateY(-50%)`
  - 배경은 화면 전체를 채우되, 캐릭터 구도는 화면 높이와 무관하게 일정하게 유지
- **진영 공간 확장** (좌표 재배치):
  - 아군: 전열2(전사 좌·궁수 우) / 후열(사제 좌) — 후열 우측에 4번째 자리 여백 확보 (전열2/후열2 대비)
  - 적: 슬라임/고블린/늑대 간격 확대 — 향후 HP/속도/숫자/버프 붙어도 안 겹치게
  - 중앙 대각 lane 유지 (양 진영 너무 멀지 않게 조정)
- **공통 idle 재적용**:
  - `@keyframes sig-idle`: translateY -1.6px + scaleY 1.025, `transform-origin: center bottom` (발밑 고정 호흡감)
  - 캐릭터별 delay/duration 분산 (warrior 0 / priest -0.7 / archer -1.2 / slime -0.4(3s) / goblin -0.9(2.3s) / wolf -1.5) — 기계적 동기화 방지
  - 사망 유닛 idle 정지(`.unit.dead .avatar/.monster { animation:none }`), `prefers-reduced-motion` 대응
- **battle.js / 전투 로직 / 타겟팅 / 성장 / 스테이지 무변경**
- 검증 (프리뷰): 배경 격자 위 캐릭터 가시성↑, idle computed(sig-idle 2.6s, origin 발밑, 캐릭터별 delay) 확인, 콘솔 0
- **push 완료 (commit 3af4075)**

---

### Battle Screen Baseline 01 — 루다 기본 대치 화면 본게임 이식 완료

> 기존 unit-card 구조를 살리는 작업이 아니라, 기본 전투 화면 기준을 새로 잡는 작업.
> 기준 파일: `presentation-lab/monster-battlefield-mockup.html`, 장면 "1. 기본 대치"

- **구조 전환**: `unit-card` 슬롯 UI 폐기 → `.field` 위 absolute 좌표 배치 `.unit > .avatar/.monster > .part`
- `index.html`: `#battle-field` 내부를 `team-label` 2개 + `#unit-layer`로 교체 (`enemy-side`/`party-side` 제거)
- `src/ui/render.js`:
  - `createUnitCard()` → `createFieldUnit()` 전면 교체
  - `AVATAR_PARTS` 맵 — id별 파츠 목록 (warrior 6 / priest 6 / archer 7 / slime 5 / goblin 8 / wolf 10)
  - 아군 `.avatar`, 적 `.monster`, `${id}-pos` 좌표 클래스, dead 클래스
  - 이름 + HP를 캐릭터 아래 보조 정보로 (`.name` 10px / `.hp` 9px)
  - 합류 예정 슬롯은 기본 대치 화면에서 비표시 (Phase 9 슬롯 작업에서 재검토)
- `src/ui/styles.css`: 전투 영역 CSS 전면 교체 (시안 CSS 그대로 이식, `#battle-field` 스코프)
  - `#battle-field` = 어두운 전장 (다층 그라디언트), `flex:1`, `min-height:360px`, `overflow:hidden`
  - `#battle-field::before` = 중앙 원근 사다리꼴 빛 (행동선 공간)
  - `.unit.party { scale(1.06) }` / `.unit.enemy { scale(0.94) }` — 약한 원근감
  - 좌표: 아군 좌하단 / 적 우상단 (warrior/priest/archer/slime/goblin/wolf 6좌표)
  - 공통 파츠 (shadow/base/stance/body/head/aura) + 직업별 (전사 방패 / 사제 지팡이+오라 / 궁수 활+화살) + 몬스터별 (슬라임 물방울 / 고블린 귀+머리 / 늑대 옆모습+꼬리+다리)
  - 발밑 그림자(shadow/base)로 접지감 유지
  - 기존 `.unit-card`, `.unit-avatar--*`, `#enemy-side`, `#party-side`, `.slot-pending`, `avatar-bob` 전부 제거
- **battle.js / 전투 로직 / 타겟팅 / 성장 / 스테이지 무변경**
- 검증 (프리뷰):
  - 전장 위 6캐릭터 직접 배치 / 카드 UI 없음 ✓
  - 사망 시 dead 클래스 (opacity 0.4 + grayscale) ✓
  - Stage 1 → 성장(공격 +1) → Stage 2 정상 전환, 6유닛 재배치 ✓
  - 모든 스테이지 동일 6캐릭터(미지 id 없음) 확인 → 좌표 하드코딩 안전
  - 콘솔 에러 0
- idle: 기본 대치(정지 화면) 충실 위해 이번 baseline에서는 미적용 (후속에서 재검토)
- **push 안 함 / 나라님 모바일 확인 대기**

---

### Phase 8.4b — 루다 아바타 파츠 본게임 이식 / 원형 아이콘 구조 탈피 완료

- `src/ui/render.js`: `createUnitCard()`에 `<div class="avatar-fig"></div>` 추가 — 파츠 레이어
- `src/ui/styles.css`: 아바타 섹션 전체 교체 (Phase 8.3/8.4 구조 → 8.4b 구조)
  - **인간형 (전사/사제/궁수)**: 컨테이너 투명, `avatar-fig::before` = 몸통, `avatar-fig::after` = 머리, `container::before` = 무기
    - 전사: 파란 갑옷 몸통 + 헬멧 머리 + 빛나는 사선 검
    - 사제: 좁은 로브 몸통 + 머리 + 왼쪽 지팡이 발광 (`box-shadow` 상단 글로우)
    - 궁수: 슬림 몸통 + 머리 + 오른쪽 활 호형 (`border-radius` arc)
  - **몬스터 (슬라임/고블린/늑대)**: 얼굴/몸체 형태 유지, `avatar-fig::before` = 눈, `::after` = 세부
    - 고블린: 큰 귀 (`rotate(-28deg)/rotate(28deg)`) + 눈 box-shadow
    - 늑대: 큰 귀 + 호박색 눈 (`#d4b880`) + 주둥이 힌트 타원
    - 슬라임: 물방울 형태 + 눈 + 광택 하이라이트
- battle.js 무변경
- idle 2.0px 유지 (구조 변경에도 자연스럽게 동작)
- Stage 1 전투 시작 / 유닛 배치 / 합류 예정 정상 확인
- 콘솔 에러 없음 확인
- **나라님 모바일 확인 대기**

---

### Phase 8.4a — 루다 mockup 감성 회복 / 전장형 아바타 배치 완료

- `src/ui/styles.css`:
  - **카드 패널감 ↓↓**: `.unit-card.party` bg `rgba(30,58,95,0.72)` → `rgba(20,40,68,0.26)` / border opacity `0.55` → `0.16`
  - `.unit-card.enemy` bg `rgba(59,26,26,0.72)` → `rgba(48,16,16,0.26)` / border opacity `0.55` → `0.16`
  - border-radius `6px` → `4px` — 카드 느낌 약화
  - **아바타 크기 ↑**: party `28px` → `44px` / enemy `22px` → `32px` / base `26px` → `38px`
  - **텍스트 보조화**: `.unit-name` 13px bold → 11px weight500 / `.unit-role` 10px → 9px / `.unit-hp` 11px → 10px / card gap `3px` → `2px`
  - **idle bob 약화**: 2.5px → 2.0px (오래 봐도 산만하지 않은 강도)
  - **궁수 심볼 clip-path 변환**: border-trick(px) → `clip-path: polygon` 비율 방식으로 — 아바타 크기에 무관하게 자동 스케일
  - **슬라임 눈 크기별 오버라이드**: enemy(32px)/party(44px) 각각 box-shadow offset 조정
- render.js / battle.js 무변경
- party 44px 아바타 확인 (JS computed style 검증)
- dead 유닛 idle 없음 / fade 정상 확인
- 합류 예정 슬롯 조용히 유지 확인
- 콘솔 에러 없음 확인
- **나라님 모바일 확인 대기**

---

### Phase 8.4 — 아바타 polish + 공통 idle 1차 완료

- `src/ui/styles.css`:
  - `@keyframes avatar-bob`: 0%→45%→100% 상하 2.5px bob idle 정의
  - `.unit-avatar` 베이스에 `animation: avatar-bob infinite` 공통 적용
  - 캐릭터별 박자 분산 — duration 2.0s~3.0s / delay 음수값으로 즉시 mid-cycle 시작
    - 전사 2.4s/0s / 사제 2.8s/-0.7s / 궁수 2.2s/-1.1s
    - 슬라임 3.0s/-0.4s / 고블린 2.0s/-0.9s / 늑대 2.6s/-1.5s
  - dead 유닛 / 합류 예정 슬롯 — idle 없음 (animation: none)
  - `prefers-reduced-motion: reduce` — idle 전체 제거
  - **Phase 8.4 몬스터 얼굴 polish** (small-size readability):
    - 슬라임: `::before` 재활용 → 작은 눈 2개 (3.5px, box-shadow로 오른쪽 눈) 양쪽 넓게
    - 고블린: `background: radial-gradient` 레이어 2개로 눈 추가 — `::before/::after` 귀 유지
    - 늑대: `background: radial-gradient` 레이어 2개로 눈 추가 — `::before/::after` 귀 유지
    - 눈 간격: 고블린 30%↔70%, 늑대 32%↔68% — 가운데 몰림 방지
- render.js / battle.js 무변경
- 6종 idle animation 적용 확인 (JS computed style 검증)
- 합류 예정 슬롯 idle 없음 확인
- Stage 1 → 성장 → Stage 2 → Stage 3 흐름 유지 확인
- 콘솔 에러 없음 확인
- **나라님 모바일 확인 대기**

---

### Phase 8.3 — 전장 아바타 표시 구조 1차 완료

- `src/ui/render.js`: `createUnitCard()`에 `<div class="unit-avatar unit-avatar--{id}">` 추가
- `src/ui/styles.css`: `.unit-avatar` 베이스 + 6종 CSS-only 심볼 아바타
  - 전사: 파란 원 + 검 십자 / 사제: 보라 원 + 회복 십자 / 궁수: 초록 원 + 화살촉
  - 슬라임: 하늘 물방울 + 하이라이트 / 고블린: 황록 원 + 뾰족 귀 / 늑대: 회색 원 + 뾰족 귀
- 적 아바타 22px / 아군 아바타 28px (CSS selector 오버라이드)
- 외부 이미지 / canvas 없음, 교체 가능한 클래스 기반 구조
- 전투 진행 / HP 감소 / DEAD / 전투 로그 정상 확인
- 합류 예정 슬롯 유지 확인
- 콘솔 에러 없음 확인
- **나라님 미리보기 확인 대기**

---

### Phase 8.2 — 세로형 약원근 대각 전장 레이아웃 완료

- `src/ui/styles.css`:
  - `#battle-field`: `position: relative`, `gap: 0`, padding 조정
  - `#battle-field::before`: 대각 그라디언트 pseudo-element — 중앙 통로 암시 (z-index 0)
  - `#enemy-side`: `justify-content: flex-end` — 적 진영 우상단 정렬
  - `#party-side`: `padding-left: 8px` — 아군 진영 좌하단 유지
  - `.unit-card` 베이스: `width: auto`, `min-width: 68px`
  - `#enemy-side .unit-card`: `width: 76px`, padding/font 축소 — 먼 느낌
  - `#party-side .unit-card`: `width: 100%`, padding 확대 — 가까운 느낌
- render.js / battle.js 무변경
- scale/transform 없음 — 좌표/크기 규칙으로만 구현
- 슬라임 DEAD, 전사 HP 감소, 로그 정상 확인
- 2×2 슬롯 / 합류 예정 / 파티 강화 현황 유지 확인
- 콘솔 에러 없음 확인
- **나라님 미리보기 확인 대기**

---

### 문서 구조 추가 — 공방일지 / 결정 기록

- `WORKSHOP_DIARY.md`: 나라님 공방 개발 여정 기록 (기준점 날만 짧게 작성)
- `docs/DECISIONS.md`: 설계 판단 결정 기록 (무엇을 왜 결정했는가 중심)
- 2026-06-09 기준 초기 기록 포함

---

### Phase 8.1 — 아군 2×2 슬롯 그리드 + 4번째 합류 예정 슬롯 완료

- `src/ui/render.js`: `renderUnits()` — party 3명 순서대로 slot 0~2 배치, `createPendingSlot()` 추가 (slot 3, "합류 예정")
- `src/ui/styles.css`: `#party-side` flex-row → grid 2×2, `.unit-card` width 100%/max-width 160px, `.slot-pending` / `.slot-pending-label` 스타일 추가
- 슬롯 매핑: party[0]=전사(0) / party[1]=사제(1) / party[2]=궁수(2) / slot 3=합류 예정
- battle.js 전투 로직 무변경
- state.js unit.slotIndex 미추가 (Phase 9 시점에 확정 예정)
- 기존 HP 표시 / 성장 선택 / 파티 강화 현황 표시 유지 확인
- 전투 진행 / Stage 클리어 / 성장 선택 흐름 정상 확인
- 콘솔 에러 없음 확인
- **나라님 미리보기 확인 대기**

---

### Phase 7.8 — 파티 강화 현황 표시 완료

- `index.html`: `#party-bonus` 요소 추가 (top-hud 아래)
- `src/ui/render.js`: `renderPartyBonus(bonuses)` 추가 — 보너스 없으면 hidden, 있으면 "파티 강화: 공격 +N · 최대 HP +N" 표시
- `src/ui/styles.css`: `#party-bonus` 스타일 — 11px, 노란빛(#f0c040), top-hud 아래 한 줄 띠
- 표시 규칙: atk > 0 → `공격 +N`, maxHp > 0 → `최대 HP +N`, 둘 다 0 → hidden
- 패배/처음부터 → `resetBattle()` bonuses 초기화 → 표시 사라짐 확인
- 콘솔 에러 없음 확인
- **push 완료 (이번 commit)**

---

### Phase 7 + 7.5 — 성장 선택 구조 및 가독성 정리 완료

- `src/core/state.js`: `run.bonuses { atk, maxHp }` 추가, `createInitialParty(bonuses)` 반영, version `v0.1-phase7`
- `src/core/battle.js`: `applyGrowth()` export, 승리 시 `screen = "growth"` 전환, `resetBattle()` bonuses 초기화, 로그 "성장 선택: 공격 훈련 — 파티 공격력 +1" 형식
- `src/core/main.js`: `applyGrowth` import, 성장 버튼 이벤트 연결
- `src/ui/render.js`: `renderGrowthPanel()` 추가, screen 분기, subtitle 렌더링
- `src/ui/styles.css`: `[hidden] { display: none !important }`, growth-panel 스타일, subtitle 스타일
- `index.html`: battle-view / growth-panel 구조 분리, growth-subtitle 요소 추가
- 콘솔 에러 없음 확인
- **push 완료 (commit 946bcbe)**

---

### Phase 6 + 6.5 — 기본 직업 스킬 및 전투 로그 정리 완료

- `src/core/battle.js`:
  - selectArcherTarget() 추가 — HP 가장 낮은 적 우선 타겟
  - performAction() 궁수 분기 추가
  - josa() 헬퍼 추가 — 이/가, 을/를 받침 기준 자동 처리
  - attackVerb() 추가 — 전사 "베었다" / 궁수 "저격했다" / 그 외 "공격했다"
  - 모든 전투 로그 조사 보정 적용
  - 사제 회복 로그 "(+N)" 형식 적용
  - 전투 종료 로그 2줄 → 1줄 통합 ("클리어! ▶ 다음 스테이지" 등)
- `src/ui/render.js`: 로그 컨테이너 자동 스크롤 하단 고정
- 콘솔 에러 없음 확인
- **push 완료 (commit 3f7b3fd)**

---

### Phase 5 — 스테이지 진행 구조 최소 구현 완료

- `src/core/state.js`: `run.maxStage` 1 → 3, `version` → `"v0.1-phase5"`, 초기 로그 갱신
- `src/core/battle.js`:
  - `resetBattle()`: `run.stage` 1로 리셋 추가, 로그 문구 갱신
  - `advanceStage()` 신규 export: stage+1, 아군 완전 재생성(완전 회복), 적 재생성, 자동 전투 시작
  - `checkBattleEnd()`: 승리 시 `stage < maxStage` → result `"victory"` / `stage === maxStage` → result `"clear"` 분기
- `src/core/main.js`: `advanceStage` import 추가, 버튼 클릭 분기 — victory → `advanceStage()` / 그 외 → `resetBattle() + startBattle()`
- `src/ui/render.js`: `renderButton()` — result `"victory"` → "다음 스테이지" / `"clear"` → "처음부터" / `"defeat"` → "다시 시작"
- 콘솔 에러 없음 확인
- **아직 push 안 함 — 나라님 로컬 확인 후 승인 대기**

---

## Push 상태 요약

| Phase | push 여부 |
|---|---|
| Phase 0 ~ 4.5a | 완료 (commit 96953a3) |
| Phase 5 | 완료 (commit f467b24) |
| Phase 6 + 6.5 | 완료 (commit 3f7b3fd) |
| Phase 7 + 7.5 | 완료 (commit 946bcbe) |
| Phase 7.8 | 완료 (이번 commit) |
