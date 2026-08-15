extends GdUnitTestSuite

## 주인공 은퇴 — 자발 · 노쇠 · 부상. B-7.
##
## ⚠ **02엔 주인공 은퇴 경로가 아예 없었다.** 은퇴 기록을 남기는 두 곳이
## 전부 NPC였고, 주인공을 은퇴시키는 코드는 어디에도 없었다 — 목표 커리어가
## 15~20시즌인 게임인데 **끝나지 않았다.**


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 364, "season_year": 2040, "seed": 3,
		"protagonist": {
			"id": "ME", "name": "김한결",
			"career_stage": "pro_kbl", "league_id": "LEAGUE_KBL",
			"team_id": "TEAM_KBL_A", "age": 30,
			"player_type": "pitcher", "position": "SP",
			"pitching": {"ovr": 70.0}, "batting": {},
			"salary": 5000, "pro_service_years": 10, "fame": 20.0,
			"retired": false, "injury": null,
			"career_records": [], "career_events": [],
		},
		"world": {"rosters": {"TEAM_KBL_A": []}},
		"pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


func _record(ovr: float) -> Dictionary:
	return {"year": 2039, "league_id": "LEAGUE_KBL", "ovr": ovr,
		"ps_result": "", "awards": []}


func _old(age: int = 39) -> Dictionary:
	var s: Dictionary = _state()
	var p: Dictionary = s["protagonist"]
	p["age"] = age
	p["career_records"] = [_record(70.0), _record(60.0)]
	p["salary"] = 90000
	return s


# ── 누가 은퇴할 수 있나 ───────────────────────────────────────

## ⚠ **학생 신분에서는 "은퇴"가 성립하지 않는다** — 그건 진로 포기이고
## 진로 허브가 이미 다룬다
func test_a_student_does_not_retire() -> void:
	for stage in ["highschool", "university", "military"]:
		var s: Dictionary = _state()
		s["protagonist"]["career_stage"] = stage
		assert_bool(Retirement.can_retire_voluntarily(s["protagonist"])
			).override_failure_message("%s 단계에서 은퇴가 열렸다" % stage).is_false()


func test_a_player_on_the_field_can_stop() -> void:
	for stage in ["pro_kbl", "pro_abl", "pro_jbl", "independent"]:
		var s: Dictionary = _state()
		s["protagonist"]["career_stage"] = stage
		assert_bool(Retirement.can_retire_voluntarily(s["protagonist"])
			).override_failure_message("%s 단계에서 은퇴를 못 한다" % stage).is_true()


func test_you_cannot_retire_twice() -> void:
	var s: Dictionary = _state()
	Retirement.retire(s, Retirement.REASON_VOLUNTARY, 300)
	assert_bool(Retirement.can_retire_voluntarily(s["protagonist"])).is_false()
	assert_bool(Retirement.retire(s, Retirement.REASON_VOLUNTARY, 301)
		).override_failure_message("두 번 은퇴했다").is_false()


# ── 확정 ──────────────────────────────────────────────────────

## ⚠ **`retired`가 정본이다.** 진행 버튼과 `DayEngine`이 그걸 보고 멈춘다 —
## 다른 필드를 새로 만들면 "은퇴했는데 계속 진행되는" 갈래가 생긴다
func test_retiring_stops_the_career() -> void:
	var s: Dictionary = _state()
	assert_bool(Retirement.retire(s, Retirement.REASON_VOLUNTARY, 300)).is_true()
	assert_bool(bool(s["protagonist"]["retired"])).override_failure_message(
		"은퇴했는데 진행이 안 멈춘다").is_true()
	assert_bool(Retirement.is_retired(s["protagonist"])).is_true()


func test_the_reason_is_kept() -> void:
	var s: Dictionary = _state()
	Retirement.retire(s, Retirement.REASON_INJURY, 300)
	var r: Dictionary = s["protagonist"]["retirement"]
	assert_str(String(r["reason"])).is_equal(Retirement.REASON_INJURY)
	assert_str(String(r["label"])).override_failure_message(
		"어떤 사유로 끝났는지가 기록에 안 남는다").is_equal(
		String(Retirement.LABELS[Retirement.REASON_INJURY]))
	assert_str(String(s["protagonist"]["career_events"][0]["detail"])).is_equal(
		String(Retirement.LABELS[Retirement.REASON_INJURY]))
	assert_int(int(r["year"])).is_equal(2040)


## 세 갈래가 서로 다른 말을 한다 — 인생 기록에 뭐라고 적히는지가 다르다
func test_the_three_reasons_read_differently() -> void:
	var seen: Array = []
	for reason in [Retirement.REASON_VOLUNTARY, Retirement.REASON_DECLINE,
			Retirement.REASON_INJURY]:
		var label: String = String(Retirement.LABELS[reason])
		assert_bool(seen.has(label)).override_failure_message(
			"두 사유가 같은 말을 한다: %s" % label).is_false()
		seen.append(label)


