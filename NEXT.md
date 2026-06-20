# NEXT — Project Signal Personal

Project ID: SIGNAL_PERSONAL
Project Name: Project Signal Personal
Status: active
Scope: 순수 HTML/CSS/JS 세로형 모바일 자동전투 본게임 (PWA 개인 작업물)

> 이 파일은 **현재 현황 허브**다. 렌/루다/유키는 다음 작업 시작 전 이 파일을 먼저 읽으면 현재 상태를 파악할 수 있다.
> 세부 히스토리는 DEVLOG.md, 직업 스펙은 docs/15_SECOND_CLASS_ROSTER_SPEC.md 참조.

---

## 현재 안정 기준 (최신 → 과거)

현재 main HEAD = `95fee75`. 아래 커밋은 모두 **완료·푸시된 안정 지점**이다.

| 커밋 | 메시지 | 요약 |
|---|---|---|
| `95fee75` | docs/ui: improve second-class codex readability | SR-22~SR-30 2차 9종 도감/상태판 읽힘 강화. tagline 추가, "2차 씨앗 / Dev 씨앗" 표시 정리. **표시만 변경**, 전투 로직·수치·합체·영입·보상·스테이지 무변경. |
| `16ebe10` | feat: add second-class batch 2 dev combat seeds | SR-26 구원자(치명 피해 직전 개입) / SR-28 역병술사(제한 감염 확산) / SR-29 무희(1·2·3박 행동 리듬)를 Dev 전투 씨앗으로 구현. 정식 해금 아님, 일반 합체/영입/보상/스테이지 미합류. |
| `631dc1c` | feat: add second-class batch 1A dev combat seeds | SR-25 검성 / SR-27 천궁 / SR-30 결계장을 Dev 전투 씨앗으로 구현. 정식 해금 아님, 일반 합체/영입/보상/스테이지 미합류. |
| `972fb14` | feat: port finalized hero avatars to main game | SR-01~SR-30 확정 아바타 본게임 반영. SR-25~SR-30은 도감/상태판 씨앗 등록. 기본/1차/2차 발밑 링 문법 반영. 일반 해금/합체/영입/보상/스테이지 무변경. |

이전(Phase 0~8.3, Living Battle Screen, Combat Lifecycle/Readability, Boss Presence 등) 전투 화면·연출 기반 작업은 모두 푸시 완료된 기반 위에 위 작업이 올라간 상태다. 세부 연혁은 DEVLOG.md 참조.

---

## 현재 상태

### 1. 프로젝트 구조
- 순수 HTML/CSS/JS 모바일 자동전투 본게임.
- 기본 전투 / 성장 / 합체 / 영입 / 여정 선택 구조는 코드상 구현됨.
- 플레이 흐름: 타이틀(시작) → 전투(자동) → 승리 시 성장 선택 → 다음 스테이지 → 최종 클리어/패배 시 결과 오버레이.

### 2. 직업 총량 — 36종 MAX
- SR-01~SR-06: 기본 직업 6종
- SR-07~SR-21: 1차 직업 15종
- SR-22~SR-36: 2차 직업 15종
- **36종 밖 신규 직업 확장 금지.** 새 아이디어는 SR-01~SR-36 안에서 흡수/교체/튜닝한다.

### 3. 현재 직업 상태
- 기본 6종: 구현됨.
- 1차 15종: 구현 및 일반 합체 가능.
- SR-22~SR-30 (2차 9종): Dev 전투 씨앗 / 도감·상태판 / 아바타 확보됨.
  - **정식 해금 아님.** 일반 합체/영입/보상/스테이지 미합류.
- SR-31~SR-36 (2차 6종): 미확정 / placeholder / 코드 미구현.

### 4. 확정 시각 문법
- 기본 직업: 기존 그림자
- 1차 직업: 은색 발밑 링
- 2차 직업: 금색 발밑 링
- 원칙: **정보는 텍스트보다 먼저 화면 위 형태로 전달한다.**

### 5. 초보자 테마 현재 상태
- 초보자의 길만 실제 플레이 가능. 나머지 테마는 잠금 표시.
- 플레이 흐름은 routes.js 기반 선택형 여정으로 확장됨.
- 심도 depth / 경계도 alertness / bossKeys / bossMenace 구현.
- 보스 열쇠 1개면 보스 도전 가능, 2개면 위압 해제.
- 사자왕 위압 = 피해 감소 + 행동당 공격력 상승으로 구현.

