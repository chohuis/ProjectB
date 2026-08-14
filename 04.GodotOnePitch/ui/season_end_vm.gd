extends RefCounted
class_name SeasonEndVm

## 시즌 결산 — M7-7.
##
## 원본: `features/season-end/ui/SeasonEndModal.svelte` (1,195줄)
##
## ⚠ **1,195줄이 된 이유가 화면이 계산을 가져서다.** 순위·수상·개인 기록을
## 전부 화면이 직접 모았다. 여기는 `SeasonHistory.digest`가 만든 사전을
## 화면이 찍을 모양으로 옮기기만 한다.
##
## 탭 셋은 02 그대로다 — **시즌 · 팀 · 개인.**

const TABS: Array[Dictionary] = [
	{"id": "season", "label": "시즌"},
	{"id": "team", "label": "팀"},
	{"id": "personal", "label": "개인"},
]


static func build(digest: Dictionary) -> Dictionary:
	if digest.is_empty():
		return {"year": 0, "title": "", "tabs": TABS, "has_data": false,
			"summary_rows": [], "standings": [], "my_rank_label": "",
			"team_row": {}, "my_line": "", "my_awards": [], "game_log": [],
			"award_rows": []}

	var year: int = int(digest.get("year", 0))
	var standings: Array = digest.get("standings", {}).get("rows", [])
	var team_id: String = String(digest.get("team_id", ""))

	var my_rank: int = 0
	var team_row: Dictionary = {}
	for i in standings.size():
		if String(standings[i].get("team_id", "")) == team_id:
			my_rank = i + 1
			team_row = standings[i]

	var record: Dictionary = digest.get("my_record", {})

	return {
		"year": year,
		"title": "%d년 시즌 결산" % year,
		"tabs": TABS,
		"has_data": true,

		# ── 시즌 탭 ──
		"summary_rows": _summary_rows(digest.get("summary", {})),
		"standings": standings,
		"award_rows": _award_rows(digest.get("awards", {})),

		# ── 팀 탭 ──
		"team_name": String(digest.get("team_name", "")),
		"team_row": team_row,
		# ⚠ **순위가 0이면 "미정"이다.** 0위로 찍으면 꼴찌보다 나쁜 등수가 뜬다
		"my_rank_label": "%d위 / %d팀" % [my_rank, standings.size()] \
			if my_rank > 0 else "순위 없음",

		# ── 개인 탭 ──
		"my_line": String(record.get("stat_line", "")),
		"my_ovr": int(record.get("ovr", 0)),
		"my_awards": digest.get("my_awards", []),
		"game_log": _game_log(record.get("game_log", [])),
	}


## 한 해에 무슨 일이 있었나. **0인 항목은 안 보여준다** —
## "은퇴 0명"이 줄줄이 뜨면 정작 일어난 일이 안 보인다
static func _summary_rows(s: Dictionary) -> Array:
	var order: Array = [
		["graduated", "졸업"], ["drafted", "지명"], ["placed", "진로 결정"],
		["gave_up", "은퇴(미지명)"], ["demoted", "2군 강등"],
		["released", "방출"], ["retired", "은퇴"], ["freshmen", "신입생"],
	]
	var out: Array = []
	for pair in order:
		var n: int = int(s.get(pair[0], 0))
		if n <= 0:
			continue
		out.append({"label": pair[1], "value": "%d명" % n})
	return out


## 내 리그 수상자. **이름은 화면이 다시 안 찾는다** — id만 주면 화면이
## 로스터를 뒤져야 하고, 그게 02에서 화면이 계산을 갖게 된 경로다
static func _award_rows(awards: Dictionary) -> Array:
	var out: Array = []
	for a in awards.get("awards", []):
		out.append({
			"label": String(a.get("label", "")),
			"player_id": String(a.get("player_id", "")),
			"value": String(a.get("value_text", "")),
		})
	for pid in awards.get("mvp", []):
		out.append({"label": "MVP", "player_id": String(pid), "value": ""})
	return out


## 등판 기록 한 줄씩. **이닝은 야구 표기다** — 6.67이 아니라 6.2
static func _game_log(log: Array) -> Array:
	var out: Array = []
	for e in log:
		var mine: int = int(e.get("my_score", 0))
		var opp: int = int(e.get("opp_score", 0))
		out.append({
			"day": int(e.get("day", 0)),
			"opponent_id": String(e.get("opponent_id", "")),
			"score_label": "%d : %d" % [mine, opp],
			"won": mine > opp,
			"line_label": "%s이닝 %dK %dBB %d자책 %d구" % [
				MatchVm.innings_label(CareerSummary.innings_to_outs(
					float(e.get("ip", 0.0)))),
				int(e.get("k", 0)), int(e.get("bb", 0)), int(e.get("er", 0)),
				int(e.get("pc", 0))],
		})
	return out
