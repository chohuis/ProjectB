extends GdUnitTestSuite

## 마지막 투구가 어디 떨어졌나 — M-7.
##
## 원본: `MatchPage.svelte:1656-1658`(`zone-last-dot`) · `:1650-1662`(존 캔버스)
##
## ⚠ **04에서 진짜로 없던 유일한 데이터다.** M-0 대조표에서 나머지 여덟
## 패널은 "데이터는 있고 화면만 없다"였는데 착탄 좌표만 **`pitch_step` 안에서
## 쓰이고 버려졌다**(`:80-95`).
##
## ⚠ **`last_pitch_types`가 선례다.** 같은 방식으로 state에 남긴다.
##
## ⚠ **존 좌표계**: 스트라이크존은 `|x| <= 1` · `|y| <= 1`이고 바깥이
## 그림자·볼이다(`PitchOutcome.zone_of`). 화면은 그걸 0~1 비율로 바꿔 찍는다.


func _state() -> Dictionary:
	return {
		"inning": 1, "half": "top", "outs": 0,
		"count": {"balls": 0, "strikes": 0},
		"runners": {"first": {}, "second": {}, "third": {}},
		"score": {"home": 0, "away": 0},
		"inning_scores": {"home": [0, 0, 0, 0, 0, 0, 0, 0, 0],
			"away": [0, 0, 0, 0, 0, 0, 0, 0, 0]},
		"inning_limit": 9, "is_finished": false, "pitch_count": 0,
		"pitcher": {"command": 50.0, "velocity": 50.0, "control": 50.0,
			"movement": 50.0, "clutch": 50.0, "stamina_cap": 60.0,
			"mental_resil": 50.0, "hold_runners": 50.0},
		"batter": {"id": "B1", "contact": 50.0, "eye": 50.0, "discipline": 50.0,
			"power": 50.0, "batting_clutch": 50.0, "speed": 70.0, "instinct": 70.0},
		"stamina": 80.0, "mental": 60.0, "grade": 3,
		"fielders": [], "last_pitch_types": [],
		"weather": "sunny", "park": "neutral",
		"defense": {"errors": 0, "assists": 0, "throw_outs": 0, "throw_safes": 0},
		"pitcher_line": {"outs": 0, "pc": 0, "k": 0, "bb": 0, "h": 0, "er": 0},
		"batter_accum": {}, "logs": [],
	}


func _pitch(s: Dictionary, location: int = 5, seed_value: int = 4242) -> Dictionary:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return PitchStep.step(s, {"pitch_type": "fastball", "location": location,
		"strategy": "balanced", "power": "normal"}, r)


func test_던지면_착탄이_상태에_남는다() -> void:
	var out: Dictionary = _pitch(_state())
	assert_bool((out["state"] as Dictionary).has("last_landing")) \
		.override_failure_message("착탄 좌표가 상태에 안 남는다").is_true()


## ⚠ **좌표는 존 기준이다** — 한가운데를 겨냥하면 원점 근처에 떨어진다.
## 제구 흔들림이 있으니 정확히 0은 아니다
func test_한가운데를_겨냥하면_원점_근처다() -> void:
	var out: Dictionary = _pitch(_state(), 5)
	var p: Vector2 = out["state"]["last_landing"]
	assert_float(absf(p.x)).override_failure_message(
		"5번(한가운데)을 겨냥했는데 x가 %.2f다" % p.x).is_less(1.5)
	assert_float(absf(p.y)).is_less(1.5)


## ⚠ **존 밖(거르기)은 확실히 밖이다** — 0번은 의도적 볼이다
func test_존_밖을_겨냥하면_밖에_떨어진다() -> void:
	var out: Dictionary = _pitch(_state(), 0)
	var p: Vector2 = out["state"]["last_landing"]
	assert_float(absf(p.x)).override_failure_message(
		"존 밖을 겨냥했는데 x가 %.2f로 존 안이다" % p.x).is_greater(1.0)


## 매 투구마다 갱신된다 — 이전 공 자리에 머물면 화면이 거짓말을 한다
func test_던질_때마다_갱신된다() -> void:
	var first: Dictionary = _pitch(_state(), 1)
	var a: Vector2 = first["state"]["last_landing"]
	var second: Dictionary = _pitch(first["state"], 9, 777)
	var b: Vector2 = second["state"]["last_landing"]
	assert_bool(a.is_equal_approx(b)).override_failure_message(
		"1번과 9번을 던졌는데 착탄이 같다").is_false()


