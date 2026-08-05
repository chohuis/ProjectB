/**
 * 팀 마크 — **그림이 아니라 데이터로 조립하는 SVG**다.
 *
 * 238팀에 각각 로고를 그리는 건 현실적이지 않다(고교만 102팀이고 전부 가상의
 * 학교다). 대신 이미 있는 것으로 만든다 — 팀 색 두 개와 이름.
 *
 *   외곽 5종 × 문양 12종 × 패턴 4종
 *
 * ⚠ **문양을 해시로만 고르면 같은 권역에서 겹친다.** 그래서 그룹(리그, 고교는
 * 권역) 안에서 **자리 번호로 배정**한다. 가장 큰 그룹이 대학 50팀이고
 * `lcm(5, 12) = 60`이라 (외곽, 문양) 짝이 그룹 안에서 절대 안 겹친다.
 *
 * 이름에 뜻이 있으면 그게 이긴다 — 웨이브스는 파도, 로열스는 왕관. 뜻이 있는
 * 팀을 먼저 앉히고 남은 자리를 번호로 채운다.
 *
 * 1군과 2군은 **같은 마크**를 쓴다 (`_1`/`_2`를 떼고 같은 키로 본다).
 */

export type ShellKey = "shield" | "circle" | "hex" | "wedge" | "rhomb";
export type MotifKey =
  | "seam" | "bats" | "star" | "bolt" | "mount" | "wave"
  | "ring" | "arrow" | "wing" | "flame" | "anchor" | "crown";
/** 0 없음 · 1 가로띠 · 2 사선 · 3 세로분할 */
export type BandKey = 0 | 1 | 2 | 3;

export interface MarkSpec {
  shell: ShellKey;
  motif: MotifKey;
  band: BandKey;
}

export interface MarkTeam {
  id: string;
  name: string;
  leagueId: string;
  /** 고교는 권역별로 구장을 공유한다 — 그룹 키로 쓴다 */
  stadium?: string;
  colors?: readonly string[];
}

// ── 외곽 ─────────────────────────────────────────────────────
export const SHELL: Record<ShellKey, string> = {
  shield: "M50 4 L93 18 V52 C93 76 73 92 50 99 C27 92 7 76 7 52 V18 Z",
  circle: "M50 4 A47 47 0 1 1 49.9 4 Z",
  hex:    "M50 3 L91 26 V76 L50 99 L9 76 V26 Z",
  wedge:  "M8 10 H92 V58 C92 80 73 93 50 99 C27 93 8 80 8 58 Z",
  rhomb:  "M50 2 L96 51 L50 100 L4 51 Z",
};
const SHELL_ORDER: ShellKey[] = ["shield", "circle", "hex", "wedge", "rhomb"];

// ── 문양. 중심 (50,52), 폭 약 46 ──────────────────────────────
const MOTIF: Record<MotifKey, string> = {
  seam: '<g fill="none" stroke="#FFF" stroke-width="5" stroke-linecap="round">'
      + '<circle cx="50" cy="52" r="21"/>'
      + '<path d="M36 38 C44 46 44 58 36 66" stroke-width="6"/>'
      + '<path d="M64 38 C56 46 56 58 64 66" stroke-width="6"/></g>',
  bats: '<g stroke="#FFF" stroke-width="7" stroke-linecap="round">'
      + '<path d="M33 71 L67 33"/><path d="M67 71 L33 33"/></g>'
      + '<circle cx="33" cy="71" r="5" fill="#FFF"/><circle cx="67" cy="71" r="5" fill="#FFF"/>',
  star:  '<path fill="#FFF" d="M50 28 L58 47 L79 48 L62 61 L68 81 L50 69 L32 81 L38 61 L21 48 L42 47 Z"/>',
  bolt:  '<path fill="#FFF" d="M56 26 L32 57 H46 L42 80 L68 47 H53 Z"/>',
  mount: '<path fill="#FFF" d="M22 72 L38 42 L48 58 L60 34 L80 72 Z"/>',
  wave: '<g fill="none" stroke="#FFF" stroke-width="7" stroke-linecap="round">'
      + '<path d="M24 60 Q34 46 44 60 T64 60 T80 56"/>'
      + '<path d="M24 74 Q34 60 44 74 T64 74 T80 70"/></g>',
  ring:  '<circle cx="50" cy="52" r="20" fill="none" stroke="#FFF" stroke-width="9"/>'
       + '<circle cx="50" cy="52" r="5" fill="#FFF"/>',
  arrow: '<path fill="#FFF" d="M50 26 L72 50 H58 V76 H42 V50 H28 Z"/>',
  wing: '<g fill="#FFF"><path d="M50 34 L74 46 L68 54 L50 48 Z"/>'
      + '<path d="M50 48 L72 60 L64 68 L50 62 Z"/>'
      + '<path d="M50 34 L26 46 L32 54 L50 48 Z"/>'
      + '<path d="M50 48 L28 60 L36 68 L50 62 Z"/></g>',
  flame: '<path fill="#FFF" d="M50 24 C62 40 70 46 70 60 C70 74 61 82 50 82 '
       + 'C39 82 30 74 30 60 C30 46 38 40 50 24 Z"/>',
  anchor: '<g fill="none" stroke="#FFF" stroke-width="6" stroke-linecap="round">'
        + '<path d="M50 34 V78"/><path d="M34 44 H66"/>'
        + '<path d="M28 62 C28 78 40 84 50 84 C60 84 72 78 72 62"/></g>'
        + '<circle cx="50" cy="30" r="6" fill="none" stroke="#FFF" stroke-width="5"/>',
  crown: '<path fill="#FFF" d="M24 72 L20 38 L34 50 L50 28 L66 50 L80 38 L76 72 Z"/>',
};
const MOTIF_ORDER: MotifKey[] = [
  "seam", "bats", "star", "bolt", "mount", "wave",
  "ring", "arrow", "wing", "flame", "anchor", "crown",
];

