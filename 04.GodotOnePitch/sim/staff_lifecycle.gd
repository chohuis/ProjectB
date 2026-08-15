extends RefCounted
class_name StaffLifecycle

## 스태프 생애주기 — 은퇴 · 성장 · 경질 · 충원. B-2c.
##
## 원본: `staff_lifecycle.rs` · `staff_rules.json`의 `lifecycle`
##
## ⚠ **B-2b는 스태프를 세우기만 했다.** 한 번 세운 감독이 늙지도 바뀌지도
## 않으면 인물 화면이 **영원히 같은 배역**을 보여준다 — 15~20시즌짜리
## 게임에서 그건 세계가 멈춘 것이다.
##
## ⚠ **빈 자리는 아래 리그에서 데려온다.** 02가 용병을 무에서 찍어 "어디서
## 왔다"는 기록이 아예 없던 것과 같은 함정이다 — 실재하는 사람을 먼저 본다.


static func rules() -> Dictionary:
	return Staff.rules().get("lifecycle", {})


# ── 은퇴 ──────────────────────────────────────────────────────

## 그 나이에 그만둘 확률(0~1). **표를 위에서부터 처음 걸리는 것으로 읽는다**
static func retire_chance(role: String, age: int) -> float:
	for row in rules().get("retire", {}).get(role, []):
		if age <= int(row["until"]):
			return float(row["chance"]) / 100.0
	return 1.0


# ── 성장 ──────────────────────────────────────────────────────

## 한 해가 지나면 능력치가 움직인다. 움직인 칸 수.
##
## ⚠ **한 해에 두 개만 움직인다.** 전부 움직이면 한 시즌 만에 사람이 바뀐다.
## ⚠ **어느 두 개인지는 씨앗이 정한다** — 매번 앞에서부터면 뒤쪽 능력치가
## 영영 안 자란다
static func grow(person: Dictionary, rng: RandomNumberGenerator) -> int:
	var g: Dictionary = rules().get("growth", {})
	var age: int = int(person.get("age", 50))
	var step: float = 0.0
	if age < int(g.get("peak_age", 50)):
		step = float(g.get("young_gain", 1))
	elif age >= int(g.get("decline_age", 62)):
		step = -float(g.get("decline_loss", 1))
	else:
		step = float(g.get("plateau_gain", 0))
	if step == 0.0:
		return 0

	var names: Array = Staff.stats_names(String(person.get("role", "")))
	if names.is_empty():
		return 0
	var moved: int = 0
	var want: int = mini(int(g.get("stats_per_season", 2)), names.size())
	var pool: Array = names.duplicate()
	for i in range(want):
		var idx: int = int(rng.randf() * float(pool.size())) % pool.size()
		var key: String = String(pool.pop_at(idx))
		person["stats"][key] = clampf(float(person["stats"].get(key, 50.0)) + step,
			float(g.get("floor", 20)), float(g.get("cap", 95)))
		moved += 1
	return moved


# ── 경질 ──────────────────────────────────────────────────────

## 구단주가 몇 시즌을 기다리나. **인내가 없을수록 빨리 자른다**
static func patience_seasons(patience: float) -> int:
	for row in rules().get("firing", {}).get("threshold", []):
		if patience <= float(row["patience_until"]):
			return int(row["seasons"])
	return 3


## 감독을 자를 때인가. `bad_seasons`는 기대에 못 미친 해가 몇 번 이어졌나
static func should_fire(patience: float, bad_seasons: int) -> bool:
	return bad_seasons >= patience_seasons(patience)


# ── 한 해 ─────────────────────────────────────────────────────

