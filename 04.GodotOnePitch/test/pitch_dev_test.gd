extends GdUnitTestSuite

## 구종 습득 — F-1. **육성 축 하나가 통째로 죽어 있었다.**
##
## ⚠ `world.gd:280`이 직구 하나를 박고 끝이었다. 소비처(`pitch_step`이
## 숙련도를 읽고 `training_growth`가 성장 배수를 가른다)는 다 있는데
## **생산처가 없었다** — `append`도 `grade` 올리기도 어디에도 없었다.
##
## ⚠ `week_runner.gd:150`이 `pitch_dev_gain`을 `p["pitch_dev"]`에 쌓고 있었다.
## **읽는 곳이 0건이다.** 어느 구종을 배우는 중인지도 없어서, 100을 넘겨도
## 아무 일이 안 일어났다. `injury_history`와 같은 모양인데 크기가 다르다.
##
## 원본: `growth_engine.rs:585-612`(진행·습득) · `stores/game.ts:2169-2199`
## (시작·완료) · `pitch_catalog.json` · `pitch_unlock_rules.json`


func _me(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "ME", "name": "김한결", "position": "SP", "age": 17,
		"pitching": {"velocity": 70.0, "command": 55.0, "control": 60.0,
			"movement": 55.0, "mentality": 55.0, "stamina": 60.0},
		"pitches": [{"id": "fastball", "grade": 3}],
		"training_pitch_state": {},
	}
	p.merge(over, true)
	return p


# ── 표를 읽는가 ───────────────────────────────────────────────

## ⚠ **02 표 그대로다.** 값을 04에서 새로 정하지 않았다
func test_the_catalog_has_every_pitch_the_engine_knows() -> void:
	var ids: Array = []
	for e in PitchDev.catalog():
		ids.append(String(e["id"]))
	# `pitch_vm.PITCH_LABEL`이 엔진 키의 정본이다 — 표가 그걸 다 덮어야 한다
	for id in PitchVm.PITCH_LABEL:
		assert_array(ids).override_failure_message(
			"표에 없는 구종: %s" % id).contains([id])


func test_the_starting_pitch_needs_nothing() -> void:
	assert_bool(PitchDev.is_unlocked("fastball", _me())).is_true()


# ── 해금 ──────────────────────────────────────────────────────

## 싱커는 구속 68이 필요하다 (02 `PITCH_UNLOCK_SINKER`)
func test_a_stat_gate_blocks_and_opens() -> void:
	var weak: Dictionary = _me({"pitching": {"velocity": 60.0}})
	var strong: Dictionary = _me({"pitching": {"velocity": 68.0}})
	assert_bool(PitchDev.is_unlocked("sinker", weak)).is_false()
	assert_bool(PitchDev.is_unlocked("sinker", strong)).is_true()


## ⚠ **커터는 둘 다 넘어야 한다** (02 `multi_stat`). 하나만 보면 아직 못 던질
## 구종이 목록에 뜬다
func test_a_two_stat_gate_needs_both() -> void:
	var half: Dictionary = _me({"pitching": {"command": 52.0, "velocity": 60.0}})
	var full: Dictionary = _me({"pitching": {"command": 52.0, "velocity": 68.0}})
	assert_bool(PitchDev.is_unlocked("cutter", half)).is_false()
	assert_bool(PitchDev.is_unlocked("cutter", full)).is_true()


# ── 고를 수 있는 것 ───────────────────────────────────────────

## ⚠ **이미 가진 구종도 고를 수 있다** — 그게 숙련도를 올리는 길이다.
## 다만 5등급이면 더 올릴 데가 없다
func test_a_mastered_pitch_is_not_offered() -> void:
	var p: Dictionary = _me({"pitches": [{"id": "fastball", "grade": 5}]})
	for c in PitchDev.choices(p):
		if String(c["id"]) == "fastball":
			assert_bool(c["can_train"]).override_failure_message(
				"5등급인데 더 올릴 수 있다고 한다").is_false()


func test_an_owned_pitch_can_be_honed() -> void:
	var p: Dictionary = _me({"pitches": [{"id": "fastball", "grade": 3}]})
	for c in PitchDev.choices(p):
		if String(c["id"]) == "fastball":
			assert_bool(c["can_train"]).is_true()
			assert_bool(c["owned"]).is_true()


