extends GdUnitTestSuite

## 자동 진행 패널 — G-6 ③.
##
## ⚠ **04는 중지 사유 한 줄만 보여 줬다.** 스무 해를 자동으로 넘겨도 그
## 사이에 누가 이적하고 누가 은퇴했는지 볼 자리가 없었다 — `EventLog`에
## 쌓이는데 읽는 곳이 없었다(형태 ③).

const SCREEN := preload("res://ui/screens/main_screen.tscn")


func before_test() -> void:
	EventLog.clear()


func _p(name: String) -> Dictionary:
	return EventLog.entry("NPC_" + name, name, "OVR:70 SP 27세",
		"TEAM_KBL_BUSAN_WAVES_1", "TEAM_KBL_SEOUL_ROYALS_1")


func _fill() -> void:
	EventLog.push("trade", 2030, [_p("가"), _p("나")], 40, 12, "LEAGUE_KBL")
	EventLog.push("retire", 2030, [_p("다")], 200)
	EventLog.push("callup", 2030, [_p("라")], 10, 20, "LEAGUE_KBL")


# ── 언제 뜨나 ─────────────────────────────────────────────────

## 02 `visible = running || stopReason !== null` — **자동 진행 중에만** 뜬다
func test_it_shows_while_running_or_stopped() -> void:
	assert_bool(bool(AutoAdvanceVm.build("", false)["show"])) \
		.override_failure_message("평소에도 뜬다").is_false()
	assert_bool(bool(AutoAdvanceVm.build("", true)["show"])).is_true()
	assert_bool(bool(AutoAdvanceVm.build("은퇴", false)["show"])) \
		.override_failure_message("멈춘 이유가 있는데 안 뜬다").is_true()


# ── 카운터 ────────────────────────────────────────────────────

## ⚠ **0인 종류도 낸다.** 02는 카운터를 늘 열둘 보여 준다 — 자리가
## 고정이라 사라지면 눈이 헤맨다. (요약 행과 규칙이 다른 자리다)
func test_counts_show_every_kind_even_zero() -> void:
	_fill()
	var counts: Array = AutoAdvanceVm.build("", true)["counts"]
	assert_int(counts.size()).is_equal(12)
	var by_id: Dictionary = {}
	for c in counts:
		by_id[String(c["id"])] = int(c["value"])
	assert_int(int(by_id["trade"])).is_equal(1)
	assert_int(int(by_id["draft"])).override_failure_message(
		"안 일어난 종류가 카운터에서 빠졌다").is_equal(0)


## ⚠ **02는 필터에서만 다르게 부르는 종류가 있다** — `fa_result`가
## 로그에선 "FA결과", 필터에선 "FA이동"이다
func test_the_filter_label_can_differ_from_the_log() -> void:
	assert_str(AutoAdvanceVm.label_of("fa_result")).is_equal("FA이동")
	assert_str(EventLog.label_of("fa_result")).override_failure_message(
		"로그 쪽 이름까지 바뀌었다 — 기록이 흔들린다").is_equal("FA결과")


# ── 거르기 ────────────────────────────────────────────────────

func test_the_filter_narrows_the_list() -> void:
	_fill()
	assert_int(AutoAdvanceVm.build("", true, "all")["events"].size()).is_equal(3)
	var only: Array = AutoAdvanceVm.build("", true, "trade")["events"]
	assert_int(only.size()).is_equal(1)
	assert_str(String(only[0]["head"])).contains("트레이드")


## 맨 앞이 "전체"다 — 02 `FILTER_OPTS`
func test_the_first_filter_is_all() -> void:
	var f: Array = AutoAdvanceVm.build("", true)["filters"]
	assert_str(String(f[0]["id"])).is_equal("all")
	assert_bool(bool(f[0]["on"])).is_true()
	assert_int(f.size()).is_equal(13)


# ── 목록 ──────────────────────────────────────────────────────

## 🔴 **최근 것이 위다** — 02 `.slice(-50).reverse()`.
## 오래된 게 위면 스무 해를 넘긴 뒤 방금 무슨 일이 있었는지 못 찾는다
func test_the_newest_event_comes_first() -> void:
	_fill()
	var evs: Array = AutoAdvanceVm.build("", true)["events"]
	assert_str(String(evs[0]["head"])).override_failure_message(
		"오래된 것이 위에 있다").contains("콜업")


