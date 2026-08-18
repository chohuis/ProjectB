extends GdUnitTestSuite

## 진로 결과 화면이 **무엇을 보여주나** — 🔴 지명 결과가 통째로 빠져 있었다.
##
## 02 `CareerResultsModal`(242줄)은 **네 칸**을 낸다:
##  · **드래프트** — 팀 / N라운드 M순위 + 계약금, 또는 "미지명"
##  · **대학 지원** — 합격한 대학 **이름들**, 또는 "전원 불합격"
##  · **독립리그 지원** — 같은 형태
##  · **체육부대** — 통과 여부
##
## 04 `_results`는 세 줄이었다:
##  · `"대학 합격 N곳"` — **어디에 붙었는지 안 알려준다**
##  · `"독립리그 합격 N곳"`
##  · `"드래프트 신청이 받아들여졌습니다."` — **그건 지명 결과가 아니라
##    신청 수리다.** 몇 라운드에 어느 팀이 뽑았는지가 없다
##
## ⚠ **바로 다음 화면(`career_choice`)에서 골라야 한다.** 어디 붙었는지
## 모르면 고를 수가 없다.


func _state(res: Dictionary) -> Dictionary:
	var s: Dictionary = {
		"day": 330, "season_year": 2029,
		"protagonist": {"id": "ME", "name": "김한결",
			"career_stage": "highschool", "grade": 3,
			"team_id": "TEAM_HS_AEWOL", "league_id": "LEAGUE_HIGHSCHOOL",
			"pitching": {"ovr": 70.0}, "career_records": [], "injury": null},
		"school": {"gpa": 3.5},
		"pending": [{"type": "career_results"}], "mailbox": [],
		"career": {"results": res},
	}
	return s


func _body(res: Dictionary) -> String:
	return String(DecisionVm.build(_state(res)).get("body", ""))


# ── 드래프트 칸 ───────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 04는 "신청이 받아들여졌습니다"만 냈다
func test_지명되면_팀과_순번이_나온다() -> void:
	var body: String = _body({
		"drafted": true, "draft_team_id": "TEAM_KBL_SEOUL_ROYALS_1",
		"draft_round": 2, "draft_pick": 21,
		"university_passed": [], "independent_passed": []})
	assert_int(body.find("2라운드")).override_failure_message(
		"라운드가 없다: %s" % body).is_greater(-1)
	assert_int(body.find("21")).override_failure_message(
		"픽 순번이 없다: %s" % body).is_greater(-1)


## 미지명도 분명히 말한다 — 02는 `미지명`을 빨갛게 낸다
func test_미지명을_말한다() -> void:
	var body: String = _body({"drafted": false,
		"university_passed": [], "independent_passed": []})
	assert_int(body.find("미지명")).override_failure_message(
		"미지명이라는 말이 없다: %s" % body).is_greater(-1)


## ⚠ **신청 안 한 것과 지명 실패는 다르다.** 안 냈으면 그렇게 말한다
func test_신청_안_했으면_그렇게_말한다() -> void:
	var body: String = _body({"drafted": false, "draft_applied": false,
		"university_passed": [], "independent_passed": []})
	assert_int(body.find("드래프트")).is_greater(-1)


# ── 대학·독립 칸 ──────────────────────────────────────────────────

## 🔴 **개수가 아니라 이름이다.** 바로 다음 화면에서 골라야 한다
func test_합격한_대학_이름이_나온다() -> void:
	var body: String = _body({"drafted": false,
		"university_passed": ["TEAM_UNIV_ASAN", "TEAM_UNIV_BAEKJE"],
		"independent_passed": []})
	assert_int(body.find("아산대")).override_failure_message(
		"합격한 대학 이름이 없다 — 개수만으론 고를 수 없다: %s" % body) \
		.is_greater(-1)
	assert_int(body.find("백제대")).is_greater(-1)


func test_전원_불합격을_말한다() -> void:
	var body: String = _body({"drafted": false,
		"university_passed": [], "independent_passed": []})
	assert_int(body.find("불합격")).is_greater(-1)


func test_합격한_독립팀_이름이_나온다() -> void:
	var body: String = _body({"drafted": false, "university_passed": [],
		"independent_passed": ["TEAM_IND_SEOUL_COMETS"]})
	assert_bool(body.contains("코메츠") or body.contains("서울")) \
		.override_failure_message("합격한 독립팀 이름이 없다: %s" % body).is_true()


## 화면 문구에 마크다운을 쓰지 않는다
func test_마크다운을_안_쓴다() -> void:
	assert_int(_body({"drafted": true, "draft_team_id": "TEAM_KBL_SEOUL_ROYALS_1",
		"draft_round": 1, "draft_pick": 3,
		"university_passed": ["TEAM_UNIV_ASAN"],
		"independent_passed": []}).find("**")).is_equal(-1)


# ── 변이가 살아남은 자리 ──────────────────────────────────────────

## ⚠ **지명 팀 이름을 봐야 한다.** 라운드·순번만 보면 팀을 지워도 안 잡힌다
func test_지명_팀_이름이_나온다() -> void:
	var body: String = _body({
		"drafted": true, "draft_team_id": "TEAM_KBL_SEOUL_ROYALS_1",
		"draft_round": 2, "draft_pick": 21,
		"university_passed": [], "independent_passed": []})
	assert_bool(body.contains("서울") or body.contains("로열스")) \
		.override_failure_message(
			"어느 팀이 뽑았는지가 없다 — 라운드만으론 모른다: %s" % body).is_true()


## ⚠ **대학과 독립 두 칸 다 "전원 불합격"을 말해야 한다.**
## 한 곳만 보면 다른 쪽을 지워도 안 잡힌다
func test_두_칸_다_전원_불합격을_말한다() -> void:
	var body: String = _body({"drafted": false,
		"university_passed": [], "independent_passed": []})
	assert_int(body.count("전원 불합격")).override_failure_message(
		"'전원 불합격'이 %d번 — 대학·독립 두 칸이어야 한다: %s"
		% [body.count("전원 불합격"), body]).is_equal(2)


## 붙은 쪽은 "전원 불합격"이 안 나와야 한다 — 늘 찍으면 뜻이 없다
func test_붙으면_불합격이라고_안_한다() -> void:
	var body: String = _body({"drafted": false,
		"university_passed": ["TEAM_UNIV_ASAN"],
		"independent_passed": ["TEAM_IND_SEOUL_COMETS"]})
	assert_int(body.count("전원 불합격")).override_failure_message(
		"양쪽 다 붙었는데 불합격이라고 한다: %s" % body).is_equal(0)
