#!/usr/bin/env node
/**
 * **투수 전용 이벤트가 대상을 밝히는가.**
 *
 * 🔴 2026-08-25 실측: 전체 공용 11종 중 **여덟이 투수 대사인데 조건에
 * `player_type`이 없었다.** "커맨드가 장난 아니네" 댓글도, "30구 추가 불펜"도,
 * "투구폼 잡는 게 평생 숙제야"도 대상을 안 밝혔다. 보상도 같아서 여덟 중
 * 다섯이 `xp.command` / `xp.velocity`를 줬다.
 *
 * ⚠ **오늘은 이 검사가 아무것도 안 막는다** — 주인공은 `NewGamePage.svelte`에서
 * `playerType: "pitcher"`로 하드코딩돼 있어 항상 투수다. 값은 **타자가 열리는
 * 날**에 나온다. 그때 이 검사가 빨간불이 되어 "여기 타자판이 없다"를 알린다.
 *
 * 두 가지를 본다:
 *   ① 투구 어휘가 든 문장을 쓰는 규칙에 `player_type` 선언이 있는가
 *   ② 투구 XP·능력치를 주는 선택지가 대상을 가리는가
 *      (규칙이 선언했거나, 선택지 자신이 `conditions`로 갈렸거나)
 */
const fs = require("node:fs");
const path = require("node:path");
const M = "resource/data/master";

const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const RULES = ["mandatory", "conditional", "random"].flatMap((lane) =>
  walk(path.join(M, "events", lane)).filter((f) => f.endsWith(".json"))
    .map((f) => ({ lane, file: f, ...JSON.parse(fs.readFileSync(f, "utf8")) })));

const TMPL = new Map(JSON.parse(fs.readFileSync(`${M}/messages/templates.json`, "utf8"))
  .templates.map((t) => [t.id, t]));
const DEC = new Map(JSON.parse(fs.readFileSync(`${M}/messages/decision_templates.json`, "utf8"))
  .decisions.map((d) => [d.id, d]));

/**
 * 투수 어휘. **타자에게 뜨면 말이 안 되는 말**만 고른다.
 * ⚠ "공"·"던지"는 안 넣는다 — 타자도 공을 보고 송구를 던진다. 헛것을 잡는다
 */
const PITCH_WORDS = /불펜|투구폼|투구 리듬|릴리스|등판|탈삼진|볼넷|제구|커맨드|구종|삼진을|마운드|에이스|선발 로테이션|완투|피안타/;
/** 투구 능력치 — 보상 키로 쓰인다 */
const PITCH_STATS = /^(stamina|velocity|command|control|movement|mentality|recovery|clutch|holdRunners)$/;

const declares = (conds) => (conds ?? []).some((c) => c.type === "player_type");

/** 그 선택지가 투구 보상을 주나 */
function pitcherReward(o) {
  const keys = [];
  if (Array.isArray(o.effects)) {
    for (const s of o.effects) {
      const k = s.slice(0, s.indexOf(":"));
      if (k.startsWith("xp.")) keys.push(k.slice(3));
      else if (k.startsWith("stat.")) keys.push(k.slice(5));
    }
  } else if (o.effects && typeof o.effects === "object") {
    keys.push(...Object.keys(o.effects.xp ?? {}), ...Object.keys(o.effects.statDelta ?? {}));
  }
  return keys.some((k) => PITCH_STATS.test(k));
}

const wordFails = [];
const rewardFails = [];

