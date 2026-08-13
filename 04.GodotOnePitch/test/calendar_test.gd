extends GdUnitTestSuite

## 달력 — 시즌 일차 ↔ 날짜 · 주차 · 요일. D1.
##
## 원본 날짜 계산: `packages/engine-native/src/schedule_engine.rs`의 `to_game_date`
##
## ⚠ **시즌 1일 = 3월 1일이다.** 02가 그렇게 잡았고, 여기가 어긋나면 일정이
## 통째로 밀린다 — 대회 주차·수상 자격선·성장 주기가 전부 그 위에 서 있다.
##
## ## 왜 일 단위인가
##
## 프로는 경기가 거의 매일 있는데 주 단위로 진행하면 **한 번에 여러 경기가
## 한꺼번에 끝난다.** 자기 등판을 골라서 볼 수가 없다.
##
## ⚠ **시간 축만 일 단위로 간다.** 성장·훈련·재정·관계는 7일마다 그대로
## 돈다 — 밸런스를 안 건드려야 02 실측값(리그 ERA·도루 성공률·경기당 득점)과
## 계속 대조할 수 있다.


# ── 윤년·달 길이 ───────────────────────────────────────────────────

func test_leap_years() -> void:
	assert_bool(Calendar.is_leap(2024)).is_true()
	assert_bool(Calendar.is_leap(2025)).is_false()
	# ⚠ 100으로 나뉘면 윤년이 아니고, 400으로 나뉘면 다시 윤년이다.
	# 이걸 빼면 2100년에 하루가 밀린다 — 장수 커리어에서 실제로 닿는다
	assert_bool(Calendar.is_leap(2000)).is_true()
	assert_bool(Calendar.is_leap(2100)).is_false()


func test_days_in_month() -> void:
	assert_int(Calendar.days_in_month(2025, 1)).is_equal(31)
	assert_int(Calendar.days_in_month(2025, 2)).is_equal(28)
	assert_int(Calendar.days_in_month(2024, 2)).is_equal(29)
	assert_int(Calendar.days_in_month(2025, 4)).is_equal(30)
	assert_int(Calendar.days_in_month(2025, 12)).is_equal(31)


# ── 시즌 일차 → 날짜 ───────────────────────────────────────────────

func test_the_season_starts_on_march_first() -> void:
	var d: Dictionary = Calendar.date_of(2026, 1)
	assert_int(d["year"]).is_equal(2026)
	assert_int(d["month"]).is_equal(3)
	assert_int(d["day"]).is_equal(1)


func test_dates_roll_into_the_next_month() -> void:
	# 3월은 31일까지다
	assert_str(Calendar.format(2026, 31)).is_equal("2026-03-31")
	assert_str(Calendar.format(2026, 32)).is_equal("2026-04-01")


func test_dates_roll_into_the_next_year() -> void:
	# ⚠ 시즌이 3월에 시작하므로 **연말을 넘는다.** 안 넘기면 오프시즌 날짜가
	# 전부 같은 해에 뭉친다
	assert_str(Calendar.format(2026, 306)).is_equal("2026-12-31")
	assert_str(Calendar.format(2026, 307)).is_equal("2027-01-01")


func test_leap_day_shifts_the_rest() -> void:
	# 2028년 2월은 29일까지다 — 2027 시즌은 그 2월을 지난다
	assert_str(Calendar.format(2027, 366)).is_equal("2028-02-29")
	assert_str(Calendar.format(2027, 367)).is_equal("2028-03-01")


func test_the_date_matches_the_original_engine() -> void:
	# ⚠ **02의 `to_game_date(연도, 주차, 요일오프셋)`과 같은 날을 내야 한다.**
	# 어긋나면 일정이 통째로 밀린다.
	#   days_from_march1 = (주차-1)×7 + 오프셋  →  시즌 일차 = 그 값 + 1
	#
	# to_game_date(2026, 1, 0) = 3월 1일
	assert_str(Calendar.format(2026, 1)).is_equal("2026-03-01")
	# to_game_date(2026, 5, 5) → (5-1)×7+5 = 33 → 시즌 34일차 = 4월 3일
	assert_str(Calendar.format(2026, 34)).is_equal("2026-04-03")


func test_day_and_date_round_trip() -> void:
	for day in [1, 7, 32, 100, 306, 307, 365]:
		var d: Dictionary = Calendar.date_of(2026, day)
		assert_int(Calendar.day_of(2026, d["year"], d["month"], d["day"])).is_equal(day)


