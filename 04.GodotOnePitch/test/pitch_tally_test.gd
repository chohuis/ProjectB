extends GdUnitTestSuite

## 투구당 결과를 세는 자리 — P-2d 계측용.
##
## ⚠ **결과 줄로는 못 세는 것이 있다.** 투수 줄의 `k`는 헛스윙과 루킹을
## 합쳐 놓고, 파울은 아무 데도 안 남는다. "탈삼진이 많은 게 헛스윙 때문인가
## 파울이 타석을 늘려서인가"는 **투구를 세야** 갈린다.
##
## ⚠ **안 주면 안 센다.** 게임 경로는 투구마다 도는 자리라 늘 세면 그만큼
## 느려진다 — 기본은 `null`이다.


func _fake_state() -> Dictionary:
	return {
		"inning": 1, "half": "top", "outs": 0,
		"count": {"balls": 0, "strikes": 0},
		"runners": {"first": {}, "second": {}, "third": {}},
		"score": {"home": 0, "away": 0},
		"inning_scores": {"home": [0, 0, 0], "away": [0, 0, 0]},
		"inning_limit": 1, "is_finished": false, "pitch_count": 0,
		"home_lineup": [_batter("H1")], "away_lineup": [_batter("A1")],
		"home_index": 0, "away_index": 0,
		"home_pitcher": _pitcher("HP"), "away_pitcher": _pitcher("AP"),
		"home_stamina": 100.0, "away_stamina": 100.0,
		"home_mental": 50.0, "away_mental": 50.0,
		"fielders": [], "last_pitch_types": [],
		"weather": "sunny", "park": "neutral",
		"defense": {"errors": 0, "assists": 0, "throw_outs": 0, "throw_safes": 0},
		"home_pitcher_lines": [], "away_pitcher_lines": [],
		"batter_accum": {}, "logs": [],
	}


func _batter(id: String) -> Dictionary:
	return {"id": id, "contact": 50.0, "eye": 50.0, "discipline": 50.0,
		"power": 50.0, "batting_clutch": 50.0, "speed": 60.0, "instinct": 60.0}


func _pitcher(id: String) -> Dictionary:
	return {"id": id, "command": 50.0, "velocity": 50.0, "control": 50.0,
		"movement": 50.0, "clutch": 50.0, "stamina_cap": 100.0,
		"mental_resil": 50.0, "hold_runners": 50.0}


func _play(tally = null) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = 909
	return GameLoop.play(_fake_state(), rng, MatchDay._decide, tally)


func test_안_주면_안_센다() -> void:
	# 세는 사전을 안 넘겨도 경기는 그대로 돈다
	assert_int(int(_play()["pitches"])).is_greater(0)


func test_주면_투구마다_센다() -> void:
	var tally: Dictionary = {}
	var out: Dictionary = _play(tally)
	var total: int = 0
	for c in tally:
		if not String(c).begins_with("zone:"):
			total += int(tally[c])
	assert_int(total).override_failure_message(
		"센 개수와 던진 개수가 다르다").is_equal(int(out["pitches"]))


## ⚠ **결과 코드를 세지 이닝을 세는 게 아니다** — 코드가 여러 종류 나와야 한다
func test_결과가_한_종류가_아니다() -> void:
	var tally: Dictionary = {}
	_play(tally)
	var kinds: int = 0
	for c in tally:
		if not String(c).begins_with("zone:"):
			kinds += 1
	assert_int(kinds).override_failure_message(
		"결과 코드가 %d종류뿐이다 — 코드가 아니라 다른 걸 세고 있다" % kinds) \
		.is_greater(2)


## 볼과 스트라이크가 둘 다 나온다 — 한쪽만 나오면 판정이 죽은 것이다
func test_볼도_스트라이크도_센다() -> void:
	var tally: Dictionary = {}
	_play(tally)
	assert_int(int(tally.get("BALL", 0))).is_greater(0)
	assert_bool(int(tally.get("STRIKE_LOOK", 0)) + int(tally.get("FOUL", 0))
		+ int(tally.get("STRIKE_SWING", 0)) > 0).is_true()


## ⚠ **착탄 구역도 센다** — P-2d의 가정("04가 그림자에 더 떨어진다")을
## 재려면 이게 필요했다. M-7이 좌표를 남긴 덕에 배선 없이 센다
func test_착탄_구역을_센다() -> void:
	var tally: Dictionary = {}
	var out: Dictionary = _play(tally)
	var zones: int = 0
	for c in tally:
		if String(c).begins_with("zone:"):
			zones += int(tally[c])
	assert_int(zones).override_failure_message(
		"착탄 구역을 안 셌다").is_equal(int(out["pitches"]))


func test_구역은_셋뿐이다() -> void:
	var tally: Dictionary = {}
	_play(tally)
	for c in tally:
		if String(c).begins_with("zone:"):
			assert_array(["zone:zone", "zone:shadow", "zone:ball"]) \
				.override_failure_message("모르는 구역이다: %s" % c).contains([c])


## 계측이 이걸 부르나 — 안 부르면 만들어 놓고 아무도 안 쓰는 것이다
func test_계측이_센다() -> void:
	var src := FileAccess.get_file_as_string("res://bench/engine_measure.gd")
	assert_int(src.find("tally")).override_failure_message(
		"계측이 투구를 안 센다").is_greater(-1)
	# ⚠ **02와 대조하는 세 비율도 낸다** — 9이닝당 값은 02의 다른 모델 것이다
	assert_int(src.find("match_engine")).override_failure_message(
		"02 ②와 대조하는 비율을 안 낸다").is_greater(-1)
