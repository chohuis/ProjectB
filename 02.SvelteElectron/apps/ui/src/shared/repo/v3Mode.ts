// ── R3a-4: v3 슬롯 활성 플래그 (전환기 전용) ─────────────────────
// v3 슬롯으로 새 게임/로드하면 true — gameStore.save()가 v3 경로로 분기한다.
// 구시스템 완전 폐기(R3a-4d) 후 이 플래그와 레거시 분기를 함께 제거한다.

let _v3Active = false;

export function setV3SlotActive(v: boolean): void { _v3Active = v; }
export function isV3SlotActive(): boolean { return _v3Active; }
