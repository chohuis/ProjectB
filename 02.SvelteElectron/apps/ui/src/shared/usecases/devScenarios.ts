// ── 테스트 시나리오 (dev 전용) ────────────────────────────────────
//
// **자동 테스트는 데이터만 본다. 화면은 아무도 안 봤다.**
// 최근 결함 두 건(상무 모달 `curYear` ReferenceError, 보드 순서 표시)이 정확히
// 그 경계에 있었다 — `test:v3` 26스위트를 전부 통과하면서 화면은 깨져 있었다.
//
// 이 러너는 **화면이 그려지는지는 못 본다.** 대신 화면에 값을 넣어주는 경로를
// 실제로 돌려서 잡을 수 있는 것만 잡는다:
//   ① 그 경로에서 예외가 나는가        (ReferenceError 계열)
//   ② 화면이 쓸 값이 비었는가          ("-"로만 보이는 계열)
//   ③ 값들이 서로 안 맞는가            (합계 불일치·순서 뒤바뀜 계열)
//
// ⚠ **읽기 전용이다.** 세계를 바꾸는 시나리오는 넣지 않는다 — 확인하려다
// 세이브를 망가뜨리면 본말전도다. 상태 변화가 있어야만 확인되는 것은
// `skip`으로 남기고 **무엇을 눌러봐야 하는지**를 적는다.

import { get } from "svelte/store";
import { gameStore, MAX_MAILBOX } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore, type EntityDetails, type EntityRow } from "../stores/master";
import {
  loadFinanceRules, calcWeeklyFinance, calcSponsorOffers, calcTrainingBonus,
  financeOf, sponsorAnnualOf, finalAssets,
} from "./finance";
import { loadRosterRules } from "../repo/newGameV3";
import { staffStatsOf, staffModsOf, MANAGER_STATS, COACH_STATS } from "../utils/staffEffects";
import { buildRelationMessages, relationSceneCatalog } from "../utils/relationMessages";
import { facilityTierOf } from "../utils/ids";
import { visibleLeagueIds, leaderboardLeagueIds, hasPlayedGames } from "../utils/leagueVisibility";
import { isLeagueInScope } from "../config/releaseScope";
import { HS_DIGEST_WEEKS, MONTHLY_STANDINGS_LEAGUES } from "./weekPhases/digest";
import { MY_RANK_WEEKS } from "./weekPhases/standingsNews";

export type ScenarioStatus = "pass" | "fail" | "skip";

export interface ScenarioResult {
  id: string;
  title: string;
  status: ScenarioStatus;
  /** 확인된 사실 — 통과했든 아니든 무엇을 봤는지 남긴다 */
  notes: string[];
  /** 실패 사유 */
  problems: string[];
  /** 이 시나리오로는 **증명 못 하는 것** — 눈으로 봐야 하는 부분 */
  eyeOnly: string;
  ms: number;
}

export interface ScenarioReport {
  ranAt: string;
  context: string;
  results: ScenarioResult[];
  consoleErrors: string[];
  summary: { pass: number; fail: number; skip: number };
  text: string;
}

// ── 시나리오 작성 도구 ───────────────────────────────────────────
class Ctx {
  notes: string[] = [];
  problems: string[] = [];
  skipped: string | null = null;

  /** 참이어야 한다. 거짓이면 실패로 남고 시나리오는 계속 진행한다 */
  ok(claim: string, cond: boolean, detail = ""): boolean {
    if (cond) this.notes.push(`✓ ${claim}`);
    else this.problems.push(`✗ ${claim}${detail ? ` — ${detail}` : ""}`);
    return cond;
  }
  info(line: string): void { this.notes.push(`· ${line}`); }
  /** 이 상태에서는 확인할 수 없다 — 무엇이 있어야 확인되는지 적는다 */
  skip(reason: string): void { this.skipped = reason; }
}

interface Scenario {
  id: string;
  title: string;
  eyeOnly: string;
  run: (c: Ctx) => Promise<void>;
}

