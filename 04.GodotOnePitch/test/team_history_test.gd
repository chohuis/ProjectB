extends GdUnitTestSuite

## 팀 역사 데이터 — E.
##
## 🔴 **04는 238팀을 다 갖고도 `history`가 하나도 없었다.**
## `team_detail_vm.gd:8`이 그 사실을 적어 뒀다 — "02의 '팀 평가'는 이걸로
## 못 옮긴다. 04엔 그 데이터가 없다".
##
## 02 원본: `resource/data/master/entities/refs.json`의 `teams[].history`
##   `foundedYear` · `budget` · `seasonRanks`(S-1~S-5) · `titles` · `rivals`
##
## ⚠ **02에 없는 것을 지어내지 않는다.** 02 실측 — 238팀 중 창단연도 30 ·
## 예산 171 · 과거성적 172 · 우승 22 · 라이벌 38. **해외(ABL·JBL) 56팀은
## `history`가 통째로 없다.** 04도 그대로다.

const KBL: String = "LEAGUE_KBL"


## ⚠ **데이터 파일을 직접 본다.** 이주의 완결성은 파일의 성질이고,
## `World.teams_of`는 2군을 거르고 파생을 더해서 수가 안 맞는다
func _all_teams() -> Array:
	var f: FileAccess = FileAccess.open("res://data/teams.json", FileAccess.READ)
	assert_object(f).is_not_null()
	return JSON.parse_string(f.get_as_text()).get("teams", [])


func _teams() -> Array:
	return World.teams_of(KBL)


func _history_of(team_id: String) -> Dictionary:
	return World.team_field({}, team_id, "history", {})


# ── 데이터가 들어왔나 ────────────────────────────────────────────

## 🔴 **02가 준 만큼 들어와야 한다.** 실측으로 못 박는다
func test_02가_준_만큼_들어왔다() -> void:
	var founded: int = 0
	var budget: int = 0
	var ranks: int = 0
	var titles: int = 0
	for t in _all_teams():
		var h: Dictionary = t.get("history", {})
		if h.is_empty():
			continue
		if h.get("founded_year", null) != null:
			founded += 1
		if int(h.get("budget", 0)) > 0:
			budget += 1
		if not (h.get("season_ranks", []) as Array).is_empty():
			ranks += 1
		if not (h.get("titles", []) as Array).is_empty():
			titles += 1
	# 02 실측값 그대로 (238팀 전체)
	assert_int(founded).override_failure_message(
		"창단연도가 %d팀이다 — 02는 30팀이다" % founded).is_equal(30)
	assert_int(budget).override_failure_message(
		"예산이 %d팀이다 — 02는 171팀이다" % budget).is_equal(171)
	assert_int(ranks).override_failure_message(
		"과거 성적이 %d팀이다 — 02는 172팀이다" % ranks).is_equal(172)
	assert_int(titles).override_failure_message(
		"우승 이력이 %d팀이다 — 02는 22팀이다" % titles).is_equal(22)


## KBL은 예산이 다 있다 — FA 입찰이 그걸 읽는다
func test_프로는_예산이_다_있다() -> void:
	for t in _teams():
		var h: Dictionary = _history_of(String(t["id"]))
		assert_int(int(h.get("budget", 0))).override_failure_message(
			"%s에 예산이 없다" % t["id"]).is_greater(0)


## ⚠ **해외는 02에도 없다** — 지어내지 않았다는 것을 검사가 적어 둔다
func test_해외는_역사가_없다() -> void:
	for lid in ["LEAGUE_ABL", "LEAGUE_JBL"]:
		for t in World.teams_of(lid):
			assert_bool(_history_of(String(t["id"])).is_empty()) \
				.override_failure_message(
					"%s에 역사가 생겼다 — 02엔 없다(지어낸 것이다)" % t["id"]) \
				.is_true()


## 과거 성적은 다섯 시즌이다 — 02 `S-1`~`S-5`
func test_과거_성적은_다섯_시즌이다() -> void:
	for t in _teams():
		var ranks: Array = _history_of(String(t["id"])).get("season_ranks", [])
		if ranks.is_empty():
			continue
		assert_int(ranks.size()).override_failure_message(
			"%s의 과거 성적이 %d시즌이다" % [t["id"], ranks.size()]).is_equal(5)
		for r in ranks:
			assert_bool(r.has("season")).is_true()
			assert_int(int(r["rank"])).is_greater(0)


## 리그마다 예산 규모가 다르다 — 프로가 학생보다 훨씬 크다
func test_리그마다_예산_규모가_다르다() -> void:
	var kbl: int = 0
	var hs: int = 0
	for t in _teams():
		kbl = maxi(kbl, int(_history_of(String(t["id"])).get("budget", 0)))
	for t in World.teams_of("LEAGUE_HIGHSCHOOL"):
		hs = maxi(hs, int(_history_of(String(t["id"])).get("budget", 0)))
	assert_int(kbl).override_failure_message(
		"KBL 최대 예산 %d · 고교 최대 %d" % [kbl, hs]).is_greater(hs * 10)


