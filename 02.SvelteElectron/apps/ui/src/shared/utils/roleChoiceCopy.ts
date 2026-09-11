/**
 * 보직 선택 문안 — **정본은 `resource/data/master/messages/role_choice.json`이다** (B-12).
 *
 * 🔴 **코드에 문장을 적지 않는다.** 이 파일은 그 JSON의 모양(타입)과 채우는
 * 규칙(placeholder·무대 고르기)만 갖는다. 문장을 여기 한 벌 더 두면 한쪽만
 * 고쳐진 채 남는다 — 이 저장소가 규칙 값으로 15건을 겪은 형태다(CLAUDE.md 머리).
 *
 * ## 조사를 코드로 붙이지 않는다
 *
 * `{role}으로`처럼 코드가 조사를 이어 붙이면 「중계으로」·「마무리을」이 나온다.
 * 받침 ㄹ은 '로'를 쓰므로(선발**로**) 받침 유무만 보는 규칙으로도 틀린다.
 * 그래서 **굴절형 표가 셋이다** — `roleAs`(선발로) · `roleObj`(선발을) ·
 * `roleWas`(선발이었습니다 / 중계**였**습니다). 서술격도 같은 이유로 표다.
 *
 * ## 말투는 합쇼체다 (사용자 확정 2026-09-03)
 *
 * 본문은 합쇼체이고 **버튼만 평서체**다 — 게임의 기존 선택지가 전부 그 꼴이라
 * (「훈련한다」·「오늘은 쉰다」) 버튼까지 바꾸면 이 소식만 튄다. 어느 쪽이든
 * 어미를 코드가 만들지 않는다.
 *
 * ## 본문에 감독 이름을 안 넣는다
 *
 * 소식의 보낸이(`sender`) 칸이 이미 이름을 들고 있고, 이름 뒤 조사(이/가 ·
 * 은/는)는 받침에 따라 갈려 데이터로 못 박는다.
 */

export type RolePosition = "SP" | "RP" | "CP";

/** 다시 묻는 상황 다섯 (PLAN_ROLE_RECOMMEND §4 「언제 묻나」) */
export type RoleAskReason = "season" | "stageMove" | "callup" | "demote" | "discharge";

/** 추천 문안을 고르는 무대 다섯 */
export type RoleCopyStage = "highschool" | "university" | "independent" | "pro" | "farm";

export const ROLE_ASK_REASONS: readonly RoleAskReason[] = [
  "season",
  "stageMove",
  "callup",
  "demote",
  "discharge",
];
export const ROLE_COPY_STAGES: readonly RoleCopyStage[] = [
  "highschool",
  "university",
  "independent",
  "pro",
  "farm",
];
export const ROLE_POSITIONS: readonly RolePosition[] = ["SP", "RP", "CP"];

export interface RoleChoiceCopy {
  roleLabel: Record<RolePosition, string>;
  /** 「선발로」 — `{roleAs}` */
  roleAs: Record<RolePosition, string>;
  /** 「선발을」 — `{roleObj}` */
  roleObj: Record<RolePosition, string>;
  /** 「선발이었습니다」 — `{recWas}`. 서술격은 받침이 있어야 「이었습니다」다 */
  roleWas: Record<RolePosition, string>;
  subject: { ask: string; decided: string };
  lead: Record<RoleAskReason, string>;
  recommend: Record<RoleCopyStage, Record<RolePosition, string>>;
  /** 본문 마지막 줄 — 물음 한 줄. 열다섯 변형이 아니라 하나다 */
  tail: { ask: string };
  confirm: { crowded: string; empty: string; buttons: { back: string; go: string } };
  decided: { follow: string; defy: string };
  fallback: { sender: string };
}

/**
 * 무대 고르기 — 리그가 먼저다. 2군은 `_FARM` 접미사로 갈린다.
 *
 * ⚠ 프로 세 리그(KBL·ABL·JBL)는 같은 `pro` 문안을 쓴다. 해외라고 감독의 말이
 * 달라질 이유가 지금은 없다 — 갈라야 하면 데이터에 무대를 더한다.
 */
export function roleCopyStageOf(careerStage: string, leagueId: string): RoleCopyStage {
  if (leagueId.endsWith("_FARM")) return "farm";
  if (careerStage === "highschool" || leagueId === "LEAGUE_HIGHSCHOOL") return "highschool";
  if (careerStage === "university" || leagueId === "LEAGUE_UNIVERSITY") return "university";
  if (careerStage === "independent" || leagueId === "LEAGUE_INDEPENDENT") return "independent";
  return "pro";
}

export type RoleCopyVars = Partial<
  Record<"year" | "role" | "recWas" | "roleAs" | "roleObj" | "ahead", string | number>
>;

/**
 * 틀을 채운다. **정규식을 안 쓴다** — 자리표 이름이 여섯뿐이라 그대로 잇는다.
 *
 * ⚠ 값이 없는 자리표는 **그대로 남긴다.** 조용히 빈 칸이 되면 "왜 문장이
 * 반 토막인가"의 답이 화면 어디에도 없다.
 */
export function fillRoleCopy(template: string, vars: RoleCopyVars): string {
  let out = template;
  for (const key of ["year", "role", "recWas", "roleAs", "roleObj", "ahead"] as const) {
    const v = vars[key];
    if (v === undefined) continue;
    out = out.split(`{${key}}`).join(String(v));
  }
  return out;
}

/** 확인 한 줄 — 갈래는 `ahead ≥ 1` / `ahead = 0` 둘뿐이다 (§7 「ahead — 두 갈래」) */
export function roleConfirmLine(copy: RoleChoiceCopy, ahead: number): string {
  return ahead >= 1 ? fillRoleCopy(copy.confirm.crowded, { ahead }) : copy.confirm.empty;
}

/**
 * JSON 한 덩어리를 타입으로 받는다. 모양이 어긋나면 `null` —
 * 호출부는 **문안 없이 소식을 만들지 않는다**(빈 문장을 지어내지 않는다).
 * 어긋남은 `roleChoiceCopy.test.ts` 가 파일을 직접 읽어 잡는다.
 */
export function parseRoleChoiceCopy(raw: unknown): RoleChoiceCopy | null {
  const o = raw as RoleChoiceCopy | null;
  if (!o || typeof o !== "object") return null;
  if (
    !o.roleLabel ||
    !o.roleAs ||
    !o.roleObj ||
    !o.roleWas ||
    !o.subject ||
    !o.lead ||
    !o.recommend ||
    !o.tail ||
    !o.confirm ||
    !o.decided ||
    !o.fallback
  )
    return null;
  for (const pos of ROLE_POSITIONS) {
    if (!o.roleLabel[pos] || !o.roleAs[pos] || !o.roleObj[pos] || !o.roleWas[pos]) return null;
  }
  for (const r of ROLE_ASK_REASONS) if (!o.lead[r]) return null;
  for (const st of ROLE_COPY_STAGES) {
    const row = o.recommend[st];
    if (!row) return null;
    for (const pos of ROLE_POSITIONS) if (!row[pos]) return null;
  }
  if (!o.confirm.crowded || !o.confirm.empty || !o.confirm.buttons?.back || !o.confirm.buttons?.go)
    return null;
  if (!o.decided.follow || !o.decided.defy) return null;
  if (!o.tail.ask) return null;
  if (!o.subject.ask || !o.subject.decided) return null;
  if (!o.fallback.sender) return null;
  return o;
}
