extends RefCounted
class_name TeamProfile

## 구단 성향 — 팀이 개성을 갖는 유일한 경로. M9-10.
##
## 원본: `team_engine.rs`의 `calc_win_now_pressure_update` ·
##       `usecases/seasonRollover.ts`의 `updateProTeamProfiles`
##
## ⚠ **02는 이걸 구현해 놓고 아무도 안 불렀다.** `initProTeamProfiles`도
## `patchProTeamProfile`도 호출부가 없었고 `refs.json`에도 값이 없어서
## **전 팀이 기본값(전 항목 50)** 이었다.
##
## 그 결과가 **트레이드 소멸**이다. buyer 조건이
## `순위 상위 30% 안 · 성적압박 > 60`인데 모두가 정확히 50이라 **buyer가
## 구조적으로 0팀**이었다 — seller만 남으면 거래 상대가 없다.
## 실측 트레이드 수: 9 → 8 → 2 → 1 → 1 → 0.
##
## 같은 프로필을 승강 임계값·방출·FA 입찰도 읽으므로, 눌려 있는 동안
## 그쪽 판단도 전부 중립이었다.


## 성향 열두 가지. **기본은 전부 50(중립)** — 0으로 두면 판정이 한쪽으로 쏠린다.
##
## ⚠ **읽기만 한다.** 고칠 때는 `of()`가 복사본을 준다
const DEFAULT: Dictionary = {
	"owner_spending_willingness": 50.0, "stability": 50.0,
	"development_focus": 50.0, "discipline": 50.0,
	"owner_patience": 50.0, "win_now_pressure": 50.0,
	"scouting_quality": 50.0, "prestige": 50.0,
	"market_appeal": 50.0, "clubhouse_culture": 50.0,
	"medical_quality": 50.0, "farm_investment": 50.0,
}

## 프로필이 붙는 리그. **프로만이다** — 학교·독립은 구단이 없다
const PRO_LEAGUES: Array[String] = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]

## 세계 상태에서 프로필이 사는 자리
const KEY: String = "team_profiles"


## 그 팀의 성향. 없으면 중립 한 벌을 **새로 만들어** 준다
static func of(world: Dictionary, team_id: String) -> Dictionary:
	var all: Dictionary = world.get(KEY, {})
	if all.has(team_id):
		return all[team_id]
	return DEFAULT.duplicate()


## 성향 하나를 제자리에서 고친다
static func patch(world: Dictionary, team_id: String, values: Dictionary) -> void:
	if not world.has(KEY):
		world[KEY] = {}
	var cur: Dictionary = of(world, team_id)
	cur.merge(values, true)
	world[KEY][team_id] = cur


# ── 성적 압박 ─────────────────────────────────────────────────

## 우승하면 크게 내려간다 — 한 해 쉬어 갈 수 있다
const CHAMPION_DELTA: float = -20.0
## 2위 안이면 조금 내려간다
const CONTENDER_RANK: int = 2
const CONTENDER_DELTA: float = -5.0
## 중위권은 조금 오른다
const MIDDLE_DELTA: float = 2.0
## 하위권은 많이 오른다. **두 시즌이면 buyer 문턱(60)을 넘는다**
const BOTTOM_DELTA: float = 8.0
## 연속 실패마다 더
const MISSED_STEP: float = 5.0
## 구단주가 참을성 있으면 압박이 덜 오른다 (0~100 → 1.0~0.5배)
const PATIENCE_SPAN: float = 0.5


## 한 시즌 뒤의 성적 압박. `{pressure, delta}`
##
## ⚠ **참을성은 오르는 쪽에만 걸린다.** 내려가는 쪽(우승·상위권)에도 걸면
## 참을성 있는 구단이 우승해도 압박이 안 풀린다
static func win_now_update(current: float, owner_patience: float,
		final_standing: int, total_teams: int,
		consecutive_missed: int = 0, won_championship: bool = false) -> Dictionary:
	var patience_mult: float = 1.0 - (owner_patience / 100.0) * PATIENCE_SPAN
	var delta: float
	if won_championship:
		delta = CHAMPION_DELTA
	elif final_standing <= CONTENDER_RANK:
		delta = CONTENDER_DELTA
	elif final_standing <= total_teams / 2:
		delta = MIDDLE_DELTA * patience_mult
	else:
		delta = BOTTOM_DELTA * patience_mult + float(consecutive_missed) * MISSED_STEP
	return {"pressure": clampf(current + delta, 0.0, 100.0), "delta": delta}


# ── 스카우팅 ──────────────────────────────────────────────────

