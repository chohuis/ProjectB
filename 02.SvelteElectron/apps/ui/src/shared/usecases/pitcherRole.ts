/**
 * 투수 보직 — **감독의 추천과 주인공의 선택** (PLAN_ROLE_RECOMMEND §4·§7).
 *
 * 예전엔 시즌 W1에 `advanceWeek`가 보직을 **통보**했다. 이제 각 리그의 개막 전
 * 주에 소식 한 통을 넣고, 그 안에서 선발·중계·마무리를 고른다.
 *
 * ## 이 파일이 경계다
 *
 * 🔴 **추천을 구하는 자리는 `recommendRole()` 하나다.** 지금은 이미 있는 엔진
 * (`assignProtagonistRole` / `assignHighschoolPosition`)의 결과를 그대로 추천으로
 * 쓴다. A①(적합도 산식 Rust · `recommend_pitcher_role`)이 들어오면 **그 함수의
 * 안만 갈아끼운다** — 소식·화면·헤드리스는 손대지 않는다.
 *
 * 지금 추천의 한계도 적어 둔다(A①이 닫는다):
 * - 고교는 `assignHighschoolPosition`이 SP/RP 둘만 내므로 **마무리를 추천하지
 *   않는다.** 버튼은 셋 다 보이고 고를 수는 있다(확정 5).
 * - 프로는 `assignProtagonistRole`이 직전 `position`으로 먼저 갈린다 — 한 번
 *   RP가 되면 추천이 선발로 안 돌아온다(§1 발견 3). **선택은 막지 않는다.**
 *
 * ## 문안은 데이터다
 *
 * 🔴 **문장을 이 파일에 적지 않는다.** 정본은
 * `resource/data/master/messages/role_choice.json`(B-12)이고 `masterStore`가
 * 읽는다. 조사는 굴절형(`roleAs`·`roleObj`)이 데이터에 박혀 있으므로
 * **코드가 「으로」·「을」을 이어 붙이지 않는다.** 본문에 감독 이름도 안 넣는다 —
 * 보낸이 칸이 이미 들고 있고, 이름 뒤 조사는 받침에 따라 갈린다.
 *
 * ## 새 pending 타입을 만들지 않는다
 *
 * `advanceWeek`의 「미결정 메시지 확인」 갈래가 `selectedOptionId === null`인
 * 소식을 찾아 `{type:"message"}` pending으로 이미 멈춘다. 소식을 넣기만 하면
 * 멈춤이 따라온다 — `PENDING_ACTION_TYPES` 누락 함정을 통째로 피한다(§4).
 */

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore, entitiesL10n, type EntityRow } from "../stores/master";
import { isV3SlotActive } from "../repo/v3Mode";
import { relationEffects } from "./relationships";
import { assignHighschoolPosition, assignProtagonistRole } from "../utils/pitcherRoleEngine";
import { pitcherRoleRules, buildRecommendParams, recommendPitcherRoleNative } from "../utils/pitcherRoleRules";
import { npcLiveStatsStore } from "../stores/npcLiveStats";
import type { NpcLiveStat } from "../stores/master";
import { roleAskWeekOf } from "../utils/seasonWeeks";
import { leagueOfTeam } from "../utils/ids";
import {
  fillRoleCopy, roleCopyStageOf,
  type RoleAskReason, type RoleChoiceCopy, type RolePosition,
} from "../utils/roleChoiceCopy";
import type { MessageItem, RoleChoiceMetadata } from "../types/main";
import type { PitcherRole, ProtagonistSave } from "../types/save";

// ── 눈금 ──────────────────────────────────────────────────────

export type RoleChoiceId = "sp" | "rp" | "cp";

export const ROLE_CHOICE_IDS: readonly RoleChoiceId[] = ["sp", "rp", "cp"];

export function positionOfChoice(id: RoleChoiceId): RolePosition {
  return id === "cp" ? "CP" : id === "rp" ? "RP" : "SP";
}

export function choiceOfPosition(pos: string): RoleChoiceId {
  return pos === "CP" ? "cp" : pos === "RP" ? "rp" : "sp";
}

