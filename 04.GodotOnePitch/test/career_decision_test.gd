extends GdUnitTestSuite

## 진로 결정 — 지원 → 결과 → 선택 → 계약. B-6d.
##
## ⚠ **02는 이 로직이 전부 모달(.svelte) 안에 있었다.** 헤드리스로 못 불러서
## 고교 졸업 이후 경로가 통째로 자동 검증에서 비어 있었고, 그래서
## **주인공은 애초에 지명될 수 없었다** — `draftDrafted`를 true로 만드는
## 곳이 어디에도 없었다. 프로 콘텐츠 전부가 도달 불가였다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _peer(id: String, ovr: float, grade: int = 3,
		league: String = "LEAGUE_HIGHSCHOOL") -> Dictionary:
	return {"id": id, "league_id": league, "grade": grade, "position": "SP",
		"player_type": "pitcher", "pitching": {"ovr": ovr}, "batting": {}}


## 또래 아홉(OVR 40~64)과 나. **기본값 70이면 내가 제일 낫다**
func _rosters(mine_ovr: float = 70.0) -> Dictionary:
	var mates: Array = []
	for i in range(9):
		mates.append(_peer("N%d" % i, 40.0 + float(i) * 3.0))
	mates.append({"id": "ME", "league_id": "LEAGUE_HIGHSCHOOL", "grade": 3,
		"position": "SP", "player_type": "pitcher",
		"pitching": {"ovr": mine_ovr}, "batting": {}})
	return {"TEAM_HS_AEWOL": mates}


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 300, "season_year": 2030, "seed": 1,
		"protagonist": {
			"id": "ME", "name": "김한결",
			"career_stage": "highschool", "league_id": "LEAGUE_HIGHSCHOOL",
			"team_id": "TEAM_HS_AEWOL", "grade": 3, "age": 18,
			"player_type": "pitcher", "position": "SP",
			"pitching": {"ovr": 70.0}, "batting": {},
			"scout_score": 30.0, "money": 0,
			"career_records": [], "career_events": [],
		},
		"school": {"gpa": 3.5, "major": "체육교육"},
		"world": {"rosters": _rosters()},
		"body_log": [], "pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


func _record(ps: String, awards: Array = [],
		league: String = "LEAGUE_HIGHSCHOOL") -> Dictionary:
	return {"year": 2029, "league_id": league, "ps_result": ps, "awards": awards}


# ── 지원 ──────────────────────────────────────────────────────

func test_the_application_is_kept() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "career_choice_hub"})
	var apps: Dictionary = CareerDecision.submit_applications(s, {
		"draft": true,
		"university_choices": ["TEAM_UNIV_NAMAK"],
		"independent_choices": ["TEAM_IND_SEOUL_COMETS"],
	})
	assert_bool(bool(apps["draft_applied"])).is_true()
	assert_bool(bool(CareerDecision.of(s)["submitted"])).is_true()
	assert_bool(Pending.has(s, "career_choice_hub")).override_failure_message(
		"원서를 냈는데 지원 화면이 다시 열린다").is_false()


## 지망은 갈래마다 셋까지 — 넷을 쓰면 앞의 셋만 간다
func test_only_three_choices_go_through() -> void:
	var s: Dictionary = _state()
	var apps: Dictionary = CareerDecision.submit_applications(s, {
		"draft": false,
		"university_choices": ["A", "B", "C", "D"],
		"independent_choices": ["E", "F", "G", "H"],
	})
	assert_int(apps["university_choices"].size()).is_equal(3)
	assert_int(apps["independent_choices"].size()).is_equal(3)
	assert_str(String(apps["university_choices"][0])).is_equal("A")


## ⚠ **학적 역행을 여기서 막는다.** 02는 화면에서만 걸렀고, 구 세이브에 남은
## 지원 기록이 결과 계산으로 흘러들어 **대학 두 번 입학**이 성립했다
func test_a_university_student_cannot_apply_to_a_university() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "university"
	var apps: Dictionary = CareerDecision.submit_applications(s, {
		"draft": true,
		"university_choices": ["TEAM_UNIV_NAMAK"],
		"independent_choices": ["TEAM_IND_SEOUL_COMETS"],
	})
	assert_array(apps["university_choices"]).override_failure_message(
		"대학생이 대학에 원서를 냈다").is_empty()
	assert_array(apps["independent_choices"]).is_not_empty()


