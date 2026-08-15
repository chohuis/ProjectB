extends RefCounted
class_name Foreign

## 외국인 선수 — 국적 · 보유 한도 · 연간 순환. B-9.
##
## 원본: `usecases/foreignPlayers.ts` · `utils/foreignSlots.ts` ·
##       `utils/foreignOrigin.ts` · `generation_rules.json`의 `foreignRules`
##
## ⚠ **한도를 물을 땐 국적이다.** 02는 "그 리그에서 외국인인가"를 문지기로
## 쓴 자리가 다섯이었고 **전부 샜다** — ABL 선수는 ABL에서 내국인이라
## 그 조건을 그냥 통과한다.
##
## ⚠ **충원을 안 하면 한 시즌마다 자리가 줄어든다.** 퇴출은 일어나는데
## 들어오는 경로가 없으면 몇 해 뒤 KBL에 외국인이 사라진다.
##
## ⚠ **실재하는 해외 선수를 데려온다.** 02는 예전에 무에서 찍어서 **어디서
## 왔다는 기록이 아예 없었고** 화면이 국내 신인과 구분을 못 했다.


const RULES_PATH: String = "res://data/foreign_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("외국인 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


static func quota_leagues() -> Array:
	return rules().get("leagues", [])


static func per_team() -> int:
	return int(rules().get("per_team", 3))


static func max_pitchers() -> int:
	return int(rules().get("max_pitchers", 2))


static func home_nationality() -> String:
	return String(rules().get("home_nationality", "KOR"))


static func return_league() -> String:
	return String(rules().get("origin", {}).get("return_league", ""))


static func origin_weights() -> Dictionary:
	var out: Dictionary = {}
	for k in rules().get("origin", {}).get("weights", {}):
		if not String(k).begins_with("_"):
			out[String(k)] = float(rules()["origin"]["weights"][k])
	return out


# ── 국적 ──────────────────────────────────────────────────────

## 그 선수의 국적. **박혀 있으면 그걸 쓰고**, 없으면 지금 리그에서 낸다 —
## 옛 세이브와 아직 안 옮긴 선수를 위한 자리다
static func nationality_of(p: Dictionary) -> String:
	var n: String = String(p.get("nationality", ""))
	if not n.is_empty():
		return n
	return String(rules().get("league_nationality", {}).get(
		String(p.get("league_id", "")), home_nationality()))


## ⚠ **한도 문지기는 이것이다.** "그 리그에서 외국인인가"(`is_foreign_player`)를
## 문지기로 쓰면 **ABL 선수는 ABL에서 내국인**이라 그냥 통과한다 —
## 02에서 그 자리가 다섯이었고 전부 샜다
static func is_foreign_in_quota_league(nationality: String) -> bool:
	return nationality != home_nationality()


## 그 리그에서 외국인으로 보이는가 — **표시용이다.** 한도 판정에 쓰지 않는다
static func is_foreign_player(league_id: String, nationality: String) -> bool:
	if not quota_leagues().has(league_id):
		return false
	return is_foreign_in_quota_league(nationality)


static func is_quota_league(league_id: String) -> bool:
	return quota_leagues().has(league_id)


# ── 보유 ──────────────────────────────────────────────────────

## 그 팀이 보유한 외국인
static func held_of(world: Dictionary, team_id: String) -> Array:
	var out: Array = []
	for p in World.roster_of(world, team_id):
		if String(p.get("career_status", "active")) != "active":
			continue
		if is_foreign_in_quota_league(nationality_of(p)):
			out.append(p)
	return out


## 재계약할 만한가. **성적이 아니라 능력치·나이로 본다** — 성적은 그 해
## 등판 수에 좌우돼 표본이 얇은 선수를 억울하게 자른다. 용병은 애초에
## 능력치 추첨이라 능력치가 곧 그 선수의 값이다
static func can_renew(p: Dictionary) -> bool:
	var r: Dictionary = rules().get("renew", {})
	return Contract.core_ovr(p) >= float(r.get("ovr_min", 73)) \
		and int(p.get("age", 99)) <= int(r.get("age_max", 36))


# ── 후보 뽑기 ─────────────────────────────────────────────────