// ── 1. 새 게임 생성 ──────────────────────────────────────────────
const S_NEWGAME: Scenario = {
  id: "newgame",
  title: "새 게임 생성 — 규칙 파일·엔티티",
  eyeOnly: "캐릭터 생성 3단계가 실제로 넘어가는지, 팀 카드에 감독·코치·선수가 보이는지",
  async run(c) {
    const rules = await loadRosterRules();
    c.ok("generation_rules.json 로드", !!rules);

    // Phase 7이 규칙 키를 7개 추가했다 — 하나라도 없으면 그 기능이 조용히 죽는다
    const r = rules as unknown as Record<string, unknown>;
    for (const key of ["rosterRules", "salaryRules", "powerRules", "careerHistoryRules",
                       "financeRules", "campusEvents", "draftRules"]) {
      c.ok(`규칙 키 ${key}`, r[key] != null, "없음 — 그 기능이 기본값으로 조용히 돈다");
    }

    const m = get(masterStore);
    c.ok("refs 팀 로드", m.teams.length > 0, `teams=${m.teams.length}`);
    c.ok("엔티티 로드", m.entities.length > 0, `entities=${m.entities.length}`);

    // 리그마다 로스터 규칙이 있는가 — 없으면 그 리그가 빈 채로 활성화된다
    const leagues = [...new Set(m.teams.map((t) => t.leagueId))].filter(Boolean);
    const missing = leagues.filter((l) => !(rules.rosterRules as Record<string, unknown>)[l as string]);
    c.ok("모든 리그에 로스터 규칙이 있다", missing.length === 0, `누락: ${missing.join(", ")}`);
    c.info(`리그 ${leagues.length}종 · 팀 ${m.teams.length} · 엔티티 ${m.entities.length}`);
  },
};

// ── 2. 드래프트 관전 / 스킵 ──────────────────────────────────────
const S_DRAFT: Scenario = {
  id: "draft",
  title: "W47 드래프트 — 보드가 재생할 데이터",
  eyeOnly: "보드가 실제로 열리는지, 픽이 순서대로 애니메이션되는지",
  async run(c) {
    const g = get(gameStore);
    const log = g.schoolState?.careerDraftPickLog;
    if (!log || log.length === 0) {
      c.skip("아직 드래프트가 안 돌았다 — W47을 지나야 careerDraftPickLog가 생긴다");
      return;
    }
    // 관전과 스킵이 **같은 결과**를 봐야 한다. 둘 다 이 로그를 재생한다
    c.info(`픽 ${log.length}건`);
    const nos = log.map((p) => p.pickNo);
    c.ok("픽 번호가 오름차순", nos.every((n, i) => i === 0 || n > nos[i - 1]),
      `순서 깨짐: ${nos.slice(0, 12).join(",")}`);
    c.ok("픽 번호 중복 없음", new Set(nos).size === nos.length);
    c.ok("선수 중복 지명 없음", new Set(log.map((p) => p.playerId)).size === log.length);

    const teamIds = new Set(get(masterStore).teams.map((t) => t.id));
    const ghosts = [...new Set(log.map((p) => p.teamId))].filter((t) => !teamIds.has(t));
    c.ok("지명 구단이 전부 refs에 있다", ghosts.length === 0, `유령 팀: ${ghosts.join(", ")}`);

    // 라운드가 픽 번호와 맞는가 — 보드의 "N라운드 M순위" 표시가 여기서 나온다
    const perRound = new Map<number, number>();
    for (const p of log) perRound.set(p.round, (perRound.get(p.round) ?? 0) + 1);
    const rounds = [...perRound.keys()].sort((a, b) => a - b);
    c.ok("라운드가 1부터 연속", rounds.every((r, i) => r === i + 1), `라운드: ${rounds.join(",")}`);
    c.info(`라운드별 지명 수: ${rounds.map((r) => `${r}R:${perRound.get(r)}`).join(" ")}`);
  },
};

