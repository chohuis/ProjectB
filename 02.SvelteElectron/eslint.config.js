// @ts-check
/**
 * ESLint — **처음 들이는 규칙이다** (2026-09-11 · 개선 4).
 *
 * 🔴 **처음부터 엄격하게 걸지 않는다.** 83,319줄 TS + 29,465줄 Svelte 에 규칙을
 *   새로 들이대면 수백 건이 뜬다. 그러면 아무도 안 본다.
 *
 *   그래서 **오류(error)는 「지금 0 이 되는 것」만** 켠다 — 진짜 결함을 잡는
 *   규칙이다. 나머지는 **경고(warn)**로 두고 수를 세어 둔다. 경고를 줄이는 것은
 *   그 자리를 만질 때 하나씩 한다.
 *
 * ⚠ **`scripts/**` 236 파일은 범위 밖이다.** 계측·검사 스크립트라 규칙을
 *   들이대면 소음이다(표를 찍는 `console.log` · 한 번 쓰고 마는 변수).
 *   `.prettierignore` 도 같은 자리를 뺀다.
 *
 * ⚠ **타입 정보를 쓰는 규칙(`recommendedTypeChecked`)은 안 켠다.** 448 파일에
 *   타입 검사를 다시 돌리면 린트가 tsc 만큼 느려진다 — hook 이 느리면 아무도
 *   안 쓴다. 타입 오류는 `tsc --noEmit` 가 이미 본다(CI 에도 있다).
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/release/**",
      "**/target/**",
      "**/_manifest.json",
      "resource/**",
      // 계측·검사 스크립트 — 위 머리말 참고
      "scripts/**",
      // 설정 파일 자신
      "eslint.config.js",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  // ⚠ `flat/recommended` 안에 **파일 범위를 안 적은 칸**이 있어 그대로 펴면
  //   `.cjs` 까지 svelte 규칙이 걸린다(`svelte/no-inner-declarations` 가
  //   `apps/desktop/ipc/match.cjs` 에서 터졌다). 범위를 못 박아 넣는다.
  ...svelte.configs["flat/recommended"].map((c) => ({ ...c, files: c.files ?? ["**/*.svelte"] })),

  // ── TS · Svelte 공통 ──────────────────────────────────────
  {
    files: ["**/*.{ts,svelte}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // 🔴 **경고로 둔다** — 지금 코드에 42 곳이 있다(평가서 §C).
      //   자리마다 이유가 있는지는 그 자리를 만질 때 본다.
      "@typescript-eslint/no-explicit-any": "warn",
      // 안 쓰는 것 — `_` 로 시작하면 일부러 둔 것으로 본다
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // 빈 `catch {}` 여섯은 전부 localStorage·i18n·마이그레이션 가드다(평가서 §C)
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // `a?.push(x) ?? b.set(...)` 처럼 **값을 안 쓰고 곁효과만 쓰는 식**이
      // 몇 자리 있다(`seasonAwards.ts:429`). 결함이 아니라 취향이라 경고다.
      "@typescript-eslint/no-unused-expressions": [
        "warn",
        { allowShortCircuit: true, allowTernary: true },
      ],
    },
  },

  // ── Svelte ────────────────────────────────────────────────
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // ⚠ **끈다 — 못 쓴다.** `@typescript-eslint/no-unused-vars` 가
      //   `svelte-eslint-parser` 의 트리에서 터진다(`getDefinedMessageData` 에서
      //   `undefined.type`). 규칙이 나쁜 게 아니라 배선이 안 맞는 자리다.
      //   ⚠ 안 쓰는 변수는 **`tsc --noEmit`(strict)가 이미 본다** — 구멍이 아니다.
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",

      // `$: selectedYear, loadHistoryData();` — **스벨트가 가르치는 관용구**다
      // (반응 대상을 왼쪽에 적어 의존을 못 박는다). 규칙이 이걸 모른다.
      "@typescript-eslint/no-unused-expressions": "off",

      // ⚠ `case` 넷이 붙어 있고 사이에 주석이 있으면 **거짓 양성**이 난다
      //   (`MainPage.svelte:106` — 빈 case 이어붙이기인데 잡았다).
      //   유형 빠짐은 `_exhaustive: never` 가 **컴파일 때** 잡고 있다.
      "no-fallthrough": "off",

      // 아래 둘은 **결함이 아니라 판단**이라 경고로 둔다.
      //   · `{@html}` — `TeamMark.svelte` 가 팀 마크 SVG 를 그린다(입력은 우리 데이터)
      //   · 안 쓰는 `svelte-ignore` 셋 — 스벨트 5 로 오면서 경고가 사라진 자리
      "svelte/no-at-html-tags": "warn",
      "svelte/no-unused-svelte-ignore": "warn",
    },
  },

  // ── Electron main · preload (CommonJS) ────────────────────
  {
    files: ["apps/desktop/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // `.cjs` 는 **일부러** CommonJS 다 — electron main·preload 는 ESM 이 아니다
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },

  // ── 검사 코드 ─────────────────────────────────────────────
  {
    files: ["**/__tests__/**", "**/*.test.ts"],
    rules: {
      // 검사는 일부러 틀린 값을 넣는다
      "@typescript-eslint/no-explicit-any": "off",
      // 검사는 **모듈을 일부러 늦게 부른다**(모의를 먼저 걸려고)
      "@typescript-eslint/no-require-imports": "off",
      // 옛 식이 틀렸음을 못박는 **대조군**이 상수식이다
      //   (`pickInRound.test.ts` — `expect(56 % 8 || 8).toBe(8)`)
      "no-constant-binary-expression": "warn",
    },
  },
);
