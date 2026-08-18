extends GdUnitTestSuite

## 옵션 조항이 **실제로 걸리나** — 🔴 아무 데도 안 남아 있었다.
##
## 협상 화면에서 구단 옵션·선수 옵션을 고를 수 있고(`negotiation.gd`가
## 연봉 배수까지 곱한다) 계약 사전에도 `team_option_years`·
## `player_option_years`가 실린다. 그런데 **`_apply_contract`가 그 둘을
## 선수에게 안 옮겼다** — 계약이 끝날 때 볼 근거가 사라진다.
##
## 그래서 `option_clause` 결정이 **도달 불가**였다(받는 쪽·해소하는 쪽만 있고
## 올리는 쪽이 없다).
##
## **02는 계약 마지막 해에 묻는다** — `advanceWeek.ts:1057-1070`:
## `remainingYears === 1`이고 `teamOptionYears > 0`이면 **구단이 행사할지**를
## 시즌 평점으로 정해 통보하고, `playerOptionYears > 0`이면 **선수가 고른다.**


func _me(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"id": "ME", "name": "김한결", "is_protagonist": true,
		"career_stage": "pro_kbl", "league_id": "LEAGUE_KBL",
		"team_id": "TEAM_KBL_BUSAN_WAVES_1", "salary": 12000,
		"contract_years": 1, "pro_service_years": 5, "age": 27,
		"pitching": {"ovr": 70.0}, "injury": null, "retired": false}
	d.merge(o, true)
	return d


func _state(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"day": Calendar.DAYS_PER_SEASON, "season_year": 2033,
		"season_days": Calendar.DAYS_PER_SEASON,
		"protagonist": _me(o), "pending": [], "mailbox": [],
		"world": {"rosters": {}},
	}
	return d


# ── 계약에 남나 ───────────────────────────────────────────────────

## 🔴 **여기가 뿌리다.** 안 남으면 계약 끝에 볼 근거가 없다
func test_계약이_옵션을_기억한다() -> void:
	var s: Dictionary = _state({"contract_years": 3})
	# ⚠ **`renewal`은 다음 시즌에 발효한다** — `NEXT_KEY`에 쌓였다가
	# `SeasonRunner.roll_over`가 `apply_pending_next_contract`로 옮긴다.
	# 그걸 모르고 바로 읽으려다 헛짚었다
	ContractDecision.sign_negotiated(s, {"context": "renewal",
		"team_id": "TEAM_KBL_BUSAN_WAVES_1", "league_id": "LEAGUE_KBL"}, {
		"salary": 15000, "duration_years": 3, "signing_bonus": 0,
		"team_id": "TEAM_KBL_BUSAN_WAVES_1", "league_id": "LEAGUE_KBL",
		"no_trade": false, "team_option_years": 1, "player_option_years": 0},
		300)
	ContractDecision.apply_pending_next_contract(s)
	assert_int(int(s["protagonist"].get("team_option_years", 0))) \
		.override_failure_message(
			"구단 옵션이 계약에 안 남았다 — 계약 끝에 볼 근거가 사라진다") \
		.is_equal(1)


## 노트레이드도 같이 남아야 한다 — 협상 화면의 그 토글이 장식이 되면 안 된다
func test_계약이_노트레이드를_기억한다() -> void:
	var s: Dictionary = _state({"contract_years": 3})
	# ⚠ **`renewal`은 다음 시즌에 발효한다** — `NEXT_KEY`에 쌓였다가
	# `SeasonRunner.roll_over`가 `apply_pending_next_contract`로 옮긴다.
	# 그걸 모르고 바로 읽으려다 헛짚었다
	ContractDecision.sign_negotiated(s, {"context": "renewal",
		"team_id": "TEAM_KBL_BUSAN_WAVES_1", "league_id": "LEAGUE_KBL"}, {
		"salary": 15000, "duration_years": 3, "signing_bonus": 0,
		"team_id": "TEAM_KBL_BUSAN_WAVES_1", "league_id": "LEAGUE_KBL",
		"no_trade": true, "team_option_years": 0, "player_option_years": 0},
		300)
	ContractDecision.apply_pending_next_contract(s)
	assert_bool(bool(s["protagonist"].get("no_trade", false))) \
		.override_failure_message(
			"노트레이드가 계약에 안 남았다 — 트레이드 때 못 막는다").is_true()


# ── 계약 마지막 해에 묻나 ─────────────────────────────────────────

## 🔴 **02는 `remainingYears === 1`에 묻는다.** 04엔 그 자리가 없었다
func test_마지막_해에_구단_옵션을_통보한다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(Pending.has(s, "option_clause")).override_failure_message(
		"계약 마지막 해에 구단 옵션이 있는데 안 물었다").is_true()


func test_선수_옵션도_묻는다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "player_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(Pending.has(s, "option_clause")).override_failure_message(
		"선수 옵션이 있는데 안 물었다").is_true()


