extends GdUnitTestSuite

## 프로 포스트시즌 — 대진 만들기 · 시리즈 치르기. B-10b.
##
## ⚠ **04엔 이게 통째로 없었다.** 시리즈를 실제로 만드는 곳은 생존리그
## 사다리 하나뿐이었고, KBL·2군은 정규시즌만 있고 한국시리즈가 없었다 —
## `ps_result`가 프로에서 영영 안 채워졌다.
##
## ⚠ **주인공 자리에 빈 문자열을 넘기지 않는다.** 그러면 상대가 안 정해진
## 빈 자리가 주인공으로 읽혀서 다른 가드가 대신 막고, 검사가 엉뚱한 것을 본다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


## 대진에 없는 사람. 주인공 자리에 빈 문자열 대신 이걸 넣는다
const NOBODY: String = "NOBODY"


## 1위부터 순서대로. 승률이 내려간다
func _standings(n: int = 10) -> Array:
	var out: Array = []
	for i in range(n):
		out.append({"team_id": "T%d" % i, "wins": 100 - i * 5,
			"losses": 44 + i * 5, "draws": 0,
			"win_pct": 0.7 - float(i) * 0.03})
	return out


func _by_id(bracket: Array, id: String) -> Dictionary:
	for s in bracket:
		if String(s["id"]) == id:
			return s
	return {}


# ── 시드 ──────────────────────────────────────────────────────

func test_the_seeds_follow_the_win_rate() -> void:
	assert_array(Postseason.seed_order(_standings(5))).is_equal(
		["T0", "T1", "T2", "T3", "T4"])


## 승률이 같으면 승수로 가른다 — 순서가 흔들리면 대진이 매번 바뀐다
func test_a_tie_is_broken_by_wins() -> void:
	var rows: Array = [
		{"team_id": "A", "wins": 70, "win_pct": 0.5},
		{"team_id": "B", "wins": 80, "win_pct": 0.5}]
	assert_array(Postseason.seed_order(rows)).is_equal(["B", "A"])


## ⚠ **원본을 안 바꾼다.** 정렬이 순위표를 뒤집으면 저장까지 흔들린다
func test_sorting_does_not_disturb_the_table() -> void:
	var rows: Array = _standings(5)
	rows.reverse()
	var first: String = String(rows[0]["team_id"])
	Postseason.seed_order(rows)
	assert_str(String(rows[0]["team_id"])).is_equal(first)


# ── 1군 대진 ──────────────────────────────────────────────────

## ⚠ **5강이다.** 02 v1은 6강이었고 **3위가 통째로 빠지는 결함**이 있었다 —
## WC(5vs6) → 준PO(4위) → PO(2위) → KS(1위)라서 3위가 어디에도 안 나왔다
func test_the_top_five_all_appear() -> void:
	var b: Array = Postseason.build_kbl(_standings())
	var seen: Dictionary = {}
	for s in b:
		for k in ["home_team_id", "away_team_id"]:
			if not String(s[k]).is_empty():
				seen[String(s[k])] = true
	for i in range(5):
		assert_bool(seen.has("T%d" % i)).override_failure_message(
			"%d위(T%d)가 대진 어디에도 없다" % [i + 1, i]).is_true()


func test_the_sixth_seed_stays_home() -> void:
	for s in Postseason.build_kbl(_standings()):
		assert_str(String(s["home_team_id"])).is_not_equal("T5")
		assert_str(String(s["away_team_id"])).is_not_equal("T5")


## ⚠ **1위는 한국시리즈 직행.** 긴 정규시즌의 가장 큰 보상이다
func test_the_top_seed_waits_in_the_final() -> void:
	var ks: Dictionary = _by_id(Postseason.build_kbl(_standings()), "KBL_KS")
	assert_str(String(ks["home_team_id"])).is_equal("T0")
	assert_str(String(ks["away_team_id"])).override_failure_message(
		"1위의 상대가 벌써 정해져 있다").is_empty()
	assert_str(String(ks["next_series_id"])).override_failure_message(
		"한국시리즈 다음에 또 시리즈가 있다").is_empty()


