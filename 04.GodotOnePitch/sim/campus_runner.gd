extends RefCounted
class_name CampusRunner

## 카퍼스 이벤트 배선 — 대학 리그의 쇼케이스(32주)·올스타(34주). B-1.
##
## `CampusEvents`는 규칙만 안다. 여기가 **세계에서 후보를 모아 결과를
## 선수에게 돌려주는** 자리다.
##
## ⚠ **결과가 선수에게 닿아야 한다.** 02는 이벤트를 돌려 로그만 남기고
## 주목도·인지도를 아무 데도 안 썼다 — 화면에 "쇼케이스에서 눈에 띄었다"가
## 뜨는데 **드래프트 순위는 1도 안 움직였다.**


const UNIV_LEAGUE: String = "LEAGUE_UNIVERSITY"

## ⚠ **`Draft.score`가 없을 때 30으로 본다.** 여기서 0에서 쌓기 시작하면
## 쇼케이스에 나간 사람이 오히려 **안 나간 사람보다 낮아진다** — 무대에 선
## 대가가 감점이 된다
const BASE_SCOUT_SCORE: float = 30.0


## 대학 선수 하나를 후보 사전으로. **원본 사전은 따로 들고 있다** —
## 결과를 되돌려 써야 하기 때문이다
static func _candidate(p: Dictionary) -> Dictionary:
	var city: String = String(World.team_field({}, String(p.get("team_id", "")),
		"city", ""))
	return {
		"id": String(p.get("id", "")),
		"name": String(p.get("name", "")),
		"team_id": String(p.get("team_id", "")),
		"position": String(p.get("position", "")),
		"region": CampusEvents.region_of(city),
		"ovr": Contract.core_ovr(p),
		"form": float(p.get("form", 0.0)),
		"scout_score": float(p.get("scout_score", BASE_SCOUT_SCORE)),
		"popularity": float(p.get("popularity", 0.0)),
		"is_protagonist": bool(p.get("is_protagonist", false)),
	}


## 이번 주에 무대에 설 사람들. **소속이 대학인 사람만** — 졸업해서 풀에
## 있는 사람은 이미 학교를 떠났다
## ⚠ **로스터만 본다.** `draft_pool`은 졸업해서 학교를 떠난 사람들이다 —
## 넣으면 이미 나간 사람이 대학 올스타에 뽑힌다
static func candidates_of(state: Dictionary) -> Array:
	var rosters: Dictionary = state.get("world", {}).get("rosters", {})
	var out: Array = []
	for tid in rosters:
		for p in rosters[tid]:
			if String(p.get("league_id", "")) != UNIV_LEAGUE:
				continue
			if String(p.get("career_status", "active")) != "active":
				continue
			out.append(p)
	return out


static func _by_id(players: Array) -> Dictionary:
	var out: Dictionary = {}
	for p in players:
		out[String(p.get("id", ""))] = p
	return out


static func _add(p: Dictionary, key: String, amount: float,
		base: float = 0.0) -> void:
	p[key] = float(p.get(key, base)) + amount


## 그 주의 카퍼스 이벤트. 아무 일도 없으면 `{}`
##
## ⚠ **주차는 `Calendar`가 센다.** 부르는 쪽이 자기 손으로 세면 그게
## 두 번째 정본이 된다
static func run(state: Dictionary, at_day: int = -1) -> Dictionary:
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	var week: int = Calendar.week_of(day)
	var showcase_week: int = int(CampusEvents.showcase_rules().get("week", 32))
	var allstar_week: int = int(CampusEvents.allstar_rules().get("week", 34))
	if week != showcase_week and week != allstar_week:
		return {}

	var players: Array = candidates_of(state)
	if players.is_empty():
		return {}

	var by_id: Dictionary = _by_id(players)
	var pool: Array = []
	for p in players:
		pool.append(_candidate(p))

	# 씨앗은 해와 주차로 — 같은 세이브를 다시 열어도 같은 무대가 선다.
	#
	# ⚠ **주차를 빼도 검사로는 안 보인다.** 한 해에 무대가 둘뿐이고 둘이
	# 난수를 쓰는 방식이 달라서 밖에서 구별할 길이 없다 — 그래도 넣는다.
	# 셋째 무대가 붙는 순간 둘이 같은 흐름을 쓰게 되기 때문이다
	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["campus", int(state.get("season_year", 0)), week])

	if week == showcase_week:
		return _run_showcase(state, pool, by_id, rng, day)
	return _run_allstar(state, pool, by_id, rng, day)


static func _run_showcase(state: Dictionary, pool: Array, by_id: Dictionary,
		rng: RandomNumberGenerator, day: int) -> Dictionary:
	var out: Dictionary = CampusEvents.showcase(pool, rng)
	for e in out["entries"]:
		var p: Dictionary = by_id.get(String(e["id"]), {})
		if p.is_empty():
			continue
		# **주목도가 드래프트 산식에 그대로 들어간다**(`Draft.score`)
		_add(p, "scout_score", float(e["scout_gain"]), BASE_SCOUT_SCORE)
		_add(p, "fame", float(e["fame_gain"]))

	_log(state, {"day": day, "kind": "showcase", "total": int(out["total"]),
		"invited": bool(out["protagonist_invited"])})
	return out


static func _run_allstar(state: Dictionary, pool: Array, by_id: Dictionary,
		rng: RandomNumberGenerator, day: int) -> Dictionary:
	var r: Dictionary = CampusEvents.allstar_rules()
	var out: Dictionary = CampusEvents.allstar(pool, rng)
	for x in out["north"] + out["south"]:
		var p: Dictionary = by_id.get(String(x["id"]), {})
		if p.is_empty():
			continue
		# ⚠ **뽑히면 인기도가 오른다 — 의도한 양의 되먹임이다.** 다음 해에
		# 더 뽑히기 쉬워진다(선발 점수의 30%가 인기도다)
		_add(p, "fame", float(r.get("select_fame_gain", 6.0)))
		_add(p, "popularity", float(r.get("select_popularity_gain", 8.0)))

	var mvp: Dictionary = by_id.get(String(out["mvp_id"]), {})
	if not mvp.is_empty():
		_add(mvp, "fame", float(r.get("mvp_fame_gain", 12.0)))

	_log(state, {"day": day, "kind": "allstar",
		"north_score": int(out["north_score"]), "south_score": int(out["south_score"]),
		"winner": String(out["winner"]), "mvp_name": String(out["mvp_name"]),
		"selected": bool(out["protagonist_selected"]),
		"side": String(out["protagonist_side"])})
	return out


static func _log(state: Dictionary, entry: Dictionary) -> void:
	var log: Array = state.get("campus_log", [])
	log.append(entry)
	state["campus_log"] = log
