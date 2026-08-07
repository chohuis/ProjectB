import { describe, it, expect, beforeEach } from "vitest";
import {
  trimMailbox, MAX_MAILBOX, mailboxTrimStats, resetMailboxTrimStats,
} from "../game";
import type { MessageItem } from "../../types/main";

/**
 * 메일함 상한 정리.
 *
 * 실측(`npm run measure:mailbox`, 2시즌): **1주차에 상한 도달 · 583건이 밀려났고
 * 그중 453건이 안 읽은 것**이었다. 예전 정리는 미결 선택지만 보존하고 나머지는
 * 순수 최신순이라, **읽은 새 소식이 안 읽은 옛 소식을 밀어냈다.**
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
const OVER = 30;                        // 상한을 이만큼 넘긴다
const TOTAL = MAX_MAILBOX + OVER;

describe("trimMailbox", () => {
  beforeEach(() => { seq = 0; resetMailboxTrimStats(); });

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

  it("읽은 새 소식보다 안 읽은 옛 소식을 먼저 남긴다", () => {
    // 앞(최신) MAX_MAILBOX건은 **읽음**, 뒤(옛날) OVER건은 **안읽음**.
    // 순수 최신순이면 안 읽은 게 통째로 밀려난다
    const b = box(TOTAL, (i) => ({ readAt: i < MAX_MAILBOX ? "방금" : null }));
    const kept = trimMailbox(b);
    expect(kept.filter((m) => m.readAt === null)).toHaveLength(OVER);
    expect(mailboxTrimStats.droppedUnread).toBe(0);
  });

  it("미결 선택지는 안 읽은 것보다도 먼저 보존한다", () => {
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
    // ⚠ **읽은 것을 맨 앞(최신)에 둬야 판별력이 생긴다.** 처음엔 읽은 것을
    // 맨 뒤에 뒀는데, 그러면 순수 최신순으로 되돌려도 결과가 같아서 이 검사가
    // 변이를 못 잡았다 — 변이 검증에서 걸렸다.
    // 최신 OVER건이 읽음, 나머지 MAX_MAILBOX건이 안읽음.
    //   지금 동작 : 안 읽은 것을 전부 남긴다 → 안읽음 유실 0, 읽은 OVER건이 사라진다
    //   옛 동작   : 최신순이라 읽은 OVER건이 살고 **안읽음 OVER건이 사라진다**
    const b = box(TOTAL, (i) => ({
      readAt: i < OVER ? "방금" : null,
      category: i % 2 === 0 ? "news" : "system",
    }));
    trimMailbox(b);
    expect(mailboxTrimStats.dropped).toBe(OVER);
    expect(mailboxTrimStats.droppedUnread).toBe(0);
    const byCat = mailboxTrimStats.droppedByCategory;
    expect((byCat.news ?? 0) + (byCat.system ?? 0)).toBe(OVER);
  });
});