## ⚠ **4위는 1승을 안고 시작한다.** "4위는 1승, 5위는 2승"이 새 장치 없이
## 3전2승 + 홈 1승으로 정확히 표현된다
func test_the_wildcard_gives_the_higher_seed_a_head_start() -> void:
	var wc: Dictionary = _by_id(Postseason.build_kbl(_standings()), "KBL_WC")
	assert_str(String(wc["home_team_id"])).is_equal("T3")
	assert_str(String(wc["away_team_id"])).is_equal("T4")
	assert_int(int(wc["home_wins"])).override_failure_message(
		"4위 어드밴티지가 없다 — 5위와 대등해진다").is_equal(1)
	assert_int(int(wc["best_of"])).is_equal(3)


## 4위는 한 번만 더 이기면 되고 5위는 두 번 이겨야 한다
func test_the_head_start_means_one_more_win() -> void:
	var wc: Dictionary = _by_id(Postseason.build_kbl(_standings()), "KBL_WC")
	Postseason.apply_game(wc, "T3")
	assert_str(String(wc["winner"])).override_failure_message(
		"4위가 한 번 이겼는데 시리즈가 안 끝났다").is_equal("T3")


func test_the_lower_seed_must_win_twice() -> void:
	var wc: Dictionary = _by_id(Postseason.build_kbl(_standings()), "KBL_WC")
	Postseason.apply_game(wc, "T4")
	assert_str(String(wc["winner"])).is_empty()
	Postseason.apply_game(wc, "T4")
	assert_str(String(wc["winner"])).is_equal("T4")


## 라운드가 깊어질수록 길어진다 — 한국시리즈가 제일 길다
func test_the_series_get_longer_toward_the_final() -> void:
	var b: Array = Postseason.build_kbl(_standings())
	assert_int(int(_by_id(b, "KBL_WC")["best_of"])).is_less(
		int(_by_id(b, "KBL_PREP")["best_of"]))
	assert_int(int(_by_id(b, "KBL_PO")["best_of"])).is_less(
		int(_by_id(b, "KBL_KS")["best_of"]))
	assert_int(int(_by_id(b, "KBL_KS")["best_of"])).is_equal(7)


func test_a_thin_league_has_no_bracket() -> void:
	assert_array(Postseason.build_kbl(_standings(4))).override_failure_message(
		"5팀도 안 되는데 5강이 열렸다").is_empty()


# ── 2군 대진 ──────────────────────────────────────────────────

## ⚠ **2군은 전부 단판이다.** 1군처럼 무겁게 가지 않는다 —
## 독립 사다리와 모양은 같지만 **결승도 단판**이라는 점이 다르다
func test_the_farm_bracket_is_all_single_games() -> void:
	for s in Postseason.build_farm(_standings()):
		assert_int(int(s["best_of"])).override_failure_message(
			"2군 %s 가 단판이 아니다" % s["round"]).is_equal(1)


func test_the_farm_bracket_takes_four_teams() -> void:
	var b: Array = Postseason.build_farm(_standings())
	assert_int(b.size()).is_equal(3)
	assert_str(String(_by_id(b, "FARM_SEMI")["home_team_id"])).is_equal("T2")
	assert_str(String(_by_id(b, "FARM_SEMI")["away_team_id"])).is_equal("T3")
	assert_str(String(_by_id(b, "FARM_FINAL")["home_team_id"])).is_equal("T0")


func test_a_thin_farm_league_has_no_bracket() -> void:
	assert_array(Postseason.build_farm(_standings(3))).is_empty()


func test_an_unknown_league_has_no_bracket() -> void:
	assert_array(Postseason.build("LEAGUE_HIGHSCHOOL", _standings())).is_empty()


# ── 시리즈 진행 ───────────────────────────────────────────────

