extends RefCounted
class_name World

## 세계 조립 — M8-3.
##
## 원본: `refs.json`(팀 238·리그 6) · `ensureLeagueActivatedV3` ·
##       `generation_rules.json`의 `rosterRules`
##
## ⚠ **02는 리그를 게을리 켰다.** 그래서 확장팩 게이트를 열어도 **선수 0명인
## 리그에 일정만 1,740경기 깔렸다**(실측 ABL 1,080 · JBL 660, 2시즌을 굴려도
## 인원 0·결과 0). **게이트를 연다고 도는 게 아니다.**
##
## 우리는 해외까지 매일 풀 시뮬한다(사용자 결정). 그래서 처음에 전부 만든다 —
## 게을리 켜는 경로 자체를 안 만들면 그 결함이 구조적으로 안 생긴다.
##
## ⚠ **팀 정의는 데이터다.** `data/teams.json`이 정본이고 여기선 읽기만 한다 —
## 02의 데이터 정책과 같다(정의는 git에, 상태는 세이브에, 파생은 저장 안 함).


const TEAMS_PATH := "res://data/teams.json"

## 2군 id 규칙. **1군에서 파생한다** — 02가 `_2` 접미사였고, 그게 없어서
## 해외 팜 로스터가 0명이었다
const FARM_SUFFIX := "_2"

## 리그별 생성 규칙. `generation_rules.json`의 `rosterRules` 값 그대로다.
##
## ⚠ **리그마다 대역이 달라야 승격·강등이 뜻을 갖는다.** 같으면 어느 리그에
## 있든 같은 선수라 올라갈 이유가 없다
## ⚠ **무학년 리그는 `age`가 범위다.** 한 값으로 두면 **프로가 전원 동갑**이
## 되고, 노화·은퇴·세대교체가 전부 같은 해에 뭉텅이로 온다 — 실측에서
## 30세 이상이 **0명**이었고 은퇴가 9년 뒤에 갑자기 시작했다.
## 값은 02 `generation_rules.json`의 `ageMin`/`ageMax` 그대로다
const RULES: Dictionary = {
	# ⚠ **학년제 리그는 `grade_max`·`age_base`를 준다.** 02 값 그대로 —
	# 학년을 안 흩으면 세계가 전원 1학년으로 시작해 3년간 졸업생이 0명이다
	"LEAGUE_HIGHSCHOOL": {"size": 30, "ovr": [45.0, 70.0], "dev": [45.0, 75.0], "age": [16, 16], "grade": 1, "grade_max": 3, "age_base": 16},
	"LEAGUE_UNIVERSITY": {"size": 32, "ovr": [52.0, 76.0], "dev": [45.0, 72.0], "age": [19, 19], "grade": 1, "grade_max": 4, "age_base": 19},
	"LEAGUE_INDEPENDENT": {"size": 30, "ovr": [50.0, 74.0], "dev": [40.0, 70.0], "age": [20, 31], "grade": 0},
	"LEAGUE_KBL": {"size": 30, "ovr": [58.0, 84.0], "dev": [40.0, 70.0], "age": [20, 37], "grade": 0},
	"LEAGUE_KBL_FARM": {"size": 34, "ovr": [48.0, 76.0], "dev": [50.0, 80.0], "age": [20, 29], "grade": 0},
	"LEAGUE_ABL": {"size": 28, "ovr": [62.0, 92.0], "dev": [40.0, 70.0], "age": [21, 38], "grade": 0},
	"LEAGUE_ABL_FARM": {"size": 34, "ovr": [50.0, 80.0], "dev": [40.0, 70.0], "age": [21, 38], "grade": 0},
	"LEAGUE_JBL": {"size": 28, "ovr": [60.0, 90.0], "dev": [40.0, 70.0], "age": [20, 37], "grade": 0},
	"LEAGUE_JBL_FARM": {"size": 34, "ovr": [48.0, 78.0], "dev": [40.0, 70.0], "age": [20, 37], "grade": 0},
}

## 파일을 한 번만 읽는다 — 238팀을 매 호출마다 파싱하면 검사가 기어간다
static var _teams_cache: Dictionary = {}


static func _load() -> Dictionary:
	if not _teams_cache.is_empty():
		return _teams_cache
	var f := FileAccess.open(TEAMS_PATH, FileAccess.READ)
	if f == null:
		push_error("팀 정의를 못 읽었다: %s" % TEAMS_PATH)
		return {"teams": [], "leagues": []}
	var parsed = JSON.parse_string(f.get_as_text())
	_teams_cache = parsed if parsed is Dictionary else {"teams": [], "leagues": []}
	return _teams_cache


## 팀 정의의 한 항목. **2군은 1군 것을 본다** — 같은 구단이라 구장이 같고,
## 데이터엔 1군만 있어서 안 그러면 2군 경기가 통째로 기본값으로 떨어진다
static func team_field(_world: Dictionary, team_id: String, key: String,
		fallback = null):
	var id: String = team_id.trim_suffix(FARM_SUFFIX)
	for t in _load().get("teams", []):
		if t.get("id", "") == id:
			return t.get(key, fallback)
	return fallback


