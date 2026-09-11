import { describe, it, expect, beforeEach } from "vitest";
import { effectiveVolume, playSfx, playBgm, setPlayer, hasPlayer, type Volumes } from "../sound";

const v = (o: Partial<Volumes> = {}): Volumes => ({ master: 70, sfx: 70, bgm: 50, ...o });

beforeEach(() => setPlayer(null));

describe("실효 볼륨", () => {
  it("전체 × 채널", () => {
    expect(effectiveVolume(v({ master: 100, sfx: 50 }), "sfx")).toBeCloseTo(0.5);
    expect(effectiveVolume(v({ master: 50, sfx: 50 }), "sfx")).toBeCloseTo(0.25);
  });

  it("⚠ 곱하지 더하지 않는다 — 전체를 0으로 내리면 소리가 안 나야 한다", () => {
    expect(effectiveVolume(v({ master: 0, sfx: 100 }), "sfx")).toBe(0);
    expect(effectiveVolume(v({ master: 0, bgm: 100 }), "bgm")).toBe(0);
  });

  it("채널을 구분한다", () => {
    const vol = v({ master: 100, sfx: 80, bgm: 20 });
    expect(effectiveVolume(vol, "sfx")).toBeCloseTo(0.8);
    expect(effectiveVolume(vol, "bgm")).toBeCloseTo(0.2);
  });

  it("범위를 벗어난 값도 0~1 안으로", () => {
    expect(effectiveVolume(v({ master: 500, sfx: 500 }), "sfx")).toBe(1);
    expect(effectiveVolume(v({ master: -50, sfx: 70 }), "sfx")).toBe(0);
    expect(effectiveVolume(v({ master: NaN, sfx: 70 }), "sfx")).toBe(0);
  });
});

describe("재생", () => {
  it("⚠ 재생기가 없으면 아무 일도 안 한다 — 없는 기능을 있는 척하지 않는다", () => {
    expect(hasPlayer()).toBe(false);
    expect(() => playSfx("hit", v())).not.toThrow();
    expect(() => playBgm("main", v())).not.toThrow();
  });

  it("재생기를 꽂으면 id와 볼륨이 간다", () => {
    const calls: Array<[string, number]> = [];
    setPlayer((id, vol) => calls.push([id, vol]));
    playSfx("hit", v({ master: 100, sfx: 50 }));
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("hit");
    expect(calls[0][1]).toBeCloseTo(0.5);
  });

  it("볼륨이 0이면 부르지 않는다 — 0짜리 소리를 만들 이유가 없다", () => {
    const calls: string[] = [];
    setPlayer((id) => calls.push(id));
    playSfx("hit", v({ master: 0 }));
    playSfx("hit", v({ sfx: 0 }));
    expect(calls).toEqual([]);
  });

  it("재생기를 빼면 다시 조용해진다", () => {
    const calls: string[] = [];
    setPlayer((id) => calls.push(id));
    playSfx("a", v());
    setPlayer(null);
    playSfx("b", v());
    expect(calls).toEqual(["a"]);
    expect(hasPlayer()).toBe(false);
  });
});
