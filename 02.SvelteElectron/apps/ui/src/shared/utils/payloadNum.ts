/**
 * 엔진에 넘기는 숫자를 안전하게 만든다.
 *
 * ⚠ **이것 때문에 두 시스템이 통째로 죽었다.**
 *
 * Rust 구조체의 `i32`/`f64` 필드에 `null`이 오면 serde가 **페이로드 전체를
 * 거부**한다. `#[serde(default)]`는 **키가 없을 때만** 동작하고 명시적 null은
 * 못 막는다. 그리고 `JSON.stringify`는 `NaN`·`Infinity`를 **null로 바꾼다** —
 * 계산식 하나가 어긋나면 그대로 전송된다.
 *
 * 실측 사고 둘:
 *  · 승강(`seasonPerfOf`) — 통계값을 그대로 넘겨 한 팀이 매주 실패했고,
 *    그 예외가 주간 루프를 끊어 뒤따르는 성장·메시지·순위까지 안 돌았다
 *  · 국가대표(`formOf`) — `era`/`ops`가 없으면 NaN이 되어 선발이 죽었다
 *
 * 둘 다 조용히 실패해서 "왜 안 도는지" 아무 데도 안 남았다.
 */
export function finiteOr(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * 객체의 숫자 필드를 전부 검사한다 — 페이로드를 통째로 넘기기 전에 쓴다.
 * 어긋난 필드 이름을 돌려주므로 "무엇이 깨졌는지"가 로그에 남는다.
 */
export function nonFiniteFields(obj: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && !Number.isFinite(v)) bad.push(`${k}=${v}`);
    else if (v === null) bad.push(`${k}=null`);
  }
  return bad;
}