func test_a_pro_cannot_apply_to_the_independent_league() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "pro_kbl"
	var apps: Dictionary = CareerDecision.submit_applications(s, {
		"draft": false, "independent_choices": ["TEAM_IND_SEOUL_COMETS"]})
	assert_array(apps["independent_choices"]).is_empty()


# ── 드래프트 후보 ─────────────────────────────────────────────

## ⚠ **또래 안에서 몇 등인지가 절대 능력보다 무겁다.** 안 재면 판정이
## OVR을 백분위처럼 쓰는 옛 폴백으로 떨어진다
func test_the_percentile_is_measured_against_peers() -> void:
	var top: Dictionary = CareerDecision.draft_candidate(_state())
	assert_float(float(top["percentile"])).override_failure_message(
		"또래 아홉을 다 앞서는데 백분위가 %.1f다" % top["percentile"]).is_equal(100.0)

	var s: Dictionary = _state({"world": {"rosters": _rosters(30.0)}})
	s["protagonist"]["pitching"] = {"ovr": 30.0}
	assert_float(float(CareerDecision.draft_candidate(s)["percentile"])
		).override_failure_message("또래보다 못한데 백분위가 높다").is_equal(0.0)


## ⚠ **나를 분모에서 뺀다.** 자기 자신을 넣으면 인원수만큼 낮게 나온다
func test_i_am_not_my_own_peer() -> void:
	assert_float(float(CareerDecision.draft_candidate(_state())["percentile"])
		).is_equal(100.0)


## 다른 학년은 또래가 아니다.
##
## ⚠ **나보다 나은 저학년을 넣어야 검사가 뭔가를 본다** — 못하는 저학년을
## 넣으면 걸러도 안 걸러도 백분위가 100이라 아무것도 안 재는 검사가 된다
func test_only_the_same_grade_counts_as_a_peer() -> void:
	var s: Dictionary = _state()
	var mates: Array = s["world"]["rosters"]["TEAM_HS_AEWOL"]
	for i in range(20):
		mates.append(_peer("Y%d" % i, 95.0, 1))
	assert_float(float(CareerDecision.draft_candidate(s)["percentile"])
		).override_failure_message("저학년이 또래에 섞였다").is_equal(100.0)


## 야수는 투수 또래가 아니다 — 겨루는 자리가 다르다
func test_only_pitchers_count_as_a_peer() -> void:
	var s: Dictionary = _state()
	var mates: Array = s["world"]["rosters"]["TEAM_HS_AEWOL"]
	for i in range(20):
		mates.append({"id": "B%d" % i, "league_id": "LEAGUE_HIGHSCHOOL",
			"grade": 3, "position": "C", "player_type": "batter",
			"pitching": {}, "batting": {"ovr": 95.0}})
	assert_float(float(CareerDecision.draft_candidate(s)["percentile"])
		).override_failure_message("야수가 투수 또래에 섞였다").is_equal(100.0)


## 다른 리그도 또래가 아니다 — 대학생과 겨루면 고3의 백분위가 짓눌린다
func test_only_the_same_league_counts_as_a_peer() -> void:
	var s: Dictionary = _state()
	var mates: Array = s["world"]["rosters"]["TEAM_HS_AEWOL"]
	for i in range(20):
		mates.append(_peer("U%d" % i, 95.0, 3, "LEAGUE_UNIVERSITY"))
	assert_float(float(CareerDecision.draft_candidate(s)["percentile"])
		).override_failure_message("대학 선수가 고교 또래에 섞였다").is_equal(100.0)