export interface RoleRecommendation {
  recommended: RoleChoiceId;
  /** 그 자리를 지금 차지한 같은 팀 투수 수 — A① 뒤엔 min(순위−1, 자리 수) */
  ahead: { sp: number; rp: number; cp: number };
  /** A① 산식 결과 — 옛 엔진(OVR 순위) 폴백이면 없다 */
  fits?: { sp: number; rp: number; cp: number };
  ranks?: { sp: number; rp: number; cp: number };
  seats?: { sp: number; rp: number; cp: number };
  noSeat?: boolean;
}

// ── 소식 id 와 가드 — **같은 세 조각이다** ────────────────────
//
// 🔴 한쪽만 주차를 빼면 갈래가 둘로 깨진다(§7 「소식 id」):
//   가드에만 없으면 같은 주에 새 소식이 계속 생기고,
//   id 에만 없으면 소식 키가 겹쳐 **세이브가 아예 안 열린다**(CLAUDE.md).
// `roleMessageId.test.ts` 가 둘을 같이 본다.

export function roleChoiceMessageId(year: number, teamId: string, week: number): string {
  return `msg-role-${year}-${teamId}-w${week}`;
}

export function roleChoiceGuardKey(year: number, teamId: string, week: number): string {
  return `${year}:${teamId}:W${week}`;
}

export function roleConfirmMessageId(year: number, teamId: string, week: number): string {
  return `msg-role-done-${year}-${teamId}-w${week}`;
}

export function parseRoleChoiceGuardKey(
  key: string | undefined,
): { year: number; teamId: string; week: number } | null {
  if (!key) return null;
  const parts = key.split(":");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const week = Number(parts[2].split("W").join(""));
  if (!Number.isFinite(year) || !Number.isFinite(week) || !parts[1]) return null;
  return { year, teamId: parts[1], week };
}

// ── 언제 묻나 (확정 8·9) ──────────────────────────────────────

type AskFields = Pick<ProtagonistSave,
  "playerType" | "careerStage" | "leagueId" | "teamId" | "lastRoleChoiceKey" | "careerEvents">;

/**
 * 이번 주에 보직을 묻나. 물으면 **왜 묻는지**(문안의 머리말 키), 아니면 null.
 *
 * ```
 *   season      개막 전 주        리그별 askWeek (utils/seasonWeeks.ROLE_ASK_WEEK)
 *   stageMove   무대 이동         같은 시즌 안에서 팀이 바뀐 뒤 첫 주
 *   callup      콜업              바뀐 팀이 2군 → 1군
 *   demote      강등              1군 → 2군
 *   discharge   전역              전역은 **시즌 롤오버**에서 돈다
 *                                 (militaryDecision.dischargeProtagonist) — 돌아온
 *                                 새 시즌의 askWeek 이 곧 「전역 뒤 첫 주」다
 * ```
 *
 * 🔴 **복무 중엔 안 묻는다** (확정 9). 주인공은 상무든 현역이든 복무 중
 * 경기가 0이다(`advanceWeek` 군 갈래가 `processWeekBoundary` 앞에서
 * `matchResults: []`로 반환한다). 보직만 정해 두면 화면엔 보직이 떠 있는데
 * 기록이 안 쌓여 "왜 안 던졌나"의 답이 어디에도 없다.
 *
 * ⚠ 가드가 **소식 id 와 같은 세 조각**이라, 같은 주에 앱을 껐다 켜도 다시 안 묻는다.
 */