## ⚠ **이기려면 몇 승인지가 화면과 같아야 한다.** 두 벌로 두면 화면이
## "3승 필요"인데 엔진은 2승에서 끝낸다
func test_the_wins_needed_matches_the_screen() -> void:
	for best_of in [1, 3, 5, 7]:
		assert_int(Postseason.wins_needed(best_of)).is_equal(
			Bracket.wins_needed(best_of))


func test_a_game_moves_the_series() -> void:
	var s: Dictionary = Postseason._series("X", "L", "R", "A", "B", 5, "")
	Postseason.apply_game(s, "A")
	assert_int(int(s["home_wins"])).is_equal(1)
	assert_int(int(s["away_wins"])).is_equal(0)
	assert_str(String(s["winner"])).is_empty()


## 시리즈에 없는 팀이 이겼다고 하면 아무 일도 안 일어난다
func test_a_stranger_does_not_move_the_series() -> void:
	var s: Dictionary = Postseason._series("X", "L", "R", "A", "B", 5, "")
	Postseason.apply_game(s, "Z")
	assert_int(int(s["home_wins"])).is_equal(0)
	assert_int(int(s["away_wins"])).is_equal(0)


func test_a_series_ends_at_the_needed_wins() -> void:
	var s: Dictionary = Postseason._series("X", "L", "R", "A", "B", 5, "")
	for i in range(3):
		Postseason.apply_game(s, "A")
	assert_str(String(s["winner"])).is_equal("A")


## ⚠ **승자가 다음 자리에 앉아야 그 시리즈가 열린다**
func test_the_winner_advances() -> void:
	var b: Array = Postseason.build_kbl(_standings())
	var wc: Dictionary = _by_id(b, "KBL_WC")
	Postseason.apply_game(wc, "T3")
	Postseason.fill_next(b, wc)
	assert_str(String(_by_id(b, "KBL_PREP")["away_team_id"])
		).override_failure_message(
		"와일드카드 승자가 준플레이오프에 안 앉았다").is_equal("T3")


## ⚠ **안 끝난 시리즈는 아무도 안 올려보낸다.** 빈 승자를 그대로 앉히면
## 이미 정해져 있던 자리가 **지워진다**
func test_an_unfinished_series_advances_nobody() -> void:
	var b: Array = Postseason.build_kbl(_standings())
	_by_id(b, "KBL_PO")["away_team_id"] = "ALREADY"
	Postseason.fill_next(b, _by_id(b, "KBL_PREP"))
	assert_str(String(_by_id(b, "KBL_PO")["away_team_id"])
		).override_failure_message(
		"안 끝난 시리즈가 다음 자리를 지웠다").is_equal("ALREADY")


# ── 자동 진행 ─────────────────────────────────────────────────

## 주인공이 없으면 대진 전체가 한 번에 끝난다
func test_a_bracket_without_the_protagonist_finishes() -> void:
	var b: Array = Postseason.build_kbl(_standings())
	assert_int(Postseason.resolve_others(b, NOBODY, _rng())
		).override_failure_message(
		"치른 시리즈 수가 대진 크기와 다르다 — 같은 시리즈를 다시 치른다"
	).is_equal(b.size())
	assert_str(Bracket.champion(b)).override_failure_message(
		"전부 치렀는데 우승팀이 없다").is_not_empty()
	for s in b:
		assert_str(String(s["winner"])).override_failure_message(
			"%s 가 안 끝났다" % s["id"]).is_not_empty()


## 상대가 없으면 **한 판도 안 치른다** — 동전이 어디로 떨어지든
func test_a_lone_series_with_no_opponent_is_not_played() -> void:
	var s: Dictionary = Postseason._series("X", "L", "결승", "A", "", 1, "")
	var b: Array = [s]
	assert_int(Postseason.resolve_others(b, NOBODY, _rng())
		).override_failure_message("상대가 없는 시리즈를 치렀다").is_equal(0)
	assert_str(String(s["winner"])).is_empty()


