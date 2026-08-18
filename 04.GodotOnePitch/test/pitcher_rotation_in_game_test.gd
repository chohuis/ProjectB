extends GdUnitTestSuite

## 경기 중 투수 교체 — M2가 남긴 숙제.
##
## 원본: `match_engine.rs`의 `switch_pitcher_if_needed`
##
## ⚠ **안 붙어 있어서 불펜 주인공이 한 경기도 못 던졌다.** 선발 하나가
## 끝까지 던지는데 `is_my_start`는 불펜을 확률로 내보내서, 화면엔
## "오늘 등판"이 뜨는데 실제로는 안 나왔다.
##
##   씨앗 4242      · RP · 화면 등판 9경기 · 실제 0경기
##   씨앗 777       · SP · 화면 등판 7경기 · 실제 7경기
##   씨앗 20270101  · RP · 화면 등판 7경기 · 실제 0경기


func _game(seed_value: int = 4242) -> Dictionary:
	return World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})


func _any_game(s: Dictionary) -> Dictionary:
	var best: Dictionary = {}
	for g in s["schedule"]:
		if best.is_empty() or int(g["day"]) < int(best["day"]):
			best = g
	return best


func _rng(seed_value: int) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _played(s: Dictionary, g: Dictionary) -> Dictionary:
	var counts: Dictionary = MatchDay.team_game_counts(s, int(g["day"]))
	return MatchDay.play(s["world"], g["home"], g["away"], _rng(99), {
		"league_id": g.get("league_id", ""),
		"home_game_no": int(counts.get(g["home"], 0)),
		"away_game_no": int(counts.get(g["away"], 0)),
	})


# ── 팀별 상태 ─────────────────────────────────────────────────

## ⚠ **스태미나가 양 팀 공유였다.** 하나뿐이라 한 팀 투수가 지치면 상대
## 투수도 같이 지쳤다 — 02는 `npc_pitcher_stamina.my`/`.opponent`로 나눈다
func test_each_side_has_its_own_stamina() -> void:
	var s: Dictionary = _game()
	var st: Dictionary = MatchDay._make_state(
		World.roster_of(s["world"], "TEAM_HS_AEWOL"),
		World.roster_of(s["world"], "TEAM_HS_AEWOL"),
		{"id": "HP", "pitching": {}}, {"id": "AP", "pitching": {}})
	assert_bool(st.has("home_stamina")).override_failure_message(
		"홈 스태미나가 따로 없다").is_true()
	assert_bool(st.has("away_stamina")).is_true()


## 한쪽만 던지면 상대 스태미나는 안 줄어야 한다
func test_pitching_only_tires_the_side_on_the_mound() -> void:
	var s: Dictionary = _game()
	var g: Dictionary = _any_game(s)
	var m: Dictionary = LiveMatch.open(s, g)
	var rng := _rng(m["seed"])

	# 1회초 — 홈 투수가 던진다
	var away_before: float = float(m["state"]["away_stamina"])
	for i in 12:
		if m["state"].get("half", "top") != "top":
			break
		LiveMatch.pitch(m["state"], m["ctx"], rng)

	assert_float(float(m["state"]["home_stamina"])).override_failure_message(
		"던진 쪽 스태미나가 그대로다").is_less(82.0)
	assert_float(float(m["state"]["away_stamina"])).override_failure_message(
		"안 던진 쪽 스태미나가 %.1f → %.1f로 줄었다"
		% [away_before, float(m["state"]["away_stamina"])]).is_equal(away_before)


# ── 큐 ────────────────────────────────────────────────────────

## ⚠ **불펜이 실려야 교체할 사람이 있다.** 팀당 투수 하나만 실으면
## `should_switch`가 늘 거짓이다
func test_the_state_carries_a_bullpen() -> void:
	var s: Dictionary = _game()
	var m: Dictionary = LiveMatch.open(s, _any_game(s))
	for key in ["home_queue", "away_queue"]:
		var q: Dictionary = m["state"].get(key, {})
		assert_int(q.get("pitchers", []).size()).override_failure_message(
			"%s에 투수가 %d명이다" % [key, q.get("pitchers", []).size()]) \
			.is_greater(1)