## ⚠ **마지막 소속을 지우지 않는다.** 어디서 끝났는지가 기록의 일부고,
## 단계에 "은퇴"를 넣으면 단계별 분기 수십 곳이 전부 그걸 모른다
func test_the_last_team_survives_the_retirement() -> void:
	var s: Dictionary = _state()
	Retirement.retire(s, Retirement.REASON_DECLINE, 300)
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["career_stage"])).is_equal("pro_kbl")
	assert_str(String(p["team_id"])).is_equal("TEAM_KBL_A")


func test_retiring_is_written_down() -> void:
	var s: Dictionary = _state()
	Retirement.retire(s, Retirement.REASON_VOLUNTARY, 300)
	var e: Dictionary = s["protagonist"]["career_events"][0]
	assert_str(String(e["type"])).is_equal("retirement")
	assert_str(String(e["from_team_id"])).is_equal("TEAM_KBL_A")
	assert_int(s["mailbox"].size()).override_failure_message(
		"커리어가 끝났는데 아무 말이 없다").is_greater(0)


func test_retiring_closes_the_question() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "retirement_ask", "reason": "decline"})
	Retirement.retire(s, Retirement.REASON_DECLINE, 300)
	assert_bool(Pending.has(s, "retirement_ask")).is_false()


## 계속 뛴다 — 물어본 것만 치운다. 다음 해에 또 물어본다
func test_you_can_say_not_yet() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "retirement_ask", "reason": "decline"})
	assert_bool(Retirement.keep_playing(s)).is_true()
	assert_bool(Pending.has(s, "retirement_ask")).is_false()
	assert_bool(Retirement.is_retired(s["protagonist"])).override_failure_message(
		"계속 뛰겠다고 했는데 은퇴됐다").is_false()


# ── 부상 강제 ─────────────────────────────────────────────────

## ⚠ **NPC와 같은 표다.** 따로 두면 "NPC는 36세에 은퇴하는데 나는 45세까지
## 뛴다"가 되고, 그걸 맞추려고 표를 두 번 관리하게 된다
func test_an_older_body_gives_up_more_often() -> void:
	assert_float(Retirement.surgery_retire_chance(36, false)).is_greater(
		Retirement.surgery_retire_chance(33, false))
	assert_float(Retirement.surgery_retire_chance(33, false)).is_greater(
		Retirement.surgery_retire_chance(25, false))


## ⚠ **나이가 먼저다.** 재수술 조건을 앞에 두면 서른여섯 재수술자가
## 낮은 확률을 받는다
func test_age_outranks_a_repeat_surgery() -> void:
	assert_float(Retirement.surgery_retire_chance(38, true)).is_equal(
		Retirement.surgery_retire_chance(38, false))


func test_a_repeat_surgery_hurts_a_young_player() -> void:
	assert_float(Retirement.surgery_retire_chance(25, true)
		).override_failure_message("재수술인데 첫 수술과 같다").is_greater(
		Retirement.surgery_retire_chance(25, false))


## ⚠ **그 주에만 묻는다.** 안 그러면 회복하는 내내 매주 은퇴를 물어본다
func test_the_question_comes_the_week_it_happens() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["injury"] = {"severity": "surgery", "since_day": 100,
		"weeks_left": 40}
	assert_bool(Retirement.surgery_just_happened(s["protagonist"], 100)).is_true()
	assert_bool(Retirement.surgery_just_happened(s["protagonist"], 107)
		).override_failure_message("회복 중에도 매주 은퇴를 물어본다").is_false()


func test_a_light_injury_asks_nothing() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["injury"] = {"severity": "moderate", "since_day": 100}
	assert_bool(Retirement.surgery_just_happened(s["protagonist"], 100)).is_false()


func test_a_surgery_can_end_a_veteran_career() -> void:
	var asked: int = 0
	for i in range(40):
		var s: Dictionary = _state()
		s["protagonist"]["age"] = 38
		s["protagonist"]["injury"] = {"severity": "surgery", "since_day": 100}
		if Retirement.check(s, 100, _rng(i + 1)) == Retirement.REASON_INJURY:
			asked += 1
	# 38세 수술은 0.65 — 마흔 번에 스무 번 넘게 물어야 한다
	assert_int(asked).override_failure_message(
		"38세 수술인데 40번 중 %d번만 물었다" % asked).is_greater(20)


