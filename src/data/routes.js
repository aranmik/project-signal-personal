// Run Structure Design 01A — 선택형 여정 레이어 데이터.
//   "전투는 자동이지만, 여정은 내가 고른다." 기존 10스테이지 초보자 루프(stages.js) 위에
//   route(여정 선택) 레이어를 얹는다 — 전투 후 다음 길을 고르고, 정예에서 보스 열쇠를 얻어
//   원할 때 보스문에 도전한다. 전투 계산/합체/영입/배치는 무변경(이 파일은 데이터 + 선택 로직만).
//
//   인카운터 풀은 BEGINNER_THEME(stages.js)의 일반/정예/보스 구성을 "그대로 재활용"한다
//   (얼굴 교체 없음 — S5 올빼미 / S9 사슴 / S10 사자왕 감각 유지). route가 stage 번호 고정 증가가
//   아니라 "고른 길"이 다음 인카운터를 만든다.
import { BEGINNER_THEME } from "./stages.js";

// 선택지 카탈로그(표시 문구). 실제 인카운터는 createRouteEnemies(state.js)가 생성한다.
//   title/sub = 선택 카드 문구(모바일 390px), hud = 상단 HUD 짧은 라벨, kind = 흐름 분기.
export const ROUTE_TYPES = {
  normal: { id: "normal", title: "새싹 숲길",  sub: "안정적인 전투",          hud: "일반 전투", kind: "battle" },
  danger: { id: "danger", title: "깊은 수풀",  sub: "위험도 + / 보상 +",      hud: "위험 전투", kind: "battle" },
  elite:  { id: "elite",  title: "현자의 가지", sub: "승리 시 보스 열쇠",       hud: "정예 전투", kind: "battle" },
  rest:   { id: "rest",   title: "이슬 쉼터",  sub: "전투 없이 파티 정비",     hud: "휴식",     kind: "rest"   },
  boss:   { id: "boss",   title: "새싹 왕의 문", sub: "사자왕에게 도전",        hud: "보스전",   kind: "boss"   },
};

// 기존 10스테이지 구성을 tier별로 추려 인카운터 풀로 재활용(데이터 중복 없이 stages.js가 단일 출처).
const byTier = (tier) =>
  BEGINNER_THEME.stages.filter((s) => s.tier === tier).map((s) => s.enemies.slice());

export const NORMAL_POOL = byTier("normal");          // 일반/위험 전투 기반 풀
export const ELITE_POOL = byTier("elite");            // 정예(올빼미 / 사슴) — 번갈아 등장
export const BOSS_ENCOUNTER = byTier("boss")[0] || ["lion:boss"]; // 사자왕
// 위험 전투에 보탤 소형 적(수가 많음). createRouteEnemies가 danger flag로 소량 강화도 적용.
export const DANGER_EXTRA = ["fox", "bird", "lamb", "dewslime"];

// 여정 선택지 오퍼 — "읽히는 반고정" 선택지(복잡한 랜덤 생성 아님).
//   항상 안정 옵션(일반) + depth 리듬에 따른 둘째 옵션(정예/위험/휴식). 보스 열쇠가 있으면 보스문 추가.
//   카드 2~3개. 정예가 주기적으로 떠 열쇠를 모을 수 있고, 열쇠를 얻으면 "지금 갈지/더 돌지"를 고른다.
export function rollRouteOffer({ depth, bossKeys }) {
  const choices = ["normal"];
  const r = depth % 3;
  if (r === 2) choices.push("elite");
  else if (r === 0) choices.push("rest");
  else choices.push("danger");
  if (bossKeys > 0) choices.push("boss");
  return choices;
}

// 보스 도전 타이밍 감각(초보자 테마 기준) — 정확한 밸런싱이 아니라 "지금 갈지/더 돌지" 읽힘용.
//   빠른 8~11 / 적정 12~17 / 늦은 18~24 / 너무 늦음 25+.
export function bossTimingLabel(depth) {
  if (depth < 8) return "이른 도전";
  if (depth <= 11) return "빠른 도전";
  if (depth <= 17) return "적정 도전";
  if (depth <= 24) return "늦은 도전";
  return "너무 늦은 도전";
}
