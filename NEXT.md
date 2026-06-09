# NEXT — Project Signal Personal

Project ID: SIGNAL_PERSONAL
Project Name: Project Signal Personal
Status: active
Scope: 세로형 모바일 HTML/PWA 자동전투 개인 작업물

---

## 현재 상태

Active 개발 프로젝트: SIGNAL_PERSONAL 하나뿐이다.
Phase 0 / 0.5 / 1 / 2 / 2.5 / 3 / 3.5 완료.
Phase 2.5 ~ 3.5 로컬 완료, **아직 push 안 함.**

---

## 다음 작업 후보

1. **Phase 2.5~3.5 묶음 commit/push** ← 다음 세션 시작 시 먼저 진행
   - commit 메시지: `feat: Phase 2.5-3.5 유닛 표시, 데이터 분리, 아바타 가이드`
   - 나라님 승인 후 진행

2. **Phase 4 — 자동전투 1차 구현**
   - battleTick() 함수
   - actionGauge += speed, 100 이상이면 행동
   - 아군 → 적 공격, 적 → 아군 공격
   - hp <= 0이면 dead = true
   - 모든 적 사망 시 승리, 모든 아군 사망 시 패배
   - 로그 출력
   - 유키 설계 지시 먼저 받기

3. **Phase 3.5 보강** (필요 시)
   - docs/06_CHARACTER_AVATAR_GUIDE.md 내용 보완

---

## 절대 하지 말아야 할 것 (다음 세션 포함)

- 전투 로직, 공격, 회복, 사망 판정 — 유키 설계 지시 전 금지
- 나라님 승인 없이 push 금지
- 한 번에 여러 Phase 동시 진행 금지
- 기존 R&D 코드/문서 복사 금지

---

## 다음 세션 시작 방법

렌은 작업 시작 전 아래 문서를 순서대로 읽는다.

1. CLAUDE.md
2. NEXT.md (이 파일)
3. DEVLOG.md 최근 항목
4. 필요한 경우 docs/06_CHARACTER_AVATAR_GUIDE.md

읽은 뒤 바로 코드 수정하지 말고,
현재 상태를 나라님에게 요약 보고하고 승인 후 다음 작업을 시작한다.
