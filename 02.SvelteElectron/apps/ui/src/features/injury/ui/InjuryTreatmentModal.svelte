<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import type { PendingAction } from "../../../shared/types/season";
  import type { InjuryTreatment } from "../../../shared/types/save";
  import { INJURY_LABEL } from "../../../shared/types/save";

  export let action: Extract<PendingAction, { type: "injuryTreatment" }>;

  type Option = {
    id: InjuryTreatment;
    label: string;
    duration: string;
    cost: string;
    note: string;
  };

  const SURGERY_ELIGIBLE = new Set(["UCL_PARTIAL", "ROTATOR_STRAIN"]);

  $: options = buildOptions(action.injuryType, action.severity);

  function buildOptions(injuryType: string, severity: "moderate" | "severe"): Option[] {
    if (injuryType === "YIPS") {
      return [
        {
          id: "self",
          label: "자가 극복",
          duration: "10~20주 (불확실)",
          cost: "없음",
          note: "완치율 40% — 실패 시 +4주 연장, 영구 손실 제구·커맨드 -3",
        },
        {
          id: "counseling",
          label: "스포츠 심리 상담",
          duration: "8~12주",
          cost: "주당 80만원",
          note: "완치율 75%, 영구 손실 제구·커맨드 -1",
        },
      ];
    }
    if (severity === "moderate") {
      return [
        {
          id: "conservative",
          label: "보존 치료 (물리치료)",
          duration: "기준 그대로",
          cost: "주당 30만원",
          note: "영구 손실 없음, 재발 위험 낮음",
        },
        {
          id: "steroid",
          label: "스테로이드 주사",
          duration: "3주 단축",
          cost: "200만원",
          note: "재발 시 중증으로 악화, 이후 부상 확률 +25%",
        },
      ];
    }
    // severe (non-YIPS)
    const opts: Option[] = [
      {
        id: "conservative",
        label: "보존 재활 (물리치료+재활)",
        duration: "기준 그대로",
        cost: "주당 50만원",
        note: "영구 손실 최소치, 재발 위험 낮음",
      },
      {
        id: "prp",
        label: "PRP 주사 + 재활",
        duration: "5주 단축",
        cost: "500만원",
        note: "영구 손실 최소치, 재발 위험 중간",
      },
    ];
    if (SURGERY_ELIGIBLE.has(injuryType)) {
      opts.push({
        id: "surgery",
        label: "수술로 전환",
        duration: "훨씬 길어짐",
        cost: "수술비 별도",
        note: "영구 손실이 방치+재발보다 적을 수 있음",
      });
    }
    return opts;
  }

  function choose(id: InjuryTreatment) {
    gameStore.applyInjuryTreatment(id);
    seasonStore.resolvePendingAction("injuryTreatment");
    gameStore.save();
    seasonStore.save();
  }
</script>

<div class="overlay">
  <div class="modal">
    <h2 class="title">부상 치료 방식 선택</h2>

    <div class="injury-info">
      <span class="severity-badge severity-{action.severity}">
        {action.severity === "moderate" ? "중상" : "중증"}
      </span>
      <span class="injury-name"
        >{INJURY_LABEL[action.injuryType as keyof typeof INJURY_LABEL] ?? action.injuryType}</span
      >
    </div>

    <p class="desc">치료 방식을 선택하세요. 선택 후 변경할 수 없습니다.</p>

    <div class="options">
      {#each options as opt}
        <button class="option-card" on:click={() => choose(opt.id)}>
          <div class="opt-header">
            <span class="opt-label">{opt.label}</span>
            <span class="opt-cost">{opt.cost}</span>
          </div>
          <div class="opt-duration">회복 기간: {opt.duration}</div>
          <div class="opt-note">{opt.note}</div>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 18, 38, 0.52);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background: var(--panel);
    /* U5 안전망: 아직 어두운 화면이다. 전역 글자색이 밝은색에서 어두운색으로
       뒤집혔으므로 여기서 명시하지 않으면 색 없는 자식들이 안 보인다 */
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 28px 32px;
    width: min(520px, 92vw);
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--ink);
  }

  .injury-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .severity-badge {
    font-size: 12px;
    font-weight: 700;
    border-radius: 6px;
    padding: 3px 10px;
  }
  .severity-moderate {
    background: rgba(255, 160, 50, 0.15);
    color: var(--warn);
    border: 1px solid rgba(154, 101, 16, 0.3);
  }
  .severity-severe {
    background: rgba(220, 60, 60, 0.15);
    color: var(--bad);
    border: 1px solid rgba(179, 49, 31, 0.26);
  }

  .injury-name {
    font-size: 18px;
    font-weight: 600;
    color: var(--ink);
  }

  .desc {
    margin: 0;
    font-size: 13px;
    color: var(--ink-mid);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .option-card {
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .option-card:hover {
    border-color: var(--ink-mute);
    background: var(--panel-sunk);
  }

  /* ⚠ `width: 100%`가 있어야 한다. `.option-card`가 `<button>`이라 브라우저
     기본값이 flex 자식을 늘리지 않고 **내용 폭으로 줄인다** — 그러면
     `space-between`이 나눌 여백이 없어서 라벨과 비용이 붙는다.
     화면엔 "보존 치료 (물리치료)주당 30만원"으로 떴다 (2026-08-08 UI 순회). */
  .opt-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }
  .opt-label {
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
  }
  .opt-cost {
    font-size: 13px;
    color: var(--ink);
  }
  .opt-duration {
    font-size: 12px;
    color: var(--ink-mid);
  }
  .opt-note {
    font-size: 12px;
    color: var(--ink-mid);
    line-height: 1.5;
  }
</style>