## ⚠ **다섯이 차면 새 구종을 못 배운다** (02 `maxLearned: 5`). 가진 것을
## 다듬는 건 그래도 된다
func test_a_full_arsenal_blocks_new_pitches_only() -> void:
	var five: Array = [{"id": "fastball", "grade": 3}, {"id": "slider", "grade": 2},
		{"id": "curve", "grade": 2}, {"id": "changeup", "grade": 2},
		{"id": "splitter", "grade": 2}]
	var p: Dictionary = _me({"pitches": five,
		"pitching": {"velocity": 99.0, "command": 99.0, "control": 99.0,
			"movement": 99.0, "mentality": 99.0}})
	for c in PitchDev.choices(p):
		if String(c["id"]) == "sinker":
			assert_bool(c["can_train"]).override_failure_message(
				"다섯이 찼는데 새 구종을 배울 수 있다고 한다").is_false()
		if String(c["id"]) == "slider":
			assert_bool(c["can_train"]).is_true()


# ── 시작 ──────────────────────────────────────────────────────

## 02는 시작할 때 진행률을 5로 둔다 (`stores/game.ts:2176`)
func test_starting_sets_the_opening_progress() -> void:
	var p: Dictionary = _me()
	assert_bool(PitchDev.start(p, "slider")).is_true()
	assert_str(String(p["training_pitch_state"]["id"])).is_equal("slider")
	assert_float(float(p["training_pitch_state"]["progress"])).is_equal(
		PitchDev.START_PROGRESS)


## ⚠ **잠긴 구종은 시작도 안 된다.** 화면이 막아도 여기서 한 번 더 막는다 —
## 02는 화면에만 가드가 있어서 다른 호출부가 그대로 통과했다
func test_a_locked_pitch_cannot_be_started() -> void:
	var p: Dictionary = _me({"pitching": {"command": 10.0}})
	assert_bool(PitchDev.start(p, "knuckleball")).is_false()
	assert_bool((p["training_pitch_state"] as Dictionary).is_empty()).is_true()


# ── 진행과 습득 ───────────────────────────────────────────────

func test_progress_accumulates() -> void:
	var p: Dictionary = _me()
	PitchDev.start(p, "slider")
	PitchDev.advance(p, 30.0)
	assert_float(float(p["training_pitch_state"]["progress"])).is_equal(
		PitchDev.START_PROGRESS + 30.0)


## ⚠ **100을 넘으면 배운다.** 새 구종은 1등급으로 들어온다 (02 그대로)
func test_reaching_a_hundred_learns_the_pitch() -> void:
	var p: Dictionary = _me()
	PitchDev.start(p, "slider")
	var log: Array = PitchDev.advance(p, 100.0)
	var grades: Dictionary = {}
	for e in p["pitches"]:
		grades[String(e["id"])] = int(e["grade"])
	assert_int(grades.get("slider", 0)).is_equal(1)
	# 배우고 나면 훈련 자리가 비어야 한다 — 안 비우면 영원히 다시 배운다
	assert_bool((p["training_pitch_state"] as Dictionary).is_empty()).is_true()
	assert_bool(log.is_empty()).is_false()


func test_reaching_a_hundred_on_an_owned_pitch_raises_the_grade() -> void:
	var p: Dictionary = _me({"pitches": [{"id": "fastball", "grade": 3}]})
	PitchDev.start(p, "fastball")
	PitchDev.advance(p, 100.0)
	for e in p["pitches"]:
		if String(e["id"]) == "fastball":
			assert_int(int(e["grade"])).is_equal(4)


## ⚠ **5를 안 넘는다.** 02도 `min(5, grade+1)`이다
func test_a_grade_never_passes_five() -> void:
	var p: Dictionary = _me({"pitches": [{"id": "fastball", "grade": 5}]})
	p["training_pitch_state"] = {"id": "fastball", "progress": 99.0}
	PitchDev.advance(p, 10.0)
	for e in p["pitches"]:
		if String(e["id"]) == "fastball":
			assert_int(int(e["grade"])).is_equal(5)


## 훈련 중인 게 없으면 아무 일도 안 한다 — 진행률이 허공에 쌓이면 안 된다
func test_nothing_happens_without_a_training_pitch() -> void:
	var p: Dictionary = _me()
	PitchDev.advance(p, 50.0)
	assert_bool((p["training_pitch_state"] as Dictionary).is_empty()).is_true()
	assert_int((p["pitches"] as Array).size()).is_equal(1)


# ── 진짜 게임에서 도는가 ──────────────────────────────────────
#
# ⚠ **사전만 맞고 배선이 없으면 검사만 통과한다.** 이 축이 정확히 그랬다 —
# `PitchDev`에 해당하는 코드가 아예 없었고, `week_runner`는 진행률을 아무도
# 안 읽는 키에 쌓고 있었다. 여기서는 **주 처리를 실제로 돌린다.**


