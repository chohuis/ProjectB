extends GdUnitTestSuite

## 훈련 결과 소식 — 🔴 **쌓기만 하고 아무도 안 읽었다.**
##
## `week_runner.gd:228`과 `match_outcome.gd:82`가 `training_log`에 쌓으면서
## 주석에 *"소식이 `training_log`를 읽는다"*고 적어 뒀는데,
## **읽는 곳이 하나도 없다**(쓰는 자리 둘, 검사 빼고).
##
## **이번 루프에서 같은 형태를 네 번째 만났다** — 소식 본문 · 월간 부상
## 리포트 · 다이제스트 · 부상 치료. **쓰는 쪽을 만들면 읽는 쪽을 센다.**
##
## 02는 이걸 `TrainingStatBars`(152줄)로 편다:
## 능력치마다 **진척 막대(pct)** · 현재값 · **레벨업(+1 ★)**,
## 그리고 컨디션 / 피로도 / 사기.
##
## ✅ **04도 같은 모형이다** — `Growth.try_level_up`이 정수 레벨과 `xp`를
## 가르고 `xp_threshold`가 다음 레벨까지의 양을 준다. **지어낼 게 없다.**


func _state(logs: Array, o: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": "ME", "name": "김한결",
		"career_stage": "pro_kbl", "league_id": "LEAGUE_KBL",
		"team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"pitching": {"ovr": 70.0, "velocity": 70.0, "control": 68.0},
		"pitching_xp": {"velocity": 0.0, "control": 0.0},
		"batting": {}, "batting_xp": {},
		"condition": 80.0, "fatigue": 30.0, "morale": 60.0,
		"injury": null, "retired": false}
	p.merge(o, true)
	return {"day": 100, "season_year": 2031, "seed": 5,
		"protagonist": p, "pending": [], "mailbox": [],
		"training_log": logs, "world": {"rosters": {}}}


func _entry(day: int, gains: Array) -> Dictionary:
	return {"day": day, "gains": gains}


# ── 소식이 되나 ───────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 쌓기만 하고 아무도 안 읽으면 없는 것과 같다
func test_훈련_결과가_소식이_된다() -> void:
	var s: Dictionary = _state([_entry(100, ["velocity +1"])])
	var m: Dictionary = TrainingReport.message_of(s, 100)
	assert_bool(m.is_empty()).override_failure_message(
		"훈련 결과가 소식으로 안 나온다").is_false()
	assert_str(String(m.get("category", ""))).is_equal("coach")


## 오른 게 없으면 안 보낸다 — 빈 소식을 주마다 보내지 않는다
func test_오른_게_없으면_안_보낸다() -> void:
	assert_bool(TrainingReport.message_of(_state([]), 100).is_empty()).is_true()


## 본문에 **무엇이 몇 올랐는지**가 줄로 있다
func test_본문에_오른_것이_있다() -> void:
	var s: Dictionary = _state([_entry(100, ["velocity +1", "control +2"])])
	var body: String = String(TrainingReport.message_of(s, 100).get("body", ""))
	assert_int(body.find("velocity")).override_failure_message(
		"무엇이 올랐는지가 없다: %s" % body).is_greater(-1)
	assert_int(body.find("+2")).is_greater(-1)


## 🔴 **진척률을 낸다** — 02 `TrainingStatBars`의 막대에 해당한다.
## 04는 `xp / xp_threshold(값)`로 낼 수 있다
func test_진척률이_나온다() -> void:
	var s: Dictionary = _state([_entry(100, ["velocity +1"])],
		{"pitching_xp": {"velocity": Growth.xp_threshold(70.0) * 0.5}})
	var body: String = String(TrainingReport.message_of(s, 100).get("body", ""))
	assert_int(body.find("50%")).override_failure_message(
		"다음 레벨까지 진척이 없다 — 02는 막대로 낸다: %s" % body).is_greater(-1)


## 컨디션 · 피로도 · 사기를 같이 낸다 — 02도 그 셋을 낸다
func test_상태_셋을_같이_낸다() -> void:
	var s: Dictionary = _state([_entry(100, ["velocity +1"])])
	var body: String = String(TrainingReport.message_of(s, 100).get("body", ""))
	for key in ["컨디션", "피로", "사기"]:
		assert_int(body.find(key)).override_failure_message(
			"%s가 없다: %s" % [key, body]).is_greater(-1)


## ⚠ **그 주 것만 낸다.** 지난주 것까지 섞으면 매주 같은 줄이 쌓인다
func test_그_주_것만_낸다() -> void:
	var s: Dictionary = _state([_entry(93, ["control +5"]),
		_entry(100, ["velocity +1"])])
	var body: String = String(TrainingReport.message_of(s, 100).get("body", ""))
	assert_int(body.find("+5")).override_failure_message(
		"지난주 것이 섞였다: %s" % body).is_equal(-1)


## id가 겹치면 소식함에서 하나가 조용히 사라진다 — 주마다 달라야 한다
func test_주마다_id가_다르다() -> void:
	var a: String = String(TrainingReport.message_of(
		_state([_entry(100, ["velocity +1"])]), 100).get("id", ""))
	var b: String = String(TrainingReport.message_of(
		_state([_entry(107, ["velocity +1"])]), 107).get("id", ""))
	assert_str(a).is_not_equal(b)


# ── 배선 ──────────────────────────────────────────────────────────

## 🔴 **주간 처리가 안 부르면 또 죽은 배선이다**
func test_주간_처리가_부른다() -> void:
	assert_int(CodeText.of("res://sim/week_runner.gd").find("TrainingReport")) \
		.override_failure_message(
			"훈련 결과를 아무도 안 부른다 — 또 죽은 배선이다").is_greater(-1)


## 끝까지 굴려서 본다 — 문자열 검사만으론 인자가 틀린 걸 못 잡는다
func test_주간_처리를_굴리면_온다() -> void:
	var s: Dictionary = _state([])
	s["training_plan"] = {"primary": "", "secondary": "", "secondary2": ""}
	WeekRunner.run(s, 100)
	# 훈련이 없으면 소식도 없다 — 그것부터 못 박는다
	for m in s.get("mailbox", []):
		assert_str(String(m.get("sender", ""))).override_failure_message(
			"훈련을 안 했는데 결과 소식이 왔다").is_not_equal("트레이닝 코치")


## 오른 게 있으면 소식함에 들어간다
func test_오르면_소식함에_들어간다() -> void:
	var s: Dictionary = _state([_entry(100, ["velocity +1"])])
	TrainingReport.send(s, 100)
	var found: bool = false
	for m in s.get("mailbox", []):
		if String(m.get("sender", "")) == "트레이닝 코치":
			found = true
	assert_bool(found).override_failure_message(
		"오른 게 있는데 소식함에 없다").is_true()


## ⚠ **같은 주에 두 번 안 넣는다.** 경기 성장도 같은 로그에 쌓으므로
## 한 주에 `send`가 두 번 불릴 수 있다 — 겹친 id는 소식함에서 하나가
## 조용히 사라진다(`news_vm`이 그걸 센다)
func test_같은_주에_두_번_안_넣는다() -> void:
	var s: Dictionary = _state([_entry(100, ["velocity +1"])])
	assert_bool(TrainingReport.send(s, 100)).is_true()
	assert_bool(TrainingReport.send(s, 100)).override_failure_message(
		"같은 주에 두 번 들어갔다").is_false()
	var n: int = 0
	for m in s.get("mailbox", []):
		if String(m.get("sender", "")) == "트레이닝 코치":
			n += 1
	assert_int(n).is_equal(1)