export function roleAskReasonOf(
  p: AskFields,
  seasonYear: number,
  weekInYear: number,
): RoleAskReason | null {
  if (p.playerType !== "pitcher") return null;
  if (p.careerStage === "military") return null;
  if (!p.teamId) return null;

  if (p.lastRoleChoiceKey === roleChoiceGuardKey(seasonYear, p.teamId, weekInYear)) return null;

  const prev = parseRoleChoiceGuardKey(p.lastRoleChoiceKey);

  // 같은 시즌 안에서 팀이 바뀌었다 — 콜업·강등·무대 이동·이적
  if (prev !== null && prev.year === seasonYear && prev.teamId !== p.teamId) {
    // ⚠ 팀 id 를 문자열로 자르지 않는다 — 파생 규칙은 `utils/ids.ts` 하나다.
    //   1군·2군은 리그가 갈린다(`_FARM` 접미사).
    const wasFarm = (leagueOfTeam(prev.teamId) ?? "").endsWith("_FARM");
    const isFarm  = (leagueOfTeam(p.teamId)   ?? "").endsWith("_FARM");
    if (wasFarm && !isFarm) return "callup";
    if (!wasFarm && isFarm) return "demote";
    return "stageMove";
  }

  if (weekInYear !== roleAskWeekOf(p.leagueId)) return null;

  // 전역 뒤 첫 시즌인가 — 복무 중엔 안 물었으므로 그 시즌 첫 물음이 「전역 뒤」다
  const dischargedRecently = (p.careerEvents ?? []).some(
    (e) => e.eventType === "military_discharge" && e.year >= seasonYear - 1,
  );
  if (dischargedRecently && !hasRoleChoiceThisSeason(p, seasonYear)) return "discharge";

  return "season";
}

export function shouldAskRoleChoice(p: AskFields, seasonYear: number, weekInYear: number): boolean {
  return roleAskReasonOf(p, seasonYear, weekInYear) !== null;
}

/** 그 시즌에 이미 보직을 물었나 — W1 자동 배정이 덮어쓰지 않게 하는 판정 */
export function hasRoleChoiceThisSeason(
  p: Pick<ProtagonistSave, "lastRoleChoiceKey">,
  seasonYear: number,
): boolean {
  const prev = parseRoleChoiceGuardKey(p.lastRoleChoiceKey);
  return prev !== null && prev.year === seasonYear;
}

// ── 추천 — **A① 이 갈아끼울 자리** ────────────────────────────

/**
 * 그 자리를 **지금 차지한 같은 팀 투수 수**.
 *
 * ⚠ 화면은 이 값을 다시 계산하지 않는다 — 소식 `metadata.ahead`를 그대로 쓴다(§5).
 * 두 벌이 되면 한쪽만 고쳐진 채 남는다.
 */
export function aheadOfTeam(
  teamId: string,
  myId: string,
  entities: readonly EntityRow[],
): { sp: number; rp: number; cp: number } {
  const ahead = { sp: 0, rp: 0, cp: 0 };
  for (const e of entities) {
    if (e.teamId !== teamId || e.role !== "player" || e.id === myId) continue;
    const pl = (e.details as { player?: { playerType?: string; position?: string } } | undefined)?.player;
    if (pl?.playerType !== "pitcher") continue;
    if (e.status && e.status !== "active") continue;
    ahead[choiceOfPosition(String(pl.position ?? "RP"))] += 1;
  }
  return ahead;
}

/**
 * 🔴 **추천을 구하는 유일한 자리다.** A①(Rust `recommend_pitcher_role`)이
 * 들어오면 이 함수의 **안만** 바뀐다 — 호출부는 셋뿐이고(소식 생성 · 검사 ·
 * 계측) 전부 `RoleRecommendation` 만 본다.
 */
export async function recommendRole(
  protagonist: ProtagonistSave,
  entities: readonly EntityRow[],
  roleOvrBias = 0,
): Promise<RoleRecommendation> {
  // A① — 세부 능력치 적합도 + 팀내 자리 경쟁 (Rust `recommend_pitcher_role` · 규칙 파일이 정본).
  //   규칙이 안 실렸거나 엔진이 오류를 내면 아래 옛 엔진(OVR 순위)으로 간다 — 구 세이브·검사 안전망.
  const rules = pitcherRoleRules();
  if (rules) {
    const params = buildRecommendParams({
      protagonist, entities,
      live: get(npcLiveStatsStore) as Record<string, NpcLiveStat | undefined>,
      catalog: get(masterStore).pitchCatalog,
      injuries: get(seasonStore).npcInjuries ?? {},
      rules, roleOvrBias,
    });
    const res = await recommendPitcherRoleNative(params);
    if (!res.error && res.recommended) {
      return { recommended: res.recommended, ahead: res.ahead, fits: res.fits, ranks: res.ranks, seats: res.seats, noSeat: res.noSeat };
    }
  }
  const ahead = aheadOfTeam(protagonist.teamId, protagonist.id, entities);

  if (protagonist.careerStage === "highschool") {
    const pos = await assignHighschoolPosition(protagonist, entities as EntityRow[]);
    return { recommended: choiceOfPosition(pos), ahead };
  }

  const role = await assignProtagonistRole(protagonist, entities as EntityRow[], roleOvrBias);
  return { recommended: choiceOfPosition(positionOfRole(role)), ahead };
}