func test_a_young_surgery_rarely_ends_it() -> void:
	var asked: int = 0
	for i in range(40):
		var s: Dictionary = _state()
		s["protagonist"]["age"] = 24
		s["protagonist"]["injury"] = {"severity": "surgery", "since_day": 100}
		if Retirement.check(s, 100, _rng(i + 1)) == Retirement.REASON_INJURY:
			asked += 1
	assert_int(asked).override_failure_message(
		"24세 첫 수술인데 40번 중 %d번이나 물었다" % asked).is_less(10)


# ── 노쇠 압박 ─────────────────────────────────────────────────

func test_a_young_star_is_not_pushed_out() -> void:
	var s: Dictionary = _state()
	assert_bool(bool(Retirement.pressure_of(s)["suggest"])
		).override_failure_message("서른 살 주전에게 은퇴를 권한다").is_false()


## ⚠ **문턱 아래 나이는 아무것도 더하지 않는다.** 조건을 풀면 서른 살이
## 음수 점수를 받아 압박이 거꾸로 줄어든다
func test_a_young_age_adds_nothing() -> void:
	var young: Dictionary = _state()
	young["protagonist"]["age"] = 25
	var thirty: Dictionary = _state()
	thirty["protagonist"]["age"] = 30
	assert_float(float(Retirement.pressure_of(thirty)["score"])
		).override_failure_message("서른 살에 나이 점수가 붙었다").is_equal(
		float(Retirement.pressure_of(young)["score"]))


func test_age_alone_is_enough_at_the_end() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["age"] = 38
	assert_bool(bool(Retirement.pressure_of(s)["suggest"])
		).override_failure_message("서른여덟인데 아무 말이 없다").is_true()


## 떨어지는 실력이 압박을 더한다
func test_a_falling_trend_adds_pressure() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [_record(70.0), _record(60.0)]
	var falling: float = float(Retirement.pressure_of(s)["score"])

	var flat: Dictionary = _state()
	flat["protagonist"]["career_records"] = [_record(70.0), _record(70.0)]
	assert_float(falling).override_failure_message(
		"실력이 떨어지는데 압박이 그대로다").is_greater(
		float(Retirement.pressure_of(flat)["score"]))


func test_the_trend_needs_two_seasons() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [_record(70.0)]
	assert_float(Retirement.ovr_trend_of(s["protagonist"])).is_equal(0.0)


func test_the_trend_reads_the_last_two_seasons() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [_record(80.0), _record(70.0), _record(64.0)]
	assert_float(Retirement.ovr_trend_of(s["protagonist"])).is_equal(-6.0)


## ⚠ **과지급이 압박이다.** 02는 시장가 계산이 실패하면 0을 돌려줬고,
## 그러면 비율이 늘 최대가 되어 **없는 압박을 만들었다**
func test_being_overpaid_adds_pressure() -> void:
	var rich: Dictionary = _state()
	rich["protagonist"]["salary"] = 200000
	var plain: Dictionary = _state()
	plain["protagonist"]["salary"] = 100
	assert_float(float(Retirement.pressure_of(rich)["score"])
		).override_failure_message("시장가의 몇 배를 받는데 압박이 같다").is_greater(
		float(Retirement.pressure_of(plain)["score"]))


func test_the_market_value_is_not_zero() -> void:
	var s: Dictionary = _state()
	assert_int(Retirement.market_value_of(s["protagonist"])
		).override_failure_message(
		"시장가가 0이다 — 과지급 비율이 늘 최대가 된다").is_greater(0)


## 내 자리를 위협하는 유망주가 압박이 된다
func test_a_prospect_at_my_position_adds_pressure() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["TEAM_KBL_A"] = [{"id": "KID", "player_type": "pitcher",
		"pitching": {"ovr": 85.0}, "batting": {}}]
	assert_float(float(Retirement.pressure_of(s)["score"])
		).is_greater(float(Retirement.pressure_of(_state())["score"]))


## ⚠ **나를 유망주로 세지 않는다.** 자기 자신이 자기 자리를 위협한다
func test_i_am_not_my_own_replacement() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["TEAM_KBL_A"] = [{"id": "ME", "player_type": "pitcher",
		"pitching": {"ovr": 70.0}, "batting": {}}]
	assert_float(Retirement.prospect_ovr_of(s)).override_failure_message(
		"내가 내 자리를 위협한다").is_equal(0.0)


## 안정적인 명문은 이름값 있는 노장을 붙잡는다
func test_a_loyal_club_holds_on_to_a_famous_veteran() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["age"] = 36
	s["protagonist"]["fame"] = 80.0
	var plain: float = float(Retirement.pressure_of(s)["score"])

	TeamProfile.patch(s["world"], "TEAM_KBL_A", {"stability": 90.0})
	assert_float(float(Retirement.pressure_of(s)["score"])
		).override_failure_message("명문이 이름값 있는 노장을 안 붙잡는다").is_less(plain)