// ── 3. 재정 화면 4탭 ─────────────────────────────────────────────
const S_FINANCE: Scenario = {
  id: "finance",
  title: "재정 화면 — 4탭이 쓰는 값 전부",
  eyeOnly: "탭 전환이 되는지, 구독 토글을 눌렀을 때 실제로 반영되는지",
  async run(c) {
    const p = get(gameStore).protagonist;
    const seasonYear = get(seasonStore).seasonYear;

    const rules = await loadFinanceRules();
    c.ok("financeRules 로드", !!rules);

    // FinancePage.refresh()와 **같은 순서로 같은 것**을 부른다
    const weekly = await calcWeeklyFinance({ protagonist: p, seasonYear });
    c.ok("주간 수지 계산", !!weekly && typeof weekly.netWeekly === "number");
    if (weekly) {
      c.info(`주간 순수지 ${weekly.netWeekly}만원 (수입 ${weekly.grossWeekly ?? "?"} / 세금 ${weekly.taxWeekly ?? "?"})`);
      // 화면 상단 요약이 이 숫자를 그대로 쓴다 — NaN이면 "NaN만원"이 그대로 보인다
      for (const [k, v] of Object.entries(weekly)) {
        if (typeof v === "number") c.ok(`  ${k}가 유한수`, Number.isFinite(v), `${v}`);
      }
    }

    const bonus = await calcTrainingBonus({ protagonist: p });
    c.ok("훈련 보너스 계산", !!bonus && Array.isArray(bonus.byArea));
    if (bonus) {
      c.ok("주간 구독비가 유한수", Number.isFinite(bonus.weeklyCost), `${bonus.weeklyCost}`);
      c.ok("역보정이 유한수", Number.isFinite(bonus.inverseFactor), `${bonus.inverseFactor}`);
      c.info(`구독 ${bonus.byArea.length}종 · 주간비 ${bonus.weeklyCost}만원 · 팀자원 역보정 ${bonus.inverseFactor.toFixed(3)}`);
      for (const a of bonus.byArea) {
        c.ok(`  ${a.areaId} 실효 보너스가 유한수`, Number.isFinite(a.effective), `${a.effective}`);
      }
    }

    const so = await calcSponsorOffers({ protagonist: p, seasonYear });
    c.ok("스폰서 오퍼 계산", Array.isArray(so?.offers));
    c.info(`스폰서 오퍼 ${so?.offers?.length ?? 0}건 (명성 ${p.fame}${so?.capped ? ", 상한 도달" : ""})`);
    if ((so?.offers?.length ?? 0) === 0) {
      c.info("오퍼 0건 — 명성이 낮으면 정상이다. 화면 스폰서 탭이 비는 게 버그인지 여기서 갈린다");
    }

    const fin = financeOf(p);
    c.ok("재정 상태 존재", !!fin);
    c.info(`계약 스폰서 ${fin.sponsors?.length ?? 0}건 · 구독 ${fin.subscriptions?.length ?? 0}종`);
    c.info(`연 스폰서 수입 ${sponsorAnnualOf(fin, seasonYear)}만원`);

    // 화면이 보여주는 자산과 실제 money가 맞는가
    const assets = finalAssets(p);
    for (const [k, v] of Object.entries(assets)) {
      c.ok(`자산 ${k}가 유한수`, Number.isFinite(v), `${v}`);
    }
    c.ok("화면의 현금이 protagonist.money와 같다", assets.cash === p.money,
      `${assets.cash} vs ${p.money} — 재정 화면이 딴 숫자를 보여주고 있다`);
    c.info(`현금 ${assets.cash} · 투자원금 ${assets.totalInvested} · 손익 ${assets.totalProfit} · 납세 ${assets.taxPaid} (만원)`);
  },
};

// ── 4. 시즌말 투자 3택 ───────────────────────────────────────────
const S_INVEST: Scenario = {
  id: "invest",
  title: "시즌 종료 — 투자 3택 노출 조건",
  eyeOnly: "시즌 종료 화면 하단에 3택이 실제로 뜨는지",
  async run(c) {
    const p = get(gameStore).protagonist;
    const rules = await loadFinanceRules();
    const opts = (rules as unknown as { investment?: { options?: unknown[] } })?.investment?.options;
    c.ok("투자 선택지가 규칙 파일에 있다", Array.isArray(opts) && opts.length > 0,
      `options=${JSON.stringify(opts)?.slice(0, 80)}`);
    if (Array.isArray(opts)) c.info(`선택지 ${opts.length}종`);

    const isPro = p.careerStage === "pro" || p.careerStage.startsWith("pro_");
    c.info(`현재 단계 ${p.careerStage} · 현금 ${p.money}만원`);
    if (!isPro) {
      c.skip(`프로 단계에서만 뜬다 (지금 ${p.careerStage}). 프로 진입 후 시즌 종료 화면에서 확인할 것`);
      return;
    }
    c.ok("노출 조건 충족 (프로 + 현금 500만원 이상)", p.money >= 500, `현금 ${p.money}만원`);
  },
};

