/**
 * **한 주의 대회 「진출 명단」을 한 통으로** (2026-09-08 · B 소식 실측).
 *
 * 🔴 대회 소식이 주당 0.45통 · 많으면 다섯 통이라 「같은 주 같은 성격 여럿」의
 *   제일 큰 자리였다. 통수는 (그 주 동시에 도는 대회 수) × (그 주에 닫힌 라운드
 *   수)다 — `progressTournaments` 가 대회당 한 번에 한 라운드만 닫고 빠지므로
 *   호출부의 `pass` 루프가 같은 주에 여러 번 부른다.
 */
import { describe, it, expect } from "vitest";
import { bundleRoundProgressMessages } from "../weekPhases/tournamentNews";
import type { MessageItem, TableMetadata } from "../../types/main";

const msg = (n: number, rows: number): MessageItem => ({
  id: `msg-tour-round-T${n}-r2-2028-w22`,
  category: "news",
  sender: "고교야구연맹",
  subject: `대회${n} 4강 진출 4팀`,
  preview: "p",
  body: `대회${n} 8강 종료\n\n■ 4강 진출 4팀`,
  createdAt: "W22",
  readAt: null,
  metadata: {
    type: "table",
    kind: "tourRound",
    columns: [],
    rows: Array.from({ length: rows }, (_, i) => ({
      round: 3,
      home: `H${n}${i}`,
      away: `A${n}${i}`,
      date: "",
    })),
  } as TableMetadata,
});

describe("진출 명단 묶기", () => {
  it("한 통이면 안 묶는다 — 묶음 제목이 붙어 오히려 읽기 나빠진다", () => {
    expect(bundleRoundProgressMessages([msg(1, 2)], 2028, 22)).toBeNull();
    expect(bundleRoundProgressMessages([], 2028, 22)).toBeNull();
  });

  it("둘 이상이면 한 통 — 본문은 원본을 그대로 이어 붙인다", () => {
    const b = bundleRoundProgressMessages([msg(1, 2), msg(2, 3)], 2028, 22)!;
    expect(b.subject).toContain("2건");
    expect(b.body).toContain("대회1 8강 종료");
    expect(b.body).toContain("대회2 8강 종료");
  });

  it("🔴 표를 안 버린다 — 같은 `tourRound` 표라 행이 이어 붙는다", () => {
    const b = bundleRoundProgressMessages([msg(1, 2), msg(2, 3)], 2028, 22)!;
    const meta = b.metadata as TableMetadata;
    expect(meta.type).toBe("table");
    expect(meta.kind).toBe("tourRound");
    expect(meta.rows).toHaveLength(5);
  });

  it("id 에 주차가 있어 한 주 한 통이다 — 사본이 안 난다", () => {
    const a = bundleRoundProgressMessages([msg(1, 1), msg(2, 1)], 2028, 22)!;
    const c = bundleRoundProgressMessages([msg(3, 1), msg(4, 1)], 2028, 23)!;
    expect(a.id).toBe("msg-tour-week-2028-w22");
    expect(a.id).not.toBe(c.id);
  });

  it("표가 없는 소식만 있으면 표를 안 만든다", () => {
    const noMeta = { ...msg(1, 0), metadata: undefined };
    const b = bundleRoundProgressMessages(
      [noMeta, { ...msg(2, 0), metadata: undefined }],
      2028,
      22,
    )!;
    expect(b.metadata).toBeUndefined();
  });
});