## 데려올 만한 해외 선수인가 — 규칙선(66~94)과 나이(25~34)
##
## ⚠ **아무나 데려오면 용병이 국내 신인만 못하다**
static func is_signable(p: Dictionary) -> bool:
	var r: Dictionary = rules()
	if String(p.get("career_status", "active")) != "active":
		return false
	if not origin_weights().has(String(p.get("league_id", ""))):
		return false
	var age: int = int(p.get("age", 0))
	if age < int(r.get("age_min", 0)) or age > int(r.get("age_max", 99)):
		return false
	var ovr: float = Contract.core_ovr(p)
	return ovr >= float(r.get("ovr_min", 0)) and ovr <= float(r.get("ovr_max", 99))


## 가중 추첨으로 한 명. 후보에서 **빼서** 돌려준다. 없으면 빈 사전.
##
## ⚠ **출신 리그 가중치가 정본이다.** 마이너 출신이 대부분이어야 한다 —
## 균등하게 뽑으면 메이저 주전급이 매년 무더기로 온다
static func draw(pool: Array, want_pitcher: bool,
		rng: RandomNumberGenerator) -> Dictionary:
	var weights: Dictionary = origin_weights()
	var picks: Array = []
	var total: float = 0.0
	for i in range(pool.size()):
		var p: Dictionary = pool[i]
		if PlayerGen.is_pitcher(String(p.get("position", ""))) != want_pitcher:
			continue
		var w: float = float(weights.get(String(p.get("league_id", "")), 0.0))
		if w <= 0.0:
			continue
		picks.append({"i": i, "w": w})
		total += w
	if picks.is_empty():
		return {}

	var roll: float = rng.randf() * total
	for x in picks:
		roll -= float(x["w"])
		if roll <= 0.0:
			return pool.pop_at(int(x["i"]))
	return pool.pop_at(int(picks[picks.size() - 1]["i"]))


# ── 연간 순환 ─────────────────────────────────────────────────

## 시즌이 바뀔 때 한 번. `{released, signed, returned, logs}`
##
## ⚠ **은퇴·로스터 정리가 끝난 뒤에 부른다** — 그래야 빈 자리를 정확히 센다.
##
## ⚠ **처음 도는 해에는 재계약 판정을 하지 않는다.** 계약한 시즌은 뛰고
## 평가받는다 — 바로 자르면 하한 근처가 한 경기도 못 뛰고 재추첨되어
## 의도한 대박/쪽박 편차가 첫 주에 좁아진다
static func turnover(state: Dictionary, year: int) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	var out: Dictionary = {"released": 0, "signed": 0, "returned": 0, "logs": []}
	if world.is_empty() or quota_leagues().is_empty():
		return out

	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["foreign", int(state.get("seed", 0)), year])

	var first_run: bool = int(state.get("foreign_turnover_year", 0)) == 0
	state["foreign_turnover_year"] = year

	if not first_run:
		_release(state, world, year, out)
	_fill(state, world, year, rng, out)
	return out


## ① 재계약 판정 — 못 미치면 **온 곳으로 돌려보낸다**
##
## ⚠ 02는 예전에 은퇴로 기록했다. "본국 복귀를 은퇴로 기록한다"고 적혀
## 있었는데 진짜 이유는 **갈 곳이 없어서**였다 — 해외가 닫혀 있었다
static func _release(state: Dictionary, world: Dictionary, year: int,
		out: Dictionary) -> void:
	var back: String = return_league()
	var back_teams: Array = []
	for t in World.teams_of(back):
		back_teams.append(String(t["id"]))

	for league in quota_leagues():
		for t in World.teams_of(league):
			var team_id: String = String(t["id"])
			for p in held_of(world, team_id).duplicate():
				if can_renew(p):
					continue
				out["released"] += 1
				out["logs"].append("[외국인] %s 재계약 불가 (OVR %d · %d세)"
					% [p.get("name", p.get("id", "")),
						int(roundf(Contract.core_ovr(p))), int(p.get("age", 0))])
				# 돌아갈 리그에 팀이 없는 갈래는 두지 않는다 — 그 리그는
				# ABL 1군에서 파생하므로 늘 팀이 있고, 검사가 그걸 못 박는다.
				# 안 그러면 절대 안 걸리는 죽은 가드가 된다.
				#
				# 한 팀에 몰아넣지 않는다 — 제일 얇은 팀으로
				_move(world, team_id, _thinnest(world, back_teams), p, back, {
					"year": year, "type": "release",
					"detail": "재계약 불가 — 본국 복귀",
				})
				out["returned"] += 1


