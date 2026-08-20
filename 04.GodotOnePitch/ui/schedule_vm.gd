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

## 보기 — 02 `SchedulePage`의 `view`(G-3b).
##
## 🔴 **04는 시즌 전체 하나만 보여 줬다.** 프로 144경기가 한 줄로 늘어서면
## 이번 주에 뭐가 있는지 못 찾는다 — 02는 범위를 좁혀 본다.
##
## ⚠ **02의 `year`는 안 만든다.** 02에서 그건 "그 해 시즌 일정"인데
## (`SchedulePage:262`) **04는 한 해가 한 시즌**이라 `season`과 같은 것이
## 나온다. 같은 값을 두 이름으로 두면 어느 쪽이 정본인지 못 가린다
const VIEWS: Array[Dictionary] = [
	{"id": "week", "label": "주간"},
	{"id": "month", "label": "월간"},
	{"id": "season", "label": "시즌"},
]

## 02는 커서를 앞뒤로 옮긴다(`SchedulePage:294`) — 주간은 7일, 월간은 한 달.
## ⚠ **상태가 든다** — 화면이 들면 진행 뒤에 초기화된다


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
			# 상대 마크 — 화면이 색을 고르지 않게 사전으로 준다 (U-1)
			"mark": TeamMarkVm.build(String(foe)),
			"location": "홈" if is_home else "원정",
			"status": status,
			"result_label": label,
			"won": won,
		})

	# ⚠ **날짜 순으로 준다.** 대회 라운드가 뒤에 주입되므로 목록 순서는
	# 날짜 순이 아니다 — 그대로 보여주면 일정표가 뒤죽박죽이 된다
	rows.sort_custom(func(a, b) -> bool: return a["day"] < b["day"])

	# 보기로 범위를 좁힌다 (G-3b)
	var view: String = String(s.get("schedule_view", "season"))
	var cursor: int = int(s.get("schedule_cursor_day", 0))
	if cursor <= 0:
		cursor = day
	var span: Dictionary = _span_of(view, year, cursor)
	var shown: Array = []
	for r in rows:
		var rd: int = int(r["day"])
		if rd < int(span["from"]) or rd > int(span["to"]):
			continue
		shown.append(r)

	return {
		# ⚠ **성적은 시즌 전체로 센다** — 주간 보기라고 승패가 줄면
		# "이번 주 성적"인지 "올해 성적"인지 못 가린다(02도 전체를 낸다)
		"rows": shown,
		"views": _view_rows(view),
		"view": view,
		"span_label": String(span["label"]),
		"cursor_day": cursor,
		# 시즌 보기에서는 앞뒤로 넘길 것이 없다
		"can_move": view != "season",
		"wins": w, "losses": l, "draws": d,
		"remaining": remaining,
		"record_label": "기록 없음" if w + l + d == 0 else "%d승 %d무 %d패" % [w, d, l],
		"empty": _empty_note(view),
	}


## 커서를 앞뒤로 — 02 `SchedulePage:294`(주간 7일 · 월간 한 달).
##
## 🔴 **루트가 이 계산을 갖고 있었다.** `app_root_test`가 "루트는 잇는 곳이지
## 계산하는 곳이 아니다"라며 `Calendar.`를 막는데 거기서 날을 세고 있었다 —
## 검사가 잡았다. 세는 곳은 여기 하나다.
## ⚠ **시즌 밖으로 안 나간다** — 나가면 빈 화면만 뜬다
static func move_cursor(view: String, cursor: int, delta: int,
		today: int = 1) -> int:
	var cur: int = cursor if cursor > 0 else today
	var step: int = Calendar.DAYS_PER_WEEK if view == "week" else DAYS_PER_MONTH
	return clampi(cur + delta * step, 1, Calendar.DAYS_PER_SEASON)


## 월간 한 걸음 — 02는 `setMonth(+1)`이라 달의 길이를 따르지만 04 달력은
## 달마다 길이가 달라 **평균으로 옮기고 범위는 `_span_of`가 다시 잡는다**
const DAYS_PER_MONTH: int = 30


## 보기 단추
static func _view_rows(active: String) -> Array:
	var out: Array = []
	for v in VIEWS:
		out.append({"id": v["id"], "label": v["label"],
			"on": String(v["id"]) == active})
	return out


## 그 보기가 덮는 날 범위. **일 단위다** — 04는 날짜로 센다
static func _span_of(view: String, year: int, cursor: int) -> Dictionary:
	if view == "week":
		# 02는 일요일에서 시작한다(`startOfWeek`)
		var wd: int = Calendar.weekday(year, cursor)
		var from_day: int = maxi(cursor - wd, 1)
		var to_day: int = from_day + 6
		var a: Dictionary = Calendar.date_of(year, from_day)
		var b: Dictionary = Calendar.date_of(year, to_day)
		return {"from": from_day, "to": to_day,
			"label": "%d월 %d일 – %d월 %d일" % [a["month"], a["day"],
				b["month"], b["day"]]}
	if view == "month":
		var d: Dictionary = Calendar.date_of(year, cursor)
		var first: int = cursor - int(d["day"]) + 1
		# 다음 달 1일 전날까지
		var next_first: int = first
		var m: int = int(d["month"])
		while next_first <= Calendar.DAYS_PER_SEASON 				and int(Calendar.date_of(year, next_first)["month"]) == m:
			next_first += 1
		return {"from": maxi(first, 1), "to": next_first - 1,
			"label": "%d년 %d월" % [year, m]}
	return {"from": 1, "to": Calendar.DAYS_PER_SEASON,
		"label": "%d 시즌" % year}


## **비었을 때 왜 비었는지 말한다** — 주간 보기는 경기 없는 주가 흔하다
static func _empty_note(view: String) -> String:
	if view == "week":
		return "이번 주에는 경기가 없습니다"
	if view == "month":
		return "이 달에는 경기가 없습니다"
	# ⚠ **문구를 바꾸지 않는다** — `main_screen_test`가 이 말을 기대한다
	return "아직 잡힌 경기가 없습니다"
