extends RefCounted
class_name ScheduleVm

## 일정 탭 ViewModel — M7-5.
##
## 원본: `pages/schedule/SchedulePage.svelte` (954줄)
##
## ⚠ **02가 여기서 겪은 결함 셋이 전부 "화면이 이름표를 따로 들고 있어서"**
## 생겼다 — 훈련 이름표가 전부 구버전 id라 화면에 `TRN_CTRL_CMD` 원문이
## 그대로 떠 있었고, 죽은 필드(`recoveryProgramId`)를 읽고 있었고, 아무도
## 안 읽는 변수가 남아 "여기서 이름이 나온다"고 오해하게 만들었다.
##
## 이름표를 화면에 안 두면 그 셋이 구조적으로 안 생긴다.
##
## ⚠ **일 단위로 바뀌었다.** 02는 주차로 묶었지만 우리는 날짜로 준다.


const WEEKDAY_NAMES: Array[String] = ["일", "월", "화", "수", "목", "금", "토"]


static func build(s: Dictionary) -> Dictionary:
	var day: int = maxi(int(s.get("day", 1)), 1)
	var year: int = s.get("season_year", 2026)
	var my_team: String = s.get("protagonist", {}).get("team_id", "")
	var names: Dictionary = s.get("team_names", {})

	var rows: Array = []
	var w: int = 0
	var l: int = 0
	var d: int = 0
	var remaining: int = 0

	for g in s.get("schedule", []):
		# ⚠ **내 경기만 싣는다.** 프로는 하루 83경기가 도는데 전부 보이면
		# 내 등판을 못 찾는다
		if not g.get("is_protagonist_game", false):
			continue

		var gd: int = int(g.get("day", 0))
		var home: String = g.get("home", "")
		var is_home: bool = home == my_team
		var foe: String = g.get("away", "") if is_home else home

		var res = g.get("result", null)
		var status: String = ""
		var label: String = ""
		var won: bool = false

		if res == null:
			# ⚠ **지나갔는데 결과가 없는 경기가 있다.** 진행이 멈춘 사이
			# 넘어간 것들이다 — "예정"으로 두면 영영 안 오는 경기를 기다린다
			status = "today" if gd == day else ("upcoming" if gd > day else "missed")
			remaining += 1
		else:
			status = "done"
			var hs: int = int(res.get("home_score", 0))
			var as_: int = int(res.get("away_score", 0))
			var winner = res.get("winner", null)
			# ⚠ **무승부에 승패를 안 붙인다.** 02는 승자 id가 빈 문자열로도
			# 와서 `winner == my_team`이 거짓 → 전부 "패"로 찍혔다
			var drawn: bool = winner == null or String(winner).is_empty()
			if drawn:
				d += 1
				label = "무 %d:%d" % [hs, as_]
			elif String(winner) == my_team:
				w += 1
				won = true
				label = "승 %d:%d" % [hs, as_]
			else:
				l += 1
				label = "패 %d:%d" % [hs, as_]

		var date: Dictionary = Calendar.date_of(year, gd)
		rows.append({
			"id": g.get("id", ""),
			"day": gd,
			"date_label": "%d월 %d일" % [date["month"], date["day"]],
			"weekday_label": WEEKDAY_NAMES[Calendar.weekday(year, gd)],
			"opponent": names.get(foe, foe),
			"location": "홈" if is_home else "원정",
			"status": status,
			"result_label": label,
			"won": won,
		})

	# ⚠ **날짜 순으로 준다.** 대회 라운드가 뒤에 주입되므로 목록 순서는
	# 날짜 순이 아니다 — 그대로 보여주면 일정표가 뒤죽박죽이 된다
	rows.sort_custom(func(a, b) -> bool: return a["day"] < b["day"])

	return {
		"rows": rows,
		"wins": w, "losses": l, "draws": d,
		"remaining": remaining,
		"record_label": "기록 없음" if w + l + d == 0 else "%d승 %d무 %d패" % [w, d, l],
	}