## ⚠ **또래가 없으면 가운데로 본다.** 0으로 두면 세계가 얇은 검사에서
## 전원 미지명이 된다
func test_no_peers_means_the_middle() -> void:
	var s: Dictionary = _state({"world": {"rosters": {}}})
	assert_float(float(CareerDecision.draft_candidate(s)["percentile"])).is_equal(50.0)


func test_the_team_ace_is_rank_one() -> void:
	assert_int(int(CareerDecision.draft_candidate(_state())["team_ace_rank"])
		).is_equal(1)


func test_a_better_teammate_pushes_me_down() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["TEAM_HS_AEWOL"].append(_peer("ACE", 90.0))
	assert_int(int(CareerDecision.draft_candidate(s)["team_ace_rank"])
		).override_failure_message("팀에 나보다 나은 투수가 있는데 내가 에이스다").is_equal(2)


## 동률은 나를 밀어내지 않는다 — "나보다 **나은** 사람 수 + 1"이다
func test_an_equal_teammate_does_not_push_me_down() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["TEAM_HS_AEWOL"].append(_peer("TWIN", 70.0))
	assert_int(int(CareerDecision.draft_candidate(s)["team_ace_rank"])
		).override_failure_message("나와 똑같은 동료가 나를 2번으로 밀었다").is_equal(1)


## ⚠ **대회 성적은 평균이다.** 합으로 두면 한 해 더 다닌 사람이 유리해진다
func test_the_tournament_score_is_an_average() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [
		_record("champion"), _record("not_qualified")]
	assert_float(float(CareerDecision.draft_candidate(s)["tournament_score"])
		).override_failure_message("대회 성적이 합으로 쌓였다").is_equal_approx(55.0, 0.01)


func test_no_high_school_record_falls_back_to_plain() -> void:
	assert_float(float(CareerDecision.draft_candidate(_state())["tournament_score"])
		).is_equal(Draft.TOURNAMENT_BASE)


func test_the_university_seasons_do_not_count() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [_record("champion", [], "LEAGUE_UNIVERSITY")]
	assert_float(float(CareerDecision.draft_candidate(s)["tournament_score"])
		).is_equal(Draft.TOURNAMENT_BASE)


## MVP와 그 밖의 수상을 가른다 — MVP가 더 무겁다
func test_the_mvp_is_counted_apart() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [_record("champion",
		[{"id": "mvp"}, {"id": "best_era"}, {"id": "best_k"}])]
	var c: Dictionary = CareerDecision.draft_candidate(s)
	assert_int(int(c["award_mvps"])).is_equal(1)
	assert_int(int(c["award_titles"])).is_equal(2)


## ⚠ **부상을 심각도로 가른다.** 02는 중등도 이상을 건당 −12로 뭉쳐서
## 감점이 −252까지 갔고, 30커리어 중 6명이 이 항 하나로 미지명이었다
func test_the_injuries_are_counted_by_severity() -> void:
	var s: Dictionary = _state()
	s["body_log"] = [
		{"kind": "healed", "severity": "moderate"},
		{"kind": "healed", "severity": "moderate"},
		{"kind": "healed", "severity": "surgery"},
		{"kind": "warning", "severity": "severe"},
		{"kind": "healed", "severity": ""},
	]
	var c: Dictionary = CareerDecision.draft_candidate(s)
	assert_int(int(c["moderate_injuries"])).is_equal(2)
	assert_int(int(c["surgery_injuries"])).is_equal(1)
	assert_int(int(c["severe_injuries"])).override_failure_message(
		"경고가 부상 이력으로 세어졌다").is_equal(0)


func test_the_scout_score_reaches_the_candidate() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["scout_score"] = 80.0
	assert_float(float(CareerDecision.draft_candidate(s)["scout_score"])).is_equal(80.0)


# ── 결과 ──────────────────────────────────────────────────────

func test_no_application_means_no_result() -> void:
	var s: Dictionary = _state()
	assert_dict(CareerDecision.build_results(s, _rng())).is_empty()


