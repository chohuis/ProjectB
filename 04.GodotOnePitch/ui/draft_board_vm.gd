extends RefCounted
class_name DraftBoardVm

## 드래프트 보드 — C-1.
##
## 원본: `features/career/ui/DraftBoardModal.svelte`
##
## ⚠ **보드는 그날의 기록을 재생만 한다.** 02는 이 모달이 자기 후보 풀을
## 만들고 자체 시뮬을 돌려서 **화면에서 본 지명과 실제 소속이 어긋났다.**
## 여기가 읽는 것은 `DraftLog` 하나다.
##
## ⚠ **화면이 정렬·거르기를 안 한다.** 라운드 묶기·순번 정렬이 전부 여기서
## 끝나야 한다 — 화면에 `sort_custom`이 들어가면 검사가 막는다.


## 라운드 하나에 몇 팀이 뽑나 — 보드 머리글이 쓴다
static func teams_per_round(picks: Array) -> int:
	var best: int = 0
	for p in picks:
		if int(p.get("round", 0)) == 1:
			best += 1
	return maxi(best, 1)


## 화면이 받는 사전 하나.
##
## `state`에서 그 해 기록을 찾아 라운드로 묶는다. 없으면 빈 보드
static func build(state: Dictionary, year: int) -> Dictionary:
	var log: Dictionary = DraftLog.of(state, year)
	var names: Dictionary = state.get("team_names", {})
	var me: String = String(state.get("protagonist", {}).get("id", ""))

	if log.is_empty():
		return {
			"year": year, "has_data": false,
			"title": "%d 신인 드래프트" % year,
			"summary": "아직 열리지 않았다",
			"rounds": [], "missed": [], "my_pick": {},
		}

	var picks: Array = log.get("picks", [])
	# ⚠ **순번으로 줄을 세운다.** 사전 순회 순서로 두면 라운드가 섞인다
	var sorted_picks: Array = picks.duplicate()
	sorted_picks.sort_custom(func(a, b) -> bool:
		return int(a.get("pick", 0)) < int(b.get("pick", 0)))

	var rounds: Array = []
	var by_round: Dictionary = {}
	for p in sorted_picks:
		var r: int = int(p.get("round", 0))
		if not by_round.has(r):
			by_round[r] = []
			rounds.append(r)
		by_round[r].append(_row(p, names, me))

	var out_rounds: Array = []
	for r in rounds:
		out_rounds.append({
			"round": r,
			"label": "%d라운드" % r,
			"picks": by_round[r],
		})

	var my_pick: Dictionary = {}
	for p in sorted_picks:
		if String(p.get("id", "")) == me or bool(p.get("is_protagonist", false)):
			my_pick = _row(p, names, me)

	var missed: Array = []
	for m in log.get("missed", []):
		missed.append(_row(m, names, me))

	return {
		"year": year, "has_data": true,
		"title": "%d 신인 드래프트" % year,
		# **"몇 명 중 몇 명"이 보드의 뜻이다** — 지명만 보여주면 경쟁이 안 보인다
		"summary": "후보 %d명 · 보드 %d명 · 지명 %d명" % [
			int(log.get("candidates", 0)), int(log.get("board_size", 0)),
			sorted_picks.size()],
		"rounds": out_rounds,
		"missed": missed,
		"my_pick": my_pick,
	}


## 한 줄. **화면이 이름을 다시 찾지 않게 여기서 붙인다**
static func _row(p: Dictionary, names: Dictionary, me: String) -> Dictionary:
	var team_id: String = String(p.get("team_id", ""))
	var mine: bool = String(p.get("id", "")) == me \
		or bool(p.get("is_protagonist", false))
	return {
		"id": String(p.get("id", "")),
		"name": String(p.get("name", "")),
		"position": String(p.get("position", "")),
		"ovr": int(roundf(float(p.get("ovr", 0.0)))),
		"age": int(p.get("age", 0)),
		"team_id": team_id,
		"team_name": String(names.get(team_id, team_id)),
		"round": int(p.get("round", 0)),
		"pick": int(p.get("pick", 0)),
		# 순번이 0이면 미지명이다 — "0순위"로 찍으면 1순위보다 위로 읽힌다
		"pick_label": "%d순위" % int(p.get("pick", 0)) \
			if int(p.get("pick", 0)) > 0 else "미지명",
		"origin": _origin_label(String(p.get("from_league_id", ""))),
		"is_mine": mine,
	}


## 어디서 왔나 — **02는 이 기록이 없어 화면이 국내 신인과 구분을 못 했다**
const ORIGIN_LABELS: Dictionary = {
	"LEAGUE_HIGHSCHOOL": "고교",
	"LEAGUE_UNIVERSITY": "대학",
	"LEAGUE_INDEPENDENT": "독립",
	"LEAGUE_DRAFT_POOL": "재수",
}


static func _origin_label(league_id: String) -> String:
	return String(ORIGIN_LABELS.get(league_id, "기타"))