## ② 빈 슬롯 충원 — **자리를 비우지 않는다**
static func _fill(state: Dictionary, world: Dictionary, year: int,
		rng: RandomNumberGenerator, out: Dictionary) -> void:
	var pool: Array = []
	for team_id in world.get("rosters", {}):
		for p in world["rosters"][team_id]:
			if is_signable(p):
				pool.append(p)
	if pool.is_empty():
		return

	# 팀 순서를 id로 못 박는다 — 팀 정의 파일의 줄 순서를 바꿔도 어느 팀이
	# 먼저 뽑는지가 안 흔들린다
	for league in quota_leagues():
		var team_ids: Array = []
		for t in World.teams_of(league):
			team_ids.append(String(t["id"]))
		team_ids.sort()

		for team_id in team_ids:
			var held: Array = held_of(world, team_id)
			var short: int = per_team() - held.size()
			if short <= 0:
				continue

			# 투수는 한도까지만 — 부족분을 전부 투수로 채우면 한도가 깨진다
			var held_pitchers: int = 0
			for h in held:
				if PlayerGen.is_pitcher(String(h.get("position", ""))):
					held_pitchers += 1
			var want_pitchers: int = clampi(max_pitchers() - held_pitchers, 0, short)

			for i in range(short):
				var c: Dictionary = draw(pool, i < want_pitchers, rng)
				if c.is_empty():
					# 그 갈래에 후보가 없으면 반대쪽으로 채운다 — 자리를
					# 비우면 그 팀이 한 시즌을 두 명으로 뛴다
					c = draw(pool, i >= want_pitchers, rng)
				if c.is_empty():
					break
				_sign(world, c, team_id, league, year)
				out["signed"] += 1

	if out["signed"] > 0:
		out["logs"].append("[외국인] %d 영입 %d명" % [year, out["signed"]])


## 영입 — **국적을 박아 둔다.** 안 박으면 KBL로 옮긴 순간 리그가 KBL이라
## 내국인으로 읽힌다
static func _sign(world: Dictionary, p: Dictionary, team_id: String,
		league: String, year: int) -> void:
	var from_league: String = String(p.get("league_id", ""))
	p["nationality"] = nationality_of(p)
	p["is_foreign"] = true
	_move(world, String(p.get("team_id", "")), team_id, p, league, {
		"year": year, "type": "foreign_signing",
		"detail": "%s 출신" % from_league,
	})


# ── 옮기기 ────────────────────────────────────────────────────

## 제일 인원이 적은 팀
static func _thinnest(world: Dictionary, team_ids: Array) -> String:
	var best: String = String(team_ids[0])
	var best_n: int = World.roster_of(world, best).size()
	for id in team_ids:
		var n: int = World.roster_of(world, String(id)).size()
		if n < best_n:
			best_n = n
			best = String(id)
	return best


## 로스터 사이를 옮긴다. **양쪽 배열을 같이 고친다** — 한쪽만 고치면
## 같은 선수가 두 팀에 있거나 아무 데도 없다
static func _move(world: Dictionary, from_team: String, to_team: String,
		p: Dictionary, to_league: String, event: Dictionary) -> void:
	var rosters: Dictionary = world.get("rosters", {})
	var from_list: Array = rosters.get(from_team, [])
	for i in range(from_list.size()):
		if from_list[i] == p:
			from_list.remove_at(i)
			break

	var ev: Dictionary = event.duplicate()
	ev["from_team_id"] = from_team
	ev["from_league_id"] = String(p.get("league_id", ""))
	ev["to_team_id"] = to_team
	ev["to_league_id"] = to_league
	var events: Array = p.get("career_events", [])
	events.append(ev)
	p["career_events"] = events

	p["team_id"] = to_team
	p["league_id"] = to_league
	if not rosters.has(to_team):
		rosters[to_team] = []
	rosters[to_team].append(p)
	world["rosters"] = rosters