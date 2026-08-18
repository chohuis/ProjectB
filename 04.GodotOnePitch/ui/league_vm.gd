extends RefCounted
class_name LeagueVm

## 리그 탭 ViewModel — M7-6b.
##
## 원본: `pages/league/LeaguePage.svelte`
##
## ⚠ **일정에서 매번 다시 센다.** 순위표를 상태에 따로 들고 있으면 경기
## 결과와 어긋나는 순간이 오고, 어느 쪽이 맞는지 알 방법이 없다 — 02가
## 그랬고 화면마다 다른 순위가 떴다.
##
## 다시 세는 값은 실측으로 정한다: 프로 한 시즌 720경기를 훑는 데 드는
## 시간이 화면 한 프레임보다 훨씬 짧다.
##
## ⚠ **순위표를 화면이 만들지 않는다.** 02 결함의 뿌리가 그것이다.


## 화면에 뜨는 리그. **팜은 안 보여준다** — 순위를 볼 이유가 없고,
## 목록이 두 배가 되면 고르기 어려워진다
const LEAGUE_LABELS: Dictionary = {
	"LEAGUE_KBL": "KBL",
	"LEAGUE_ABL": "ABL",
	"LEAGUE_JBL": "JBL",
	"LEAGUE_HIGHSCHOOL": "고교",
	"LEAGUE_UNIVERSITY": "대학",
	"LEAGUE_INDEPENDENT": "독립",
}


static func build(s: Dictionary) -> Dictionary:
	var p: Dictionary = s.get("protagonist", {})
	var league_id: String = s.get("league_tab",
		p.get("league_id", "LEAGUE_HIGHSCHOOL"))
	var my_team: String = p.get("team_id", "")
	var names: Dictionary = s.get("team_names", {})

	# ⚠ **순위 계산은 `Standings`가 갖는다.** 여기 있으면 시뮬 쪽에서
	# 최종 순위를 알 방법이 없다 — 구단 성향 갱신이 그걸 입력으로 쓴다.
	# 화면은 이름과 "내 팀"만 얹는다
	var rows: Array = Standings.from_schedule(s.get("schedule", []), league_id)
	for r in rows:
		r["name"] = names.get(r["team_id"], r["team_id"])
		r["is_mine"] = r["team_id"] == my_team
		# 팀 마크 — 화면이 색을 고르지 않게 사전으로 준다 (U-1)
		r["mark"] = TeamMarkVm.build(String(r["team_id"]))

	var leagues: Array = []
	for lid in LEAGUE_LABELS:
		leagues.append({"id": lid, "label": LEAGUE_LABELS[lid]})

	return {
		"league_id": league_id,
		"league_label": LEAGUE_LABELS.get(league_id, league_id),
		"leagues": leagues,
		"rows": rows,
		"leaderboard": _leaderboard(s, league_id),
		"postseason": _postseason(s, league_id),
		"tournaments": _tournaments(s),
		"live_tournaments": _live_tournaments(s),
	}


## 스탯 순위 — 02 `LeaguePage`의 두 번째 탭.
##
## 🔴 **`sim/leaderboard.gd` 147줄을 아무도 안 불렀다.** 부문 표 스무 개,
## 규정이닝·규정타석 자격, 서식까지 다 있는데 화면이 하나도 안 썼다 —
## 게임을 아무리 굴려도 리그 1위가 누구인지 볼 수 없었다.
## **형태 ②를 일곱 번째로 만난 자리다.**
##
## ⚠ **자격을 같이 적는다.** 비율 부문(평균자책점·타율)은 규정 이닝·타석을
## 넘은 선수만 낀다 — 안 적으면 "1이닝 던진 신인이 방어율 0.00 1위"로 보이고
## 그게 빠진 이유를 설명할 방법이 없다
const STAT_SIDES: Array[Dictionary] = [
	{"id": "pitcher", "label": "투수"}, {"id": "batter", "label": "타자"},
]

## 한 부문에 몇 명까지 — 02는 표 전체를 스크롤하지만 04는 카드다
const STAT_ROWS: int = 10

## 대회 기록을 몇 줄까지 — 최근 것부터
const TOURNAMENT_ROWS: int = 8