## 시즌이 바뀔 때 한 번. `{retired, fired, grown, hired}`
##
## ⚠ **은퇴·경질로 빈 자리를 반드시 채운다.** 안 채우면 감독 없는 팀이
## 생기고, 그 팀 선수의 관계도가 조용히 한 칸 비어 버린다
static func run(state: Dictionary, year: int) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	var out: Dictionary = {"retired": 0, "fired": 0, "grown": 0, "hired": 0}
	if world.is_empty():
		return out

	var seed_value: int = int(state.get("seed", 0))
	var leagues: Array = Staff.rules().get("leagues", [])

	for league_id in leagues:
		for t in World.teams_of(String(league_id)):
			var team_id: String = String(t["id"])
			var staff: Array = Staff.of(world, team_id)
			if staff.is_empty():
				continue

			var rng := RandomNumberGenerator.new()
			# ⚠ **연도를 섞는다.** 씨앗만 쓰면 해마다 같은 사람이 그만둔다
			rng.seed = Rng.mix(["staff_life", team_id, year, seed_value])

			var kept: Array = []
			var manager_left: bool = false
			for p in staff:
				p["age"] = int(p.get("age", 50)) + 1
				var role: String = String(p.get("role", ""))
				if rng.randf() < retire_chance(role, int(p["age"])):
					_leave(p, year, "은퇴")
					out["retired"] += 1
					if role == Staff.ROLE_MANAGER:
						manager_left = true
					continue
				out["grown"] += grow(p, rng)
				kept.append(p)

			# 감독 경질 — **구단주 인내가 기다리는 해를 정한다**
			if not manager_left:
				var fired: Array = _fire_if_due(world, team_id, kept, year, rng)
				out["fired"] += fired.size()
				if not fired.is_empty():
					manager_left = true
					var still: Array = []
					for p in kept:
						if not fired.has(p):
							still.append(p)
					kept = still

			world[Staff.KEY][team_id] = kept
			out["hired"] += _refill(world, team_id, String(league_id),
				float(t.get("power", 2)), year, rng)
	return out


## 그 팀이 기대에 못 미친 해가 이어졌는지 보고 감독(과 코치 일부)을 자른다
static func _fire_if_due(world: Dictionary, team_id: String, staff: Array,
		year: int, rng: RandomNumberGenerator) -> Array:
	var profile: Dictionary = TeamProfile.of(world, team_id)
	var bad: int = int(profile.get("bad_seasons", 0))
	if bad <= 0:
		return []
	if not should_fire(float(profile.get("owner_patience", 50.0)), bad):
		return []

	var out: Array = []
	var coaches: Array = []
	for p in staff:
		if String(p.get("role", "")) == Staff.ROLE_MANAGER:
			out.append(p)
		elif String(p.get("role", "")) == Staff.ROLE_COACH:
			coaches.append(p)
	if out.is_empty():
		return []

	# ⚠ **감독이 잘리면 코치도 일부 같이 나간다.** 사단이 통째로 움직이는
	# 게 실제에 가깝다
	var ratio: float = float(rules().get("firing", {}).get(
		"coach_fallout_ratio", 0.0))
	var n: int = int(roundf(float(coaches.size()) * ratio))
	for i in range(mini(n, coaches.size())):
		out.append(coaches[i])

	for p in out:
		_leave(p, year, "경질")
	# 자른 해는 기대치를 되돌린다 — 안 되돌리면 새 감독이 오자마자 또 잘린다
	TeamProfile.patch(world, team_id, {"bad_seasons": 0})
	return out


## 떠난 사람에게 기록을 남긴다 — **어디서 왜 떠났는지가 인물 화면의 재료다**
static func _leave(p: Dictionary, year: int, reason: String) -> void:
	var events: Array = p.get("career_events", [])
	events.append({"year": year, "type": "staff_leave",
		"from_team_id": String(p.get("team_id", "")),
		"from_league_id": String(p.get("league_id", "")),
		"detail": reason})
	p["career_events"] = events


# ── 충원 ──────────────────────────────────────────────────────

