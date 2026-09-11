import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * 리그 경기가 **씨앗으로 재현되는가**.
 *
 * 🔴 **2026-08-20까지 재현이 안 됐다.** `start_match_native`·`sim_to_game_end`가
 * 각자 `rand::thread_rng()`를 만들어서, 같은 세이브·같은 로스터라도 돌릴
 * 때마다 다른 경기가 됐다. 그러면 "고쳤더니 뭐가 달라졌나"를 못 잰다.
 *
 * ⚠ **주인공 경기는 아직 씨앗을 안 쓴다.** "세이브를 다시 열어 운을 다시
 * 굴릴 수 있게 할 것인가"는 게임 설계 판단이라 따로 정한다. 그래서 씨앗은
 * **선택**이고, 안 주면 예전 그대로 `thread_rng`다 — 그 갈래도 여기서 본다.
 */

const require_ = createRequire(import.meta.url);
const ENGINE = path.resolve(__dirname, "../../../../../../packages/engine-native");
const engine = require_(ENGINE) as {
  startMatchNative: (json: string) => string;
  simToGameEnd: (json: string) => string;
};

function play(seed: number | null) {
  const opts: Record<string, unknown> = {
    leagueId: "LEAGUE_KBL",
    protagonistSide: "home",
    role: "SP",
    inningLimit: 9,
    batterMean: 55,
    initialStamina: 82,
    initialMental: 74,
  };
  if (seed !== null) opts.seed = seed;
  const st = engine.startMatchNative(JSON.stringify(opts));
  const fin = JSON.parse(engine.simToGameEnd(st));
  return {
    home: fin.score.home as number,
    away: fin.score.away as number,
    pitches: fin.pitchCount as number,
    seedLeft: fin.rngSeed as number,
  };
}

describe("리그 경기 재현성", () => {
  it("같은 씨앗은 같은 경기다", () => {
    const a = play(4242);
    const b = play(4242);
    expect(b).toEqual(a);
  });

  it("씨앗이 다르면 다른 경기다 — 안 그러면 씨앗이 안 먹는 것이다", () => {
    // 한 경기만 보면 우연히 같을 수 있다. 여러 씨앗을 돌려 **다른 결과가
    // 나오는지**를 본다
    const seen = new Set<string>();
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = play(s);
      seen.add(`${r.home}-${r.away}-${r.pitches}`);
    }
    expect(seen.size, "여덟 씨앗이 전부 같은 경기를 냈다").toBeGreaterThan(3);
  });

  it("씨앗을 안 주면 예전 그대로 매번 다르다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const r = play(null);
      seen.add(`${r.home}-${r.away}-${r.pitches}`);
    }
    expect(seen.size, "씨앗 없이도 결과가 고정됐다 — 기본 갈래가 바뀌었다").toBeGreaterThan(3);
  });

  it("씨앗을 안 주면 상태에 씨앗이 안 남는다 — 0이 '없음'이다", () => {
    expect(play(null).seedLeft).toBe(0);
  });

  it("씨앗을 주면 다음이 이어받을 씨앗이 남는다", () => {
    // ⚠ **준 씨앗을 그대로 두면 안 된다.** `simToGameEnd`가 라인업을 만들 때
    // 쓴 난수를 처음부터 다시 쓰게 된다
    const r = play(4242);
    expect(r.seedLeft).not.toBe(0);
    expect(r.seedLeft).not.toBe(4242);
  });
});
