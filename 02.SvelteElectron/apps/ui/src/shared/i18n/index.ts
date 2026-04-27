import { derived, writable } from "svelte/store";

export type Language = "ko" | "en";

const STORAGE_KEY = "ui_language";

// 언어별 UI 문자열 사전
const dictionaries: Record<Language, Record<string, string>> = {
  ko: {
    "nav.home": "\ud648",
    "nav.messages": "\uba54\uc2dc\uc9c0",
    "nav.messenger": "\uba54\uc2e0\uc800",
    "nav.status": "\uc0c1\ud0dc",
    "nav.team": "\ud300",
    "nav.roster": "\ub85c\uc2a4\ud130",
    "nav.schedule": "\uc77c\uc815",
    "nav.training": "\ud6c8\ub828",
    "nav.finance": "\uc7ac\uc815",
    "nav.matchEngine": "\ub9e4\uce58\uc5d4\uc9c4",
    "nav.records": "\uae30\ub85d",
    "nav.academics": "\ud559\uc5c5",
    "header.progress": "\uc9c4\ud589",
    "header.progressRunning": "\uc9c4\ud589 \uc911...",
    "header.language": "\uc5b8\uc5b4",
    "header.playerLine": "{team} \u00b7 {player}",
    "page.home": "\ud648",
    "page.messages": "\uba54\uc2dc\uc9c0",
    "page.messenger": "\uba54\uc2e0\uc800",
    "page.status": "\uc0c1\ud0dc",
    "page.team": "\ud300",
    "page.roster": "\ub85c\uc2a4\ud130",
    "page.schedule": "\uc77c\uc815",
    "page.training": "\ud6c8\ub828",
    "page.finance": "\uc7ac\uc815",
    "page.matchEngine": "\ub9e4\uce58\uc5d4\uc9c4",
    "page.records": "\uae30\ub85d",
    "page.academics": "\ud559\uc5c5",
    "main.placeholderPreparing": "{tab} \ud654\uba74 \uc900\ube44 \uc911",
    "entity.role.player": "\uc120\uc218",
    "entity.role.coach": "\ucf54\uce58",
    "entity.role.manager": "\uac10\ub3c5",
    "entity.role.owner": "\uad6c\ub2e8\uc8fc",
    "entity.status.active": "\ud65c\uc131",
    "entity.status.inactive": "\ube44\ud65c\uc131",
    "entity.status.retired": "\uc740\ud1f4",
    "entity.status.injured": "\ubd80\uc0c1",
    "entity.playerType.pitcher": "\ud22c\uc218",
    "entity.playerType.batter": "\ud0c0\uc790",
    "entity.playerType.twoWay": "\ud22c\ud0c0\uacb8\uc5c5",
    "entity.position.SP": "\uc120\ubc1c\ud22c\uc218",
    "entity.position.RP": "\uc911\uac04\uacc4\ud22c",
    "entity.position.CP": "\ub9c8\ubb34\ub9ac",
    "entity.position.C": "\ud3ec\uc218",
    "entity.position.1B": "1\ub8e8\uc218",
    "entity.position.2B": "2\ub8e8\uc218",
    "entity.position.SS": "\uc720\uaca9\uc218",
    "entity.position.3B": "3\ub8e8\uc218",
    "entity.position.LF": "\uc88c\uc775\uc218",
    "entity.position.CF": "\uc911\uacac\uc218",
    "entity.position.RF": "\uc6b0\uc775\uc218",
    "entity.position.DH": "\uc9c0\uba85\ud0c0\uc790",
    "entity.tier.1\uad70": "1\uad70",
    "entity.tier.2\uad70": "2\uad70",
    "entity.tier.\uc721\uc131": "\uc721\uc131",
    "entity.tier.AAA": "\ud2b8\ub9ac\ud50cA",
    "entity.tier.AA": "\ub354\ube14A",
    "entity.tier.A": "\uc2f1\uae00A",
    "entity.grade.1": "1\ud559\ub144",
    "entity.grade.2": "2\ud559\ub144",
    "entity.grade.3": "3\ud559\ub144",
    "entity.handedness.L": "\uc88c",
    "entity.handedness.R": "\uc6b0",
    "entity.handedness.S": "\uc591"
  },
  en: {
    "nav.home": "Home",
    "nav.messages": "Messages",
    "nav.messenger": "Messenger",
    "nav.status": "Status",
    "nav.team": "Team",
    "nav.roster": "Roster",
    "nav.schedule": "Schedule",
    "nav.training": "Training",
    "nav.finance": "Finance",
    "nav.matchEngine": "Match Engine",
    "nav.records": "Records",
    "nav.academics": "Academics",
    "header.progress": "Advance",
    "header.progressRunning": "Advancing...",
    "header.language": "Language",
    "header.playerLine": "{team} \u00b7 {player}",
    "page.home": "Home",
    "page.messages": "Messages",
    "page.messenger": "Messenger",
    "page.status": "Status",
    "page.team": "Team",
    "page.roster": "Roster",
    "page.schedule": "Schedule",
    "page.training": "Training",
    "page.finance": "Finance",
    "page.matchEngine": "Match Engine",
    "page.records": "Records",
    "page.academics": "Academics",
    "main.placeholderPreparing": "{tab} page is under construction",
    "entity.role.player": "Player",
    "entity.role.coach": "Coach",
    "entity.role.manager": "Manager",
    "entity.role.owner": "Owner",
    "entity.status.active": "Active",
    "entity.status.inactive": "Inactive",
    "entity.status.retired": "Retired",
    "entity.status.injured": "Injured",
    "entity.playerType.pitcher": "Pitcher",
    "entity.playerType.batter": "Batter",
    "entity.playerType.twoWay": "Two-Way",
    "entity.position.SP": "SP",
    "entity.position.RP": "RP",
    "entity.position.CP": "CP",
    "entity.position.C": "C",
    "entity.position.1B": "1B",
    "entity.position.2B": "2B",
    "entity.position.SS": "SS",
    "entity.position.3B": "3B",
    "entity.position.LF": "LF",
    "entity.position.CF": "CF",
    "entity.position.RF": "RF",
    "entity.position.DH": "DH",
    "entity.tier.1군": "1st Team",
    "entity.tier.2군": "2nd Team",
    "entity.tier.육성": "Development",
    "entity.tier.AAA": "Triple-A",
    "entity.tier.AA": "Double-A",
    "entity.tier.A": "Single-A",
    "entity.grade.1": "Freshman",
    "entity.grade.2": "Sophomore",
    "entity.grade.3": "Senior",
    "entity.handedness.L": "Left",
    "entity.handedness.R": "Right",
    "entity.handedness.S": "Switch"
  }
};

// 초기 언어 결정: 저장값 우선, 없으면 브라우저 언어 기반
function initialLanguage(): Language {
  if (typeof window === "undefined") return "ko";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "ko" || saved === "en") return saved;
  } catch {}
  const browser = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  return browser.startsWith("ko") ? "ko" : "en";
}

export const language = writable<Language>(initialLanguage());

// 언어 변경 시 로컬 스토리지에 즉시 반영
language.subscribe((value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {}
});

// {key} 형태의 플레이스홀더 치환
function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

// 현재 언어 기준 번역 함수 제공 (키 미존재 시 한국어 사전으로 폴백)
export const t = derived(language, ($language) => {
  return (key: string, params?: Record<string, string | number>): string => {
    const dict = dictionaries[$language];
    const fallback = dictionaries.ko;
    const raw = dict[key] ?? fallback[key] ?? key;
    return format(raw, params);
  };
});

// 설정 팝업에서 사용하는 언어 선택 목록
export const languageOptions: Array<{ id: Language; label: string }> = [
  { id: "ko", label: "\ud55c\uad6d\uc5b4" },
  { id: "en", label: "English" }
];
