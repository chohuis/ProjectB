extends RefCounted
class_name TournamentRunner

## 대회 배선 — 열고, 일정에 꽂고, 라운드를 올리고, 우승팀을 남긴다. B-4a.
##
## 원본: `usecases/tournaments.ts`
##
## ⚠ **하루 단위로 돈다.** 대회 한 판은 2~4주인데 라운드가 그 안에 고르게
## 퍼져 있어서 한 주에 두 라운드가 들어가는 날이 있다. 주 경계에서만 보면
## 그중 뒤 라운드가 **경기 날짜를 지나친 뒤에** 일정에 들어간다.
##
## ⚠ **일정에 꽂은 경기는 리그 순위에 안 들어간다.** `is_tournament`가
## 그 표시고 `Standings.from_schedule`이 그걸 거른다 — 안 거르면 전국대회
## 한 판이 리그 승률을 흔들고, 그 승률이 다음 대회 시드가 된다.


## 열린 대회가 사는 자리
const STATE_KEY: String = "tournaments"
## 끝난 대회 기록
const LOG_KEY: String = "tournament_log"
## 지난 시즌 최종 순위 — 개나리기(2주)처럼 **올해 성적이 없는 대회**의 시드
const LAST_STANDINGS_KEY: String = "last_standings"

## 대회가 있는 리그
const LEAGUES: Array[String] = ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY"]


static func all_of(state: Dictionary) -> Dictionary:
	return state.get(STATE_KEY, {})


static func of(state: Dictionary, tournament_id: String) -> Dictionary:
	return all_of(state).get(tournament_id, {})


static func _put(state: Dictionary, tournament_id: String,
		rec: Dictionary) -> void:
	var all: Dictionary = all_of(state)
	all[tournament_id] = rec
	state[STATE_KEY] = all


## 시드를 낼 순위표.
##
## ⚠ **개나리기는 2주에 열린다** — 올해 치른 경기가 거의 없다. 그때
## 올해 순위표를 쓰면 전 팀이 승률 0이라 **팀ID 순 시드**가 된다.
## 지난 시즌 최종 순위를 쓰는 이유가 그것이다(02의 `seedSource`)
static func standings_for(state: Dictionary, tournament_def: Dictionary) -> Array:
	var league: String = String(tournament_def["league_id"])
	if String(tournament_def.get("seed_source", "")) == "prev_season":
		var last: Array = state.get(LAST_STANDINGS_KEY, {}).get(league, [])
		if not last.is_empty():
			return last
	return Standings.from_schedule(state.get("schedule", []), league)


## 시즌이 끝날 때 그 해 최종 순위를 남긴다 — 다음 해 개나리기가 이걸 읽는다
static func remember_standings(state: Dictionary) -> void:
	var out: Dictionary = {}
	for league in LEAGUES:
		out[league] = Standings.from_schedule(state.get("schedule", []), league)
	state[LAST_STANDINGS_KEY] = out


static func _protagonist_team(state: Dictionary) -> String:
	return String(state.get("protagonist", {}).get("team_id", ""))


## 그 리그가 이 세이브에 실제로 있나.
##
## ⚠ **선수가 없는 리그에 대회를 열지 않는다.** 팀 목록은 데이터 파일에서
## 오므로 세계를 안 만든 상태에서도 102팀이 나온다 — 그대로 열면 아무도
## 없는 대회가 일정을 채운다
static func has_league(state: Dictionary, league_id: String) -> bool:
	# 로스터가 비면 아래 훑기가 아무것도 못 찾는다 — 따로 막지 않는다
	var rosters: Dictionary = state.get("world", {}).get("rosters", {})
	for t in World.teams_of(league_id):
		if rosters.has(String(t["id"])):
			return true
	return false


# ── 열기 ──────────────────────────────────────────────────────

