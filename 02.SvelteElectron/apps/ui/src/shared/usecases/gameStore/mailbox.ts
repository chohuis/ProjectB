/**
 * **소식함 — 상한 · 중복 · 집계** (2026-09-30 · Ⅱ-2 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `stores/game.ts` 의 모듈
 *   수준 함수·상수 열둘이 그대로 나왔다 — 상한(`MAX_MAILBOX`) · 집계 셋
 *   (`mailboxTrimStats`·`mailboxProduceStats`·`mailboxDupStats`)과 그 초기화 ·
 *   종류 키(`messageKindOf`) · 중복 제거(`dedupeMailbox`) · 넣는 문
 *   (`pushMailbox`) · 상한 적용(`trimMailbox`).
 *
 * ⚠ **왜 store 밖으로 나왔나.** 이건 store 상태를 만지는 코드가 아니라
 *   **소식함 정책**이다(상한·중복·유실 집계). `store 는 update(s => …) 만`
 *   이라는 규칙의 반대쪽이라 여기가 제자리다. `game.ts` 는 이 이름들을
 *   **그대로 다시 내보낸다** — `from "../stores/game"` 로 부르던 길
 *   (화면·계측·검사)이 한 줄도 안 바뀐다.
 *
 * ⚠ **정본은 여기 하나다.** 「같은 표·같은 함수를 두 곳에 두지 않는다」가
 *   이 저장소가 제일 많이 밟은 형태라(`CLAUDE.md`), `game.ts` 는 사본을
 *   만들지 않고 다시 내보내기만 한다.
 *
 * ⚠ 검사는 `gamePathSrc()`/`scripts/game-path-src.cjs` 가 이 파일을 `game.ts` 와
 *   한 덩이로 읽는다 — 검사 문장이 한 글자도 안 바뀐다.
 */
import type { MessageItem } from "../../types/main";

// ── 메일함 정리: 미결 선택지 메시지는 항상 보존 ────
// 회귀·시나리오가 "메시지가 안 온 건가, 밀려난 건가"를 구분하려면 이 값을 알아야 한다
//
// **50 → 200 (2026-08-07, 사용자 확정).** 근거는 실측이다 —
// `npm run measure:mailbox` 2시즌에서 **638건이 생산되고 588건이 밀려났으며
// 그중 447건이 한 번도 안 읽힌 것**이었다. 상한 50은 주당 약 6.1건 생산 대비
// **8주치**밖에 안 남아, 소식이 W1부터 상한에 붙은 채로 계속 사라졌다.
// 200이면 약 33주 — 한 시즌(52주)의 대부분을 담는다.
//
// ⚠ **순서 수정만으로는 안 풀렸다.** `trimMailbox`가 `readAt`을 보게 고친 뒤에도
// 유실이 453 → 447로 사실상 그대로였다(두 실행이 다른 세계라 이 차이는 잡음이다).
// 순서는 거꾸로였던 게 맞지만 병목은 생산량 대비 상한이었다.
// 🔴 **200 → 500** (트랙 B 요청 · 2026-08-24). 200은 약 33주라 한 시즌을 못 담았다.
//    500이면 약 83주 — 한 시즌 반이다.
//
//    비용은 B가 IPC 바이트로 쟀다(이 프로젝트 잣대):
//      setProtagonist 주당  266 KB → 304 KB (+38 KB)
//      전체 IPC 비중         0.7% → 0.8%   (전체 +0.35%)
//    ⚠ `measure:perf` 기준이라 **벽시계가 아니다.**
//
//    화면은 B가 미리 준비했다 — 소식함이 60건씩 점진 렌더링이라
//    500통이어도 DOM에는 60건만 올라간다.
//    🔴 **500 → 1500** (사용자 확정 · 2026-08-30). 500도 모자랐다.
//
//    실측(씨앗 111 · 3시즌 · `probe-mailbox.cjs`):
//        2026 종료  340통          여유
//        2027 종료  500통 · 잘림   `msg-tour` 420 (**84%**)
//        2028 종료  500통 · 잘림   `msg-tour` 273
//
//    **대회 소식이 혼자 소식함을 먹는다.** 그건 사용자 확정 동작이고
//    (2026-08-08 "내 팀이 없는 라운드도 32강부터 알린다"), 줄이는 대신
//    자리를 늘리기로 했다 — 대회 흐름을 보는 게 그만한 값이 있다.
//
//    ⚠ 비용은 500 때 잰 값에서 비례로 본다: IPC 주당 +38KB → 약 +114KB,
//      전체 비중 0.8% → 약 1.1%. **다음 `measure:perf` 에서 실측한다.**
//    ⚠ 화면은 60건씩 점진 렌더링이라 통수가 늘어도 DOM 은 그대로다.
export const MAX_MAILBOX = 1500;

