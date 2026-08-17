extends GdUnitTestSuite

## 주인공의 방향 · 투구 폼 · 생년월일 — F-6b.
##
## 원본: `NewGamePage.svelte:19-40` (입력) · `:260-300` (저장)
##
## ⚠ **02에서도 `pitchingForm`은 저장만 되고 아무 데도 안 쓰인다.**
## `grep pitchingForm` → 타입 정의 · 새 게임 화면 · 성능 픽스처가 전부다.
## 시뮬에 안 먹인다 — **표시용 축**이다. 그렇게 옮기고 그렇게 적는다.
##
## ⚠ **폼 선택지는 셋이다.** 타입에는 `threeQuarter`가 있고 요약 라벨에도
## 있지만 `formOptions`에 없다 — 고를 수 없는 죽은 값이라 안 옮겼다.
##
## ⚠ **생년은 2010 고정이다.** 02가 그렇고, 04도 시작 2027년에 17세이므로
## 2027-17=2010으로 맞는다 — 우연이 아니라 같은 값이다.

const YEAR: String = "2010"


func _start(extra: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"seed": 4242, "name": "김한결",
		"team_id": "TEAM_HS_AEWOL", "season_year": 2027,
	}
	p.merge(extra, true)
	return NewGameVm.start(p)


func _me(state: Dictionary) -> Dictionary:
	return state.get("protagonist", {})


func test_화면이_선택지를_계산하지_않는다() -> void:
	var vm: Dictionary = NewGameVm.build({})
	# 방향 둘 — 02 `handednessOptions`에 R·L뿐이다
	var hands: Array = vm.get("handedness_options", [])
	assert_int(hands.size()).is_equal(2)
	assert_str(String(hands[0]["value"])).is_equal("R")
	assert_str(String(hands[0]["label"])).is_equal("우투")
	assert_str(String(hands[1]["value"])).is_equal("L")
	assert_str(String(hands[1]["label"])).is_equal("좌투")

	# 폼 셋 — `threeQuarter`는 고를 수 없는 죽은 값이라 없다
	var forms: Array = vm.get("form_options", [])
	assert_int(forms.size()).is_equal(3)
	var values: Array = []
	for f in forms:
		values.append(String(f["value"]))
	assert_array(values).is_equal(["overhand", "sidearm", "underhand"])
	assert_str(String(forms[0]["label"])).is_equal("오버핸드")
	assert_str(String(forms[2]["label"])).is_equal("언더스로")


func test_기본값이_02와_같다() -> void:
	var vm: Dictionary = NewGameVm.build({})
	assert_str(String(vm["handedness"])).is_equal("R")
	assert_str(String(vm["pitching_form"])).is_equal("overhand")
	# 02 `birthMonth = 4` · `birthDay = 1`
	assert_int(int(vm["birth_month"])).is_equal(4)
	assert_int(int(vm["birth_day"])).is_equal(1)


## 02 `DAYS_IN_MONTH` — **윤년을 안 본다.** 2010은 평년이라 2월이 28일이다
func test_달마다_일수가_다르다() -> void:
	assert_int(NewGameVm.days_in_month(1)).is_equal(31)
	assert_int(NewGameVm.days_in_month(2)).is_equal(28)
	assert_int(NewGameVm.days_in_month(4)).is_equal(30)
	assert_int(NewGameVm.days_in_month(12)).is_equal(31)


## 02 `$: if (birthDay > maxDay) birthDay = maxDay` — 2월 31일이 안 생긴다
func test_없는_날짜는_그_달_마지막으로_당긴다() -> void:
	var vm: Dictionary = NewGameVm.build({"birth_month": 2, "birth_day": 31})
	assert_int(int(vm["birth_day"])).is_equal(28)
	var v2: Dictionary = NewGameVm.build({"birth_month": 4, "birth_day": 31})
	assert_int(int(v2["birth_day"])).is_equal(30)


## 화면을 안 거친 경로도 당겨야 한다 — `start`가 `birthday_of`를 직접 부른다
func test_문자열을_만드는_쪽도_날을_당긴다() -> void:
	assert_str(NewGameVm.birthday_of(2, 31)).is_equal("2010-02-28")
	assert_str(NewGameVm.birthday_of(4, 31)).is_equal("2010-04-30")
	assert_str(NewGameVm.birthday_of(1, 31)).is_equal("2010-01-31")


func test_주인공이_고른_값을_갖는다() -> void:
	var me: Dictionary = _me(_start({
		"handedness": "L", "pitching_form": "sidearm",
		"birth_month": 7, "birth_day": 9,
	}))
	assert_str(String(me.get("handedness", ""))).is_equal("L")
	assert_str(String(me.get("pitching_form", ""))).is_equal("sidearm")
	# 02 `birthdayStr` — 두 자리로 채운다
	assert_str(String(me.get("birthday", ""))).is_equal("2010-07-09")


func test_한자리_달과_날이_0으로_채워진다() -> void:
	var me: Dictionary = _me(_start({"birth_month": 1, "birth_day": 5}))
	assert_str(String(me["birthday"])).is_equal("2010-01-05")


## ⚠ **안 고르면 NPC 규칙으로 떨어지면 안 된다.** 주인공은 고른 대로다 —
## `PlayerGen.roster`가 id 해시로 방향을 뽑으므로 덮어쓰지 않으면 조용히
## 다른 값이 된다
func test_안_고르면_02_기본값이다() -> void:
	var me: Dictionary = _me(_start({}))
	assert_str(String(me["handedness"])).is_equal("R")
	assert_str(String(me["pitching_form"])).is_equal("overhand")
	assert_str(String(me["birthday"])).is_equal("2010-04-01")


## 화면 한 줄에 나오나 — 안 보이면 없는 것과 같다
func test_나_탭이_생년월일과_폼을_보여준다() -> void:
	var state: Dictionary = _start({
		"handedness": "L", "pitching_form": "underhand",
		"birth_month": 12, "birth_day": 25,
	})
	var vm: Dictionary = StatusVm.build(state)
	assert_str(String(vm.get("birthday", ""))).is_equal("2010년 12월 25일")
	assert_str(String(vm.get("handedness", ""))).is_equal("좌투")
	assert_str(String(vm.get("pitching_form", ""))).is_equal("언더스로")


func test_폼_이름이_없으면_빈칸이다() -> void:
	# 옛 세이브엔 축이 없다. "오버핸드"로 채우면 없는 것과 고른 것이 안 갈린다
	assert_str(StatusVm.form_label("")).is_equal("")
	assert_str(StatusVm.form_label("threeQuarter")).is_equal("")
	assert_str(StatusVm.form_label("sidearm")).is_equal("사이드암")