## 대회 하나를 연다. 이미 열렸으면 `{}`
static func open(state: Dictionary, tournament_def: Dictionary,
		at_day: int) -> Dictionary:
	var tid: String = String(tournament_def["id"])
	if not of(state, tid).is_empty():
		return {}

	var league: String = String(tournament_def["league_id"])
	var standings: Array = standings_for(state, tournament_def)
	var regions: Array = Tournament.region_rankings(standings,
		Tournament.regions_of(league))
	var entrants: Dictionary = Tournament.select_entrants(regions,
		tournament_def, Tournament.win_pct_map(standings))
	# 참가팀은 팀 목록에서 나오므로 비지 않는다 — `has_league`가 이미 그 리그가
	# 이 세이브에 있다는 걸 확인했다
	var seeded: Array = entrants["seeded_teams"]
	var me: String = _protagonist_team(state)
	var year: int = int(state.get("season_year", 0))
	var rec: Dictionary = {"tournament_id": tid, "league_id": league,
		"opened_day": at_day, "entrants": entrants, "champion": "",
		"stage": {}, "bracket": {}, "final_built": false}

	if Tournament.has_group_stage(tournament_def):
		rec["stage"] = Tournament.build_group_stage(tournament_def, seeded, me,
			year, int(state.get("seed", 0)))
		_inject(state, rec["stage"]["matches"])
	else:
		rec["bracket"] = Tournament.generate_bracket(tournament_def, seeded, me,
			year)
		_inject(state, Tournament.round_schedule(rec["bracket"], 1))

	_put(state, tid, rec)
	# ⚠ **소식이 없으면 대회가 데이터로만 돈다.** 02가 그랬다 — 우승해도
	# 아무 말이 없었고, 고교 시즌의 서사가 통째로 안 보였다
	_send(state, TournamentNews.opening(tournament_def, seeded, me, at_day, year))
	return rec


## 소식함에 넣는다. **같은 id는 안 넣는다** — 소식 목록이 id를 키로 잡아서
## 겹치면 화면이 죽는다(02에서 세이브가 안 열린 적이 있다)
static func _send(state: Dictionary, message: Dictionary) -> bool:
	if message.is_empty():
		return false
	var mailbox: Array = state.get("mailbox", [])
	for m in mailbox:
		if String(m.get("id", "")) == String(message["id"]):
			return false
	mailbox.append(message)
	state["mailbox"] = mailbox
	return true


## 같은 권역 팀 — 라운드 명단에서 아는 이름을 짚어 준다
static func _my_region_teams(state: Dictionary, league_id: String) -> Array:
	var me: String = _protagonist_team(state)
	if me.is_empty():
		return []
	for key in Tournament.regions_of(league_id):
		var teams: Array = Tournament.regions_of(league_id)[key]
		if teams.has(me):
			return teams
	return []


## 일정에 꽂는다. **이미 있는 id는 안 덮어쓴다** — 덮으면 치른 결과가 날아간다
static func _inject(state: Dictionary, matches: Array) -> int:
	var schedule: Array = state.get("schedule", [])
	var known: Dictionary = {}
	for g in schedule:
		known[String(g.get("id", ""))] = true

	var added: int = 0
	for m in matches:
		if known.has(String(m["id"])):
			continue
		schedule.append(m.duplicate())
		known[String(m["id"])] = true
		added += 1
	state["schedule"] = schedule
	return added


# ── 진행 ──────────────────────────────────────────────────────

