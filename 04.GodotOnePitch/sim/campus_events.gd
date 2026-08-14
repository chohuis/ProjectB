extends RefCounted
class_name CampusEvents

## 카퍼스 이벤트 — 쇼케이스·올스타. B-1.
##
## 원본: `campus_events.rs`의 `run_showcase` · `run_allstar` ·
##       `usecases/campusEvents.ts`
##
## ⚠ **둘의 역할이 다르다.** 쇼케이스는 **주목도 급등 경로**고 올스타는
## **선발 자체가 서사**다. 그래서 선발 규칙이 다르다 — 쇼케이스는 넓게
## (팀 추천 + 주목도 + 구단 지명), 올스타는 좁게 그러나 고르게
## (포지션 쿼터 + 대학당 캡).


const RULES_PATH: String = "res://data/campus_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("카퍼스 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


static func showcase_rules() -> Dictionary:
	return rules().get("showcase", {})


static func allstar_rules() -> Dictionary:
	return rules().get("allstar", {})


## 후보 평가 — 능력에 최근 폼이 얹힌다
const FORM_WEIGHT: float = 8.0


static func rating(c: Dictionary) -> float:
	return float(c.get("ovr", 0.0)) + float(c.get("form", 0.0)) * FORM_WEIGHT


## 도시가 목록에 없으면 북으로 본다 — **수도권·중부가 기본값이다**
static func region_of(city: String) -> String:
	return "south" if rules().get("south_cities", []).has(city) else "north"


# ── 쇼케이스 ──────────────────────────────────────────────────

## Day2 전시경기 — 능력 70% + 운 30%. **운이 없으면 참가가 형식이 된다**
const DAY2_SKILL: float = 0.7
const DAY2_LUCK: float = 0.3


static func _by_rating(list: Array) -> Array:
	var out: Array = list.duplicate()
	out.sort_custom(func(a, b) -> bool:
		var ra: float = rating(a)
		var rb: float = rating(b)
		if ra != rb:
			return ra > rb
		# ⚠ **동점 갈래가 없으면 재현이 무너진다**
		return String(a.get("id", "")) < String(b.get("id", "")))
	return out


## 전국대학선수쇼케이스. `{entries, protagonist_invited, total}`
##
## ⚠ **세 경로로 부른다.** 팀 추천은 약팀에도 자리를 주고, 주목도 상위는
## 이미 뜬 선수를 확인시키고, 구단 지명은 예상 밖의 이름을 만든다.
## 하나로 하면 명문 상위권만 모여 **"이미 아는 이름"만 나온다.**
static func showcase(candidates: Array, rng: RandomNumberGenerator) -> Dictionary:
	var r: Dictionary = showcase_rules()
	var picked: Array = []
	var taken: Dictionary = {}

	# ① 팀 추천 — **팀마다 고정 인원**이라 약팀도 무대에 선다
	var by_team: Dictionary = {}
	for c in candidates:
		var tid: String = String(c.get("team_id", ""))
		if not by_team.has(tid):
			by_team[tid] = []
		by_team[tid].append(c)
	var team_ids: Array = by_team.keys()
	# 결정성 — 사전 순회 순서에 기대지 않는다
	team_ids.sort()
	var per_team: int = maxi(int(r.get("per_team_recommend", 4)), 0)
	for tid in team_ids:
		for c in _by_rating(by_team[tid]).slice(0, per_team):
			var id: String = String(c["id"])
			if not taken.has(id):
				taken[id] = true
				picked.append({"c": c, "route": "recommend"})

	# ② 주목도 상위 — 팀 추천에서 빠진 사람 중
	var rest: Array = []
	for c in candidates:
		if not taken.has(String(c["id"])):
			rest.append(c)
	rest.sort_custom(func(a, b) -> bool:
		var sa: float = float(a.get("scout_score", 0.0))
		var sb: float = float(b.get("scout_score", 0.0))
		if sa != sb:
			return sa > sb
		return String(a.get("id", "")) < String(b.get("id", "")))
	for c in rest.slice(0, maxi(int(r.get("top_scout_extra", 15)), 0)):
		taken[String(c["id"])] = true
		picked.append({"c": c, "route": "top_scout"})

	# ③ 구단 지명 — 남은 후보에서 무작위. **이 경로가 예상 밖의 이름을 만든다**
	var pool: Array = []
	for c in candidates:
		if not taken.has(String(c["id"])):
			pool.append(c)
	pool.sort_custom(func(a, b) -> bool:
		return String(a.get("id", "")) < String(b.get("id", "")))
	for i in maxi(int(r.get("club_picks", 8)), 0):
		if pool.is_empty():
			break
		var idx: int = rng.randi_range(0, pool.size() - 1)
		var c: Dictionary = pool[idx]
		pool.remove_at(idx)
		taken[String(c["id"])] = true
		picked.append({"c": c, "route": "club_pick"})

	# Day2 전시경기
	var entries: Array = []
	for p in picked:
		var c: Dictionary = p["c"]
		var luck: float = rng.randf()
		var day2: float = clampf(rating(c) * DAY2_SKILL + luck * 100.0 * DAY2_LUCK,
			0.0, 100.0)
		entries.append({
			"id": String(c["id"]), "name": String(c.get("name", "")),
			"team_id": String(c.get("team_id", "")),
			"position": String(c.get("position", "")),
			"route": String(p["route"]),
			"day2_score": roundf(day2 * 10.0) / 10.0,
			"standout": false,
			"scout_gain": float(r.get("attend_scout_gain", 4.0)),
			"fame_gain": float(r.get("attend_fame_gain", 2.0)),
		})

	# 상위 몇 %가 눈에 띄었나
	entries.sort_custom(func(a, b) -> bool:
		var da: float = float(a["day2_score"])
		var db: float = float(b["day2_score"])
		if da != db:
			return da > db
		return String(a["id"]) < String(b["id"]))
	var standout_n: int = int(roundf(float(entries.size())
		* float(r.get("standout_percent", 0.12))))
	for i in standout_n:
		entries[i]["standout"] = true
		entries[i]["scout_gain"] = float(entries[i]["scout_gain"]) \
			+ float(r.get("standout_scout_gain", 9.0))

	var invited: bool = false
	for c in candidates:
		if not c.get("is_protagonist", false):
			continue
		for e in entries:
			if String(e["id"]) == String(c["id"]):
				invited = true
	return {"entries": entries, "protagonist_invited": invited,
		"total": entries.size()}


