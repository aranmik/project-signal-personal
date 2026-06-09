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
