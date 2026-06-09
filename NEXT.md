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
Phase 7.8 push 완료 (이번 commit).

---

## 다음 작업 후보

1. **Phase 8 — 4인 파티 슬롯과 전장 배치 기초** (후보명, 유키/나라님 확정 대기)

   > 아직 구현 지시 아님. 루다 presentation-lab polish 결과 확인 후 범위 확정 예정.

   ### 확인된 방향 후보 (유키 메모 2026-06-09)

   **파티 구성**
   - 기준: 4인 파티 완성형
   - 초반 3인 시작 가능, 4번째 슬롯은 "합류 예정" 감성으로 표현 후보

   **진영 구조**
   - 전열 2칸 / 후열 2칸 기본 배치
   - 직업 전열/후열 고정 방식 지양 — 모든 직업 어느 슬롯에도 배치 가능 방향
   - 전열/후열은 금지가 아닌 위험과 효율을 만드는 장치로 활용

   **전장 표현**
   - 상/하 분할보다 **사선형 구도** 유력 (루다 Battlefield Layout Prototype 01 실험, 나라님 반응 긍정적)
   - 모바일 390px에서 전장이 더 넓어 보임, 중앙 행동선 경로 생김

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
