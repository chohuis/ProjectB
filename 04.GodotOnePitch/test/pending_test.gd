extends GdUnitTestSuite

## 결정 대기줄 — 세계가 멈추고 사용자에게 묻는 자리. B-6b.
##
## ⚠ **줄은 이미 있던 `state["pending"]` 하나다.** `DayEngine.stop_reason`이
## 읽고 `SeasonRunner`가 해마다 비운다 — 새 키를 만들면 "멈추는 이유"의
## 정본이 둘이 되고, 한쪽에만 넣은 결정은 영영 안 물어본다.


func _state() -> Dictionary:
	return {"day": 1}


# ── 넣고 빼기 ─────────────────────────────────────────────────

func test_an_empty_state_has_nothing_to_answer() -> void:
	var s: Dictionary = _state()
	assert_array(Pending.all(s)).is_empty()
	assert_dict(Pending.next(s)).is_empty()
	assert_bool(Pending.has(s, "fa_market")).is_false()


func test_what_you_push_comes_back() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "fa_market"})
	assert_int(Pending.all(s).size()).is_equal(1)
	assert_bool(Pending.has(s, "fa_market")).is_true()
	assert_str(String(Pending.next(s)["type"])).is_equal("fa_market")


func test_the_queue_answers_in_order() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "career_results"})
	Pending.push(s, {"type": "fa_market"})
	assert_str(String(Pending.next(s)["type"])).override_failure_message(
		"먼저 넣은 것이 먼저 나오지 않는다").is_equal("career_results")


func test_resolving_removes_only_that_one() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "career_results"})
	Pending.push(s, {"type": "fa_market"})
	assert_bool(Pending.resolve(s, "career_results")).is_true()
	assert_bool(Pending.has(s, "career_results")).is_false()
	assert_bool(Pending.has(s, "fa_market")).override_failure_message(
		"하나를 해소했더니 줄이 통째로 비었다").is_true()


func test_resolving_something_that_is_not_there_says_so() -> void:
	var s: Dictionary = _state()
	assert_bool(Pending.resolve(s, "fa_market")).override_failure_message(
		"없는 것을 해소했다고 한다").is_false()


## ⚠ **같은 종류가 여럿이면 하나씩 빠진다.** 한 번에 다 지우면 경기 대기가
## 통째로 사라진다
func test_resolving_takes_one_at_a_time() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "game", "game_id": "A"})
	Pending.push(s, {"type": "game", "game_id": "B"})
	Pending.resolve(s, "game")
	assert_int(Pending.all(s).size()).is_equal(1)
	assert_str(String(Pending.next(s)["game_id"])).override_failure_message(
		"먼저 넣은 것이 아니라 나중 것이 빠졌다").is_equal("B")


func test_the_first_of_a_type_is_findable() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "game", "game_id": "A"})
	Pending.push(s, {"type": "salary_negotiation", "team_id": "T1"})
	assert_str(String(Pending.first(s, "salary_negotiation")["team_id"])).is_equal("T1")
	assert_dict(Pending.first(s, "fa_market")).is_empty()


# ── 한 번만 넣기 ──────────────────────────────────────────────

## ⚠ **같은 결정을 두 번 쌓으면 같은 주가 무한 반복된다.** 02는 이 확인을
## 부르는 쪽마다 따로 적었고, 빠뜨린 자리에서 실제로 반복이 났다
func test_a_decision_is_not_asked_twice() -> void:
	var s: Dictionary = _state()
	assert_bool(Pending.push_once(s, {"type": "career_choice"})).is_true()
	assert_bool(Pending.push_once(s, {"type": "career_choice"})
		).override_failure_message("같은 결정이 두 번 쌓였다").is_false()
	assert_int(Pending.all(s).size()).is_equal(1)


## 경기 대기처럼 여럿이 정상인 것은 `push`로 넣는다 — 막으면 하루에 한
## 경기밖에 못 치른다
func test_the_plain_push_allows_many() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "game", "game_id": "A"})
	Pending.push(s, {"type": "game", "game_id": "B"})
	assert_int(Pending.all(s).size()).is_equal(2)


# ── 날을 멈춘다 ───────────────────────────────────────────────

## ⚠ **줄에 넣으면 그날이 멈춘다.** `DayEngine`이 다른 키를 읽고 있으면
## 넣어도 아무 일이 안 일어난다 — 물어보지 않은 결정이 조용히 남는다
func test_what_the_queue_holds_stops_the_day() -> void:
	var s: Dictionary = _state()
	s["protagonist"] = {"retired": false}
	s["season_days"] = 200
	assert_object(DayEngine.stop_reason(s)).override_failure_message(
		"줄이 비었는데 날이 멈췄다").is_null()

	Pending.push(s, {"type": "career_choice"})
	var r = DayEngine.stop_reason(s)
	assert_object(r).override_failure_message(
		"대기줄에 넣었는데 날이 안 멈춘다 — 넣는 키와 읽는 키가 다르다"
	).is_not_null()
	assert_str(String(r["type"])).is_equal("career_choice")


# ── 상태에 남는다 ─────────────────────────────────────────────

## ⚠ **줄이 상태에 있어야 세이브를 넘어 산다.** 02는 "한 해에 한 번" 가드를
## 스토어에만 두고 세이브에 안 넣어서, 앱을 껐다 켜면 없던 일이 됐다
## ⚠ **자리를 `pending`으로 못 박는다.** `World.new_game`과 픽스처가 그 이름을
## 글자 그대로 적어 두고, 옛 세이브도 거기 들어 있다 — 키를 옮기면 이미 쌓인
## 결정이 통째로 안 보인다
func test_the_queue_lives_in_the_state() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "fa_market"})
	assert_bool(s.has("pending")).override_failure_message(
		"대기줄이 state[\"pending\"]이 아닌 데 쌓인다 — 옛 세이브의 결정이 사라진다"
	).is_true()

	var reopened: Dictionary = s.duplicate(true)
	assert_bool(Pending.has(reopened, "fa_market")).is_true()


func test_clearing_empties_the_queue() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "fa_market"})
	Pending.push(s, {"type": "game"})
	Pending.clear(s)
	assert_array(Pending.all(s)).is_empty()
