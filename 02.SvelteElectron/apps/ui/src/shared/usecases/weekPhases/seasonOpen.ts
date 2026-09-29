/**
 * **보직 선택 · W1 배정 · W1 세계 초기화** (2026-09-30 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` **맨 앞**에 있던 세 절이 그대로 나왔다 — 「보직 선택」·
 *   「W1: 투수 포지션/역할 배정 + 시즌 시작 브리핑」·「W1: 주인공 스냅샷 저장 +
 *   NPC 라이브 스탯 초기화 + 신규 입장 NPC 활성화」. 블록 경계는 옮기기 전
 *   파일의 주석 절을 그대로 따랐다.
 *
 * ⚠ **셋의 순서에 뜻이 있다.** 보직을 **묻는 것**이 W1 자동 배정보다 먼저다 —
 *   프로 1군은 묻는 주가 W1 이라(시범경기가 W1~4 에 12경기) 순서가 뒤집히면
 *   브리핑과 물음이 같은 주에 겹친다. 그래서 한 덩이로 옮겼다.
 *
 * ⚠ **`g` 를 다시 읽는 자리가 하나 있다.** 위 `askRoleChoice` 가 방금 세운
 *   가드를 함수 머리의 스냅샷은 모른다 — 옮기기 전에도 그 자리에서
 *   `get(gameStore)` 를 했고, 그대로 뒀다.
 *
 * ⚠ 검사는 주간 진행 경로를 **한 덩이로** 읽으므로(`__tests__/weekPathSrc.ts`)
 *   검사 문장은 한 글자도 안 바뀌었다.
 */
import { get } from "svelte/store";
import { gameStore, type GameStoreState } from "../../stores/game";
import { seasonStore, type SeasonStoreState } from "../../stores/season";
import { masterStore, type MasterState } from "../../stores/master";
import { weekInYearOf } from "../../utils/seasonWeeks";
import { askRoleChoice, hasRoleChoiceThisSeason } from "../pitcherRole";
import {
  assignProtagonistRole,
  assignHighschoolPosition,
  ROLE_DESCRIPTION,
  isReliefsRole,
} from "../../utils/pitcherRoleEngine";
import { relationEffects } from "../relationships";
import { isV3SlotActive } from "../../repo/v3Mode";
import {
  generateFreshmenV3,
  ensureLeagueActivatedV3,
  generateOverseasIntakeV3,
  generateFarmDevelopmentV3,
} from "../../repo/slotLifecycleV3";
import { applyForeignTurnover } from "../foreignPlayers";
import { isLeagueInScope } from "../../config/releaseScope";
import { cardsMeta } from "../../utils/dashboardMeta";

/** 옮기기 전 지역 변수를 그대로 담은 인자 묶음 — 이름이 본문과 같아야 한다 */
export interface SeasonOpenArgs {
  weekNum: number;
  /** 함수 머리의 스냅샷 셋 */
  s: SeasonStoreState;
  g: GameStoreState;
  m: MasterState;
  /** 주간 로그 — **참조로 받는다.** 옮기기 전과 같은 배열에 쌓여야 한다 */
  logs: string[];
}