## 그 리그 선수들의 시즌 성적. **로스터에서 리그를 가른다** —
## `season_stats`엔 리그가 없다
static func _stat_pool(s: Dictionary, league_id: String, side: String) -> Array:
	var stats: Dictionary = s.get("season_stats", {})
	if stats.is_empty():
		return []
	var world: Dictionary = s.get("world", {})
	var my_id: String = String(s.get("protagonist", {}).get("id", ""))
	var names: Dictionary = s.get("team_names", {})

	# 자격선은 그 리그가 몇 경기를 치렀나로 정한다
	var played: int = 0
	for g in s.get("schedule", []):
		if String(g.get("league_id", "")) == league_id \
				and not (g.get("result", null) == null):
			played += 1
	var teams: Array = World.teams_of(league_id)
	var per_team: int = int(roundf(float(played) / maxf(float(teams.size()), 1.0) * 2.0))
	var q: Dictionary = Leaderboard.qualification_of(per_team)

	var out: Array = []
	for t in teams:
		var team_id: String = String(t["id"])
		for player in World.roster_of(world, team_id):
			var pid: String = String(player.get("id", ""))
			var st: Dictionary = stats.get(pid, {})
			if st.is_empty() or String(st.get("type", "")) != side:
				continue
			out.append({
				"id": pid,
				"name": String(player.get("name", pid)),
				"team": String(names.get(team_id, team_id)),
				"stats": st,
				"qualified": Leaderboard.qualifies(st, q),
				"is_mine": pid == my_id,
			})
	return out


## 스탯 순위 한 부문
static func _leaderboard(s: Dictionary, league_id: String) -> Dictionary:
	var side: String = String(s.get("league_stat_side", "pitcher"))
	var cats: Array = Leaderboard.card_categories_for(side)
	var key: String = String(s.get("league_stat_key", ""))
	var cat: Dictionary = Leaderboard.category_by_key(key)
	if cat.is_empty() or String(cat.get("side", "")) != side:
		cat = cats[0] if not cats.is_empty() else {}

	var cat_list: Array = []
	for c in cats:
		cat_list.append({"key": String(c["key"]), "label": String(c["label"])})

	var rows: Array = []
	if not cat.is_empty():
		var ranked: Array = Leaderboard.rank_by(
			_stat_pool(s, league_id, side), cat, STAT_ROWS)
		for i in ranked.size():
			var r: Dictionary = ranked[i]
			rows.append({
				"rank": i + 1,
				"name": String(r["name"]),
				"team": String(r["team"]),
				"value": Leaderboard.format_value(cat,
					float(r["stats"].get(String(cat["field"]), 0.0))),
				"is_mine": bool(r["is_mine"]),
			})

	return {
		"sides": STAT_SIDES,
		"side": side,
		"categories": cat_list,
		"key": String(cat.get("key", "")),
		"label": String(cat.get("label", "")),
		"rows": rows,
		# ⚠ **왜 비었는지 말한다** — 시즌 첫 주엔 아무 기록도 없다
		"empty_note": "아직 기록이 없습니다" if rows.is_empty() else "",
		"note": "비율 부문은 규정 이닝·타석을 넘은 선수만 듭니다" \
			if String(cat.get("kind", "")) == "rate" else "",
	}


## 포스트시즌 — 02 `LeaguePage`의 네 번째 탭.
##
## 🔴 **`Postseason.run_background`가 시즌말마다 도는데 화면이 없었다.**
## `state["postseason"]`에 리그별 대진이 쌓이고 `Bracket.to_rounds`가
## **화면용 모양까지 내주는데 아무도 안 불렀다**(형태 ③).
##
## ⚠ **끝난 시리즈만 결과를 적는다.** 진행 전이면 "대기"라고 적는다 —
## 0-0으로 찍으면 이미 진 것처럼 보인다
static func _postseason(s: Dictionary, league_id: String) -> Dictionary:
	var all: Dictionary = s.get("postseason", {})
	var series: Array = all.get(league_id, [])
	if series.is_empty():
		return {"has": false, "note": "아직 포스트시즌이 없습니다", "rounds": []}

	var names: Dictionary = s.get("team_names", {})
	var my_team: String = String(s.get("protagonist", {}).get("team_id", ""))
	var rounds: Array = []
	for r in Bracket.to_rounds(series):
		var rows: Array = []
		for x in r["series"]:
			var home: String = String(x.get("home_team_id", ""))
			var away: String = String(x.get("away_team_id", ""))
			var state_id: String = Bracket.series_state(x)
			var right: String = "대기"
			if state_id != "waiting":
				right = "%d - %d" % [int(x.get("home_wins", 0)),
					int(x.get("away_wins", 0))]
			rows.append({
				"label": "%s  vs  %s" % [String(names.get(home, home)),
					String(names.get(away, away))],
				"value": right,
				"note": Bracket.best_of_label(int(x.get("best_of", 1))),
				"done": state_id == "done",
				"winner": String(names.get(String(x.get("winner", "")),
					String(x.get("winner", "")))),
				"is_mine": home == my_team or away == my_team,
			})
		rounds.append({"label": String(r["label"]), "rows": rows})

	var champ: String = Bracket.champion(series)
	return {
		"has": true,
		"note": "",
		"rounds": rounds,
		# 우승이 안 났으면 그 줄을 안 만든다 — 빈 이름이 뜨면 고장으로 보인다
		"champion": String(names.get(champ, champ)) if not champ.is_empty() else "",
	}


