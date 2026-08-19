extends GdUnitTestSuite

## 자동 진행 기록 — G-6.
##
## ⚠ **04엔 이 장치가 통째로 없었다.** 자동 진행을 돌려도 누가 어디로
## 갔는지 볼 방법이 없었다 — runner가 개수만 반환한다.


func before_test() -> void:
	EventLog.clear()


func _p(name: String, detail: String = "OVR:75 SP 28세",
		from_team: String = "", to_team: String = "") -> Dictionary:
	return EventLog.entry("NPC_" + name, name, detail, from_team, to_team)


# ── 무엇을 적나 ───────────────────────────────────────────────

func test_it_records_who_moved() -> void:
	EventLog.push("trade", 2030, [_p("김투수", "OVR:75 SP",
		"TEAM_KBL_BUSAN_WAVES_1", "TEAM_KBL_SEOUL_ROYALS_1")])
	assert_int(EventLog.all().size()).is_equal(1)
	var ev: Dictionary = EventLog.all()[0]
	assert_str(String(ev["type"])).is_equal("trade")
	assert_int(int(ev["season_year"])).is_equal(2030)
	assert_int(ev["players"].size()).is_equal(1)


## 🔴 **빈 건 안 적는다.** 02도 `if (_entries.length > 0)`로 감싼다 —
## 아무 일도 없던 주가 목록을 채우면 정작 일어난 일이 안 보인다
func test_an_empty_event_is_not_recorded() -> void:
	assert_dict(EventLog.push("trade", 2030, [])).is_empty()
	assert_array(EventLog.all()).override_failure_message(
		"아무도 안 움직였는데 한 줄이 남았다").is_empty()


## ⚠ **모르는 종류는 안 받는다.** 오타 하나로 카운터에서 통째로 빠지는데
## 화면은 "0건"이라고만 말한다
func test_an_unknown_type_is_refused() -> void:
	assert_dict(EventLog.push("트레이드", 2030, [_p("김투수")])).is_empty()
	assert_array(EventLog.all()).is_empty()


## 02 `PlayerEventType` 열둘이 다 있어야 한다 — 하나 빠지면 그 사건이
## 기록에서 조용히 사라진다
func test_all_twelve_kinds_from_02_exist() -> void:
	for t in ["trade", "fa_apply", "fa_result", "draft",
			"enlist_sports", "enlist_general", "discharge",
			"callup", "calldown", "renewal", "adjustment", "retire"]:
		assert_bool(EventLog.TYPES.has(t)).override_failure_message(
			"02에 있는 %s가 04에 없다" % t).is_true()
		assert_str(EventLog.label_of(t)).override_failure_message(
			"%s에 한글 이름이 없다" % t).is_not_equal(t)
	assert_int(EventLog.TYPES.size()).is_equal(12)


# ── 세는 것 ───────────────────────────────────────────────────

func test_it_counts_by_kind() -> void:
	EventLog.push("callup", 2030, [_p("가")])
	EventLog.push("callup", 2030, [_p("나")], 0, 5)
	EventLog.push("retire", 2030, [_p("다")])
	assert_int(EventLog.count_of("callup")).is_equal(2)
	assert_int(EventLog.count_of("retire")).is_equal(1)
	assert_int(EventLog.count_of("trade")).is_equal(0)


## 화면은 열둘을 한 번에 받는다 — 열두 번 훑으면 목록이 길어질수록 느려진다
func test_counts_covers_every_kind() -> void:
	EventLog.push("draft", 2030, [_p("가")])
	var c: Dictionary = EventLog.counts()
	assert_int(c.size()).is_equal(12)
	assert_int(int(c["draft"])).is_equal(1)
	assert_int(int(c["trade"])).is_equal(0)


## ⚠ **`input`은 후보 수다** — 처리된 수가 아니다. 그래야 "예순 중 셋이
## 움직였다"가 읽힌다
func test_input_is_the_candidate_count() -> void:
	var ev: Dictionary = EventLog.push("fa_apply", 2030,
		[_p("가"), _p("나"), _p("다")], 60)
	assert_int(int(ev["counts"]["input"])).is_equal(60)
	assert_int(int(ev["counts"]["processed"])).is_equal(3)


## 안 주면 처리 수로 채운다 — 0으로 두면 "0명 중 3명"이 된다
func test_input_defaults_to_the_processed_count() -> void:
	var ev: Dictionary = EventLog.push("callup", 2030, [_p("가"), _p("나")])
	assert_int(int(ev["counts"]["input"])).is_equal(2)


# ── 상한 ──────────────────────────────────────────────────────

## 🔴 **최근 500개만 남긴다** (02 `slice(-499)`). 20해를 돌리면 수천 건이
## 쌓이는데 전부 들고 있으면 메모리가 는다
func test_it_keeps_only_the_last_500() -> void:
	for i in 520:
		EventLog.push("callup", 2030, [_p("사람%d" % i)], 0, i)
	assert_int(EventLog.all().size()).is_equal(500)
	# 가장 오래된 것이 밀려났고 **최근 것이 남는다**
	var last: Dictionary = EventLog.all()[EventLog.all().size() - 1]
	assert_str(String(last["players"][0]["name"])).is_equal("사람519")
	var first: Dictionary = EventLog.all()[0]
	assert_str(String(first["players"][0]["name"])).override_failure_message(
		"오래된 쪽이 아니라 새 쪽이 잘렸다").is_equal("사람20")


