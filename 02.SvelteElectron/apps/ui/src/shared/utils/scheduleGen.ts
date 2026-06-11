import type { ScheduleEntry } from "../types/season";

// ── 날짜 유틸리티 (pure TS — UI 표시용) ──────────────────────────
export function toGameDate(seasonYear: number, week: number, dayOffset = 0): string {
  const d = new Date(seasonYear, 2, 1);
  d.setDate(d.getDate() + (week - 1) * 7 + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const KO_DAY = ["일", "월", "화", "수", "목", "금", "토"];
export function toDateKo(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const [y, m, day] = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  const dow = KO_DAY[d.getDay()];
  return `${y}년 ${m}월 ${day}일 (${dow})`;
}

// ── Rust IPC 래퍼 ────────────────────────────────────────────────
export async function generateSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  totalWeeks: number,
  seasonStart = 5,
  seasonEnd = 36,
  postseasonEnd = 44,
  seasonYear = 2026,
): Promise<ScheduleEntry[]> {
  const raw = await window.projectB!.scheduleGeneric(
    JSON.stringify({ teamIds, protagonistTeamId, totalWeeks, seasonStart, seasonEnd, postseasonEnd, seasonYear })
  );
  return JSON.parse(raw);
}

export async function generateKblSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  seasonYear = 2026,
): Promise<ScheduleEntry[]> {
  const raw = await window.projectB!.scheduleKbl(
    JSON.stringify({ teamIds, protagonistTeamId, seasonYear })
  );
  return JSON.parse(raw);
}

export async function generateAblSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  seasonYear = 2026,
): Promise<ScheduleEntry[]> {
  const raw = await window.projectB!.scheduleAbl(
    JSON.stringify({ teamIds, protagonistTeamId, seasonYear })
  );
  return JSON.parse(raw);
}

export async function generateJblSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  seasonYear = 2026,
): Promise<ScheduleEntry[]> {
  const raw = await window.projectB!.scheduleJbl(
    JSON.stringify({ teamIds, protagonistTeamId, seasonYear })
  );
  return JSON.parse(raw);
}

export async function generateHsSchedule(
  groupA: string[],
  groupB: string[],
  protagonistTeamId: string,
  seasonYear = 2026,
): Promise<ScheduleEntry[]> {
  const raw = await window.projectB!.scheduleHs(
    JSON.stringify({ groupA, groupB, protagonistTeamId, seasonYear })
  );
  return JSON.parse(raw);
}

export async function generateHsPostseasonSemis(
  top4: string[],
  protagonistTeamId: string,
  week: number,
  seasonYear = 2026,
): Promise<ScheduleEntry[]> {
  const raw = await window.projectB!.scheduleHsPostseasonSemis(
    JSON.stringify({ top4, protagonistTeamId, week, seasonYear })
  );
  return JSON.parse(raw);
}

export async function generateHsPostseasonFinal(
  winnerA: string,
  winnerB: string,
  protagonistTeamId: string,
  week: number,
  seasonYear = 2026,
): Promise<ScheduleEntry> {
  const raw = await window.projectB!.scheduleHsPostseasonFinal(
    JSON.stringify({ winnerA, winnerB, protagonistTeamId, week, seasonYear })
  );
  return JSON.parse(raw);
}
