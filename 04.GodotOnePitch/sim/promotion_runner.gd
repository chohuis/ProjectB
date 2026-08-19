extends RefCounted
class_name PromotionRunner

## 인시즌 1군↔2군 승강 — 주 경계마다 돈다. P-4.
##
## 원본: `apps/ui/src/shared/usecases/weekPhases/market.ts:693-830`
##
## ⚠ **이 시스템이 통째로 미이관이었다.** `RosterMaintenance`에 판정 조각과
## 값이 다 있는데 **부르는 곳이 검사뿐이었다** — 02는 시즌 26주에 145건을
## 옮기는데 04는 0건이었다. 시즌 중 1군이 고정돼서, 2군에서 잘해도 안 올라오고
## 1군에서 부진해도 안 내려가고 **부상으로 자리가 비어도 안 메웠다.**
##
## ⚠ **오프시즌 정원 초과 강등과 다른 일이다**(`season_runner.gd`).
## 그쪽은 해마다 한 번 상한을 넘긴 인원을 잘라내고, 여기는 매주 성적을 본다.


## 주기. **정본은 `market.ts:693-706`이다** (계측 스크립트의 근사가 아니다).
##
##   월 첫 주 = 정기 — 콜업 + 콜다운을 같이 돌린다. 팀당 각 둘까지
##   나머지 주 = 상시 — **빈 자리 메우기만.** 팀당 하나, 사유가
##                     부상 대체 · 부진 대체인 것만
##
## ⚠ **04는 일 단위라 "주"가 02와 같은 뜻이 아니다.** 그래서 주 인덱스를
## 세지 않고 **달력의 달이 바뀌었는지**로 가른다 — 04엔 진짜 달력이 있어서
## (`Calendar.date_of`) 02의 "월 첫 주"를 근사 없이 그대로 옮길 수 있다.
## 매주 4로 나누는 식으로 세면 달과 서서히 어긋난다
const REGULAR_CALLUPS: int = 2
const REGULAR_CALLDOWNS: int = 2
const URGENT_CALLUPS: int = 1

## 마지막으로 정기를 돈 달이 사는 자리
const KEY_LAST_MONTH: String = "promotion_last_month"


## 그 팀의 1군 · 2군. **로스터를 두 번 훑지 않는다**
static func _split(world: Dictionary, team_id: String) -> Dictionary:
	return {
		"active": World.roster_of(world, team_id),
		"farm": World.roster_of(world, team_id + World.FARM_SUFFIX),
	}


## 부상·차출로 자리를 비운 사람들.
##
## ⚠ **국가대표 차출자를 부상자와 같은 목록으로 넘긴다**(02 확정) —
## 따로 처리하면 대회 기간에 1군이 빈 채로 돈다
static func absent_ids(state: Dictionary) -> Array:
	var out: Array = []
	for pid in state.get("npc_injuries", {}):
		var inj = state["npc_injuries"][pid]
		if inj is Dictionary and String(inj.get("severity", "")) != "mild":
			out.append(String(pid))
	for pid in state.get("national_duty", {}):
		out.append(String(pid))
	return out


## 한 선수를 옮긴다. **리그도 같이 바꾼다** — 팀만 바꾸면 그 선수는 여전히
## 1군 소속으로 집계돼 2군 상한이 영원히 안 걸린다
## `log_into`를 주면 **옮긴 사람 한 줄**을 거기 담는다 (G-6).
## ⚠ **이름을 아는 곳이 여기뿐이다** — 부르는 쪽은 id만 들고 있다.
## ⚠ **`league_id`를 바꾸기 전에 읽는다** — 뒤에서 읽으면 from과 to가 같아진다
static func _move(world: Dictionary, player_id: String, from_team: String,
		to_team: String, to_league: String, year: int, detail: String,
		log_into: Array = []) -> bool:
	var from_roster: Array = World.roster_of(world, from_team)
	for i in from_roster.size():
		var p: Dictionary = from_roster[i]
		if String(p.get("id", "")) != player_id:
			continue
		# ⚠ **주인공은 세계가 옮기지 않는다.** 사용자가 정할 일이다
		if bool(p.get("is_protagonist", false)):
			return false
		var events: Array = p.get("career_events", [])
		events.append({"year": year, "type": "promotion_move",
			"from_team_id": from_team, "to_team_id": to_team,
			"from_league_id": String(p.get("league_id", "")),
			"to_league_id": to_league, "detail": detail})
		p["career_events"] = events
		log_into.append(EventLog.entry(player_id,
			String(p.get("name", player_id)), detail,
			from_team, to_team, String(p.get("league_id", "")), to_league))
		p["team_id"] = to_team
		p["league_id"] = to_league
		from_roster.remove_at(i)
		if not world.get("rosters", {}).has(to_team):
			world["rosters"][to_team] = []
		world["rosters"][to_team].append(p)
		return true
	return false


