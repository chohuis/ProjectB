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


## 🔴 **구단은 그 해 성적으로 정한다 — OVR이 아니다.**
##
## 처음엔 OVR로 뒀는데 `Contract.season_rating`이 04의 정본이었다
## (02 `calcSeasonRating` 대응). OVR로 재면 **한 해 부진해도 옵션이
## 그대로 행사된다.**
func _with_stats(era: float, whip: float, ip: float) -> Dictionary:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1})
	s["season_stats"] = {"ME": {"type": "pitcher", "ip": ip, "era": era,
		"whip": whip, "k": ip * 1.0}}
	return s


func test_못하면_구단이_옵션을_안_쓴다() -> void:
	var s: Dictionary = _with_stats(6.50, 1.70, 120.0)
	assert_float(Contract.season_rating(s["season_stats"]["ME"])) \
		.override_failure_message("픽스처가 나쁜 성적이 아니다").is_less(60.0)
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(bool(DecisionVm.blocking(s).get("exercised", true))) \
		.override_failure_message(
			"방어율 6.50인데 구단이 옵션을 행사했다 — 문턱이 장식이다").is_false()


func test_잘하면_구단이_옵션을_쓴다() -> void:
	var s: Dictionary = _with_stats(1.20, 0.85, 180.0)
	assert_float(Contract.season_rating(s["season_stats"]["ME"])) \
		.override_failure_message("픽스처가 좋은 성적이 아니다").is_greater(80.0)
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(bool(DecisionVm.blocking(s).get("exercised", false))) \
		.override_failure_message("방어율 1.20인데 구단이 안 잡는다").is_true()


## ⚠ **기록이 없으면 50이다** — 문턱 아래라 안 행사된다.
## 한 해도 안 뛴 사람을 붙잡을 이유가 없다
func test_기록이_없으면_안_쓴다() -> void:
	var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1})
	ContractDecision.check_option_clause(s, int(s["day"]))
	assert_bool(bool(DecisionVm.blocking(s).get("exercised", true))).is_false()


## 🔴 **문턱은 팀 성향이 정한다** — 02 `75 - winNowPressure/100*25`.
## 성적 압박이 큰 팀은 낮은 기준에도 행사한다
func test_성적_압박이_문턱을_낮춘다() -> void:
	var calm: Dictionary = {"team_profiles": {"TEAM_X": {
		"win_now_pressure": 0.0}}}
	var hot: Dictionary = {"team_profiles": {"TEAM_X": {
		"win_now_pressure": 100.0}}}
	assert_float(ContractDecision.option_threshold(hot, "TEAM_X")) \
		.override_failure_message(
			"성적 압박이 큰 팀의 문턱이 더 낮아야 한다") \
		.is_less(ContractDecision.option_threshold(calm, "TEAM_X"))


## 02 값 그대로 — 압박 0이면 75, 100이면 50
func test_문턱이_02_값이다() -> void:
	assert_float(ContractDecision.option_threshold(
		{"team_profiles": {"T": {"win_now_pressure": 0.0}}}, "T")) \
		.is_equal_approx(75.0, 0.01)
	assert_float(ContractDecision.option_threshold(
		{"team_profiles": {"T": {"win_now_pressure": 100.0}}}, "T")) \
		.is_equal_approx(50.0, 0.01)


## 🔴 **문턱이 실제 판정에 닿아야 한다.**
##
## `option_threshold`만 따로 재면 그 값을 안 쓰고 상수로 굳혀도 안 잡힌다
## (변이가 살아남았다). **같은 성적인데 팀만 다를 때 갈리는지**를 본다.
##
## 평점 65 언저리 — 압박 0인 팀(문턱 75)은 안 잡고, 압박 100인 팀(문턱 50)은
## 잡는다
func test_팀에_따라_같은_성적이_갈린다() -> void:
	# ⚠ **값을 지어내지 않았다** — `tools/_tmp_*.gd`로 찍어 보고 골랐다.
	# ERA 3.60은 80.4라 둘 다 잡고, 4.60이 68.7로 사이다
	var stats: Dictionary = {"type": "pitcher", "ip": 150.0, "era": 4.60,
		"whip": 1.42, "k": 130.0}
	var rating: float = Contract.season_rating(stats)
	assert_float(rating).override_failure_message(
		"픽스처 평점 %.1f — 50과 75 사이여야 갈린다" % rating).is_between(50.0, 75.0)

	var out: Array = []
	for pressure in [0.0, 100.0]:
		var s: Dictionary = _state({"contract_years": 1, "team_option_years": 1,
			"team_id": "TEAM_OPT"})
		s["season_stats"] = {"ME": stats}
		s["world"] = {"team_profiles": {"TEAM_OPT": {
			"win_now_pressure": pressure}}}
		ContractDecision.check_option_clause(s, int(s["day"]))
		out.append(bool(DecisionVm.blocking(s).get("exercised", false)))

	assert_bool(out[0]).override_failure_message(
		"압박 0인 팀(문턱 75)이 평점 %.1f를 잡았다" % rating).is_false()
	assert_bool(out[1]).override_failure_message(
		"압박 100인 팀(문턱 50)이 평점 %.1f를 안 잡았다 — 문턱이 안 쓰인다"
		% rating).is_true()
