extends RefCounted
class_name FaRunner

## FA를 세계에 적용한다 — M9-12.
##
## `FaMarket`은 순수 계산이고, 여기가 세계를 실제로 바꾼다:
## 자격자를 모으고 · 시장을 돌리고 · 선수를 옮기고 · 보상선수를 되돌린다.
##
## ⚠ **02는 이 자리가 `weekPhases/market.ts` 1,566줄 안에 섞여 있었다.**
## 계산과 적용이 붙어 있으면 검사가 세계를 통째로 만들어야 한다.


## 1군 로스터 상한까지 몇 자리 비었나
static func open_slots_of(world: Dictionary, team_id: String, league_id: String) -> int:
	var roster: Array = World.roster_of(world, team_id)
	return maxi(RosterMaintenance.roster_max_of(league_id) - roster.size(), 0)


## 보상선수 후보. **외국인은 뺀다** — 안 빼면 보호선수 다음 순위가 거의
## 항상 용병이라 매 FA마다 한 명씩 팀을 옮긴다.
##
## ⚠ **주인공도 뺀다.** 사용자가 정할 일을 세계가 대신 정하면 안 된다
static func compensation_pool(world: Dictionary, team_id: String) -> Array:
	var out: Array = []
	for p in World.roster_of(world, team_id):
		if p.get("is_protagonist", false):
			continue
		# 🔴 **국적으로 묻는다. 그 선수의 지금 리그로 묻지 않는다** (P-5b).
		# 02가 이 자리에 함정을 적어 뒀다 — `is_foreign`은 "그 리그에서
		# 외국인인가"라 **JBL 팀의 일본 선수를 내국인으로 통과시킨다.**
		# 시장이 프로 한 판이 되면서 한국 선수가 JBL 팀과 계약할 수 있게
		# 됐고, 그러면 그 팀의 일본 선수가 **보상선수로 KBL에 온다.**
		# 02는 같은 함정에 FA·드래프트·트레이드에서 걸렸다(문지기 자리 다섯)
		if Foreign.is_foreign_in_quota_league(Foreign.nationality_of(p)):
			continue
		out.append({"id": String(p.get("id", "")), "ovr": Contract.core_ovr(p)})
	return out


## 그 리그의 FA 자격자
static func eligible_of(world: Dictionary, league_id: String) -> Array:
	var out: Array = []
	for tid in world.get("rosters", {}):
		for p in world["rosters"][tid]:
			if String(p.get("league_id", "")) != league_id:
				continue
			# ⚠ **주인공의 FA는 사용자가 정한다** — 계약 화면이 맡는다(미이관)
			if p.get("is_protagonist", false):
				continue
			if Contract.is_fa_eligible(p):
				out.append(p)
	return out


## **프로 전체**의 FA 자격자 — 시장은 한 판이다 (P-5b).
##
## 🔴 **04는 `for lid in PRO_LEAGUES: run_league`라 리그를 넘는 이적이
## 아예 없었다.** 02 `market.ts:1241`은 `activeProLeagues()`의 1군을
## **한 판에** 넣는다 — 그 자리에 이유도 적혀 있다: "KBL 팀만 넘기고 있었다.
## Rust FA 오퍼에는 ABL·JBL 경로가 있는데 목적지 팀을 안 주니 **NPC가
## 해외로 갈 방법이 없었다.**"
static func pro_eligible_of(world: Dictionary) -> Array:
	var out: Array = []
	for lid in TeamProfile.PRO_LEAGUES:
		out.append_array(eligible_of(world, lid))
	return out


