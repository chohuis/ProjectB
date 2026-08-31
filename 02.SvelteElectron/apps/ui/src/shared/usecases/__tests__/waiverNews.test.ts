import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 웨이버 소식 (A단계 · 2/6).
 *
 * ⚠ **주인공 팀이 걸린 것만 보낸다.** 리그 전체는 실측 105~232명이라
 *   그대로 보내면 소식함이 한 해에 막힌다.
 *
 * 🔴 **"우리 팀에서 나갔다"를 세려다 죽은 갈래를 만들 뻔했다.**
 *   Rust `waiver_claim` 이 `from_team_id: None` 을 넣어서 **어디서 왔는지
 *   모른다** — 방출 시점의 팀을 안 넘긴다. 영입만 센다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("웨이버 소식", () => {
  const src = strip(read("apps/ui/src/shared/usecases/seasonRollover.ts"));
  const rust = read("packages/engine-native/src/npc_sim.rs");

  it("소식을 만든다", () => {
    expect(src.includes("msg-waiver-")).toBe(true);
    expect(src.includes("웨이버 영입")).toBe(true);
  });

  it("주인공 팀 것만 보낸다", () => {
    expect(src.includes("e.toTeamId === myTeam")).toBe(true);
  });

  it("id에 연도가 들어간다", () => {
    expect(src.includes("msg-waiver-${now}-${myTeam}")).toBe(true);
  });

  it("그 해 것만 센다", () => {
    // `career_events` 는 커리어 내내 쌓인다 — 연도를 안 보면 옛 영입도 센다
    expect(src.includes("e.year !== now")).toBe(true);
  });

  it("🔴 나간 쪽은 안 센다 — Rust가 원 소속을 안 남긴다", () => {
    // 세려고 하면 `fromTeamId` 가 늘 undefined 라 **죽은 갈래**가 된다.
    // 이 검사는 Rust 가 그대로인 한 유효하다 — 바뀌면 여기가 먼저 실패한다.
    expect(rust.includes('event_type: "waiver_claim".into(),\n                from_team_id: None,'),
      "Rust 가 원 소속을 안 넣는다").toBe(true);
    // ⚠ **같은 파일의 독립 재도전은 `fromTeamId` 를 정당하게 쓴다** —
    //   거긴 Rust 가 원 소속을 넣기 때문이다. 파일 전체에서 그 문자열을
    //   금지하면 그쪽이 걸린다(실측: 이 검사가 그렇게 깨졌다).
    //   **웨이버 판정 줄 자체**를 본다.
    expect(src.includes(
      "else if (e.fromTeamId === myTeam) outbound.push"
    ), "웨이버에서 나간 쪽을 세면 죽은 갈래다").toBe(false);
  });
});