## 빈 자리를 채운다. 채운 사람 수.
##
## ⚠ **아래 리그에서 먼저 데려온다.** 무에서 찍으면 "어디서 왔다"가 없어
## 인물 화면이 신입과 구분을 못 한다 — 02가 용병에서 겪은 그 함정이다
static func _refill(world: Dictionary, team_id: String, league_id: String,
		power: float, year: int, rng: RandomNumberGenerator) -> int:
	var staff: Array = Staff.of(world, team_id)
	var has_manager: bool = false
	var has_owner: bool = false
	for p in staff:
		match String(p.get("role", "")):
			Staff.ROLE_MANAGER: has_manager = true
			Staff.ROLE_OWNER: has_owner = true

	var n: int = 0
	for role in [Staff.ROLE_MANAGER, Staff.ROLE_OWNER]:
		if role == Staff.ROLE_MANAGER and has_manager:
			continue
		if role == Staff.ROLE_OWNER and has_owner:
			continue
		var found: Dictionary = _scout(world, role, league_id, rng)
		if found.is_empty():
			found = _make(team_id, league_id, role, power, year, rng)
		else:
			_move(world, found, team_id, league_id, year)
		staff.append(found)
		n += 1

	world[Staff.KEY][team_id] = staff
	return n


## 아래 리그에서 쓸 만한 사람을 찾는다. 없으면 빈 사전
static func _scout(world: Dictionary, role: String, league_id: String,
		rng: RandomNumberGenerator) -> Dictionary:
	var h: Dictionary = rules().get("hiring", {})
	var order: Array = h.get("league_order", [])
	var here: int = order.find(league_id)
	if here < 0:
		return {}

	var min_avg: float = float(h.get("scout_min_avg", 0))
	var pool: Array = []
	# **아래 리그만 본다** — 위에서 데려오면 강등이지 승진이 아니다
	for i in range(here + 1, order.size()):
		for team_id in Staff.all_of(world):
			for p in Staff.all_of(world)[team_id]:
				if String(p.get("role", "")) != role:
					continue
				if String(p.get("league_id", "")) != String(order[i]):
					continue
				if _average(p) < min_avg:
					continue
				pool.append(p)
		if not pool.is_empty():
			break
	if pool.is_empty():
		return {}
	return pool[int(rng.randf() * float(pool.size())) % pool.size()]


static func _average(p: Dictionary) -> float:
	var stats: Dictionary = p.get("stats", {})
	if stats.is_empty():
		return 0.0
	var total: float = 0.0
	for k in stats:
		total += float(stats[k])
	return total / float(stats.size())


## 스카우트한 사람을 옮긴다. **양쪽을 같이 고친다** — 한쪽만 고치면
## 같은 사람이 두 팀에 있거나 아무 데도 없다
static func _move(world: Dictionary, p: Dictionary, to_team: String,
		to_league: String, year: int) -> void:
	var from_team: String = String(p.get("team_id", ""))
	var from_list: Array = Staff.all_of(world).get(from_team, [])
	for i in range(from_list.size()):
		if from_list[i] == p:
			from_list.remove_at(i)
			break

	var events: Array = p.get("career_events", [])
	events.append({"year": year, "type": "staff_hired",
		"from_team_id": from_team,
		"from_league_id": String(p.get("league_id", "")),
		"to_team_id": to_team, "to_league_id": to_league,
		"detail": "영입"})
	p["career_events"] = events
	p["team_id"] = to_team
	p["league_id"] = to_league


## 아무도 못 찾으면 새로 만든다 — **자리를 비우지 않는다**
##
## ⚠ **id에 연도를 넣는다.** 자리 이름만으로 만들면 스카우트로 떠난 사람과
## 그 자리를 메운 사람이 **같은 id**를 갖는다 — 세계에 같은 사람이 두 팀에
## 있는 것으로 보이고, 관계도가 어느 쪽을 가리키는지 알 수 없게 된다
static func _make(team_id: String, league_id: String, role: String,
		power: float, year: int, rng: RandomNumberGenerator) -> Dictionary:
	for p in Staff.build_team(team_id, league_id, power, 50.0, rng):
		if String(p.get("role", "")) == role:
			p["id"] = "%s_%s_%d" % [team_id, role.substr(0, 3).to_upper(), year]
			return p
	return {}
