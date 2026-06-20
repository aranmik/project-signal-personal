// Run Footprints 01 — 최근 10개 런 결과 / 현실 전투 시간 요약 기록(localStorage).
//   밸런스 상세 로그가 아니라 "플레이 결과 요약" 창구다 — 나라 모바일 반복 확인 + 루다 QA 검증용.
//   전투 계산/게임 상태에는 영향을 주지 않는다(읽기/저장 전용 데이터 레이어). 직업명은 호출부가 주입한다.
export const FOOTPRINTS_KEY = "signal_personal_footprints_v1";
export const FOOTPRINTS_MAX = 10;

const RESULT_LABEL = { clear: "클리어", defeat: "실패", abort: "포기" };

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

// 1건 추가 → 최신 10개만 유지(초과 시 가장 오래된 것부터 제거). 저장 실패는 조용히 무시(플레이 방해 X).
export function saveFootprint(record) {
  try {
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
