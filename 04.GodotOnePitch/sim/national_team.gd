extends RefCounted
class_name NationalTeam

## 국가대표 · 국제대회. B-8.
##
## 원본: `usecases/nationalTeam.ts` · `national_team.rs` ·
##       `generation_rules.json`의 `internationalRules`
##
## ⚠ **경기는 시뮬하지 않는다** (사용자 확정). 대표팀 전력으로 순위를 확률
## 산출하고 그 순위가 병역 면제를 정한다 — 외국 대표팀 로스터를 만들지
## 않아도 되고, 사용자가 보는 건 발탁·결과·면제다.
##
## ⚠ **대회는 4년 주기이고 `year_mod`가 서로 달라 한 해에 둘이 안 겹친다.**
## 겹치게 짜면 규칙이 잘못된 것이고, 검사가 그걸 막는다.


const RULES_PATH: String = "res://data/international_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("국제대회 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


## 대표를 뽑는 리그 — 국내 프로 1·2군
const POOL_LEAGUES: Array[String] = ["LEAGUE_KBL", "LEAGUE_KBL_FARM"]

## 투수로 세는 자리
const PITCHER_POSITIONS: Array[String] = ["SP", "RP", "CP", "P"]


## 그 해에 열리는 대회. 없으면 빈 사전
static func tournament_of(year: int) -> Dictionary:
	for t in rules().get("tournaments", []):
		var cycle: int = int(t.get("cycle_years", 0))
		if cycle > 0 and posmod(year, cycle) == int(t.get("year_mod", -1)):
			return t
	return {}


# ── 성적 점수 ─────────────────────────────────────────────────

## 올 시즌 성적 점수(−1 ~ +1). **승강 판정과 같은 축이다** — 따로 만들면
## "대표는 뽑혔는데 2군으로 내려간" 모순이 생긴다.
##
## ⚠ **표본이 적으면 깎는다.** 두 경기 던지고 방어율 0.00인 사람이
## 대표팀 1순위가 되면 안 된다
static func form_of(stat) -> float:
	if not (stat is Dictionary) or stat.is_empty():
		return 0.0
	# 표본이 0이면 비중도 0이라 결과가 저절로 0이다 — 따로 막는 줄을 두면
	# 절대 안 걸리는 죽은 가드가 된다
	var r: Dictionary = rules().get("form_sample", {})
	if String(stat.get("type", "")) == "pitcher":
		var base: float = float(r.get("pitcher_era_base", 4.5))
		return clampf((base - float(stat.get("era", base))) / base
			* minf(1.0, float(stat.get("ip", 0.0))
				/ float(r.get("pitcher_ip", 40.0))), -1.0, 1.0)

	var pa: float = float(stat.get("pa", 0.0))
	var ops_base: float = float(r.get("batter_ops_base", 0.7))
	return clampf((float(stat.get("ops", ops_base)) - ops_base) / ops_base
		* minf(1.0, pa / float(r.get("batter_pa", 120.0))), -1.0, 1.0)


## 능력치 + 성적
static func rating(c: Dictionary) -> float:
	return float(c.get("ovr", 0.0)) \
		+ float(c.get("form", 0.0)) * float(rules().get("form_weight", 8.0))


static func is_pitcher(position: String) -> bool:
	return PITCHER_POSITIONS.has(position)


# ── 발탁 ──────────────────────────────────────────────────────