## 선발이 큐의 첫 번째여야 한다 — 아니면 경기 시작부터 다른 사람이 던진다
func test_the_starter_leads_the_queue() -> void:
	var s: Dictionary = _game()
	var m: Dictionary = LiveMatch.open(s, _any_game(s))
	var q: Dictionary = m["state"]["home_queue"]
	assert_int(int(q.get("current", -1))).is_equal(0)
	assert_str(String(q["pitchers"][0].get("id", ""))) \
		.is_equal(String(m["state"]["home_pitcher"].get("id", "")))


# ── 교체가 실제로 도는가 ──────────────────────────────────────

## ⚠ **이게 이 모듈의 존재 이유다.** 안 붙으면 선발이 완투한다
func test_a_full_game_uses_more_than_one_pitcher() -> void:
	var s: Dictionary = _game()
	var g: Dictionary = _any_game(s)
	var out: Dictionary = _played(s, g)
	assert_bool(out["ok"]).is_true()

	var used: Dictionary = {}
	for l in out["result"]["player_lines"]:
		if l.get("role", "") == "pitcher":
			used[l["player_id"]] = true
	assert_int(used.size()).override_failure_message(
		"한 경기에 투수가 %d명 나왔다 — 교체가 안 돈다" % used.size()) \
		.is_greater(2)


## ⚠ **투수마다 줄이 나뉘어야 한다.** 한 줄에 쌓으면 구원의 자책점이
## 선발 것이 되고, 시즌 기록이 통째로 어긋난다
func test_each_pitcher_gets_his_own_line() -> void:
	var s: Dictionary = _game()
	var out: Dictionary = _played(s, _any_game(s))

	var seen: Dictionary = {}
	for l in out["result"]["player_lines"]:
		if l.get("role", "") != "pitcher":
			continue
		assert_bool(seen.has(l["player_id"])).override_failure_message(
			"%s의 줄이 두 개다" % l["player_id"]).is_false()
		seen[l["player_id"]] = true
		# 안 던진 투수는 애초에 안 실린다
		assert_bool(float(l["ip"]) > 0.0 or int(l["pc"]) > 0).is_true()


## 팀 이닝 합이 경기 이닝과 맞아야 한다 — 줄이 새면 여기서 드러난다
func test_the_innings_add_up() -> void:
	var s: Dictionary = _game()
	var out: Dictionary = _played(s, _any_game(s))

	var total_outs: int = 0
	for l in out["result"]["player_lines"]:
		if l.get("role", "") == "pitcher":
			total_outs += CareerSummary.innings_to_outs(float(l["ip"]))
	# 9이닝 양 팀이면 54아웃, 연장·끝내기로 오차가 있다
	assert_int(total_outs).override_failure_message(
		"양 팀 합계가 %d아웃이다" % total_outs).is_between(40, 90)


# ── 불펜 주인공이 던지는가 ────────────────────────────────────

## ⚠ **이게 사용자가 겪던 증상이다.** 주인공이 불펜이면 화면엔 "오늘 등판"이
## 뜨는데 실제로는 시즌 내내 한 경기도 안 나왔다
func test_a_relief_protagonist_actually_pitches() -> void:
	# ⚠ **센 학교라야 불펜이 된다** (P-35). 프리셋이 붙기 전에는 주인공 OVR이
	# 무작위라 애월고에서도 불펜이 나왔는데, 이제 넷 다 68이라 약한 학교에선
	# 늘 선발이다 — 한성고(전력 5)에서 이 씨앗이 불펜이다. 찍어서 골랐다
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_HANSEONG"})
	assert_str(String(s["protagonist"]["role"])).override_failure_message(
		"이 씨앗의 주인공이 불펜이 아니다 — 검사가 헛돈다").is_equal("RP")

	var me: String = s["protagonist"]["id"]
	var marked: int = 0
	var appeared: int = 0
	for g in s["schedule"]:
		if not g.get("is_protagonist_game", false):
			continue
		marked += 1
		var m: Dictionary = LiveMatch.open(s, g)
		if not m["ok"]:
			continue
		var rng := _rng(m["seed"])
		LiveMatch.finish(m["state"], m["ctx"], rng)
		MatchDay._to_report_shape(m["state"])
		for l in MatchReport.player_lines(m["state"]):
			if l.get("player_id", "") == me:
				appeared += 1
				break

	assert_int(marked).is_greater(0)
	assert_int(appeared).override_failure_message(
		"화면은 %d경기 등판이라는데 실제로는 %d경기 나왔다" % [marked, appeared]) \
		.is_greater(0)


