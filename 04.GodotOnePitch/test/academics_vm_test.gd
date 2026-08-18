extends GdUnitTestSuite

## 학사 화면 ViewModel — C-3.
##
## 원본: `pages/academics/AcademicsPage.svelte`
##
## ⚠ **이 화면이 `study_mode`와 `major`를 쓰는 쪽이다.** 04는 둘 다 읽는
## 코드만 있고 세우는 데가 없어서, 전 커리어가 "normal" 고정이었고
## 전공 표 셋이 통째로 도달 불가였다.


func _state(school: Dictionary = {}, league: String = "LEAGUE_HIGHSCHOOL",
		over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 7, "season_year": 2030,
		"protagonist": {"id": "ME", "league_id": league},
		"school": school,
	}
	s.merge(over, true)
	return s


func _option(vm: Dictionary, mode: String) -> Dictionary:
	for o in vm["study"]["options"]:
		if String(o["id"]) == mode:
			return o
	return {}


# ── 학교에 다닐 때만 ──────────────────────────────────────────

func test_a_student_is_at_school() -> void:
	assert_bool(AcademicsVm.build(_state())["at_school"]).is_true()
	assert_str(String(AcademicsVm.build(_state())["stage"])).is_equal("고교")


func test_a_university_student_says_so() -> void:
	assert_str(String(AcademicsVm.build(_state({}, "LEAGUE_UNIVERSITY"))["stage"])
		).is_equal("대학")


## ⚠ **프로에는 학사가 없다.** 02는 프로에게도 주간 학업이 돌아
## "[학업] 주간 효율 85%" 로그까지 남았다
func test_a_pro_is_not_at_school() -> void:
	var vm: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_KBL"))
	assert_bool(vm["at_school"]).is_false()
	# 탭을 만드는 쪽이 이 값을 읽는다 — 여기가 정본이다
	assert_bool(StatusVm._tabs(vm).has({"id": "academics", "label": "학업"})
		).is_false()


# ── 학점 ──────────────────────────────────────────────────────

## ⚠ **한 학기도 안 끝났으면 숫자를 안 만든다.** 0.00으로 채우면 시험도
## 안 본 신입생이 낙제로 보인다 — 02가 안 뛴 선수를 0.00 방어율로 띄웠다
func test_a_freshman_has_no_gpa_yet() -> void:
	var g: Dictionary = AcademicsVm.build(_state())["gpa"]
	assert_bool(g["has"]).is_false()
	assert_str(String(g["label"])).contains("아직")


func test_a_finished_semester_shows_the_gpa() -> void:
	var g: Dictionary = AcademicsVm.build(_state(
		{"gpa": 3.21, "gpa_terms": 2}))["gpa"]
	assert_bool(g["has"]).is_true()
	assert_str(String(g["label"])).contains("3.21")


## 졸업 자격이 이 화면의 뜻이다 — 학점 자체는 수단이다
func test_the_gpa_says_whether_it_graduates() -> void:
	var ok: Dictionary = AcademicsVm.build(_state(
		{"gpa": 3.0, "gpa_terms": 1}))["gpa"]
	var no: Dictionary = AcademicsVm.build(_state(
		{"gpa": 1.2, "gpa_terms": 1}))["gpa"]
	assert_bool(ok["graduates"]).is_true()
	assert_str(String(ok["note"])).contains("충족")
	assert_bool(no["graduates"]).is_false()
	assert_str(String(no["note"])).contains("부족")


# ── 경고 ──────────────────────────────────────────────────────

func test_a_clean_record_has_no_warning() -> void:
	var w: Dictionary = AcademicsVm.build(_state({"warning_level": 0}))["warning"]
	assert_int(int(w["level"])).is_equal(0)
	assert_bool(w["blocked"]).is_false()


## ⚠ **경고가 훈련을 깎는 것이 학사의 무게다** — 몇 %인지 보여준다
func test_a_warning_shows_the_training_cost() -> void:
	var clean: String = String(AcademicsVm.build(
		_state({"warning_level": 0}))["warning"]["training_label"])
	var warned: String = String(AcademicsVm.build(
		_state({"warning_level": 1}))["warning"]["training_label"])
	assert_str(clean).is_equal("훈련 효율 100%")
	assert_str(warned).override_failure_message(
		"경고를 받았는데 훈련 효율이 그대로라고 쓴다").is_not_equal(clean)