// ── 5. 협상 화면 — 구단주 줄 ─────────────────────────────────────
const S_CONTRACT: Scenario = {
  id: "contract",
  title: "협상 화면 — 구단주 관계·예산 반영",
  eyeOnly: "협상 모달이 열리는지, 제시액 슬라이더가 움직이는지",
  async run(c) {
    const p = get(gameStore).protagonist;
    const m = get(masterStore);
    if (!p.teamId) { c.skip("소속팀이 없다"); return; }

    const owner = m.entities.find((e) => e.teamId === p.teamId && e.role === "owner");
    c.ok("소속팀 구단주 엔티티 존재", !!owner,
      `팀 ${p.teamId}에 role=owner가 없다 — 협상 화면의 구단주 줄이 통째로 안 뜬다`);
    if (owner) {
      const od = (owner.details as EntityDetails)?.owner;
      c.ok("구단주 능력치 존재", !!od?.stats, "stats가 없어 화면이 '-'로 뜬다");
      if (od?.stats) {
        c.info(`구단주 ${owner.name}: ${Object.entries(od.stats).map(([k, v]) => `${k}=${v}`).join(" ")}`);
        for (const [k, v] of Object.entries(od.stats)) {
          c.ok(`  ${k}가 수치`, typeof v === "number", `${typeof v}`);
        }
      }
    }

    // 예산·구단주 보정이 실제로 제시액에 반영되려면 이 두 값이 있어야 한다
    const mods = staffModsOf(p.teamId, m.entities);
    c.ok("스태프 보정 계산", !!mods);
    c.info(`예산 ${mods.budget.toFixed(3)} · 관계 ${mods.relation.toFixed(3)} · 명성 ${mods.fame.toFixed(3)}`);
    c.ok("보정이 전부 중립(1.0)은 아니다",
      Object.values(mods).some((v) => v !== 1),
      "전 항목 1.0 — 스태프 능력치가 계산에 안 닿고 있다");
  },
};

// ── 6. 메시지함 ──────────────────────────────────────────────────
const S_MAILBOX: Scenario = {
  id: "mailbox",
  title: "메시지함 — Phase 7이 추가한 뉴스가 실제로 오는가",
  eyeOnly: "메시지 목록이 렌더되는지, 본문이 잘리지 않는지",
  async run(c) {
    const g = get(gameStore);
    const s = get(seasonStore);
    const box = g.mailbox ?? [];
    const week = s.currentWeek;
    const stage = g.protagonist.careerStage;
    const grade = g.protagonist.grade ?? 0;
    c.info(`메시지 ${box.length}건 · ${stage}${grade ? ` ${grade}학년` : ""} W${week}`);
    if (box.length === 0) { c.skip("메시지가 없다 — 몇 주 진행한 뒤 확인할 것"); return; }

    const byCat = new Map<string, number>();
    for (const msg of box) byCat.set(msg.category, (byCat.get(msg.category) ?? 0) + 1);
    c.info(`분류별: ${[...byCat].map(([k, v]) => `${k}:${v}`).join(" ")}`);

    const empty = box.filter((msg) => !msg.body || msg.body.trim() === "");
    c.ok("본문이 빈 메시지 없음", empty.length === 0,
      `${empty.length}건: ${empty.slice(0, 3).map((m) => m.id).join(", ")}`);
    c.ok("제목 없는 메시지 없음", box.every((msg) => !!msg.subject));

    // ── 뉴스가 왔어야 하는가 ────────────────────────────────────
    //
    // ⚠ **"아직 안 지났으면 정상"으로 얼버무리지 않는다.** 그건 반증이 안 되는
    // 문구라 진짜로 안 와도 통과한다 — 실제로 그래서 고교 스카우트 데이(W32)가
    // 안 온 걸 못 잡았다. 게이트를 **코드에서 읽어** 판정한다.
    const capped = box.length >= MAX_MAILBOX;
    if (capped) {
      c.info(`⚠ 메일함이 상한(${MAX_MAILBOX})에 닿았다 — 오래된 메시지가 밀려났을 수 있어`);
      c.info("  '안 왔다'를 증명할 수 없다. 아래 판정은 '못 찾음'까지만 말한다");
    }

    const scoutWeek = ((await loadRosterRules()) as unknown as
      { campusEvents?: { showcase?: { week: number }; allstar?: { week: number } } }).campusEvents;

    // [이름, 본문/제목 패턴, 이번 세이브에서 나왔어야 하는가]
    const EXPECT: [string, RegExp, boolean, string][] = [
      ["고교 분기 다이제스트", /선두|최하위|스카우트 관심/,
        stage === "highschool" && grade >= 2 && [...HS_DIGEST_WEEKS].some((w) => w <= week),
        "고교 2~3학년만 · W12·24·36"],
      ["내 팀 순위 요약", /전국 \d+위|권역/,
        stage === "highschool" && [...MY_RANK_WEEKS].some((w) => w <= week),
        "고교 전학년 · 월 1회"],
      ["인접권역 다이제스트", /다른 무대|권역   선두/,
        stage === "highschool" && week >= 6,
        "고교 전학년 · 주간"],
      ["고교 스카우트 데이", /스카우트 데이/,
        stage === "highschool" && (scoutWeek?.showcase?.week ?? 99) <= week,
        `고교만 · W${scoutWeek?.showcase?.week}`],
      ["대학 쇼케이스", /쇼케이스/,
        stage === "university" && (scoutWeek?.showcase?.week ?? 99) <= week,
        `대학만 · W${scoutWeek?.showcase?.week}`],
      ["대학 올스타", /올스타/,
        stage === "university" && (scoutWeek?.allstar?.week ?? 99) <= week,
        `대학만 · W${scoutWeek?.allstar?.week}`],
      ["월간 순위표", /순위|승률/,
        MONTHLY_STANDINGS_LEAGUES.has(g.protagonist.leagueId) && week >= 4,
        "고교 제외 · 4주마다"],
      ["FA 시장", /FA|자유계약/,
        stage.startsWith("pro"), "프로만"],
    ];

    for (const [label, re, expected, gate] of EXPECT) {
      const hit = box.some((msg) => re.test(msg.subject ?? "") || re.test(msg.body ?? ""));
      if (!expected) { c.info(`${label}: 대상 아님 (${gate})`); continue; }
      if (hit) { c.notes.push(`✓ ${label} 도착 (${gate})`); continue; }
      if (capped) c.info(`${label}: 못 찾음 — 상한에 밀렸을 수 있다 (${gate})`);
      else c.problems.push(`✗ ${label}가 왔어야 하는데 없다 (${gate})`);
    }
  },
};