## 대회 — 02 `LeaguePage`의 세 번째 탭.
##
## 🔴 **`tournament_log`에 우승·내 성적이 쌓이는데 읽는 곳이 없었다.**
## 소식으로 한 번 흘러가고 끝이라, 지난 대회를 되짚을 자리가 없었다.
##
## ⚠ **내가 어디까지 갔는지가 요점이다** — 우승 팀만 적으면 남의 기록이다
static func _tournaments(s: Dictionary) -> Dictionary:
	var log: Array = s.get("tournament_log", [])
	var names: Dictionary = s.get("team_names", {})
	var rows: Array = []
	# 최근 것을 위로
	for i in range(log.size() - 1, -1, -1):
		var e: Dictionary = log[i]
		var champ: String = String(e.get("champion", ""))
		var reached: String = String(e.get("protagonist_reached", ""))
		rows.append({
			"label": "%d년 %s" % [int(e.get("season_year", 0)),
				String(e.get("name", ""))],
			"value": "우승 %s" % String(names.get(champ, champ)),
			"note": "우리 %s" % reached if not reached.is_empty() else "",
		})
		if rows.size() >= TOURNAMENT_ROWS:
			break
	return {"rows": rows,
		"empty_note": "아직 끝난 대회가 없습니다" if rows.is_empty() else ""}


## 진행 중 대회 — 02 `LeaguePage`의 대회 탭이 대진표를 그린다.
##
## 🔴 **04는 끝난 대회 기록만 냈다.** `state["tournaments"]`에 대진이
## 살아 있는데(라운드·경기·승자) 보여주는 자리가 없었다.
##
## ⚠ **포스트시즌 대진과 구조가 다르다** — 그쪽은 `Bracket`의 시리즈 배열이고
## 대회는 `{bracket_size, total_rounds, matches[]}`다. **찍어 보고 맞췄다.**
##
## ⚠ **내가 어디까지 왔는지가 요점이다** — 32강 대진을 다 그리면 못 읽는다.
## **내 경기만** 라운드 순으로 낸다
static func _live_tournaments(s: Dictionary) -> Array:
	var names: Dictionary = s.get("team_names", {})
	var me: String = String(s.get("protagonist", {}).get("team_id", ""))
	var out: Array = []
	for tid in s.get("tournaments", {}):
		var rec: Dictionary = s["tournaments"][tid]
		if not String(rec.get("champion", "")).is_empty():
			continue
		var bracket: Dictionary = rec.get("bracket", {})
		var rows: Array = []
		for m in bracket.get("matches", []):
			if String(m.get("home", "")) != me and String(m.get("away", "")) != me:
				continue
			var foe: String = String(m.get("away", "")) \
				if String(m.get("home", "")) == me else String(m.get("home", ""))
			var winner: String = String(m.get("winner", ""))
			var mark: String = ""
			if not winner.is_empty():
				mark = "승" if winner == me else "패"
			rows.append({
				"label": "%d라운드  %s" % [int(m.get("round", 0)),
					String(names.get(foe, foe)) if not foe.is_empty() else "부전승"],
				"value": mark if not mark.is_empty() else "예정",
				"won": mark == "승",
				"done": not mark.is_empty(),
			})
		if rows.is_empty():
			continue
		out.append({
			"name": String(Tournament.def_of(tid).get("name", tid)),
			"round_label": "%d강 · %d라운드" % [int(bracket.get("bracket_size", 0)),
				int(bracket.get("total_rounds", 0))],
			"rows": rows,
		})
	return out
