// ── 야구 기록 표기 ─────────────────────────────────────────────
//
// 🔴 **표기 규칙이 화면마다 흩어져 있었다.** `ipLabel`이 `PlayerDetailModal`
//    안에만 있어서 같은 파일 안에서도 **쓰는 자리와 안 쓰는 자리**가 갈렸고
//    (`{line.ip}` 대 `{ipLabel(l.ip)}`), 다른 화면은 아예 원시값을 찍었다.
//    한곳에 모아 어디서든 같게 나오게 한다.

/**
 * 이닝 — 야구는 **아웃 개수를 소수 첫 자리**로 쓴다.
 *
 *     31        31이닝
 *     31.1      31이닝 1아웃 (⅓)
 *     31.2      31이닝 2아웃 (⅔)
 *
 * 🔴 **`.3`은 없다.** 3아웃이면 한 이닝이 끝난 것이라 정수로 올라간다.
 *   반올림이 3을 만들 수 있어(`31.9` → `round(0.9*3)=3`) 여기서 올린다.
 * ⚠ `toFixed(1)`로는 안 된다 — `31.67`이 `31.7`이 되는데 **`.7`도 없는 표기**다.
 *
 * 🔴 **입력은 실수 이닝이다**(`outs / 3`). 야구 표기(`31.2`)를 넣으면 안 된다 —
 *   `31.2`를 실수로 읽으면 31과 0.2이닝이라 `31`로 잘린다.
 *   ⚠ 2026-08-26 실측: 엔진 두 자리가 **같은 `ip` 필드에 서로 다른 형식**을
 *     넣고 있다(`match_engine`은 실수, `npc_sim`은 표기). 그건 여기서 못 고친다 —
 *     값을 보고 어느 쪽인지 알 방법이 없다. **엔진 쪽을 통일해야 한다.**
 */
export function ipLabel(ip: number): string {
  if (!Number.isFinite(ip) || ip < 0) return "-";
  let whole = Math.floor(ip + 1e-9);
  let outs = Math.round((ip - whole) * 3);
  if (outs >= 3) { whole += 1; outs = 0; }
  return outs > 0 ? `${whole}.${outs}` : `${whole}`;
}

/**
 * 이닝을 **아웃 수로** 되돌린다 — 평균자책점·WHIP처럼 나눗셈에 쓸 때.
 *
 * ⚠ `31.2`를 그대로 나누면 안 된다. 그건 31.667이지 31.2가 아니다.
 */
export function ipToOuts(ip: number): number {
  if (!Number.isFinite(ip) || ip < 0) return 0;
  // ⚠ 소수부를 아웃으로 읽지 않는다 — 그건 야구 표기를 받는 함수의 셈이다.
  //   입력이 실수 이닝이므로 **그냥 3을 곱한다.**
  return Math.round(ip * 3);
}

/**
 * 비율 기록 — 타율·출루율·장타율은 **소수 셋째 자리까지, 앞의 0을 뗀다.**
 *
 *     0.3       .300      (`.30`이 아니다)
 *     0.2857    .286
 *     1.0       1.000     (1 이상은 0을 안 뗀다)
 */
export function rateLabel(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  const s = Math.abs(v).toFixed(3);
  const body = Math.abs(v) < 1 ? s.slice(1) : s;   // 0.286 → .286
  return v < 0 ? `-${body}` : body;
}

/**
 * 평균자책점·WHIP — **소수 둘째 자리.**
 *
 * ⚠ 이닝이 0이면 나눗셈이 `Infinity`다. 야구는 그걸 `-`로 쓴다(`INF`가 아니다).
 */
export function eraLabel(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  return v.toFixed(2);
}

/**
 * 컨디션·피로·사기처럼 **눈금이 0~100인 상태값.**
 *
 * 🔴 내부는 소수로 돈다(성실 감쇠·피로 누적이 소수를 만든다).
 *   화면에 `58.333333`이 그대로 나오던 자리가 있었다.
 * ⚠ **소수 한 자리까지만** 보인다 — 그 아래는 사람이 구분 못 한다.
 * ⚠ 정수면 소수점을 안 붙인다(`58`이지 `58.0`이 아니다).
 */
export function gaugeLabel(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * 상대 시즌 표기(`"S-1"`)를 **실제 연도**로 바꾼다.
 *
 * 🔴 세계 생성 때 과거 5시즌을 `S-1`(직전) ~ `S-5`(가장 오래된)로 적어 뒀는데,
 *   화면이 그 문자열을 **그대로 찍고 있었다.** 플레이어는 `S-3`이 몇 년인지 모른다.
 *
 * ⚠ 기준은 **현재 시즌**이다 — 2026년에 `S-1`은 2025년이다.
 * ⚠ 이미 연도로 적힌 값(`"2025"`)은 그대로 돌려준다. 두 형식이 섞여 있어도
 *   화면이 안 깨진다.
 */
export function seasonLabel(season: string, currentYear: number): string {
  const m = /^S-(\d+)$/.exec(season.trim());
  if (m) return String(currentYear - Number(m[1]));
  return season;
}
