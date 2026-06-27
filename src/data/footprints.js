// Run Footprints 01 — 최근 10개 런 결과 / 현실 전투 시간 요약 기록(localStorage).
//   밸런스 상세 로그가 아니라 "플레이 결과 요약" 창구다 — 나라 모바일 반복 확인 + 루다 QA 검증용.
//   전투 계산/게임 상태에는 영향을 주지 않는다(읽기/저장 전용 데이터 레이어). 직업명은 호출부가 주입한다.
export const FOOTPRINTS_KEY = "signal_personal_footprints_v1";
export const FOOTPRINTS_MAX = 10;

// Return Choice Core 01 — 중도 귀환(전리품 확보 후 종료)을 발자취에 "귀환"으로 구분(클리어/실패/포기와 별개).
const RESULT_LABEL = { clear: "클리어", defeat: "실패", abort: "포기", return: "귀환" };

export function resultLabel(result) {
  return RESULT_LABEL[result] || result || "?";
}

// mm:ss (ms → 분:초). 60분을 넘어가도 분은 2자리 이상으로 자연 확장.
export function formatTime(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function loadFootprints() {
  try {
    const raw = localStorage.getItem(FOOTPRINTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

// Return Record Foundation 01 — Returned Deck Card 01: 귀환/클리어 시 "살아 돌아온 덱"의 future-use 스냅샷.
//   ★기존 footprint record에서 파생만 한다(새 storage key 없음·battle.js 무변경 — record는 recordFootprint가 이미 넘기는 값).
//   대상 result = return/clear만(defeat/abort는 null = 귀환 덱 오염 방지). eligibleForTitan = "나중에 쓸 수 있다"는 표식
//   (아직 실제 보스 토벌/유물/해금에는 쓰지 않는다 — 구조만 연다). 과거 footprint(이 필드 없음)도 호환되게 optional.
//   ※loot 수치는 record에 없어 스냅샷엔 미포함 — 저장까지 넣으려면 recordFootprint(battle.js)가 loot를 넘겨야 함(후보).
export function buildDeckSnapshot(record) {
  if (!record) return null;
  const result = record.result;
  if (result !== "return" && result !== "clear") return null;
  const party = Array.isArray(record.party) ? record.party : [];
  const pick = (pre) => party.filter((p) => String(p.slot).startsWith(pre)).map((p) => ({ slot: p.slot, job: p.job }));
  return {
    eligibleForTitan: true,            // future boss raid 사용 가능 표식(아직 미사용 — hint/구조만)
    result,                            // "return" | "clear"
    depth: record.depth ?? 0,
    alertness: record.alertness ?? 0,
    combatMs: record.combatMs ?? 0,
    combatNormMs: record.combatNormMs ?? null,
    party: { front: pick("f"), back: pick("b") }, // future-use 최소 구조(slot/job id 보존)
    createdAt: record.ts ?? Date.now(),
  };
}

// 1건 추가 → 최신 10개만 유지(초과 시 가장 오래된 것부터 제거). 저장 실패는 조용히 무시(플레이 방해 X).
export function saveFootprint(record) {
  try {
    // Return Record Foundation 01 — return/clear면 future-use 덱 스냅샷을 같은 entry에 파생 부착(새 key 없음·defeat/abort는 null이라 미부착).
    if (record && record.deckSnapshot === undefined) {
      const snap = buildDeckSnapshot(record);
      if (snap) record.deckSnapshot = snap;
    }
    const list = loadFootprints();
    list.push(record);
    while (list.length > FOOTPRINTS_MAX) list.shift();
    localStorage.setItem(FOOTPRINTS_KEY, JSON.stringify(list));
    return list;
  } catch (e) {
    return loadFootprints();
  }
}

export function clearFootprints() {
  try {
    localStorage.removeItem(FOOTPRINTS_KEY);
  } catch (e) { /* noop */ }
}

// 파티 구성 한 줄 — 슬롯 prefix(f*/b*)로 전열/후열을 가른다. nameOf(jobId)→직업명.
export function partyText(party, nameOf) {
  if (!Array.isArray(party) || !party.length) return "—";
  const nm = (j) => (nameOf && nameOf(j)) || j;
  const front = party.filter((p) => String(p.slot).startsWith("f")).map((p) => nm(p.job));
  const back = party.filter((p) => String(p.slot).startsWith("b")).map((p) => nm(p.job));
  const parts = [];
  if (front.length) parts.push(`전열 ${front.join("·")}`);
  if (back.length) parts.push(`후열 ${back.join("·")}`);
  return parts.length ? parts.join(" / ") : party.map((p) => nm(p.job)).join("·");
}

// 짧은 시각(MM/DD HH:MM). 목록 줄에서 "언제 친 런인지" 읽힘용.
export function shortWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Run Footprints Polish 01 — 시간 표시: 실측(combatMs) + x2환산(combatNormMs).
//   구기록(combatNormMs 없음)은 실측만 표시(하위 호환).
export function footprintTimeText(fp) {
  const real = `실측 ${formatTime(fp.combatMs)}`;
  if (fp.combatNormMs == null) return real;
  return `${real} · x2환산 ${formatTime(fp.combatNormMs)}`;
}

// 발자취 1건 → 한 줄 요약 텍스트(결과 · 심도 · 경계도 · 실측/x2환산 · 파티 · 시각). 결과 오버레이 1줄 + title/aria 공용.
export function footprintLine(fp, nameOf) {
  const when = shortWhen(fp.ts);
  return `${resultLabel(fp.result)} · 심도 ${fp.depth} · 경계도 ${fp.alertness} · ${footprintTimeText(fp)} · ${partyText(fp.party, nameOf)}${when ? ` · ${when}` : ""}`;
}

// 전체 목록 → 복사용 TSV(헤더 포함). 열: 시각/결과/심도/경계도/실측전투시간/x2환산전투시간/파티(텍스트 유지).
export function footprintsToTSV(list, nameOf) {
  const head = ["시각", "결과", "심도", "경계도", "실측전투시간", "x2환산전투시간", "파티"].join("\t");
  const rows = (list || []).map((fp) =>
    [shortWhen(fp.ts), resultLabel(fp.result), fp.depth, fp.alertness, formatTime(fp.combatMs),
     (fp.combatNormMs == null ? "-" : formatTime(fp.combatNormMs)), partyText(fp.party, nameOf)].join("\t")
  );
  return [head, ...rows].join("\n");
}
