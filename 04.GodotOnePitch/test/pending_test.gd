extends GdUnitTestSuite

## 결정 대기줄 — 세계가 멈추고 사용자에게 묻는 자리. B-6b.
##
## ⚠ **02는 이 줄을 자동 진행이 조용히 비웠다.** "결과가 상태에 남지 않는
## 알림성"이라는 분류에 계약·트레이드가 들어 있어서, 자동으로 지나가면
## **지명 통보만 사라지고 고교에 남고**, **트레이드 통보만 사라지고 팀은
## 그대로**였다. 실측 25시즌에서 2031년에 만료된 계약이 2038년까지 남았다.


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


# ── 멈추는 결정 ───────────────────────────────────────────────

## ⚠ **커리어가 갈리는 지점은 자동 진행이 대신 결정하면 안 된다.**
## 02는 지명 통보가 이 목록에 없어서 `default:`가 그냥 해소했고,
## **지명을 받고도 계약이 안 된 채 고교에 남았다**
func test_the_career_forks_stop_the_world() -> void:
	for t in ["career_choice_hub", "career_results", "career_choice",
			"draft_observe", "draft_notification", "retirement_ask"]:
		assert_bool(Pending.is_stopping(t)).override_failure_message(
			"%s 가 자동 진행을 안 멈춘다" % t).is_true()


## ⚠ **계약 셋도 같은 계열이다.** 예전엔 "dev 도구"라며 그냥 버렸다 —
## 자동 진행으로 지나가면 재계약 제안이 사라지고 계약이 만료된 채 남는다
func test_the_contract_decisions_stop_the_world() -> void:
	for t in ["salary_negotiation", "option_clause", "fa_market"]:
		assert_bool(Pending.is_stopping(t)).override_failure_message(
			"%s 가 자동 진행을 안 멈춘다 — 계약이 조용히 버려진다" % t).is_true()


## ⚠ **트레이드는 소속이 바뀐다.** 02는 "결과가 상태에 남지 않는 알림성"으로
## 분류해 그냥 해소했고, 통보만 사라지고 팀은 그대로였다
func test_a_trade_stops_the_world() -> void:
	assert_bool(Pending.is_stopping("trade")).override_failure_message(
		"트레이드 통보가 조용히 버려진다 — 팀이 그대로 남는다").is_true()


func test_a_routine_notice_does_not_stop_the_world() -> void:
	for t in ["game", "message", "injury_treatment", "military_enlist_ask"]:
		assert_bool(Pending.is_stopping(t)).override_failure_message(
			"%s 때문에 자동 진행이 멈춘다" % t).is_false()


func test_the_blocking_one_is_found_behind_routine_notices() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "game", "game_id": "A"})
	Pending.push(s, {"type": "message", "message_id": "M"})
	Pending.push(s, {"type": "draft_notification", "team_id": "T"})
	assert_str(String(Pending.blocking(s)["type"])).override_failure_message(
		"알림 뒤에 숨은 결정을 못 찾는다").is_equal("draft_notification")


func test_nothing_blocks_when_there_is_only_routine() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "game", "game_id": "A"})
	assert_dict(Pending.blocking(s)).is_empty()


## 사람이 읽을 이름 — 자동 진행이 "왜 멈췄는지"를 적는다
func test_a_stopping_decision_has_a_name() -> void:
	assert_str(Pending.label_of("draft_notification")).is_not_empty()
	assert_str(Pending.label_of("salary_negotiation")).is_not_empty()
	assert_str(Pending.label_of("draft_notification")).override_failure_message(
		"두 결정의 이름이 같다 — 어느 것 때문에 멈췄는지 못 가린다"
	).is_not_equal(Pending.label_of("salary_negotiation"))


## 이름이 없는 종류도 무언가는 돌려준다 — 빈 문자열이면 "정지: " 만 뜬다
func test_an_unnamed_decision_still_says_something() -> void:
	assert_str(Pending.label_of("something_new")).is_not_empty()


# ── 상태에 남는다 ─────────────────────────────────────────────

## ⚠ **줄이 상태에 있어야 세이브를 넘어 산다.** 02는 "한 해에 한 번" 가드를
## 스토어에만 두고 세이브에 안 넣어서, 앱을 껐다 켜면 없던 일이 됐다
func test_the_queue_lives_in_the_state() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "fa_market"})
	assert_bool(s.has(Pending.KEY)).override_failure_message(
		"대기줄이 상태 밖에 있다 — 세이브를 넘어 못 산다").is_true()

	var reopened: Dictionary = s.duplicate(true)
	assert_bool(Pending.has(reopened, "fa_market")).is_true()


func test_clearing_empties_the_queue() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "fa_market"})
	Pending.push(s, {"type": "game"})
	Pending.clear(s)
	assert_array(Pending.all(s)).is_empty()
