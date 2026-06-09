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

## Push 상태 요약

| Phase | push 여부 |
|---|---|
| Phase 0 ~ 2 | 완료 |
| Phase 2.5 ~ 3.5 | **미완료 — 나라님 승인 대기** |

---

다음 목표: Phase 4 — 자동전투 1차 구현 (다음 세션)
