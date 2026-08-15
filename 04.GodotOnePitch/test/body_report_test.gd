extends GdUnitTestSuite

## 내 몸 월간 리포트 — C-6.
##
## 원본: `usecases/weekPhases/myBodyReport.ts`
##
## ⚠ **NPC 부상은 월간인데 내 몸만 낱개로 왔다.** 04는 한술 더 떠서
## `body_log`를 쌓기만 하고 아무 데도 안 보여줬다.


func _state(log: Array = [], injury = null) -> Dictionary:
	var s: Dictionary = {
		"season_year": 2030,
		"protagonist": {"id": "ME", "team_id": "T1"},
		"body_log": log,
	}
	# 주인공의 부상은 `protagonist.injury`에 산다 — NPC와 자리가 다르다
	if injury != null:
		s["protagonist"]["injury"] = injury
	return s


func _warning(day: int) -> Dictionary:
	return {"day": day, "kind": "warning", "fatigue": 88.0, "risk": 0.3}


func _healed(day: int, t: String = "SHOULDER_INFLAM",
		penalty: Dictionary = {}) -> Dictionary:
	return {"day": day, "kind": "healed", "injury_type": t,
		"severity": "moderate", "penalty": penalty}


# ── 빈 리포트를 안 보낸다 ─────────────────────────────────────

## ⚠ **"왔는데 아무것도 없다"가 되면 안 된다**
func test_nothing_to_say_means_no_report() -> void:
	assert_bool(BodyReport.build(_state(), 28 * 7).is_empty()).is_true()
	assert_bool(BodyReport.message_of(_state(), 28 * 7).is_empty()).is_true()


func test_no_protagonist_means_no_report() -> void:
	var s: Dictionary = {"season_year": 2030, "protagonist": {}}
	assert_bool(BodyReport.build(s, 28 * 7).is_empty()).is_true()


# ── 무엇을 담나 ───────────────────────────────────────────────

func test_it_counts_the_warnings() -> void:
	var r: Dictionary = BodyReport.build(
		_state([_warning(26 * 7), _warning(27 * 7)]), 28 * 7)
	assert_int(int(r["warnings"])).is_equal(2)
	assert_str("\n".join(PackedStringArray(r["lines"]))).contains("피로 경고 2회")


## ⚠ **지난달 것을 또 담지 않는다.** 안 자르면 경고가 매달 누적으로 뜬다
func test_last_months_events_are_not_repeated() -> void:
	var r: Dictionary = BodyReport.build(
		_state([_warning(1 * 7), _warning(27 * 7)]), 28 * 7)
	assert_int(int(r["warnings"])).override_failure_message(
		"지난달 경고까지 이번 달에 담았다").is_equal(1)


## NPC 부상 소식과 **같은 주기**로 묶는다 — 그 비대칭을 없애는 게 뜻이다
func test_the_window_matches_the_npc_report() -> void:
	var span: int = Injury.news_period() * Calendar.DAYS_PER_WEEK
	var r: Dictionary = BodyReport.build(
		_state([_warning(28 * 7 - span + 7)]), 28 * 7)
	assert_int(int(r["warnings"])).is_equal(1)


func test_it_reports_a_recovery() -> void:
	var r: Dictionary = BodyReport.build(_state([_healed(27 * 7)]), 28 * 7)
	assert_int(r["healed"].size()).is_equal(1)
	assert_str("\n".join(PackedStringArray(r["lines"]))).contains("복귀")


## 나은 게 곧 원래대로는 아니다 — 후유증이 남았으면 그렇게 말한다
func test_a_recovery_with_an_aftereffect_says_so() -> void:
	var r: Dictionary = BodyReport.build(
		_state([_healed(27 * 7, "SHOULDER_INFLAM", {"velocity": -2.0})]), 28 * 7)
	assert_bool(r["healed"][0]["has_penalty"]).is_true()
	assert_str("\n".join(PackedStringArray(r["lines"]))).contains("후유증")


