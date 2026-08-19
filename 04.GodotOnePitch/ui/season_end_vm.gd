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

## 포스트시즌 결과 → 사람이 읽는 말 (G-1a). 값은 `Postseason`의 상수다.
##
## 🔴 **`digest`에 `ps_result`가 있는데 아무도 안 읽고 있었다**(형태 ③).
## `season_history.gd:173`이 `Postseason.result_for`로 채우는데 여기서
## `stat_line`·`ovr`·`game_log`만 꺼냈다 — 02는 `<h4>포스트시즌</h4>` 절로
## 보여준다(`SeasonEndModal.svelte:374`).
## ⚠ 값이 죽지는 않았다 — `career_summary.gd:329`·`career_path.gd:95`가 읽는다.
## **결산 화면에만 안 나왔다**
const PS_LABELS: Dictionary = {
	"champion": "우승",
	"runner_up": "준우승",
	"semi_final": "4강",
}


const TABS: Array[Dictionary] = [
	{"id": "season", "label": "시즌"},
	{"id": "team", "label": "팀"},
	{"id": "personal", "label": "개인"},
]


static func build(digest: Dictionary, p: Dictionary = {}) -> Dictionary:
	if digest.is_empty():
		return {"year": 0, "title": "", "tabs": TABS, "has_data": false,
			"summary_rows": [], "standings": [], "my_rank_label": "",
			"tournament_rows": [], "team_best": [],
			"team_row": {}, "my_line": "", "my_awards": [], "game_log": [],
			"award_rows": [],
			"investment": {"show": false, "done": false,
				"options": [], "amounts": []}}

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
	var ps: String = String(PS_LABELS.get(
		String(record.get("ps_result", "")), ""))

	return {
		"year": year,
		# ⚠ **우승만 제목이 바뀐다** — 02 `SeasonEndModal:351`이 그렇다.
		# 준우승·4강까지 제목을 바꾸면 "🏆"가 흔해져 우승이 안 도드라진다
		"title": ("%d년 🏆 우승" % year) if ps == "우승" \
			else ("%d년 시즌 결산" % year),
		"tabs": TABS,
		"has_data": true,

		# ── 시즌 탭 ──
		"summary_rows": _summary_rows(digest.get("summary", {}), ps),
		"tournament_rows": _tournament_rows(digest.get("tournaments", [])),
		"standings": standings,
		"award_rows": _award_rows(digest.get("awards", {})),

		# ── 팀 탭 ──
		"team_name": String(digest.get("team_name", "")),
		"team_row": team_row,
		# ⚠ **순위가 0이면 "미정"이다.** 0위로 찍으면 꼴찌보다 나쁜 등수가 뜬다
		"team_best": _team_best_rows(digest.get("team_best", {})),
		"my_rank_label": "%d위 / %d팀" % [my_rank, standings.size()] \
			if my_rank > 0 else "순위 없음",

		# ── 개인 탭 ──
		"my_line": String(record.get("stat_line", "")),
		"my_ovr": int(record.get("ovr", 0)),
		"my_awards": digest.get("my_awards", []),
		"game_log": _game_log(record.get("game_log", [])),

		# ── 시즌말 투자 ──
		"investment": _investment(p, year),
	}


## 시즌말 투자 — 02 `SeasonEndModal`의 `<h4>시즌말 투자</h4>` 절.
##
## ⚠ **여기가 유일한 투자 시점이다**(02 주석 그대로). 상시 화면에 두면 매주
## 눌러보는 도박이 되고, 재정 화면은 이력만 본다.
##
## ⚠ **못 하는 사람에겐 아예 안 보인다.** 다른 화면은 "왜 못 하나"를 적지만
## 여기는 규칙 파일이 적어 둔 대로다 — **생활비도 빠듯한 신인에게 투자
## 화면을 띄우면 조롱이다.** 이유는 재정 화면이 말한다
static func _investment(p: Dictionary, year: int) -> Dictionary:
	var done: Dictionary = Finance.investment_of_season(p, year)
	if not done.is_empty():
		var profit: int = int(done.get("profit", 0))
		return {"show": true, "done": true, "options": [], "amounts": [],
			"name": String(done.get("name", "")),
			"result_label": "%s 투자 → %s (%+.1f%%)" % [
				FinanceVm.won(int(done.get("principal", 0))),
				FinanceVm.signed_won(profit),
				float(done.get("rate", 0.0)) * 100.0],
			"note": "자산에 반영됐습니다." if profit >= 0 \
				else "손실이 자산에서 차감됐습니다.",
			"gain": profit >= 0}

	var cash: int = int(p.get("money", 0))
	if not Finance.can_invest(cash, Finance.career_stage_of(p)):
		return {"show": false, "done": false, "options": [], "amounts": []}

	var options: Array = []
	for o in Finance.investment_options():
		var sd: float = float(o.get("sd", 0.0))
		options.append({
			"id": String(o.get("id", "")),
			"name": String(o.get("name", "")),
			"desc": String(o.get("desc", "")),
			# ⚠ **위험을 같이 적는다.** 기대 수익만 보면 사업이 늘 나아 보인다
			"stat_label": "기대 %+.0f%% · %s" % [float(o.get("mean", 0.0)) * 100.0,
				"확정" if sd <= 0.0 \
					else "최대 %.0f%%" % (float(o.get("floor", 0.0)) * 100.0)],
		})
	return {
		"show": true, "done": false,
		"title": "시즌말 투자",
		"cash_label": FinanceVm.won(cash),
		"warn": "고위험 선택지는 원금을 잃을 수 있습니다.",
		"amounts": Finance.investment_amounts(cash),
		"options": options,
	}


