extends GdUnitTestSuite

## 병역을 **묻는다** — 02 `advanceWeek.ts:1952-2135`.
##
## 🔴 **04는 지금 조용히 정한다.** `career_decision.gd:413`이 "갈 곳이 없을 때"
## `Military.enlist(state, "general", …)` 하나를 부르는 게 전부다.
## 02는 둘을 묻는다 — 체육부대 지원 · 입대 확인. **04도 묻는다**(사용자 확정).
##
## ⚠ **02의 주차를 그대로 안 옮긴다.** 02는 `weekInYear` 50·52로 재는데
## 04엔 진짜 달력이 있다(3월 1일 시작 · 364일). 뜻으로 옮긴다:
##   W50(시즌 종료 3주 전) → **2월이 시작될 때**
##   W52(시즌 마지막 주)   → **시즌 마지막 주**
## **주차 숫자를 코드에 안 적는다** — 시즌 길이가 바뀌면 조용히 어긋난다.
##
## ⚠🔴 **가드 둘이 이 이식의 핵심이다.** 물음은 주를 안 넘기고 대기줄만
## 밀어넣으므로, "물었다"를 기억하지 않으면 **다음 진행에서 조건이 또 참**이
## 된다. 02가 실측으로 두 번 얼어붙었다 — 매년 그 주에서 멈췄고, 다른 하나는
## 2038년에 자동 진행이 1000회 반복 상한에 걸렸다. **04는 자동 진행이
## "다음 결정까지" 가므로 더 위험하다.**


const SPORTS_DAY: int = 344   # 2월 7일 — 2월이 시작된 뒤 첫 주
const LAST_WEEK_DAY: int = 360  # 시즌 마지막 주 (364일차가 끝)
const MID_DAY: int = 100        # 6월 — 아무 일도 없어야 한다


func _p(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"id": "ME", "is_protagonist": true, "age": 25,
		"military_status": Military.STATUS_UNSERVED,
		"career_stage": "university", "league_id": "LEAGUE_UNIVERSITY",
	}
	d.merge(o, true)
	return d


func _s(p: Dictionary, day: int) -> Dictionary:
	return {"protagonist": p, "season_year": 2033, "day": day,
		"world": {"rosters": {}}}


# ── 체육부대 지원을 묻는 때 ───────────────────────────────────

func test_2월이_시작되면_묻는다() -> void:
	assert_bool(Military.should_ask_sports_unit(_s(_p(), SPORTS_DAY))) \
		.override_failure_message("2월인데 체육부대를 안 묻는다").is_true()


func test_시즌_한복판에는_안_묻는다() -> void:
	assert_bool(Military.should_ask_sports_unit(_s(_p(), MID_DAY))).is_false()


## 02 `age <= 27`
func test_스물여덟부터는_체육부대를_안_묻는다() -> void:
	assert_bool(Military.should_ask_sports_unit(
		_s(_p({"age": 27}), SPORTS_DAY))).is_true()
	assert_bool(Military.should_ask_sports_unit(
		_s(_p({"age": 28}), SPORTS_DAY))).is_false()


## 02 공통 전제 — 미필이 아니면 안 묻는다
func test_이미_다녀왔으면_안_묻는다() -> void:
	assert_bool(Military.should_ask_sports_unit(
		_s(_p({"military_status": Military.STATUS_DONE}), SPORTS_DAY))).is_false()


## 02 공통 전제 — 고교생에겐 안 묻는다
func test_고교생에겐_안_묻는다() -> void:
	assert_bool(Military.should_ask_sports_unit(
		_s(_p({"career_stage": "highschool"}), SPORTS_DAY))).is_false()


## ⚠🔴 **여기가 02가 얼어붙은 자리다.** 한 번 물었으면 그해엔 다시 안 묻는다
func test_그해에_두_번_안_묻는다() -> void:
	var s: Dictionary = _s(_p(), SPORTS_DAY)
	assert_bool(Military.should_ask_sports_unit(s)).is_true()
	Military.mark_sports_unit_asked(s)
	assert_bool(Military.should_ask_sports_unit(s)).override_failure_message(
		"같은 해에 또 묻는다 — 02가 여기서 매년 얼어붙었다").is_false()


