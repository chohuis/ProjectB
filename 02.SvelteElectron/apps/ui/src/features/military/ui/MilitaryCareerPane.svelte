<script lang="ts">
  import type { MilitaryLifeRules, MilitaryLifeState, MilitaryMember, MilitaryUnit } from "../../../shared/types/militaryLife";
  import { relationLabel } from "../../../shared/types/relationship";

  /** 경력 (§32) — perf(tier) · 표창/징계 · 휴가 일수 · 감각 곡선(SVG) · 관계 상위 3 · 전역 환산 표(지금 구간 강조) */
  export let ml: MilitaryLifeState;
  export let rules: MilitaryLifeRules;
  export let unit: MilitaryUnit;
  export let members: MilitaryMember[];

  const W = 300, H = 88, PAD = 6;

  $: role = unit.roles.find((r) => r.id === ml.roleId) ?? null;
  $: cap = 100 - rules.ballSense.capPerAccessGap * (3 - (role?.ballAccess ?? 0));
  $: sense = Math.round(ml.ballSense);
  // 4주 표본 + 지금 값 — 표본이 없어도 점 하나는 있다
  $: samples = [...ml.senseCurve, sense];
  $: pts = samples.map((v, i) => {
    const x = samples.length === 1 ? W : (i / (samples.length - 1)) * W;
    const y = H - PAD - (Math.max(0, Math.min(100, v)) / 100) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  $: capY = H - PAD - (cap / 100) * (H - PAD * 2);
  $: lastPt = pts[pts.length - 1]?.split(",") ?? ["0", "0"];

  $: all = { ...ml.frozen, ...ml.relations };
  $: topRel = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => {
    const m = members.find((x) => x.id === id);
    return { id, name: m?.name || m?.rank || id, value: Math.round(v), frozen: ml.relations[id] === undefined, label: relationLabel(v).label };
  });
  // rules.discharge 를 위에서부터 첫 일치 — dischargeConversion 과 같은 규칙
  $: dischargeIdx = Math.max(0, rules.discharge.findIndex((d) => ml.ballSense >= d.minSense));
  $: perfDesc = [...ml.perf].sort((a, b) => a.week - b.week);
  $: awards = [...ml.awards].sort((a, b) => a.week - b.week);
  $: penalties = [...ml.penalties].sort((a, b) => a.week - b.week);
</script>

<div class="grid">
  <div class="card">
    <h2>성과 이벤트 <span>· "경기" 대체 · 1등급이 최고</span></h2>
    {#if perfDesc.length === 0}
      <p class="empty">아직 없다 — 포사격훈련·통신평가·지휘검열이 여기 쌓인다.</p>
    {:else}
      <dl class="kv">
        {#each perfDesc as x (x.id + x.week)}
          <dt>W{x.week}</dt><dd>{x.note} <small>tier {x.tier}</small></dd>
        {/each}
      </dl>
    {/if}
    <dl class="kv sum">
      <dt>표창 · 징계</dt><dd>{awards.length} · {penalties.length}</dd>
      {#each awards as a (a.id + a.week)}<dt class="sub">W{a.week}</dt><dd class="sub ok">표창 — {a.id}</dd>{/each}
      {#each penalties as a (a.id + a.week)}<dt class="sub">W{a.week}</dt><dd class="sub bad">징계 — {a.id}</dd>{/each}
      <dt>휴가</dt><dd>{ml.leaveDays}일 누계</dd>
    </dl>
  </div>

  <div class="card">
    <h2>야구 감각 곡선 <span>· 4주 표본 · 지금 {sense}</span></h2>
    <svg class="spark" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-label="야구 감각 곡선">
      <line x1="0" y1={capY} x2={W} y2={capY} stroke="var(--line-strong)" stroke-dasharray="3 3" />
      <text x="2" y={Math.max(9, capY - 3)} font-size="9" fill="var(--ink-mute)">{cap} 상한</text>
      {#if pts.length >= 2}
        <polygon points="{pts.join(' ')} {W},{H} 0,{H}" fill="var(--panel-sunk)" />
        <polyline points={pts.join(" ")} fill="none" stroke="var(--t-accent)" stroke-width="2" />
      {/if}
      <circle cx={lastPt[0]} cy={lastPt[1]} r="3.5" fill="var(--t-accent)" />
    </svg>
    <p class="hint">매주 −{rules.ballSense.weeklyDecay} · 공 카드 {rules.ballSense.gainByAccess.join("/")} (접근 0~3) · 휴가 +{rules.ballSense.leaveGain} · 힘든 주 −{rules.ballSense.hardWeekLoss}</p>
  </div>

  <div class="card">
    <h2>전역 환산 미리보기 <span>· 지금 값 기준</span></h2>
    <table class="conv">
      <tbody>
        {#each rules.discharge as d, i (d.minSense)}
          <tr class:on={i === dischargeIdx}>
            <td>감각 ≥ {d.minSense}{i === dischargeIdx ? ` ← ${sense}` : ""}</td>
            <td>
              {d.statDelta === 0 ? "능력치 그대로" : `능력치 ${d.statDelta}`}{#if d.velocityDelta} · 구속 {d.velocityDelta}{/if} · 회복 {d.recoveryWeeks}주
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="hint">전역 때 감각 하나로 능력치를 한 번 환산한다 — 복무 중엔 능력치를 안 건드린다.</p>
  </div>

  <div class="card">
    <h2>관계 상위 <span>· 재회 후보</span></h2>
    {#if topRel.length === 0}
      <p class="empty">아직 없다.</p>
    {:else}
      <dl class="kv">
        {#each topRel as r (r.id)}
          <dt>{r.name}</dt><dd>{r.value > 0 ? "+" : ""}{r.value} {r.label}{r.frozen ? " (전역 · 얼림)" : ""}</dd>
        {/each}
      </dl>
    {/if}
    <p class="hint">전역 때 이 탭이 "군 경력 한 장"으로 접혀 나 › 상태 › 기록에 남는다. 탭은 사라진다.</p>
  </div>
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; min-width: 0; color: var(--ink); }
  h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-mute); font-weight: 700; }
  h2 span { text-transform: none; letter-spacing: 0; font-weight: 500; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 12.5px; font-variant-numeric: tabular-nums; margin: 0; }
  .kv dt { color: var(--ink-mute); }
  .kv dd { margin: 0; font-weight: 700; }
  .kv dd small { color: var(--ink-mute); font-weight: 500; }
  .kv.sum { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .kv .sub { font-weight: 500; font-size: 12px; }
  .kv dd.ok { color: var(--ok); } .kv dd.bad { color: var(--bad); }
  .spark { width: 100%; height: 88px; display: block; }
  .conv { font-size: 12px; border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  .conv td { padding: 3px 6px; border-bottom: 1px solid var(--line); }
  .conv tr.on td { background: var(--panel-sunk); font-weight: 800; color: var(--t-dark); }
  .hint { color: var(--ink-mute); font-size: 11.5px; margin: 6px 0 0; line-height: 1.5; }
  .empty { color: var(--ink-mute); font-size: 12px; margin: 0; }
</style>
