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
Hit Reaction 01 + Combat Tempo 01 push 완료 (commit TBD).

---

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
   - 캐릭터별 개성 idle / 실루엣 polish
   - slotIndex / 4번째 캐릭터 / 합류 예정 슬롯 재도입은 Phase 9 이후
   - (완료: 피격/회복 리액션 Hit Reaction 01, 속도게이지 Combat Tempo 01)

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