/** 세부 보직 → SP/RP/CP */
export function positionOfRole(role: PitcherRole): RolePosition {
  if (role === "마무리") return "CP";
  return ["1선발", "2선발", "3선발", "4선발", "5선발", "스윙맨", "오프너"].includes(role) ? "SP" : "RP";
}

/**
 * 고른 자리의 **세부 보직 이름**.
 *
 * 지금 있는 엔진을 그대로 쓴다 — `position`을 고른 값으로 바꿔 넣으면
 * `assign_protagonist_role`이 그 갈래(선발 rank · 불펜 tier · 마무리)를 낸다.
 * 고교는 세부 이름을 아직 안 준다(§3 · `detailedRoles: false`).
 */
export async function detailedRoleFor(
  pos: RolePosition,
  protagonist: ProtagonistSave,
  entities: readonly EntityRow[],
  roleOvrBias = 0,
): Promise<PitcherRole> {
  if (protagonist.careerStage === "highschool") {
    return pos === "CP" ? "마무리" : pos === "RP" ? "중간계투" : "1선발";
  }
  return assignProtagonistRole({ ...protagonist, position: pos }, entities as EntityRow[], roleOvrBias);
}

// ── 소식 (§4) ─────────────────────────────────────────────────

export interface RoleChoiceMessageInput {
  copy: RoleChoiceCopy;
  year: number;
  teamId: string;
  week: number;
  reason: RoleAskReason;
  /** 추천 문안을 고르는 무대 — `roleCopyStageOf(careerStage, leagueId)` */
  stage: ReturnType<typeof roleCopyStageOf>;
  managerName: string;
  rec: RoleRecommendation;
}

/**
 * 묻는 소식 한 통. **순수 함수다** — 엔진을 안 부르므로 검사가 그대로 쓴다.
 *
 * ⚠ `effectHint`는 **전부 빈 문자열**이다(사용자 지시 "부제를 안 단다").
 * `NewsPage`가 `{#if opt.effectHint}`로 감싸고 있어 비우면 부제가 아예 안 그려진다.
 */
export function buildRoleChoiceMessage(input: RoleChoiceMessageInput): MessageItem {
  const { copy, year, teamId, week, reason, stage, managerName, rec } = input;
  const recPos = positionOfChoice(rec.recommended);
  const metadata: RoleChoiceMetadata = {
    type: "roleChoice",
    recommended: rec.recommended,
    ahead: rec.ahead,
    managerName, year, teamId, week, reason, stage,
  };
  // 머리말 + 추천 한 줄 + 물음 한 줄. **감독 이름은 안 넣는다** — 보낸이 칸이 든다.
  // ⚠ 물음(`tail.ask`)은 `decision.prompt` 가 아니라 본문 끝에 붙는다 —
  //   prompt 를 채우면 굵은 줄이 하나 더 그려진다(§4 는 그걸 비운다)
  const body = [copy.lead[reason], copy.recommend[stage][recPos], copy.tail.ask].join("\n");
  return {
    id: roleChoiceMessageId(year, teamId, week),
    category: "system",
    sender: managerName,
    subject: fillRoleCopy(copy.subject.ask, { year }),
    preview: copy.recommend[stage][recPos],
    body,
    createdAt: `W${week}`,
    readAt: null,
    decision: {
      // 본문이 이미 물음이다 — 비운다 (§4). NewsPage 의 roleChoice 갈래는
      // `.dec-prompt` 를 안 그린다
      prompt: "",
      options: ROLE_CHOICE_IDS.map((id) => ({
        id,
        label: copy.roleLabel[positionOfChoice(id)],
        effectHint: "",
        effects: { roleChoice: positionOfChoice(id) },
      })),
      selectedOptionId: null,
    },
    metadata,
  };
}

