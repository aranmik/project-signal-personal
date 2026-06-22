// Deep Reward Pool 01 — 심층 탐험형 보상 풀 + Reward Exhaustion Fallback.
//   모토: 클리어는 끝이 아니라 귀환 / 영웅·몬스터는 레벨업하지 않는다 / 성장 = 숲을 읽는 능력 + 모험 준비도.
//   기본 성장 보상(rewards.js)이 Max로 고갈된 뒤에도 "고를 맛"이 있는 임시/탐험형 보상을 제공한다.
//   ★영구 스탯 무한 증가/레벨업 없음. active만 실제 플레이에 등장, scaffold/idea는 Dev 카탈로그 표시 전용(미적용).
//
//   status: "active"   = 실제 효과 적용(safe 메커니즘: 현재 HP 회복 / 다음 전투 보호막).
//           "scaffold" = 효과/훅 설계는 됐으나 연결 보류(시스템 일부 미완).
//           "idea"     = 아직 시스템 자체가 없음(지도/전리품/히든/소생 등) — 컨셉만.
//   apply: active 보상의 battle.js 라우팅 명세. heal=현재 파티HP 스냅샷 회복(다음 전투 이월) / shield=다음 전투 시작 보호막.

export const DEEP_REWARD_STATUS = {
  active:   { id: "active",   label: "적용" },
  scaffold: { id: "scaffold", label: "준비" },
  idea:     { id: "idea",     label: "구상" },
};