# ── 올스타 ────────────────────────────────────────────────────

## 선발 점수 — **인기도가 실제로 들어간다.**
##
## 올스타는 팬 투표 성격이라 순수 실력순이 아니다. 인기도를 안 보면
## "그냥 OVR 상위 24명"이 되고, 인기도라는 스탯이 여기서도 죽는다
const ALLSTAR_SKILL: float = 0.7
const ALLSTAR_POPULARITY: float = 0.3


static func allstar_score(c: Dictionary) -> float:
	return rating(c) * ALLSTAR_SKILL \
		+ float(c.get("popularity", 0.0)) * ALLSTAR_POPULARITY


## 한 쪽(북/남) 선발. **점수순으로 먼저 채우고 빈 포지션만 교체한다.**
##
## ⚠ **쿼터를 먼저 돌리면 안 된다.** 대학당 캡을 낮은 점수 선수가 먼저
## 먹는다 — 02에서 실제로 그렇게 짰더니 **인기도 99짜리 에이스가 자기 학교
## 쿼터에 밀려 못 들어갔고 포지션 하나는 아예 비었다**(캡에 막힌 뒤 다음
## 후보를 안 봤다)
static func allstar_side(candidates: Array, side: String) -> Array:
	var r: Dictionary = allstar_rules()
	var cap: int = int(r.get("per_school_cap", 2))
	var size: int = int(r.get("squad_size", 24))

	var pool: Array = []
	for c in candidates:
		if String(c.get("region", "")) == side:
			pool.append(c)
	pool.sort_custom(func(a, b) -> bool:
		var sa: float = allstar_score(a)
		var sb: float = allstar_score(b)
		if sa != sb:
			return sa > sb
		return String(a.get("id", "")) < String(b.get("id", "")))

	var out: Array = []
	var per_school: Dictionary = {}

	# ① 점수순 — 팬 투표가 뽑는 그림 그대로다
	for c in pool:
		if out.size() >= size:
			break
		var tid: String = String(c.get("team_id", ""))
		if int(per_school.get(tid, 0)) >= cap:
			continue
		per_school[tid] = int(per_school.get(tid, 0)) + 1
		out.append(_pick(c, side, false))

	# ② 빈 포지션을 메운다. **라인업이 안 짜이면 경기 자체가 성립을 안 한다**
	for pos in r.get("required_positions", []):
		if _has_position(out, String(pos)):
			continue

		# 가장 많이 뽑힌 포지션에서 자리를 하나 뺀다. **뒤에서부터 자르면
		# 바로 그 포지션이 다시 비는 일이 생긴다**
		var fat: String = _fattest_position(out)
		if fat.is_empty():
			continue
		var victim_i: int = _weakest_at(out, fat)
		var victim: Dictionary = out[victim_i]
		out.remove_at(victim_i)
		var vt: String = String(victim["team_id"])
		per_school[vt] = int(per_school.get(vt, 0)) - 1

		# ⚠ **캡에 막히면 다음 후보를 본다.** 최고 후보 하나만 보고 포기하면
		# 그 학교가 이미 둘인 순간 포지션이 통째로 비어버린다 — 02에서
		# 실제로 그렇게 짜서 1B가 빈 라인업이 나왔다
		#
		# 이미 뽑힌 사람인지는 안 본다 — 여기 오는 `pos`는 `out`에 **한 명도
		# 없는** 자리라 그 포지션의 후보는 전부 아직 안 뽑힌 사람이다.
		# 걸러내는 줄을 두면 아무도 안 읽는 죽은 가드가 된다
		var filled: bool = false
		for c in pool:
			if String(c.get("position", "")) != String(pos):
				continue
			var tid2: String = String(c.get("team_id", ""))
			if int(per_school.get(tid2, 0)) >= cap:
				continue
			per_school[tid2] = int(per_school.get(tid2, 0)) + 1
			out.append(_pick(c, side, true))
			filled = true
			break

		if not filled:
			# 그 포지션을 채울 사람이 아무도 없다 — 원상복구.
			# **캡이 라인업보다 우선이다** (한 학교가 채우는 것보다 빈 게 낫다)
			per_school[vt] = int(per_school.get(vt, 0)) + 1
			out.insert(victim_i, victim)

	return out