/**
 * 밀려나 사라진 소식의 **누계** — 계측 전용이고 화면 로직은 읽지 않는다.
 *
 * ⚠ **이게 없으면 상한 정책을 평가할 수 없다.** 메일함을 들여다봐야 보이는 건
 * *살아남은* 50건뿐이라, "소식이 애초에 안 왔다"와 "왔는데 밀려서 사라졌다"가
 * 똑같이 보인다. 이 프로젝트는 육성선수에서 정확히 그 함정에 빠졌다 — 효과부터
 * 재고 "실제로 몇 개 만들었나"를 안 찍어서 안 도는 건지 모자란 건지 못 갈랐다.
 */
export const mailboxTrimStats = {
  /** 상한에 밀려 사라진 총 건수 */
  dropped: 0,
  /** 그중 **한 번도 안 읽힌** 것. 사용자가 존재 자체를 모르고 잃은 소식이다 */
  droppedUnread: 0,
  /** 분류별 유실 — 한 종류가 다른 종류를 밀어내는지 본다 */
  droppedByCategory: {} as Record<string, number>,
};

export function resetMailboxTrimStats(): void {
  mailboxTrimStats.dropped = 0;
  mailboxTrimStats.droppedUnread = 0;
  mailboxTrimStats.droppedByCategory = {};
}

/**
 * 소식의 **종류 키** — `id`에서 주차·연도·타임스탬프·대문자 ID를 떼면
 * 생성 지점이 남는다 (`msg-standings-LEAGUE_KBL-w12-171…` → `msg-standings`).
 *
 * ⚠ **`subject`로 묶으면 안 된다.** 문장 뱅크가 같은 종류의 제목을 여러 갈래로
 * 만들어서 한 종류가 흩어진다. `category`는 4종뿐이라 43종을 구분 못 한다.
 */
export function messageKindOf(id: string): string {
  return id
    .replace(/-r\d+$/, "") // 대회 라운드
    .replace(/-[A-Z][A-Z0-9_]*/g, "") // TOUR_/LEAGUE_/EVT_ 같은 대문자 ID
    .replace(/-?w\d+.*$/, "") // 주차 이후 전부
    .replace(/-\d{4}.*$/, "") // 연도 이후 전부
    .replace(/-\d+$/, "") // 남은 숫자 꼬리
    .replace(/-+$/, "");
}

/**
 * **생산** 시점 집계 — 종류별로 몇 통이 만들어졌나.
 *
 * ⚠ **살아남은 메일함을 세면 단계별 비교를 못 한다.** 상한에 밀려 사라진 뒤에
 * 세는 것이라 ①이미 없어진 종류가 0으로 보이고 ②여러 시즌을 밀면 고교와 프로
 * 소식이 한 메일함에 섞인다. 그래서 들어오는 자리에서 센다.
 *
 * 집계 지점을 `pushMailbox` 하나로 모은 이유도 같다 — `addMessage`·
 * `addMessages`·`applyWeekEndBatch` 세 곳에 각각 넣으면 네 번째 경로가
 * 생길 때 조용히 빠진다.
 */
export const mailboxProduceStats = {
  total: 0,
  byKind: {} as Record<string, number>,
  /**
   * 종류별 **제목 인구조사** (C2 문안 은행). `{ 종류: { 제목: 건수 } }`.
   *
   * 🔴 은행을 배선하고도 **한 문장만 나오는** 결함이 조용하다 — 소식은
   *   오고 개수도 맞고 제목만 늘 같다. 세지 않으면 15년을 돌려도 안 보인다.
   */
  subjectsByKind: {} as Record<string, Record<string, number>>,
  /** 종류별 직전 제목 — 연속 반복을 세는 입력 */
  lastSubject: {} as Record<string, string>,
  /**
   * 종류별 **연속 반복 횟수** — 같은 제목이 바로 다음 통에 또 나온 수.
   *
   * ⚠ 0 이어야 한다. `pickSentence` 가 직전 인덱스를 빼는데도 0 이 아니면
   *   기억(`sentenceMemory`)이 안 돌아온 것이다 — 세이브에 안 남기면
   *   매주 −1 에서 시작해 같은 것이 이어 나온다.
   */
  repeatByKind: {} as Record<string, number>,
};