export async function runSeasonOpenWeek({ weekNum, s, g, m, logs }: SeasonOpenArgs): Promise<void> {
  // ── 보직 선택 — **각 리그의 개막 전 주** (PLAN_ROLE_RECOMMEND §4 · 확정 8) ──
  //
  // 🔴 새 pending 타입을 안 만든다. 소식을 넣기만 하면 아래 「미결정 메시지 확인」
  //   갈래가 `{type:"message"}` pending 으로 그 주에서 멈춘다 (§4).
  //
  // ⚠ **W1 자동 배정보다 먼저 부른다.** 프로 1군은 묻는 주가 W1 이라(시범경기가
  //   W1~4 에 12경기 있다) 순서가 뒤집히면 브리핑과 물음이 같은 주에 겹친다.
  {
    const askedId = await askRoleChoice(s.seasonYear, weekInYearOf(weekNum));
    if (askedId) logs.push("[보직] 감독 추천 도착 — 선택 대기");
  }

  // W1: 투수 포지션/역할 배정 + 시즌 시작 브리핑
  //
  // ⚠ **선택이 이미 있으면 덮어쓰지 않는다** (§7). 구 세이브·헤드리스 안전망으로
  //   남긴 갈래다 — 물어본 시즌에는 주인공이 고른 보직이 정본이다.
  //
  // 🔴 **`g` 를 다시 읽는다.** 위 `askRoleChoice` 가 방금 가드를 세웠는데 함수
  //   머리의 스냅샷에는 그게 없다 — 프로 1군은 묻는 주가 W1 이라 그대로 두면
  //   같은 주에 물음과 브리핑이 **둘 다** 뜬다.
  if (
    weekNum === 1 &&
    g.protagonist.playerType === "pitcher" &&
    !hasRoleChoiceThisSeason(get(gameStore).protagonist, s.seasonYear)
  ) {
    if (g.protagonist.careerStage === "highschool") {
      // 고교: SP / RP 두 범주만 사용
      const pos = await assignHighschoolPosition(g.protagonist, m.entities);
      const posLabel = pos === "SP" ? "선발 투수" : "중계 투수";
      gameStore.setPosition(pos);
      gameStore.setCurrentRole(pos === "SP" ? "1선발" : "중간계투");
      gameStore.addMessage({
        id: `msg-season-brief-${s.seasonYear}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${s.seasonYear}시즌 시작 브리핑`,
        preview: `이번 시즌 보직: ${posLabel}`,
        body: `이번 시즌 당신의 보직은 [${posLabel}]로 배정되었습니다.\n\n팀과 함께 최고의 시즌을 만들어 가세요.`,
        createdAt: `W1`,
        readAt: null,
        // 보직은 **눈금 키**(SP·RP·CP)로 싣는다 — 카드 아래 한 줄을 문안의
        // 굴절표(`roleAs`)가 만든다. 낱말을 실으면 「중계으로」가 된다.
        // ⚠ 상세 역할(`1선발`)과 그 설명은 본문이 든다 — 굴절표에 없다
        metadata: cardsMeta("cards.seasonBrief", [{ key: "role", value: pos }]),
      });
      logs.push(`[보직 배정] ${posLabel}`);
    } else {
      // 프로(대학·독립 포함): 상세 역할 배정.
      // 감독 관계가 OVR 평가를 보정한다 (Phase 6C-5) — 관계 행이 아직 없으면
      // 0이라 구 동작과 같다(새 팀 첫 시즌 W1이 그렇다).
      const roleBias =
        isV3SlotActive() && g.currentSlotId
          ? (await relationEffects({ slotId: g.currentSlotId, teamId: g.protagonist.teamId }))
              .roleOvrBias
          : 0;
      const role = await assignProtagonistRole(g.protagonist, m.entities, roleBias);
      const pos: "SP" | "RP" | "CP" = role === "마무리" ? "CP" : isReliefsRole(role) ? "RP" : "SP";
      gameStore.setPosition(pos);
      gameStore.setCurrentRole(role);
      gameStore.addMessage({
        id: `msg-season-brief-${s.seasonYear}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${s.seasonYear}시즌 시작 브리핑`,
        preview: `이번 시즌 역할: ${role}`,
        body: `이번 시즌 당신의 역할은 [${role}]로 배정되었습니다.\n\n${ROLE_DESCRIPTION[role]}\n\n팀과 함께 최고의 시즌을 만들어 가세요.`,
        createdAt: `W1`,
        readAt: null,
        // 보직은 **눈금 키**(SP·RP·CP)로 싣는다 — 카드 아래 한 줄을 문안의
        // 굴절표(`roleAs`)가 만든다. 낱말을 실으면 「중계으로」가 된다.
        // ⚠ 상세 역할(`1선발`)과 그 설명은 본문이 든다 — 굴절표에 없다
        metadata: cardsMeta("cards.seasonBrief", [{ key: "role", value: pos }]),
      });
      logs.push(`[역할 배정] ${role}`);
    }
  }

  // W1: 주인공 스냅샷 저장 + NPC 라이브 스탯 초기화 + 신규 입장 NPC 활성화
  if (weekNum === 1) {
    gameStore.saveSeasonStartSnapshot();

    const currentSeasonYear = s.seasonYear;

    if (isV3SlotActive()) {
      // ── v3: 신입생은 Rust 생성 — 진급 후 grade 1이 빈 팀에 채움 ──
      const created = await generateFreshmenV3(currentSeasonYear);
      if (created > 0) logs.push(`[신입생] ${created}명 입학 (Rust 생성)`);

      // ── 육성선수: 2군 보직 하한 미달분만 ────────────────────────
      //
      // ⚠ 유출은 다 막았는데(콜다운·트레이드·공백 충원 하한) 그러자 반대편이
      // 막혔다 — 2군 투수가 하한이면 1군 포수 공백을 메울 수가 없다.
      // 하한을 더 걸어봐야 교착이라 **없는 사람을 만들어야 한다.**
      const dev = await generateFarmDevelopmentV3(currentSeasonYear);
      if (dev > 0) logs.push(`[육성선수] ${dev}명 (2군 보직 하한 충원)`);

      // ── 해외 리그 로스터 보장 (확장팩) ──────────────────────────
      //
      // ⚠ 예전엔 해외가 **Lazy 활성화 전용**이었고 `ensureLeagueActivatedV3`를
      // 대학·독립·주인공 리그만 불렀다. 그래서 확장팩 게이트를 열어도
      // **선수 0명인 리그에 일정만 1,740경기 깔렸다**(실측 ABL 1,080 · JBL 660,
      // 2시즌 굴려도 인원 0·결과 0). 게이트를 연다고 도는 게 아니다.
      //
      // 범위 밖이면 `ensureLeagueActivatedV3`가 호출돼도 할 일이 없어야 하므로
      // 여기서 먼저 거른다.
      for (const lid of ["LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM"]) {
        if (!isLeagueInScope(lid)) continue;
        const n = await ensureLeagueActivatedV3(lid, currentSeasonYear);
        if (n > 0) logs.push(`[해외활성화] ${lid.replace("LEAGUE_", "")} ${n}명`);
      }
      // 해외는 하부 파이프라인(고교→대학→드래프트)이 없다 — 매년 리그에
      // 직접 신인을 배정한다. 안 하면 `fill_first_teams`가 1군을 채우려고
      // 팜에서 빼오기만 해서 **팜이 말라붙는다**(실측 544 → 184).
      const intake = await generateOverseasIntakeV3(currentSeasonYear);
      if (intake > 0) logs.push(`[해외신인] ${intake}명 배정`);

      // ── 외국인 순환 (F-4·F-5) ─────────────────────────────────
      //
      // 은퇴·로스터 정리가 끝난 **뒤**여야 빈 자리를 정확히 센다.
      // 안 돌면 보유 3명이 은퇴·부진 퇴출로 매년 줄어들기만 한다
      const fgn = await applyForeignTurnover(currentSeasonYear);
      for (const l of fgn.logs) logs.push(l);
    }
    // ⚠ 여기 `else` 갈래가 하나 있었다 — `master.db` `npc_master` 에서
    //   `entry_year == 올해` 인 사전 생성 NPC 를 꺼내 고교 신입생·해외
    //   즉전감으로 심는 **레거시 경로**다. 2026-09-04 에 지웠다: 그 표는
    //   Phase 6A 이후 0행이라 **어느 갈래로 와도 아무 일도 안 일어났고**,
    //   `master.db` 자체를 접으면서 재료가 사라졌다. 신입생은 위쪽
    //   `generateFreshmenV3`(Rust 생성)가 만든다.

    // 기존 선수 전체 → npcLiveStats 초기화 (미등록 항목만)
    const currentEntities = get(masterStore).entities;
    seasonStore.initNpcLiveStats(currentEntities, currentSeasonYear);
    // 프로 NPC 초기화: KBL/ABL/JBL 선수가 npcs에 없으면 `entities`에서 변환·추가
    gameStore.initProNpcsIfMissing(currentEntities, currentSeasonYear);
    seasonStore.snapNpcSeasonStart();
  }
}
