extends GdUnitTestSuite

## 무대를 옮기면 진로가 다시 열린다 — P-42.
##
## 🔴 **대학 4학년을 마쳐도 프로로 안 갔다.** 계측 20해에서 주인공이
## **2032년부터 15해를 대학 4학년에 멈춰** 있었다. 대기줄은 비어 있었다 —
## 아무도 다음 진로를 안 연 것이다.
##
## 원인은 `state["career"]`가 **한 번 만들어지면 안 지워지는** 것이었다.
## 고교에서 채운 `results`가 그대로 남아 `CareerRunner._should_open`의
## `if not c.results.is_empty(): return false`에 매년 걸렸다.
##
## ⚠ **02가 같은 증상을 겪고 적어 뒀다**(`game.ts:1768`):
##
## > 실측: 2032 진학 → 2038까지 7년째 대학생(29세), 매년 W42 진로 허브만 반복.
##
## 02는 무대를 옮길 때 진로 상태를 **통째로 비운다** — `careerApplications`,
## `careerResults`, `careerApplicationsSubmitted`, `careerFinalChoice` 넷.
## 04도 같은 자리(`CareerDecision._move_to`)에서 비운다.

const HS: String = "TEAM_HS_AEWOL"
const UNIV: String = "TEAM_UNIV_BAEKJE"


func _state() -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": HS})
	var p: Dictionary = s["protagonist"]
	p["career_stage"] = "highschool"
	p["grade"] = CareerRunner.HS_FINAL_GRADE
	return s


## 고교에서 진로를 한 번 치른 상태를 만든다
func _decided(s: Dictionary) -> void:
	var c: Dictionary = CareerDecision.of(s)
	c["submitted"] = true
	c["applications"] = {"draft_applied": true,
		"university_choices": [UNIV]}
	c["results"] = {"draft": {}, "university": {"team_id": UNIV}}
	c["final_choice"] = "university"


# ── 상태가 비워지나 ──────────────────────────────────────────────

## 🔴 **무대를 옮기면 진로 기록이 남지 않는다.** 하나라도 남으면
## `_should_open`이 그걸 보고 다음 진로를 영영 안 연다
func test_무대를_옮기면_진로_기록이_비워진다() -> void:
	var s: Dictionary = _state()
	_decided(s)
	CareerDecision.choose_school_or_independent(s, "university", UNIV)

	var c: Dictionary = CareerDecision.of(s)
	assert_bool(bool(c.get("submitted", false))).override_failure_message(
		"제출 표시가 남았다").is_false()
	assert_bool((c.get("results", {}) as Dictionary).is_empty()) \
		.override_failure_message(
			"결과가 남았다 — _should_open이 매년 여기서 막힌다").is_true()
	assert_bool((c.get("applications", {}) as Dictionary).is_empty()) \
		.override_failure_message("지원 기록이 남았다").is_true()


## ⚠ **`final_choice`는 옮긴 뒤에 다시 적는다** — 비우기만 하면 화면이
## "무엇을 골랐나"를 못 읽는다. 순서가 뜻이다
func test_고른_것은_남는다() -> void:
	var s: Dictionary = _state()
	_decided(s)
	CareerDecision.choose_school_or_independent(s, "university", UNIV)
	assert_str(String(CareerDecision.of(s).get("final_choice", ""))) \
		.is_equal("university")


## 지명을 받아 프로로 갈 때도 같다 — 무대가 바뀌는 건 마찬가지다
func test_프로로_가도_비워진다() -> void:
	var s: Dictionary = _state()
	_decided(s)
	var p: Dictionary = s["protagonist"]
	CareerDecision._move_to(s, p, "professional", "LEAGUE_KBL",
		"TEAM_KBL_BUSAN_WAVES_1")
	var c: Dictionary = CareerDecision.of(s)
	assert_bool((c.get("results", {}) as Dictionary).is_empty()).is_true()
	assert_bool(bool(c.get("submitted", false))).is_false()


# ── 그래서 다시 열리나 (형태 ① — 비워도 안 열면 소용없다) ────────