# ── 사람이 읽는 줄 ────────────────────────────────────────────

## 머리줄 하나에 사람 줄 여럿 — 02 `logEvent`의 블록과 같은 차례다
func test_lines_have_a_header_then_people() -> void:
	var ev: Dictionary = EventLog.push("trade", 2030,
		[_p("김투수", "OVR:75 SP", "TEAM_KBL_BUSAN_WAVES_1",
			"TEAM_KBL_SEOUL_ROYALS_1")], 40, 12, "LEAGUE_KBL")
	var lines: Array = EventLog.lines_of(ev)
	assert_int(lines.size()).is_equal(2)
	assert_str(String(lines[0])).contains("트레이드")
	assert_str(String(lines[0])).contains("Y2030")
	assert_str(String(lines[0])).contains("W12")
	assert_str(String(lines[0])).override_failure_message(
		"리그에서 LEAGUE_를 안 뗐다").contains("KBL")
	assert_str(String(lines[0])).override_failure_message(
		"투입/처리를 안 적었다 — 60명 중 3명인지 3명 중 3명인지 모른다") \
		.contains("투입:40")
	assert_str(String(lines[1])).contains("김투수")
	assert_str(String(lines[1])).contains("OVR:75 SP")


## `extra`가 있으면 맨 끝에 붙는다 — 02가 "계약 5 / 신청 12" 꼴로 쓴다
func test_extra_goes_last() -> void:
	var ev: Dictionary = EventLog.push("fa_result", 2030, [_p("가")],
		0, 0, "", "계약 5 / 신청 12")
	var lines: Array = EventLog.lines_of(ev)
	assert_str(String(lines[lines.size() - 1])).contains("계약 5 / 신청 12")


## 없으면 안 붙인다 — 빈 줄이 목록을 늘린다
func test_no_extra_no_line() -> void:
	var ev: Dictionary = EventLog.push("callup", 2030, [_p("가")])
	assert_int(EventLog.lines_of(ev).size()).is_equal(2)


## ⚠ **팀 이름을 줄인다** (02 `shortTeam`). `TEAM_KBL_BUSAN_WAVES_1`을
## 그대로 두면 한 줄이 팀 id 둘로 꽉 찬다
func test_team_ids_are_shortened() -> void:
	var ev: Dictionary = EventLog.push("trade", 2030,
		[_p("가", "d", "TEAM_KBL_BUSAN_WAVES_1", "TEAM_KBL_SEOUL_ROYALS_1")])
	var line: String = String(EventLog.lines_of(ev)[1])
	assert_str(line).override_failure_message(
		"팀 id를 안 줄였다: %s" % line).not_contains("TEAM_KBL_")
	assert_str(line).contains("·1")


## 팀이 없는 사건도 있다 — 은퇴·재계약은 옮기는 게 아니다
func test_a_missing_team_shows_a_dash() -> void:
	var ev: Dictionary = EventLog.push("retire", 2030, [_p("가")])
	assert_str(String(EventLog.lines_of(ev)[1])).contains("-→-")


## 빈 건에서는 줄도 안 나온다
func test_lines_of_nothing_is_empty() -> void:
	assert_array(EventLog.lines_of({})).is_empty()


# ── 세이브에 안 들어간다 ──────────────────────────────────────

## 🔴 **02도 세션 스토어다**(`writable`) — 이번 판에 무슨 일이 있었나를
## 보는 것이지 기록물이 아니다. 세이브에 넣으면 파일만 커진다
func test_the_log_is_not_part_of_the_save() -> void:
	var src: String = FileAccess.get_file_as_string("res://sim/save_codec.gd")
	if src.is_empty():
		src = FileAccess.get_file_as_string("res://sim/save_game.gd")
	assert_str(src).override_failure_message(
		"세이브가 이벤트 로그를 담는다 — 02는 세션 한정이다") \
		.not_contains("EventLog")


# ── 부르는 곳이 있나 (형태 ①) ─────────────────────────────────
#
# 🔴 **여기 있던 소스 문자열 검사를 지웠다.** "`EventLog.push`라는 글자가
# `promotion_runner.gd`에 있나"만 봤는데, 그런 검사는 **빈 배열을 넘겨도,
# 이름을 안 담아도, 리그를 안 실어도 통과한다**(변이로 확인했다).
#
# 실측 검사가 `promotion_runner_test.gd`에 있다 —
# `test_a_callup_is_written_to_the_log`가 `run`을 실제로 돌려
# **누가 어느 팀으로 올라갔는지**까지 본다. 변이 5/5.
#
# ⚠ **약한 검사를 남겨 두면 죽은 가드다.** 초록불이 하나 더 있을 뿐
# 아무것도 안 지킨다.
