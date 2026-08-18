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

## "나"와 "세계"를 가르는 자리 — 이 탭 **뒤에** 선이 온다.
##
## ⚠ **02가 같은 자리에 뒀다** (`navVisibility`의 `NAV_GROUP_BREAK_AFTER`).
## 그쪽 주석: "글자를 안 늘리면서 성격이 갈리는 걸 보여준다". 앞 둘은 나에
## 관한 것이고 뒤 넷은 세계에 관한 것이다
const NAV_BREAK_AFTER: String = "me"

const WEEKDAY_NAMES: Array[String] = ["일", "월", "화", "수", "목", "금", "토"]

## 자동 진행 버튼 — **어디까지 가는지를 글자가 말한다.** "자동 진행"이라고만
## 쓰면 시즌 끝까지 가는 줄 안다
const AUTO_LABEL: String = "다음 결정까지"


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

		# ⚠ **복무 중엔 팀이 없다** (U-2b). `Military.enlist`가 `team_id`를
		# 비우는데 `team_name`은 안 지운다 — 헤더가 옛 소속을 그대로 띄웠다.
		# **"나" 탭과 같은 말을 해야 한다** — 두 자리가 다르면 어느 쪽이
		# 맞는지 알 수 없다
		"team_name": StatusVm.team_name_of(p),
		"player_name": p.get("name", ""),
		# 헤더 마크가 쓴다 (U-3) — 화면이 상태를 직접 읽지 않는다
		"team_id": String(p.get("team_id", "")),

		# ⚠ **OVR을 어디에서도 안 보여줬다** (U-3). `ui/` 전체에서 `ovr`을
		# 쓰는 곳이 지명 후보 줄과 로스터 줄 둘뿐이라, **내 능력치를 보려면
		# 팀 탭 로스터에서 내 줄을 찾아야 했다.** 02는 껍데기 우측에 상시로
		# 뒀다(`RightPanel.svelte:74-77`).
		#
		# ⚠ **투수는 투구 OVR이다.** 안 가르면 투수가 타격 20으로 떠서
		# 갑자기 약해 보인다 — `team_vm.gd:30-31`이 같은 이유로 가른다
		"ovr": _ovr_of(p),

		# ⚠ **02가 "항상 보여야 한다"고 꼽은 셋 중 둘이 여기 있다** —
		# 컨디션과 피로. 나머지 하나(다음 경기)는 아래에 있다.
		# 예전엔 피로가 훈련 화면에만 있었다
		"condition": roundi(float(p.get("condition", 0.0))),
		"fatigue": roundi(float(p.get("fatigue", 0.0))),
		"fatigue_zone": String(TrainingVm.zone_of(
			float(p.get("fatigue", 0.0)))["label"]),

		# 내 팀 순위 — U-4. 02는 우측 패널에 늘 띄운다
		"my_rank": _my_rank(s),
		"next_game_in": days_to,
		"next_game_label": _start_label(days_to),

		"advance_days": span,
		"advance_label": _advance_label(span),
		"can_advance": span > 0,

		# 자동 진행 — B-11. **다음 결정까지 간다.**
		#
		# ⚠ **한 걸음도 못 갈 때 막는다.** `next_step`이 `stop`이면 눌러도
		# 그 자리에서 되돌아오므로, 살아 있으면 "눌렀는데 아무 일도 안 났다"가
		# 된다 — 진행 버튼이 같은 이유로 막힌다(위 `span`)
		"auto_label": AUTO_LABEL,
		"can_auto": String(AutoAdvance.next_step(s).get("kind", "stop")) != "stop",

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
		"people": PeopleVm.build(s),
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


## 주인공 OVR. **투수는 투구 쪽, 야수는 타격 쪽** — `team_vm.gd:30-31`과 같다
static func _ovr_of(p: Dictionary) -> int:
	if p.is_empty():
		return 0
	var pitcher: bool = PlayerGen.is_pitcher(String(p.get("position", "")))
	var src: Dictionary = p.get("pitching", {}) if pitcher else p.get("batting", {})
	return roundi(float(src.get("ovr", 0.0)))


static func _tabs(unread: int, undecided: int) -> Array:
	var out: Array = []
	for t in TABS:
		var badge: int = 0
		if t["id"] == "news":
			badge = unread + undecided
		out.append({"id": t["id"], "label": t["label"], "badge": badge,
			# 화면이 "어디가 나이고 어디가 세계인가"를 다시 판정하지 않는다
			"break_after": t["id"] == NAV_BREAK_AFTER})
	return out


## 우측 패널의 내 팀 순위 — U-4. 02 `RightPanel`이 늘 띄운다.
##
## 🔴 **04 우측 패널엔 순위가 없었다.** 리그 탭을 열어야만 내 팀이 몇 위인지
## 알 수 있었다 — 02는 그걸 **항상 보이는 자리**에 뒀다.
##
## ⚠ **04에 다 있는 값이다** — 순위는 `Standings.from_schedule`이 일정에서
## 파생하고, 권역은 `Tournament.regions_of`가 구장에서 낸다.
##
## ⚠ **아직 안 치렀으면 안 만든다** — 0승 0패를 띄우면 꼴찌로 보인다
static func _my_rank(s: Dictionary) -> Dictionary:
	var p: Dictionary = s.get("protagonist", {})
	var team: String = String(p.get("team_id", ""))
	var league: String = String(p.get("league_id", ""))
	if team.is_empty() or league.is_empty():
		return {}

	var rows: Array = Standings.from_schedule(s.get("schedule", []), league)
	if rows.is_empty():
		return {}

	var rank: int = 0
	var mine: Dictionary = {}
	for i in rows.size():
		if String(rows[i].get("team_id", "")) == team:
			rank = i + 1
			mine = rows[i]
	if rank <= 0:
		return {}

	# 권역 순위 — 고교는 그게 라이벌이다(02도 같이 띄운다)
	# ⚠ **권역은 고교만이다.** 프로는 구장이 팀마다 하나라 "1위 / 1팀"이 뜬다
	# — 실측이 잡았다. 02도 권역을 고교에만 쓴다
	var region_label: String = ""
	var regions: Dictionary = {}
	if league == "LEAGUE_HIGHSCHOOL":
		regions = Tournament.regions_of(league)
	for stadium_id in regions:
		if not (regions[stadium_id] as Array).has(team):
			continue
		var in_region: int = 0
		var my_place: int = 0
		for row in rows:
			if not (regions[stadium_id] as Array).has(String(row["team_id"])):
				continue
			in_region += 1
			if String(row["team_id"]) == team:
				my_place = in_region
		if my_place > 0:
			region_label = "%s %d위 / %d팀" % [ParkVm.name_of(String(stadium_id)),
				my_place, in_region]

	return {
		"rank_label": "%d위 / %d팀" % [rank, rows.size()],
		"record_label": "%d승 %d무 %d패" % [int(mine.get("wins", 0)),
			int(mine.get("draws", 0)), int(mine.get("losses", 0))],
		# ⚠ **는 을 안 낸다** — 승률은 여기서 만든다.
		# 처음에 있는 줄 알고 빈 문자열을 냈다(실측이 잡았다)
		"pct_label": ("%.3f" % float(mine.get("win_pct", 0.0))).trim_prefix("0"),
		"region_label": region_label,
	}
