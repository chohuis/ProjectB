import { describe, it, expect, beforeEach } from "vitest";
import { trimMailbox, MAX_MAILBOX, mailboxTrimStats, resetMailboxTrimStats } from "../game";
import type { MessageItem } from "../../types/main";

/**
 * 메일함 상한 정리 — **미결 보존 + 나머지는 오래된 순(FIFO)**.
 * (사용자 확정 2026-09-03 · `docs/PLAN_MESSAGE_DASHBOARDS.md` §8)
 *
 * 🔴 예전엔 「안 읽음 우선」 단계가 미결과 나머지 사이에 하나 더 있었다.
 * 그 단계가 **나이를 안 봐서** 안 읽었다는 이유만으로 지난 시즌 소식이 이번
 * 주 소식보다 오래 버텼다. 지웠다.
 *
 * ⚠ 이 검사는 순서만 본다. 유실 총량은 상한 대비 생산량이 정하므로 여기서
 * 판정하지 않는다 — 숫자는 계측이 낸다.
 */

let seq = 0;
const msg = (over: Partial<MessageItem> = {}): MessageItem => ({
  id: `M${seq++}`,
  category: "news",
  sender: "테스트",
  subject: "제목",
  preview: "미리보기",
  body: "본문",
  createdAt: "W1",
  readAt: null,
  ...over,
});

/** 목록은 최신순이다 — 앞이 새 소식 */
const box = (n: number, over: (i: number) => Partial<MessageItem> = () => ({})) =>
  Array.from({ length: n }, (_, i) => msg(over(i)));

/**
 * ⚠ **표본 크기를 상수로 적으면 안 된다.** 처음엔 60·80을 박아 뒀는데, 상한이
 * 50 → 200으로 바뀌자 표본이 상한보다 작아져 `trimMailbox`가 아무것도 안 자르고
 * 검사가 **통과해 버렸다**(자르는 경로를 한 번도 안 밟는다). 상한 상대값으로 둔다.
 */
const OVER = 30; // 상한을 이만큼 넘긴다
const TOTAL = MAX_MAILBOX + OVER;

describe("trimMailbox", () => {
  beforeEach(() => {
    seq = 0;
    resetMailboxTrimStats();
  });

  it("상한 이하면 그대로 둔다", () => {
    const b = box(MAX_MAILBOX);
    expect(trimMailbox(b)).toHaveLength(MAX_MAILBOX);
    expect(mailboxTrimStats.dropped).toBe(0);
  });

  it("상한을 넘으면 상한까지 자른다", () => {
    expect(trimMailbox(box(MAX_MAILBOX + 20))).toHaveLength(MAX_MAILBOX);
  });

  it("id가 겹쳐도 상한이 지켜진다", () => {
    // ⚠ 예전엔 `Set<id>`로 고르고 `filter(m => keepIds.has(m.id))`로 걸러서,
    // **같은 id를 가진 소식이 슬롯 하나만 쓰면서 사본이 전부 통과했다.**
    // 실측에서 보유가 200 상한을 넘어 237이 됐다(미결은 1건뿐이었다).
    // 소식 id는 생성 지점마다 규칙이 달라 유일성을 보장할 수 없다 —
    // 상한 로직이 그걸 전제하면 안 된다.
    const b = box(TOTAL, () => ({ readAt: null }));
    for (const m of b) m.id = "SAME";
    expect(trimMailbox(b)).toHaveLength(MAX_MAILBOX);
  });

  it("안 읽었다고 오래 버티지 않는다 — 꼬리(옛날)부터 밀린다", () => {
    // 앞(최신) MAX_MAILBOX건은 **읽음**, 뒤(옛날) OVER건은 **안읽음**.
    // 🔴 옛 규칙이면 안 읽은 꼬리 OVER건이 살아남고 읽은 최신 OVER건이 밀렸다.
    //    FIFO 는 반대다 — 읽었든 아니든 **최신 1500칸**이 남는다.
    const b = box(TOTAL, (i) => ({ readAt: i < MAX_MAILBOX ? "방금" : null }));
    const kept = trimMailbox(b);
    expect(kept.filter((m) => m.readAt === null)).toHaveLength(0);
    expect(mailboxTrimStats.droppedUnread).toBe(OVER);
  });

  it("밀려난 것은 전부 꼬리 쪽이다 — 남은 것이 앞에서부터 연속이다", () => {
    // §8-4 셋째 줄: "밀려난 것의 나이는 전부 가장 오래된 쪽"이어야 한다.
    // 나이를 재는 자리는 `createdAt`(주차뿐이다)이 아니라 **배열 위치**다.
    // 읽음·안읽음을 번갈아 섞어 둬서, 남은 것이 앞에서부터 끊기지 않고
    // 이어지는지로 판정한다 — 중간에 하나라도 빠지면 FIFO 가 아니다.
    const b = box(TOTAL, (i) => ({ readAt: i % 3 === 0 ? "방금" : null }));
    const expected = b.slice(0, MAX_MAILBOX).map((m) => m.id);
    expect(trimMailbox(b).map((m) => m.id)).toEqual(expected);
  });

  it("미결 선택지는 가장 오래된 자리에 있어도 보존한다", () => {
    // 맨 뒤(가장 옛날)에 미결 하나. 앞은 전부 안읽음이라 자리 경쟁이 최대다
    const b = box(TOTAL, () => ({ readAt: null }));
    b[TOTAL - 1] = msg({
      readAt: "방금",
      decision: { selectedOptionId: null } as MessageItem["decision"],
    });
    const kept = trimMailbox(b);
    expect(kept.some((m) => m.decision?.selectedOptionId === null)).toBe(true);
  });

  it("안 읽은 것이 상한을 넘어도 새 소식이 밀리지 않는다", () => {
    // 전부 안읽음 — ②단계가 최신순이라 앞쪽이 살아야 한다
    const b = box(TOTAL, () => ({ readAt: null }));
    const kept = trimMailbox(b);
    expect(kept[0].id).toBe(b[0].id);
    expect(kept).toHaveLength(MAX_MAILBOX);
  });

  it("밀려난 건수를 안읽음·분류별로 센다", () => {
    // 최신 OVER건이 읽음, 나머지(꼬리) MAX_MAILBOX건이 안읽음.
    //   지금(FIFO) : 최신 MAX_MAILBOX칸이 남으므로 **꼬리 OVER건이 사라지고
    //                그건 전부 안읽음**이다
    //   옛 동작    : 안 읽은 것을 먼저 남겨 읽은 최신 OVER건이 사라졌다
    // ⚠ `droppedUnread` 를 남긴 이유가 여기 있다 — 0 이던 값이 OVER 가 된다.
    //   우선순위를 지운 대가가 얼마인지 계측이 이 숫자로 낸다.
    const b = box(TOTAL, (i) => ({
      readAt: i < OVER ? "방금" : null,
      category: i % 2 === 0 ? "news" : "system",
    }));
    trimMailbox(b);
    expect(mailboxTrimStats.dropped).toBe(OVER);
    expect(mailboxTrimStats.droppedUnread).toBe(OVER);
    const byCat = mailboxTrimStats.droppedByCategory;
    expect((byCat.news ?? 0) + (byCat.system ?? 0)).toBe(OVER);
  });
});