## ⚠ **주인공이 실제로 지명된다.** 02에는 이 값을 true로 만드는 곳이
## 어디에도 없어서 프로에 갈 수가 없었다
func test_a_good_player_actually_gets_drafted() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [_record("champion", [{"id": "mvp"}])]
	CareerDecision.submit_applications(s, {"draft": true})
	var r: Dictionary = CareerDecision.build_results(s, _rng())
	assert_bool(bool(r["drafted"])).override_failure_message(
		"또래를 다 앞서고 우승·MVP까지 했는데 미지명이다").is_true()
	assert_int(int(r["draft_round"])).is_greater(0)
	assert_str(String(r["draft_team_id"])).is_not_empty()


func test_not_applying_means_not_drafted() -> void:
	var s: Dictionary = _state()
	CareerDecision.submit_applications(s, {"draft": false,
		"university_choices": ["TEAM_UNIV_NAMAK"]})
	var r: Dictionary = CareerDecision.build_results(s, _rng())
	assert_bool(bool(r["drafted"])).override_failure_message(
		"드래프트에 신청도 안 했는데 지명됐다").is_false()


func test_the_result_opens_the_result_screen() -> void:
	var s: Dictionary = _state()
	CareerDecision.submit_applications(s, {"draft": true})
	CareerDecision.build_results(s, _rng())
	assert_bool(Pending.has(s, "career_results")).override_failure_message(
		"결과가 정해졌는데 아무도 안 물어본다").is_true()


## ⚠ **한 번만 정한다.** 안 그러면 결과 화면을 다시 열 때마다 지명 순위가
## 바뀐다
func test_the_result_does_not_change_when_you_look_again() -> void:
	var s: Dictionary = _state()
	CareerDecision.submit_applications(s, {"draft": true})
	var first: Dictionary = CareerDecision.build_results(s, _rng(3))
	var again: Dictionary = CareerDecision.build_results(s, _rng(99))
	assert_dict(again).override_failure_message(
		"다시 보니 결과가 달라졌다").is_equal(first)


## 안전 지원(★1 대학 · ★1 독립)이면 대개 붙는다 — 결과에 실려 나와야 한다
func test_the_admissions_come_back_in_the_result() -> void:
	var univ: int = 0
	var indie: int = 0
	for i in range(20):
		var s: Dictionary = _state()
		CareerDecision.submit_applications(s, {"draft": false,
			"university_choices": ["TEAM_UNIV_NAMAK"],
			"independent_choices": ["TEAM_IND_SEOUL_COMETS"]})
		var r: Dictionary = CareerDecision.build_results(s, _rng(i + 1))
		if not r["university_passed"].is_empty():
			univ += 1
		if not r["independent_passed"].is_empty():
			indie += 1
	assert_int(univ).override_failure_message(
		"안전 지원 대학에 20번 중 %d번밖에 안 붙었다 — 입시 결과가 안 실린다" % univ
	).is_greater(12)
	assert_int(indie).override_failure_message(
		"안전 지원 독립에 20번 중 %d번밖에 안 붙었다" % indie).is_greater(12)


## 학점이 대학 판정에 실린다 — 안 실리면 4년 관리한 게 뜻이 없다
func test_the_gpa_reaches_the_admissions() -> void:
	var good: int = 0
	var bad: int = 0
	for i in range(30):
		var s: Dictionary = _state()
		s["school"]["gpa"] = 4.5
		CareerDecision.submit_applications(s, {"draft": false,
			"university_choices": ["TEAM_UNIV_HALLYU"]})
		if not CareerDecision.build_results(s, _rng(i + 1)
			)["university_passed"].is_empty():
			good += 1

		var s2: Dictionary = _state()
		s2["school"]["gpa"] = 1.0
		CareerDecision.submit_applications(s2, {"draft": false,
			"university_choices": ["TEAM_UNIV_HALLYU"]})
		if not CareerDecision.build_results(s2, _rng(i + 1)
			)["university_passed"].is_empty():
			bad += 1
	assert_int(good).override_failure_message(
		"학점 4.5와 1.0의 합격 수가 %d vs %d다 — 학점이 안 실렸다" % [good, bad]
	).is_greater(bad)


