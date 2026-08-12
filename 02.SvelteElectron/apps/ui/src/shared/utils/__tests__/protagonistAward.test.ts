import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 주인공도 수상 후보에 오른다 ──────────────────────────────────
//
// 주인공 기록은 `seasonStore.stats[p.id]`에 따로 있고 리그 맵
// (`leagueState[].stats`)엔 **없다.** 그래서 `computeAwards`가 리그 맵만
// 받던 시절엔 주인공이 **어떤 부문도 이길 수 없었고**,
// `SeasonEndModal`의 `a.playerId === pid` 필터는 영원히 빈 배열이었다.
//
// 파급이 수상에서 끝나지 않는다:
//   · `universityUtils`의 진학 점수 `awards.length * 15`가 항상 0
//   · 경력 화면·인생 기록에 주인공 수상이 한 번도 안 남음
//   · 드래프트에 수상을 넣어도 값이 0으로 들어옴
//
// ⚠ **자기 리그에만 넣어야 한다.** `s.stats`는 승강하면 1군·2군이 합산돼
// 있어서, 다른 리그 후보로 올리면 저울이 어긋난다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("주인공 수상 후보", () => {
  const src = read("apps/ui/src/shared/usecases/seasonAwards.ts");

  it("리그 맵에 주인공 기록을 합쳐 넘긴다", () => {
    expect(src).toMatch(/\{ \.\.\.leagueOnly, \[prot\.id\]: protStat \}/);
  });

  it("자기 리그일 때만 넣는다 — 승강 합산이 다른 리그로 새면 안 된다", () => {
    expect(src).toMatch(/prot\.leagueId === leagueId/);
  });

  it("기록이 없으면 리그 맵을 그대로 쓴다", () => {
    // 갓 시작한 시즌엔 주인공 기록이 없다 — 그때 빈 항목을 넣으면
    // 규정이닝 미달 후보가 하나 늘 뿐이지만, 굳이 넣을 이유가 없다
    expect(src).toMatch(/protStat && prot\.leagueId === leagueId/);
    expect(src).toMatch(/: leagueOnly;/);
  });

  // ── 뒷단: 이겨도 기록될 곳이 없었다 ──────────────────────────
  //
  // 후보에 넣는 것만으로는 **여전히 0건**이다. `addSeasonHighlights`가
  // `s.npcs`만 훑는데 주인공은 npc 목록에 없어서 그대로 버려졌다.
  // 실측으로 확인했다 — 후보 수정만 넣고 30회 돌렸더니 수상 0/30.
  describe("주인공 수상 저장", () => {
    const store = read("apps/ui/src/shared/stores/game.ts");

    it("주인공 전용 기록 경로가 있다", () => {
      expect(store).toMatch(/addProtagonistAwards\(seasonYear: number, awards: CareerAward\[\]\)/);
    });

    it("그 해 항목에 얹는다 — 없으면 조용히 넘어간다", () => {
      expect(store).toMatch(/recs\.findIndex\(\(r\) => r\.year === seasonYear\)/);
      expect(store).toMatch(/if \(i < 0\) return s;/);
    });

    it("기존 수상을 덮어쓰지 않는다", () => {
      expect(store).toMatch(/awards: \[\.\.\.\(next\[i\]\.awards \?\? \[\]\), \.\.\.awards\]/);
    });

    it("수상 계산이 그 경로를 실제로 부른다", () => {
      expect(src).toMatch(/gameStore\.addProtagonistAwards\(seasonYear, protAwards\)/);
    });

    it("부문상과 MVP 둘 다 담는다", () => {
      expect(src).toMatch(/protAwards\.push\(\{ id: w\.defId/);
      expect((src.match(/protAwards\.push\(\{ id: "mvp"/g) ?? []).length).toBe(2);
    });

    it("title 문자열을 다시 파싱하지 않는다 — 정본이 둘이 되면 어긋난다", () => {
      // `"방어율왕 (2.31)"`를 정규식으로 되쪼개 label/value를 복원하면
      // `fmt`가 바뀔 때 조용히 깨진다. 구조체를 그대로 들고 간다
      expect(src).not.toMatch(/protAwards[\s\S]{0,200}\.match\(|title\.replace\(/);
    });

    it("빈 배열이면 스토어를 건드리지 않는다", () => {
      expect(store).toMatch(/if \(awards\.length === 0\) return;/);
    });
  });

  // ── 셋째 겹: 얹을 시즌 항목 자체가 없었다 ────────────────────
  //
  // 앞의 두 겹을 고치고도 실측 수상은 0/30이었다. `appendCareerRecord`의
  // 유일한 호출부가 `SeasonEndModal.svelte`라 **결산 화면을 열어야만**
  // `careerRecords`가 쌓였고, 자동 진행에선 은퇴할 때까지 한 줄도 없었다.
  //
  // 수상보다 파급이 크다 — 경력 표·은퇴 결산·팀 이력·진학 점수가 전부
  // 빈 배열을 읽고 있었다.
  describe("주인공 시즌 기록", () => {
    const roll = read("apps/ui/src/shared/usecases/seasonRollover.ts");
    const modal = read("apps/ui/src/features/season-end/ui/SeasonEndModal.svelte");
    const rec = read("apps/ui/src/shared/usecases/seasonCareerRecord.ts");

    it("롤오버가 시즌 기록을 남긴다 — 화면과 무관하게", () => {
      expect(roll).toMatch(/applyProtagonistSeasonRecord\(now\)/);
    });

    it("수상보다 먼저 부른다 — 순서가 뒤집히면 얹을 자리가 없다", () => {
      expect(roll.indexOf("applyProtagonistSeasonRecord(now)"))
        .toBeLessThan(roll.indexOf("applySeasonAwards(now)"));
    });

    it("모달은 더 이상 기록을 만들지 않는다 — 중복 방지", () => {
      expect(modal).not.toMatch(/gameStore\.appendCareerRecord\(/);
    });

    it("한 해 두 줄을 막는다", () => {
      expect(rec).toMatch(/careerRecords \?\? \[\]\)\.some\(\(r\) => r\.year === seasonYear\)/);
    });

    it("수상은 여기서 넣지 않는다 — addProtagonistAwards가 뒤에 얹는다", () => {
      expect(rec).toMatch(/awards: \[\],/);
    });

    it("연습경기는 경력 기록에 안 남는다", () => {
      expect(rec).toMatch(/!e\.isFriendly/);
    });
  });

  it("시즌 롤오버가 수상을 계산한다 — 모달을 안 열어도 남아야 한다", () => {
    // `computeAwards`가 `SeasonEndModal`의 반응형 구문에만 있으면
    // 화면을 안 여는 플레이(자동 진행)에서 수상이 아예 안 생긴다
    const roll = read("apps/ui/src/shared/usecases/seasonRollover.ts");
    expect(roll).toMatch(/applySeasonAwards\(now\)/);
  });

  it("자격 이닝이 고교 시즌 길이에 맞다", () => {
    // 팀 공식경기가 21~36으로 갈리고(넉아웃 대회) 60이면 자격자가 구조적으로
    // 안 나온다. 그래서 60 → 45로 내렸는데 **그것도 절벽 위였다.**
    //
    // ⚠ **자격선을 실측 중앙값에 붙이면 안 된다.** 45일 때 고교 이닝 중앙이
    // 44.3(1학년)·32.0(2학년)이라 자격자가 표본의 절반 언저리였고, 같은
    // seed·같은 정책인데 수상 회차가 **8/30 ↔ 1/30**으로 널뛰었다. 산식을
    // 바꾼 탓으로 오해하기 딱 좋은 형태다 — 자격선이 분포 한가운데 있으면
    // 아무것도 안 바뀌어도 결과가 흔들린다.
    //
    // 중앙값보다 아래로 내려 표본 흔들림에 안 걸리게 한다.
    const rules = JSON.parse(read("resource/data/master/players/generation_rules.json"));
    const byLabel = Object.fromEntries(
      rules.awardRules.pitcher.map((d: { label: string; minIp: number }) => [d.label, d.minIp]),
    );
    expect(byLabel["다승왕"]).toBe(40);
    expect(byLabel["탈삼진왕"]).toBe(40);
    expect(byLabel["방어율왕"]).toBe(45);   // 규정이닝 성격이라 한 단계 위
  });
});
