<script lang="ts">
  import { get } from "svelte/store";
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";
  import type { EntityRow, EntityDetails, NpcLiveStats } from "../../../shared/stores/master";
  import type { BattingAttributes, PitchingAttributes } from "../../../shared/types/save";
  import TeamMark from "../../team/ui/TeamMark.svelte";
  import { derivePreGameWeather, derivePreGamePark } from "../../../shared/utils/matchLineupBuilder";
  import type { PreGameWeather, PreGamePark } from "../../../shared/utils/matchLineupBuilder";

  export let scheduleId: string;
  /**
   * 닫기. **주 진행을 여기서 건드리지 않는다.**
   *
   * ⚠ 예전엔 이 화면이 `PendingAction`이었다 — 경기 전에 **강제로 뜨고**
   * "경기 준비 완료"를 눌러야 넘어갔다. 그래서 매 경기 같은 창을 닫는
   * 일이 됐고, 그 사이 쌓인 소식은 볼 기회가 없었다.
   *
   * 이제는 경기 창(`GameStatusModal`)에서 **열어보는** 창이다. 진행은
   * 경기 창의 자동/직접 플레이 버튼이 맡는다 (사용자 확정 2026-08-07).
   */
  export let onClose: () => void = () => {};

  // ── 상수 ──────────────────────────────────────────────────────
  const PITCHER_POS  = new Set(["SP", "RP", "CP"]);
  const FIELD_ORDER  = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  const POS_KO: Record<string, string> = {
    C: "포", "1B": "1루", "2B": "2루", "3B": "3루",
    SS: "유격", LF: "좌익", CF: "중견", RF: "우익", DH: "지명",
  };
  const WEATHER_LABEL: Record<PreGameWeather, string> = {
    sunny: "맑음 ☀", cloudy: "흐림 ☁", rainy: "비 🌧", windy_in: "맞바람", windy_out: "뒷바람",
  };
  const WEATHER_ADVICE: Record<PreGameWeather, string> = {
    sunny:     "컨디션 최적 — 전 구종 유효",
    cloudy:    "시야 양호 — 전략 제한 없음",
    rainy:     "볼 미끄러움 — 제구 주의 / 변화구 낙차↑",
    windy_in:  "변화구 낙차↑ / 홈런↓ — 싱커·커브 추천",
    windy_out: "홈런↑ / 변화구 불규칙 — 직구 집중 추천",
  };
  const PARK_LABEL: Record<PreGamePark, string> = {
    neutral: "표준 구장", pitcher_park: "투수 친화 구장",
    hitter_park: "타자 친화 구장", dome: "돔구장",
  };
  const PARK_ADVICE: Record<PreGamePark, string> = {
    neutral:      "표준 환경 — 일반 전략",
    pitcher_park: "파크팩터 낮음 — 땅볼 유도 시 실점 부담↓",
    hitter_park:  "파크팩터 높음 — 볼넷 허용 / 홈런 경계",
    dome:         "날씨 무관 — 인조잔디 빠른 타구 주의",
  };

  // ── 데이터 계산 헬퍼 ──────────────────────────────────────────
  function playerOf(e: EntityRow) { return (e.details as EntityDetails)?.player ?? {}; }

  function buildLineup(oppTeamId: string, entities: EntityRow[]): EntityRow[] {
    const inTeam = entities.filter(e =>
      e.teamId === oppTeamId && e.role === "player" &&
      !PITCHER_POS.has(String(playerOf(e).position ?? "")),
    );
    const pool = inTeam.length >= 9
      ? inTeam
      : entities.filter(e => e.role === "player" && !PITCHER_POS.has(String(playerOf(e).position ?? "")));
    const sorted = [...pool].sort(
      (a, b) => (playerOf(b).batting?.ovr ?? 0) - (playerOf(a).batting?.ovr ?? 0),
    );
    const picked: EntityRow[] = [];
    const used = new Set<string>();
    for (const pos of FIELD_ORDER) {
      const f = sorted.find(e => !used.has(e.id) && playerOf(e).position === pos);
      if (f) { used.add(f.id); picked.push(f); }
    }
    for (const e of sorted) {
      if (picked.length >= 9) break;
      if (!used.has(e.id)) { used.add(e.id); picked.push(e); }
    }
    return picked.slice(0, 9);
  }

  function findStarter(oppTeamId: string, entities: EntityRow[]): EntityRow | undefined {
    return entities
      .filter(e => e.teamId === oppTeamId && e.role === "player" &&
        PITCHER_POS.has(String(playerOf(e).position ?? "")))
      .sort((a, b) => {
        const ORDER: Record<string, number> = { SP: 0, RP: 1, CP: 2 };
        const da = ORDER[String(playerOf(a).position ?? "RP")] ?? 1;
        const db = ORDER[String(playerOf(b).position ?? "RP")] ?? 1;
        return da !== db ? da - db : (playerOf(b).pitching?.ovr ?? 0) - (playerOf(a).pitching?.ovr ?? 0);
      })[0];
  }

  function getLiveBat(id: string, entities: EntityRow[], npcLiveStats: NpcLiveStats) {
    // ⚠ **`?? {}` 는 타입을 `{}` 로 넓힌다** — 그러면 아래 여덟 줄의 필드
    //   접근이 전부 "Property does not exist on type '{}'" 가 된다.
    //   변수에 타입을 붙여 둔다. 값은 그대로다(라이브 없으면 base 로 간다)
    const live: Partial<BattingAttributes> = npcLiveStats[id]?.batting ?? {};
    const base = playerOf(entities.find(e => e.id === id) ?? {} as EntityRow).batting ?? {};
    return {
      contact:       Number(live.contact       ?? base.contact       ?? 50),
      power:         Number(live.power         ?? base.power         ?? 50),
      eye:           Number(live.eye           ?? base.eye           ?? 50),
      discipline:    Number(live.discipline    ?? base.discipline    ?? 50),
      platoon:       Number(live.platoon       ?? base.platoon       ?? 50),
      battingClutch: Number(live.battingClutch ?? base.battingClutch ?? 50),
      speed:         Number(live.speed         ?? base.speed         ?? 50),
      ovr:           Number(live.ovr           ?? base.ovr           ?? 50),
    };
  }

  function getLivePit(id: string, entities: EntityRow[], npcLiveStats: NpcLiveStats) {
    const live: Partial<PitchingAttributes> = npcLiveStats[id]?.pitching ?? {};
    const base = playerOf(entities.find(e => e.id === id) ?? {} as EntityRow).pitching ?? {};
    return {
      velocity: Number(live.velocity ?? base.velocity ?? 50),
      movement: Number(live.movement ?? base.movement ?? 50),
      command:  Number(live.command  ?? base.command  ?? 50),
      ovr:      Number(live.ovr      ?? base.ovr      ?? 50),
    };
  }

  function threatLevel(bat: ReturnType<typeof getLiveBat>): 0 | 1 | 2 {
    if (bat.power >= 68 || bat.battingClutch >= 66) return 2;
    if (bat.power >= 62 || bat.eye <= 40 || bat.discipline <= 40 || bat.platoon <= 42) return 1;
    return 0;
  }

  function weakLabel(bat: ReturnType<typeof getLiveBat>): string {
    if (bat.power >= 68)         return "⚠⚠ 최강타자 — 볼넷 허용 검토";
    if (bat.battingClutch >= 66) return "⚠ 클러치 강타자 — 득점권 주의";
    if (bat.power >= 62)         return "⚠ 장타 경계 — 코너 공략";
    if (bat.eye <= 40)           return "⚠ 선구 취약 — 아웃코너 집중";
    if (bat.discipline <= 40)    return "볼 유인에 반응 — 존 밖 공략";
    if (bat.platoon <= 42)       return "반대손 취약 — 변화구 공략";
    if (bat.contact >= 65)       return "컨택형 강타자 — 범타 유도";
    if (bat.speed >= 65)         return "발 빠름 — 도루 견제";
    if (bat.eye <= 48)           return "변화구 헛스윙 유도 가능";
    return "평이 — 스트라이크 중심";
  }

  // ── 브리핑 데이터 계산 ────────────────────────────────────────
  interface BatterRow {
    id: string; name: string; pos: string; hand: "L" | "R";
    ovr: number; threat: 0 | 1 | 2; label: string;
    statG: number; statAvg: string; statHr: number; statOps: string;
  }
  interface StarterData {
    name: string; hand: "L" | "R"; ovr: number;
    velocity: number; movement: number; command: number;
    statG: number; statW: number; statL: number;
    statEra: string; statK: number; statBb: number;
  }

  let oppTeamName = "";
  let oppTeamIdShown = "";
  let isHome      = false;
  let weekNum     = 0;
  let weather: PreGameWeather = "sunny";
  let park: PreGamePark       = "neutral";
  let starter: StarterData | null = null;
  let lineup: BatterRow[]         = [];
  let teamAvgOvr = 0;
  let teamAvgStr = "";
  let teamOpsStr = "";

  $: {
    const s       = $seasonStore;
    const g       = $gameStore;
    const m       = $masterStore;
    const entry   = s.schedule.find(e => e.id === scheduleId)
      ?? Object.values(s.leagueSchedules).flat().find(e => e.id === scheduleId);
    if (!entry) break $;

    isHome      = entry.homeTeamId === g.protagonist.teamId;
    weekNum     = entry.week;
    weather     = derivePreGameWeather(entry.id);
    park        = derivePreGamePark(entry.homeTeamId);

    const oppTeamId = isHome ? entry.awayTeamId : entry.homeTeamId;
    oppTeamName = m.teams.find((t: any) => t.id === oppTeamId)?.name ?? oppTeamId;
    oppTeamIdShown = oppTeamId;

    const leagueId  = g.protagonist.leagueId;
    const statsMap  = s.leagueState[leagueId]?.stats ?? {};
    const liveStats = s.npcLiveStats as NpcLiveStats;
    const entities  = m.entities;

    // 선발 투수
    const sp = findStarter(oppTeamId, entities);
    if (sp) {
      const pit    = getLivePit(sp.id, entities, liveStats);
      const spStat = statsMap[sp.id];
      starter = {
        name:     sp.name,
        hand:     playerOf(sp).handedness === "L" ? "L" : "R",
        ovr:      Math.round(pit.ovr),
        velocity: Math.round(pit.velocity),
        movement: Math.round(pit.movement),
        command:  Math.round(pit.command),
        statG:  spStat?.type === "pitcher" ? spStat.g  : 0,
        statW:  spStat?.type === "pitcher" ? spStat.w  : 0,
        statL:  spStat?.type === "pitcher" ? spStat.l  : 0,
        statEra: spStat?.type === "pitcher" && spStat.g > 0 ? spStat.era.toFixed(2) : "-",
        statK:  spStat?.type === "pitcher" ? spStat.k  : 0,
        statBb: spStat?.type === "pitcher" ? spStat.bb : 0,
      };
    } else {
      starter = null;
    }

    // 타선
    const raw = buildLineup(oppTeamId, entities);
    let sumOvr = 0, sumAvg = 0, sumOps = 0, statCount = 0;
    lineup = raw.map((e, i) => {
      const bat    = getLiveBat(e.id, entities, liveStats);
      const st     = statsMap[e.id];
      const hasHit = st?.type === "batter" && st.g > 0;
      sumOvr += bat.ovr;
      if (hasHit) { sumAvg += st.avg; sumOps += st.ops; statCount++; }
      return {
        id:      e.id,
        name:    e.name,
        pos:     POS_KO[String(playerOf(e).position ?? "")] ?? (String(playerOf(e).position ?? "?")),
        hand:    playerOf(e).handedness === "L" ? "L" : "R",
        ovr:     Math.round(bat.ovr),
        threat:  threatLevel(bat),
        label:   weakLabel(bat),
        statG:   hasHit ? st.g   : 0,
        statAvg: hasHit ? st.avg.toFixed(3).replace(/^0/, "") : "-",
        statHr:  hasHit ? st.hr  : 0,
        statOps: hasHit ? st.ops.toFixed(3).replace(/^0/, "") : "-",
      };
    });
    teamAvgOvr = raw.length > 0 ? Math.round(sumOvr / raw.length) : 0;
    teamAvgStr = statCount > 0 ? (sumAvg / statCount).toFixed(3).replace(/^0/, "") : "-";
    teamOpsStr = statCount > 0 ? (sumOps / statCount).toFixed(3).replace(/^0/, "") : "-";
  }

  function onEsc(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window on:keydown={onEsc} />

<!-- 바깥을 눌러도 닫힌다. 읽기 전용 창이라 실수로 닫혀도 잃을 게 없다 -->
<div class="briefing-overlay" role="presentation" on:click={onClose}></div>
<div class="briefing-wrap" role="dialog" aria-modal="true" aria-label="경기 전 브리핑">
  <div class="briefing-panel">

    <!-- 헤더 -->
    <header class="briefing-header">
      <div class="header-left">
        <span class="week-chip">W{weekNum}</span>
        <span class="location-chip">{isHome ? "홈" : "원정"}</span>
      </div>
      <h2 class="title">경기 전 브리핑</h2>
      <div class="header-right">
        {#if oppTeamIdShown}<TeamMark teamId={oppTeamIdShown} size={18} />{/if}
        <span class="opp-name">vs {oppTeamName}</span>
      </div>
    </header>

    <div class="briefing-body">

      <!-- 날씨 / 구장 -->
      <section class="info-row">
        <div class="info-card weather-card">
          <p class="info-card-label">날씨</p>
          <p class="info-card-value">{WEATHER_LABEL[weather]}</p>
          <p class="info-card-desc">{WEATHER_ADVICE[weather]}</p>
        </div>
        <div class="info-card park-card">
          <p class="info-card-label">구장</p>
          <p class="info-card-value">{PARK_LABEL[park]}</p>
          <p class="info-card-desc">{PARK_ADVICE[park]}</p>
        </div>
      </section>

      <!-- 상대 선발 -->
      {#if starter}
        <section class="starter-section">
          <h3 class="section-title">상대 선발 투수</h3>
          <div class="starter-card">
            <div class="starter-info">
              <span class="starter-name">{starter.name}</span>
              <span class="starter-meta">SP · {starter.hand === "L" ? "좌완" : "우완"}</span>
              <span class="ovr-badge">OVR {starter.ovr}</span>
            </div>
            <div class="starter-stats">
              <div class="stat-item">
                <span class="stat-label">구속</span>
                <span class="stat-val">{starter.velocity}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">무브</span>
                <span class="stat-val">{starter.movement}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">제구</span>
                <span class="stat-val">{starter.command}</span>
              </div>
              <div class="stat-sep"></div>
              {#if starter.statG > 0}
                <div class="stat-item">
                  <span class="stat-label">ERA</span>
                  <span class="stat-val">{starter.statEra}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{starter.statW}W{starter.statL}L</span>
                  <span class="stat-val">{starter.statG}G</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">K</span>
                  <span class="stat-val">{starter.statK}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">BB</span>
                  <span class="stat-val">{starter.statBb}</span>
                </div>
              {:else}
                <span class="no-stat">시즌 데이터 없음</span>
              {/if}
            </div>
          </div>
        </section>
      {/if}

      <!-- 상대 타선 -->
      <section class="lineup-section">
        <h3 class="section-title">
          상대 타선
          <span class="team-summary">팀 OVR {teamAvgOvr}
            {#if teamAvgStr !== "-"} · 타율 {teamAvgStr} · OPS {teamOpsStr}{/if}
          </span>
        </h3>
        <div class="lineup-table-wrap">
          <table class="lineup-table">
            <thead>
              <tr>
                <th class="th-num">번</th>
                <th class="th-name">이름</th>
                <th class="th-pos">포지션</th>
                <th class="th-hand">타석</th>
                <th class="th-ovr">OVR</th>
                <th class="th-stat">성적</th>
                <th class="th-note">주의사항</th>
              </tr>
            </thead>
            <tbody>
              {#each lineup as row, i}
                <tr class="batter-row threat-{row.threat}">
                  <td class="td-num">{i + 1}</td>
                  <td class="td-name">{row.name}</td>
                  <td class="td-pos">{row.pos}</td>
                  <td class="td-hand">{row.hand === "L" ? "좌" : "우"}</td>
                  <td class="td-ovr">
                    <span class="ovr-dot threat-dot-{row.threat}">{row.ovr}</span>
                  </td>
                  <td class="td-stat">
                    {#if row.statG > 0}
                      {row.statAvg} / {row.statHr}HR / {row.statOps}
                    {:else}
                      <span class="no-data">데이터 없음</span>
                    {/if}
                  </td>
                  <td class="td-note threat-note-{row.threat}">{row.label}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

    </div>

    <!-- 하단 버튼 -->
    <!-- ⚠ **여기서 경기로 넘어가지 않는다.** 진행은 경기 창이 맡는다 —
         한 화면이 두 가지("읽기"와 "진행")를 하면 읽으려고 열었다가
         경기가 시작돼 버린다 -->
    <footer class="briefing-footer">
      <button class="confirm-btn" type="button" on:click={onClose}>
        닫기
      </button>
    </footer>

  </div>
</div>

<style>
  /* ⚠ **경기 창 위에 뜬다.** `GameStatusModal`이 이미 모달이므로 그보다
     높아야 한다 — 낮으면 브리핑을 열어도 경기 창에 가려 아무 일도 안
     일어난 것처럼 보인다 */
  .briefing-overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 16, 0.88);
    z-index: 120;
  }
  .briefing-wrap {
    position: fixed;
    inset: 0;
    z-index: 121;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    pointer-events: none;   /* 바깥 클릭은 아래 오버레이가 받는다 */
  }
  .briefing-wrap > :global(*) { pointer-events: auto; }

  .briefing-panel {
    /* ⚠ 뿌리가 글자색을 정한다. 안 정하면 색 규칙이 없는 자식이 전역
       `--ink`(거의 검정)를 물려받아 어두운 바탕에서 사라진다 — 경기 화면에서
       "경기 화면" 제목이 정확히 그렇게 안 보였다 (U7-a) */
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    width: 100%;
    max-width: 860px;
    height: calc(90vh - 32px);
    max-height: calc(90vh - 32px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── 헤더 ── */
  .briefing-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--panel-sunk);
    background: var(--panel);
    flex: 0 0 auto;
  }

  .header-left { display: flex; gap: 6px; }

  .week-chip, .location-chip {
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 8px;
  }

  .week-chip     { background: var(--line); color: var(--ink); border: 1px solid var(--ink-mute); }
  .location-chip { background: var(--panel-sunk); color: var(--ink); border: 1px solid var(--line); }

  .title {
    flex: 1;
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--ink);
    text-align: center;
  }

  .header-right { display: flex; justify-content: flex-end; min-width: 120px; }

  .header-right { display: flex; align-items: center; gap: 7px; }
  .opp-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--warn);
  }

  /* ── 본문 영역 (스크롤 없음) ── */
  .briefing-body {
    flex: 1 1 0;
    overflow: hidden;
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ── 날씨/구장 ── */
  .info-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .info-card {
    border-radius: 8px;
    padding: 7px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .weather-card { background: var(--panel-sunk); border: 1px solid var(--panel-sunk); }
  .park-card    { background: var(--panel-sunk); border: 1px solid var(--panel-sunk); }

  .info-card-label {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink-mid);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .info-card-value {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
  }

  .info-card-desc {
    margin: 0;
    font-size: 11px;
    color: var(--ink);
    line-height: 1.3;
  }

  /* ── 섹션 제목 ── */
  .section-title {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-mid);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .team-summary {
    font-size: 11px;
    font-weight: 400;
    color: var(--ink-mute);
    text-transform: none;
    letter-spacing: 0;
  }

  /* ── 선발 투수 카드 ── */
  .starter-section { display: flex; flex-direction: column; }

  .starter-card {
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 7px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .starter-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .starter-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
  }

  .starter-meta {
    font-size: 11px;
    color: var(--ink-mid);
  }

  .ovr-badge {
    margin-left: auto;
    background: var(--panel-sunk);
    border: 1px solid var(--ink-mute);
    border-radius: 5px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink);
    padding: 2px 6px;
  }

  .starter-stats {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .stat-sep {
    width: 1px;
    height: 16px;
    background: var(--panel-sunk);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .stat-label {
    font-size: 10px;
    color: var(--ink-mute);
    white-space: nowrap;
  }

  .stat-val {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
  }

  .no-stat {
    font-size: 11px;
    color: var(--ink-mute);
    font-style: italic;
  }

  /* ── 타선 테이블 ── */
  .lineup-section { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }

  .lineup-table-wrap {
    border: 1px solid var(--panel-sunk);
    border-radius: 8px;
    overflow: hidden;
    flex: 1 1 0;
  }

  .lineup-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .lineup-table thead tr {
    background: var(--panel);
  }

  .lineup-table th {
    padding: 5px 8px;
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink-mute);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    white-space: nowrap;
    border-bottom: 1px solid var(--panel-sunk);
  }

  .th-num  { width: 24px; text-align: center; }
  .th-hand { width: 32px; text-align: center; }
  .th-ovr  { width: 46px; text-align: center; }

  /* 타자 행 위협 레벨 */
  .batter-row { border-bottom: 1px solid var(--panel-sunk); }
  .batter-row:last-child { border-bottom: none; }
  .batter-row.threat-0 { background: var(--panel-sunk); }
  .batter-row.threat-1 { background: var(--panel); }
  .batter-row.threat-2 { background: rgba(179, 49, 31, 0.09); }

  .batter-row:hover { filter: brightness(1.12); }

  .lineup-table td {
    padding: 5px 8px;
    color: var(--ink);
    vertical-align: middle;
  }

  .td-num  { text-align: center; color: var(--ink-mute); font-size: 11px; }
  .td-name { font-weight: 700; color: var(--ink); }
  .td-hand { text-align: center; font-size: 11px; color: var(--ink-mid); }
  .td-ovr  { text-align: center; }
  .td-stat { font-size: 11px; color: var(--ink); font-feature-settings: "tnum"; }

  .ovr-dot {
    display: inline-block;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 11px;
    font-weight: 700;
  }

  .ovr-dot.threat-dot-0 { background: var(--panel-sunk); color: var(--ink); }
  .ovr-dot.threat-dot-1 { background: rgba(154, 101, 16, 0.12); color: var(--warn); }
  .ovr-dot.threat-dot-2 { background: rgba(179, 49, 31, 0.09); color: var(--bad); }

  .td-note { font-size: 11px; }
  .threat-note-0 { color: var(--ink-mid); }
  .threat-note-1 { color: var(--warn); }
  .threat-note-2 { color: var(--bad); font-weight: 600; }

  /* 🔴 **`--line`을 글자색으로 쓰고 있었다** (2026-08-26).
     그건 구분선 색(#DDE3EE)이라 흰 판 위에서 **대비 1.25:1** — 거의 안 보인다.
     `--ink-mute`(#5A6478)는 6.5:1이라 흐리면서도 읽힌다.
     ⚠ 본문과 같은 `--ink`로 올리지 않는다 — "데이터 없음"은 부차 정보라
       너무 튀면 실제 기록을 가린다. **안 보이는 것과 흐린 것은 다르다.** */
  .no-data { color: var(--ink-mute); font-style: italic; font-size: 10px; }

  /* ── 하단 버튼 ── */
  .briefing-footer {
    flex: 0 0 auto;
    border-top: 1px solid var(--panel-sunk);
    padding: 10px 16px;
    display: flex;
    justify-content: flex-end;
    background: var(--panel);
  }

  .confirm-btn {
    background: var(--line);
    border: 1px solid var(--ink-mute);
    border-radius: 8px;
    color: var(--ink);
    font-size: 14px;
    font-weight: 700;
    padding: 8px 24px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.12s, border-color 0.12s;
  }

  .confirm-btn:hover {
    background: var(--ink-mute);
    border-color: var(--ink-mid);
    color: #fff;
  }
</style>