// ── 7. 관계 라벨 진입 메시지 ─────────────────────────────────────
const S_RELATION: Scenario = {
  id: "relation",
  title: "관계 라벨 — 진입 장면과 선택지",
  eyeOnly: "메시지의 선택지 버튼이 실제로 눌리는지",
  async run(c) {
    const g = get(gameStore);
    const m = get(masterStore);
    const week = get(seasonStore).currentWeek;

    // 장면 목록은 `relationMessages`가 정본이다 — 여기 라벨을 다시 적으면
    // 저쪽이 바뀔 때 조용히 어긋난다 (실제로 그렇게 헛 실패가 났다)
    const catalog = relationSceneCatalog();
    c.ok("장면 카탈로그가 비어 있지 않다", catalog.length > 0);
    c.info(`정의된 장면 ${catalog.length}종: ` +
      catalog.map((x) => `${x.kind}/${x.label}${x.hasOptions ? "*" : ""}`).join(" "));

    const person = m.entities.find((e) => e.teamId === g.protagonist.teamId && e.role === "manager")
      ?? m.entities.find((e) => e.role === "manager");
    if (!person) { c.skip("감독 엔티티가 없다"); return; }

    // 카탈로그의 **모든** 장면이 실제로 메시지가 되는지 하나씩 확인한다
    let missing = 0;
    let noOptions = 0;
    for (const sc of catalog) {
      const built = buildRelationMessages(
        [{ personId: person.id, delta: 10, value: 60, prevValue: 40,
           label: sc.label, prevLabel: "보통", labelChanged: true }],
        week, m.entities, new Map([[person.id, sc.kind]]),
      );
      if (built.length === 0) { missing++; c.problems.push(`✗ ${sc.kind}/${sc.label} 장면이 메시지를 안 만든다`); continue; }
      const opts = built[0].decision?.options?.length ?? 0;
      if (sc.hasOptions && opts === 0) {
        noOptions++;
        c.problems.push(`✗ ${sc.kind}/${sc.label}에 선택지가 정의돼 있는데 메시지엔 안 붙었다`);
      }
      if (!built[0].subject) c.problems.push(`✗ ${sc.kind}/${sc.label} 제목이 비었다`);
      if (!built[0].body)    c.problems.push(`✗ ${sc.kind}/${sc.label} 본문이 비었다`);
    }
    c.ok("모든 장면이 메시지가 된다", missing === 0);
    c.ok("선택지가 정의된 장면은 전부 선택지가 붙는다", noOptions === 0);

    // 장면이 없는 라벨은 건조한 통보로 폴백해야 한다 — 조용히 사라지면 안 된다
    const fallback = buildRelationMessages(
      [{ personId: person.id, delta: 10, value: 60, prevValue: 40,
         label: "__없는라벨__", prevLabel: "보통", labelChanged: true }],
      week, m.entities, new Map([[person.id, "manager"]]),
    );
    c.ok("장면 없는 라벨도 통보 메시지는 나온다", fallback.length === 1,
      "라벨 변화가 조용히 사라진다");
  },
};