for (const r of RULES) {
  const t = TMPL.get(r.messageTemplateId);
  const bodies = t ? (Array.isArray(t.bodies) && t.bodies.length ? t.bodies : [t.body ?? ""]) : [];
  // 제목과 본문을 같이 본다 — 제목만 투수인 경우가 있다("추가 불펜 세션 제안")
  const hay = [String(t?.subject ?? ""), ...bodies.map(String)].join(" ");
  const hit = hay.match(PITCH_WORDS);
  if (hit && !declares(r.conditions)) wordFails.push([r.id, hit[0]]);

  const d = DEC.get(r.decisionTemplateId);
  if (!d) continue;
  for (const o of d.options ?? []) {
    // 규칙이 선언했으면 그 아래 선택지는 다 그 대상이다.
    // 선택지가 스스로 갈렸으면 그것도 밝힌 것이다
    if (declares(r.conditions) || declares(o.conditions)) continue;
    if (pitcherReward(o)) rewardFails.push([r.id, o.id]);
  }
}

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[투수 선언] 규칙 ${RULES.length}건`);
log(`  ① 투구 어휘 문장인데 player_type 선언 없음   ${wordFails.length}건`);
log(`  ② 투구 보상인데 대상을 안 가림                ${rewardFails.length}건`);

if (RULES.length === 0) {
  log("  🔴 규칙을 하나도 못 읽었다 — 경로가 틀렸다");
  process.exit(1);
}

// ⚠ 지금은 0이 아니다 — 2026-08-25 실측 ① 75 · ② 307. **게임 콘텐츠가
//   통째로 투수 서사**라 칸을 다 훑기 전에는 못 내린다. 상한을 실측값으로
//   잡아 **더 늘지 않는 것**만 지킨다. 칸을 하나 끝낼 때마다 내린다.
//
//   ⚠ ②가 307인 건 결함이 307건이라는 뜻이 아니다. 주인공이 투수뿐이라
//   투구 XP를 주는 게 지금은 옳다. 이 숫자는 **타자가 열리는 날 해야 할 일의
//   크기**다
//   ⚠ ②를 307 → 316 으로 올렸다 (2026-09-02 · B-4). **콘텐츠가 는 게 아니라
//   가리키는 곳을 바꿨다** — 소식↔선택지 어긋남 7건을 고치면서 회식·인터뷰
//   템플릿(사기·피로만 준다)에서 회복일·우천·후배 템플릿(투구 XP 를 준다)으로
//   옮겼다. 옮긴 이벤트 7건 × 그 템플릿의 무가드 갈래 = 9. 새 보상을 하나도
//   안 만들었고 숫자도 전부 기존 템플릿에서 그대로 베꼈다.
//   🔴 ②를 316 → 369 로 올렸다 (2026-09-08 · 4-2 등급 달기). **이번엔 진짜로
//   늘었다** — 승격 146건이 투구 XP·즉시 스탯을 새로 얹었고 그중 53자리가
//   `player_type` 선언이 없는 갈래다. 앞선 두 번(307→316)은 가리키는 곳만
//   바꾼 것이었지만 이건 보상을 만든 것이다.
//   ⚠ **그래서 타자가 열리는 날 해야 할 일이 53자리 늘었다.** 승격한 이벤트는
//   무대 전체에 뜨는 것들이라 `player_type: pitcher` 를 달면 그 무대의 등급
//   재고가 반으로 준다 — 달지 않고 숫자로 남긴다. 4-4 이후 타자 갈래를 만들 때
//   이 369 가 그 크기다.
const CAP_WORD = 75;
const CAP_REWARD = 369;
let bad = false;
if (wordFails.length > CAP_WORD) {
  bad = true;
  log(`  🔴 ①이 상한 ${CAP_WORD}을 넘었다`);
  for (const [id, w] of wordFails.slice(0, 20)) log(`      ${id.padEnd(36)}"${w}"`);
}
if (rewardFails.length > CAP_REWARD) {
  bad = true;
  log(`  🔴 ②가 상한 ${CAP_REWARD}을 넘었다`);
  for (const [id, o] of rewardFails.slice(0, 20)) log(`      ${id.padEnd(36)}${o}`);
}
if (!bad) log(`  ok  상한 안이다 (① ≤${CAP_WORD} · ② ≤${CAP_REWARD})`);
log("");
process.exit(bad ? 1 : 0);
