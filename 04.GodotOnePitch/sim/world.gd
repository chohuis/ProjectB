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
const RULES: Dictionary = {
	"LEAGUE_HIGHSCHOOL": {"size": 30, "ovr": [45.0, 70.0], "dev": [45.0, 75.0], "age": 16, "grade": 1},
	"LEAGUE_UNIVERSITY": {"size": 32, "ovr": [52.0, 76.0], "dev": [45.0, 72.0], "age": 19, "grade": 1},
	"LEAGUE_INDEPENDENT": {"size": 30, "ovr": [50.0, 74.0], "dev": [40.0, 70.0], "age": 24, "grade": 0},
	"LEAGUE_KBL": {"size": 30, "ovr": [58.0, 84.0], "dev": [40.0, 70.0], "age": 26, "grade": 0},
	"LEAGUE_KBL_FARM": {"size": 34, "ovr": [48.0, 76.0], "dev": [50.0, 80.0], "age": 23, "grade": 0},
	"LEAGUE_ABL": {"size": 28, "ovr": [62.0, 92.0], "dev": [40.0, 70.0], "age": 27, "grade": 0},
	"LEAGUE_ABL_FARM": {"size": 34, "ovr": [50.0, 80.0], "dev": [40.0, 70.0], "age": 24, "grade": 0},
	"LEAGUE_JBL": {"size": 28, "ovr": [60.0, 90.0], "dev": [40.0, 70.0], "age": 26, "grade": 0},
	"LEAGUE_JBL_FARM": {"size": 34, "ovr": [48.0, 78.0], "dev": [40.0, 70.0], "age": 23, "grade": 0},
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
				"age": r["age"], "grade": r["grade"],
			})

	return {"seed": seed_value, "season_year": year, "rosters": rosters}


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
		"age": r["age"], "grade": r["grade"],
	})[0]
	me["id"] = "PLY_PROTAGONIST"
	me["name"] = p.get("name", me["name"])
	me["is_protagonist"] = true
	me["fatigue"] = 0.0
	me["condition"] = 100.0
	me["injury"] = null
	me["eligibility_blocked"] = false
	me["retired"] = false

	if world["rosters"].has(team_id):
		world["rosters"][team_id].append(me)

	var names: Dictionary = team_names()
	me["team_name"] = names.get(team_id, team_id)

	# 일정 — **리그마다 짜서 합친다.** 통째로 부르면 조용히 빈 배열이 나온다
	var schedule: Array = []
	for lid in Schedule.LEAGUES:
		var ids: Array = []
		for t in teams_of(lid):
			ids.append(t["id"])
		for g in Schedule.build_league(lid, ids, year):
			g["id"] = "%s_D%d_%s_%s" % [lid, g["day"], g["home"], g["away"]]
			g["is_protagonist_game"] = (g["home"] == team_id or g["away"] == team_id)
			g["result"] = null
			schedule.append(g)

	return {
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
