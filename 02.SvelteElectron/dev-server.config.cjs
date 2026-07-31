"use strict";
/**
 * dev 서버 포트 — **여기가 정본이다.**
 *
 * 예전엔 이 숫자가 네 군데 각각 적혀 있었다:
 *   vite.config.ts · package.json(dev:desktop) · wait-for-port · main.cjs(CSP·will-navigate)
 * 한 곳만 바꾸면 나머지가 조용히 어긋난다 — Electron이 안 뜨거나, 떠도
 * CSP가 막아 화면이 하얗게 나온다. 원인 찾기 제일 나쁜 종류다.
 *
 * `DEV_PORT` 환경변수로 덮어쓸 수 있다. 다른 프로젝트의 vite가 같은 포트를
 * 쓰고 있을 때 그쪽을 끄지 않고 비켜갈 수 있어야 한다 (실제로 그래서 5174다).
 */
const DEV_PORT = Number(process.env.DEV_PORT) || 5174;

module.exports = {
  DEV_PORT,
  DEV_ORIGIN: `http://localhost:${DEV_PORT}`,
};
