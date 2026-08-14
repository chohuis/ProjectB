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

	var leagues: Array = []
	for lid in LEAGUE_LABELS:
		leagues.append({"id": lid, "label": LEAGUE_LABELS[lid]})

	return {
		"league_id": league_id,
		"league_label": LEAGUE_LABELS.get(league_id, league_id),
		"leagues": leagues,
		"rows": rows,
	}