## 🔴 **대학 4학년 W42에 진로가 열린다.** 이게 P-42의 본체다
func test_대학_사학년에_진로가_다시_열린다() -> void:
	var s: Dictionary = _state()
	_decided(s)
	CareerDecision.choose_school_or_independent(s, "university", UNIV)

	var p: Dictionary = s["protagonist"]
	p["grade"] = 4
	assert_bool(CareerRunner._should_open(s, p,
		int(CareerRunner.HUB_WEEK["university"]))) \
		.override_failure_message(
			"대학 4학년 W42인데 진로가 안 열린다 — 20해 중 15해를 여기서 보냈다") \
		.is_true()


## ⚠ **대학 1~3학년에는 매년 열린다** — 02도 학년을 안 본다(중퇴·조기
## 지명 경로가 있다). **고교만 졸업반 조건이 있다**
func test_대학은_학년을_안_본다() -> void:
	var s: Dictionary = _state()
	_decided(s)
	CareerDecision.choose_school_or_independent(s, "university", UNIV)
	var p: Dictionary = s["protagonist"]
	for g in [1, 2, 3, 4]:
		p["grade"] = g
		assert_bool(CareerRunner._should_open(s, p,
			int(CareerRunner.HUB_WEEK["university"]))) \
			.override_failure_message("대학 %d학년에 안 열린다" % g).is_true()


## 고교 1·2학년은 여전히 안 열린다 — 졸업반만이다
func test_고교_저학년은_안_열린다() -> void:
	var s: Dictionary = _state()
	var p: Dictionary = s["protagonist"]
	for g in [1, 2]:
		p["grade"] = g
		assert_bool(CareerRunner._should_open(s, p,
			int(CareerRunner.HUB_WEEK["highschool"]))) \
			.override_failure_message("고교 %d학년에 진로가 열린다" % g).is_false()


## ⚠ **같은 해에 두 번 열지 않는다.** 진로를 정한 그 주에 다시 물으면
## 같은 자리를 무한히 돈다 — 02가 실측으로 두 번 겪은 함정이다
func test_정한_해에는_다시_안_열린다() -> void:
	var s: Dictionary = _state()
	var p: Dictionary = s["protagonist"]
	var c: Dictionary = CareerDecision.of(s)
	c["submitted"] = true
	assert_bool(CareerRunner._should_open(s, p,
		int(CareerRunner.HUB_WEEK["highschool"]))).is_false()


## ⚠ **결과가 나온 뒤에도 안 연다** — 결과 확인이 남아 있는데 새 원서를
## 열면 대기줄이 겹친다.
##
## 🔴 **이 갈래를 아무 검사도 안 봤다.** "결과가 있어도 연다" 변이가 안
## 잡혀서 알았다 — 위 검사는 `submitted`만 봤다
func test_결과가_나온_해에도_안_열린다() -> void:
	var s: Dictionary = _state()
	var p: Dictionary = s["protagonist"]
	var c: Dictionary = CareerDecision.of(s)
	# 제출 표시는 풀렸는데 결과가 남은 자리 — 결과 확인 대기 중이다
	c["submitted"] = false
	c["results"] = {"university": {"team_id": UNIV}}
	assert_bool(CareerRunner._should_open(s, p,
		int(CareerRunner.HUB_WEEK["highschool"]))) 		.override_failure_message(
			"결과가 남아 있는데 진로를 또 연다 — 대기줄이 겹친다").is_false()


## ⚠ **대기줄이 떠 있으면 안 연다** — 두 번 겹치면 답이 엉킨다
func test_대기줄이_있으면_안_연다() -> void:
	var s: Dictionary = _state()
	_decided(s)
	CareerDecision.choose_school_or_independent(s, "university", UNIV)
	var p: Dictionary = s["protagonist"]
	p["grade"] = 4
	Pending.push_once(s, {"type": "career_choice_hub"})
	assert_bool(CareerRunner._should_open(s, p,
		int(CareerRunner.HUB_WEEK["university"]))).is_false()