// ── 8. 선수·스태프 상세 모달 ─────────────────────────────────────
const S_DETAIL: Scenario = {
  id: "detail",
  title: "상세 모달 — 코치 5종 · 감독 5종이 '-'로 뜨지 않는가",
  eyeOnly: "모달이 실제로 열리는지 (클릭 핸들러)",
  async run(c) {
    const m = get(masterStore);
    const managers = m.entities.filter((e) => e.role === "manager");
    const coaches  = m.entities.filter((e) => e.role === "coach");
    const owners   = m.entities.filter((e) => e.role === "owner");
    c.info(`감독 ${managers.length} · 코치 ${coaches.length} · 구단주 ${owners.length}`);
    if (managers.length === 0 && coaches.length === 0) {
      c.skip("스태프 엔티티가 없다 — 새 게임을 만들어야 한다");
      return;
    }

    // 화면은 `mm.stats?.tacticalIQ` 식으로 읽고 없으면 "-"를 찍는다.
    // 그러니 **키 이름이 하나만 어긋나도 전부 '-'가 된다** (7-5에서 실제로 그랬다)
    const badMgr = managers.filter((e) => {
      const st = (e.details as EntityDetails)?.manager?.stats as Record<string, unknown> | undefined;
      return !st || MANAGER_STATS.some((k) => typeof st[k] !== "number");
    });
    c.ok(`감독 ${MANAGER_STATS.length}종이 전원 수치`, badMgr.length === 0,
      `${badMgr.length}/${managers.length}명이 비었다 — 예: ${badMgr[0]?.name} ` +
      JSON.stringify((badMgr[0]?.details as EntityDetails)?.manager?.stats));

    const badCoach = coaches.filter((e) => {
      const st = (e.details as EntityDetails)?.coach?.stats as Record<string, unknown> | undefined;
      return !st || COACH_STATS.some((k) => typeof st[k] !== "number");
    });
    c.ok(`코치 ${COACH_STATS.length}종이 전원 수치`, badCoach.length === 0,
      `${badCoach.length}/${coaches.length}명이 비었다 — 예: ${badCoach[0]?.name} ` +
      JSON.stringify((badCoach[0]?.details as EntityDetails)?.coach?.stats));

    // 신인·상무는 표시 경로가 달라 결함이 났던 자리다
    const rookies = m.entities.filter((e) => e.role === "player" && (e as EntityRow & { grade?: number }).grade === 1);
    const sangmu  = m.entities.filter((e) => (e.teamId ?? "").includes("SANGMU"));
    c.info(`1학년 ${rookies.length} · 상무 소속 ${sangmu.length}`);
    const noName = m.entities.filter((e) => !e.name || e.name.trim() === "");
    c.ok("이름 빈 엔티티 없음", noName.length === 0, `${noName.length}건`);
  },
};