---

## 주말 목표

- **초보자 테마를 "기분 좋게 클리어"하도록 만들기.**
- 단순 수치 하향보다 **스테이지 구성 조정** 우선.
- 이상 목표: 플레이어가 자연스럽게 **25~35심도 사이**에서 사자왕을 잡는 흐름.

### ⚠ 목표 충돌 주의 (다음 작업에서 검토)
현재 코드/문구는 25+ 심도를 "늦은 도전", 30+를 강한 압박 구간처럼 취급한다.
이는 "25~35심도 자연 클리어" 목표와 충돌할 수 있다.
→ `Beginner Theme Clear Feel 01`에서 검토 대상.

---

## 다음 작업 후보 (우선순위)

1. **Beginner Theme Clear Feel 01** — 초보자 테마 스테이지 구성/여정 선택/보스 타이밍 조정. 25~35심도 자연 클리어 목표. (위 목표 충돌 포함)
2. **Implemented Job Effect Tuning 01** — 이미 구현된 직업 효과 수치 소폭 조정. 새 기능 금지.
3. **Action Line Visibility 01** — 행동선 시스템 시인성 강화.
4. **Combat Visibility Grammar 01** — 캐릭터별 전투 시인성 문법 정리.
5. **Second Class Seed Audit 01** — SR-22~SR-30 2차 씨앗 기준 통일.
6. **SR-31~SR-36 Roster Gap Map** — 남은 2차 6칸 역할 빈자리 파악.

---

## 후속 문서/코드 정리 후보 (이번 작업 대상 아님 — 메모만)

아래는 최신 코드와 어긋나는 옛 문구다. **지금 고치지 말고** 후속 작업으로 둔다.

- `docs/15_SECOND_CLASS_ROSTER_SPEC.md` — SR-25~SR-30을 design target / 코드 미존재처럼 기술. 최신 코드와 불일치.
- `docs/13_IMPLEMENTATION_ADJUSTMENT_ROADMAP.md` — 일부 완료 작업이 여전히 "앞으로 할 일"로 남음.
- `docs/14_HERO_READABILITY_ALIGNMENT_01.md` — 상태칩 TODO 중 일부는 이미 구현됨.
- `src/data/avatars.js`, `src/ui/avatars.css` — 상단 주석에 SR-25~30 미이식 문구 잔존.
- `src/ui/render.js` — 도감 헤더가 "SR-01 ~ SR-24"로 남아 있으나 CODEX_ENTRIES는 SR-30까지 포함.

---

## 잔존 변경 주의

현재 워킹트리에 아래 2개 잔존 변경이 있다. **이번/다음 작업에서 건드리지 말고, 커밋 시 제외**한다.
- `CLAUDE.md`
- `docs/08_LUDA_OPERATING_RULES.md`

---

## 금지 사항 (다음 세션 포함)

- 36종(SR-01~SR-36) 밖 신규 직업 확장 금지.
- 전투 로직·수치·스테이지·합체·영입·보상 변경은 유키 설계 지시 전 금지.
- 나라님 승인 없이 push 금지.
- 한 번에 여러 작업 동시 진행 금지.
- 기존 R&D 코드/문서 복사 금지.
- 무대(전투 화면 구도/호흡)를 먼저 잠근 뒤 기능을 올린다. 기능 우선 금지.

---

## 다음 세션 시작 방법

렌은 작업 시작 전 아래 순서를 따른다.

1. CLAUDE.md 읽기
2. NEXT.md (이 파일) 읽기
3. DEVLOG.md 최근 항목 읽기
4. 필요 시 docs/15_SECOND_CLASS_ROSTER_SPEC.md / docs/06_CHARACTER_AVATAR_GUIDE.md 읽기
5. **미리보기 서버 시작** — `signal-personal` (C:\MCP\.claude\launch.json, 포트 3000)

읽은 뒤 바로 코드를 수정하지 말고, 현재 상태를 나라님에게 요약 보고하고 승인 후 다음 작업을 시작한다.
