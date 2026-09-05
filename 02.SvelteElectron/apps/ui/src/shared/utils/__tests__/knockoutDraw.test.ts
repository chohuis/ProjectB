import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { knockoutMatchIds, winnerById, allScheduleEntries } from "../scheduleView";

/**
 * **넉아웃 무승부** — 실사용자 세이브에서 나온 결함의 정본 검사.
 *
 * 사건(2026-09-05 신고 · 09-06 원인 확정):
 *
 *   장미기 1R M02  동래 4:4 거제      ← 넉아웃인데 무승부로 끝났다
 *   → `result.winnerId` 가 빈 문자열
 *   → `advance_tournament_round` 가 참가팀 아닌 승자를 무시 → 승자 미기입
 *   → 그 라운드가 `live.every(winnerTeamId)` 를 영영 못 채운다
 *   → 주마다 다시 확정 → `msg-tour-my-TOUR_HS_JANGMI-r1-2028` 이 두 번
 *   → Svelte `each_key_duplicate` → **화면이 통째로 굳음(탭 전환도 안 됨)**
 *   → 게다가 장미기는 1라운드에서 죽는다(2R 7경기를 치르고도 미반영)
 *
 * 원인은 `gameSimulator` 가 대회 경기를 `phase === "season"` 으로 보고
 * 정규시즌 연장 12이닝 상한을 걸었던 것이다 — 대회 경기의 `phase` 가
 * 정말 `"season"` 이기 때문이다(`SeasonPhase` 에 대회 값이 없다).
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const bracket = (id: string, matchIds: string[]) => ({
  matches: matchIds.map((m) => ({ id: m })),
  tournamentId: id,
});

describe("넉아웃 판별 — knockoutMatchIds", () => {
  it("브래킷에 있는 경기만 넉아웃이다", () => {
    const s = {
      tournaments: {
        TOUR_A: bracket("TOUR_A", ["TOUR_A_R1_M00", "TOUR_A_R1_M01"]),
        TOUR_B: bracket("TOUR_B", ["TOUR_B_R1_M00"]),
      },
    };
    const ids = knockoutMatchIds(s);
    expect(ids.size).toBe(3);
    expect(ids.has("TOUR_A_R1_M00")).toBe(true);
    expect(ids.has("TOUR_B_R1_M00")).toBe(true);
    expect(ids.has("LEAGUE_G_0001")).toBe(false);
  });

  /**
   * 🔴 **조별예선은 넉아웃이 아니다.** 은하기·여명기 예선은 리그전이라
   *   무승부가 정상이다. `isTournament` 는 예선에도 붙으므로 그것으로
   *   가르면 예선까지 무제한 연장이 된다 — 밸런스가 움직인다.
   */
  it("조별예선(groupStages)은 넉아웃이 아니다", () => {
    const s = {
      tournaments: { TOUR_A: bracket("TOUR_A", ["TOUR_A_R1_M00"]) },
      groupStages: { TOUR_C: { matches: [{ id: "TOUR_C_QA_R1_M1" }] } },
    };
    expect(knockoutMatchIds(s).has("TOUR_C_QA_R1_M1")).toBe(false);
  });

  it("대회가 없으면 빈 집합이다 — 손상된 세이브에도 안 터진다", () => {
    expect(knockoutMatchIds({}).size).toBe(0);
    expect(knockoutMatchIds({ tournaments: null }).size).toBe(0);
    expect(knockoutMatchIds({ tournaments: { X: {} } }).size).toBe(0);
  });
});

describe("무승부 결과의 모양", () => {
  /**
   * 무승부는 `winnerId` 가 **빈 문자열**이다(`npc_sim`·`match_engine` 둘 다).
   * `winnerById` 는 그것을 그대로 싣는다 — **`has()` 는 참이고 값은 거짓**이라,
   * "결과가 있다"만 보는 코드는 무승부를 승부가 난 경기로 착각한다.
   * 이 함정이 이번 결함의 통로였다.
   */
  it("winnerById 는 무승부를 빈 문자열로 싣는다", () => {
    const s = {
      schedule: [
        { id: "G1", result: { winnerId: "TEAM_H" } },
        { id: "G2", result: { winnerId: "" } },
        { id: "G3" },
      ],
    } as unknown as Parameters<typeof winnerById>[0];
    const w = winnerById(s);
    expect(w.has("G1")).toBe(true);
    expect(w.has("G2")).toBe(true);      // ← 있다
    expect(w.get("G2")).toBe("");        // ← 그런데 승자가 없다
    expect(w.has("G3")).toBe(false);
    expect(allScheduleEntries(s).length).toBe(3);
  });
});

describe("대회 소식 id 는 주차를 담는다", () => {
  /**
   * 🔴 라운드가 두 번 확정되면 대회 소식 넷이 **다 같이** 겹친다 —
   *   한 자리(`advanceWeek` 의 라운드 루프)에서 같이 나기 때문이다.
   *   주차를 넣으면 조용히 버려지는 대신 두 통이 남아 눈에 띈다.
   */
  const TN = read("apps/ui/src/shared/usecases/weekPhases/tournamentNews.ts");
  const AW = read("apps/ui/src/shared/usecases/advanceWeek.ts");

  it.each([
    ["개막", "id: `msg-tour-open-${def.id}-${seasonYear}-w${weekNum}`"],
    ["내 팀 라운드", "id: `msg-tour-my-${def.id}-r${round}-${bracket.seasonYear}-w${weekNum}`"],
    ["진출 명단", "id: `msg-tour-round-${def.id}-r${round}-${bracket.seasonYear}-w${weekNum}`"],
    ["우승", "id: `msg-tour-champ-${def.id}-${bracket.seasonYear}-w${weekNum}`"],
  ])("%s 소식 id 에 주차가 있다", (_name, frag) => {
    expect(TN).toContain(frag);
  });

  it("대회 시상 소식 id 에도 주차가 있다", () => {
    expect(AW).toContain("id: `msg-tour-award-${def.id}-${next.seasonYear}-w${week}`");
  });

  /** 버려진 사본을 **센다** — 안 세면 소식 한 통이 조용히 사라진다 */
  it("소식함이 걷어낸 사본을 센다", () => {
    const G = read("apps/ui/src/shared/stores/game.ts");
    expect(G).toContain("export const mailboxDupStats = {");
    expect(G).toContain("mailboxDupStats.dropped++;");
  });
});