const SCOUT_BASE: float = 1.0
const SCOUT_BUDGET_WEIGHT: float = 4.0
const SCOUT_PLAYOFF_STEP: float = 0.5
const SCOUT_PLAYOFF_CAP: float = 2.5
const SCOUT_HIRE_DIVISOR: float = 10.0


## 한 시즌 뒤의 스카우팅 수준. `{quality, delta}`
##
## ⚠ **하한이 없다.** 02가 그렇다 — 매년 최소 1.0씩 오르므로 언젠가 100에
## 붙는다. 예산·성적이 속도만 바꾼다
static func scouting_update(current: float, budget_ratio: float,
		consecutive_playoffs: int = 0, hired_quality: float = 0.0) -> Dictionary:
	var delta: float = SCOUT_BASE + budget_ratio * SCOUT_BUDGET_WEIGHT \
		+ minf(float(consecutive_playoffs) * SCOUT_PLAYOFF_STEP, SCOUT_PLAYOFF_CAP) \
		+ hired_quality / SCOUT_HIRE_DIVISOR
	return {"quality": minf(current + delta, 100.0), "delta": delta}


# ── FA 자격 ───────────────────────────────────────────────────

## 리그별 FA 자격 연수. **정본이 여기 하나다** — 02는 표가 두 곳이라
## 규칙 파일과 어긋나는 결함이 열 번 나왔다
const FA_YEARS: Dictionary = {
	"LEAGUE_KBL": 5, "LEAGUE_ABL": 6, "LEAGUE_JBL": 4,
}
const FA_YEARS_DEFAULT: int = 9


static func fa_eligibility_years(league_id: String) -> int:
	return int(FA_YEARS.get(league_id, FA_YEARS_DEFAULT))


# ── 시즌 끝 갱신 ──────────────────────────────────────────────

## 프로 리그 순위로 성향을 갱신한다. 고친 팀 수를 돌려준다.
##
## ⚠ **여기가 팀이 갈라지는 유일한 자리다.** 안 부르면 전 팀이 영원히 50이고,
## 트레이드·승강·방출·FA 입찰이 **전부 중립 판단**이 된다
static func update_all(state: Dictionary) -> int:
	var world: Dictionary = state.get("world", {})
	if world.is_empty():
		return 0

	var schedule: Array = state.get("schedule", [])
	var n: int = 0
	for lid in PRO_LEAGUES:
		var rows: Array = Standings.from_schedule(schedule, lid)
		if rows.is_empty():
			continue
		for row in rows:
			var tid: String = String(row["team_id"])
			var cur: Dictionary = of(world, tid)
			var r: Dictionary = win_now_update(
				float(cur["win_now_pressure"]), float(cur["owner_patience"]),
				int(row["rank"]), rows.size(),
				# 연속 포스트시즌 실패는 아직 집계하지 않는다 — 순위만으로도
				# 하위권은 +8/시즌이라 두 시즌이면 buyer 문턱(60)을 넘는다
				0, int(row["rank"]) == 1)
			var s: Dictionary = scouting_update(float(cur["scouting_quality"]),
				float(cur["owner_spending_willingness"]) / 100.0)
			patch(world, tid, {
				"win_now_pressure": r["pressure"],
				"scouting_quality": s["quality"],
			})
			n += 1
	return n


# ── 읽는 쪽이 쓰는 판정 ───────────────────────────────────────

## 상위 몇 %까지를 우승 후보로 보나
const BUYER_RANK_PCT: float = 0.30
const BUYER_PRESSURE: float = 60.0


## 지금 전력을 보강할 팀인가. **트레이드가 이 판정 위에 선다** —
## 전부 중립이면 buyer가 0팀이 되고 거래 상대가 사라진다
static func is_buyer(world: Dictionary, team_id: String, rank: int,
		total_teams: int) -> bool:
	# 팀 0을 따로 막지 않는다 — 실수 나눗셈이 INF를 주고 아래 비교가 거짓이다.
	# 가드를 두면 죽은 코드가 된다(`is_seller`는 반대라 거기엔 필요하다)
	var pct: float = float(rank) / float(total_teams)
	return pct <= BUYER_RANK_PCT \
		and float(of(world, team_id)["win_now_pressure"]) > BUYER_PRESSURE


## 미래를 사는 팀인가 — 하위권이고 압박이 낮다
static func is_seller(world: Dictionary, team_id: String, rank: int,
		total_teams: int) -> bool:
	if total_teams <= 0:
		return false
	return float(rank) / float(total_teams) > 1.0 - BUYER_RANK_PCT \
		and not is_buyer(world, team_id, rank, total_teams)
