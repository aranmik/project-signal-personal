# NEXT — Project Signal Personal

Project ID: SIGNAL_PERSONAL
Project Name: Project Signal Personal
Status: active
Scope: 세로형 모바일 HTML/PWA 자동전투 개인 작업물

---

## 현재 상태

Active 개발 프로젝트: SIGNAL_PERSONAL 하나뿐이다.
Phase 0 ~ 5 push 완료 (commit f467b24).
Phase 6 + 6.5 push 완료 (commit 3f7b3fd).
Phase 7 + 7.5 push 완료 (commit 946bcbe).
Phase 7.8 ~ 8.3 push 완료 (commit 87d1467).
Battle Screen Baseline 01 + Lock push 완료 (commit 3af4075).
Shell 01 + Formation Spread + Action Feedback 01 push 완료 (commit 8667da6) — 나라님 모바일 PASS (2026-06-09).
Combat HUD 01 + 01a push 완료 (commit d12e9fc) — 나라님 모바일 PASS (2026-06-09).
Hit Reaction 01 + Combat Tempo 01 push 완료 (commit c7535c4) — 나라님 모바일 PASS (2026-06-09).
Tempo Smooth 01 (전투 흐름 끊김 진단·완화: 유닛 DOM reconcile + idle 연속 + tempo 보간) push 완료 (commit ccb8039) — 나라님 모바일 PASS (2026-06-09). **Living Battle Screen 01 기준점.**
Party Join 01 (4번째 동료 수호자 합류 — 2x2 완성) + Battle Speed 01 (1x/2x 배속) + Combat Feel Polish 01 (기본 호흡 500ms·게이지 폭/색 통일·행동선 SVG 곡선) push 완료 (commit 4d3a501) — 나라님 모바일 PASS (2026-06-10). **Living Battle Screen 02 기준점.**
  · 기본 호흡: 1x=500ms / 2x=250ms · HP=빨강·속도=파랑(폭 동일) · 행동선=SVG 곡선+그라데이션+화살촉+느린 fade.
Action Line Variety 01 (행동선 경로/성격 다양화 — 타입별 변주) + Action Emphasis 01 (Source Actor Acting Cue — 행동자 선언) + Combat Breath Preview 01 (배속 3x/4x/MAX + 프리뷰 장면 3종) push 완료 (commit 1a8c0ac) — 나라님 별도 승인 후 묶음 push (2026-06-10), 모바일 Pages 확인 예정. **Living Battle Screen 03 기준점(확인 대기).**
  · 행동선: 궁수=직선+화살촉 / 전사=호+베기컷 / 사제=점선+입자 / 몬스터=거친 점선+갈퀴.
  · acting cue: 행동 직전 발밑 고정 scale pop으로 "나야 지금!" → 선 → 반응. 시선 acting>line>reaction>idle.
  · 프리뷰(개발용): 배속 1x~MAX(60ms floor), #preview-bar 다수전(6체)/정예(2+3)/보스(1체). 전투 계산/정식 시스템 무변경.
  · 배속 1x→2x→3x→4x→MAX(안전 상한 60ms floor) 순환, tempo는 --tick 변수로 정합. 프리뷰: 다수전(6체)/정예혼합(정예2+일반3)/보스단독(1체). #preview-bar로 선택, 프리뷰는 종료해도 battle 화면 유지. 전투 계산/정식 시스템 무변경. (WATCH: 백그라운드 스로틀로 MAX 실속도는 모바일 포그라운드에서 최종 확인)
Living Battle Screen 04 (Diagonal Formation + Curved Action Space) push 완료 (commit a7dea46, 나라님 직접 commit+push 2026-06-10) — 모바일 확인 후 04A로 이어짐.
  · 핵심: "유닛은 양 끝으로 물러나고, 중앙은 행동선의 무대가 된다." 아군 좌하단 사선 진형 / 적 우상단 / 중앙 비움.
  · 기본 속도 2x. melee slash 곡률 강화(bowMax 36→82, 바나나슛 — 우하 빈 공간 경유). 궁수 직선·사제 부드러움·몬스터 거침 대비 유지.
  · 보스 scale 2.8 우상단(클리핑 없음). battle.js/전투계산/정식 시스템 무변경.
Living Battle Screen 04A (Asymmetric Field Partition + Formation Layout) + Micro Polish(영웅 하단/우하단 우측 보정) push 완료 (commit 3431261 "feat: refine asymmetric battle field", 나라님 승인 2026-06-10) — 모바일 확인. **현재 전장 구도 기준점.**
  · 핵심: "전장은 상하로 나뉘고, 적은 상단 우측 70 / 아군은 하단 좌측 60 영역을 넓게 사용. 구석 정렬 아닌 영역 활용." 최우선=구도/호흡.
  · 좌표계 unit-layer 390×560. 적=상단절반(top0~280)·우측70(x≥117) spread / 아군=하단절반·좌측60(x≤234) 사선 spread. 중앙 mid밴드=행동선 통로(허전하지 않게).
  · 속도 UI 단순화: SPEED_STEPS=[2x,MAX](1x/3x/4x 제거). 보스 우측70 영역 장악(클리핑 없음). 행동선/battle계산/정식 시스템 무변경.
  · Micro Polish: 전사 left2→34 / 수호자 left100→130(우측 보정), 좌측60 영역·사선 유지.
