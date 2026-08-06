/**
 * 사운드 — **뼈대만이다. 아직 소리 파일이 없다.**
 *
 * ⚠ 볼륨 슬라이더만 놓고 아무 일도 안 하게 두면 "눌러도 아무 일 없는 컨트롤"이
 * 된다 — 이 프로젝트에서 반복해 나온 결함이다(부상위험 %, 구종 슬롯에 이름
 * 적기). 그래서 **값이 실제로 쓰이는 경로**를 지금 만들어 둔다:
 * 저장 → 실효 볼륨 계산 → `playSfx`. 파일만 넣으면 켜진다.
 *
 * ⚠ 소리를 여기서 재생하지 않는다. `play`가 주입되기 전까지는 아무것도 안
 * 한다 — 없는 기능을 있는 척하지 않는다.
 */

export type SoundChannel = "sfx" | "bgm";

export interface Volumes {
  master: number;
  sfx: number;
  bgm: number;
}

/**
 * 실제로 낼 소리의 크기 (0~1).
 *
 * 전체 볼륨이 채널 볼륨에 **곱해진다** — 전체를 0으로 내리면 채널이 100이어도
 * 소리가 안 난다. 더하면 전체를 0으로 해도 소리가 나서 뜻이 어긋난다.
 */
export function effectiveVolume(v: Volumes, channel: SoundChannel): number {
  const master = clamp(v.master) / 100;
  const own = clamp(channel === "sfx" ? v.sfx : v.bgm) / 100;
  return master * own;
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** 소리를 실제로 내는 쪽. 파일이 생기면 주입한다 */
export type Player = (id: string, volume: number) => void;

let player: Player | null = null;

/** 재생기를 꽂는다. 아직 아무도 안 꽂는다 — 파일이 생기면 그때 */
export function setPlayer(p: Player | null): void {
  player = p;
}

/** 재생기가 꽂혀 있나 — 화면이 "준비 중"을 띄울지 판단한다 */
export function hasPlayer(): boolean {
  return player !== null;
}

/**
 * 효과음. **볼륨이 0이면 부르지 않는다** — 재생기가 0 볼륨으로 소리를
 * 만들어 두는 걸 막는다.
 */
export function playSfx(id: string, volumes: Volumes): void {
  if (!player) return;
  const v = effectiveVolume(volumes, "sfx");
  if (v <= 0) return;
  player(id, v);
}

export function playBgm(id: string, volumes: Volumes): void {
  if (!player) return;
  const v = effectiveVolume(volumes, "bgm");
  if (v <= 0) return;
  player(id, v);
}