## ⚠ **겨냥한 곳이 아니라 떨어진 곳이다.** 겨냥을 남기면 제구가 흔들려도
## 화면은 늘 "내가 노린 자리"를 보여준다 — 빠진 공이 안 보인다.
## **같은 칸을 두 번 겨냥해 갈리는지로 잰다** — 겨냥은 두 번 다 같은 값이다
func test_겨냥이_아니라_떨어진_곳이다() -> void:
	var a: Vector2 = _pitch(_state(), 5, 11)["state"]["last_landing"]
	var b: Vector2 = _pitch(_state(), 5, 99)["state"]["last_landing"]
	assert_bool(a.is_equal_approx(b)).override_failure_message(
		"5번을 두 번 겨냥했는데 착탄이 같다 — 겨냥한 곳을 남기고 있다").is_false()
	assert_float(a.length()).override_failure_message(
		"착탄이 겨냥한 자리와 정확히 같다").is_greater(0.0)


## ⚠ **첫 공 전에는 없다.** 0,0으로 채우면 안 던졌는데 한가운데 점이 찍힌다 —
## **모르는 것과 한가운데를 가른다**
func test_첫_공_전에는_없다() -> void:
	assert_bool(_state().has("last_landing")).override_failure_message(
		"안 던졌는데 착탄이 있다").is_false()


## 화면이 쓰는 비율 — 존 `-1~1`을 `0~1`로. 02 `lastPitchPct`와 같은 뜻이다
func test_비율로_바꾼다() -> void:
	# 한가운데(0,0) → 0.5, 0.5
	var c: Vector2 = MatchVm.landing_pct(Vector2.ZERO)
	assert_float(c.x).is_equal_approx(0.5, 0.001)
	assert_float(c.y).is_equal_approx(0.5, 0.001)
	# 존 오른쪽 끝(1,0) → x가 크다
	assert_float(MatchVm.landing_pct(Vector2(1.0, 0.0)).x).is_greater(0.5)


## ⚠ **존 밖도 그린다.** 0~1로 자르면 빠진 공이 경계에 붙어 "아슬아슬했다"로
## 보인다 — 02도 캔버스 밖으로 나가게 둔다
func test_존을_벗어나면_비율도_벗어난다() -> void:
	assert_float(MatchVm.landing_pct(Vector2(2.0, 0.0)).x).override_failure_message(
		"존 밖 공이 경계에 붙었다").is_greater(1.0)


## 사전에 실린다 — 화면이 상태를 다시 읽지 않는다
func test_사전에_실린다() -> void:
	var out: Dictionary = _pitch(_state())
	var vm: Dictionary = MatchVm.build(out["state"],
		{"my_side": "home", "my_id": "P1"})
	assert_bool(bool(vm["has_last_landing"])).is_true()
	assert_bool(vm["last_landing_pct"] is Vector2).is_true()


func test_안_던졌으면_사전에도_없다() -> void:
	var vm: Dictionary = MatchVm.build(_state(),
		{"my_side": "home", "my_id": "P1"})
	assert_bool(bool(vm["has_last_landing"])).is_false()


## ⚠ **04는 격자가 곧 존 박스다** — 02의 캔버스는 그보다 넓다.
## 한가운데는 격자 한가운데에 온다
func test_한가운데는_격자_한가운데다() -> void:
	var p: Vector2 = MatchVm.landing_point(Vector2(126, 126), Vector2(0.5, 0.5))
	assert_float(p.x).is_equal_approx(63.0, 0.5)
	assert_float(p.y).is_equal_approx(63.0, 0.5)


## 존 오른쪽 끝(x=1)은 격자 오른쪽 변이다 — 캔버스 여백을 빼고 나면 딱 맞는다
func test_존_끝이_격자_변이다() -> void:
	var p: Vector2 = MatchVm.landing_point(Vector2(126, 126),
		MatchVm.landing_pct(Vector2(1.0, 1.0)))
	assert_float(p.x).override_failure_message(
		"존 오른쪽 끝이 격자 변에 안 온다: %.1f" % p.x).is_equal_approx(126.0, 0.5)
	assert_float(p.y).is_equal_approx(126.0, 0.5)


## ⚠ **크게 빠진 공은 격자 밖에 찍힌다** — 안으로 밀어 넣으면 거짓말이다
func test_빠진_공은_격자_밖이다() -> void:
	var p: Vector2 = MatchVm.landing_point(Vector2(126, 126),
		MatchVm.landing_pct(Vector2(2.0, 0.0)))
	assert_float(p.x).override_failure_message(
		"빠진 공이 격자 안에 들어왔다").is_greater(126.0)


## 배선의 끝 — 화면이 점을 찍나
func test_화면이_점을_찍는다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/match_screen.gd")
	assert_int(src.find("landing_point")).override_failure_message(
		"경기 화면이 착탄 점을 안 찍는다").is_greater(-1)
	assert_int(src.find("has_last_landing")).override_failure_message(
		"안 던졌을 때를 안 가린다").is_greater(-1)