## 대표팀을 뽑는다. `{tournament, squad, protagonist_selected, squad_strength}`
##
## 후보는 `{id, name, team_id, position, ovr, age, form, is_protagonist}`.
##
## ⚠ **발탁에 난수가 없다.** 정렬이 결정적이라 같은 세계·같은 해면 같은
## 대표팀이 나온다
static func select_squad(candidates: Array, year: int) -> Dictionary:
	var t: Dictionary = tournament_of(year)
	if t.is_empty():
		return {"tournament": {}, "squad": [], "protagonist_selected": false,
			"squad_strength": 0.0}

	var r: Dictionary = rules()
	var age_max: int = int(r.get("age_max", 29))
	var max_per_team: int = int(r.get("max_per_team", 4))
	var size: int = int(t.get("roster_size", 24))

	var pool: Array = []
	for c in candidates:
		if int(c.get("age", 0)) <= age_max:
			pool.append(c)
	# ⚠ **같은 점수면 id로 가른다.** 안 그러면 사전 순회 순서가 대표팀을
	# 정해서 같은 세계를 다시 열 때 명단이 흔들린다
	pool.sort_custom(func(a, b) -> bool:
		var ra: float = rating(a)
		var rb: float = rating(b)
		if ra == rb:
			return String(a.get("id", "")) < String(b.get("id", ""))
		return ra > rb)

	# 투수 절반 — 한쪽으로 쏠리면 대표팀이 성립하지 않는다
	var want_pitchers: int = size / 2
	var per_team: Dictionary = {}
	var squad: Array = []
	var pitchers: int = 0

	for c in pool:
		if squad.size() >= size:
			break
		var team: String = String(c.get("team_id", ""))
		# 한 구단이 독식하면 그 팀 리그 일정이 통째로 기운다
		if int(per_team.get(team, 0)) >= max_per_team:
			continue
		var mine: bool = is_pitcher(String(c.get("position", "")))
		if mine:
			if pitchers >= want_pitchers:
				continue
		elif squad.size() - pitchers >= size - want_pitchers:
			continue
		if mine:
			pitchers += 1
		per_team[team] = int(per_team.get(team, 0)) + 1
		squad.append(c)

	# 포지션 균형 때문에 자리가 남으면 순위대로 채운다
	if squad.size() < size:
		var taken: Dictionary = {}
		for c in squad:
			taken[String(c.get("id", ""))] = true
		for c in pool:
			if squad.size() >= size:
				break
			if taken.has(String(c.get("id", ""))):
				continue
			squad.append(c)

	var total: float = 0.0
	var ids: Array = []
	var mine_in: bool = false
	for c in squad:
		total += rating(c)
		ids.append(String(c.get("id", "")))
		if bool(c.get("is_protagonist", false)):
			mine_in = true

	return {
		"tournament": t, "squad": ids, "protagonist_selected": mine_in,
		"squad_strength": 0.0 if squad.is_empty() else total / float(squad.size()),
	}


# ── 대회 결과 ─────────────────────────────────────────────────

## 대표팀 전력을 참가국 평균과 견줘 순위를 뽑는다.
##
## 국제 무대의 기준선은 국내 리그보다 높다 — OVR 75가 세계 평균쯤이라고 보고,
## 거기서 얼마나 떨어졌는지로 기대 순위를 정한 뒤 난수로 흔든다.
## **경기를 시뮬하지 않으므로 이 한 줄이 대회 전부다.**
static func simulate(tournament: Dictionary, squad_strength: float,
		rng: RandomNumberGenerator) -> Dictionary:
	var r: Dictionary = rules().get("result", {})
	var field: int = maxi(int(tournament.get("field_size", 1)), 1)

	var clamp_to: float = float(r.get("edge_clamp", 1.5))
	var edge: float = clampf(
		(squad_strength - float(r.get("world_baseline", 75.0)))
			/ float(r.get("spread", 12.0)), -clamp_to, clamp_to)
	var percentile: float = clampf(0.5 - edge * float(r.get("percentile_slope", 0.28)),
		float(r.get("percentile_min", 0.02)), float(r.get("percentile_max", 0.98)))

	# 기대 순위 주변으로 흔든다 — **강팀도 지고 약팀도 이변을 낸다**
	var noise: float = (rng.randf() - 0.5) * float(r.get("noise", 0.45))
	var pos: float = clampf(percentile + noise, 0.0, 1.0)
	var rank: int = int(clampf(roundf(1.0 + pos * float(field - 1)), 1.0, float(field)))

	var exemption_rank: int = int(tournament.get("exemption_rank", 0))
	return {
		"rank": rank, "field_size": field,
		"exemption": exemption_rank > 0 and rank <= exemption_rank,
		"medal": medal_of(rank),
	}


static func medal_of(rank: int) -> String:
	match rank:
		1: return "금"
		2: return "은"
		3: return "동"
	return ""
