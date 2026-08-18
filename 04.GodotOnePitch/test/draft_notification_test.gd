extends GdUnitTestSuite

## 지명 통보가 **정할 근거**를 주나 — 02 `DraftNotificationModal`(112줄) 대조.
##
## 02는 이걸 낸다:
##  · 팀 · N라운드 M순위
##  · **연봉 · 계약 기간 · 계약금 · 총 계약액**
##  · *"구단 제시 조건으로 계약이 진행됩니다. 협상은 불가합니다."*
##  · 🔴 **거부 시 어디로 가는지** — 대학 / 독립리그 / **대안 없음(현역 입대)**
##
## 04는 팀·순위·계약금·연봉 **넷만** 냈다. **거부하면 어디로 가는지 모르고
## 누른다** — 되돌릴 수 없는 선택인데.
##
## ⚠ **대안은 액션에 이미 실려 있었다**(`alt_university_team_id` ·
## `alt_independent_team_id`) — 엔진(`reject_draft_offer`)이 그걸로 갈린다.
## **화면만 안 읽었다.**


func _action(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"type": "draft_notification",
		"team_id": "TEAM_KBL_BUSAN_WAVES_1", "league_id": "LEAGUE_KBL",
		"round": 2, "pick": 21, "salary": 6000, "duration_years": 3,
		"signing_bonus": 15000,
		"alt_university_team_id": "", "alt_independent_team_id": ""}
	d.merge(o, true)
	return d


func _state(o: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 330, "season_year": 2029, "seed": 4,
		"protagonist": {"id": "ME", "name": "김한결",
			"career_stage": "highschool", "grade": 3,
			"team_id": "TEAM_HS_AEWOL", "league_id": "LEAGUE_HIGHSCHOOL",
			"pitching": {"ovr": 70.0}, "injury": null, "retired": false},
		"pending": [], "mailbox": [], "world": {"rosters": {}},
	}
	Pending.push_once(s, _action(o))
	return s


func _body(o: Dictionary = {}) -> String:
	return String(DecisionVm.build(_state(o)).get("body", ""))


# ── 계약 조건 ─────────────────────────────────────────────────────

## 02는 계약 기간을 낸다 — 04는 빠져 있었다
func test_계약_기간이_나온다() -> void:
	assert_int(_body().find("3년")).override_failure_message(
		"계약 기간이 없다: %s" % _body()).is_greater(-1)


## 🔴 **총 계약액을 낸다.** 02가 따로 계산해 보여준다 —
## 연봉 6000 × 3년 + 계약금 15000 = 33000
func test_총_계약액이_나온다() -> void:
	var want: String = FinanceVm.won(6000 * 3 + 15000)
	assert_int(_body().find(want)).override_failure_message(
		"총 계약액(%s)이 없다 — 연봉만 보면 크기를 못 가늠한다: %s"
		% [want, _body()]).is_greater(-1)


## 협상이 안 된다는 걸 말한다 — 02도 그 문장을 둔다
func test_협상_불가를_말한다() -> void:
	assert_int(_body().find("협상")).override_failure_message(
		"협상이 안 된다는 말이 없다 — 역제안을 기대하게 된다: %s" % _body()) \
		.is_greater(-1)


# ── 거부 시 어디로 ────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 되돌릴 수 없는 선택인데 어디로 가는지 몰랐다
func test_거부하면_대학으로_간다고_말한다() -> void:
	var body: String = _body({"alt_university_team_id": "TEAM_UNIV_ASAN"})
	assert_int(body.find("아산대")).override_failure_message(
		"거부 시 갈 대학 이름이 없다: %s" % body).is_greater(-1)


func test_거부하면_독립으로_간다고_말한다() -> void:
	var body: String = _body({"alt_independent_team_id": "TEAM_IND_SEOUL_COMETS"})
	assert_bool(body.contains("코메츠") or body.contains("서울")) \
		.override_failure_message("거부 시 갈 독립팀 이름이 없다: %s" % body) \
		.is_true()


## ⚠ **대안이 없으면 그렇게 말한다.** 02는 *"대안 없음 — 현역 입대로
## 처리됩니다"*를 경고로 낸다. 04는 **입대를 묻지만**(P-병역) 그래도
## "여기서 거부하면 학교도 팀도 없다"는 걸 알려야 한다
func test_대안이_없으면_그렇게_말한다() -> void:
	var body: String = _body()
	assert_int(body.find("대안")).override_failure_message(
		"갈 곳이 없다는 말이 없다 — 모르고 거부한다: %s" % body).is_greater(-1)


## 대학이 있으면 독립보다 대학을 말한다 — 엔진이 그 순서로 갈린다
## (`reject_draft_offer`: 대학 → 독립 → 병역)
func test_대학이_독립보다_먼저다() -> void:
	var body: String = _body({"alt_university_team_id": "TEAM_UNIV_ASAN",
		"alt_independent_team_id": "TEAM_IND_SEOUL_COMETS"})
	assert_int(body.find("아산대")).override_failure_message(
		"대학이 있는데 대학을 안 말한다: %s" % body).is_greater(-1)


## ⚠ **대학생에게 대학 대안을 말하지 않는다** — 두 번 입학이라
## 엔진이 그 갈래를 안 탄다(`can_apply_university`)
func test_대학생에게는_대학을_안_말한다() -> void:
	var s: Dictionary = _state({"alt_university_team_id": "TEAM_UNIV_ASAN"})
	s["protagonist"]["career_stage"] = "university"
	var body: String = String(DecisionVm.build(s).get("body", ""))
	assert_int(body.find("아산대")).override_failure_message(
		"대학생에게 대학 대안을 말했다 — 엔진은 그 갈래를 안 탄다: %s" % body) \
		.is_equal(-1)


## 화면 문구에 마크다운을 쓰지 않는다
func test_마크다운을_안_쓴다() -> void:
	assert_int(_body({"alt_university_team_id": "TEAM_UNIV_ASAN"}).find("**")) \
		.is_equal(-1)
