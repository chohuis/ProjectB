extends GdUnitTestSuite

## NPC 투구 선택 — P-1. **자리표시자가 리그 경기 수천 개에 쓰이고 있었다.**
##
## ⚠ `MatchDay._decide`가 `GameBench._decide`와 같은 코드였다. 주석도
## "성능을 재는 게 목적이라 전술은 안 넣는다"였는데, 그게 실제 리그를 돌렸다.
## `OUT_OF_ZONE_RATE = 0.0`이라 **존 밖을 한 번도 안 던졌고**, 볼이 4개
## 쌓일 일이 없어 **9이닝당 볼넷 0.0**이었다(02는 3.3).
##
## ⚠ **카운트도 투수도 안 봤다.** 인자가 `(_state, rng)`인데 `_state`를
## 통째로 버렸다 — 볼 3개든 스트라이크 2개든 같은 공을 던졌고, 배운 구종은
## 경기에 안 나왔다(직구/슬라이더 둘로 고정).
##
## 원본: `match_engine.rs`의 `pick_target`(코스 정본) · `pick_from_arsenal`
##       (구종) · `auto_pick_decision`. 수치는 `tuning.rs`.


func _rng(s: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = s
	return r


func _state(balls: int, strikes: int, arsenal: Array = []) -> Dictionary:
	return {
		"count": {"balls": balls, "strikes": strikes},
		"pitcher": {"id": "P1", "control": 55.0,
			"pitches": arsenal if not arsenal.is_empty()
				else [{"id": "fastball", "grade": 3}]},
	}


## 한 카운트에서 N번 뽑아 목표 좌표를 모은다
func _targets(balls: int, strikes: int, n: int = 400) -> Array:
	var r := _rng(99)
	var s: Dictionary = _state(balls, strikes)
	var out: Array = []
	for i in n:
		out.append(PitchAi.decide(s, r)["target"] as Vector2)
	return out


func _chase_rate(balls: int, strikes: int) -> float:
	var outside: int = 0
	var all: Array = _targets(balls, strikes)
	for t in all:
		# 존 반지름은 1.0이다 (`PitchOutcome.zone_of`)
		if absf(t.x) > 1.0 or absf(t.y) > 1.0:
			outside += 1
	return float(outside) / float(all.size())


# ── 존 밖을 던지는가 ──────────────────────────────────────────

## ⚠ **이게 P-1의 핵심이다.** 존 밖을 한 번도 안 던지면 볼넷이 0이 된다
func test_it_throws_outside_the_zone() -> void:
	assert_float(_chase_rate(0, 0)).override_failure_message(
		"존 밖을 한 번도 안 던진다 — 볼넷이 영원히 0이다").is_greater(0.0)


## 02 `tuning.rs` — 볼 3개 0.30 · 중립 0.50 · 스트라이크 2개 0.66.
##
## ⚠ **순서가 뜻이다.** 볼 3개면 스트라이크를 던져야 하고 스트라이크 2개면
## 유인구를 던진다 — 뒤집히면 야구가 거꾸로 돈다
func test_the_chase_rate_follows_the_count() -> void:
	var behind: float = _chase_rate(3, 0)
	var neutral: float = _chase_rate(0, 0)
	var ahead: float = _chase_rate(0, 2)
	assert_float(behind).override_failure_message(
		"볼 3개인데 유인구가 중립보다 많다").is_less(neutral)
	assert_float(ahead).override_failure_message(
		"스트라이크 2개인데 유인구가 중립보다 적다").is_greater(neutral)


## 02 값에 붙어 있는가 — 표본 400개라 ±0.08까지 본다
func test_the_chase_rates_match_the_table() -> void:
	assert_float(_chase_rate(3, 0)).is_between(
		PitchAi.CHASE_BEHIND - 0.08, PitchAi.CHASE_BEHIND + 0.08)
	assert_float(_chase_rate(0, 0)).is_between(
		PitchAi.CHASE_NEUTRAL - 0.08, PitchAi.CHASE_NEUTRAL + 0.08)
	assert_float(_chase_rate(0, 2)).is_between(
		PitchAi.CHASE_AHEAD - 0.08, PitchAi.CHASE_AHEAD + 0.08)


## ⚠ **유인구는 한 축만 뺀다** (02 주석). 두 축 다 빼면 대각선으로 크게
## 벗어나 타자가 아예 안 속고 볼만 쌓인다
func test_a_chase_pitch_misses_on_one_axis_only() -> void:
	var both: int = 0
	for t in _targets(0, 2, 600):
		if absf(t.x) > 1.0 and absf(t.y) > 1.0:
			both += 1
	assert_int(both).override_failure_message(
		"두 축을 동시에 뺀 유인구가 %d개다" % both).is_equal(0)


## 볼 3개에 스트라이크를 던질 땐 **존 한복판**이다 (02: ±0.5)
func test_behind_in_the_count_aims_at_the_middle() -> void:
	var worst: float = 0.0
	for t in _targets(3, 0, 600):
		if absf(t.x) > 1.0 or absf(t.y) > 1.0:
			continue
		worst = maxf(worst, maxf(absf(t.x), absf(t.y)))
	assert_float(worst).override_failure_message(
		"볼 3개인데 코너를 노린다 (최대 %.2f)" % worst).is_less_equal(0.5)


# ── 구종 ──────────────────────────────────────────────────────

## ⚠ **배운 구종이 경기에 나와야 한다.** 예전엔 직구/슬라이더 둘로 고정이라
## 무엇을 배우든 마운드에서 같은 공을 던졌다
func test_it_throws_what_the_pitcher_actually_has() -> void:
	var s: Dictionary = _state(0, 0, [{"id": "curve", "grade": 4},
		{"id": "forkball", "grade": 3}])
	var r := _rng(7)
	var seen: Dictionary = {}
	for i in 300:
		seen[String(PitchAi.decide(s, r)["pitch_type"])] = true
	assert_array(seen.keys()).contains(["curve"])
	assert_bool(seen.has("fastball")).override_failure_message(
		"가지고 있지도 않은 직구를 던진다").is_false()


## 구종이 없으면 직구로 떨어진다 — NPC는 아직 구종 배열이 없다(D-3)
func test_no_arsenal_falls_back_to_the_fastball() -> void:
	var s: Dictionary = {"count": {"balls": 0, "strikes": 0},
		"pitcher": {"control": 50.0}}
	assert_str(String(PitchAi.decide(s, _rng())["pitch_type"])).is_equal("fastball")


## ⚠ **볼 3개엔 제일 잘 넣는 속구 계열이다** (02 `pick_from_arsenal`)
func test_behind_in_the_count_picks_the_best_fastball() -> void:
	var s: Dictionary = _state(3, 0, [{"id": "curve", "grade": 5},
		{"id": "sinker", "grade": 2}, {"id": "fastball", "grade": 4}])
	var r := _rng(3)
	for i in 50:
		assert_str(String(PitchAi.decide(s, r)["pitch_type"])).is_equal("fastball")


## ⚠ **두 스트라이크엔 결정구다** — 속구가 아닌 것 중 숙련도 최고.
## 다만 늘 같은 공이면 읽히므로 02는 70%만 그리로 간다.
##
## ⚠ **실제 비율은 0.70보다 높다.** 70%에서 안 걸리면 **가중 추첨으로
## 떨어지는데 거기서 또 뽑힐 수 있다** — 02도 같은 흐름이다.
## 포크볼(4등급 1.5) vs 직구(5등급 2.0)면 0.70 + 0.30×(1.5/3.5) ≈ 0.83.
## 처음에 0.60~0.80으로 잡았다가 0.81에서 걸렸는데, **검사가 틀렸지
## 코드가 틀린 게 아니었다**
func test_two_strikes_favours_the_out_pitch() -> void:
	var s: Dictionary = _state(0, 2, [{"id": "fastball", "grade": 5},
		{"id": "forkball", "grade": 4}])
	var r := _rng(11)
	var fork: int = 0
	for i in 400:
		if String(PitchAi.decide(s, r)["pitch_type"]) == "forkball":
			fork += 1
	var rate: float = float(fork) / 400.0
	# 순수 추첨이면 1.5/3.5 = 0.43이다 — 결정구 가중이 실제로 걸렸는지를 본다
	assert_float(rate).override_failure_message(
		"결정구 비율이 %.2f다 (기대 0.70~0.90, 순수 추첨이면 0.43)" % rate
		).is_between(0.70, 0.90)


# ── 전략 ──────────────────────────────────────────────────────

func test_the_strategy_follows_the_count() -> void:
	assert_str(String(PitchAi.decide(_state(3, 0), _rng())["strategy"])).is_equal("safe")
	assert_str(String(PitchAi.decide(_state(0, 2), _rng())["strategy"])).is_equal("aggressive")
	assert_str(String(PitchAi.decide(_state(0, 0), _rng())["strategy"])).is_equal("balanced")


# ── 존 번호 ───────────────────────────────────────────────────

## ⚠ **좌표와 존 번호가 같은 것을 가리켜야 한다.** 화면은 존 번호를 보고
## 엔진은 좌표를 본다 — 어긋나면 "가운데라고 떴는데 볼"이 된다.
##
## ⚠ **"제일 가까운 대표점"으로는 못 본다.** 그렇게 짰다가 x=0.332에서
## 걸렸는데, 문턱이 `< 0.33`이고 대표점이 ±0.67이라 0.33~0.335 띠에서
## 둘이 갈린다 — **02가 그렇게 정한 것이고 코드가 틀린 게 아니었다.**
## 여기서는 **한 칸(0.67)을 넘게 벗어나지 않는가**를 본다. 진짜 위험은
## 행·열이 뒤바뀌는 것이고(02의 `[[7,8,9],[4,5,6],[1,2,3]]`) 그건 이걸로 잡힌다
func test_the_zone_number_stays_within_one_cell() -> void:
	var r := _rng(5)
	var s: Dictionary = _state(0, 0)
	for i in 300:
		var d: Dictionary = PitchAi.decide(s, r)
		var t: Vector2 = d["target"]
		if absf(t.x) > 1.0 or absf(t.y) > 1.0:
			continue
		var got: Vector2 = PitchOutcome.zone_to_target(int(d["location"]))
		assert_float(absf(got.x - t.x)).override_failure_message(
			"존 %d(%s)이 %s에서 가로로 한 칸 넘게 벗어났다" % [d["location"], got, t]
			).is_less_equal(0.68)
		assert_float(absf(got.y - t.y)).override_failure_message(
			"존 %d(%s)이 %s에서 세로로 한 칸 넘게 벗어났다" % [d["location"], got, t]
			).is_less_equal(0.68)


## ⚠ **표를 못 박는다** (02 `target_to_zone`). 행과 열이 뒤바뀌면 화면의
## 코스 표시가 통째로 거울이 되는데, 경기 결과는 좌표로 나므로 **아무도
## 안 죽고 그림만 틀린다** — 제일 늦게 발견되는 종류다
func test_the_zone_table_matches_the_original() -> void:
	# y < -0.33 이 윗줄(7·8·9), y > 0.33 이 아랫줄(1·2·3)
	assert_int(PitchAi.target_to_zone(Vector2(-0.8, -0.8))).is_equal(7)
	assert_int(PitchAi.target_to_zone(Vector2(0.0, -0.8))).is_equal(8)
	assert_int(PitchAi.target_to_zone(Vector2(0.8, -0.8))).is_equal(9)
	assert_int(PitchAi.target_to_zone(Vector2(-0.8, 0.0))).is_equal(4)
	assert_int(PitchAi.target_to_zone(Vector2(0.0, 0.0))).is_equal(5)
	assert_int(PitchAi.target_to_zone(Vector2(0.8, 0.0))).is_equal(6)
	assert_int(PitchAi.target_to_zone(Vector2(-0.8, 0.8))).is_equal(1)
	assert_int(PitchAi.target_to_zone(Vector2(0.0, 0.8))).is_equal(2)
	assert_int(PitchAi.target_to_zone(Vector2(0.8, 0.8))).is_equal(3)


## ⚠ **숙련도가 추첨 무게를 정한다** (02 `grade_pick_weight`). 평평하게 두면
## 5등급 결정구나 1등급 미완성 구종이나 똑같이 나와서 **구종을 다듬을 이유가
## 사라진다** — F-1로 숙련도를 올릴 수 있게 됐으니 여기가 그 소비처다
func test_a_higher_grade_is_thrown_more_often() -> void:
	# 중립 카운트 · 속구가 아닌 둘 — 결정구 가중이 안 걸리게 스트라이크 0
	var s: Dictionary = _state(0, 0, [{"id": "curve", "grade": 5},
		{"id": "changeup", "grade": 1}])
	var r := _rng(23)
	var curve: int = 0
	for i in 600:
		if String(PitchAi.decide(s, r)["pitch_type"]) == "curve":
			curve += 1
	var rate: float = float(curve) / 600.0
	# 5등급 2.0 vs 1등급 0.5 → 0.8. 평평하면 0.5다
	assert_float(rate).override_failure_message(
		"5등급 비율이 %.2f다 (기대 0.8, 평평하면 0.5)" % rate).is_greater(0.65)


func test_the_grade_weight_table_matches_the_original() -> void:
	assert_float(PitchAi.grade_pick_weight(1)).is_equal(0.5)
	assert_float(PitchAi.grade_pick_weight(2)).is_equal(0.8)
	assert_float(PitchAi.grade_pick_weight(3)).is_equal(1.0)
	assert_float(PitchAi.grade_pick_weight(4)).is_equal(1.5)
	assert_float(PitchAi.grade_pick_weight(5)).is_equal(2.0)
