import type { ProtagonistSave, PitcherRole } from "../types/save";
import type { EntityRow } from "../stores/master";

function teamPitcherOvr(e: EntityRow): number {
  return (e.details as { player?: { pitching?: { ovr?: number } } }).player?.pitching?.ovr ?? 50;
}

// ── 주인공 투수 역할 배정 ─────────────────────────────────────
// position이 CP면 마무리, RP면 OVR 기준 불펜 계층,
// SP(또는 미지정)면 팀 내 선발 OVR 순위로 1~5선발 배정.
export function assignProtagonistRole(
  protagonist: ProtagonistSave,
  entities: EntityRow[],
): PitcherRole {
  const pos   = protagonist.position;
  const myOvr = protagonist.pitching.ovr;

  if (pos === "CP") return "마무리";

  if (pos === "RP") {
    if (myOvr >= 78) return "셋업맨";
    if (myOvr >= 65) return "중간계투";
    if (myOvr >= 55) return "롱릴리프";
    return "패전처리";
  }

  // SP 또는 미지정: 팀 내 선발 OVR 순위로 로테이션 슬롯 결정
  const teamSpOvrs = entities
    .filter(
      (e) =>
        e.role === "player" &&
        e.teamId === protagonist.teamId &&
        e.status === "active" &&
        e.id !== protagonist.id &&
        (e.details as { player?: { playerType?: string; position?: string } }).player?.playerType === "pitcher" &&
        (e.details as { player?: { position?: string } }).player?.position === "SP",
    )
    .map(teamPitcherOvr)
    .sort((a, b) => b - a);

  let rank = 1;
  for (const ovr of teamSpOvrs) {
    if (ovr > myOvr) rank++;
  }

  if (rank <= 5) return `${rank}선발` as PitcherRole;

  // 로테이션 밖: OVR 60 이상이면 스윙맨, 미만이면 롱릴리프
  return myOvr >= 60 ? "스윙맨" : "롱릴리프";
}

// 역할 → 상세 설명 레이블
export const ROLE_DESCRIPTION: Record<PitcherRole, string> = {
  "1선발":  "팀 에이스. 시리즈 1차전 선발 고정.",
  "2선발":  "로테이션 2번째 자리. 시리즈 2차전 선발.",
  "3선발":  "로테이션 3번째 자리.",
  "4선발":  "로테이션 4번째 자리.",
  "5선발":  "로테이션 마지막 자리.",
  "스윙맨": "선발·불펜 겸용. 필요에 따라 기용.",
  "오프너": "이닝 초반 짧게 등판 후 롱릴리프에 연결.",
  "롱릴리프": "선발 조기 강판 시 긴 이닝 소화.",
  "중간계투": "중반 이닝 담당 불펜.",
  "셋업맨": "마무리 앞 1~2이닝 담당 핵심 불펜.",
  "마무리": "팀 클로저. 승리 상황 마지막 이닝 전담.",
  "패전처리": "열세 상황 이닝 소화 담당.",
};

export function isStarterRole(role: PitcherRole): boolean {
  return ["1선발", "2선발", "3선발", "4선발", "5선발", "스윙맨", "오프너"].includes(role);
}

export function isReliefsRole(role: PitcherRole): boolean {
  return !isStarterRole(role);
}

// 선발 역할이면 몇 번째 선발인지 반환 (1~5), 불펜이면 null
export function starterSlot(role: PitcherRole): number | null {
  const match = role.match(/^(\d)선발$/);
  return match ? Number(match[1]) : null;
}

// 불펜 역할별 팀 경기당 등판 확률
export function relieverAppearanceChance(role: PitcherRole): number {
  switch (role) {
    case "마무리":   return 0.55;
    case "셋업맨":   return 0.45;
    case "중간계투": return 0.35;
    case "롱릴리프": return 0.20;
    case "패전처리": return 0.25;
    case "스윙맨":   return 0.15;
    case "오프너":   return 0.30;
    default: return 0;
  }
}

// 해당 경기에 불펜 투수가 등판하는지 판정
export function relieverWouldPitch(role: PitcherRole): boolean {
  const chance = relieverAppearanceChance(role);
  return chance > 0 && Math.random() < chance;
}