static func _results_by_id(state: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for g in state.get("schedule", []):
		var res = g.get("result", null)
		if res == null:
			continue
		out[String(g.get("id", ""))] = res
	return out


## 그 라운드 경기가 다 끝났나. **치를 경기가 하나도 없으면 아직이다**
static func _round_done(bracket: Dictionary, round: int,
		results: Dictionary) -> bool:
	var games: Array = Tournament.round_schedule(bracket, round)
	if games.is_empty():
		return false
	for g in games:
		if not results.has(String(g["id"])):
			return false
	return true


static func _winner_of(result: Dictionary) -> String:
	var loser = result.get("loser_id", null)
	# ⚠ **넉아웃에 무승부는 없다.** 그래도 결과가 그렇게 들어오면 홈이
	# 올라간다 — 아무도 안 올라가면 대진이 거기서 멈춘다
	if loser == null or String(loser).is_empty():
		return ""
	return String(result.get("winner_id", ""))


## 끝난 라운드를 올리고 다음 라운드를 일정에 꽂는다. 몇 라운드를 올렸나
static func advance(state: Dictionary, tournament_def: Dictionary,
		at_day: int = -1) -> int:
	var tid: String = String(tournament_def["id"])
	var rec: Dictionary = of(state, tid)
	if rec.is_empty() or not String(rec["champion"]).is_empty():
		return 0

	if not rec["stage"].is_empty() and not bool(rec["final_built"]):
		_try_build_final(state, tournament_def, rec)

	var bracket: Dictionary = rec["bracket"]
	if bracket.is_empty():
		return 0

	var me: String = _protagonist_team(state)
	var results: Dictionary = _results_by_id(state)
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	var names: Dictionary = state.get("team_names", {})
	var region: Array = _my_region_teams(state, String(tournament_def["league_id"]))
	var moved: int = 0

	for round in range(1, int(bracket["total_rounds"]) + 1):
		if not _round_done(bracket, round, results):
			break
		var inputs: Array = []
		for g in Tournament.round_schedule(bracket, round):
			var w: String = _winner_of(results[String(g["id"])])
			# 무승부로 들어왔으면 홈이 올라간다
			inputs.append({"match_id": String(g["id"]),
				"winner": w if not w.is_empty() else String(g["home"])})
		Tournament.advance_round(bracket, round, inputs, me)
		moved += 1
		# ⚠ **내 경기가 먼저다.** 내 팀이 그 라운드에 있으면 명단 소식은
		# 스스로 물러난다 — 둘 다 보내면 같은 라운드가 두 통이 된다
		_send(state, TournamentNews.my_round(tournament_def, bracket, round,
			me, names, day))
		_send(state, TournamentNews.round_progress(tournament_def, bracket,
			round, me, names, day, region))
		if round < int(bracket["total_rounds"]):
			_inject(state, Tournament.round_schedule(bracket, round + 1))

	var champ: String = Tournament.champion(bracket)
	if not champ.is_empty():
		_send(state, TournamentNews.champion(tournament_def, bracket, me,
			names, day))
		rec["champion"] = champ
		var log: Array = state.get(LOG_KEY, [])
		log.append({"tournament_id": tid,
			"name": String(tournament_def.get("name", "")),
			"season_year": int(state.get("season_year", 0)),
			"champion": champ,
			"protagonist_reached": _my_last_round(bracket, me)})
		state[LOG_KEY] = log
	return moved


## 예선이 다 끝났으면 본선 대진을 만든다
static func _try_build_final(state: Dictionary, tournament_def: Dictionary,
		rec: Dictionary) -> void:
	var stage: Dictionary = rec["stage"]
	var results: Dictionary = _results_by_id(state)
	var inputs: Array = []
	for m in stage["matches"]:
		var res = results.get(String(m["id"]), null)
		if res == null:
			# ⚠ **한 경기라도 남았으면 본선을 안 만든다.** 만들면 조 순위가
			# 아직 안 정해진 채로 진출팀이 정해진다
			return
		inputs.append({"match_id": String(m["id"]),
			"home_score": int(res.get("home_score", 0)),
			"away_score": int(res.get("away_score", 0))})

	Tournament.apply_group_results(stage, inputs)
	var q: Dictionary = Tournament.qualifiers(stage)
	rec["group_ranks"] = q["group_ranks"]
	rec["bracket"] = Tournament.final_bracket(tournament_def, q["qualified"],
		_protagonist_team(state), int(state.get("season_year", 0)))
	rec["final_built"] = true
	_inject(state, Tournament.round_schedule(rec["bracket"], 1))


## 주인공 팀이 몇 라운드까지 갔나. 0 = 못 나갔다
static func _my_last_round(bracket: Dictionary, me: String) -> int:
	if me.is_empty():
		return 0
	var last: int = 0
	for m in bracket.get("matches", []):
		if String(m["home"]) == me or String(m["away"]) == me:
			last = maxi(last, int(m["round"]))
	return last


# ── 하루 ──────────────────────────────────────────────────────

## 오늘 할 일. `{opened, advanced, finished}`
##
## ⚠ **날마다 부른다.** 라운드가 대회 기간에 고르게 퍼져 있어서 주 경계에서만
## 보면 뒤 라운드가 경기 날짜를 지나친 뒤에 일정에 들어간다
static func run(state: Dictionary, at_day: int = -1) -> Dictionary:
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	var week: int = Calendar.week_of(day)
	var opened: Array = []
	var advanced: int = 0
	var finished: Array = []

	# ① 이번 주에 시작하는 대회를 연다
	for league in LEAGUES:
		var d: Dictionary = Tournament.at_week(week, league)
		if d.is_empty() or not has_league(state, league):
			continue
		if of(state, String(d["id"])).is_empty():
			if not open(state, d, day).is_empty():
				opened.append(String(d["id"]))

	# ② 열려 있고 아직 안 끝난 대회를 밀어 본다.
	#
	# ⚠ **주차로 고르면 안 된다.** 결승 결과는 대회 **마지막 날**에 들어오고,
	# 그걸 반영하는 건 그 다음 호출이라 그때는 이미 기간이 지나 있다 —
	# 그러면 우승팀이 영영 안 정해진다
	for tid in all_of(state).keys():
		var rec: Dictionary = of(state, tid)
		if not String(rec.get("champion", "")).is_empty():
			continue
		var d2: Dictionary = Tournament.def_of(String(tid))
		if d2.is_empty():
			continue
		advanced += advance(state, d2, day)
		var champ: String = String(of(state, String(tid)).get("champion", ""))
		if not champ.is_empty():
			finished.append({"tournament_id": String(tid), "champion": champ})

	return {"opened": opened, "advanced": advanced, "finished": finished}
