/**
 * 주간 리포트 문안 — **정본은 `resource/data/master/messages/reports.json` 이다** (C2).
 *
 * 훈련·부상·내 몸 세 리포트의 제목과 본문 한두 줄이 **코드에 굳어 있었다.**
 * 「W12 주간 훈련 결과」가 15년이면 700줄, 「4월 부상 리포트」가 180줄이다 —
 * 소식함을 열면 같은 제목이 화면을 덮는다. 문안을 데이터로 빼고 은행에서 뽑는다.
 *
 * ## 조합마다 문장을 따로 쓰지 않는다
 *
 * 무대 5 × 성과 3 × 훈련 12 = 180 조합인데 조합마다 네 문장을 쓰면 900줄이고
 * 그 900줄은 손으로 못 지킨다. **무대×성과(15묶음)** 와 **훈련 종류(12)** 를
 * 따로 두고 여기서 이어 붙인다 — 96줄로 180조합이 선다.
 *
 * ## 없으면 지어내지 않는다
 *
 * 은행을 못 읽으면 `null` 이고 **부르는 쪽이 옛 문구를 그대로 쓴다.**
 * `dashboardCopy` 가 「문안이 없으면 키를 그대로」로 그은 선과 같다 — 여기서
 * 기본 문장을 만들면 그게 곧 사본이고, 한쪽만 고쳐진 채 남는다.
 *
 * ## 난수는 호출자가 넘긴다
 *
 * TS 게임 로직에서 `Math.random()` 은 금지다(CLAUDE.md). 주간 루프가 이미
 * Rust 에서 뽑아 온 난수 배열을 들고 있으므로 거기 얹는다 — 이벤트 본문 은행
 * (`eventEngine`)이 먼저 그은 선이고, 직전 제외 규칙도 그대로 `pickSentence` 다.
 */

import { pickSentence, type SentenceMemory } from "./sentenceBank";

/** 그 주 훈련이 기대 대비 어땠나. **데이터가 못 정한다** — 생산부가 XP 로 판정한다 */
export type ReportOutcome = "good" | "normal" | "poor";

/** 은행이 가르는 무대. `pro_kbl`·`pro_abl`·`pro_jbl` 은 전부 `pro` 로 접힌다 */
export type ReportStage = "highschool" | "university" | "independent" | "pro" | "military";

const OUTCOMES: readonly ReportOutcome[] = ["good", "normal", "poor"];

export interface TrainingReportCopy {
  subjects: string[];
  /** `[무대][성과] → 문장 은행` */
  byStageOutcome: Record<string, Record<string, string[]>>;
  /** `[프로그램 id] → 문장 은행` */
  byProgram: Record<string, string[]>;
}

export interface ReportCopy {
  training: TrainingReportCopy;
  injury: { subjects: string[] };
  myBody: { subjects: string[]; leads: string[] };
}

/**
 * 무대 → 은행 키. **모르는 무대는 `null`** 이라 그 자리는 은행을 안 쓴다.
 *
 * ⚠ 프로 셋(`pro_kbl`·`pro_abl`·`pro_jbl`)을 여기서 접는다. 리그마다 문안을
 *   따로 두면 셋이 한쪽만 고쳐진 채 남는다 — 무대의 말은 리그가 아니라
 *   「프로에 있다」가 정한다.
 */
export function reportStageOf(careerStage: string): ReportStage | null {
  if (careerStage.startsWith("pro")) return "pro";
  if (
    careerStage === "highschool" ||
    careerStage === "university" ||
    careerStage === "independent" ||
    careerStage === "military"
  ) {
    return careerStage;
  }
  return null;
}

/** 문자열 배열인가 — 문안 파일이 손으로 쓰이므로 모양을 한 번 본다 */
function bank(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** `{ 키: 문장 은행 }` — `_note` 처럼 밑줄로 시작하는 칸은 설명이라 뺀다 */
function bankMap(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k.startsWith("_")) continue;
    const b = bank(x);
    if (b.length > 0) out[k] = b;
  }
  return out;
}

/**
 * 읽은 JSON 을 받는다. **모양만 본다** — 무대가 다섯 다 있는지 세지 않는다.
 * 없는 무대는 찾을 때 빈 배열이 되고 부르는 쪽이 그 줄을 안 붙인다.
 *
 * ⚠ **제목 은행 셋이 다 비면 통째로 `null` 이다.** 제목이 이 파일의 값어치라
 *   그게 없으면 읽은 것과 못 읽은 것이 구별되지 않는다.
 */