Combat Lifecycle Polish 01 (Death Exit / Field Cleanup / Victory Finish / FX Density Guard) 완료 — 나라님이 직접 최종 확인 후 push 예정.
  · 핵심: "쓰러진다 → 전장에서 정리된다 → 전투가 끝난다." 행동·피격·사망·정리·승리를 하나의 호흡으로.
  · Death: HP0 → .dying(무너짐+fade+dust, 0.5s/MAX 0.34s) → DOM 제거. dyingUnits/cleanedDead Set, reconcile 자동 복구(스테이지 재사용 안전).
  · Victory Finish: 마지막 사망 후 짧은 호흡(2x 640ms/MAX 420ms) 뒤 growth/결과 전환(checkBattleEnd→scheduleFinish). preview는 battle 유지.
  · FX Guard: 라인≤7/숫자≤8 상한, MAX 단축, dying 유닛 hit 반응 생략. 전투 계산식·reconcile·tick 구조 무변경.

## 화면 Flow (Shell 01 확정)

타이틀(시작) → 전투(자동) → 승리 시 성장 선택 → 다음 스테이지 → 최종 클리어/패배 시 결과 오버레이(처음부터·다시 시작 / 타이틀로)

- 하단 로그/버튼 영역 제거, 로그는 좌상단 2줄 오버레이
- 상단 HUD: Stage / status / 타이틀 버튼 (향후 속도옵션·설정 자리)
- 전투 영역 확대(밴드 560), 아군 1.2배 / 적 1.04배

---

## 다음 작업 후보

1. **Avatar Facing 01** (Combat HUD 01a에서 분리) — face-sw 좌우반전 variant
   - 01a에서 `.face-ne`/`.face-sw` 클래스 규칙 + 아군 전사/궁수 1차 조정만 완료
   - 남은 작업: 적/상대 진영 아바타가 SW(좌하단)를 실제로 향하도록 좌우반전 variant
   - 아바타 부위 단위 facing 정밀화 (시선/무기/자세)

2. **무대 잠근 뒤 기능 단계** — Action Feedback 01 기준점 이후
   - 버프/디버프 표시 (유키 판단 후 신중히)
   - 캐릭터별 개성 idle / 실루엣 polish (수호자 포함 4인)
   - 2x 배속 FX 과밀 후속 조정(WATCH): fx-number 등 duration 배속 연동 검토
   - slotIndex / 합류 예정 슬롯 연출은 Phase 9 이후 (4번째 동료 자체는 Party Join 01에서 합류 완료)
   - (완료: 피격/회복 리액션 Hit Reaction 01, 속도게이지 Combat Tempo 01, 4번째 동료 Party Join 01, 배속 Battle Speed 01)

   > 무대를 먼저 잠근 뒤 기능. 다음 범위는 나라/유키 판단 후 확정.

   ### 확인된 방향 후보 (유키 메모 2026-06-09)

   **파티 구성**
   - 기준: 4인 파티 완성형
   - 초반 3인 시작 가능, 4번째 슬롯은 "합류 예정" 감성으로 표현 후보

   **진영 구조**
   - 전열 2칸 / 후열 2칸 기본 배치
   - 직업 전열/후열 고정 방식 지양 — 모든 직업 어느 슬롯에도 배치 가능 방향
   - 전열/후열은 금지가 아닌 위험과 효율을 만드는 장치로 활용

   **전장 표현**
   - 카드형 상/하 분할은 Baseline 01/Shell 01에서 이미 탈출 완료 (absolute 좌표 배치)
   - 현재 구도: 아군 좌하단 / 적 우상단 대각 배치 (2×2 가상 anchor)
   - 추가 폴리싱 후보: 파티 4인 확장 대비 배치 재조정, 적 배치 정밀화

   **적 크기 점유**
   - 소형: 1칸 / 대형: 2칸 / 보스: 화면 전용 구도

   **행동선**
   - 얇고 조용하게, 읽힘 우선
   - 공격선 / 회복선 / 피격 반응 구분이 목표

---

## 새 기능 금지 (다음 세션 포함)

- 스킬 시스템 / 쿨타임 / 마나 / 광역 회복 / 상태이상 — Phase 6 이후
- 궁수·전사 고유 스킬 — Phase 6 이후
- 스테이지 진행 — Phase 5 이후
- 성장 선택 — Phase 7 이후
- R&D 코드 복사 / 빌드 도구 도입 금지

---

## 절대 하지 말아야 할 것 (다음 세션 포함)

- 전투 로직, 공격, 회복, 사망 판정 — 유키 설계 지시 전 금지
- 나라님 승인 없이 push 금지
- 한 번에 여러 Phase 동시 진행 금지
- 기존 R&D 코드/문서 복사 금지

---

## 다음 세션 시작 방법

렌은 작업 시작 전 아래 순서를 따른다.

1. CLAUDE.md 읽기
2. NEXT.md (이 파일) 읽기
3. DEVLOG.md 최근 항목 읽기
4. 필요한 경우 docs/06_CHARACTER_AVATAR_GUIDE.md 읽기
5. **미리보기 서버 시작** — `signal-personal` (C:\MCP\.claude\launch.json, 포트 3000)
   나라님이 오른쪽 패널에서 바로 확인/플레이 가능한 상태로 만든다.

읽은 뒤 바로 코드 수정하지 말고,
현재 상태를 나라님에게 요약 보고하고 승인 후 다음 작업을 시작한다.
