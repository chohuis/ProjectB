import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 이벤트 목록(`_manifest.json`)이 **파일과 어긋나 있는가** (2026-09-04 · A).
 *
 * 🔴 **이벤트를 더해도 목록을 다시 안 만들면 그 이벤트는 영영 안 뜬다.**
 *    화면·엔진은 폴더를 훑지 않는다 — `masterStore` 가 `_manifest.json` 의
 *    id 목록만 읽어 `events/<칸>/<id>.json` 을 가져온다
 *    (`stores/master.ts` — `batchFetch(m.events.conditional, …)`).
 *
 * 실측(2026-09-04): 병영 재회 12종이 폴더에는 있는데 목록에는 없었다
 * (조건부 322 vs 파일 334). D 가 「전역 뒤 재회 훅 도달 0/12」로 적어 둔 것이
 * **배선 결함이 아니라 이 낡은 목록**이었다. `npm run gen:manifest` 한 번이면
 * 340개가 되고 12종이 들어온다.
 *
 * ⚠ `_manifest.json` 은 생성물이라 `.gitignore` 에 있다 — **없으면 넘어간다.**
 *   갓 받은 저장소에서 이 검사가 빨강이면 「목록이 낡았다」와 「아직 안
 *   만들었다」가 같아 보인다.
 */

const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const MANIFEST = resolve(MASTER, "_manifest.json");

type Manifest = { events?: Record<string, unknown> };

/**
 * 훑을 칸. **random 은 뺀다** — 목록이 { 풀 이름: id[] } 꼴이고 파일도
 * events/random/<풀>/<id>.json 으로 한 겹 더 들어가 셈이 다르다. 새던 자리는
 * 평평한 두 칸이라 거기만 본다.
 */
const LANES = ["mandatory", "conditional"] as const;

describe("이벤트 목록", () => {
  const has = existsSync(MANIFEST);
  const manifest: Manifest = has
    ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest)
    : {};

  const filesOf = (lane: string): string[] => {
    const dir = resolve(MASTER, "events", lane);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .sort();
  };

  it.each(LANES)("%s — 폴더에 있는 이벤트가 목록에도 다 있다", (lane) => {
    if (!has) return;                       // 아직 안 만든 저장소는 넘어간다
    const listed = new Set((manifest.events?.[lane] as string[]) ?? []);
    const missing = filesOf(lane).filter((id) => !listed.has(id));
    expect(missing, `목록에 없는 ${lane} 이벤트 — npm run gen:manifest`).toEqual([]);
  });

  it.each(LANES)("%s — 목록에 있는 이벤트가 파일로도 있다", (lane) => {
    if (!has) return;
    const files = new Set(filesOf(lane));
    const ghosts = ((manifest.events?.[lane] as string[]) ?? []).filter((id) => !files.has(id));
    expect(ghosts, `파일이 없는 ${lane} 이벤트 — 지웠으면 목록도 다시 만든다`).toEqual([]);
  });
});