## 배열 순서를 거꾸로 둔다 — 앞에서부터 훑으면 아직 안 열린 시리즈를
## 먼저 만나는 자리다. 상대 없이 치르면 **빈 문자열이 이긴다**
func test_a_series_without_an_opponent_waits() -> void:
	for i in range(40):
		var later: Dictionary = Postseason._series("LATER", "L", "결승",
			"A", "", 1, "")
		later["away_from"] = "FIRST"
		var first: Dictionary = Postseason._series("FIRST", "L", "준결승",
			"B", "C", 1, "LATER")
		var b: Array = [later, first]

		Postseason.resolve_others(b, NOBODY, _rng(i + 1))
		assert_str(String(later["away_team_id"])).override_failure_message(
			"먼저 치러야 할 시리즈의 승자가 안 올라왔다").is_not_empty()
		assert_str(Bracket.champion(b)).override_failure_message(
			"씨앗 %d — 상대도 없는데 결승이 끝났다. 빈 팀이 우승했다" % (i + 1)
		).is_not_empty()


## ⚠ **주인공 팀 시리즈는 건드리지 않는다** — 그건 사용자가 치른다
func test_the_protagonist_series_is_left_alone() -> void:
	var b: Array = Postseason.build_kbl(_standings())
	Postseason.resolve_others(b, "T3", _rng())
	assert_str(String(_by_id(b, "KBL_WC")["winner"])).override_failure_message(
		"주인공 팀 시리즈를 세계가 대신 치렀다").is_empty()
	# 그 뒤 시리즈도 상대가 안 정해져 못 연다
	assert_str(String(_by_id(b, "KBL_PREP")["winner"])).is_empty()


## ⚠ **안고 시작하는 승수를 이어받는다.** 0부터 다시 세면 와일드카드의
## 1승 어드밴티지가 조용히 사라진다
func test_the_head_start_survives_the_auto_play() -> void:
	var higher: int = 0
	for i in range(60):
		var b: Array = Postseason.build_kbl(_standings())
		Postseason.resolve_others(b, NOBODY, _rng(i + 1))
		if String(_by_id(b, "KBL_WC")["winner"]) == "T3":
			higher += 1
	assert_int(higher).override_failure_message(
		"4위가 60번 중 %d번 이겼다 — 1승 어드밴티지가 사라졌다" % higher
	).is_greater(38)


## 강팀이 늘 이기는 건 아니다 — 흔들림이 없으면 대진이 정해진 값이다
func test_the_lower_seed_can_still_win() -> void:
	var upsets: int = 0
	for i in range(60):
		var b: Array = Postseason.build_kbl(_standings())
		Postseason.resolve_others(b, NOBODY, _rng(i + 1))
		if String(Bracket.champion(b)) != "T0":
			upsets += 1
	assert_int(upsets).override_failure_message(
		"예순 번 내내 1위가 우승했다").is_greater(0)


func test_the_same_seed_gives_the_same_bracket() -> void:
	var a: Array = Postseason.build_kbl(_standings())
	var b: Array = Postseason.build_kbl(_standings())
	Postseason.resolve_others(a, NOBODY, _rng(7))
	Postseason.resolve_others(b, NOBODY, _rng(7))
	assert_str(Bracket.champion(a)).is_equal(Bracket.champion(b))


# ── 배경 리그 ─────────────────────────────────────────────────

func _game(league: String, home: String, away: String, played: bool) -> Dictionary:
	return {"id": "%s-%s-%s" % [league, home, away], "league_id": league,
		"home": home, "away": away, "day": 10,
		"result": {"home_score": 3, "away_score": 1, "winner": home}
			if played else null}


