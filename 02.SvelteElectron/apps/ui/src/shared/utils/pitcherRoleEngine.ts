import type { ProtagonistSave, PitcherRole } from "../types/save";
import type { EntityRow } from "../stores/master";

// ── 고교 투수 포지션 배정 ─────────────────────────────────────

export async function assignHighschoolPosition(
  protagonist: Pick<ProtagonistSave, "teamId" | "pitching">,
  entities: EntityRow[],
): Promise<"SP" | "RP"> {
  const myOvr = protagonist.pitching.ovr;
  const teamPitcherOvrs = entities
    .filter(
      (e) =>
        e.teamId === protagonist.teamId &&
        e.role === "player" &&
        (e.details as any)?.player?.playerType === "pitcher",
    )
    .map((e) => (e.details as any)?.player?.pitching?.ovr ?? 0);

  const result = JSON.parse(
    await window.projectB!.pitcherAssignHighschoolPosition(
      JSON.stringify({ myOvr, teamPitcherOvrs })
    )
  );
  return result.position as "SP" | "RP";
}

// ── 주인공 투수 역할 배정 ─────────────────────────────────────

export async function assignProtagonistRole(
  protagonist: ProtagonistSave,
  entities: EntityRow[],
): Promise<PitcherRole> {
  const myOvr = protagonist.pitching.ovr;
  const teamSpOvrs = entities
    .filter(
      (e) =>
        e.role === "player" &&
        e.teamId === protagonist.teamId &&
        e.status === "active" &&
        e.id !== protagonist.id &&
        (e.details as any)?.player?.playerType === "pitcher" &&
        (e.details as any)?.player?.position === "SP",
    )
    .map((e) => (e.details as any)?.player?.pitching?.ovr ?? 50);

  const result = JSON.parse(
    await window.projectB!.pitcherAssignRole(
      JSON.stringify({ position: protagonist.position, ovr: myOvr, teamSpOvrs })
    )
  );
  return result.role as PitcherRole;
}

// ── 불펜 등판 판정 ────────────────────────────────────────────

export async function relieverWouldPitch(role: PitcherRole): Promise<boolean> {
  const result = JSON.parse(
    await window.projectB!.pitcherRelieverWouldPitch(JSON.stringify({ role }))
  );
  return result.wouldPitch as boolean;
}

// ── 순수 유틸 (TS 유지) ───────────────────────────────────────

export const ROLE_DESCRIPTION: Record<PitcherRole, string> = {
  "1선발":    "팀 에이스. 시리즈 1차전 선발 고정.",
  "2선발":    "로테이션 2번째 자리. 시리즈 2차전 선발.",
  "3선발":    "로테이션 3번째 자리.",
  "4선발":    "로테이션 4번째 자리.",
  "5선발":    "로테이션 마지막 자리.",
  "스윙맨":   "선발·불펜 겸용. 필요에 따라 기용.",
  "오프너":   "이닝 초반 짧게 등판 후 롱릴리프에 연결.",
  "롱릴리프": "선발 조기 강판 시 긴 이닝 소화.",
  "중간계투": "중반 이닝 담당 불펜.",
  "셋업맨":   "마무리 앞 1~2이닝 담당 핵심 불펜.",
  "마무리":   "팀 클로저. 승리 상황 마지막 이닝 전담.",
  "패전처리": "열세 상황 이닝 소화 담당.",
};

export function isStarterRole(role: PitcherRole): boolean {
  return ["1선발", "2선발", "3선발", "4선발", "5선발", "스윙맨", "오프너"].includes(role);
}

export function isReliefsRole(role: PitcherRole): boolean {
  return !isStarterRole(role);
}

export function starterSlot(role: PitcherRole): number | null {
  const match = role.match(/^(\d)선발$/);
  return match ? Number(match[1]) : null;
}