func test_a_strict_club_pushes_harder() -> void:
	var s: Dictionary = _state()
	var plain: float = float(Retirement.pressure_of(s)["score"])
	TeamProfile.patch(s["world"], "TEAM_KBL_A", {"discipline": 90.0})
	assert_float(float(Retirement.pressure_of(s)["score"])).is_greater(plain)


## 급함은 0~1이다 — 화면 문구 강도에 쓴다
func test_the_urgency_stays_in_range() -> void:
	var s: Dictionary = _old(45)
	s["protagonist"]["career_records"] = [_record(80.0), _record(40.0)]
	var u: float = float(Retirement.pressure_of(s)["urgency"])
	assert_float(u).is_between(0.0, 1.0)


# ── 물어본다 ──────────────────────────────────────────────────

## ⚠ **시즌이 끝날 때 묻는다** — 재계약을 앞둔 자리다. 아무 주에나 물으면
## 시즌 중에 은퇴 창이 뜬다
func test_the_pressure_is_measured_at_the_season_end() -> void:
	var s: Dictionary = _old()
	assert_str(Retirement.check(s, 100, _rng())).override_failure_message(
		"시즌 중에 은퇴를 물어본다").is_empty()

	var s2: Dictionary = _old()
	assert_str(Retirement.check(s2, Retirement.PRESSURE_WEEK * 7, _rng())
		).is_equal(Retirement.REASON_DECLINE)
	assert_bool(Pending.has(s2, "retirement_ask")).is_true()


## ⚠ **한 번만 묻는다.** 두 번 쌓이면 답해도 또 뜬다
func test_the_question_is_not_stacked() -> void:
	var s: Dictionary = _old()
	var day: int = Retirement.PRESSURE_WEEK * 7
	Retirement.check(s, day, _rng())
	Retirement.check(s, day, _rng())
	assert_int(Pending.all(s).size()).is_equal(1)


func test_a_student_is_never_asked() -> void:
	var s: Dictionary = _old()
	s["protagonist"]["career_stage"] = "highschool"
	assert_str(Retirement.check(s, Retirement.PRESSURE_WEEK * 7, _rng())).is_empty()


## ⚠ **강제하지 않는다.** 커리어가 끝나는 결정은 사용자가 한다
func test_asking_does_not_retire_you() -> void:
	var s: Dictionary = _old()
	Retirement.check(s, Retirement.PRESSURE_WEEK * 7, _rng())
	assert_bool(Retirement.is_retired(s["protagonist"])).override_failure_message(
		"묻기만 해야 하는데 은퇴시켰다").is_false()


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **주 경계에서 실제로 돈다.** 안 이으면 은퇴 모듈이 아무도 안 부르는
## 코드다 — 02가 정확히 그 상태였다
func test_the_week_boundary_asks_about_retirement() -> void:
	var s: Dictionary = _old()
	s["school"] = {}
	CareerRunner.run(s, Retirement.PRESSURE_WEEK * 7)
	assert_bool(Pending.has(s, "retirement_ask")).override_failure_message(
		"주 경계에서 은퇴를 안 물어본다 — 배선이 끊겼다").is_true()


## ⚠ **같은 날 같은 수술이어도 해가 다르면 답이 다를 수 있어야 한다.**
## 씨앗에 연도를 안 섞으면 몇 해가 지나도 똑같은 답이 나온다
func test_the_same_day_in_a_different_year_can_differ() -> void:
	var seen: Array = []
	for year in range(2040, 2060):
		var s: Dictionary = _state()
		s["season_year"] = year
		s["school"] = {}
		s["protagonist"]["age"] = 34        # 0.35 — 갈릴 여지가 있는 자리
		s["protagonist"]["injury"] = {"severity": "surgery", "since_day": 100}
		CareerRunner.run(s, 100)
		seen.append(Pending.has(s, "retirement_ask"))
	var all_same: bool = true
	for x in seen:
		if x != seen[0]:
			all_same = false
			break
	assert_bool(all_same).override_failure_message(
		"스무 해 내내 같은 답이 나온다 — 씨앗에 연도가 안 섞였다").is_false()


func test_a_retired_player_is_asked_nothing() -> void:
	var s: Dictionary = _old()
	Retirement.retire(s, Retirement.REASON_VOLUNTARY, 100)
	var out: Dictionary = CareerRunner.run(s, Retirement.PRESSURE_WEEK * 7)
	assert_dict(out).override_failure_message(
		"은퇴한 선수에게 계속 물어본다").is_empty()