## `played`가 거짓이면 **절반만** 치른 세계다 — 한 경기도 안 치르면
## 순위표가 비어 대진이 애초에 안 만들어져서 검사가 아무것도 안 본다
func _world_state(played: bool = true,
		my_league: String = "LEAGUE_HIGHSCHOOL") -> Dictionary:
	var schedule: Array = []
	for league in ["LEAGUE_KBL", "LEAGUE_KBL_FARM"]:
		var n: int = 0
		for i in range(6):
			for j in range(6):
				if i != j:
					schedule.append(_game(league, "%s_T%d" % [league, i],
						"%s_T%d" % [league, j], played or n % 2 == 0))
					n += 1
	return {
		"season_year": 2030, "seed": 3, "schedule": schedule,
		"protagonist": {"id": "ME", "league_id": my_league, "team_id": "MY"},
	}


func test_a_finished_season_gets_a_champion() -> void:
	var s: Dictionary = _world_state()
	var out: Dictionary = Postseason.run_background(s)
	assert_array(out["leagues"]).is_not_empty()
	for league in out["leagues"]:
		assert_str(String(out["champions"][league])).override_failure_message(
			"%s 포스트시즌을 치렀는데 우승팀이 없다" % league).is_not_empty()


## ⚠ **정규시즌이 안 끝났으면 안 연다.** 남은 경기가 있는데 우승팀을
## 정하면 그 경기는 뭐가 되나
func test_an_unfinished_season_opens_nothing() -> void:
	assert_array(Postseason.run_background(_world_state(false))["leagues"]
		).is_empty()


## 한 경기도 안 치른 리그는 "끝났다"가 아니다 — 빈 리그를 마쳤다고 보면
## 아무도 안 뛴 해에 우승팀이 생긴다
func test_an_empty_league_has_not_finished() -> void:
	assert_bool(Postseason.regular_season_done([], "LEAGUE_KBL")
		).override_failure_message(
		"경기가 하나도 없는데 시즌을 마쳤다고 한다").is_false()
	assert_bool(Postseason.regular_season_done(
		[_game("LEAGUE_KBL", "A", "B", true)], "LEAGUE_ABL")
		).override_failure_message(
		"남의 리그 경기로 시즌을 마쳤다고 한다").is_false()


## ⚠ **국내만 배경으로 돌린다.** 해외는 진출 전까지 돌리지 않는다 —
## 안 뛰는 리그의 우승팀을 매년 만들면 세계가 헛돈다
func test_only_the_domestic_leagues_run_in_the_background() -> void:
	assert_array(Postseason.BACKGROUND_LEAGUES).is_equal(
		["LEAGUE_KBL", "LEAGUE_KBL_FARM"])


## ⚠ **주인공 리그는 건드리지 않는다** — 거기는 주인공 경기를 멈춰가며
## 진행해야 한다
func test_the_protagonist_league_is_skipped() -> void:
	var s: Dictionary = _world_state(true, "LEAGUE_KBL")
	assert_array(Postseason.run_background(s)["leagues"]
		).override_failure_message(
		"주인공 리그의 포스트시즌을 세계가 대신 치렀다").not_contains(["LEAGUE_KBL"])


## ⚠ **이미 치른 리그는 다시 안 만든다.** 다시 만들면 우승팀이 바뀐다
func test_a_played_postseason_is_not_replayed() -> void:
	var s: Dictionary = _world_state()
	var champ: String = String(
		Postseason.run_background(s)["champions"]["LEAGUE_KBL"])
	assert_array(Postseason.run_background(s)["leagues"]).is_empty()
	assert_str(Bracket.champion(Postseason.of(s, "LEAGUE_KBL"))).is_equal(champ)


## 대진이 상태에 남는다 — 화면과 기록이 그걸 읽는다
func test_the_bracket_lives_in_the_state() -> void:
	var s: Dictionary = _world_state()
	Postseason.run_background(s)
	assert_array(Postseason.of(s, "LEAGUE_KBL")).is_not_empty()
	assert_array(Postseason.of(s, "LEAGUE_ABL")).is_empty()


