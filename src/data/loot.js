// Return & Loot Core 01 — Carry Loot 데이터(감정 코어 전용).
//   ★전투 스탯 효과 없음 · 영구 재화/상점/메타 성장 아님 · 복잡한 인벤토리 아님.
//   런 중 "들고 있는" 전리품 후보 소량 하드코딩. 귀환 성공 시 "가져왔다", 전멸 시 "잃었다"는 감정만 만든다.
//   필드: id · name · tier · flavor. (foundAtDepth는 획득 시점에 battle.js가 붙인다.)

export const LOOT_TIERS = { common: "흔함", uncommon: "드묾", rare: "귀함" };

export const LOOT_CANDIDATES = [
  { id: "old_footprint", name: "오래된 발자국", tier: "common", flavor: "흙에 굳은 누군가의 발자국. 먼저 이 길을 간 이가 있었다." },
  { id: "broken_birdfeather", name: "부러진 깃새 깃", tier: "common", flavor: "가볍게 부러진 깃 하나. 끝내 날지 못한 새의 흔적." },
  { id: "blue_moss", name: "푸른 이끼 조각", tier: "common", flavor: "축축하고 차갑다. 숲의 숨결이 그대로 배어 있다." },
  { id: "hollow_acorn", name: "속 빈 도토리", tier: "common", flavor: "누군가 파먹고 남긴 도토리. 작은 보금자리였을지도 모른다." },
  { id: "wet_map_scrap", name: "젖은 지도 조각", tier: "uncommon", flavor: "물에 번진 길. 어디로 이어지는지는 끝내 읽히지 않는다." },
  { id: "dewglass_bead", name: "이슬 유리알", tier: "uncommon", flavor: "이슬이 굳어 만들어진 작은 구슬. 안에 작은 숲이 비친다." },
  { id: "cracked_lion_fang", name: "금 간 사자 송곳니", tier: "rare", flavor: "사자왕의 것이었을까. 금이 가 있어도 묵직하게 손에 남는다." },
  { id: "dead_starseed", name: "꺼진 별빛 씨앗", tier: "rare", flavor: "한때 빛났을 씨앗. 쥐고 있으면 희미한 미열이 손끝에 남는다." },
];

const TEMPLATE_BY_ID = LOOT_CANDIDATES.reduce((o, c) => { o[c.id] = c; return o; }, {});

// 전리품 후보 1개를 굴려 carried loot 인스턴스로 반환(이미 들고 있는 id는 가능하면 피한다).
//   ★기존 본게임 RNG와 동일하게 Math.random 사용(정상 플레이엔 시드 없음 — 시드 흐름은 dev 도구 전용).
//   carriedIds에 모든 후보가 이미 있으면 중복을 허용한다(소량이라 실사용엔 거의 안 일어남).
export function rollLootCandidate(depth = 0, carriedIds = []) {
  const fresh = LOOT_CANDIDATES.filter((c) => !carriedIds.includes(c.id));
  const pool = fresh.length ? fresh : LOOT_CANDIDATES;
  if (!pool.length) return null;
  const c = pool[Math.floor(Math.random() * pool.length)];
  return { id: c.id, name: c.name, tier: c.tier, flavor: c.flavor, foundAtDepth: depth };
}

export function lootTierLabel(tier) {
  return LOOT_TIERS[tier] || "흔함";
}

export function lootById(id) {
  return TEMPLATE_BY_ID[id] || null;
}
