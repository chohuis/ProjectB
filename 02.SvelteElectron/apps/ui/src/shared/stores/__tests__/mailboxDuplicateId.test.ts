import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gameStore, mailboxDupStats, resetMailboxDupStats } from "../game";
import type { MessageItem } from "../../types/main";

/**
 * 소식 id 가 겹치면 **앱이 통째로 죽는다** — 그래서 겹친 채로 두지 않는다.
 *
 * 🔴 2026-09-05 실사용자 세이브(2028 W18 · 고교 3학년)에서 재현한 것:
 *
 *     [pageerror] each_key_duplicate
 *     Keyed each block has duplicate key `msg-tour-my-TOUR_HS_JANGMI-r1-2028`
 *     at indexes 2 and 10        in NewsPage.svelte
 *
 *   `NewsPage`가 `{#each visible as msg (msg.id)}`로 키를 쓰는데 Svelte 5는
 *   키가 겹치면 **던진다.** 렌더 도중 던지니 반응성이 통째로 멎어 화면이 굳고
 *   **탭 전환조차 안 된다.** 껐다 켜도 같은 주에 같은 사본이 다시 만들어져
 *   안 풀렸다 — 테스터가 「껐다 켜도 안 풀린다」고 신고한 것이 이 형태다.
 *
 * ⚠ 불러오기(`normalizeMailbox`)는 이미 겹친 것을 걷어내고 있었다. 구멍은
 *   **들어오는 문**(`pushMailbox`)이었다 — 진행 중에 새로 만들어진 사본은
 *   아무도 안 걸렀다.
 *
 * ⚠ id 가 유일해야 하는 이유는 화면 말고도 있다. 읽음 처리·선택 확정·대기
 *   해제가 전부 id 로 찾는다(`markMessageRead` · `resolveDecision` ·
 *   `resolvePendingAction("message", id)`) — 사본이 있으면 그것들도 엉킨다.
 *   그러니 사본을 버리는 것이 손실이 아니다.
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

const ids = () => get(gameStore).mailbox.map((m) => m.id);

describe("소식함 — id 사본을 들이지 않는다", () => {
  it("같은 id 를 두 번 넣어도 한 통만 남는다", () => {
    const id = `dup-${seq++}`;
    gameStore.addMessage(msg({ id, subject: "먼저" }));
    gameStore.addMessage(msg({ id, subject: "나중" }));
    expect(ids().filter((x) => x === id).length).toBe(1);
  });

  it("나중에 온 것이 남는다 — 소식함은 최신순이고 앞이 새 소식이다", () => {
    const id = `dup-${seq++}`;
    gameStore.addMessage(msg({ id, subject: "먼저" }));
    gameStore.addMessage(msg({ id, subject: "나중" }));
    const kept = get(gameStore).mailbox.find((m) => m.id === id);
    expect(kept?.subject).toBe("나중");
  });

  it("한 번에 들어온 배열 안에서 겹쳐도 걸러진다", () => {
    const id = `batch-${seq++}`;
    gameStore.addMessages([msg({ id }), msg({ id }), msg({ id })]);
    expect(ids().filter((x) => x === id).length).toBe(1);
  });

  it("겹치지 않는 소식은 그대로 다 들어간다", () => {
    const before = ids().length;
    gameStore.addMessages([msg(), msg(), msg()]);
    expect(ids().length).toBe(before + 3);
  });

  it("🔴 소식함 전체에 id 사본이 하나도 없다", () => {
    const seen = new Set<string>();
    for (const x of ids()) {
      expect(seen.has(x), `id 사본: ${x}`).toBe(false);
      seen.add(x);
    }
  });
});

// ── 화면 쪽 방어 (문자열 포함으로만 본다 — 정규식 금지) ──────────────
const ROOT = resolve(__dirname, "../../../../../..");
const NEWS = readFileSync(resolve(ROOT, "apps/ui/src/pages/news/NewsPage.svelte"), "utf8");
const MAIN = readFileSync(resolve(ROOT, "apps/ui/src/pages/main/MainPage.svelte"), "utf8");

describe("NewsPage — 죽지 않는 목록", () => {
  it("소식함을 그대로 쓰지 않고 사본을 걷어낸 뒤 쓴다", () => {
    expect(NEWS.includes("$: msgs = dedupeById($gameStore.mailbox);")).toBe(true);
  });

  it("🔴 미결 선택지는 필터를 타지 않는다 — 필터가 걸리면 경고까지 같이 사라졌다", () => {
    expect(NEWS.includes("$: pendingMsgs = msgs.filter(")).toBe(true);
    expect(NEWS.includes("$: pendingMsgs = filtered.filter(")).toBe(false);
  });

  it("🔴 선택지 효과를 기다린 뒤 저장한다 — `void` 로 띄우면 효과가 빠진 채 저장된다", () => {
    expect(NEWS.includes("void applyDecision(")).toBe(false);
    expect(NEWS.includes("await applyDecision(selected.id, optionId);")).toBe(true);
  });
});

describe("MainPage — 조용히 갇히지 않는다", () => {
  it("경기 대기를 일정에서 못 찾으면 표식을 세운다", () => {
    expect(MAIN.includes("$: gameEntryMissing = !!pendingGame && !pendingGameEntry;")).toBe(true);
  });

  it("못 찾은 이유를 콘솔에 남긴다", () => {
    expect(MAIN.includes("function reportMissingGameEntry(")).toBe(true);
    expect(MAIN.includes("일정에서 못 찾았다")).toBe(true);
  });

  it("빠져나갈 길이 있다 — 탭이 전부 잠긴 채 열 창이 없기 때문이다", () => {
    expect(MAIN.includes("async function dropMissingGame(")).toBe(true);
    expect(MAIN.includes("이 경기를 건너뛴다")).toBe(true);
  });
});

describe("걷어낸 사본을 센다 — 조용히 사라지지 않게", () => {
  /**
   * 🔴 **막는 것과 아는 것은 다른 일이다** (2026-09-06 · A).
   *
   * `dedupeMailbox` 는 사본을 버려 화면을 살린다. 그런데 **버렸다는 사실을
   * 아무도 안 보면 소식 한 통이 그냥 사라진다** — 증상만 없어지고 만드는
   * 쪽의 결함은 남는다. 실제로 그랬다: 대회 라운드가 주마다 다시 확정되며
   * 소식을 다시 냈고, 화면을 고친 뒤에는 그게 조용히 버려지고 있었다.
   *
   * `check:msgdupid` 가 이 값을 0 으로 못 박는다.
   */
  it("같은 id 가 두 번 오면 센다", () => {
    resetMailboxDupStats();
    const id = `dup-count-${seq++}`;
    gameStore.addMessage(msg({ id, subject: "먼저" }));
    expect(mailboxDupStats.dropped).toBe(0);
    gameStore.addMessage(msg({ id, subject: "나중" }));
    expect(mailboxDupStats.dropped).toBe(1);
    expect(mailboxDupStats.byId[id]).toBe(1);
  });

  it("id 가 다르면 안 센다", () => {
    resetMailboxDupStats();
    gameStore.addMessage(msg());
    gameStore.addMessage(msg());
    expect(mailboxDupStats.dropped).toBe(0);
  });
});