/** 확정 소식. 조사는 데이터의 굴절형(`roleAs`·`roleObj`)이 낸다 */
export function buildRoleConfirmMessage(input: {
  copy: RoleChoiceCopy;
  year: number; teamId: string; week: number;
  pick: RoleChoiceId; recommended: RoleChoiceId; role: PitcherRole; managerName: string;
}): MessageItem {
  const { copy, year, teamId, week, pick, recommended, role, managerName } = input;
  const pickPos = positionOfChoice(pick);
  const recPos  = positionOfChoice(recommended);
  const label   = copy.roleLabel[pickPos];
  const body = pick === recommended
    ? fillRoleCopy(copy.decided.follow, { roleAs: copy.roleAs[pickPos] })
    : fillRoleCopy(copy.decided.defy, {
        // 서술격도 굴절형 표에서 꺼낸다 — 코드로 「이었습니다」를 붙이면
        // 「중계이었습니다」가 나온다
        recWas: copy.roleWas[recPos],
        roleObj: copy.roleObj[pickPos],
      });
  return {
    id: roleConfirmMessageId(year, teamId, week),
    category: "system",
    sender: managerName,
    subject: fillRoleCopy(copy.subject.decided, { year, role: label }),
    preview: role,
    body,
    createdAt: `W${week}`,
    readAt: null,
  };
}

/** 감독 이름. 없으면 데이터의 `fallback.sender`("코칭스태프") */
export function managerNameOf(
  teamId: string,
  entities: readonly EntityRow[],
  fallback: string,
): string {
  for (const e of entities) {
    if (e.teamId === teamId && e.role === "manager" && e.name) return e.name;
  }
  return fallback;
}

/**
 * 보직 소식을 넣는다. 넣었으면 소식 id, 안 넣었으면 null.
 *
 * ⚠ **가드를 넣는 순간 저장한다** — 물은 뒤 답하기 전에 앱을 껐다 켜도 같은
 * 주에 소식이 또 생기지 않는다(§7). 답하기 전 상태는 미결 소식으로 남고
 * `advanceWeek`의 「미결정 메시지 확인」이 그 주에서 멈춘다.
 *
 * ⚠ 문안을 못 읽었으면 **안 묻는다.** 문장을 코드가 지어내면 데이터가 정본인
 * 뜻이 없어진다 — 대신 `console.error` 로 소리를 낸다.
 */
export async function askRoleChoice(seasonYear: number, weekInYear: number): Promise<string | null> {
  const g = get(gameStore);
  const p = g.protagonist;
  const reason = roleAskReasonOf(p, seasonYear, weekInYear);
  if (!reason) return null;

  const m = get(masterStore);
  const copy = m.roleChoiceCopy;
  if (!copy) {
    console.error("[pitcherRole] 보직 문안(messages/role_choice.json)을 못 읽었다 — 보직을 안 묻는다");
    return null;
  }

  const roleOvrBias = (isV3SlotActive() && g.currentSlotId)
    ? (await relationEffects({ slotId: g.currentSlotId, teamId: p.teamId })).roleOvrBias
    : 0;
  const rec = await recommendRole(p, m.entities, roleOvrBias);

  const msg = buildRoleChoiceMessage({
    copy,
    year: seasonYear,
    teamId: p.teamId,
    week: weekInYear,
    reason,
    stage: roleCopyStageOf(p.careerStage, p.leagueId),
    // ⚠ 이름은 언어 반영본(`entitiesL10n`)에서 읽는다 — 원본을 읽으면 이 소식만
    //   한국어로 남는다 (CLAUDE.md "이름은 name/nameEn 둘 다 산다")
    managerName: managerNameOf(p.teamId, get(entitiesL10n), copy.fallback.sender),
    rec,
  });
  gameStore.addMessage(msg);
  gameStore.setLastRoleChoiceKey(roleChoiceGuardKey(seasonYear, p.teamId, weekInYear));
  await gameStore.save();
  return msg.id;
}

// ── 확인 단계가 필요한가 (사용자 요구 3 · §4 「확인 단계」) ────