# ── FA가 예산을 읽나 (형태 ③ — 쌓고 안 읽으면 없는 것과 같다) ────
## 🔴 **02는 예산으로 입찰 세기를 정한다** (`market.ts:1265`) —
## `budgetIndex = 그 팀 예산 / 평균 예산`.
##
## ⚠ **처음 만든 검사는 "지수가 3종 넘는다"였는데 아무것도 안 봤다** —
## 구단주 씀씀이로도 팀마다 달라서 그냥 통과했다. **02 식과 직접 대조한다**
func test_fa가_예산을_읽는다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var avg: float = FaRunner.avg_budget()
	assert_float(avg).override_failure_message("평균 예산이 0이다").is_greater(0.0)

	var checked: int = 0
	for t in FaRunner.market_teams_of(s["world"]):
		var b: float = float(World.team_field({}, String(t["team_id"]),
			"history", {}).get("budget", 0))
		if b <= 0.0:
			continue
		checked += 1
		assert_float(float(t["budget_index"])).override_failure_message(
			"%s — 예산 %.0f / 평균 %.0f = %.3f인데 지수가 %.3f다"
			% [t["team_id"], b, avg, b / avg, t["budget_index"]]) \
			.is_equal_approx(b / avg, 0.001)
	assert_int(checked).override_failure_message(
		"예산이 있는 프로 1군 팀이 하나도 없다").is_greater(5)


## ⚠ **예산이 없으면 평균으로 친다** — 02의 `?? avgBudget`.
## 0으로 두면 그 팀이 FA를 한 명도 못 부른다
func test_예산이_없으면_평균으로_친다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var found: int = 0
	for t in FaRunner.market_teams_of(s["world"]):
		var b: float = float(World.team_field({}, String(t["team_id"]),
			"history", {}).get("budget", 0))
		if b > 0.0:
			continue
		found += 1
		assert_float(float(t["budget_index"])).override_failure_message(
			"%s는 예산이 없는데 지수가 %.3f다 — 1.0이어야 한다"
			% [t["team_id"], t["budget_index"]]).is_equal_approx(1.0, 0.001)
	# 해외(ABL·JBL)는 02 원본에 예산이 없다 — 그 갈래가 실제로 걸린다
	assert_int(found).override_failure_message(
		"예산 없는 팀이 하나도 없다 — 이 갈래가 죽었다").is_greater(0)


## ⚠ **부자 구단이 부자답게 부른다** — clamp를 씌우면 그 차이가 사라진다.
## 예전엔 0.8~1.35로 죄어 썼는데 02엔 그 상한이 없다
func test_예산_차이가_지수에_남는다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var lo: float = 99.0
	var hi: float = 0.0
	for t in FaRunner.market_teams_of(s["world"]):
		lo = minf(lo, float(t["budget_index"]))
		hi = maxf(hi, float(t["budget_index"]))
	# 02 실측 KBL 예산 120억~350억 — 거의 세 배다
	assert_float(hi / lo).override_failure_message(
		"제일 부자와 제일 가난한 구단의 지수 차가 %.2f배뿐이다" % (hi / lo)) \
		.is_greater(2.0)
	assert_float(hi).override_failure_message(
		"지수 상한이 %.2f다 — 한 팀이 시장을 통째로 산다" % hi).is_less(5.0)

# ── 화면까지 닿나 (형태 ① · ③) ───────────────────────────────────

## 🔴 **데이터를 넣고 화면이 안 읽으면 없는 것과 같다.**
## 이 저장소에서 아홉 번 나온 형태다
func test_뷰모델이_역사를_낸다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var found: int = 0
	for t in World.teams_of(KBL):
		var vm: Dictionary = TeamDetailVm.build(s, String(t["id"]))
		var h: Dictionary = vm.get("history", {})
		if h.is_empty():
			continue
		found += 1
		assert_bool(h.has("budget")).override_failure_message(
			"%s 뷰모델에 예산이 없다" % t["id"]).is_true()
		assert_str(String(h["budget"])).contains("억")
	assert_int(found).override_failure_message(
		"프로 팀 뷰모델에 역사가 하나도 없다").is_greater(5)


## ⚠ **없는 팀에는 빈 사전이다** — 빈 카드를 띄우면 고장난 화면으로 읽힌다
func test_역사가_없으면_빈_사전이다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var empty: int = 0
	for t in World.teams_of("LEAGUE_ABL"):
		if TeamDetailVm.build(s, String(t["id"])).get("history", {}).is_empty():
			empty += 1
	assert_int(empty).override_failure_message(
		"해외 팀에 역사가 생겼다 — 02엔 없다").is_greater(0)


## ⚠ **0을 진짜 값으로 내지 않는다** — "창단 0년"이 뜨면 안 된다
func test_없는_칸은_아예_안_낸다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	for lid in ["LEAGUE_KBL", "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY"]:
		for t in World.teams_of(lid):
			var h: Dictionary = TeamDetailVm.build(s, String(t["id"])) \
				.get("history", {})
			if h.has("founded"):
				# ⚠ **"0년 창단"을 부분 일치로 보면 "2000년 창단"이 걸린다**
				assert_str(String(h["founded"])).override_failure_message(
					"%s — %s" % [t["id"], h["founded"]]).is_not_equal("0년")
			if h.has("budget"):
				# 🔴 **고교 예산은 0.40억이다** — 억 단위 정수로 접으면
				# "0억"이 된다. 실제로 `TEAM_HS_HALLA`가 그렇게 찍혔다
				assert_str(String(h["budget"])).override_failure_message(
					"%s — %s" % [t["id"], h["budget"]]).is_not_equal("0억")


## 🔴 **화면이 그 절을 그린다** — 뷰모델만 내고 안 그리면 소용없다
func test_화면이_역사를_그린다() -> void:
	var f: FileAccess = FileAccess.open(
		"res://ui/screens/team_detail_screen.gd", FileAccess.READ)
	assert_object(f).is_not_null()
	var code: String = ""
	for line in f.get_as_text().split("\n"):
		if line.strip_edges().begins_with("#"):
			continue
		code += line + "\n"
	assert_str(code).override_failure_message(
		"팀 상세 화면이 _build_history를 안 부른다").contains("_build_history()")
	assert_str(code).override_failure_message(
		"화면이 history를 안 읽는다").contains("\"history\"")