## 해가 바뀌면 다시 묻는다 — 가드가 영영 막으면 한 번 거절한 사람은 끝이다
func test_해가_바뀌면_다시_묻는다() -> void:
	var s: Dictionary = _s(_p(), SPORTS_DAY)
	Military.mark_sports_unit_asked(s)
	s["season_year"] = 2034
	assert_bool(Military.should_ask_sports_unit(s)).override_failure_message(
		"해가 바뀌었는데 영영 안 묻는다").is_true()


# ── 입대 확인을 묻는 때 ───────────────────────────────────────

## 02 W52 · `age >= 28`
func test_시즌_마지막_주에_스물여덟이면_묻는다() -> void:
	assert_bool(Military.should_ask_enlist(
		_s(_p({"age": 28}), LAST_WEEK_DAY))).is_true()


func test_스물일곱이면_아직_안_묻는다() -> void:
	assert_bool(Military.should_ask_enlist(
		_s(_p({"age": 27}), LAST_WEEK_DAY))).is_false()


func test_시즌_마지막_주가_아니면_안_묻는다() -> void:
	assert_bool(Military.should_ask_enlist(
		_s(_p({"age": 28}), MID_DAY))).is_false()


## ⚠🔴 **02가 2038년에 자동 진행 1000회 상한에 걸린 자리다**
func test_입대_확인도_그해에_두_번_안_묻는다() -> void:
	var s: Dictionary = _s(_p({"age": 28}), LAST_WEEK_DAY)
	assert_bool(Military.should_ask_enlist(s)).is_true()
	Military.mark_enlist_asked(s)
	assert_bool(Military.should_ask_enlist(s)).override_failure_message(
		"같은 해에 또 묻는다 — 02가 여기서 1000회 반복 상한에 걸렸다").is_false()


## 체육부대에 지원했으면 입대 확인을 안 묻는다 — 02 "미신청"
func test_지원했으면_입대를_안_묻는다() -> void:
	assert_bool(Military.should_ask_enlist(
		_s(_p({"age": 28, "sports_unit_applied": true}), LAST_WEEK_DAY))) \
		.override_failure_message("상무에 지원해 놓고 입대도 묻는다").is_false()


# ── 주차 숫자를 안 쓴다 ───────────────────────────────────────

## ⚠ **시즌 길이가 바뀌어도 "마지막 주"는 마지막 주여야 한다.**
## 50·52를 박으면 여기서 갈린다
func test_마지막_주는_시즌_끝에서_파생한다() -> void:
	var last: int = Calendar.DAYS_PER_SEASON
	assert_bool(Military.should_ask_enlist(_s(_p({"age": 28}), last))) \
		.override_failure_message("시즌 마지막 날인데 안 묻는다").is_true()
	assert_bool(Military.should_ask_enlist(
		_s(_p({"age": 28}), last - Calendar.DAYS_PER_WEEK - 1))) \
		.override_failure_message("마지막 주보다 앞인데 묻는다").is_false()


## 소스에 주차 숫자를 안 적는다 — 02 값을 옮기는 게 아니라 뜻을 옮긴다
func test_소스에_주차_숫자가_없다() -> void:
	var code: String = CodeText.of("res://sim/military.gd")
	for n in ["50", "52"]:
		assert_int(code.find("week_of(day) == %s" % n)).override_failure_message(
			"주차 %s를 코드에 박았다 — 날짜와 시즌 끝에서 파생해야 한다" % n) \
			.is_equal(-1)


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **자동 `enlist`를 남기지 않는다.** 물어 놓고 답을 안 기다리면 그 물음이
## 장식이 된다 — `retirement_ask`가 04에서 딱 그 상태였다
func test_진로가_조용히_입대시키지_않는다() -> void:
	var code: String = CodeText.of("res://sim/career_decision.gd")
	assert_int(code.find("Military.enlist(")).override_failure_message(
		"진로 결정이 아직 조용히 입대시킨다").is_equal(-1)