## ⚠ **문턱을 넘겨 두고 시작한다.** 새 게임 주인공은 커맨드가 48이라
## 슬라이더(52 필요)가 **잠겨 있다** — 규칙이 제대로 막은 것이고, 그대로
## 두면 이 검사가 "배선이 끊겼다"로 잘못 읽힌다.
## 능력치를 손대지 않으면 씨앗이 바뀔 때마다 결과가 흔들린다
func _state() -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var q: Dictionary = s["protagonist"]["pitching"]
	q["command"] = 60.0
	# 구종 개발을 1순위로 — 그래야 `pitch_dev_gain`이 나온다
	s["training_plan"] = {"primary": "TRN_PITCH_DEV"}
	return s


## ⚠ **주를 돌리면 진행률이 실제로 쌓여야 한다.**
func test_a_week_of_training_moves_the_progress() -> void:
	var s: Dictionary = _state()
	assert_bool(PitchDev.start(s["protagonist"], "slider")).is_true()
	var before: float = float(s["protagonist"]["training_pitch_state"]["progress"])
	WeekRunner.run(s, 7)
	var after: float = float(s["protagonist"]["training_pitch_state"]["progress"])
	assert_float(after).override_failure_message(
		"주를 돌렸는데 진행률이 그대로다 — 배선이 끊겼다").is_greater(before)


## ⚠ **몇 주를 돌리면 실제로 배워야 한다.** 이게 이 축의 요점이다 —
## 예전엔 얼마를 쌓아도 `pitches`가 영원히 직구 하나였다
func test_enough_weeks_actually_learn_the_pitch() -> void:
	var s: Dictionary = _state()
	PitchDev.start(s["protagonist"], "slider")
	for w in range(1, 21):
		WeekRunner.run(s, w * 7)
		if PitchDev.owns(s["protagonist"], "slider"):
			break
	assert_bool(PitchDev.owns(s["protagonist"], "slider")).override_failure_message(
		"스무 주를 훈련했는데 구종을 못 배웠다").is_true()


## ⚠ **배운 구종이 경기에 실려야 한다.** `match_day.gd:74-77`이 구종 배열을
## 싣는데, 배운 게 거기 안 들어가면 화면에만 늘고 경기는 그대로다
func test_a_learned_pitch_reaches_the_game() -> void:
	var s: Dictionary = _state()
	PitchDev.start(s["protagonist"], "slider")
	for w in range(1, 21):
		WeekRunner.run(s, w * 7)
		if PitchDev.owns(s["protagonist"], "slider"):
			break
	var ids: Array = []
	for e in s["protagonist"].get("pitches", []):
		ids.append(String(e["id"]))
	assert_array(ids).contains(["slider"])


# ── 화면에서 고를 수 있는가 ───────────────────────────────────
#
# ⚠ **신호만 있고 받는 곳이 없으면 아무 일도 안 일어난다.** 04가 이번
# 세션에서 고친 결함 셋이 전부 그 모양이었다


func _root() -> AppRoot:
	var r: AppRoot = preload("res://ui/app_root.tscn").instantiate()
	add_child(r)
	r.set_state(_state())
	await await_idle_frame()
	r._on_training()
	await await_idle_frame()
	return r


func _pitch_button(r: AppRoot, name_text: String) -> Button:
	for b in r.find_children("*", "Button", true, false):
		for l in (b as Button).find_children("*", "Label", true, false):
			if (l as Label).text == name_text:
				return b as Button
	return null


## ⚠ **훈련 화면에 구종 자리가 아예 없었다.** 성장 축이 죽어 있어서
## 고를 화면도 없었다
func test_the_training_screen_lists_pitches() -> void:
	var r := await _root()
	assert_object(_pitch_button(r, "슬라이더")).override_failure_message(
		"훈련 화면에 구종 목록이 없다").is_not_null()


## 눌러서 실제로 상태가 바뀌는가 — 화면 → 루트 → 엔진
func test_picking_a_pitch_starts_the_training() -> void:
	var r := await _root()
	var b: Button = _pitch_button(r, "슬라이더")
	b.pressed.emit()
	await await_idle_frame()
	await await_idle_frame()
	assert_str(String(r.state()["protagonist"]["training_pitch_state"].get("id", ""))
		).is_equal("slider")


## ⚠ **같은 것을 다시 누르면 접는다.** 잘못 골랐을 때 되돌릴 길이 없으면
## 그 주가 통째로 날아간다
func test_picking_the_same_pitch_again_cancels() -> void:
	var r := await _root()
	var b: Button = _pitch_button(r, "슬라이더")
	b.pressed.emit()
	await await_idle_frame()
	await await_idle_frame()
	_pitch_button(r, "슬라이더").pressed.emit()
	await await_idle_frame()
	await await_idle_frame()
	assert_bool((r.state()["protagonist"]["training_pitch_state"] as Dictionary
		).is_empty()).is_true()
