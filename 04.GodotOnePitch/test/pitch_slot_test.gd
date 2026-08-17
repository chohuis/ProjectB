extends GdUnitTestSuite

## 구종 슬롯 — M-6.
##
## 원본: `MatchPage.svelte:1666-1770` · `pitchSlots.ts:38-53` ·
## `pitchCost.ts:55-90`
##
## ⚠ **04는 배운 구종만 보여줬다.** 02는 **슬롯**을 보여준다 — 배운 것 뒤에
## 빈 칸이 상한까지 이어져 "몇 개를 더 배울 수 있나"가 보인다.
##
## ⚠ **02 주석 둘이 경고한다**:
##   ① **스태미나로 구종을 흐리게 만들지 마라** — 엔진은 그렇게 안 막는다.
##      "화면이 없는 규칙을 지어내는 것이고 이미 부상위험 %에서 그 실수를
##      했다". 대신 **실제로 있는 것**(선택별 소모)을 보여준다
##   ② **빈 칸에 구종 이름을 적지 마라** — 슬롯은 특정 구종의 자리가 아니라
##      조건을 채운 것 중 아무거나 들어갈 칸이다


func _me(pitches: Array) -> Dictionary:
	return {"pitches": pitches, "pitching": {"stamina": 60.0}}


func _two() -> Dictionary:
	return _me([{"id": "fastball", "grade": 4}, {"id": "curve", "grade": 2}])


## 02 `pitchSlotsOf` — 배운 것 뒤에 빈 칸이 **상한까지** 이어진다
func test_슬롯이_상한까지_이어진다() -> void:
	var slots: Array = PitchVm.build(_two())["slots"]
	assert_int(slots.size()).is_equal(PitchDev.max_learned())
	assert_int(slots.size()).is_equal(5)


func test_배운_것이_앞에_온다() -> void:
	var slots: Array = PitchVm.build(_two())["slots"]
	assert_bool(bool(slots[0]["learned"])).is_true()
	assert_bool(bool(slots[1]["learned"])).is_true()
	assert_bool(bool(slots[2]["learned"])).is_false()


## 02 `:1697-1699` — 배운 칸엔 숙련도가 붙는다
func test_배운_칸에_숙련도가_있다() -> void:
	var slots: Array = PitchVm.build(_two())["slots"]
	# 숙련도 순으로 정렬되므로 4가 먼저다
	assert_int(int(slots[0]["grade"])).is_equal(4)
	assert_int(int(slots[1]["grade"])).is_equal(2)


## ⚠ **빈 칸에 구종 이름을 적지 않는다** — 02 주석이 그걸 막는다
func test_빈_칸엔_이름이_없다() -> void:
	var slots: Array = PitchVm.build(_two())["slots"]
	for i in range(2, slots.size()):
		assert_str(String(slots[i]["label"])).override_failure_message(
			"빈 칸에 이름이 적혀 있다: %s" % slots[i]["label"]).is_empty()
		assert_int(int(slots[i]["grade"])).is_equal(0)


## 칸 번호는 1부터. 빈 칸도 이어서 센다
func test_칸_번호가_1부터_이어진다() -> void:
	var slots: Array = PitchVm.build(_two())["slots"]
	for i in slots.size():
		assert_int(int(slots[i]["no"])).is_equal(i + 1)


## 02 `slotCountLabel` — "2/5"
func test_몇_칸_썼는지_보여준다() -> void:
	assert_str(String(PitchVm.build(_two())["slot_label"])).is_equal("2/5")


## ⚠ **상한을 넘으면 넘은 대로 보여준다**(02 주석). 잘라 내면 "왜 여섯 번째
## 공이 안 보이지"가 된다
func test_상한을_넘으면_넘은_대로다() -> void:
	var six: Array = []
	for id in ["fastball", "curve", "slider", "changeup", "splitter", "sinker"]:
		six.append({"id": id, "grade": 3})
	var vm: Dictionary = PitchVm.build(_me(six))
	assert_int((vm["slots"] as Array).size()).is_equal(6)
	assert_str(String(vm["slot_label"])).is_equal("6/5")


## 02 `staminaCostOf` — 04 `Tuning`이 이미 같은 식을 갖고 있다.
## **화면은 그걸 읽기만 한다** — 여기서 다시 더하면 정본이 둘이 된다
func test_선택별_소모가_Tuning과_같다() -> void:
	var vm: Dictionary = PitchVm.build(_two(),
		{"pitch_type": "fastball", "strategy": "aggressive", "power": "high"})
	# 0.45 + 0.12(공격적) + 0.10(직구) + 0.30(전력)
	assert_float(float(vm["cost"])).is_equal_approx(0.97, 0.001)


func test_선택을_바꾸면_소모가_바뀐다() -> void:
	var cheap: Dictionary = PitchVm.build(_two(),
		{"pitch_type": "curve", "strategy": "safe", "power": "low"})
	# 0.45 + 0 + 0 + 0.05
	assert_float(float(cheap["cost"])).is_equal_approx(0.50, 0.001)


## 02 `pitchesLeft` — `floor(stamina / cost)`.
##
## ⚠ **나눠떨어지지 않는 값으로 잰다.** 60 / 0.50 = 120이면 내림과 올림이
## 같아 **"올림한다" 변이가 등가가 된다** — 실제로 그랬다
func test_남은_구수를_보여준다() -> void:
	var vm: Dictionary = PitchVm.build(_two(),
		{"pitch_type": "curve", "strategy": "safe", "power": "low"},
		61.3)
	# floor(61.3 / 0.50) = 122 (올림이면 123)
	assert_int(int(vm["pitches_left"])).override_failure_message(
		"내림이 아니라 올림했다").is_equal(122)


## ⚠ **스태미나를 모르면 남은 구수도 모른다.** 0으로 두면 "이제 못 던진다"로
## 읽힌다 — **모르는 것과 바닥인 것을 가른다**
func test_스태미나를_모르면_안_보여준다() -> void:
	var vm: Dictionary = PitchVm.build(_two(), {})
	assert_bool(bool(vm["has_pitches_left"])).is_false()


## ⚠ **스태미나로 구종을 막지 않는다** — 엔진이 그렇게 안 막는다.
## 02가 "이미 부상위험 %에서 그 실수를 했다"고 적어 둔 자리다
func test_스태미나가_바닥이어도_구종을_안_막는다() -> void:
	var vm: Dictionary = PitchVm.build(_two(), {}, 1.0)
	for s in vm["slots"]:
		if bool(s["learned"]):
			assert_bool(bool(s.get("disabled", false))).override_failure_message(
				"스태미나로 구종을 막았다 — 엔진은 그렇게 안 막는다").is_false()


## 배선의 끝 — 화면이 슬롯을 그리나
func test_화면이_슬롯을_그린다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/match_screen.gd")
	assert_int(src.find("slots")).override_failure_message(
		"경기 화면이 구종 슬롯을 안 그린다").is_greater(-1)