export function parseReportCopy(raw: unknown): ReportCopy | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;

  const t = (o.training ?? {}) as Record<string, unknown>;
  const inj = (o.injury ?? {}) as Record<string, unknown>;
  const mb = (o.myBody ?? {}) as Record<string, unknown>;

  const byStageOutcome: Record<string, Record<string, string[]>> = {};
  const rawStages = (t.byStageOutcome ?? {}) as Record<string, unknown>;
  for (const [stage, v] of Object.entries(rawStages)) {
    if (stage.startsWith("_")) continue;
    const m = bankMap(v);
    const kept: Record<string, string[]> = {};
    for (const oc of OUTCOMES) if (m[oc]) kept[oc] = m[oc];
    if (Object.keys(kept).length > 0) byStageOutcome[stage] = kept;
  }

  const copy: ReportCopy = {
    training: {
      subjects: bank(t.subjects),
      byStageOutcome,
      byProgram: bankMap(t.byProgram),
    },
    injury: { subjects: bank(inj.subjects) },
    myBody: { subjects: bank(mb.subjects), leads: bank(mb.leads) },
  };

  const anySubject =
    copy.training.subjects.length > 0 ||
    copy.injury.subjects.length > 0 ||
    copy.myBody.subjects.length > 0;
  return anySubject ? copy : null;
}

/**
 * 은행 하나를 뽑고 뽑은 인덱스를 기억한다.
 *
 * 🔴 **기억 키를 은행마다 가른다.** `train#subject`·`train#body`·`train#program`
 *   처럼 갈라야 한 은행의 「직전 것」이 다른 은행을 안 흔든다. 한 키로 묶으면
 *   제목 은행이 6개, 본문 은행이 4개인데 같은 인덱스를 나눠 쓰게 되어
 *   본문에서 늘 3번이 빠지는 식이 된다.
 *
 * ⚠ **난수가 모자라면 0.5 다** — `eventEngine.nextRand` 와 같은 규칙이다.
 *   `Math.random()` 으로 새면 계측이 재현되지 않는다.
 */
export class BankPicker {
  private ri = 0;
  /** 이번 주에 뽑은 것. 세이브의 `sentenceMemory` 에 되돌린다 */
  readonly picks: SentenceMemory = {};

  constructor(
    private readonly memory: SentenceMemory,
    private readonly rands: readonly number[],
  ) {}

  /** 못 뽑으면 빈 문자열 — 부르는 쪽이 그때 그 줄을 안 쓴다 */
  pick(key: string, b: readonly string[]): string {
    if (b.length === 0) return "";
    const r = this.rands[this.ri++] ?? 0.5;
    const last = this.picks[key] ?? this.memory[key] ?? -1;
    const got = pickSentence(b, r, last);
    if (!got) return "";
    this.picks[key] = got.index;
    return got.text;
  }
}

/**
 * 훈련 본문 두 줄. **무대×성과 한 줄 + 훈련 종류 한 줄**을 이어 붙인다.
 *
 * ⚠ 훈련 종류는 **주 슬롯**만 본다. 보조 둘까지 붙이면 본문이 넉 줄이 되고,
 *   그 주에 뭘 했는지가 아니라 목록이 된다.
 */
export function trainingBody(
  copy: ReportCopy | null,
  picker: BankPicker,
  stage: ReportStage | null,
  outcome: ReportOutcome,
  primaryProgramId: string | null,
): string {
  if (!copy) return "";
  const stageBank = stage ? (copy.training.byStageOutcome[stage]?.[outcome] ?? []) : [];
  const progBank = primaryProgramId ? (copy.training.byProgram[primaryProgramId] ?? []) : [];
  const lines = [
    picker.pick("train#body", stageBank),
    picker.pick("train#program", progBank),
  ].filter((s) => s.length > 0);
  return lines.join("\n");
}

/**
 * 이름 있는 자리표 하나를 채운다 (`{month}`). **정규식을 안 쓴다** —
 * `dashboardCopy.fillVar` 와 같은 규칙이고, 값이 없는 자리표는 그대로 남긴다.
 */
export function fillReportVar(tmpl: string, name: string, v: string): string {
  return tmpl.split(`{${name}}`).join(v);
}
