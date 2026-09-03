import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import type { MessageItem } from "../types/main";

/**
 * **군 이벤트의 결과를 소식으로 한 통 남긴다** (사용자 확정 · B-5).
 *
 * 🔴 뜬 소식과 고른 결과가 갈려 있었다. 이벤트가 뜰 때는
 * `msg-mil-{id}-{year}-w{week}` 한 통이 남는데(`advanceWeek.ts`), **무엇을
 * 골랐고 그게 뭘 했는지는 모달에만 있고 아무 데도 안 남았다.** 2년(104주)에
 * 42번 뜨는 이벤트를 나중에 되돌아보면 "무슨 일이 있었다"만 있고
 * "내가 뭘 골랐다"가 없다.
 *
 * ⚠ **통수를 걱정할 자리가 아니다.** 결과까지 더해도 연 42통이고, 사용자가
 * 그대로 두기로 한 훈련 소식이 연 52통이다. 사용자가 거부한 건 통수가 아니라
 * **개별 소식이 접히는 것**이다(`advanceWeek.ts` 의 같은 주석).
 *
 * ⚠ **군 이벤트에만 건다.** 다른 무대 이벤트는 선택이 소식(`decision`)에
 * 붙어 있어 이미 소식함에서 되짚을 수 있다 — 군만 모달 전용이었다.
 */
export function buildMilitaryResultMessage(
  eventId: string,
  title: string,
  choice: { id: string; label: string; effectHint?: string } | undefined,
): MessageItem | null {
  // 군 풀 다섯이 전부 `MIL_` 로 시작한다 (military · common · general · sports · life)
  if (!eventId.startsWith("MIL_")) return null;
  if (!choice) return null;

  const g = get(gameStore);
  const s = get(seasonStore);
  const isSportsUnit = g.protagonist.militaryUnit === "sports";
  const week = s.currentWeek;

  // 🔴 **조사를 붙이지 않는다** (B-28 실측 — 선택지 176개 중 172개가 무받침이라
  //    「…를 골랐다」가 맞는 자리였다). 자리표시자 뒤에 조사를 두면 받침을
  //    코드가 봐야 하고, 그건 데이터가 늘 때마다 틀리는 형태다. 체언 종지다.
  const lines = [`선택: ${choice.label}`];
  if (choice.effectHint) lines.push(choice.effectHint);

  return {
    // ⚠ **id 는 유일해야 한다.** 소식 목록이 id 를 키로 잡아서 중복이 하나만
    //   생겨도 Svelte 가 죽고 **세이브가 아예 안 열린다**(CLAUDE.md).
    //   뜬 소식(`msg-mil-{id}-…`)과 갈리게 `res` 를 넣고, 반복 가능한 종이
    //   같은 해에 두 번 떠도 갈리게 **연도 + 주차**를 둘 다 넣는다.
    id: `msg-mil-res-${eventId}-${s.seasonYear}-w${week}`,
    category: "system",
    sender: isSportsUnit ? "체육부대" : "군 복무",
    // ⚠ 대시를 안 쓴다 (부제·대시 금지 규칙 · B-28)
    subject: `${title} 결과`,
    preview: lines[0],
    body: lines.join("\n"),
    createdAt: `W${week}`,
    readAt: null,
  };
}
