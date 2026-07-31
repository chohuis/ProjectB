"use strict";
/**
 * dev용 Electron 실행기.
 *
 * `VITE_DEV_SERVER_URL`을 **포트 정본에서 만들어** 넘긴다. npm 스크립트에
 * URL을 직접 적으면 그게 포트를 적는 다섯 번째 자리가 된다.
 */
const { spawn } = require("node:child_process");
const path = require("node:path");
const { DEV_ORIGIN } = require("../dev-server.config.cjs");

const electron = require("electron");
const child = spawn(electron, [path.resolve(__dirname, "../apps/desktop/main.cjs")], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: DEV_ORIGIN },
});
child.on("close", (code) => process.exit(code ?? 0));