/**
 * 그 버튼이 **확인 단계를 거치나** — 추천이 아닌 자리를 고를 때만 참이다.
 *
 * 🔴 **추천은 바로 확정한다.** 확인 한 줄은 "추천이 아닌 보직을 고르면 출전
 * 기회가 적어질 수 있다"는 안내(사용자 요구 3)이고, 추천을 눌렀을 땐 안내할
 * 게 없다 — 한 번 더 묻는 것이 되어 버린다.
 *
 * ⚠ 문구가 추천이든 아니든 같은 한 줄인 것(§8 확정 12)과 **다른 얘기다.**
 * 확정 12는 「추천 전용 문장을 따로 만들지 마라」이지 「추천도 한 번 더
 * 물어라」가 아니다 — 앞선 구현이 그렇게 읽어 추천에도 확인 단계를 뒀다.
 *
 * 판정을 여기 두는 이유: 화면이 `meta.recommended === opt.id`를 직접 적으면
 * 그 한 줄이 컴포넌트 안에만 있어 검사가 못 본다.
 */
export function needsRoleConfirm(recommended: RoleChoiceId, pick: RoleChoiceId): boolean {
  return pick !== recommended;
}

// ── 확정 — **화면과 헤드리스가 같은 함수를 부른다** ───────────

/**
 * 고른 보직을 적용한다.
 *
 * 🔴 화면(`RoleChoicePanel`)도 자동 진행(`runAutoAdvance.handleMessage`)도
 * **이 함수 하나만** 부른다. 두 벌이 되면 한쪽만 고쳐진 채 남는다 —
 * 군 이벤트가 그랬다(`resolveEventPending` 주석).
 */
export async function applyRoleChoice(messageId: string, optionId: string): Promise<void> {
  const g = get(gameStore);
  const msg = g.mailbox.find((m) => m.id === messageId);
  const meta = msg?.metadata as RoleChoiceMetadata | undefined;
  if (!msg || meta?.type !== "roleChoice") return;

  const pick = (ROLE_CHOICE_IDS.includes(optionId as RoleChoiceId)
    ? optionId
    : meta.recommended) as RoleChoiceId;
  const pos = positionOfChoice(pick);

  const p = g.protagonist;
  const m = get(masterStore);
  const roleOvrBias = (isV3SlotActive() && g.currentSlotId)
    ? (await relationEffects({ slotId: g.currentSlotId, teamId: p.teamId })).roleOvrBias
    : 0;
  const role = await detailedRoleFor(pos, p, m.entities, roleOvrBias);

  gameStore.resolveDecision(messageId, pick);
  gameStore.setPosition(pos);
  gameStore.setCurrentRole(role);
  if (m.roleChoiceCopy) {
    gameStore.addMessage(buildRoleConfirmMessage({
      copy: m.roleChoiceCopy,
      year: meta.year, teamId: meta.teamId, week: meta.week,
      pick, recommended: meta.recommended, role, managerName: meta.managerName,
    }));
  }

  seasonStore.resolvePendingAction("message", messageId);
  await gameStore.save();
  await seasonStore.save();
}

// ── 헤드리스 정책 (확정 10) ───────────────────────────────────

/**
 * 헤드리스가 어느 버튼을 누른 셈 치나 — `globalThis.__PB_ROLE_CHOICE`.
 *
 * ```
 *   "recommend"(기본) | "sp" | "rp" | "cp"
 * ```
 *
 * 🔴 기본값이 「추천대로」다. 계측이 "감독 말을 따랐을 때"를 기준선으로 잡고,
 * 거기서 벗어난 선택의 효과를 그 기준선과 견줘 잰다.
 *
 * ⚠ 일반 휴리스틱 `pickChoice(options, fatigue)` 를 **타면 안 된다** — 피로
 * 값에 따라 보직이 정해진다.
 */
export function roleChoicePolicyPick(meta: RoleChoiceMetadata): RoleChoiceId {
  const raw = (globalThis as { __PB_ROLE_CHOICE?: unknown }).__PB_ROLE_CHOICE;
  const policy = typeof raw === "string" ? raw.toLowerCase() : "recommend";
  return ROLE_CHOICE_IDS.includes(policy as RoleChoiceId)
    ? (policy as RoleChoiceId)
    : meta.recommended;
}
