// 이벤트 엔진 자체는 utils/eventEngine에 구현되어 있음 — 이 모듈은 weekPhases 디렉터리
// 구조상 "events" 도메인의 단일 진입점 역할만 한다 (processWeekBoundary에서 호출).
export { runEventEngine } from "../../utils/eventEngine";