## 시즌 성적을 승강 판정이 읽는 모양으로 붙인다.
##
## ⚠ **이걸 안 붙이면 승강이 능력치만 본다.** `RosterMaintenance.form_score`가
## `p["perf"]`를 읽는데 채우는 곳이 없어서 `rated()`의 `form_score × 8` 항이
## 늘 0이었다 — 02가 "성적이 능력치를 뒤집되 완전히 무시하진 않는" 지점으로
## 잡은 가중이 통째로 죽어 있었다.
##
## ⚠ **시즌 누계를 그대로 쓴다.** 02도 창을 안 자른다
## (`market.ts:39` `seasonPerfOf`). 최근 N경기로 바꾸면 그게 두 번째 규칙이 된다.
##
## ⚠ **기록이 없으면 빈 사전이다.** `form_score`가 표본 0으로 읽어 0을 주므로
## 판정이 능력치만 보게 된다 — 없는 성적을 좋게도 나쁘게도 읽지 않는다
static func attach_perf(roster: Array, stats: Dictionary) -> void:
	for p in roster:
		var st = stats.get(String(p.get("id", "")), null)
		if not (st is Dictionary):
			p["perf"] = {}
			continue
		var s: Dictionary = st
		if String(s.get("type", "")) == "pitcher":
			p["perf"] = {"games": int(s.get("g", 0)),
				"innings": float(s.get("ip", 0.0)),
				"era": float(s.get("era", 0.0)),
				"whip": float(s.get("whip", 0.0))}
		else:
			p["perf"] = {"games": int(s.get("g", 0)),
				"pa": float(s.get("pa", 0.0)),
				"ops": float(s.get("ops", 0.0))}


