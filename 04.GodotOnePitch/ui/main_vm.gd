extends RefCounted
class_name MainVm

## 진행 화면 ViewModel — M7-1 · D4.
##
## 원본: `pages/main/MainPage.svelte`의 `TopHeader`·`SidebarNav`
##
## ⚠ **여기가 "화면이 계산을 갖지 않는다"를 지키는 자리다.** 날짜 문자열·
## 다음 등판까지 며칠·탭별 알림 개수를 전부 여기서 만든다. 화면은 사전을
## 받아 글자만 찍는다.
##
## ⚠ **진행 판단을 여기서 다시 하지 않는다.** 멈출 이유는 `DayEngine`에
## 물어본다 — 화면이 자기 기준으로 또 계산하면 진행기와 갈리고, 그게 02
## 결함의 뿌리다(수상 집계가 결산 모달에만, 드래프트 보드가 자기 후보 풀을
## 따로).
##
## ⚠ **02는 주차만 보여줬다** (`${currentWeek}주차`). 일 단위로 바뀌었으니
## 날짜와 "다음 등판까지"가 필요하다 — 그게 D4다.


## 왼쪽 탭. **순서가 02와 같다** — 바꾸면 손가락이 기억한 자리가 달라진다
const TABS: Array[Dictionary] = [
	{"id": "news", "label": "소식"},
	{"id": "me", "label": "나"},
	{"id": "team", "label": "팀"},
	{"id": "league", "label": "리그"},
	{"id": "people", "label": "인물"},
	{"id": "schedule", "label": "일정"},
]

const WEEKDAY_NAMES: Array[String] = ["일", "월", "화", "수", "목", "금", "토"]


static func build(s: Dictionary) -> Dictionary:
	var day: int = maxi(int(s.get("day", 1)), 1)
	var year: int = s.get("season_year", 2026)
	var season_days: int = s.get("season_days", Calendar.DAYS_PER_SEASON)
	var p: Dictionary = s.get("protagonist", {})

	var date: Dictionary = Calendar.date_of(year, day)
	var mailbox: Array = s.get("mailbox", [])

	var unread: int = 0
	var undecided: int = 0
	for m in mailbox:
		if not m.get("read", false):
			unread += 1
		# ⚠ **답을 안 한 결정은 안 읽은 것과 따로 센다.** 같이 세면 결정이
		# 남았는데 소식만 읽고 넘어가서 **진행이 막힌 이유를 화면에서 못 본다**
		var d = m.get("decision", null)
		if d != null and d.get("selected", null) == null:
			undecided += 1

	var days_to: int = _days_to_next_start(s, day)
	var stop = DayEngine.stop_reason(s)

	# 진행 버튼이 며칠을 가나.
	#
	# ⚠ **멈출 이유가 있으면 0이다 — 경기가 아니어도 그렇다.** 미결정
	# 메시지에 막혔는데 "5일 진행"이 살아 있으면, 눌러도 아무 일이 안
	# 일어나면서 눌린 것처럼 보인다.
	#
	# 바닥을 안 막는다 — `next_stop_day`는 언제나 오늘 이상이다
	var span: int = 0 if stop != null else DayEngine.next_stop_day(s) - day

	return {
		"date_label": "%d년 %d월 %d일" % [date["year"], date["month"], date["day"]],
		"weekday_label": WEEKDAY_NAMES[Calendar.weekday(year, day)],
		"week_label": "%d주차" % Calendar.week_of(day),
		"day": day,
		"season_days": season_days,

		"team_name": p.get("team_name", p.get("team_id", "")),
		"player_name": p.get("name", ""),

		"next_game_in": days_to,
		"next_game_label": _start_label(days_to),

		"advance_days": span,
		"advance_label": _advance_label(span),
		"can_advance": span > 0,

		"stop_type": "" if stop == null else String(stop.get("type", "")),

		"unread_count": unread,
		"undecided_count": undecided,
		"tabs": _tabs(unread, undecided),

		# 탭 내용도 여기서 실어 보낸다 — **화면이 상태를 다시 훑지 않는다.**
		# 탭마다 사전을 따로 받게 하면 화면이 "어느 사전을 언제 받나"를
		# 알아야 하고, 그 순간 화면이 배선을 갖는다
		"schedule": ScheduleVm.build(s),
		"news": NewsVm.build(s),
		"league": LeagueVm.build(s),
		"team": TeamVm.build(s),
		"me": StatusVm.build(s),
	}


## 다음 **내 등판**까지 며칠. 없으면 −1.
##
## ⚠ **NPC 경기는 내 등판이 아니다.** 세면 프로 시즌은 거의 매일 "오늘
## 등판"이라 표시가 아무 뜻이 없어진다
static func _days_to_next_start(s: Dictionary, day: int) -> int:
	var best: int = -1
	for g in s.get("schedule", []):
		if not g.get("is_protagonist_game", false):
			continue
		if g.get("result", null) != null:
			continue
		var d: int = int(g.get("day", -1))
		if d < day:
			continue
		if best < 0 or d < best:
			best = d
	return -1 if best < 0 else best - day


static func _start_label(days: int) -> String:
	if days < 0:
		return "남은 등판 없음"
	if days == 0:
		return "오늘 등판"
	if days == 1:
		return "내일 등판"
	return "다음 등판까지 %d일" % days


static func _advance_label(span: int) -> String:
	if span <= 0:
		return "진행 불가"
	if span == 1:
		return "하루 진행"
	return "%d일 진행" % span


static func _tabs(unread: int, undecided: int) -> Array:
	var out: Array = []
	for t in TABS:
		var badge: int = 0
		if t["id"] == "news":
			badge = unread + undecided
		out.append({"id": t["id"], "label": t["label"], "badge": badge})
	return out
