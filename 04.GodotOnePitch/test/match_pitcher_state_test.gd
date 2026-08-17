extends GdUnitTestSuite

## 경기 화면의 투수 체력·멘탈 — M-1.
##
## 원본: `MatchPage.svelte:1824-1860`(투수 info-panel) · `:706-707`(색 문턱)
##
## ⚠ **교체 판단의 입력인데 화면에 없었다.** 04는 "6.0이닝 5K 1BB 4H 1자책"만
## 보여준다 — **스태미나가 바닥인지 모르고 계속 던지게 된다.** 데이터는
## `game_loop.gd:149-151`이 `home_stamina`·`home_mental`로 이미 들고 있었다.
##
## ⚠ **경기 중 스태미나는 100 = 쌩쌩이다**(`CLAUDE.md`의 두 축 — `freshness`와
## 같은 방향, 주인공 `fatigue`와 반대). 뒤집어 읽으면 지친 투수가 팔팔해 보인다.

## 02 `staminaColor`/`mentalColor` — `> 60` 좋음 · `> 30` 주의 · 그 아래 나쁨
const GOOD_ABOVE: float = 60.0
const WARN_ABOVE: float = 30.0


func _state(extra: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"inning": 3, "half": "top", "outs": 1,
		"score": {"home": 2, "away": 1},
		"count": {"balls": 1, "strikes": 2},
		"runners": {}, "batter": {"id": "B1"}, "pitcher": {"id": "P1"},
		"home_stamina": 72.0, "home_mental": 55.0,
		"away_stamina": 40.0, "away_mental": 20.0,
	}
	s.merge(extra, true)
	return s


func _vm(extra: Dictionary = {}, side: String = "home") -> Dictionary:
	return MatchVm.build(_state(extra), {"my_side": side, "my_id": "P1"})


func test_체력과_멘탈이_사전에_실린다() -> void:
	var vm: Dictionary = _vm()
	assert_float(float(vm["pitcher_stamina"])).is_equal(72.0)
	assert_float(float(vm["pitcher_mental"])).is_equal(55.0)


## ⚠ **내 쪽 것을 읽는다.** `_my_line`이 이미 그렇게 한다 — 여기만 팀을
## 안 가리면 상대 투수의 체력이 내 막대에 뜬다
func test_내_쪽_체력을_읽는다() -> void:
	var mine: Dictionary = _vm({}, "home")
	var theirs: Dictionary = _vm({}, "away")
	assert_float(float(mine["pitcher_stamina"])).is_equal(72.0)
	assert_float(float(theirs["pitcher_stamina"])).override_failure_message(
		"원정인데 홈 투수의 체력을 읽는다").is_equal(40.0)


## 02 문턱 그대로. **값을 못 박는다** — 상수에서 끌어오면 아무것도 안 본다
func test_색_단계가_02_문턱과_같다() -> void:
	assert_str(MatchVm.vital_level(61.0)).is_equal("ok")
	assert_str(MatchVm.vital_level(60.0)).is_equal("warn")
	assert_str(MatchVm.vital_level(31.0)).is_equal("warn")
	assert_str(MatchVm.vital_level(30.0)).is_equal("bad")
	assert_str(MatchVm.vital_level(0.0)).is_equal("bad")


func test_단계가_사전에_실린다() -> void:
	var vm: Dictionary = _vm({"home_stamina": 25.0, "home_mental": 80.0})
	assert_str(String(vm["pitcher_stamina_level"])).is_equal("bad")
	assert_str(String(vm["pitcher_mental_level"])).is_equal("ok")


## ⚠ **100 = 쌩쌩이다.** 뒤집어 읽으면 지친 투수가 팔팔해 보인다 —
## 04에서 두 피로 축이 반대 방향이라 실제로 겪은 종류의 결함이다
func test_높을수록_좋은_쪽이다() -> void:
	var fresh: Dictionary = _vm({"home_stamina": 95.0})
	var spent: Dictionary = _vm({"home_stamina": 10.0})
	assert_str(String(fresh["pitcher_stamina_level"])).is_equal("ok")
	assert_str(String(spent["pitcher_stamina_level"])).is_equal("bad")


## 축이 없는 세이브·옛 상태 — 0으로 떨어뜨리면 "바닥"으로 보인다.
## **모르는 것과 바닥인 것을 가른다**
func test_축이_없으면_안_보여준다() -> void:
	var s: Dictionary = _state()
	s.erase("home_stamina")
	s.erase("home_mental")
	var vm: Dictionary = MatchVm.build(s, {"my_side": "home", "my_id": "P1"})
	assert_bool(bool(vm["has_pitcher_vitals"])).override_failure_message(
		"체력 축이 없는데 있다고 한다").is_false()


func test_축이_있으면_보여준다() -> void:
	assert_bool(bool(_vm()["has_pitcher_vitals"])).is_true()


## 화면이 색을 직접 고르지 않는다 — 단계 이름을 받아 `AppTheme`에서 고른다
func test_화면이_단계로_색을_고른다() -> void:
	assert_object(AppTheme.vital_color("ok")).is_equal(AppTheme.OK)
	assert_object(AppTheme.vital_color("warn")).is_equal(AppTheme.WARN)
	assert_object(AppTheme.vital_color("bad")).is_equal(AppTheme.BAD)


## 배선의 끝 — 화면이 실제로 막대를 만드나
func test_화면이_체력_막대를_만든다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/match_screen.gd")
	assert_int(src.find("pitcher_stamina")).override_failure_message(
		"경기 화면이 투수 체력을 안 그린다").is_greater(-1)