/** 이름에 뜻이 있으면 그걸 쓴다. 위에서부터 먼저 맞는 것 */
const KEYWORD: Array<[readonly string[], MotifKey]> = [
  [["웨이브", "파도", "바다", "머린", "하버", "오션"], "wave"],
  [["스타", "별빛", "코메트"], "star"],
  [["로열", "킹", "엠파이어", "모나크"], "crown"],
  [["샤크", "호크", "크레인", "이글", "팰컨"], "wing"],
  [["팬텀", "코브라", "팬서", "블레이즈", "파이어"], "flame"],
  [["세이버", "블레이드", "소드", "나이츠", "가디언"], "bats"],
  [["한강", "강변", "금강", "낙동", "레이크"], "wave"],
  [["설악", "팔공", "한라", "계룡", "무등", "피크"], "mount"],
  [["창공", "미르", "드레이크", "제트", "로켓"], "arrow"],
  [["태종", "앵커", "포트", "베이"], "anchor"],
  [["노을", "영산", "남녘", "선"], "flame"],
  [["볼트", "썬더", "라이트닝", "네온", "일렉"], "bolt"],
  [["오빗", "서클", "링"], "ring"],
  [["스팅", "와스프", "호넷"], "bolt"],
];

export const DEFAULT_PRIMARY = "#1E3050";
export const DEFAULT_ACCENT  = "#8FAFFF";

/** 1군·2군은 같은 마크다 — 꼬리표를 뗀 것이 진짜 키 */
export function markKey(teamId: string): string {
  return teamId.replace(/_[12]$/, "");
}

/** 문양이 안 겹쳐야 하는 단위. 고교는 권역, 나머지는 리그 */
export function groupKey(t: MarkTeam): string {
  if (t.leagueId === "LEAGUE_HIGHSCHOOL" && t.stadium) return t.stadium;
  return t.leagueId;
}

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function keywordMotif(name: string): MotifKey | null {
  for (const [keys, m] of KEYWORD) {
    if (keys.some((k) => name.includes(k))) return m;
  }
  return null;
}

/**
 * 전체 팀 목록에서 마크 배정표를 만든다. **한 번만 부르고 캐시한다.**
 *
 * 그룹 안에서 자리 번호 `i`를 매기고 `외곽 = i % 5`, `문양 = i % 12`로 간다.
 * 두 주기의 최소공배수가 60이라 그룹이 60팀 미만이면 짝이 안 겹친다
 * (가장 큰 그룹이 대학 50팀이다 — 테스트가 이 전제를 지킨다).
 */