// ── 9. 2군 강등 — 일정 정합 ──────────────────────────────────────
const S_FARM: Scenario = {
  id: "farm",
  title: "주인공 소속 리그와 일정이 맞는가",
  eyeOnly: "강등 알림이 뜨는지, 화면 상단 팀 표시가 바뀌는지",
  async run(c) {
    const p = get(gameStore).protagonist;
    const s = get(seasonStore);
    c.info(`주인공 리그 ${p.leagueId} · 팀 ${p.teamId} · 시즌 리그 ${s.leagueId}`);
    c.info(`시설 등급 ${facilityTierOf(p.leagueId)}`);

    // ⚠ 진로 결정(W44~) 뒤에는 **일부러 어긋난다.** 소속은 새 무대로 바뀌었지만
    // 새 시즌은 롤오버에서 열린다. 그 구간까지 실패로 세면 매년 헛 실패가 난다.
    // 이 검사가 원래 잡으려던 건 **시즌 중** 강등인데 일정이 그대로인 경우다.
    const inTransition = p.leagueId !== s.leagueId && s.currentWeek >= 44;
    if (inTransition) {
      c.info(`진로 전환 대기 — ${s.leagueId} 시즌 안에서 소속만 ${p.leagueId}로 바뀐 상태다`);
      c.info("  새 리그 일정은 시즌 롤오버에서 열린다. 여기서 어긋나는 게 정상");
    } else {
      c.ok("주인공 리그 == 시즌 리그", p.leagueId === s.leagueId,
        `${p.leagueId} vs ${s.leagueId} — 시즌 중 소속이 바뀌었는데 일정이 안 따라왔다`);

      const mine = s.schedule.filter((e) => e.homeTeamId === p.teamId || e.awayTeamId === p.teamId);
      c.ok("일정에 내 팀 경기가 있다", mine.length > 0,
        `0경기 — 소속팀(${p.teamId})이 이 리그 일정에 없다`);
      c.info(`내 팀 경기 ${mine.length}건 / 전체 ${s.schedule.length}건`);

      const teamIds = new Set(get(masterStore).teams.filter((t) => t.leagueId === s.leagueId).map((t) => t.id));
      if (teamIds.size > 0) {
        c.ok("소속팀이 이 리그 소속이다", teamIds.has(p.teamId),
          `${p.teamId}는 ${s.leagueId} 소속이 아니다`);
      }
    }

    // 스태프 보정이 실제 소속팀에서 나오는가 (7-5가 배선한 자리)
    const st = staffStatsOf(p.teamId, get(masterStore).entities);
    c.ok("소속팀 스태프 능력치 조회", !!st);
    c.info(`지도력 ${st.teaching} · 전술 ${st.tacticalIQ} · 불펜운용 ${st.bullpenRead}`);
    c.ok("스태프 값이 기본값 50에만 머물지 않는다",
      !(st.teaching === 50 && st.tacticalIQ === 50 && st.bullpenRead === 50),
      "전부 50 — 소속팀 스태프를 못 찾고 기본값으로 도는 상태다");
  },
};

// ── 10. 리그가 화면에 보이는가 ───────────────────────────────────
const S_LEAGUES: Scenario = {
  id: "leagues",
  title: "경기가 도는 리그가 화면 목록에 있는가",
  eyeOnly: "탭이 실제로 눌리는지, 순위표가 렌더되는지",
  async run(c) {
    const s = get(seasonStore);
    const myLeagueId = get(gameStore).protagonist.leagueId;
    const visible = new Set(visibleLeagueIds({ leagueState: s.leagueState, myLeagueId }));
    const lb = new Set(leaderboardLeagueIds({ leagueState: s.leagueState, myLeagueId }));

    // ⚠ 이 검사가 잡는 것: **경기는 도는데 화면에서 빠진 리그.**
    // 2군이 실제로 그랬다 — 한 시즌 465경기가 도는데 순위표 탭에 없었다.
    // "팜리그는 시뮬 안 함"이라는 낡은 전제가 필터에 박혀 있었다.
    const played: string[] = [];
    for (const [lid, ls] of Object.entries(s.leagueState)) {
      if (hasPlayedGames(ls)) played.push(lid);
    }
    c.info(`경기가 도는 리그 ${played.length}종: ${played.map((l) => l.replace("LEAGUE_", "")).join(" ")}`);

    for (const lid of played) {
      if (!isLeagueInScope(lid)) { c.info(`${lid}: 출시 범위 밖 — 안 보이는 게 맞다`); continue; }
      c.ok(`${lid.replace("LEAGUE_", "")} 순위표에 보인다`, visible.has(lid),
        "경기가 도는데 화면 목록에 없다");
      c.ok(`${lid.replace("LEAGUE_", "")} 리더보드에 보인다`, lb.has(lid));
    }

    // 주인공 리그는 경기 수와 무관하게 항상 보여야 한다 (2군 강등 포함)
    c.ok("주인공 리그가 순위표에 보인다", visible.has(myLeagueId),
      `${myLeagueId} — 강등되면 자기 리그를 못 보는 상태다`);
    c.ok("주인공 리그가 리더보드 맨 앞이다",
      leaderboardLeagueIds({ leagueState: s.leagueState, myLeagueId })[0] === myLeagueId);

    // 범위 밖 리그가 새어나오지 않는가
    const leaked = [...visible].filter((lid) => !isLeagueInScope(lid));
    c.ok("출시 범위 밖 리그가 목록에 없다", leaked.length === 0, leaked.join(", "));
  },
};