## 팀 → 리그. 시장이 한 판이라 **옮길 때 목적지의 리그를 알아야 한다**
static func _league_index(world: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for lid in TeamProfile.PRO_LEAGUES:
		for t in World.teams_of(lid):
			out[String(t["id"])] = lid
	return out


## **프로 전체**의 연봉 — 등급 백분위의 분모다.
##
## ⚠ **리그 하나만 보면 안 된다** (P-5). 02가 그 자리에 이유를 적어 뒀다
## (`weekPhases/market.ts:1279`) — "연봉 기준선도 프로 전체에서, 리그 하나만
## 보면 해외 시세가 안 잡힌다". 04는 리그별로 봤고, FA 자격자는 근속 쌓인
## 베테랑이라 **자기 리그 안에서 전부 상위 30%에 들어 A등급만 나왔다.**
## `protected_count 25`(B)와 `0`(C) 갈래가 도달 불가였다
static func pro_salaries(world: Dictionary) -> Array:
	var out: Array = []
	for lid in TeamProfile.PRO_LEAGUES:
		out.append_array(league_salaries(world, lid))
	return out


## 그 리그의 모든 연봉. **분모로는 쓰지 않는다** — `pro_salaries`가 분모다
static func league_salaries(world: Dictionary, league_id: String) -> Array:
	var out: Array = []
	for tid in world.get("rosters", {}):
		for p in world["rosters"][tid]:
			if String(p.get("league_id", "")) == league_id and p.has("salary"):
				out.append(int(p["salary"]))
	return out


## 선수를 팀 사이로 옮긴다. **양쪽 배열을 같이 고쳐야 한다** —
## 한쪽만 하면 같은 선수가 두 군데 있거나 통째로 사라진다
static func _move(world: Dictionary, player_id: String, to_team: String,
		to_league: String) -> Dictionary:
	var rosters: Dictionary = world.get("rosters", {})
	for tid in rosters:
		var roster: Array = rosters[tid]
		for i in roster.size():
			if String(roster[i].get("id", "")) != player_id:
				continue
			var p: Dictionary = roster[i]
			roster.remove_at(i)
			p["team_id"] = to_team
			p["league_id"] = to_league
			if not rosters.has(to_team):
				rosters[to_team] = []
			rosters[to_team].append(p)
			return p
	return {}


## 시장에 올릴 선수 목록 — **게임과 계측이 같이 부른다** (P-5c).
##
## 🔴 **계측이 이 조립을 손으로 복제하고 있었다.** 그래서 게임 쪽 분모를
## 고쳤는데 계측이 안 따라와 **"고쳤는데 그대로"로 한 번 읽혔다.**
## 조립을 여기 한 곳에 두면 두 경로가 갈릴 수 없다
static func market_players_of(world: Dictionary) -> Array:
	var out: Array = []
	for p in pro_eligible_of(world):
		out.append({
			"id": String(p["id"]), "name": String(p.get("name", "")),
			"from_team_id": String(p.get("team_id", "")),
			"ovr": Contract.core_ovr(p), "age": int(p.get("age", 27)),
			"salary": int(p.get("salary", 0)), "form": 0.0,
		})
	return out


## 시장에 들어오는 구단 — **게임과 계측이 같이 부른다** (P-5c)
static func market_teams_of(world: Dictionary) -> Array:
	var out: Array = []
	# ⚠ **상무는 따로 안 뻐다** — 독립 리그 소속이라 `PRO_LEAGUES`에 없다.
	# 02는 프로 안에 두고 `SANGMU_TEAM_IDS`로 뿬다(04는 구조가 다르다)
	for lid in TeamProfile.PRO_LEAGUES:
		for t in World.teams_of(lid):
			var tid: String = String(t["id"])
			out.append({
				"team_id": tid,
				# 리그마다 정원이 다르다 — 옮길 때도 이걸 본다
				"league_id": lid,
				# 예산 지수는 아직 없다 — 구단주 쓰씨씨이로 대신한다.
				# **모양은 02 그대로다**(0.8~1.35), 재정이 붙으면 값만 바뀐다
				"budget_index": clampf(
					float(TeamProfile.of(world, tid)["owner_spending_willingness"]) / 50.0,
					0.8, 1.35),
				"win_now_pressure": float(TeamProfile.of(world, tid)["win_now_pressure"]),
				"open_slots": open_slots_of(world, tid, lid),
				"roster": compensation_pool(world, tid),
			})
	return out


## 프로 전체의 FA를 **한 판**으로 정산해 세계에 적용한다 (P-5b).
## `{signings, unsigned, moved}`
##
## 🔴 **예전엔 리그마다 따로 돌렸다.** 그래서 리그를 넘는 이적이 아예 없었고,
## 02가 그 자리에 적어 둔 "NPC가 해외로 갈 방법이 없었다"를 04가 그대로
## 갖고 있었다. 02 `market.ts:1241`은 프로 1군을 한 판에 넣는다
static func run_market(state: Dictionary,
		rng: RandomNumberGenerator) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	var players: Array = pro_eligible_of(world)
	if players.is_empty():
		return {"signings": 0, "unsigned": 0, "moved": 0,
			"grades": {}, "compensations": 0, "transfers": 0}

	# 🔴 **조립을 여기서 다시 짓지 않는다** (P-5c). 계측이 부르는 것과 같은
	# 함수다 — 갈리면 게임을 고쳐도 계측이 안 따라온다
	var market_players: Array = market_players_of(world)
	var teams: Array = market_teams_of(world)
	# 목적지의 리그 — **선수가 리그를 넘으므로 정원도 목적지 것으로 본다**
	var league_of: Dictionary = _league_index(world)

	var out: Dictionary = FaMarket.resolve(market_players, teams,
		pro_salaries(world), rng)

	var moved: int = 0
	# ⚠ **등급·보상 수를 같이 낸다** (P-5b). 계측이 이걸 못 읽어서 **끝난
	# 시장을 제 손으로 다시 돌렸고**, 게임이 이미 계약을 마친 뒤라 "계약 0명"이
	# 나왔다 — 계측이 게임 경로를 안 타던 자리가 또 하나였다(형태 ⑦)
	var by_grade: Dictionary = {}
	var comps: int = 0
	# ⚠ **`moved`는 옮김 처리 수라 원소속 재계약도 센다.** 실제로 팀을
	# 바꾼 수는 따로 세야 한다 — 안 그러면 계측이 "이적 100%"로 찍는다
	var transfers: int = 0
	for s in out["signings"]:
		var g: String = String(s.get("grade", "?"))
		by_grade[g] = int(by_grade.get(g, 0)) + 1
		if String(s["to_team_id"]) != String(s["from_team_id"]):
			transfers += 1
		if not String(s["compensation_id"]).is_empty():
			comps += 1
		# ⚠ **정원은 목적지 리그 것이다.** 한 판이 되면서 KBL 선수가 JBL
		# 팀과 계약할 수 있게 됐는데, 그때 KBL 정원으로 재면 어긋난다
		var to_league: String = String(league_of.get(
			String(s["to_team_id"]), ""))
		var limit: int = RosterMaintenance.roster_max_of(to_league)
		# ⚠ **모형과 세계가 벌어질 수 있다.** `FaMarket`은 자리 수를 자기
		# 장부로 세는데, 원소속을 떠난 사람이 비운 자리를 그 장부가 모른다 —
		# 보상선수가 그 자리를 채우면 장부에만 자리가 하나 더 생긴다.
		# **옮기기 전에 진짜 로스터를 본다**
		if World.roster_of(world, String(s["to_team_id"])).size() >= limit:
			continue
		var p: Dictionary = _move(world, String(s["id"]), String(s["to_team_id"]),
			to_league)
		if p.is_empty():
			continue
		moved += 1
		# ⚠ **새 계약을 실제로 붙인다.** 안 붙이면 계약 연수가 0인 채로 남아
		# **매년 같은 사람이 다시 FA가 된다**
		p["salary"] = int(s["salary"])
		p["contract_years"] = int(s["years"])
		var events: Array = p.get("career_events", [])
		events.append({"year": int(state.get("season_year", 0)), "type": "fa_signed",
			"from_team_id": String(s["from_team_id"]),
			"to_team_id": String(s["to_team_id"]),
			"detail": "FA %s등급" % s["grade"]})
		p["career_events"] = events

		var comp: String = String(s["compensation_id"])
		if not comp.is_empty():
			# ⚠ **보상선수는 원소속으로 간다** — 그 팀의 리그를 쓴다.
			# 목적지 리그를 쓰면 KBL 선수가 JBL 소속으로 기록된다
			var c: Dictionary = _move(world, comp, String(s["from_team_id"]),
				String(league_of.get(String(s["from_team_id"]), to_league)))
			if not c.is_empty():
				moved += 1
				var ce: Array = c.get("career_events", [])
				ce.append({"year": int(state.get("season_year", 0)),
					"type": "fa_compensation",
					"from_team_id": String(s["to_team_id"]),
					"to_team_id": String(s["from_team_id"]),
					"detail": "FA 보상선수"})
				c["career_events"] = ce

	# 미계약자는 계약이 없는 상태로 남는다 — 진로 배정이 가져간다
	for id in out["unsigned"]:
		for p in players:
			if String(p["id"]) == id:
				p["fa_unsigned"] = true

	return {"signings": out["signings"].size(), "unsigned": out["unsigned"].size(),
		"moved": moved, "grades": by_grade, "compensations": comps,
		"transfers": transfers}


## 프로 리그 전부. 시즌 종료가 부른다
static func run(state: Dictionary) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	if world.is_empty():
		return {"signings": 0, "unsigned": 0, "moved": 0,
			"grades": {}, "compensations": 0, "transfers": 0}

	# ⚠ **흐름이 하나다** (P-5b). 시장이 한 판이라 리그별로 가를 수가 없다 —
	# 나누면 같은 팀이 세 번 나와 자리를 세 번 채운다
	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["fa", state.get("seed", 0),
		state.get("season_year", 0)])
	return run_market(state, rng)