export function buildMarkIndex(teams: readonly MarkTeam[]): Map<string, MarkSpec> {
  const out = new Map<string, MarkSpec>();

  const byGroup = new Map<string, MarkTeam[]>();
  const seen = new Set<string>();
  for (const t of teams) {
    const key = markKey(t.id);
    if (seen.has(key)) continue;      // 2군은 1군과 같은 마크라 한 번만
    seen.add(key);
    const g = groupKey(t);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(t);
  }

  for (const [, list] of byGroup) {
    // 같은 목록이면 언제나 같은 결과가 나오게 ID로 정렬한다
    list.sort((a, b) => (markKey(a.id) < markKey(b.id) ? -1 : 1));

    const n = list.length;
    const band = (t: MarkTeam) => ((fnv(markKey(t.id)) >>> 7) % 4) as BandKey;

    if (n <= MOTIF_ORDER.length) {
      // ── 작은 그룹 — 문양을 전부 다르게 줄 수 있으므로 짝은 저절로 유일하다.
      // 자리에 묶을 이유가 없어 이름 뜻을 그대로 존중한다.
      //
      // ⚠ 아래 큰-그룹 방식을 여기 쓰면 안 된다. 자리가 n개뿐이라
      // `p % 12`로 닿을 수 있는 문양이 앞 n종으로 잘린다 — KBL은 10팀이라
      // `anchor`·`crown`에 영영 못 간다(로열스가 왕관을 못 받았다).
      const used = new Set<MotifKey>();
      const chosen = new Map<string, MotifKey>();
      for (const t of list) {
        const want = keywordMotif(t.name);
        if (want && !used.has(want)) { chosen.set(markKey(t.id), want); used.add(want); }
      }
      let next = 0;
      list.forEach((t, i) => {
        const key = markKey(t.id);
        let motif = chosen.get(key);
        if (!motif) {
          while (used.has(MOTIF_ORDER[next])) next++;
          motif = MOTIF_ORDER[next];
          used.add(motif);
        }
        out.set(key, { shell: SHELL_ORDER[i % SHELL_ORDER.length], motif, band: band(t) });
      });
      continue;
    }

    // ── 큰 그룹 — 문양이 반드시 반복되므로 외곽으로 갈라야 한다.
    // 자리(index)가 마크를 정한다: `외곽 = i % 5`, `문양 = i % 12`.
    // 최소공배수가 60이라 60팀 미만이면 짝이 안 겹친다.
    //
    // 이름 뜻은 마크를 **덮어쓰지 않고 자리를 맞바꾼다.** 덮어쓰면 다른 팀이
    // 번호로 받은 문양과 충돌한다(처음에 그렇게 짰다가 대학·ABL에서 4건 났다).
    // 맞바꾸기는 일대일 대응을 유지하므로 유일성이 안 깨진다.
    const at = [...list];
    const locked = new Set<number>();

    for (let p = 0; p < at.length; p++) {
      if (locked.has(p)) continue;
      const want = keywordMotif(at[p].name);
      if (!want) continue;
      const di = MOTIF_ORDER.indexOf(want);
      if (di === p % MOTIF_ORDER.length) { locked.add(p); continue; }
      let q = -1;
      for (let k = di; k < at.length; k += MOTIF_ORDER.length) {
        if (!locked.has(k)) { q = k; break; }
      }
      if (q < 0) continue;                // 빈 자리가 없으면 번호대로 둔다
      [at[p], at[q]] = [at[q], at[p]];
      locked.add(q);
      p--;                                // p로 옮겨온 팀도 다시 본다
    }

    at.forEach((t, i) => {
      out.set(markKey(t.id), {
        shell: SHELL_ORDER[i % SHELL_ORDER.length],
        motif: MOTIF_ORDER[i % MOTIF_ORDER.length],
        band: band(t),
      });
    });
  }
  return out;
}

/** 배정표에 없는 팀(새로 생긴 팀 등)도 화면이 비지 않게 */
export function fallbackSpec(teamId: string): MarkSpec {
  const h = fnv(markKey(teamId));
  return {
    shell: SHELL_ORDER[h % SHELL_ORDER.length],
    motif: MOTIF_ORDER[(h >>> 4) % MOTIF_ORDER.length],
    band: ((h >>> 7) % 4) as BandKey,
  };
}

/**
 * SVG 문자열을 만든다. 파일이 아니라 문자열이라 크기 제약이 없다.
 *
 * ⚠ 문양은 언제나 **흰색**이다. 팀 색 위에서 흰 글씨가 읽히는 건
 * `check:teamcolors`가 182팀 전수로 보증한다(주색 L\* 상한·보조색 대비 4.5:1).
 */
export function teamMarkSvg(
  spec: MarkSpec,
  colors?: readonly string[] | null,
  label = "",
): string {
  const primary = colors?.[0] || DEFAULT_PRIMARY;
  const accent  = colors?.[1] || DEFAULT_ACCENT;
  const shell = SHELL[spec.shell];
  // clipPath id가 문서 안에서 겹치면 잘림이 엉킨다 — 형태로 유일하게 만든다
  const cid = `tm-${spec.shell}-${spec.band}`;

  const parts = [
    `<svg viewBox="0 0 100 102" width="100%" height="100%" role="img" aria-label="${label}">`,
    `<defs><clipPath id="${cid}"><path d="${shell}"/></clipPath></defs>`,
    `<path d="${shell}" fill="${primary}"/>`,
  ];
  if (spec.band === 1) {
    parts.push(`<rect x="0" y="40" width="100" height="17" fill="${accent}" clip-path="url(#${cid})"/>`);
  } else if (spec.band === 2) {
    parts.push(`<path d="M-10 78 L110 30 V54 L-10 102 Z" fill="${accent}" clip-path="url(#${cid})"/>`);
  } else if (spec.band === 3) {
    parts.push(`<rect x="50" y="0" width="50" height="102" fill="${accent}" clip-path="url(#${cid})"/>`);
  }
  parts.push(MOTIF[spec.motif]);
  parts.push(`<path d="${shell}" fill="none" stroke="${spec.band === 0 ? accent : primary}" stroke-width="5"/>`);
  parts.push("</svg>");
  return parts.join("");
}