func test_a_suspension_is_marked() -> void:
	var w: Dictionary = AcademicsVm.build(_state({"warning_level": 2}))["warning"]
	assert_bool(w["blocked"]).is_true()
	assert_str(String(w["label"])).is_equal("출전 정지")


# ── 시험 ──────────────────────────────────────────────────────

func test_it_counts_down_to_the_next_exam() -> void:
	var e: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_HIGHSCHOOL",
		{"day": 7}))["exam"]
	assert_str(String(e["label"])).is_equal("중간고사")
	assert_int(int(e["weeks_left"])).is_equal(10)
	assert_str(String(e["line"])).contains("D-10")


## 시험 주에는 "이번 주"라고 말한다 — D-0은 읽는 사람이 세야 한다
func test_the_exam_week_says_this_week() -> void:
	var e: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_HIGHSCHOOL",
		{"day": 11 * 7}))["exam"]
	assert_int(int(e["weeks_left"])).is_equal(0)
	assert_str(String(e["line"])).contains("이번 주")


# ── 전공 ──────────────────────────────────────────────────────

## ⚠ **전공은 대학에서만 고른다.** 고교생에게 띄우면 아직 갈 수도 없는
## 학교의 전공을 고르게 된다
func test_a_highschooler_cannot_pick_a_major() -> void:
	assert_bool(AcademicsVm.build(_state())["major"]["selectable"]).is_false()


func test_a_university_freshman_can_pick_a_major() -> void:
	var m: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_UNIVERSITY"))["major"]
	assert_bool(m["selectable"]).is_true()
	assert_bool(m["picked"]).is_false()
	assert_array(m["options"]).is_not_empty()


## 한 번뿐이고 되돌릴 수 없다 — 고르기 전에 그렇게 말한다
func test_the_major_choice_warns_it_is_final() -> void:
	var m: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_UNIVERSITY"))["major"]
	assert_str(String(m["hint"])).contains("바꿀 수 없")


func test_a_picked_major_closes_the_choice() -> void:
	var m: Dictionary = AcademicsVm.build(
		_state({"major": "체육교육"}, "LEAGUE_UNIVERSITY"))["major"]
	assert_bool(m["picked"]).is_true()
	assert_bool(m["selectable"]).override_failure_message(
		"전공을 골랐는데 또 고를 수 있다 — 되돌릴 수 없는 선택이다").is_false()
	assert_str(String(m["name"])).is_equal("체육교육")


## ⚠ **전공 효과를 규칙 파일에서 만든다.** 옮겨 적으면 표가 둘이 되고
## 규칙을 고쳐도 화면만 안 따라온다 — 02 Phase 7 결함 15건이 그거였다
func test_the_major_effects_come_from_the_rules() -> void:
	var m: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_UNIVERSITY"))["major"]
	var by_name: Dictionary = {}
	for o in m["options"]:
		by_name[String(o["name"])] = String(o["desc"])

	assert_str(String(by_name.get("스포츠과학", ""))).override_failure_message(
		"스포츠과학의 부상 감소가 안 보인다").contains("부상")
	assert_str(String(by_name.get("일반전공", ""))).override_failure_message(
		"일반전공의 학점 배수가 안 보인다").contains("학점")
	assert_str(String(by_name.get("체육교육", ""))).contains("훈련")


func test_every_major_in_the_rules_is_offered() -> void:
	var m: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_UNIVERSITY"))["major"]
	assert_int(m["options"].size()).is_equal(Academics.majors().size())


# ── 학업 모드 ─────────────────────────────────────────────────

func test_it_offers_every_study_mode() -> void:
	var vm: Dictionary = AcademicsVm.build(_state())
	assert_int(vm["study"]["options"].size()).is_equal(4)
	for mode in ["focus", "normal", "rest", "sleep"]:
		assert_bool(_option(vm, String(mode)).is_empty()).override_failure_message(
			"%s 방식이 없다" % mode).is_false()


func test_it_marks_the_current_mode() -> void:
	var vm: Dictionary = AcademicsVm.build(_state({"study_mode": "focus"}))
	assert_bool(_option(vm, "focus")["current"]).is_true()
	assert_bool(_option(vm, "normal")["current"]).is_false()
	assert_str(String(vm["study"]["current_label"])).is_equal("집중 수업")