## 한 해에 무슨 일이 있었나. **0인 항목은 안 보여준다** —
## "은퇴 0명"이 줄줄이 뜨면 정작 일어난 일이 안 보인다
static func _summary_rows(s: Dictionary, ps_label: String = "") -> Array:
	var out: Array = []
	# 🔴 **맨 앞이다** (G-1a). 그 해 가장 큰 일인데 졸업·지명 밑에 깔리면
	# 안 읽힌다. **못 갔으면 줄을 안 만든다** — 아래 규칙과 같다
	if not ps_label.is_empty():
		out.append({"label": "포스트시즌", "value": ps_label})
	var order: Array = [
		["graduated", "졸업"], ["drafted", "지명"], ["placed", "진로 결정"],
		["gave_up", "은퇴(미지명)"], ["demoted", "2군 강등"],
		["released", "방출"], ["retired", "은퇴"], ["freshmen", "신입생"],
	]
	for pair in order:
		var n: int = int(s.get(pair[0], 0))
		if n <= 0:
			continue
		out.append({"label": pair[1], "value": "%d명" % n})
	return out


## 팀 내 베스트 — G-1c. 02 `SeasonEndModal:518`의 두 카드.
##
## ⚠ **자격선을 못 넘으면 줄이 없다.** 02도 `{#if teamBestPitcher}`로 감싼다 —
## 고교 첫 해처럼 아무도 IP 10을 못 넘는 해가 실제로 있다
static func _team_best_rows(best: Dictionary) -> Array:
	var out: Array = []
	var p: Dictionary = best.get("pitcher", {})
	if not p.is_empty():
		out.append({"label": "최우수 투수",
			"name": String(p.get("name", "")),
			# ⚠ **이름을 값 안에 넣는다** — 화면이 라벨과 이름을 조립하면
			# 그게 계산이다. 여기가 한 줄을 통째로 만든다
			"value": "%s  ERA %.2f · %d승 · %.1f이닝" % [
				String(p.get("name", "")), float(p.get("era", 0.0)),
				int(p.get("w", 0)), float(p.get("ip", 0.0))]})
	var b: Dictionary = best.get("batter", {})
	if not b.is_empty():
		out.append({"label": "최우수 타자",
			"name": String(b.get("name", "")),
			"value": "%s  타율 %s · %d홈런 · %d타점" % [
				String(b.get("name", "")),
				("%.3f" % float(b.get("avg", 0.0))).substr(1),
				int(b.get("hr", 0)), int(b.get("rbi", 0))]})
	return out


## 그 해 대회 — G-1b.
##
## ⚠ **내가 어디까지 갔는지를 값으로 삼는다.** 우승 팀은 뒤에 붙인다 —
## 결산은 내 한 해를 되짚는 자리지 대회 연감이 아니다.
## ⚠ **못 나간 대회는 안 적는다**(`reached`가 비었을 때) — 02도 그 해 나간
## 대회만 절에 싣는다
static func _tournament_rows(list: Array) -> Array:
	var out: Array = []
	for t in list:
		var reached: String = String(t.get("reached", ""))
		if reached.is_empty():
			continue
		var champ: String = String(t.get("champion", ""))
		var value: String = reached
		if not champ.is_empty():
			value += " · 우승 %s" % champ
		out.append({"label": String(t.get("name", "")), "value": value})
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