## 고교 야구 성적도 대학 판정에 실린다 — 한류대(★5)는 야구 40점을 요구한다
func test_the_baseball_record_reaches_the_admissions() -> void:
	var with_record: int = 0
	var without: int = 0
	for i in range(30):
		var s: Dictionary = _state()
		s["school"]["gpa"] = 4.5
		s["protagonist"]["career_records"] = [_record("champion", [{"id": "mvp"}])]
		CareerDecision.submit_applications(s, {"draft": false,
			"university_choices": ["TEAM_UNIV_HALLYU"]})
		if not CareerDecision.build_results(s, _rng(i + 1)
			)["university_passed"].is_empty():
			with_record += 1

		var s2: Dictionary = _state()
		s2["school"]["gpa"] = 4.5
		CareerDecision.submit_applications(s2, {"draft": false,
			"university_choices": ["TEAM_UNIV_HALLYU"]})
		if not CareerDecision.build_results(s2, _rng(i + 1)
			)["university_passed"].is_empty():
			without += 1
	assert_int(with_record).override_failure_message(
		"우승·MVP가 있고 없고가 %d vs %d다 — 야구 성적이 입시에 안 실린다"
		% [with_record, without]).is_greater(without)


func test_confirming_the_result_opens_the_final_choice() -> void:
	var s: Dictionary = _state()
	CareerDecision.submit_applications(s, {"draft": true})
	CareerDecision.build_results(s, _rng())
	assert_bool(CareerDecision.confirm_results(s)).is_true()
	assert_bool(Pending.has(s, "career_results")).is_false()
	assert_bool(Pending.has(s, "career_choice")).is_true()


# ── 지금 무대를 계속한다 ──────────────────────────────────────

## ⚠ **5학년은 없다.** 02는 이 판정이 화면에만 있어서 헤드리스가 계속
## 눌렀고 **주인공이 7년째 대학생(29세)** 이 됐다
func test_a_senior_who_can_graduate_cannot_continue() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "university"
	s["protagonist"]["university_week"] = 157
	s["school"]["gpa"] = 3.5
	assert_bool(CareerDecision.continue_current_stage(s)).override_failure_message(
		"4학년이 한 해 더 다녔다").is_false()


func test_graduating_is_written_down() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "university"
	s["protagonist"]["university_week"] = 157
	CareerDecision.continue_current_stage(s)
	var kinds: Array = []
	for e in s["protagonist"]["career_events"]:
		kinds.append(String(e["type"]))
	assert_array(kinds).override_failure_message(
		"4년을 관리한 결과가 아무 데도 안 남는다").contains(["graduation"])


## ⚠ **학점이 모자라면 한 해 더 다닌다.** 그 갈래에서 대기줄을 안 풀면
## 같은 주가 무한 반복된다
func test_a_senior_who_cannot_graduate_stays_another_year() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "university"
	s["protagonist"]["university_week"] = 157
	s["school"]["gpa"] = 1.0
	Pending.push(s, {"type": "career_choice"})
	assert_bool(CareerDecision.continue_current_stage(s)).is_true()
	assert_bool(Pending.has(s, "career_choice")).override_failure_message(
		"유급인데 진로 결정이 안 풀렸다 — 같은 주가 무한 반복된다").is_false()


func test_an_underclassman_just_moves_up() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "university"
	s["protagonist"]["university_week"] = 53
	Pending.push(s, {"type": "career_choice"})
	assert_bool(CareerDecision.continue_current_stage(s)).is_true()
	assert_bool(Pending.has(s, "career_choice")).is_false()


## 고교생은 계속할 수 없다 — 진로를 정해야 한다
func test_a_high_schooler_must_decide() -> void:
	assert_bool(CareerDecision.continue_current_stage(_state())).is_false()


func test_the_independent_league_can_be_repeated() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "independent"
	assert_bool(CareerDecision.continue_current_stage(s)).is_true()


# ── 신인 계약 ─────────────────────────────────────────────────