## 옵션이 없으면 안 묻는다 — 매년 뜨면 소음이다
func test_옵션이_없으면_안_묻는다() -> void:
	var s: Dictionary = _state({"contract_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(Pending.has(s, "option_clause")).is_false()


## 계약이 남았으면 안 묻는다
func test_계약이_남았으면_안_묻는다() -> void:
	var s: Dictionary = _state({"contract_years": 3, "team_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(Pending.has(s, "option_clause")).is_false()


## ⚠ **두 번 묻지 않는다.** 같은 해에 또 뜨면 답해도 안 사라진다
func test_한_해에_한_번만_묻는다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	ContractDecision.check_option_clause(s, int(s["day"]))
	var n: int = 0
	for a in s.get("pending", []):
		if String(a.get("type", "")) == "option_clause":
			n += 1
	assert_int(n).override_failure_message("옵션 조항이 %d번 떴다" % n).is_equal(1)


## ⚠ **구단 옵션은 구단이 정한다.** 02는 시즌 평점으로 가른다 —
## 사용자가 고르는 건 **선수 옵션**뿐이다. 화면이 그걸 구분해야 한다
func test_구단_옵션은_행사_여부가_이미_정해져_있다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	var a: Dictionary = DecisionVm.blocking(s)
	assert_str(String(a.get("option_type", ""))).is_equal("team")
	assert_bool(a.has("exercised")).override_failure_message(
		"구단이 행사할지가 안 실렸다 — 사용자가 대신 정하게 된다").is_true()


# ── 배선 ──────────────────────────────────────────────────────────

## ⚠ **부르는 곳이 없으면 또 도달 불가다**
func test_시즌_끝이_부른다() -> void:
	var src := CodeText.of("res://sim/season_runner.gd") \
		+ CodeText.of("res://sim/career_runner.gd")
	assert_int(src.find("check_option_clause")).override_failure_message(
		"옵션 조항을 아무도 안 본다 — 또 죽은 배선이다").is_greater(-1)


## 🔴 **구단 옵션은 통보다 — 선택지를 두면 거짓말이 된다.**
## 무엇을 눌러도 같은 일이 일어난다
func test_구단_옵션은_확인만_한다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	var d: Dictionary = DecisionVm.build(s)
	assert_int(int(d.get("choices", []).size())).override_failure_message(
		"구단 옵션인데 고르게 한다 — 그건 구단이 정한다").is_equal(1)
	assert_str(String(d.get("title", ""))).is_equal("구단 옵션")


## 선수 옵션은 **고른다** — 둘이어야 한다
func test_선수_옵션은_고른다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "player_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	var d: Dictionary = DecisionVm.build(s)
	assert_int(int(d.get("choices", []).size())).override_failure_message(
		"선수 옵션인데 고를 수가 없다").is_equal(2)
	assert_str(String(d.get("title", ""))).is_equal("선수 옵션")


## 화면 문구에 마크다운을 쓰지 않는다
func test_마크다운을_안_쓴다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "player_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_int(String(DecisionVm.build(s).get("body", "")).find("**")).is_equal(-1)


## ⚠ **연도 가드가 진짜로 막는지 본다.** `Pending.push_once`가 중복을
## 막아 주므로 **답해서 대기줄이 빈 뒤**에 또 부르면 갈린다 —
## 그 경우를 안 보면 변이가 살아남는다(실제로 살아남았다)
func test_답한_뒤에도_그해엔_다시_안_묻는다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	Pending.resolve(s, "option_clause")
	assert_bool(Pending.has(s, "option_clause")).is_false()

	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(Pending.has(s, "option_clause")).override_failure_message(
		"답했는데 같은 해에 또 물었다 — 연도 가드가 안 막는다").is_false()


## 해가 바뀌면 다시 묻는다 — 가드가 영영 막으면 그것대로 결함이다
func test_해가_바뀌면_다시_묻는다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	Pending.resolve(s, "option_clause")
	s["season_year"] = 2034
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(Pending.has(s, "option_clause")).override_failure_message(
		"해가 바뀌었는데 안 묻는다").is_true()


## 🔴 **구단은 잘하는 선수만 잡는다.** 늘 행사하면 문턱이 장식이 된다 —
## 02는 시즌 평점이 문턱을 넘는지로 가른다
func test_못하면_구단이_옵션을_안_쓴다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1,
		"pitching": {"ovr": 40.0}})
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(bool(DecisionVm.blocking(s).get("exercised", true))) \
		.override_failure_message(
			"OVR 40인데 구단이 옵션을 행사했다 — 문턱이 장식이다").is_false()


## 잘하면 잡는다
func test_잘하면_구단이_옵션을_쓴다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1,
		"pitching": {"ovr": 85.0}})
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(bool(DecisionVm.blocking(s).get("exercised", false))) \
		.override_failure_message("OVR 85인데 구단이 안 잡는다").is_true()
