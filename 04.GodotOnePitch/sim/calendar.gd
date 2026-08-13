extends RefCounted
class_name Calendar

## 달력 — 시즌 일차 ↔ 날짜 · 주차 · 요일. D1.
##
## 원본 날짜 계산: `packages/engine-native/src/schedule_engine.rs`의 `to_game_date`
##
## **시즌 일차는 1부터다. 1일 = 3월 1일.**
## 02의 `to_game_date(연도, 주차, 오프셋)`과 이렇게 대응한다:
##
##   시즌 일차 = (주차 − 1) × 7 + 오프셋 + 1
##
## ⚠ 여기가 어긋나면 일정이 통째로 밀린다 — 대회 주차·수상 자격선·성장
## 주기가 전부 그 위에 서 있다.
##
## ## 왜 일 단위인가
##
## 프로는 경기가 거의 매일 있는데 주 단위로 진행하면 **한 번에 여러 경기가
## 한꺼번에 끝난다.** 자기 등판을 골라서 볼 수가 없다.
##
## ⚠ **시간 축만 일 단위다.** 성장·훈련·재정·관계는 7일마다 그대로 돈다 —
## 밸런스를 안 건드려야 02 실측값과 계속 대조할 수 있다.


const SEASON_START_MONTH: int = 3
const SEASON_START_DAY: int = 1
const DAYS_PER_WEEK: int = 7
## 02가 한 해를 52주로 본다
const WEEKS_PER_SEASON: int = 52
const DAYS_PER_SEASON: int = WEEKS_PER_SEASON * DAYS_PER_WEEK

const MONTH_DAYS: Array[int] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


## ⚠ 100으로 나뉘면 윤년이 아니고, 400으로 나뉘면 다시 윤년이다.
## 이걸 빼면 2100년에 하루가 밀린다 — 장수 커리어에서 실제로 닿는다
static func is_leap(year: int) -> bool:
	return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


static func days_in_month(year: int, month: int) -> int:
	if month == 2 and is_leap(year):
		return 29
	return MONTH_DAYS[clampi(month - 1, 0, 11)]


static func days_in_year(year: int) -> int:
	return 366 if is_leap(year) else 365


# ── 시즌 일차 ↔ 날짜 ───────────────────────────────────────────────

## 시즌 일차(1부터) → `{year, month, day}`.
##
## ⚠ **연말을 넘는다.** 시즌이 3월에 시작하므로 오프시즌은 다음 해다
static func date_of(season_year: int, day: int) -> Dictionary:
	var year: int = season_year
	var month: int = SEASON_START_MONTH
	var d: int = SEASON_START_DAY + (day - 1)

	while true:
		var limit: int = days_in_month(year, month)
		if d <= limit:
			break
		d -= limit
		month += 1
		if month > 12:
			month = 1
			year += 1
	return {"year": year, "month": month, "day": d}


## 날짜 → 시즌 일차. `date_of`의 역
static func day_of(season_year: int, year: int, month: int, day: int) -> int:
	var total: int = 0
	var y: int = season_year
	var m: int = SEASON_START_MONTH
	while y != year or m != month:
		total += days_in_month(y, m)
		m += 1
		if m > 12:
			m = 1
			y += 1
	return total + (day - SEASON_START_DAY) + 1


static func format(season_year: int, day: int) -> String:
	var d: Dictionary = date_of(season_year, day)
	return "%04d-%02d-%02d" % [d["year"], d["month"], d["day"]]


# ── 주차 ───────────────────────────────────────────────────────────

## 시즌 일차 → 주차(1부터).
##
## ⚠ **주 단위 처리가 이 파생 위에 선다.** 하루라도 밀리면 성장이 한 주
## 통째로 빠지거나 두 번 돈다
static func week_of(day: int) -> int:
	return (day - 1) / DAYS_PER_WEEK + 1


## 그 주의 몇째 날인가 (1~7)
static func day_in_week(day: int) -> int:
	return (day - 1) % DAYS_PER_WEEK + 1


## 주 경계인가 — 주간 처리는 이 날 돈다
static func is_week_end(day: int) -> bool:
	return day_in_week(day) == DAYS_PER_WEEK


## `from`부터 `to`까지(양끝 포함) 주 경계가 몇 번인가.
##
## ⚠ **여러 날을 한 번에 진행할 때 이게 핵심이다.** 한 번을 두 번 돌리면
## 성장이 2배, 건너뛰면 0이다 — 오류도 로그도 안 나고 조용히 틀린다.
## 하루씩 N번과 N일 한 번이 반드시 같아야 한다
static func week_ends_between(from_day: int, to_day: int) -> int:
	if to_day < from_day:
		return 0
	return to_day / DAYS_PER_WEEK - (from_day - 1) / DAYS_PER_WEEK


# ── 요일 ───────────────────────────────────────────────────────────

## 0 = 일요일 … 6 = 토요일. Sakamoto 알고리즘.
##
## ⚠ **시스템 시각을 안 쓴다.** 시간대에 따라 하루가 밀리면 같은 세이브가
## 기계마다 다른 일정을 갖는다
const _SAKAMOTO: Array[int] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]

static func weekday_of(year: int, month: int, day: int) -> int:
	var y: int = year
	if month < 3:
		y -= 1
	return (y + y / 4 - y / 100 + y / 400 + _SAKAMOTO[month - 1] + day) % 7


static func weekday(season_year: int, day: int) -> int:
	var d: Dictionary = date_of(season_year, day)
	return weekday_of(d["year"], d["month"], d["day"])


## ⚠ 3월 1일의 요일은 해마다 다르다. "1주차 첫날은 항상 월요일"로 두면
## 주말리그가 해마다 다른 요일에 열린다 — 고교는 주말리그다
static func is_weekend(season_year: int, day: int) -> bool:
	var w: int = weekday(season_year, day)
	return w == 0 or w == 6