## ⚠ **연봉은 균일이고 계약금이 차등을 진다** (KBO 규정).
## 02의 옛 표는 1순위 연봉 9000(규정 위반)에 하위 지명 1500(최저연봉 미달)이었다
func test_the_rookie_salary_is_flat() -> void:
	assert_int(int(CareerDecision.draft_contract(1)["salary"])).is_equal(
		int(CareerDecision.draft_contract(90)["salary"]))
	assert_int(int(CareerDecision.draft_contract(90)["salary"])
		).override_failure_message("하위 지명 연봉이 최저연봉 아래다").is_greater_equal(3000)


func test_the_signing_bonus_follows_the_pick() -> void:
	assert_int(int(CareerDecision.draft_contract(1)["signing_bonus"])).is_greater(
		int(CareerDecision.draft_contract(5)["signing_bonus"]))
	assert_int(int(CareerDecision.draft_contract(5)["signing_bonus"])).is_greater(
		int(CareerDecision.draft_contract(90)["signing_bonus"]))


## ⚠ **구간의 끝 순위가 그 구간에 든다.** 경계를 한 칸 밀려 읽으면
## 1순위가 2~4순위 대우를 받는다 — 표 전체가 한 칸씩 어긋난다
func test_the_pick_band_includes_its_last_pick() -> void:
	assert_int(int(CareerDecision.draft_contract(1)["signing_bonus"])
		).override_failure_message("1순위 계약금이 5억이 아니다").is_equal(50000)
	assert_int(int(CareerDecision.draft_contract(4)["signing_bonus"])).is_greater(
		int(CareerDecision.draft_contract(5)["signing_bonus"]))


func test_a_pick_past_the_table_still_gets_a_contract() -> void:
	assert_int(int(CareerDecision.draft_contract(99999)["signing_bonus"])).is_greater(0)


## 구단의 씀씀이가 계약금에만 곱해진다 — 연봉은 규정상 균일이다
func test_a_generous_club_pays_a_bigger_bonus() -> void:
	var rich: Dictionary = CareerDecision.draft_contract(10, 1.15)
	var poor: Dictionary = CareerDecision.draft_contract(10, 0.85)
	assert_int(int(rich["signing_bonus"])).is_greater(int(poor["signing_bonus"]))
	assert_int(int(rich["salary"])).override_failure_message(
		"신인 연봉에 구단 사정이 붙었다 — 규정상 균일이다").is_equal(int(poor["salary"]))


## ⚠ **배수에 띠가 있다.** 없으면 가난한 구단의 1순위 계약금이 0에 가까워진다
func test_the_club_index_is_banded() -> void:
	assert_int(int(CareerDecision.draft_contract(10, 0.0)["signing_bonus"])).is_equal(
		int(CareerDecision.draft_contract(10, 0.85)["signing_bonus"]))
	assert_int(int(CareerDecision.draft_contract(10, 9.0)["signing_bonus"])).is_equal(
		int(CareerDecision.draft_contract(10, 1.15)["signing_bonus"]))


func test_a_neutral_club_is_the_middle() -> void:
	assert_float(CareerDecision.team_index({}, "TEAM_KBL_A")
		).is_equal_approx(1.0, 0.001)


# ── 최종 선택 ─────────────────────────────────────────────────

func _drafted_state() -> Dictionary:
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [_record("champion", [{"id": "mvp"}])]
	CareerDecision.submit_applications(s, {"draft": true,
		"university_choices": ["TEAM_UNIV_NAMAK"],
		"independent_choices": ["TEAM_IND_SEOUL_COMETS"]})
	CareerDecision.build_results(s, _rng(4))
	CareerDecision.confirm_results(s)
	return s


func test_choosing_the_draft_opens_the_contract_notice() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	assert_dict(a).is_not_empty()
	assert_bool(Pending.has(s, "draft_notification")).is_true()
	assert_bool(Pending.has(s, "career_choice")).is_false()
	assert_int(int(a["salary"])).is_greater(0)
	assert_int(int(a["duration_years"])).is_greater(0)


