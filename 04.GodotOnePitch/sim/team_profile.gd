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


# ── 초기화 (F-3) ──────────────────────────────────────────────
#
# ⚠ **04도 02와 같은 자리에서 눌려 있었다.** `update_all`이 열둘 중 둘만
# 갱신하고 나머지 열은 채우는 곳이 없어서 **아홉 축이 영원히 50**이었다.
# 위 주석이 적어 둔 "전 팀이 기본값" 상태가 04에서도 이어지고 있었다.
#
# ⚠ **02의 팀과 04의 팀이 같지 않다.** 실측:
#
#   ABL 16 — 02와 id가 전부 같다          → 02 값을 그대로 (`data/team_profiles.json`)
#   KBL 10 — 대응 0. `power`·`resource`가 있다 → `derive()`
#   JBL 12 — 대응 0. 축이 하나도 없고 02엔 리그 자체가 없다 → `spread_of()`

const DATA_PATH: String = "res://data/team_profiles.json"

## 프로 1군 id는 전부 이걸로 끝난다 — 2군은 같은 자리에 `_2`가 온다
const FIRST_SUFFIX: String = "_1"

static var _data: Dictionary = {}


## 02에서 그대로 온 성향표. **ABL 16팀뿐이다** — 나머지는 파생한다
static func data() -> Dictionary:
	if _data.is_empty():
		var f := FileAccess.open(DATA_PATH, FileAccess.READ)
		if f == null:
			push_error("team_profiles.json을 못 읽었다")
			return {}
		_data = JSON.parse_string(f.get_as_text()).get("profiles", {})
	return _data


## 파생 규칙 — **02 ABL 16팀에서 잰 것이다.** 지어낸 값이 아니다.
##
## prestige 하나가 일곱 축을 거의 결정한다(|r| 0.96~0.99). 아래 기울기는
## 그 회귀에서 나온 값이고, 중심은 02 ABL 평균이다.
const P_MEAN: float = 57.2
const SLOPE_DEVELOPMENT: float = -0.779
const SLOPE_PATIENCE: float = -0.595
const SLOPE_WIN_NOW: float = 0.827
const SLOPE_SCOUTING: float = 0.769
const SLOPE_MARKET: float = 0.905
const SLOPE_MEDICAL: float = 0.810

const MEAN_DEVELOPMENT: float = 53.3
const MEAN_PATIENCE: float = 56.7
const MEAN_WIN_NOW: float = 47.8
const MEAN_SCOUTING: float = 61.4
const MEAN_MARKET: float = 57.8
const MEAN_MEDICAL: float = 60.7

## ⚠ **넷은 팀 세기와 무관하다.** 02 24팀에서 표준편차가 3~5이고 prestige
## 상관이 0.10~0.76이다 — 세기를 따라 흔들면 **없는 구조를 만드는 것**이다.
## 값은 02 24팀 평균
const FLAT: Dictionary = {
	"stability": 62.2, "discipline": 60.4,
	"clubhouse_culture": 61.1, "farm_investment": 55.3,
}

## 지갑은 `resource`가 정한다 — 02 `budgetTier`가 그 축의 원천이다
## (small 36.5 · mid 56.4 · large 79.5). 04 표기는 넷이라 궁핍을 더 낮게 둔다
const SPENDING_BY_RESOURCE: Dictionary = {
	"궁핍": 30.0, "알뜰": 36.5, "안정": 56.4, "부유": 79.5,
}
const SPENDING_DEFAULT: float = 56.4

## 전력★(1~5)을 위상으로. **02 프로 리그의 prestige 범위 36~88 그대로다**
const POWER_MIN: int = 1
const POWER_MAX: int = 5
const PRESTIGE_MIN: float = 36.0
const PRESTIGE_MAX: float = 88.0


static func prestige_of_power(power: int) -> float:
	var t: float = float(clampi(power, POWER_MIN, POWER_MAX) - POWER_MIN) \
		/ float(POWER_MAX - POWER_MIN)
	return PRESTIGE_MIN + t * (PRESTIGE_MAX - PRESTIGE_MIN)