## ⚠ **사람은 다섯까지만** — 02도 그렇다. 콜업 한 건에 스무 명이 들어가는
## 해가 있는데 그러면 목록이 그 한 건으로 꽉 찬다
func test_a_big_event_is_trimmed_to_five() -> void:
	var many: Array = []
	for i in 9:
		many.append(_p("사람%d" % i))
	EventLog.push("callup", 2030, many, 40)
	var ev: Dictionary = AutoAdvanceVm.build("", true)["events"][0]
	assert_int(ev["people"].size()).is_equal(5)
	assert_int(int(ev["more"])).is_equal(4)
	assert_str(String(ev["more_label"])).contains("4명")


## 다섯 이하면 "외 N명"을 안 붙인다
func test_a_small_event_has_no_more_label() -> void:
	EventLog.push("retire", 2030, [_p("가")], 200)
	var ev: Dictionary = AutoAdvanceVm.build("", true)["events"][0]
	assert_str(String(ev["more_label"])).is_empty()


## 최근 로그는 **머리줄만** 열 개 — 02 `recentLog`
func test_recent_lines_are_headers_only() -> void:
	for i in 14:
		EventLog.push("trade", 2030, [_p("사람%d" % i)], 40, i)
	var recent: Array = AutoAdvanceVm.build("", true)["recent"]
	assert_int(recent.size()).is_equal(10)
	# ⚠ **한 줄만 보면 못 잡는다** — 첫 줄은 어차피 머리줄이라
	# 사람 줄을 섞어도 통과한다. **열 줄을 다 본다**
	for line in recent:
		assert_str(String(line)).override_failure_message(
			"사람 줄이 섞였다 — 머리줄만 모아야 한다: %s" % line) 			.starts_with("[")


# ── 내보내기 ──────────────────────────────────────────────────

## 🔴 **`lines_of`를 쓴다** — 화면과 파일이 두 벌이면 어긋난다
func test_the_export_uses_the_same_lines() -> void:
	_fill()
	var text: String = AutoAdvanceVm.export_text()
	assert_str(text).contains("트레이드")
	assert_str(text).contains("가")
	# 화면이 쓰는 머리줄이 파일에도 그대로 있다
	var head: String = String(
		AutoAdvanceVm.build("", true)["events"][0]["head"])
	assert_str(text).override_failure_message(
		"파일과 화면의 줄이 다르다").contains(head)


func test_the_export_writes_a_file() -> void:
	_fill()
	var path: String = AutoAdvanceVm.export_to_file()
	assert_str(path).is_not_empty()
	assert_bool(FileAccess.file_exists("user://logs/auto-advance.txt")) \
		.override_failure_message("파일이 안 만들어졌다").is_true()


# ── 화면에 붙었나 (형태 ①) ────────────────────────────────────

## 🔴 **만들어 놓고 안 부르면 없는 것과 같다.** 이 저장소에서 "엔진만 있고
## 호출 0"이 아홉 번 나왔다
func test_the_main_screen_shows_the_summary() -> void:
	_fill()
	var screen: MainScreen = auto_free(SCREEN.instantiate())
	add_child(screen)
	screen.set_auto_stop("은퇴")

	var texts: PackedStringArray = []
	_collect(screen, texts)
	var joined: String = "\n".join(texts)
	assert_str(joined).override_failure_message(
		"중지 사유가 안 뜬다").contains("은퇴")
	assert_str(joined).override_failure_message(
		"자동 진행 중에 무슨 일이 있었는지 화면에 없다").contains("트레이드")


## 아무 일도 없었으면 요약을 안 띄운다 — 빈 줄이 자리를 먹는다
func test_nothing_happened_shows_no_summary() -> void:
	var screen: MainScreen = auto_free(SCREEN.instantiate())
	add_child(screen)
	screen.set_auto_stop("은퇴")
	var texts: PackedStringArray = []
	_collect(screen, texts)
	assert_str("\n".join(texts)).not_contains("트레이드")


func _collect(node: Node, out: PackedStringArray) -> void:
	if node is Label and node.visible:
		out.append((node as Label).text)
	for c in node.get_children():
		_collect(c, out)