## ⚠ **거부할 때 갈 곳을 통보에 담는다.** 안 담으면 거부한 사람이
## 갈 곳 없이 남는다
func test_the_notice_carries_the_alternatives() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	assert_str(String(a["alt_university_team_id"])).is_not_empty()
	assert_str(String(a["alt_independent_team_id"])).is_not_empty()


## ⚠ **대학 재학생에게는 대학 대안을 안 준다** — 거부할 때 두 번 입학이 된다
func test_a_university_student_gets_no_university_alternative() -> void:
	var s: Dictionary = _drafted_state()
	s["protagonist"]["career_stage"] = "university"
	CareerDecision.of(s)["results"]["university_passed"] = ["TEAM_UNIV_NAMAK"]
	var a: Dictionary = CareerDecision.choose_draft(s)
	assert_str(String(a["alt_university_team_id"])).override_failure_message(
		"대학생이 대학 대안을 받았다 — 거부하면 두 번 입학이다").is_empty()


func test_you_cannot_choose_a_draft_you_did_not_get() -> void:
	var s: Dictionary = _state()
	CareerDecision.submit_applications(s, {"draft": false})
	CareerDecision.build_results(s, _rng())
	assert_dict(CareerDecision.choose_draft(s)).is_empty()


# ── 진학 · 독립 ───────────────────────────────────────────────

func test_going_to_a_university_moves_you_there() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "career_choice"})
	assert_bool(CareerDecision.choose_school_or_independent(s, "university",
		"TEAM_UNIV_NAMAK")).is_true()
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["career_stage"])).is_equal("university")
	assert_str(String(p["league_id"])).is_equal("LEAGUE_UNIVERSITY")
	assert_str(String(p["team_id"])).is_equal("TEAM_UNIV_NAMAK")
	assert_bool(Pending.has(s, "career_choice")).is_false()


## ⚠ **재학 주차가 여기서 시작한다** — 학년의 정본이다
func test_the_university_clock_starts_at_one() -> void:
	var s: Dictionary = _state()
	CareerDecision.choose_school_or_independent(s, "university", "TEAM_UNIV_NAMAK")
	assert_int(int(s["protagonist"]["university_week"])).override_failure_message(
		"재학 주차가 안 시작됐다 — 학년이 영영 안 오른다").is_equal(1)


## ⚠ **학적 역행은 거부한다.** 통과시키면 대학 두 번 입학이다
func test_a_university_student_cannot_enroll_again() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "university"
	assert_bool(CareerDecision.choose_school_or_independent(s, "university",
		"TEAM_UNIV_NAMAK")).override_failure_message(
		"대학에 두 번 입학했다").is_false()


func test_joining_the_independent_league_opens_a_negotiation() -> void:
	var s: Dictionary = _state()
	assert_bool(CareerDecision.choose_school_or_independent(s, "independent",
		"TEAM_IND_SEOUL_COMETS")).is_true()
	var a: Dictionary = Pending.first(s, "salary_negotiation")
	assert_dict(a).override_failure_message(
		"독립리그에 들어갔는데 계약 이야기가 없다").is_not_empty()
	assert_str(String(a["context"])).is_equal("initial")


## ⚠ **1년 단기 고정이라 min=max=1이다.** 02에서 이 세 필드가 빠져
## 협상 화면이 빈 값을 읽었다
func test_the_independent_deal_is_one_year_fixed() -> void:
	var s: Dictionary = _state()
	CareerDecision.choose_school_or_independent(s, "independent",
		"TEAM_IND_SEOUL_COMETS")
	var a: Dictionary = Pending.first(s, "salary_negotiation")
	assert_int(int(a["duration_years"])).is_equal(1)
	assert_int(int(a["min_duration_years"])).is_equal(1)
	assert_int(int(a["max_duration_years"])).is_equal(1)


func test_a_better_player_is_offered_more() -> void:
	var s: Dictionary = _state()
	var plain: Dictionary = CareerDecision.independent_offer(s, "T")
	s["protagonist"]["pitching"] = {"ovr": 90.0}
	var strong: Dictionary = CareerDecision.independent_offer(s, "T")
	assert_int(int(strong["offered_salary"])).is_greater(int(plain["offered_salary"]))