## 그 리그의 팀들. **2군은 1군에서 파생한다** — 데이터엔 1군만 있다
static func teams_of(league_id: String) -> Array:
	if league_id.ends_with("_FARM"):
		var parent: String = league_id.trim_suffix("_FARM")
		var out: Array = []
		for t in teams_of(parent):
			out.append({
				"id": String(t["id"]) + FARM_SUFFIX,
				"name": "%s 2군" % t["name"],
				"league_id": league_id,
				"parent_id": t["id"],
			})
		return out

	var teams: Array = []
	for t in _load().get("teams", []):
		if t.get("league_id", "") == league_id:
			teams.append(t)

	# ⚠ **KBL 데이터엔 1·2군이 섞여 있다**(20팀). `_2`로 끝나는 것을 걸러
	# 1군만 남긴다 — 그러면 2군은 위 파생 규칙 하나로 통일된다
	var first: Array = []
	for t in teams:
		if not String(t["id"]).ends_with(FARM_SUFFIX):
			first.append(t)
	return first


static func rules_of(league_id: String) -> Dictionary:
	return RULES.get(league_id, RULES["LEAGUE_HIGHSCHOOL"])


## 세계를 만든다. **전부 한 번에** — 게을리 켜는 경로를 안 만든다
static func build(p: Dictionary) -> Dictionary:
	var seed_value: int = p.get("seed", 0)
	var year: int = p.get("season_year", 2026)

	var rosters: Dictionary = {}
	for lid in Schedule.LEAGUES:
		var r: Dictionary = rules_of(lid)
		for t in teams_of(lid):
			var tid: String = t["id"]
			rosters[tid] = PlayerGen.roster({
				"team_id": tid,
				# ⚠ **씨앗을 팀 id와 섞는다.** 세계 씨앗만 쓰면 모든 팀이
				# 같은 로스터가 되고, 팀 id만 쓰면 씨앗을 바꿔도 세계가 같다
				"school_id": "%s_%d" % [tid, seed_value],
				"season_year": year,
				"league_id": lid,
				"count": int(r["size"]),
				"pitching_ovr_min": r["ovr"][0], "pitching_ovr_max": r["ovr"][1],
				"batting_ovr_min": r["ovr"][0], "batting_ovr_max": r["ovr"][1],
				"dev_rate_min": r["dev"][0], "dev_rate_max": r["dev"][1],
				"age_min": r["age"][0], "age_max": r["age"][1],
				"grade": r["grade"],
				"grade_max": r.get("grade_max", 0), "age_base": r.get("age_base", 0),
			})

	return {"seed": seed_value, "season_year": year, "rosters": rosters}


## 일정에 **주인공 등판**을 표시한다. 로테이션이 정하고, 팀 경기 순번으로 돈다.
##
## ⚠ **일정이 날짜 순이어야 한다.** 아니면 경기 순번이 뒤죽박죽이 되어
## 로테이션이 무의미해진다
static func mark_my_starts(schedule: Array, world: Dictionary,
		my_id: String, my_team: String, seed_value: int = 0,
		role: String = "RP") -> void:
	var n: int = 0
	for g in schedule:
		if g.get("home", "") != my_team and g.get("away", "") != my_team:
			continue
		g["is_protagonist_game"] = MatchDay.is_my_start(world, g, my_id, my_team,
			n, seed_value, role)
		n += 1


static func roster_of(world: Dictionary, team_id: String) -> Array:
	return world.get("rosters", {}).get(team_id, [])


static func all_players(world: Dictionary) -> Array:
	var out: Array = []
	for tid in world.get("rosters", {}):
		for p in world["rosters"][tid]:
			out.append(p["id"])
	return out


## 팀 id → 이름. 화면이 상대를 이름으로 보여주려면 필요하다
static func team_names() -> Dictionary:
	var out: Dictionary = {}
	for lid in Schedule.LEAGUES:
		for t in teams_of(lid):
			out[t["id"]] = t["name"]
	return out