## ⚠ **대가가 안 보이면 늘 집중이다.** 학점과 훈련을 나란히 보여준다
func test_each_mode_shows_both_sides_of_the_trade() -> void:
	var vm: Dictionary = AcademicsVm.build(_state())
	var focus: String = String(_option(vm, "focus")["effect"])
	var sleep: String = String(_option(vm, "sleep")["effect"])
	assert_str(focus).contains("학점")
	assert_str(focus).contains("훈련")
	assert_str(focus).override_failure_message(
		"집중과 수면의 설명이 같다 — 고를 근거가 없다").is_not_equal(sleep)


## 설명도 규칙 파일에서 만든다 — 옮겨 적으면 표가 둘이 된다
func test_the_mode_effects_come_from_the_rules() -> void:
	var vm: Dictionary = AcademicsVm.build(_state())
	assert_str(String(_option(vm, "focus")["effect"])).contains(
		"%d%%" % int(roundf(Academics.study_training("focus") * 100.0)))
	assert_str(String(_option(vm, "sleep")["effect"])).contains(
		"%.2f" % Academics.study_quality("sleep"))


## 안 정했으면 보통이다 — 세이브에 없을 수 있다
func test_a_missing_mode_falls_to_normal() -> void:
	assert_str(String(AcademicsVm.build(_state())["study"]["current"])
		).is_equal("normal")


# ── 지나간 학기 ───────────────────────────────────────────────

## **최근이 위다** — 마지막 시험이 제일 궁금하다
func test_the_newest_semester_is_first() -> void:
	var vm: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_HIGHSCHOOL", {
		"academic_log": [
			{"day": 77, "year": 2029, "exam": "midterm", "gpa": 2.4,
				"warning_level": 0, "label": ""},
			{"day": 266, "year": 2029, "exam": "final", "gpa": 3.1,
				"warning_level": 0, "label": ""},
		]}))
	assert_int(vm["semesters"].size()).is_equal(2)
	assert_str(String(vm["semesters"][0]["title"])).contains("기말")


## ⚠ **연도는 기록이 갖고 있어야 한다.** 지금 연도를 붙이면 3년 전
## 중간고사가 올해 것으로 뜬다
func test_a_semester_keeps_its_own_year() -> void:
	var vm: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_HIGHSCHOOL", {
		"season_year": 2033,
		"academic_log": [{"day": 77, "year": 2029, "exam": "midterm",
			"gpa": 2.4, "warning_level": 0, "label": ""}]}))
	assert_str(String(vm["semesters"][0]["title"])).override_failure_message(
		"3년 전 학기에 올해 연도가 붙었다: %s" % vm["semesters"][0]["title"]
		).contains("2029")


func test_a_warned_semester_is_marked() -> void:
	var vm: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_HIGHSCHOOL", {
		"academic_log": [{"day": 77, "year": 2029, "exam": "midterm",
			"gpa": 1.2, "warning_level": 1, "label": "학사 경고"}]}))
	assert_bool(vm["semesters"][0]["warned"]).is_true()
	assert_str(String(vm["semesters"][0]["label"])).is_equal("학사 경고")


# ── 대학 무대 ─────────────────────────────────────────────────

## ⚠ **안 뽑힌 것도 결과다.** 빈칸으로 두면 무대가 없는 것처럼 보인다
func test_a_missed_showcase_still_shows() -> void:
	var vm: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_UNIVERSITY", {
		"campus_log": [{"day": 224, "kind": "showcase", "selected": false}]}))
	assert_int(vm["campus"].size()).is_equal(1)
	assert_str(String(vm["campus"][0]["title"])).is_equal("쇼케이스")
	assert_str(String(vm["campus"][0]["line"])).is_equal("미선발")


func test_a_selected_stage_says_so() -> void:
	var vm: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_UNIVERSITY", {
		"campus_log": [{"day": 238, "kind": "allstar", "selected": true}]}))
	assert_bool(vm["campus"][0]["selected"]).is_true()
	assert_str(String(vm["campus"][0]["title"])).is_equal("대학 올스타")