static func _pick(c: Dictionary, side: String, by_quota: bool) -> Dictionary:
	return {"id": String(c["id"]), "name": String(c.get("name", "")),
		"team_id": String(c.get("team_id", "")),
		"position": String(c.get("position", "")), "side": side,
		"score": roundf(allstar_score(c) * 10.0) / 10.0, "by_quota": by_quota}


static func _has_position(picks: Array, pos: String) -> bool:
	for x in picks:
		if String(x["position"]) == pos:
			return true
	return false


## 제일 두꺼운 포지션. 둘 이상 뽑힌 자리만 본다 — 하나뿐인 자리를 빼면
## 그 자리가 다시 빈다
static func _fattest_position(picks: Array) -> String:
	var count: Dictionary = {}
	for x in picks:
		var p: String = String(x["position"])
		count[p] = int(count.get(p, 0)) + 1
	# `best_n`이 1에서 시작하므로 **2명 이상인 자리만** 뽑힌다
	var best: String = ""
	var best_n: int = 1
	for p in count:
		var n: int = int(count[p])
		# 같은 수면 이름 앞선 쪽 — 어느 쪽이든 되지만 하나로 정해져야 재현이 된다
		if n > best_n or (n == best_n and String(p) < best):
			best = String(p)
			best_n = n
	return best


## 그 자리에서 제일 약한 사람의 자리.
##
## 쿼터로 들어온 사람은 안 걸린다 — 쿼터는 **빈 자리**만 채우므로 그 포지션은
## 늘 1명이고, `_fattest_position`은 2명 이상인 자리만 고른다. 그래서 여기에
## 따로 거르는 가드를 두지 않는다(죽은 가드가 된다)
static func _weakest_at(picks: Array, pos: String) -> int:
	var best: int = -1
	for i in picks.size():
		if String(picks[i]["position"]) != pos:
			continue
		if best < 0 or float(picks[i]["score"]) < float(picks[best]["score"]):
			best = i
	return best


## 9이닝 단판. **전력 차 + 운** — 올스타는 원래 결과가 잘 안 맞는 경기다
const EDGE_DIVISOR: float = 12.0
const SCORE_BASE: float = 4.0
const EDGE_WEIGHT: float = 1.5
const LUCK_RUNS: float = 5.0


static func _strength(picks: Array) -> float:
	if picks.is_empty():
		return 0.0
	var sum: float = 0.0
	for x in picks:
		sum += float(x["score"])
	return sum / float(picks.size())


## 올스타전 한 판. `{north, south, north_score, south_score, winner, mvp_id, ...}`
static func allstar(candidates: Array, rng: RandomNumberGenerator) -> Dictionary:
	var north: Array = allstar_side(candidates, "north")
	var south: Array = allstar_side(candidates, "south")

	var edge: float = clampf((_strength(north) - _strength(south)) / EDGE_DIVISOR,
		-1.0, 1.0)
	var ns: int = int(maxf(roundf(SCORE_BASE + edge * EDGE_WEIGHT
		+ rng.randf() * LUCK_RUNS), 0.0))
	var ss: int = int(maxf(roundf(SCORE_BASE - edge * EDGE_WEIGHT
		+ rng.randf() * LUCK_RUNS), 0.0))

	var winner: String = "draw"
	if ns > ss:
		winner = "north"
	elif ss > ns:
		winner = "south"

	# MVP — 이긴 쪽 최고 점수. 비기면 전체 최고
	var mvp_pool: Array = []
	if winner == "north":
		mvp_pool = north
	elif winner == "south":
		mvp_pool = south
	else:
		mvp_pool = north + south
	var mvp: Dictionary = {}
	for x in mvp_pool:
		if mvp.is_empty() or float(x["score"]) > float(mvp["score"]):
			mvp = x

	var selected: bool = false
	var side: String = ""
	for c in candidates:
		if not c.get("is_protagonist", false):
			continue
		for x in north:
			if String(x["id"]) == String(c["id"]):
				selected = true
				side = "north"
		for x in south:
			if String(x["id"]) == String(c["id"]):
				selected = true
				side = "south"

	return {
		"north": north, "south": south,
		"north_score": ns, "south_score": ss, "winner": winner,
		"mvp_id": String(mvp.get("id", "")), "mvp_name": String(mvp.get("name", "")),
		"protagonist_selected": selected, "protagonist_side": side,
	}