export function resetMailboxProduceStats(): void {
  mailboxProduceStats.total = 0;
  mailboxProduceStats.byKind = {};
  mailboxProduceStats.subjectsByKind = {};
  mailboxProduceStats.lastSubject = {};
  mailboxProduceStats.repeatByKind = {};
}

/**
 * **id 가 겹쳐 버려진 소식** — `dedupeMailbox` 가 걷어낼 때마다 센다.
 *
 * 🔴 `dedupeMailbox` 는 **막는 자리**다. 걸리는 게 있다면 그건 만드는 쪽의
 *   결함이고, 세지 않으면 **소식 한 통이 조용히 사라진 채로 지나간다.**
 *   이 값이 0 이 아니면 걸리게 하는 것이 `check:msgdupid` 다.
 *
 * ⚠ `check:msgdup` 과 다른 것이다 — 그쪽은 「같은 id 로 **다른 소식**」을,
 *   여기는 「같은 id 가 **두 번**」을 본다.
 */
export const mailboxDupStats = {
  dropped: 0,
  byId: {} as Record<string, number>,
};

export function resetMailboxDupStats(): void {
  mailboxDupStats.dropped = 0;
  mailboxDupStats.byId = {};
}

/**
 * 소식함에서 **id가 겹치는 사본을 걷어낸다** — 앞(최신)에 있는 것을 남긴다.
 *
 * 🔴 **id가 겹치면 화면이 통째로 죽는다** (2026-09-05 · 실사용자 세이브).
 *   `NewsPage`가 `{#each visible as msg (msg.id)}`로 그리는데 Svelte 5는
 *   키가 겹치면 `each_key_duplicate`를 **던진다** — 렌더 도중 던지므로
 *   반응성 자체가 멎어, 화면이 굳고 **탭 전환조차 안 된다.** 껐다 켜도
 *   같은 소식함을 다시 읽으니 안 풀린다. 테스터가 신고한 형태가 이것이다:
 *
 *     [pageerror] each_key_duplicate
 *     Keyed each block has duplicate key `msg-tour-my-TOUR_HS_JANGMI-r1-2028`
 *     at indexes 2 and 10   in NewsPage.svelte
 *
 * ⚠ **id는 원래 유일해야 한다.** 소식을 읽음 처리(`markMessageRead`)·선택
 *   확정(`resolveDecision`)·대기 해제(`resolvePendingAction("message", id)`)가
 *   전부 id로 찾는다 — 사본이 있으면 그것들도 엉킨다. 그러니 여기서 지우는
 *   것이 손실이 아니다.
 *
 * ⚠ 이건 **막는 자리**지 고치는 자리가 아니다. 사본을 만드는 쪽이 따로
 *   있다(`advanceWeek`의 대회 라운드 루프가 같은 라운드를 다시 확정하면
 *   `buildMyRoundMessage`가 같은 id를 또 만든다 — 그 id에는 주차가 없다).
 *   그쪽은 엔진 진행 로직이라 여기서 손대지 않는다.
 */