## 한 팀의 한 주. `{callups, calldowns}`
static func run_team(state: Dictionary, team_id: String, league_id: String,
		urgent_only: bool) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	var pair: Dictionary = _split(world, team_id)
	var active: Array = pair["active"]
	var farm: Array = pair["farm"]
	if active.is_empty() or farm.is_empty():
		return {"callups": 0, "calldowns": 0, "up": [], "down": []}

	# 🔴 **누가 움직였는지 남긴다** (G-6). 개수만 반환하면 자동 진행을 돌려도
	# "콜업 3건"까지만 보이고 누구인지 알 길이 없다.
	# ⚠ **올라간 쪽과 내려간 쪽을 따로 담는다** — 02도 `_callupEntries`와
	# `_calldownEntries` 둘이다. "콜업 교체"로 밀려난 사람은 **내려간 쪽**이다
	var up_log: Array = []
	var down_log: Array = []

	# ⚠ **판정 전에 성적을 붙인다.** 안 붙이면 `form_score`가 늘 0이라
	# 승강이 능력치만 본다
	var stats: Dictionary = state.get("season_stats", {})
	attach_perf(active, stats)
	attach_perf(farm, stats)

	var farm_league: String = league_id + "_FARM"
	var profile: Dictionary = TeamProfile.of(world, team_id)
	var year: int = int(state.get("season_year", 0))
	var mod: float = float(Staff.mods_of(world, team_id).get("callup", 1.0))

	var picked: Array = RosterMaintenance.eval_callup(
		profile, farm, active, absent_ids(state), mod)
	if urgent_only:
		# 상시 경로는 **빈 자리 메우기만** — 나머지 사유는 정기의 몫이다
		var urgent: Array = []
		for c in picked:
			if String(c["reason"]) in RosterMaintenance.URGENT_REASONS:
				urgent.append(c)
		picked = urgent.slice(0, URGENT_CALLUPS)
	else:
		picked = picked.slice(0, REGULAR_CALLUPS)

	var farm_team: String = team_id + World.FARM_SUFFIX
	var callups: int = 0
	for c in picked:
		# ⚠ **올리기 전에 내린다.** 반대로 하면 정원을 한 번 넘겼다가
		# 줄어드는데, 그 사이에 상한을 보는 코드가 있으면 잘못 잡는다
		if not _move(world, String(c["replaces_player_id"]), team_id,
				farm_team, farm_league, year, "콜업 교체", down_log):
			continue
		if _move(world, String(c["player_id"]), farm_team, team_id,
				league_id, year, String(c["reason"]), up_log):
			callups += 1
		else:
			# 되돌렸으면 내려간 일도 없던 것이다 — 담아 둔 줄을 뺀다
			if not down_log.is_empty():
				down_log.remove_at(down_log.size() - 1)
			# 올리기가 막혔으면 내린 사람을 되돌린다 — 안 그러면 1군이 준다
			_move(world, String(c["replaces_player_id"]), farm_team,
				team_id, league_id, year, "콜업 취소")

	if urgent_only:
		return {"callups": callups, "calldowns": 0, "up": up_log, "down": down_log}

	var down: Array = RosterMaintenance.eval_calldown(profile,
		World.roster_of(world, team_id),
		RosterMaintenance.roster_max_of(league_id), mod)
	var calldowns: int = 0
	for d in down.slice(0, REGULAR_CALLDOWNS):
		if _move(world, String(d["player_id"]), team_id, farm_team,
				farm_league, year, "정원 정리", down_log):
			calldowns += 1
	return {"callups": callups, "calldowns": calldowns,
		"up": up_log, "down": down_log}


## 이번 주가 정기인가 — **달이 바뀌었으면 정기다**
static func is_regular(state: Dictionary, at_day: int) -> bool:
	var month: int = int(Calendar.date_of(
		int(state.get("season_year", 0)), at_day)["month"])
	return month != int(state.get(KEY_LAST_MONTH, -1))


## 주 경계에 부른다. `{callups, calldowns, regular}`
##
## ⚠ **주 경계가 아니면 아무것도 안 한다.** 매일 돌리면 02의 26배가 된다
static func run(state: Dictionary, at_day: int) -> Dictionary:
	var out: Dictionary = {"callups": 0, "calldowns": 0, "regular": false}
	if not Calendar.is_week_end(at_day):
		return out

	var regular: bool = is_regular(state, at_day)
	if regular:
		state[KEY_LAST_MONTH] = int(Calendar.date_of(
			int(state.get("season_year", 0)), at_day)["month"])
	out["regular"] = regular

	var world: Dictionary = state.get("world", {})
	# 🔴 **리그마다 따로 적는다** (G-6). 02도 `leagueId`를 실어서 어느 리그의
	# 일인지 남긴다 — 1군·2군이 한 줄에 섞이면 못 읽는다
	var year: int = int(state.get("season_year", 0))
	var week: int = Calendar.week_of(at_day)
	for league_id in RosterMaintenance.active_pro_leagues():
		var up: Array = []
		var down: Array = []
		var teams: Array = World.teams_of(league_id)
		for t in teams:
			var r: Dictionary = run_team(state, String(t["id"]), league_id,
				not regular)
			out["callups"] = int(out["callups"]) + int(r["callups"])
			out["calldowns"] = int(out["calldowns"]) + int(r["calldowns"])
			up.append_array(r.get("up", []))
			down.append_array(r.get("down", []))
		# `input`은 **후보가 몇 팀이었나**다 — 02도 `proTeams1.length`를 넣는다
		EventLog.push("callup", year, up, teams.size(), week, league_id)
		EventLog.push("calldown", year, down, teams.size(), week, league_id)
	return out
