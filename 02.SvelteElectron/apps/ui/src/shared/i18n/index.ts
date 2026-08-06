import { derived, writable } from "svelte/store";

export type Language = "ko" | "en";

const STORAGE_KEY = "ui_language";

// 언어별 UI 문자열 사전
const dictionaries: Record<Language, Record<string, string>> = {
  ko: {
    "nav.news": "\uc18c\uc2dd",
    "nav.me": "\ub098",
    "nav.home": "\ud648",
    "nav.messages": "\uba54\uc2dc\uc9c0",
    "nav.status": "\uc0c1\ud0dc",
    "nav.team": "\ud300",
    "nav.people": "\uc778\ubb3c",
    "nav.schedule": "\uc77c\uc815",
    "nav.training": "\ud6c8\ub828",
    "nav.finance": "\uc7ac\uc815",
    "nav.matchEngine": "\ub9e4\uce58\uc5d4\uc9c4",
    "nav.league": "\ub9ac\uadf8",
    "nav.achievements": "\uc5c5\uc801",
    "nav.academics": "\ud559\uc5c5",
    "header.progress": "\uc9c4\ud589",
    "header.progressRunning": "\uc9c4\ud589 \uc911...",
    "header.language": "\uc5b8\uc5b4",
    "settings.title": "환경설정",
    "settings.close": "닫기",
    "settings.reset": "기본값으로",
    "settings.language": "언어",
    "settings.theme": "테마",
    "settings.theme.light": "밝음",
    "settings.theme.dark": "어둠",
    "settings.theme.system": "시스템 따름",
    "settings.effectSpeed": "경기 연출 속도",
    "settings.effectSpeed.fast": "빠르게",
    "settings.effectSpeed.normal": "보통",
    "settings.effectSpeed.off": "끄기",
    "settings.effectSpeed.hint": "결과가 뜨는 시간입니다. 한 경기 투구가 100구 안팎입니다",
    "settings.reduceMotion": "애니메이션 줄이기",
    "settings.reduceMotion.hint": "운영체제 설정이 켜져 있으면 이 값과 무관하게 줄어듭니다",
    "settings.windowSize": "창 크기",
    "settings.windowSize.fullscreen": "전체화면",
    "settings.sound": "사운드",
    "settings.sound.master": "전체",
    "settings.sound.sfx": "효과음",
    "settings.sound.bgm": "배경음",
    "settings.sound.pending": "아직 소리가 없습니다 — 값만 저장됩니다",
    "settings.section.display": "화면",
    "settings.section.game": "게임",
    "settings.section.sound": "소리",
    "header.playerLine": "{team} \u00b7 {player}",
    "page.news": "\uc18c\uc2dd",
    "page.me": "\ub098",
    "page.home": "\ud648",
    "page.messages": "\uba54\uc2dc\uc9c0",
    "page.status": "\uc0c1\ud0dc",
    "page.team": "\ud300",
    "page.people": "\uc778\ubb3c",
    "page.roster": "\ub85c\uc2a4\ud130",
    "page.schedule": "\uc77c\uc815",
    "page.training": "\ud6c8\ub828",
    "page.finance": "\uc7ac\uc815",
    "page.matchEngine": "\ub9e4\uce58\uc5d4\uc9c4",
    "page.league": "\ub9ac\uadf8",
    "page.achievements": "\uc5c5\uc801",
    "page.academics": "\ud559\uc5c5",
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
    "nav.news": "News",
    "nav.me": "Me",
    "nav.home": "Home",
    "nav.messages": "Messages",
    "nav.status": "Status",
    "nav.team": "Team",
    "nav.people": "People",
    "nav.schedule": "Schedule",
    "nav.training": "Training",
    "nav.finance": "Finance",
    "nav.matchEngine": "Match Engine",
    "nav.league": "League",
    "nav.achievements": "Achievements",
    "nav.academics": "Academics",
    "header.progress": "Advance",
    "header.progressRunning": "Advancing...",
    "header.language": "Language",
    "settings.title": "Settings",
    "settings.close": "Close",
    "settings.reset": "Reset to defaults",
    "settings.language": "Language",
    "settings.theme": "Theme",
    "settings.theme.light": "Light",
    "settings.theme.dark": "Dark",
    "settings.theme.system": "Follow system",
    "settings.effectSpeed": "Result effect speed",
    "settings.effectSpeed.fast": "Fast",
    "settings.effectSpeed.normal": "Normal",
    "settings.effectSpeed.off": "Off",
    "settings.effectSpeed.hint": "How long results stay on screen. A game runs about 100 pitches",
    "settings.reduceMotion": "Reduce motion",
    "settings.reduceMotion.hint": "If your OS setting is on, motion is reduced regardless",
    "settings.windowSize": "Window size",
    "settings.windowSize.fullscreen": "Fullscreen",
    "settings.sound": "Sound",
    "settings.sound.master": "Master",
    "settings.sound.sfx": "Effects",
    "settings.sound.bgm": "Music",
    "settings.sound.pending": "No audio yet — the value is stored only",
    "settings.section.display": "Display",
    "settings.section.game": "Game",
    "settings.section.sound": "Sound",
    "header.playerLine": "{team} \u00b7 {player}",
    "page.news": "News",
    "page.me": "Me",
    "page.home": "Home",
    "page.messages": "Messages",
    "page.status": "Status",
    "page.team": "Team",
    "page.people": "People",
    "page.roster": "Roster",
    "page.schedule": "Schedule",
    "page.training": "Training",
    "page.finance": "Finance",
    "page.matchEngine": "Match Engine",
    "page.league": "League",
    "page.achievements": "Achievements",
    "page.academics": "Academics",
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

// 환경설정에서 쓰는 언어 선택 목록
export const languageOptions: Array<{ id: Language; label: string }> = [
  { id: "ko", label: "\ud55c\uad6d\uc5b4" },
  { id: "en", label: "English" }
];

/**
 * 언어 바꾸기. **모르는 값은 무시한다** — 저장소나 외부에서 온 값이
 * 그대로 들어오면 사전 조회가 전부 빗나가 화면이 키로 채워진다.
 *
 * 예전엔 `SidebarNav.svelte` 안의 지역 함수였다. 환경설정에서도 같은 일이
 * 필요해지면서 정본을 여기로 올렸다.
 */
export function setLanguage(next: Language): void {
  if (next === "ko" || next === "en") language.set(next);
}