const SCENARIOS: Scenario[] = [
  S_NEWGAME, S_DRAFT, S_FINANCE, S_INVEST, S_CONTRACT,
  S_MAILBOX, S_RELATION, S_DETAIL, S_FARM, S_LEAGUES,
];

// ── 러너 ─────────────────────────────────────────────────────────
export async function runDevScenarios(
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<ScenarioReport> {
  const consoleErrors: string[] = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...a: unknown[]) => { consoleErrors.push(`[error] ${a.map(String).join(" ")}`); origError(...a); };
  console.warn  = (...a: unknown[]) => { consoleErrors.push(`[warn]  ${a.map(String).join(" ")}`); origWarn(...a); };

  const results: ScenarioResult[] = [];
  try {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const sc = SCENARIOS[i];
      onProgress?.(i, SCENARIOS.length, sc.title);
      const c = new Ctx();
      const t0 = performance.now();
      try {
        await sc.run(c);
      } catch (e) {
        // 예외 자체가 결과다 — `curYear` ReferenceError가 정확히 이렇게 잡힌다
        c.problems.push(`✗ 예외: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
        if (e instanceof Error && e.stack) {
          c.problems.push(`   ${e.stack.split("\n").slice(1, 4).map((l) => l.trim()).join(" | ")}`);
        }
      }
      results.push({
        id: sc.id, title: sc.title, eyeOnly: sc.eyeOnly,
        status: c.problems.length > 0 ? "fail" : c.skipped ? "skip" : "pass",
        notes: c.skipped ? [...c.notes, `⊘ 건너뜀: ${c.skipped}`] : c.notes,
        problems: c.problems,
        ms: performance.now() - t0,
      });
    }
  } finally {
    console.error = origError;
    console.warn = origWarn;
  }

  const summary = {
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    skip: results.filter((r) => r.status === "skip").length,
  };

  const g = get(gameStore);
  const s = get(seasonStore);
  const context =
    `${s.seasonYear}시즌 W${s.currentWeek} · ${g.protagonist.careerStage}` +
    `${g.protagonist.grade ? ` ${g.protagonist.grade}학년` : ""} · ${g.protagonist.teamId}` +
    ` · NPC ${g.npcs.length} · 엔티티 ${get(masterStore).entities.length}`;

  return { ranAt: new Date().toISOString(), context, results, consoleErrors, summary, text: buildText(results, context, consoleErrors, summary) };
}

function buildText(
  results: ScenarioResult[], context: string,
  consoleErrors: string[], summary: { pass: number; fail: number; skip: number },
): string {
  const L: string[] = [];
  const bar = "─".repeat(72);
  L.push(bar);
  L.push(`테스트 시나리오 결과   통과 ${summary.pass} · 실패 ${summary.fail} · 건너뜀 ${summary.skip}`);
  L.push(`상태: ${context}`);
  L.push(bar);

  for (const r of results) {
    const mark = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP";
    L.push("");
    L.push(`[${mark}] ${r.title}   (${r.ms.toFixed(0)}ms)`);
    for (const pr of r.problems) L.push(`   ${pr}`);
    for (const n of r.notes) L.push(`   ${n}`);
    L.push(`   👁 눈으로 볼 것: ${r.eyeOnly}`);
  }

  if (consoleErrors.length > 0) {
    L.push("");
    L.push(bar);
    L.push(`콘솔 출력 ${consoleErrors.length}건 (시나리오 실행 중)`);
    for (const e of consoleErrors.slice(0, 40)) L.push(`   ${e}`);
    if (consoleErrors.length > 40) L.push(`   ... 외 ${consoleErrors.length - 40}건`);
  }

  L.push("");
  L.push(bar);
  L.push("⚠ 이 러너는 **화면이 그려지는지는 못 본다.** 위의 👁 항목은 여전히 눈으로 봐야 한다.");
  L.push("⚠ 읽기 전용이다 — 세계를 바꾸지 않으므로 몇 번을 돌려도 세이브는 그대로다.");
  return L.join("\n");
}
