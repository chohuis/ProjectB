extends RefCounted
class_name Schedule

## 일정 — 실제 리그 일정으로 날짜에 경기를 배정한다. D2.
##
## 원본: `packages/engine-native/src/schedule_engine.rs` · `leagueScheduler.ts`
##
## ⚠ **팀별 경기 수는 02 그대로다.** 기간만 실제 리그에 맞게 압축한다.
## 경기 수가 바뀌면 밸런스가 조용히 바뀌고, 02 실측값(리그 ERA 4점대 ·
## 수상 자격선 · 드래프트 앵커)과 대조가 안 된다.
##
## ⚠ **02는 프로를 1~50주에 펴놨다** (주 2.9경기). 실제 KBO는 24주에 몰아서
## 주 6경기다. 일 단위로 진행하면 그 차이가 그대로 체감된다 — 주 단위였을
## 땐 한 번에 여러 경기가 한꺼번에 끝나서 자기 등판을 고를 수가 없었다.
##
## 요일: 0 = 일 … 6 = 토


## 화~일 (월요일 휴식) — KBO·NPB·MLB가 그렇다
const WEEKDAYS_PRO: Array[int] = [2, 3, 4, 5, 6, 0]
const WEEKDAYS_WEEKEND: Array[int] = [6, 0]
const WEEKDAYS_UNIV: Array[int] = [2, 3, 4, 5]
const WEEKDAYS_IND: Array[int] = [2, 5]

## 리그 정의. `start_day`·`end_day`는 시즌 일차(1 = 3월 1일)다.
##
## ⚠ **기간은 경기 수를 담을 만큼 넓어야 한다.** 모자라면 경기가 잘려나가고
## 팀별 경기 수가 어긋난다 — 검사가 그걸 먼저 본다
const LEAGUES: Dictionary = {
	# 프로 1군 — 3월 말 개막
	"LEAGUE_KBL": {
		"games_per_team": 144, "start_day": 22, "end_day": 190, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_ABL": {
		"games_per_team": 135, "start_day": 22, "end_day": 204, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_JBL": {
		"games_per_team": 110, "start_day": 22, "end_day": 176, "weekdays": WEEKDAYS_PRO,
	},
	# 프로 2군 — 1군보다 조금 이르게 시작하고 늦게 끝난다
	"LEAGUE_KBL_FARM": {
		"games_per_team": 99, "start_day": 15, "end_day": 190, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_ABL_FARM": {
		"games_per_team": 165, "start_day": 15, "end_day": 218, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_JBL_FARM": {
		"games_per_team": 121, "start_day": 15, "end_day": 190, "weekdays": WEEKDAYS_PRO,
	},
	# 고교 주말리그
	"LEAGUE_HIGHSCHOOL": {
		"games_per_team": 20, "start_day": 64, "end_day": 204, "weekdays": WEEKDAYS_WEEKEND,
	},
	# 대학 — 권역별 화~금
	"LEAGUE_UNIVERSITY": {
		"games_per_team": 9, "start_day": 22, "end_day": 92, "weekdays": WEEKDAYS_UNIV,
	},
	# 독립 — 생존 리그
	"LEAGUE_INDEPENDENT": {
		"games_per_team": 30, "start_day": 64, "end_day": 176, "weekdays": WEEKDAYS_IND,
	},
}


## 그 기간에서 경기를 치를 수 있는 날들 (시즌 일차)
static func playable_days(season_year: int, start_day: int, end_day: int, weekdays: Array) -> Array:
	var out: Array = []
	for d in range(start_day, end_day + 1):
		if weekdays.has(Calendar.weekday(season_year, d)):
			out.append(d)
	return out


## 라운드 로빈 — 한 바퀴에 모든 짝이 정확히 한 번 만난다.
##
## 한 라운드는 모든 팀이 한 경기씩 하는 묶음이다.
##
## ⚠ **홀수면 매 라운드 한 팀이 쉰다.** 억지로 짝지으면 자기 자신과 붙는다
static func round_robin(teams: Array) -> Array:
	var list: Array = teams.duplicate()
	# 홀수면 허수 하나를 넣고, 그와 짝지어진 팀은 그 라운드를 쉰다
	var has_bye: bool = list.size() % 2 == 1
	if has_bye:
		list.append("")
	var n: int = list.size()
	if n < 2:
		return []

	var fixed: String = list[n - 1]
	var rot: Array = list.slice(0, n - 1)
	var rounds: Array = []

	for r in n - 1:
		var pairs: Array = []
		# 허수는 늘 고정 자리에 있다(끝에 붙였다). 그 자리와 짝지어진 팀이
		# 그 라운드를 쉰다 — 안쪽 짝들은 전부 실제 팀이다
		var a: String = rot[r % rot.size()]
		if not fixed.is_empty():
			pairs.append([a, fixed])
		for i in range(1, n / 2):
			pairs.append([rot[(r + i) % rot.size()],
				rot[(r - i + rot.size() * 2) % rot.size()]])
		rounds.append(pairs)
	return rounds


## 한 리그의 시즌 일정. `[{league_id, day, home, away}]`
##
## ⚠ **기간이 모자라면 빈 배열을 낸다.** 조용히 잘라내면 팀별 경기 수가
## 어긋나고 그게 밸런스를 바꾼다
static func build(p: Dictionary) -> Array:
	var teams: Array = p.get("teams", [])
	var target: int = p.get("games_per_team", 0)
	if teams.size() < 2 or target <= 0:
		return []

	var days: Array = playable_days(p.get("season_year", 2026),
		p.get("start_day", 1), p.get("end_day", 1), p.get("weekdays", []))
	# 한 라운드가 하루다 — 한 팀이 하루에 두 경기를 하면 피로가 두 배로 쌓이고
	# 로테이션이 어긋난다
	if days.size() < target:
		push_error("[%s] 기간이 모자라다 — 경기일 %d < 목표 %d"
			% [p.get("league_id", ""), days.size(), target])
		return []

	var base: Array = round_robin(teams)
	if base.is_empty():
		return []

	var out: Array = []
	for r in target:
		var round_pairs: Array = base[r % base.size()]
		# 한 바퀴 돌 때마다 홈·원정을 뒤집는다 — 안 그러면 홈 이점이 한쪽에만 간다
		var flip: bool = (r / base.size()) % 2 == 1
		# 라운드를 기간 전체에 고르게 편다
		var day: int = days[r * days.size() / target]
		for pair in round_pairs:
			out.append({
				"league_id": p.get("league_id", ""),
				"day": day,
				"home": pair[1] if flip else pair[0],
				"away": pair[0] if flip else pair[1],
			})
	return out


## 리그 정의표대로 짠다. `teams`는 호출부가 넘긴다
static func build_league(league_id: String, teams: Array, season_year: int) -> Array:
	if not LEAGUES.has(league_id):
		push_error("모르는 리그: %s" % league_id)
		return []
	var d: Dictionary = LEAGUES[league_id]
	return build({
		"league_id": league_id, "teams": teams, "season_year": season_year,
		"games_per_team": d["games_per_team"],
		"start_day": d["start_day"], "end_day": d["end_day"], "weekdays": d["weekdays"],
	})