func test_the_offer_has_a_floor() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["pitching"] = {"ovr": 10.0}
	assert_int(int(CareerDecision.independent_offer(s, "T")["offered_salary"])
		).override_failure_message("연봉 제안이 0 아래로 내려갔다").is_greater(0)


# ── 지명 거부 ─────────────────────────────────────────────────

func test_rejecting_goes_to_the_university_alternative() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	assert_str(CareerDecision.reject_draft_offer(s, a, 300)).is_equal("university")
	assert_str(String(s["protagonist"]["career_stage"])).is_equal("university")
	assert_bool(Pending.has(s, "draft_notification")).is_false()


func test_rejecting_falls_back_to_the_independent_league() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	a["alt_university_team_id"] = ""
	assert_str(CareerDecision.reject_draft_offer(s, a, 300)).is_equal("independent")
	assert_str(String(s["protagonist"]["career_stage"])).is_equal("independent")
	assert_bool(Pending.has(s, "salary_negotiation")).override_failure_message(
		"독립리그로 갔는데 계약 이야기가 없다").is_true()


## ⚠ **갈 곳이 없으면 현역 입대다.** 02는 이 경로가 오프시즌을 빠뜨려
## 그해 세계가 통째로 정체됐다 — 입대 처리는 `Military` 하나가 정본이다
func test_rejecting_with_nowhere_to_go_means_the_army() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	a["alt_university_team_id"] = ""
	a["alt_independent_team_id"] = ""
	assert_str(CareerDecision.reject_draft_offer(s, a, 300)).is_equal("general")
	assert_str(String(s["protagonist"]["career_stage"])).is_equal("military")


## ⚠ **대학 재학생은 대학 대안이 있어도 안 간다** — 두 번 입학이다
func test_a_university_student_rejecting_does_not_re_enroll() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	s["protagonist"]["career_stage"] = "university"
	a["alt_university_team_id"] = "TEAM_UNIV_NAMAK"
	assert_str(CareerDecision.reject_draft_offer(s, a, 300)
		).override_failure_message("대학생이 거부하고 대학에 또 들어갔다"
		).is_not_equal("university")


# ── 지명 수락 ─────────────────────────────────────────────────

func test_accepting_makes_you_a_pro() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	assert_bool(CareerDecision.accept_draft_offer(s, a)).is_true()
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["career_stage"])).is_equal("pro_kbl")
	assert_str(String(p["league_id"])).is_equal("LEAGUE_KBL")
	assert_str(String(p["team_id"])).is_equal(String(a["team_id"]))
	assert_int(int(p["salary"])).is_equal(int(a["salary"]))
	assert_int(int(p["contract_years"])).is_equal(int(a["duration_years"]))
	assert_bool(Pending.has(s, "draft_notification")).is_false()


## ⚠ **계약금이 그 자리에서 자산이 된다.** 안 더하면 화면에만 있는 숫자다
func test_the_signing_bonus_becomes_money() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	CareerDecision.accept_draft_offer(s, a)
	assert_int(int(s["protagonist"]["money"])).is_equal(int(a["signing_bonus"]))


func test_being_drafted_is_written_down() -> void:
	var s: Dictionary = _drafted_state()
	var a: Dictionary = CareerDecision.choose_draft(s)
	CareerDecision.accept_draft_offer(s, a)
	var kinds: Array = []
	for e in s["protagonist"]["career_events"]:
		kinds.append(String(e["type"]))
	assert_array(kinds).contains(["drafted"])


## ⚠ **학년은 학생일 때만 뜻이 있다** — 프로가 3학년을 달고 다니면
## 결산 화면 머리글이 그걸 먼저 읽는다
func test_a_pro_does_not_carry_a_school_grade() -> void:
	var s: Dictionary = _drafted_state()
	CareerDecision.accept_draft_offer(s, CareerDecision.choose_draft(s))
	assert_int(int(s["protagonist"].get("grade", 0))).is_equal(0)