# ── 주차 파생 ──────────────────────────────────────────────────────

func test_a_week_is_seven_days() -> void:
	# ⚠ **주 단위 처리가 이 파생 위에 선다.** 하루라도 밀리면 성장이 한 주
	# 통째로 빠지거나 두 번 돈다
	assert_int(Calendar.week_of(1)).is_equal(1)
	assert_int(Calendar.week_of(7)).is_equal(1)
	assert_int(Calendar.week_of(8)).is_equal(2)
	assert_int(Calendar.week_of(14)).is_equal(2)
	assert_int(Calendar.week_of(15)).is_equal(3)


func test_the_day_within_the_week() -> void:
	assert_int(Calendar.day_in_week(1)).is_equal(1)
	assert_int(Calendar.day_in_week(7)).is_equal(7)
	assert_int(Calendar.day_in_week(8)).is_equal(1)


func test_the_last_day_of_a_week_is_recognised() -> void:
	# 주 경계 처리가 이걸 본다
	assert_bool(Calendar.is_week_end(7)).is_true()
	assert_bool(Calendar.is_week_end(14)).is_true()
	assert_bool(Calendar.is_week_end(6)).is_false()
	assert_bool(Calendar.is_week_end(8)).is_false()


func test_counting_week_ends_in_a_span() -> void:
	# ⚠ **여러 날을 한 번에 진행할 때 주 경계가 몇 번인지가 핵심이다.**
	# 한 번을 두 번 돌리면 성장이 2배, 건너뛰면 0이다 — 조용히 틀린다
	assert_int(Calendar.week_ends_between(1, 7)).is_equal(1)
	assert_int(Calendar.week_ends_between(1, 6)).is_equal(0)
	assert_int(Calendar.week_ends_between(1, 14)).is_equal(2)
	assert_int(Calendar.week_ends_between(8, 14)).is_equal(1)
	# 하루씩 30번 = 30일 한 번. 이게 어긋나면 진행 방식에 따라 성장이 달라진다
	var one_at_a_time: int = 0
	for d in range(1, 31):
		one_at_a_time += Calendar.week_ends_between(d, d)
	assert_int(one_at_a_time).is_equal(Calendar.week_ends_between(1, 30))


func test_no_week_ends_in_an_empty_span() -> void:
	assert_int(Calendar.week_ends_between(8, 7)).is_equal(0)
	# ⚠ **가드가 없으면 음수가 나온다.** 주 경계 −1번은 성장을 되돌린다 —
	# 0을 내는 표본만 보면 가드를 빼도 검사가 통과한다
	assert_int(Calendar.week_ends_between(8, 6)).is_equal(0)
	assert_int(Calendar.week_ends_between(15, 1)).is_equal(0)


# ── 요일 ───────────────────────────────────────────────────────────

func test_weekday_of_known_dates() -> void:
	# 0 = 일요일. 2026-01-01은 목요일이다
	assert_int(Calendar.weekday_of(2026, 1, 1)).is_equal(4)
	# 2026-03-01은 일요일
	assert_int(Calendar.weekday_of(2026, 3, 1)).is_equal(0)
	# 2024-02-29(윤일)은 목요일
	assert_int(Calendar.weekday_of(2024, 2, 29)).is_equal(4)


func test_weekday_from_a_season_day() -> void:
	assert_int(Calendar.weekday(2026, 1)).is_equal(0)
	assert_int(Calendar.weekday(2026, 2)).is_equal(1)
	assert_int(Calendar.weekday(2026, 8)).is_equal(0)


func test_weekend_detection() -> void:
	# 고교는 주말리그다 — 요일을 실제로 봐야 한다
	assert_bool(Calendar.is_weekend(2026, 1)).is_true()   # 일
	assert_bool(Calendar.is_weekend(2026, 7)).is_true()   # 토
	assert_bool(Calendar.is_weekend(2026, 3)).is_false()  # 화


func test_the_starting_weekday_moves_year_to_year() -> void:
	# ⚠ 3월 1일의 요일은 해마다 다르다. "1주차 첫날은 항상 월요일"로 두면
	# 주말리그가 해마다 다른 요일에 열린다
	assert_bool(Calendar.weekday(2026, 1) != Calendar.weekday(2027, 1)).is_true()