## 세계가 다르면 우승팀이 갈린다 — 씨앗이 안 섞이면 모든 세계가 같다
func test_a_different_world_can_crown_someone_else() -> void:
	var champs: Dictionary = {}
	for seed_value in range(1, 25):
		var s: Dictionary = _world_state()
		s["seed"] = seed_value
		champs[String(Postseason.run_background(s)["champions"]["LEAGUE_KBL"])] = true
	assert_int(champs.size()).override_failure_message(
		"스물네 세계가 전부 같은 팀이 우승했다 — 씨앗이 안 섞였다").is_greater(1)


# ── 그 해 어디까지 갔나 ───────────────────────────────────────

func _played_bracket() -> Array:
	var b: Array = Postseason.build_kbl(_standings())
	Postseason.resolve_others(b, NOBODY, _rng(3))
	return b


func test_the_champion_is_named_champion() -> void:
	var b: Array = _played_bracket()
	assert_str(Postseason.result_from_series(b, Bracket.champion(b))).is_equal(
		Postseason.CHAMPION)


func test_the_runner_up_is_named() -> void:
	var b: Array = _played_bracket()
	var pair: Dictionary = Bracket.finalists(b)
	assert_str(Postseason.result_from_series(b, String(pair["runner_up"]))
		).override_failure_message("준우승이 미진출로 적힌다").is_equal(
		Postseason.RUNNER_UP)


## 결승 바로 앞 라운드까지 간 팀은 4강이다
func test_losing_before_the_final_is_a_semi_final() -> void:
	var b: Array = _played_bracket()
	var pair: Dictionary = Bracket.finalists(b)
	var rounds: Array = Bracket.to_rounds(b)
	var semi: Dictionary = rounds[rounds.size() - 2]["series"][0]
	var loser: String = String(semi["home_team_id"])
	if loser == String(semi["winner"]):
		loser = String(semi["away_team_id"])
	if loser == String(pair["runner_up"]) or loser == String(pair["champion"]):
		return                                  # 결승까지 간 팀이면 이 검사가 아니다
	assert_str(Postseason.result_from_series(b, loser)).is_equal(
		Postseason.SEMI_FINAL)


func test_a_team_that_missed_the_bracket_is_not_qualified() -> void:
	assert_str(Postseason.result_from_series(_played_bracket(), "T9")).is_equal(
		Postseason.NOT_QUALIFIED)
	assert_str(Postseason.result_from_series([], "T0")).is_equal(
		Postseason.NOT_QUALIFIED)


## ⚠ **대회는 모양이 다르다.** 포스트시즌은 시리즈고 대회는 단판 경기다 —
## 같은 함수로 읽으려다 열 이름이 어긋나면 전원이 미진출이 된다
func test_a_tournament_bracket_reads_the_same_way() -> void:
	var b: Dictionary = {"total_rounds": 2, "matches": [
		{"round": 1, "home": "A", "away": "B", "winner": "A", "is_bye": false},
		{"round": 1, "home": "C", "away": "D", "winner": "C", "is_bye": false},
		{"round": 2, "home": "A", "away": "C", "winner": "A", "is_bye": false},
	]}
	assert_str(Postseason.result_from_matches(b, "A")).is_equal(Postseason.CHAMPION)
	assert_str(Postseason.result_from_matches(b, "C")).is_equal(Postseason.RUNNER_UP)
	assert_str(Postseason.result_from_matches(b, "B")).is_equal(Postseason.SEMI_FINAL)
	assert_str(Postseason.result_from_matches(b, "Z")).is_equal(
		Postseason.NOT_QUALIFIED)


func test_an_empty_tournament_gives_nothing() -> void:
	assert_str(Postseason.result_from_matches({}, "A")).is_equal(
		Postseason.NOT_QUALIFIED)


