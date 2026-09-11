import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 그 해 수상이 연감에 남는가.
 *
 * 🔴 `applySeasonAwards`는 `won`(playerId → 상 이름들)을 **이미 만들고 있었는데**
 *    로그로만 쓰고 버렸다. 다음 시즌이 되면 "작년 MVP가 누구였나"를 알 방법이
 *    없었다 — 데이터는 있는데 남기는 코드가 없던 자리다.
 *
 * ⚠ **이름을 그때 값으로 박는다.** 조회로 대신하면 은퇴·이적으로 사라진 사람이
 *   ID로 떨어진다. `LeaguePage`의 `histPersonName` 주석이 같은 함정을 적어 뒀다.
 */
const AWARDS = readFileSync(join(__dirname, "../seasonAwards.ts"), "utf8");
const PAGE = readFileSync(join(__dirname, "../../../pages/league/LeaguePage.svelte"), "utf8");
const REPO = readFileSync(join(__dirname, "../../repo/slotRepo.ts"), "utf8");

describe("수상을 연감에 남긴다", () => {
  it("`saveHistoryLeague`를 kind=awards로 부른다", () => {
    expect(AWARDS).toMatch(/saveSeasonAwards/);
    expect(AWARDS, "kind가 awards가 아니면 다른 연감을 덮어쓴다").toMatch(/kind:\s*"awards"/);
  });

  it("타입이 awards를 허용한다", () => {
    expect(REPO, "slotRepo의 kind 유니온에 awards가 없다 — 한쪽만 고치면 조용히 막힌다").toMatch(
      /"standings"\s*\|\s*"leaders"\s*\|\s*"postseason"\s*\|\s*"awards"/,
    );
  });

  it("이름을 그때 값으로 박는다 (ID를 안 흘린다)", () => {
    expect(AWARDS, "이름이 비면 안 남겨야 한다 — ID가 화면에 뜨면 안 된다").toMatch(
      /if \(!row\.name\) continue/,
    );
  });

  it("연감 저장이 실패해도 시즌 종료는 계속된다", () => {
    expect(AWARDS).toMatch(/catch \{ \/\* 연감 저장이 실패해도/);
  });
});

describe("히스토리 화면이 수상을 읽는다", () => {
  it("`getHistoryLeague`로 조회한다", () => {
    expect(PAGE).toMatch(/getHistoryLeague/);
    expect(PAGE, "kind로 안 거르면 순위표까지 섞여 들어온다").toMatch(/r\.kind === "awards"/);
  });

  it("연도를 바꾸면 초기화한다", () => {
    expect(PAGE, "historyAwards를 안 비우면 이전 연도 수상이 남는다").toMatch(
      /historyAwards\s*=\s*\[\]/,
    );
  });
});