function dedupeMailbox(list: MessageItem[]): MessageItem[] {
  const seen = new Set<string>();
  const out: MessageItem[] = [];
  for (const m of list) {
    if (seen.has(m.id)) {
      // 🔴 **세고 찍는다.** 안 세면 소식 한 통이 조용히 사라진다 —
      //   `mailboxDupStats` 머리말. 만드는 쪽이 고쳐지면 0 이 된다.
      mailboxDupStats.dropped++;
      mailboxDupStats.byId[m.id] = (mailboxDupStats.byId[m.id] ?? 0) + 1;
      continue;
    }
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** 들어오는 소식을 집계하고 상한을 적용한다. 메일함에 넣는 유일한 문이다 */
// `export` 는 Ⅱ-2 덩이 둘(시즌 종료)이 같은 합치기를 쓰기 때문이다 — 정본은 여기 하나다
export function pushMailbox(incoming: MessageItem[], current: MessageItem[]): MessageItem[] {
  for (const m of incoming) {
    mailboxProduceStats.total++;
    const k = messageKindOf(m.id);
    mailboxProduceStats.byKind[k] = (mailboxProduceStats.byKind[k] ?? 0) + 1;
    // 제목 인구조사 — 은행이 실제로 여러 문장을 내고 있나 (C2)
    const subj = m.subject ?? "";
    const bucket =
      mailboxProduceStats.subjectsByKind[k] ?? (mailboxProduceStats.subjectsByKind[k] = {});
    bucket[subj] = (bucket[subj] ?? 0) + 1;
    if (mailboxProduceStats.lastSubject[k] === subj) {
      mailboxProduceStats.repeatByKind[k] = (mailboxProduceStats.repeatByKind[k] ?? 0) + 1;
    }
    mailboxProduceStats.lastSubject[k] = subj;
  }
  return trimMailbox(dedupeMailbox([...incoming, ...current]));
}

/**
 * 상한을 넘긴 메일함을 자른다. 보존 우선순위는 **두 단계**다.
 *
 *   ① 미결 선택지 — 버리면 진행이 막힌다
 *   ② 나머지는 들어온 순 — 최신 `MAX_MAILBOX`칸을 남기고 오래된 것부터 버린다
 *
 * 🔴 **「안 읽음 우선」 단계를 지웠다** (사용자 확정 2026-09-03 ·
 * `docs/PLAN_MESSAGE_DASHBOARDS.md` §8). 그 단계가 **나이를 안 봤다** —
 * 안 읽었다는 이유만으로 지난 시즌 연습경기 예정이 이번 주 계약서보다 오래
 * 버텼다. 소식함은 시간 순 목록인데 버리는 순서만 시간을 안 보고 있었다.
 *
 * ⚠ **잃는 게 거의 없다.** 아래 실측이 그렇게 적고 있다 — 2시즌에서 50칸 중
 * 41칸이 이미 안 읽은 상태였고, **읽은 9칸을 늦게 버리는 것이 그 단계의 효과
 * 전부**였다. 안 읽은 것이 이미 대부분이라 우선순위가 실제로 가르는 게 없다.
 *
 * ⚠ 오래 남아야 하는 소식은 소식함이 아니라 **기록 탭 사본**이 맡는다
 * (`PLAN_MESSAGE_DASHBOARDS.md` §7). 여기서 종류별로 나누지 않는다.
 *
 * `take`는 배열을 앞에서부터 훑고 소식함은 **최신순**이라, ② 한 줄이면
 * 최신 `MAX_MAILBOX`칸이 남고 꼬리(가장 오래된 쪽)부터 밀린다.
 *
 * ⚠ `mailboxTrimStats.droppedUnread`는 **그대로 둔다.** 우선순위가 사라졌으니
 * 안 읽은 채 밀리는 수가 늘 것이고, 그게 이 변경의 값이다 — 재야 보인다.
 */
export function trimMailbox(mailbox: MessageItem[]): MessageItem[] {
  if (mailbox.length <= MAX_MAILBOX) return mailbox;

  // ⚠ **id가 아니라 위치로 고른다.** 예전엔 `Set<id>`에 담고
  // `filter(m => keepIds.has(m.id))`로 걸렀는데, **id가 겹치는 소식이 있으면
  // 슬롯은 하나만 쓰면서 사본이 전부 통과했다** — 실측에서 보유가 상한 200을
  // 넘어 237이 됐고(미결은 1건뿐이라 그걸로는 설명이 안 된다), "상한이 안
  // 지켜진다"로 읽힐 뻔했다. 위치는 언제나 유일하다.
  const keep = new Set<number>();
  let slots = MAX_MAILBOX;

  const take = (pick: (m: MessageItem) => boolean) => {
    for (let i = 0; i < mailbox.length; i++) {
      if (slots <= 0) break;
      if (keep.has(i) || !pick(mailbox[i])) continue;
      keep.add(i);
      slots--;
    }
  };

  // ① 미결 decision — 상한을 넘겨서라도 남긴다(진행이 막히므로)
  mailbox.forEach((m, i) => {
    if (m.decision && m.decision.selectedOptionId === null) {
      keep.add(i);
      slots--;
    }
  });
  // ② 나머지 — 앞(최신)부터 채운다. 자리가 떨어지면 꼬리(오래된 것)가 밀린다
  take(() => true);

  mailbox.forEach((m, i) => {
    if (keep.has(i)) return;
    mailboxTrimStats.dropped++;
    if (m.readAt === null) mailboxTrimStats.droppedUnread++;
    mailboxTrimStats.droppedByCategory[m.category] =
      (mailboxTrimStats.droppedByCategory[m.category] ?? 0) + 1;
  });

  return mailbox.filter((_, i) => keep.has(i));
}