## ⚠ **구원이 스태미나 100으로 들어오면 안 된다.** 자기 능력과 무관하게
## 꽉 찬 채로 나와서 **교체하는 팀이 압도적으로 유리해졌다** — 02 실측
## 주인공 완투 ERA 3.83 vs 투수진 3명 교체 1.65.
## 선발도 82에서 시작하므로 구원도 같은 기준이어야 공평하다
## ⚠ **경기 하나에 매달리지 않는다.** 예전엔 첫 경기만 봤는데, 그 경기에서
## 홈 선발이 완투하면 검사가 아무것도 못 본 채 실패했다 — 세계 생성이
## 바뀔 때마다 깨지는 자리다. 여러 경기를 훑어 **교체가 일어나는 경기**를 본다
func test_a_reliever_does_not_come_in_fresh() -> void:
	var s: Dictionary = _game()
	var checked: int = 0

	for g in _early_games(s, 12):
		var m: Dictionary = LiveMatch.open(s, g)
		if not m["ok"]:
			continue
		var rng := _rng(m["seed"])

		while not m["state"].get("is_finished", false):
			var before: int = int(m["state"]["home_queue"]["current"])
			LiveMatch.pitch(m["state"], m["ctx"], rng)
			if int(m["state"]["home_queue"]["current"]) == before:
				continue

			checked += 1
			var cap: float = float(m["state"]["home_pitcher"].get("stamina_cap", 50.0))
			assert_float(float(m["state"]["home_stamina"])).override_failure_message(
				"구원이 스태미나 %.1f로 들어왔다 (상한 %.1f · 기준 %.1f 이하)"
				% [float(m["state"]["home_stamina"]), cap, Tuning.RELIEF_START_STAMINA]) \
				.is_less_equal(Tuning.RELIEF_START_STAMINA)
			break

	assert_int(checked).override_failure_message(
		"경기 12개에서 교체가 한 번도 없다").is_greater(0)


## 이른 날짜의 경기 몇 개. **id 순으로 고정한다** — 일정 배열 순서에
## 기대면 정렬이 바뀔 때 검사가 다른 경기를 본다
func _early_games(s: Dictionary, count: int) -> Array:
	var out: Array = []
	for g in s["schedule"]:
		if int(g["day"]) <= 3:
			out.append(g)
	out.sort_custom(func(a, b) -> bool: return String(a["id"]) < String(b["id"]))
	return out.slice(0, count)


## 교체된 뒤에도 **선발의 기록은 그대로 남는다** — 줄이 나뉜 이유다
func test_the_starters_line_survives_the_switch() -> void:
	var s: Dictionary = _game()
	var m: Dictionary = LiveMatch.open(s, _any_game(s))
	var rng := _rng(m["seed"])

	var starter_line: Dictionary = m["state"]["home_queue"]["lines"][0]
	for i in 400:
		LiveMatch.pitch(m["state"], m["ctx"], rng)
		if int(m["state"]["home_queue"]["current"]) > 0:
			break

	var pc: int = int(starter_line.get("pc", 0))
	assert_int(pc).override_failure_message("선발 투구 수가 0이다").is_greater(0)

	# 교체 뒤 더 던져도 선발 줄은 안 늘어난다
	for i in 20:
		LiveMatch.pitch(m["state"], m["ctx"], rng)
	assert_int(int(starter_line.get("pc", 0))).override_failure_message(
		"교체 뒤에도 선발 줄에 투구가 쌓인다").is_equal(pc)