## ⚠ **그 해 대회 중 제일 멀리 간 것을 남긴다.** 마지막 것만 보면
## 우승한 해가 미진출로 적힌다
func test_the_best_run_of_the_year_wins() -> void:
	var s: Dictionary = {
		"tournaments": {
			"T1": {"league_id": "LEAGUE_HIGHSCHOOL", "bracket": {
				"total_rounds": 1,
				"matches": [{"round": 1, "home": "MY", "away": "X",
					"winner": "MY", "is_bye": false}]}},
			"T2": {"league_id": "LEAGUE_HIGHSCHOOL", "bracket": {
				"total_rounds": 1,
				"matches": [{"round": 1, "home": "MY", "away": "Y",
					"winner": "Y", "is_bye": false}]}},
		},
	}
	assert_str(Postseason.result_for(s, "MY", "LEAGUE_HIGHSCHOOL")
		).override_failure_message("우승한 해가 준우승으로 적힌다").is_equal(
		Postseason.CHAMPION)


## ⚠ **프로는 포스트시즌을, 학교는 대회를 본다.** 출처가 뒤바뀌면
## 한국시리즈 우승이 미진출로 적힌다
func test_a_pro_reads_the_postseason_not_a_tournament() -> void:
	var s: Dictionary = _world_state()
	Postseason.run_background(s)
	var champ: String = Bracket.champion(Postseason.of(s, "LEAGUE_KBL"))
	assert_str(Postseason.result_for(s, champ, "LEAGUE_KBL")
		).override_failure_message(
		"한국시리즈 우승팀이 미진출로 적힌다").is_equal(Postseason.CHAMPION)


## 남의 리그 대회는 안 센다
func test_another_leagues_tournament_does_not_count() -> void:
	var s: Dictionary = {
		"tournaments": {"T1": {"league_id": "LEAGUE_UNIVERSITY", "bracket": {
			"total_rounds": 1,
			"matches": [{"round": 1, "home": "MY", "away": "X",
				"winner": "MY", "is_bye": false}]}}},
	}
	assert_str(Postseason.result_for(s, "MY", "LEAGUE_HIGHSCHOOL")).is_equal(
		Postseason.NOT_QUALIFIED)


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **경력 한 줄에 실제로 적힌다.** 읽는 쪽이 셋인데(대학 입시·드래프트
## 판정·인생 기록) 채우는 자리가 없어서 전원이 미진출이었다
func test_the_season_record_carries_the_postseason_result() -> void:
	var s: Dictionary = {
		"season_year": 2030, "seed": 1, "schedule": [], "season_stats": {},
		"tournaments": {"T1": {"league_id": "LEAGUE_HIGHSCHOOL", "bracket": {
			"total_rounds": 1,
			"matches": [{"round": 1, "home": "TEAM_A", "away": "X",
				"winner": "TEAM_A", "is_bye": false}]}}},
		"protagonist": {"id": "ME", "team_id": "TEAM_A",
			"league_id": "LEAGUE_HIGHSCHOOL", "pitching": {"ovr": 70.0},
			"career_records": []},
	}
	var rec: Dictionary = SeasonHistory.protagonist_record(s, 2030)
	assert_str(String(rec.get("ps_result", ""))).override_failure_message(
		"대회 우승이 경력에 안 적힌다 — 입시·드래프트가 그걸 읽는다").is_equal(
		Postseason.CHAMPION)




## ⚠ **시즌 종료가 실제로 부른다.** 안 이으면 프로에 한국시리즈가 영영 없고
## `ps_result`가 안 채워진다
func test_the_season_end_runs_the_postseason() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	for g in s["schedule"]:
		g["result"] = {"home_score": 3, "away_score": 1, "winner": g["home"]}
	SeasonRunner.finish_season(s)
	assert_array(Postseason.of(s, "LEAGUE_KBL")).override_failure_message(
		"시즌이 끝났는데 프로 포스트시즌이 안 열렸다 — 배선이 끊겼다").is_not_empty()
	assert_str(Bracket.champion(Postseason.of(s, "LEAGUE_KBL"))).is_not_empty()
