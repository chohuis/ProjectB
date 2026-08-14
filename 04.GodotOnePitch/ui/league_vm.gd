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

	var table: Dictionary = {}
	for g in s.get("schedule", []):
		# ⚠ **다른 리그가 섞이면 안 된다.** 하루 83경기가 도는데 다 세면
		# 순위표가 뒤죽박죽이 된다
		if g.get("league_id", "") != league_id:
			continue
		# 안 치른 경기는 안 센다 — 세면 개막 전에 전 팀이 승률 0으로 뜬다
		var res = g.get("result", null)
		if res == null:
			continue

		var home: String = g.get("home", "")
		var away: String = g.get("away", "")
		_ensure(table, home)
		_ensure(table, away)

		var winner = res.get("winner_id", null)
		var loser = res.get("loser_id", null)
		# ⚠ **패자가 없으면 무승부다.** 표기가 둘(`null`·빈 문자열)이라
		# 한쪽만 보면 무승부가 조용히 홈 승리로 기록된다
		if loser == null or String(loser).is_empty():
			table[home]["draws"] += 1
			table[away]["draws"] += 1
		else:
			table[String(winner)]["wins"] += 1
			table[String(loser)]["losses"] += 1

	var rows: Array = []
	for tid in table:
		var r: Dictionary = table[tid]
		# ⚠ **무승부는 승률 분모에서 뺀다** — 야구의 관례다. 안 그러면
		# 무승부가 많은 팀이 순위에서 밀린다
		var decided: int = int(r["wins"]) + int(r["losses"])
		rows.append({
			"team_id": tid,
			"name": names.get(tid, tid),
			"wins": r["wins"], "losses": r["losses"], "draws": r["draws"],
			"win_pct": float(r["wins"]) / float(decided) if decided > 0 else 0.0,
			"is_mine": tid == my_team,
		})

	rows.sort_custom(func(a, b) -> bool:
		if not is_equal_approx(a["win_pct"], b["win_pct"]):
			return a["win_pct"] > b["win_pct"]
		return int(a["wins"]) > int(b["wins"]))

	for i in rows.size():
		rows[i]["rank"] = i + 1

	var leagues: Array = []
	for lid in LEAGUE_LABELS:
		leagues.append({"id": lid, "label": LEAGUE_LABELS[lid]})

	return {
		"league_id": league_id,
		"league_label": LEAGUE_LABELS.get(league_id, league_id),
		"leagues": leagues,
		"rows": rows,
	}


static func _ensure(table: Dictionary, team_id: String) -> void:
	if not table.has(team_id):
		table[team_id] = {"wins": 0, "losses": 0, "draws": 0}
