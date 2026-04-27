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
    "main.placeholderPreparing": "{tab} \ud654\uba74 \uc900\ube44 \uc911"
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
    "main.placeholderPreparing": "{tab} page is under construction"
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
