extends RefCounted
class_name SurvivalRunner

## 독립 생존리그 배선 — 단계를 열고, 자르고, 사다리를 세운다. B-4c.
##
## 원본: `usecases/survivalLeague.ts`
##
## ⚠ **탈락은 되돌릴 수 없다.** 한 번 잘린 팀은 그 시즌이 끝난다 — 그래서
## 단계 종료 판정은 **그 단계 경기가 전부 끝난 뒤**에만 한다.


## 진행 상태가 사는 자리
const STATE_KEY: String = "survival"
## 단계·사다리 기록
const LOG_KEY: String = "survival_log"


static func of(state: Dictionary) -> Dictionary:
	return state.get(STATE_KEY, {})


static func _put(state: Dictionary, rec: Dictionary) -> void:
	state[STATE_KEY] = rec


## 아직 시작 전 상태. `stage 0`
static func blank(state: Dictionary) -> Dictionary:
	var teams: Array = []
	for t in World.teams_of(Survival.league_id()):
		teams.append(String(t["id"]))
	teams.sort()
	return {"league_id": Survival.league_id(), "stage": 0,
		"active_teams": teams, "eliminated": {}, "final_ranking": [],
		"ladder": []}


static func _protagonist_team(state: Dictionary) -> String:
	return String(state.get("protagonist", {}).get("team_id", ""))


## 이 세이브에 독립 리그가 있나 — 팀 목록은 데이터 파일에서 오므로
## 세계를 안 만든 상태에서도 10팀이 나온다
static func has_league(state: Dictionary) -> bool:
	var rosters: Dictionary = state.get("world", {}).get("rosters", {})
	for t in World.teams_of(Survival.league_id()):
		if rosters.has(String(t["id"])):
			return true
	return false


# ── 단계 열기 ─────────────────────────────────────────────────

## 그 단계를 연다. 이미 그 단계면 0
static func open_stage(state: Dictionary, stage: int) -> int:
	var rec: Dictionary = of(state)
	if rec.is_empty():
		rec = blank(state)
	if int(rec["stage"]) >= stage:
		return 0

	# 위 가드가 **새 단계일 때만** 여기 오게 한다 — 같은 경기가 두 번 꽂힐
	# 일이 없으므로 중복 검사를 두지 않는다
	var games: Array = Survival.stage_schedule(stage, rec["active_teams"],
		int(state.get("season_year", 0)), _protagonist_team(state))
	var schedule: Array = state.get("schedule", [])
	schedule.append_array(games)
	state["schedule"] = schedule

	rec["stage"] = stage
	_put(state, rec)
	return games.size()


# ── 단계 자르기 ───────────────────────────────────────────────

## 그 단계 경기가 다 끝났나. **치를 경기가 없으면 아직이다**
static func stage_complete(state: Dictionary, stage: int) -> bool:
	var prefix: String = Survival.match_prefix(stage)
	var found: bool = false
	for g in state.get("schedule", []):
		if not String(g.get("id", "")).begins_with(prefix):
			continue
		found = true
		if g.get("result", null) == null:
			return false
	return found


## 단계를 끝내고 자른다. 자른 팀 수
static func cut(state: Dictionary, stage: int) -> int:
	var rec: Dictionary = of(state)
	if rec.is_empty():
		return 0
	var d: Dictionary = Survival.stage_def(stage)
	if d.is_empty():
		return 0
	# 이미 자른 단계면 다시 안 자른다 — 자르면 살아남은 팀이 또 줄어든다
	if rec["eliminated"].has(str(stage)):
		return 0

	var standings: Array = Survival.stage_standings(stage, rec["active_teams"],
		state.get("schedule", []))
	var out: Dictionary = Survival.cutoff(standings, int(d["advance_count"]))

	rec["active_teams"] = out["survivors"]
	rec["eliminated"][str(stage)] = out["eliminated"]
	# 마지막 정규 단계면 그 순위가 곧 최종 정규 순위다
	if stage == Survival.last_regular_stage():
		rec["final_ranking"] = out["ranked"]
	_put(state, rec)

	var log: Array = state.get(LOG_KEY, [])
	log.append({"stage": stage, "name": String(d["name"]),
		"season_year": int(state.get("season_year", 0)),
		"survivors": out["survivors"], "eliminated": out["eliminated"]})
	state[LOG_KEY] = log
	return (out["eliminated"] as Array).size()


# ── 사다리 ────────────────────────────────────────────────────

## 3차가 끝나면 4차 사다리를 세운다
static func build_ladder(state: Dictionary) -> int:
	var rec: Dictionary = of(state)
	if rec.is_empty() or not (rec["ladder"] as Array).is_empty():
		return 0
	# 최종 순위가 없으면 `build_ladder`가 빈 배열을 준다 — 따로 막지 않는다
	rec["ladder"] = Survival.build_ladder(rec["final_ranking"])
	_put(state, rec)
	return (rec["ladder"] as Array).size()


## 사다리 우승팀. 아직이면 빈 문자열
static func champion(state: Dictionary) -> String:
	return Bracket.champion(of(state).get("ladder", []))


# ── 하루 ──────────────────────────────────────────────────────

## 오늘 할 일. `{opened, cut, ladder}`
static func run(state: Dictionary, at_day: int = -1) -> Dictionary:
	if not has_league(state):
		return {"opened": 0, "cut": 0, "ladder": 0}

	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	var week: int = Calendar.week_of(day)
	var cut_count: int = 0

	# ① **자르는 게 먼저다.** 다음 단계는 생존팀으로 짜야 하는데, 여는 걸
	# 먼저 하면 아직 안 잘린 명단으로 짠다 — 여러 날을 한 번에 넘겨서 단계
	# 마감과 다음 단계 시작이 같은 호출에 걸리면 실제로 그렇게 된다.
	#
	# ⚠ **주차로 고르지 않는다.** 마지막 경기 결과는 단계 마지막 날에
	# 들어오고 그걸 보는 건 그 다음 호출이라 그때는 기간 밖이다 —
	# 대회 배선이 겪은 것과 같은 자리다
	#
	# 앞 단계를 되짚지 않는다 — 자르기가 여는 것보다 먼저라 앞 단계는
	# 다음 단계가 열리기 전에 이미 잘려 있다
	var rec: Dictionary = of(state)
	if not rec.is_empty():
		var cur: int = int(rec["stage"])
		if stage_complete(state, cur):
			cut_count += cut(state, cur)

	# ② 이번 주에 시작하는 단계
	var opened: int = 0
	var starting: int = Survival.stage_starting_at(week)
	if starting > 0:
		opened = open_stage(state, starting)

	# ③ 3차가 끝났으면 사다리
	return {"opened": opened, "cut": cut_count, "ladder": build_ladder(state)}