## ⚠ **부상 이름을 id로 두지 않는다.** 02는 `injuryType`을 그대로 넣어
## 화면에 `SHOULDER_INFLAM`이 그대로 떴다 — 이름으로 바꾸는 층을 한 겹
## 빠뜨리면 조용히 원문이 샌다
func test_the_injury_id_never_reaches_the_text() -> void:
	var r: Dictionary = BodyReport.build(_state([_healed(27 * 7)]), 28 * 7)
	var text: String = JSON.stringify(r)
	assert_str(text).override_failure_message(
		"부상 id가 그대로 샜다: %s" % text).not_contains("SHOULDER_INFLAM")
	assert_str(String(r["healed"][0]["name"])).is_not_empty()


## 월말에 아직 다쳐 있으면 요약으로 싣는다 — 사건이 없어도 그건 알려야 한다
func test_a_standing_injury_is_summarised() -> void:
	var r: Dictionary = BodyReport.build(_state([],
		{"type": "SHOULDER_INFLAM", "severity": "moderate", "weeks_left": 3}),
		28 * 7)
	assert_bool(r.is_empty()).override_failure_message(
		"다쳐 있는데 아무 말도 안 한다").is_false()
	assert_int(int(r["injury"]["weeks_left"])).is_equal(3)
	assert_str(String(r["injury"]["severity_label"])).is_equal("중등도")


## 다 나았으면 부상 요약을 안 싣는다
func test_a_finished_injury_is_not_summarised() -> void:
	var r: Dictionary = BodyReport.build(_state([_warning(27 * 7)],
		{"type": "SHOULDER_INFLAM", "severity": "moderate", "weeks_left": 0}),
		28 * 7)
	assert_bool((r["injury"] as Dictionary).is_empty()).is_true()


# ── 소식 한 통 ────────────────────────────────────────────────

## ⚠ **id에 연도를 넣는다.** 주차는 시즌마다 1로 돌아간다 — 02는 그
## 중복 하나로 세이브가 아예 안 열렸다
func test_the_message_id_carries_the_year() -> void:
	var m: Dictionary = BodyReport.message_of(_state([_warning(27 * 7)]), 28 * 7)
	assert_str(String(m["id"])).contains("2030")


func test_the_message_has_a_preview_and_a_body() -> void:
	var m: Dictionary = BodyReport.message_of(_state([_warning(27 * 7)]), 28 * 7)
	assert_str(String(m["preview"])).is_not_empty()
	assert_str(String(m["body"])).is_not_empty()
	assert_bool(m["read"]).is_false()


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **소식 주에 한 통 온다.** 04는 `body_log`를 쌓기만 하고 읽는 곳이
## 진로 판정 하나뿐이라 경고도 완치도 한 번도 안 보였다
func test_the_report_reaches_the_mailbox() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var week: int = Injury.news_period()
	var day: int = week * Calendar.DAYS_PER_WEEK
	s["body_log"] = [_warning(day - 7)]
	s["mailbox"] = []

	InjuryRunner.run(s, day)

	var found: bool = false
	for m in s["mailbox"]:
		if String(m.get("subject", "")) == "몸 상태":
			found = true
	assert_bool(found).override_failure_message(
		"소식 주인데 내 몸 리포트가 안 왔다 — 배선이 끊겼다").is_true()


## 소식 주가 아니면 안 온다 — 매주 오면 월간의 뜻이 없다
func test_no_report_outside_the_news_week() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["body_log"] = [_warning(1 * 7)]
	s["mailbox"] = []

	InjuryRunner.run(s, 3 * 7)
	assert_array(s["mailbox"]).override_failure_message(
		"소식 주가 아닌데 리포트가 왔다").is_empty()


## 심각도 이름의 정본은 하나다 — 화면에도 소식에도 같은 말이 떠야 한다
func test_the_severity_label_has_one_source() -> void:
	var src := FileAccess.get_file_as_string("res://ui/status_vm.gd")
	assert_str(src).override_failure_message(
		"화면이 심각도 표를 또 갖고 있다").not_contains("\"중등도\"")
	assert_str(Injury.severity_label("surgery")).is_equal("수술")