## 전력★과 재정 등급에서 열두 축을 낸다.
##
## ⚠ **축마다 제일 가까운 원천을 쓴다.** 지갑은 `resource`, 나머지는
## 위상(`power`)에서. 하나로 몰면 재정 등급이 아무 뜻이 없어진다
static func derive(power: int, resource: String) -> Dictionary:
	var prestige: float = prestige_of_power(power)
	var d: float = prestige - P_MEAN
	var out: Dictionary = {
		"prestige": prestige,
		"owner_spending_willingness": float(
			SPENDING_BY_RESOURCE.get(resource, SPENDING_DEFAULT)),
		"development_focus": MEAN_DEVELOPMENT + SLOPE_DEVELOPMENT * d,
		"owner_patience": MEAN_PATIENCE + SLOPE_PATIENCE * d,
		"win_now_pressure": MEAN_WIN_NOW + SLOPE_WIN_NOW * d,
		"scouting_quality": MEAN_SCOUTING + SLOPE_SCOUTING * d,
		"market_appeal": MEAN_MARKET + SLOPE_MARKET * d,
		"medical_quality": MEAN_MEDICAL + SLOPE_MEDICAL * d,
	}
	out.merge(FLAT, true)
	# ⚠ **여기서 가두지 않는다.** `prestige_of_power`가 이미 36~88로 가두고
	# 기울기가 1보다 작아서 **어떤 입력으로도 1~99를 안 벗어난다** — 변이로
	# 확인했다(clamp를 지워도 검사가 전부 통과했다). 죽은 가드를 두면
	# 산식이 틀려도 clamp가 덮어서 검사가 못 잡는다.
	# 범위는 `test_every_derived_axis_stays_in_range`가 지킨다
	return out


## 축이 하나도 없는 리그(JBL)를 시드로 흩는다.
##
## ⚠ **전부 중립으로 두면 12팀이 구분이 안 된다** — FA·승강·방출이
## 똑같이 움직인다. 02엔 JBL 리그 자체가 없어 가져올 값이 없으므로
## **02가 만든 위상 분포(36~88)를 흩는 것**으로 대신한다. 값을 정하는 게
## 아니라 분포를 쓰는 것이다.
##
## ⚠ **`randf()`를 쓰지 않는다.** 새 게임마다 다른 리그가 되면 회귀를
## 못 잡는다 — 시드와 팀 id로 정해진다
static func spread_of(world_seed: int, team_id: String) -> Dictionary:
	var r: float = Rng.new(world_seed).value_for(["team_profile", team_id])
	var power: int = POWER_MIN + int(r * float(POWER_MAX - POWER_MIN + 1))
	power = clampi(power, POWER_MIN, POWER_MAX)
	# 재정도 같이 흩는다 — 위상만 갈리면 지갑이 전부 같아진다
	var r2: float = Rng.new(world_seed).value_for(["team_resource", team_id])
	var grades: Array = ["알뜰", "안정", "안정", "부유"]
	return derive(power, String(grades[clampi(int(r2 * 4.0), 0, 3)]))


## 프로 팀 전부에 성향을 세운다. **세계를 만들 때 한 번 부른다.**
##
## ⚠ **여기를 안 부르면 아홉 축이 영원히 50이다.** `update_all`은 이미
## 있는 값을 갱신할 뿐 만들지 않는다 — 만드는 쪽이 없으면 갱신할 것도 없다
static func init_all(world: Dictionary, world_seed: int) -> int:
	var table: Dictionary = data()
	var n: int = 0
	for lid in PRO_LEAGUES:
		for t in World.teams_of(lid):
			var id: String = String(t["id"])
			var p: Dictionary
			if table.has(id):
				p = (table[id] as Dictionary).duplicate()
				p.erase("resource")
			elif t.has("power"):
				p = derive(int(t["power"]), String(t.get("resource", "")))
			else:
				p = spread_of(world_seed, id)
			patch(world, id, p)
			# ⚠ **2군도 세운다.** 같은 구단이니 같은 성향이다 — 안 세우면
			# 승강 판정이 1군과 2군에서 다르게 움직인다.
			#
			# ⚠ **2군 id는 `_1`을 `_2`로 바꾼 것이지 `_2`를 덧붙인 게
			# 아니다.** 붙이면 `..._1_2`가 되어 실재하지 않는 팀에 성향을
			# 세우고 진짜 2군은 중립으로 남는다 — 처음에 그렇게 짰다
			patch(world, id.trim_suffix(FIRST_SUFFIX) + World.FARM_SUFFIX,
				p.duplicate())
			n += 1
	return n


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