## 한 해 일정.
##
## ⚠ **리그마다 짜서 합친다.** 통째로 부르면 조용히 빈 배열이 나온다.
##
## ⚠ **새 게임과 롤오버가 같은 함수를 쓴다.** 02는 시즌마다 일정을 짜는
## 자리가 따로 있었고, 그래서 해가 바뀔 때만 나오는 어긋남이 생겼다
static func build_schedule(world: Dictionary, year: int, me: Dictionary,
		team_id: String, seed_value: int) -> Array:
	var schedule: Array = []
	for lid in Schedule.LEAGUES:
		# ⚠ **독립은 여기서 안 짠다.** 4단계 생존리그라 다음 단계 참가팀이
		# 이전 단계 결과에 달려 있다 — `SurvivalRunner`가 단계마다 짠다
		if lid == Survival.league_id():
			continue
		var ids: Array = []
		for t in teams_of(lid):
			ids.append(t["id"])
		for g in Schedule.build_league(lid, ids, year):
			# ⚠ **연도를 id에 넣는다.** 안 넣으면 다음 해 일정이 같은 id를
			# 갖고, 소식·기록이 옛 경기와 겹친다
			g["id"] = "%s_Y%d_D%d_%s_%s" % [lid, year, g["day"], g["home"], g["away"]]
			g["result"] = null
			g["is_protagonist_game"] = false
			schedule.append(g)

	# ⚠ **팀 경기가 곧 내 등판이 아니다.** 로테이션이 정한다 — 안 걸면
	# 고교 20경기를 전부 던지게 되고, 그러면 피로·성장·기록이 전부 부푼다.
	#
	# 날짜 순으로 훑으며 내 팀의 몇 번째 경기인지 센다
	schedule.sort_custom(func(a, b) -> bool: return int(a["day"]) < int(b["day"]))
	mark_my_starts(schedule, world, me.get("id", ""), team_id, seed_value,
		me.get("role", "RP"))
	return schedule


## 새 게임 상태 하나. **세계·주인공·일정이 같이 온다** —
## 02는 리그를 게을리 켜서 셋이 어긋나는 순간이 있었다
static func new_game(p: Dictionary) -> Dictionary:
	var seed_value: int = p.get("seed", 0)
	var year: int = p.get("season_year", 2026)
	var team_id: String = p.get("team_id", "")
	var league_id: String = p.get("league_id", "LEAGUE_HIGHSCHOOL")

	var world: Dictionary = build({"seed": seed_value, "season_year": year})

	# ⚠ **주인공을 세계 안에 넣는다.** 02는 따로 들었고, 그래서 주인공 팀의
	# 로스터에 주인공이 없는 순간이 있었다
	var r: Dictionary = rules_of(league_id)
	var me: Dictionary = PlayerGen.roster({
		"team_id": team_id, "school_id": "PROTAGONIST_%d" % seed_value,
		"season_year": year, "league_id": league_id, "count": 1,
		"pitcher_ratio": 1.0,
		"pitching_ovr_min": r["ovr"][0], "pitching_ovr_max": r["ovr"][1],
		"batting_ovr_min": r["ovr"][0], "batting_ovr_max": r["ovr"][1],
		"dev_rate_min": r["dev"][0], "dev_rate_max": r["dev"][1],
		# ⚠ **주인공은 1학년으로 시작한다.** 학년제 배분을 넘기면 첫 게임부터
		# 3학년일 수 있고, 그러면 육성할 시간이 없다
		"age": int(r.get("age_base", r["age"][0])) + 1, "grade": 1,
	})[0]
	me["id"] = "PLY_PROTAGONIST"
	me["name"] = p.get("name", me["name"])
	me["is_protagonist"] = true
	me["fatigue"] = 0.0
	me["condition"] = 100.0
	me["injury"] = null
	me["eligibility_blocked"] = false
	me["retired"] = false
	# ⚠ **직구 하나로 시작한다.** 02 그대로 — 나머지는 훈련으로 배운다.
	# 숙련도 3이 `PitchStep`의 기준값과 같아서, 시작 시점의 경기 결과는
	# 배선 전과 똑같다. 훈련으로 4·5를 올릴 때 비로소 달라진다
	me["pitches"] = [{"id": "fastball", "grade": 3}]

	if world["rosters"].has(team_id):
		world["rosters"][team_id].append(me)

	# ⚠ **보직을 정한다.** 팀에서 나보다 센 투수가 둘 이하면 선발이다 —
	# 로테이션 인원(고교 3인)과 맞물린 규칙이라 어긋나면 선발로 배정됐는데
	# 로테이션엔 못 드는 선수가 생긴다
	var team_ovrs: Array = []
	for q in roster_of(world, team_id):
		if q.get("id", "") != me["id"] and PlayerGen.is_pitcher(q.get("position", "")):
			team_ovrs.append(q["pitching"]["ovr"])
	me["role"] = Rotation.assign_position(me["pitching"]["ovr"], team_ovrs)
	me["position"] = me["role"]

	var names: Dictionary = team_names()
	me["team_name"] = names.get(team_id, team_id)

	var schedule: Array = build_schedule(world, year, me, team_id, seed_value)

	var state: Dictionary = {
		"day": 1,
		"season_days": Calendar.DAYS_PER_SEASON,
		"season_year": year,
		"seed": seed_value,
		"protagonist": me,
		"world": world,
		"schedule": schedule,
		"team_names": names,
		"pending": [],
		"mailbox": [],
	}

	# ⚠ **첫날부터 감독이 있어야 한다.** 시즌이 바뀔 때만 세우면 1년차
	# 내내 관계도가 팀동료만 돈다 — 고교 3년이 통째로 그 상태가 된다
	Staff.ensure_world(state)
	return state