func test_the_newest_stage_is_first() -> void:
	var vm: Dictionary = AcademicsVm.build(_state({}, "LEAGUE_UNIVERSITY", {
		"campus_log": [
			{"day": 224, "kind": "showcase", "selected": false},
			{"day": 238, "kind": "allstar", "selected": true},
		]}))
	assert_str(String(vm["campus"][0]["title"])).is_equal("대학 올스타")


# ── 진짜 세계 ─────────────────────────────────────────────────

## ⚠ **손으로 만든 사전은 결함을 숨긴다.** 진짜로 한 학기를 돌려
## 학기 기록이 쌓이고 화면이 그걸 읽는지 본다
func test_a_real_semester_reaches_the_screen() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var r: AppRoot = auto_free(preload("res://ui/app_root.tscn").instantiate())
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	for w in range(1, 12):
		WeekRunner.run(r.state(), w * 7)

	var vm: Dictionary = AcademicsVm.build(r.state())
	assert_array(vm["semesters"]).override_failure_message(
		"한 학기를 다 돌렸는데 학사 화면에 아무것도 없다").is_not_empty()
	assert_str(String(vm["semesters"][0]["title"])).contains("2027")
	assert_bool(vm["gpa"]["has"]).override_failure_message(
		"학기가 끝났는데 학점이 없다고 한다").is_true()


# ── 이번 학기 진행 ───────────────────────────────────────────────

## 🔴 **매주 쌓기만 하고 학기가 끝나야 읽었다**(형태 ③).
## 학기 중엔 지금 몇 점으로 가고 있는지 볼 방법이 전혀 없었다
func test_이번_학기_예상_학점을_낸다() -> void:
	var school: Dictionary = {"study_weeks": 6, "study_quality_sum": 3.0}
	var pg: Dictionary = AcademicsVm.build(_state(school))["progress"]
	assert_bool(bool(pg["has"])).is_true()
	assert_int(int(pg["weeks"])).is_equal(6)
	# 엔진이 내는 값과 같아야 한다 — 화면이 따로 계산하면 갈린다
	assert_float(float(pg["projected"])).is_equal_approx(
		Academics.semester_gpa(school), 0.001)
	assert_str(String(pg["label"])).contains("예상")


## ⚠ **문턱을 같이 적는다** — 경고선·졸업선을 모르면 2.1이 좋은지 모른다
func test_문턱을_같이_적는다() -> void:
	var pg: Dictionary = AcademicsVm.build(
		_state({"study_weeks": 4, "study_quality_sum": 2.0}))["progress"]
	assert_str(String(pg["note"])).contains("경고선")
	assert_str(String(pg["note"])).contains("졸업선")


## 직전 학기가 있으면 같이 보여준다 — 나아지고 있는지가 그 자리다
func test_직전_학기를_같이_보여준다() -> void:
	var pg: Dictionary = AcademicsVm.build(_state(
		{"study_weeks": 4, "study_quality_sum": 2.0,
			"last_semester_gpa": 3.14}))["progress"]
	assert_str(String(pg["note"])).contains("3.14")


## 경고선 아래면 그렇다고 말한다
func test_경고선_아래면_경고한다() -> void:
	# 품질 0.2 × 6주 → 평균 0.2 → 0.9학점. 경고선 1.75 아래다
	var low: Dictionary = AcademicsVm.build(_state(
		{"study_weeks": 6, "study_quality_sum": 1.2}))["progress"]
	assert_bool(bool(low["warn"])).override_failure_message(
		"예상 %.2f인데 경고가 없다" % float(low["projected"])).is_true()

	var high: Dictionary = AcademicsVm.build(_state(
		{"study_weeks": 6, "study_quality_sum": 4.2}))["progress"]
	assert_bool(bool(high["warn"])).is_false()


## 아직 수업이 없으면 그렇게 말한다 — 0.00으로 찍으면 낙제로 보인다
func test_수업이_없으면_그렇게_말한다() -> void:
	var pg: Dictionary = AcademicsVm.build(_state())["progress"]
	assert_bool(bool(pg["has"])).is_false()
	assert_str(String(pg["label"])).contains("아직")
	assert_bool(bool(pg["warn"])).override_failure_message(
		"수업도 없는데 경고를 띄운다").is_false()