// categoryTag = 플레이 보상 카드에 붙는 짧은 태그(일반 성장과 구분). category = 카탈로그 분류.
export const DEEP_REWARDS = [
  {
    id: "deep_breath", name: "숨 고르기", status: "active",
    category: "생존형", tag: "생존", depthMin: 25,
    effect: "전원 HP 소량 회복(다음 전투로 이월)",
    intent: "긴 런에서 보상 고갈 시 최소 생존 리듬 제공 — 보상이 비지 않게 하는 바닥 선택",
    emotion: "한 번 더 버틸 수 있겠다",
    risk: "너무 강하면 이슬 쉼터(전원 풀회복) 가치 약화 → '소량'으로 제한(쉼터 미대체)",
    followup: "심층 생존 리듬 / Extraction Loot Layer와 별개",
    apply: { kind: "heal", amount: 30 },
  },
  {
    id: "condensed_growth", name: "응축된 성장", status: "active",
    category: "전투 임시형", tag: "임시", depthMin: 30,
    effect: "다음 전투 시작 시 전원 약한 보호막(최대 HP의 12%)",
    intent: "영구 스탯 대신 다음 한 판을 버티게 하는 임시 힘(Max 성장 대체)",
    emotion: "다음 한 판만 넘겨보자",
    risk: "반복 중첩 무적감 방지 — 다음 전투 1회 한정(누적 안 됨)",
    followup: "임시 버프 레이어(다음 전투 한정) — 후열/전열 변형 가능",
    apply: { kind: "shield", scope: "all", pct: 0.12 },
  },
  {
    id: "front_resolve", name: "전열 다짐", status: "active",
    category: "전투 임시형", tag: "임시", depthMin: 30,
    effect: "다음 전투 시작 시 전열에 보호막(최대 HP의 18%)",
    intent: "전열이 무너져 깊은 런이 끝나는 상황 완충 — DR 대신 보호막으로 구현(안전)",
    emotion: "앞라인이 한 번 버텨주겠다",
    risk: "탱커/수호자 가치 침해 주의 → 1회 한정 보호막으로 제한",
    followup: "전열 DR 정식 수치는 별도 검토(현재는 보호막 근사)",
    apply: { kind: "shield", scope: "front", pct: 0.18 },
  },
  {
    id: "return_ready", name: "귀환 준비", status: "scaffold",
    category: "귀환형", tag: "귀환", depthMin: 25,
    effect: "다음 보스전 첫 피해 감소 또는 보스전 진입 시 소량 회복",
    intent: "전리품을 들고 사자왕으로 돌아갈 결심을 돕는 보험(클리어=귀환)",
    emotion: "이제 나갈 준비가 됐다",
    risk: "보스전을 너무 쉽게 만들면 안 됨 → 보스 전용 1회 효과 설계 필요",
    followup: "보스 진입 훅(보스 전용 임시 효과)이 없어 보류 — 추가 시 active 승격",
    apply: null,
  },
  {
    id: "back_focus", name: "후열 집중", status: "scaffold",
    category: "전투 임시형", tag: "임시", depthMin: 30,
    effect: "다음 전투에서 후열 공격/회복 소폭 강화",
    intent: "마도/현자/성직자/궁수 계열이 빛나는 선택(광역딜 정체성)",
    emotion: "이번엔 후열 캐리로 밀어보자",
    risk: "광역딜 과해지면 다수 몬스터 압박 약화 → 임시 atk 버프 훅 필요(미연결)",
    followup: "다음 전투 한정 atk 버프 훅 추가 시 active 승격(보호막 훅과 동형)",
    apply: null,
  },
  {
    id: "camp_sense", name: "야영 감각", status: "scaffold",
    category: "쉼터 강화형", tag: "정비", depthMin: 25,
    effect: "다음 쉼터 회복 효과 증가 또는 쉼터 후 빌드 route 가중 강화",
    intent: "쉼터를 단순 회복이 아니라 전략적 정비로 강화",
    emotion: "다음 쉼터까지 버티자",
    risk: "route 보장(Route Choice Polish 02)과 겹치면 과보호 가능 → 신중",
    followup: "restParty/rollRouteOffer 훅 연결 시 active 승격",
    apply: null,
  },
  {
    id: "read_path", name: "길 읽기", status: "scaffold",
    category: "정보형", tag: "정보", depthMin: 30,
    effect: "다음 route 선택지에 위험/보상 힌트 표시",
    intent: "유저 실력 성장과 연결되는 정보 보상(숲을 읽는 능력)",
    emotion: "이제 숲을 조금 읽을 수 있다",
    risk: "정보가 너무 직접적이면 선택 긴장 감소 → 모호한 힌트로",
    followup: "route 카드 힌트 UI 훅 필요(미연결)",
    apply: null,
  },
  {
    id: "old_tracks", name: "오래된 발자국", status: "idea",
    category: "탐색/지도형", tag: "탐색", depthMin: 30,
    effect: "지도 조각 후보 출현률 증가",
    intent: "다음 테마 해금/심층 탐험의 목적 제공",
    emotion: "지도 조각 하나만 더 찾고 나가자",
    risk: "지도 조각 드랍 시스템이 아직 없음 → 효과 미적용",
    followup: "Discovery Codex 지도 조각(runFound/kept) 드랍 구현 후 연결",
    apply: null,
  },
  {
    id: "trace_sense", name: "흔적 감지", status: "idea",
    category: "탐색형", tag: "탐색", depthMin: 25,
    effect: "다음 몇 심도 동안 발견품 출현 확률 증가",
    intent: "전리품 루프와 연결",
    emotion: "지금부터 뭔가 나올 것 같다",
    risk: "전리품(발견품) 시스템 전 → 미적용",
    followup: "Extraction Loot Layer 구현 후 연결",
    apply: null,
  },
  {
    id: "forest_scent", name: "숲의 냄새", status: "idea",
    category: "히든/도감형", tag: "탐색", depthMin: 35,
    effect: "히든 몬스터 흔적 감지 확률 증가",
    intent: "도감러/탐험러 동기 제공",
    emotion: "이번 런에 숨은 생물이 있을지도",
    risk: "히든 몬스터 출현 미구현 → 미적용",
    followup: "Discovery Codex 히든 몬스터 출현 구현 후 연결",
    apply: null,
  },
  {
    id: "loot_wrap", name: "전리품 묶기", status: "idea",
    category: "반출/보험형", tag: "귀환", depthMin: 30,
    effect: "전멸 시 발견품 1개 보호 확률 증가",
    intent: "욕심 탐험의 리스크를 약간 줄이는 대신 더 깊이 들어가게 유혹",
    emotion: "조금은 안전하니 한 번만 더",
    risk: "너무 강하면 전멸의 후회가 약해짐 → Extraction Loot Layer 전이라 미적용",
    followup: "Extraction Loot Layer 구현 후 연결",
    apply: null,
  },
  {
    id: "last_ember", name: "마지막 불씨", status: "idea",
    category: "위기형", tag: "생존", depthMin: 35,
    effect: "다음 전투에서 첫 전투불능 1회 완화(HP 1 생존)",
    intent: "심층 탐험에서 마지막 한 번의 드라마 제공",
    emotion: "살았다! 이제 나가야 하나?",
    risk: "구원자/소생 역할 침해 주의 → 실제 적용 위험, 컨셉만",
    followup: "소생 메커니즘 충돌 검토 후 별도 결정",
    apply: null,
  },
];

export function deepRewardById(id) {
  return DEEP_REWARDS.find((r) => r.id === id) || null;
}
export function activeDeepRewards() {
  return DEEP_REWARDS.filter((r) => r.status === "active");
}
