extends GdUnitTestSuite

## 경기 하루 — M7-6a. **조각들이 실제로 이어지는 두 번째 지점.**
##
## 세계(M8)의 로스터로 경기(M2)를 돌려 순위표(M1)와 기록(M1)에 넣는다.
##
## ⚠ **여기가 계약 검사다.** 모듈 하나하나는 다 통과하는데 이어 붙이면
## 안 도는 자리가 있다 — 02에서 `MatchReport`를 순위표에 이을 때 무승부
## 표기가 어긋나 **없던 승리가 생겼다.**


func _world() -> Dictionary:
	return World.build({"seed": 4242, "season_year": 2027})


func _rng(n: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = n
	return r


func _two_teams() -> Array:
	var t: Array = World.teams_of("LEAGUE_KBL")
	return [t[0]["id"], t[1]["id"]]


# ── 경기가 도는가 ─────────────────────────────────────────────

## ⚠ **진짜 로스터로 돌아야 한다.** 벤치용 가짜 선수로만 돌리면 세계의
## 사전 모양이 엔진과 안 맞아도 모른다
func test_a_game_runs_from_real_rosters() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var out: Dictionary = MatchDay.play(w, ids[0], ids[1], _rng(7))

	assert_bool(out["ok"]).override_failure_message(out.get("error", "")).is_true()
	assert_int(out["pitches"]).is_greater(100)
	assert_bool(out["result"].has("home_score")).is_true()


## ⚠ **야구여야 한다.** 빠르기만 하고 득점이 0.89인 적이 있다
func test_the_scores_look_like_baseball() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var runs: int = 0
	var pitches: int = 0
	for i in 20:
		var out: Dictionary = MatchDay.play(w, ids[0], ids[1], _rng(i))
		runs += int(out["result"]["home_score"]) + int(out["result"]["away_score"])
		pitches += int(out["pitches"])
	var per_game: float = float(runs) / 20.0
	assert_float(per_game).override_failure_message(
		"경기당 득점 %.2f — 야구가 아니다" % per_game).is_between(4.0, 20.0)
	assert_float(float(pitches) / 20.0).is_between(150.0, 400.0)


## 같은 씨앗이면 같은 경기 — 아니면 조사가 재현이 안 된다
func test_the_same_seed_gives_the_same_game() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var a: Dictionary = MatchDay.play(w, ids[0], ids[1], _rng(9))
	var b: Dictionary = MatchDay.play(w, ids[0], ids[1], _rng(9))
	assert_int(a["result"]["home_score"]).is_equal(b["result"]["home_score"])
	assert_int(a["result"]["away_score"]).is_equal(b["result"]["away_score"])


## ⚠ **로스터가 비면 경기를 안 돌린다.** 억지로 돌리면 빈 타순으로 돌아
## 이상한 결과가 순위표에 들어간다
func test_an_empty_roster_refuses_to_play() -> void:
	var out: Dictionary = MatchDay.play({"rosters": {}}, "A", "B", _rng())
	assert_bool(out["ok"]).is_false()
	assert_str(out["error"]).is_not_empty()


# ── 순위표로 이어지는가 (계약) ────────────────────────────────

## ⚠ **02는 여기서 무승부 표기가 어긋나 없던 승리가 생겼다.**
## `MatchReport`가 내는 것을 `Standings`가 그대로 먹어야 한다
func test_the_result_feeds_the_standings() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var table: Array = [
		{"team_id": ids[0], "wins": 0, "losses": 0, "draws": 0},
		{"team_id": ids[1], "wins": 0, "losses": 0, "draws": 0},
	]
	for i in 10:
		var out: Dictionary = MatchDay.play(w, ids[0], ids[1], _rng(100 + i))
		table = Standings.apply_result(table, out["result"], ids[0], ids[1])

	var total: int = 0
	for row in table:
		total += int(row["wins"]) + int(row["losses"]) + int(row["draws"])
	# 경기마다 두 팀에 한 줄씩 — 10경기면 20
	assert_int(total).override_failure_message(
		"순위표에 %d줄 (10경기면 20이어야)" % total).is_equal(20)


## 승과 패가 짝이 맞아야 한다 — 안 맞으면 무승부가 승리로 샜다
func test_wins_and_losses_pair_up() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var table: Array = [
		{"team_id": ids[0], "wins": 0, "losses": 0, "draws": 0},
		{"team_id": ids[1], "wins": 0, "losses": 0, "draws": 0},
	]
	for i in 20:
		table = Standings.apply_result(table,
			MatchDay.play(w, ids[0], ids[1], _rng(200 + i))["result"], ids[0], ids[1])

	assert_int(int(table[0]["wins"])).is_equal(int(table[1]["losses"]))
	assert_int(int(table[1]["wins"])).is_equal(int(table[0]["losses"]))
	assert_int(int(table[0]["draws"])).is_equal(int(table[1]["draws"]))


# ── 기록으로 이어지는가 (계약) ────────────────────────────────

## ⚠ **교체된 투수의 성적이 남아야 한다.** 02는 안 남아서 리그 성적표가
## 통째로 비었다
func test_the_result_feeds_the_season_stats() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var out: Dictionary = MatchDay.play(w, ids[0], ids[1], _rng(11))
	var lines: Array = out["result"]["player_lines"]
	assert_bool(lines.is_empty()).override_failure_message("선수 줄이 없다").is_false()

	# `accumulate`는 줄 **배열**을 통째로 받는다
	var stats: Dictionary = SeasonStats.accumulate({}, lines)
	assert_bool(stats.is_empty()).override_failure_message(
		"선수 줄 %d개를 넣었는데 기록이 비었다" % lines.size()).is_false()


## 투수 줄에 이닝이 실려야 한다 — 없으면 방어율이 안 나온다
func test_pitcher_lines_carry_innings() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var found: bool = false
	for l in MatchDay.play(w, ids[0], ids[1], _rng(13))["result"]["player_lines"]:
		if float(l.get("ip", 0.0)) > 0.0:
			found = true
	assert_bool(found).override_failure_message("이닝이 실린 투수 줄이 없다").is_true()


# ── 하루치 ────────────────────────────────────────────────────

## 하루에 여러 경기가 돌고 결과가 일정에 되꽂힌다
func test_a_days_games_all_get_results() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"team_id": "TEAM_HS_AEWOL"})
	var day: int = _first_game_day(s)

	var n: int = MatchDay.play_day(s, day, _rng(5))
	assert_int(n).is_greater(0)

	for g in s["schedule"]:
		if int(g["day"]) == day:
			assert_object(g["result"]).override_failure_message(
				"%s에 결과가 없다" % g["id"]).is_not_null()


## ⚠ **이미 치른 경기를 다시 안 돌린다.** 돌리면 순위표에 승패가 두 번 들어간다
func test_playing_a_day_twice_changes_nothing() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"team_id": "TEAM_HS_AEWOL"})
	# ⚠ **1일차엔 경기가 없다.** 리그마다 개막일이 다르다 — 고정 날짜를 쓰면
	# 0경기를 돌려 놓고 "두 번 안 돌렸다"가 통과한다
	var day: int = _first_game_day(s)
	var first: int = MatchDay.play_day(s, day, _rng(5))
	var second: int = MatchDay.play_day(s, day, _rng(5))
	assert_int(first).is_greater(0)
	assert_int(second).override_failure_message("두 번째에 %d경기를 또 돌렸다" % second) \
		.is_equal(0)


func _first_game_day(s: Dictionary) -> int:
	var day: int = 0
	for g in s["schedule"]:
		var d: int = int(g["day"])
		if day == 0 or d < day:
			day = d
	return day


# ── 편성 ──────────────────────────────────────────────────────

func _roster(pitchers: int, batters: int) -> Array:
	var out: Array = []
	for i in pitchers:
		out.append({"id": "P%d" % i, "position": "SP",
			"pitching": {"ovr": 50.0 + i, "stamina": 60.0, "velocity": 60.0,
				"command": 60.0, "control": 60.0, "movement": 60.0,
				"mentality": 60.0, "clutch": 50.0, "hold_runners": 50.0},
			"batting": {"ovr": 20.0, "contact": 20.0, "power": 20.0, "eye": 20.0,
				"discipline": 20.0, "speed": 20.0, "base_instinct": 20.0,
				"batting_clutch": 20.0}})
	for i in batters:
		out.append({"id": "B%d" % i, "position": "1B",
			"pitching": {"ovr": 10.0, "stamina": 10.0, "velocity": 10.0,
				"command": 10.0, "control": 10.0, "movement": 10.0,
				"mentality": 10.0, "clutch": 10.0, "hold_runners": 10.0},
			"batting": {"ovr": 40.0 + i, "contact": 60.0, "power": 60.0, "eye": 60.0,
				"discipline": 60.0, "speed": 60.0, "base_instinct": 60.0,
				"batting_clutch": 60.0}})
	return out


## ⚠ **타순은 아홉이다.** 적으면 같은 타자가 자주 돌아 성적이 부푼다
func test_the_lineup_is_nine_batters() -> void:
	assert_int(MatchDay._lineup(_roster(5, 20)).size()).is_equal(9)


## ⚠ **센 타자부터 세운다.** 안 그러면 타순이 로스터 순서가 된다
func test_the_lineup_is_sorted_by_batting() -> void:
	var line: Array = MatchDay._lineup(_roster(5, 20))
	for i in range(1, line.size()):
		assert_bool(float(line[i - 1]["batting"]["ovr"])
			>= float(line[i]["batting"]["ovr"])).override_failure_message(
			"타순이 능력치 순이 아니다").is_true()


## ⚠ **야수가 모자라도 아홉을 세운다.** 빈 타순으로 돌면 경기가 안 끝난다
func test_a_thin_roster_still_fields_nine() -> void:
	assert_int(MatchDay._lineup(_roster(15, 3)).size()).is_equal(9)


## ⚠ **선발은 제일 센 투수다.** 약한 쪽을 고르면 리그 방어율이 통째로 오른다
func test_the_first_game_starts_the_ace() -> void:
	var s: Dictionary = MatchDay.starter_of(_roster(5, 20), "LEAGUE_KBL", 0)
	assert_str(s["id"]).is_equal("P4")   # ovr 50 + i, i=4가 최고


## ⚠ **다음 경기는 다음 선발이다.** 이게 이 모듈의 존재 이유다 —
## 매번 제일 센 투수를 고르면 에이스가 전 경기를 던지고 나머지는 표본이 0이다
func test_the_next_game_starts_someone_else() -> void:
	var roster: Array = _roster(5, 20)
	var a: Dictionary = MatchDay.starter_of(roster, "LEAGUE_KBL", 0)
	var b: Dictionary = MatchDay.starter_of(roster, "LEAGUE_KBL", 1)
	assert_str(b["id"]).override_failure_message(
		"연속 두 경기에 같은 선발이 나왔다").is_not_equal(a["id"])


## 로테이션을 한 바퀴 돌면 다시 처음으로
func test_the_rotation_comes_back_around() -> void:
	var roster: Array = _roster(5, 20)
	var size: int = Rotation.size_of("LEAGUE_KBL")
	assert_str(MatchDay.starter_of(roster, "LEAGUE_KBL", size)["id"]) \
		.is_equal(MatchDay.starter_of(roster, "LEAGUE_KBL", 0)["id"])


func test_the_starter_is_never_a_batter() -> void:
	for n in 6:
		var s: Dictionary = MatchDay.starter_of(_roster(3, 20), "LEAGUE_KBL", n)
		assert_bool(PlayerGen.is_pitcher(s["position"])).override_failure_message(
			"%d번째 경기에 야수가 선발로 나왔다" % n).is_true()


func test_a_roster_without_pitchers_has_no_starter() -> void:
	assert_bool(MatchDay.starter_of(_roster(0, 20), "LEAGUE_KBL", 0).is_empty()).is_true()


# ── 로테이션이 실제로 도는가 ──────────────────────────────────

## ⚠ **하루치를 돌릴 때 팀별 경기 순번이 는다.** 안 늘면 로테이션이 안 돌아
## 에이스가 전 경기를 던진다
func test_game_counts_grow_as_days_are_played() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"team_id": "TEAM_HS_AEWOL"})
	var day: int = _first_game_day(s)
	assert_int(MatchDay.team_game_counts(s, day).size()).is_equal(0)
	MatchDay.play_day(s, day, _rng(5))
	assert_int(MatchDay.team_game_counts(s, day + 1).size()).is_greater(0)


## ⚠ **안 치른 경기는 순번에 안 센다.** 세면 시즌 첫날부터 로테이션이
## 한참 돌아 있는 것으로 잡힌다
func test_unplayed_games_do_not_count() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"team_id": "TEAM_HS_AEWOL"})
	assert_int(MatchDay.team_game_counts(s, 999).size()).is_equal(0)


## ⚠ **홈·원정이 각자 자기 순번을 쓴다.** 하나로 쓰면 두 팀의 로테이션이
## 같이 돌아 늘 같은 짝이 붙는다
func test_home_and_away_rotate_independently() -> void:
	var roster: Array = _roster(5, 20)
	var seen: Dictionary = {}
	for n in 5:
		var hp: Dictionary = MatchDay.starter_of(roster, "LEAGUE_KBL", n)
		var ap: Dictionary = MatchDay.starter_of(roster, "LEAGUE_KBL", 0)
		seen["%s|%s" % [hp["id"], ap["id"]]] = true
	assert_int(seen.size()).override_failure_message(
		"홈 순번이 바뀌어도 짝이 안 달라진다").is_equal(5)


# ── 거절 이유를 구분하는가 ────────────────────────────────────

## ⚠ **가드가 겹쳐 있어 이유를 구분해서 봐야 한다.** 하나를 지워도 다른 게
## 잡아서, 메시지를 안 보면 둘 다 안 걸린다
func test_an_empty_roster_says_so() -> void:
	assert_str(MatchDay.play({"rosters": {}}, "A", "B", _rng())["error"]) \
		.contains("로스터")


func test_a_roster_without_pitchers_says_so() -> void:
	var w: Dictionary = {"rosters": {"A": _roster(0, 20), "B": _roster(0, 20)}}
	var out: Dictionary = MatchDay.play(w, "A", "B", _rng())
	assert_bool(out["ok"]).is_false()
	assert_str(out["error"]).contains("선발")



# ── 능력치가 실제로 넘어가는가 ────────────────────────────────

## ⚠ **키 이름이 엔진과 다르면 0으로 읽혀 조용히 약해진다.** 결과는
## "야구다움" 범위 안에 남아서 총량 검사로는 안 보인다
## ⚠ **"0이 아니다"로는 못 잡는다.** 키가 틀리면 기본값 50이 들어가는데
## 그것도 0이 아니다 — 실제로 변이가 그렇게 빠져나갔다.
## **키마다 다른 값**을 넣어 그 값이 그대로 오는지 본다
func test_the_engine_gets_real_ability_values() -> void:
	var b: Dictionary = MatchDay._batter({"id": "B", "batting": {
		"contact": 11.0, "power": 12.0, "eye": 13.0, "discipline": 14.0,
		"speed": 15.0, "base_instinct": 16.0, "batting_clutch": 17.0}})
	var want_b: Dictionary = {"contact": 11.0, "power": 12.0, "eye": 13.0,
		"discipline": 14.0, "speed": 15.0, "instinct": 16.0, "batting_clutch": 17.0}
	for k in want_b:
		assert_float(b[k]).override_failure_message(
			"타자 %s: %.0f를 넣었는데 %.0f가 왔다" % [k, want_b[k], b[k]]) \
			.is_equal(want_b[k])

	var p: Dictionary = MatchDay._pitcher({"id": "P", "pitching": {
		"command": 21.0, "velocity": 22.0, "control": 23.0, "movement": 24.0,
		"clutch": 25.0, "mentality": 26.0, "hold_runners": 27.0, "stamina": 28.0}})
	var want_p: Dictionary = {"command": 21.0, "velocity": 22.0, "control": 23.0,
		"movement": 24.0, "clutch": 25.0, "mental_resil": 26.0,
		"hold_runners": 27.0, "stamina_cap": 28.0}
	for k in want_p:
		assert_float(p[k]).override_failure_message(
			"투수 %s: %.0f를 넣었는데 %.0f가 왔다" % [k, want_p[k], p[k]]) \
			.is_equal(want_p[k])


## ⚠ **센 팀이 이겨야 한다.** 능력치가 안 넘어가면 승률이 반반이 된다 —
## 이게 "키 이름이 틀렸다"를 잡는 유일한 검사다
func test_a_much_stronger_team_wins_more() -> void:
	var strong: Array = []
	var weak: Array = []
	for i in 20:
		strong.append({"id": "S%d" % i, "position": "SP" if i < 5 else "1B",
			"pitching": {"ovr": 90.0, "stamina": 90.0, "velocity": 90.0,
				"command": 90.0, "control": 90.0, "movement": 90.0,
				"mentality": 90.0, "clutch": 90.0, "hold_runners": 90.0},
			"batting": {"ovr": 90.0, "contact": 90.0, "power": 90.0, "eye": 90.0,
				"discipline": 90.0, "speed": 90.0, "base_instinct": 90.0,
				"batting_clutch": 90.0}})
		weak.append({"id": "W%d" % i, "position": "SP" if i < 5 else "1B",
			"pitching": {"ovr": 30.0, "stamina": 30.0, "velocity": 30.0,
				"command": 30.0, "control": 30.0, "movement": 30.0,
				"mentality": 30.0, "clutch": 30.0, "hold_runners": 30.0},
			"batting": {"ovr": 30.0, "contact": 30.0, "power": 30.0, "eye": 30.0,
				"discipline": 30.0, "speed": 30.0, "base_instinct": 30.0,
				"batting_clutch": 30.0}})

	var w: Dictionary = {"rosters": {"S": strong, "W": weak}}
	var wins: int = 0
	for i in 20:
		var r: Dictionary = MatchDay.play(w, "S", "W", _rng(300 + i))["result"]
		if int(r["home_score"]) > int(r["away_score"]):
			wins += 1
	assert_int(wins).override_failure_message(
		"OVR 90 팀이 OVR 30 팀에게 20경기 중 %d승 — 능력치가 안 넘어간다" % wins) \
		.is_greater(13)


# ── 어댑터로 옮기는가 ─────────────────────────────────────────

## ⚠ **타자 줄이 양 팀에 다 있어야 한다.** 한쪽에 몰리면 상대 팀 타격 기록이
## 통째로 빈다
func test_batters_from_both_teams_get_lines() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var lines: Array = MatchDay.play(w, ids[0], ids[1], _rng(21))["result"]["player_lines"]

	var home_ids: Dictionary = {}
	for p in World.roster_of(w, ids[0]):
		home_ids[p["id"]] = true

	var h: int = 0
	var a: int = 0
	for l in lines:
		if l["role"] != "batter":
			continue
		if home_ids.has(l["player_id"]):
			h += 1
		else:
			a += 1
	assert_int(h).override_failure_message("홈 타자 줄이 없다").is_greater(0)
	assert_int(a).override_failure_message("원정 타자 줄이 없다").is_greater(0)


## ⚠ **줄마다 선수 id가 있어야 한다.** 없으면 기록이 아무에게도 안 붙는다
func test_every_line_names_its_player() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	for l in MatchDay.play(w, ids[0], ids[1], _rng(23))["result"]["player_lines"]:
		assert_str(l["player_id"]).override_failure_message(
			"%s 줄에 선수 id가 없다" % l["role"]).is_not_empty()


## ⚠ **양 팀 투수 성적이 섞이면 안 된다.** 한 줄에 쌓으면 자책점이 두 배가
## 되고 상대 삼진이 내 것이 된다
func test_the_two_teams_pitchers_are_kept_apart() -> void:
	var w: Dictionary = _world()
	var ids: Array = _two_teams()
	var out: Dictionary = MatchDay.play(w, ids[0], ids[1], _rng(27))
	var pitchers: Array = []
	for l in out["result"]["player_lines"]:
		if l["role"] == "pitcher":
			pitchers.append(l)
	# 교체가 붙어 투수가 여럿이다 — **줄이 겹치면 안 된다**
	assert_int(pitchers.size()).override_failure_message(
		"투수 줄이 %d개다" % pitchers.size()).is_greater_equal(2)
	var seen: Dictionary = {}
	for l in pitchers:
		assert_bool(seen.has(l["player_id"])).override_failure_message(
			"%s의 줄이 두 개다" % l["player_id"]).is_false()
		seen[l["player_id"]] = true

	# 자책점 합이 실제 득점과 맞아야 한다 — 섞이거나 새면 여기서 드러난다
	var er: float = 0.0
	for l in pitchers:
		er += float(l["er"])
	var runs: float = float(out["result"]["home_score"]) + float(out["result"]["away_score"])
	assert_float(er).override_failure_message(
		"자책점 합 %.0f, 득점 합 %.0f" % [er, runs]).is_equal(runs)


## ⚠ **투수 능력치만 갈리는 검사가 따로 필요하다.** 강팀 검사는 타자가
## 정상이면 통과하므로 **투수 쪽 키가 틀려도 안 걸린다**.
##
## 같은 타선에 투수만 바꿔서 실점이 갈리는지 본다
func test_the_pitcher_ability_actually_reaches_the_engine() -> void:
	var lineup: Array = _roster(0, 12)   # 타자만 (능력치 동일)

	var ace: Array = lineup.duplicate()
	ace.append({"id": "ACE", "position": "SP",
		"pitching": {"ovr": 95.0, "stamina": 95.0, "velocity": 95.0,
			"command": 95.0, "control": 95.0, "movement": 95.0,
			"mentality": 95.0, "clutch": 95.0, "hold_runners": 95.0},
		"batting": {"ovr": 10.0, "contact": 10.0, "power": 10.0, "eye": 10.0,
			"discipline": 10.0, "speed": 10.0, "base_instinct": 10.0,
			"batting_clutch": 10.0}})

	var poor: Array = lineup.duplicate()
	poor.append({"id": "POOR", "position": "SP",
		"pitching": {"ovr": 25.0, "stamina": 25.0, "velocity": 25.0,
			"command": 25.0, "control": 25.0, "movement": 25.0,
			"mentality": 25.0, "clutch": 25.0, "hold_runners": 25.0},
		"batting": {"ovr": 10.0, "contact": 10.0, "power": 10.0, "eye": 10.0,
			"discipline": 10.0, "speed": 10.0, "base_instinct": 10.0,
			"batting_clutch": 10.0}})

	# 홈에 에이스 · 원정에 약체를 두고 20경기. 원정 득점(에이스가 막는 쪽)이
	# 홈 득점(약체가 던지는 쪽)보다 확실히 적어야 한다
	var w: Dictionary = {"rosters": {"ACE_TEAM": ace, "POOR_TEAM": poor}}
	var runs_vs_ace: int = 0
	var runs_vs_poor: int = 0
	for i in 20:
		var r: Dictionary = MatchDay.play(w, "ACE_TEAM", "POOR_TEAM", _rng(400 + i))["result"]
		runs_vs_ace += int(r["away_score"])    # 에이스가 던진 이닝의 실점
		runs_vs_poor += int(r["home_score"])   # 약체가 던진 이닝의 실점
	assert_int(runs_vs_ace).override_failure_message(
		"에이스 상대 %d점 · 약체 상대 %d점 — 투수 능력치가 안 넘어간다"
		% [runs_vs_ace, runs_vs_poor]).is_less(runs_vs_poor)


## ⚠ **스태미나를 안 넘기면 투수가 무한정 던진다.** 실점이 아니라
## **투구 수**로 드러난다 — 지친 투수가 안 흔들리기 때문이다
func test_stamina_reaches_the_engine() -> void:
	var p: Dictionary = MatchDay._pitcher({"id": "X",
		"pitching": {"stamina": 88.0, "velocity": 60.0, "command": 60.0,
			"control": 60.0, "movement": 60.0, "mentality": 60.0,
			"clutch": 60.0, "hold_runners": 60.0}})
	assert_float(p["stamina_cap"]).override_failure_message(
		"스태미나 88을 넘겼는데 엔진엔 %.0f" % p["stamina_cap"]).is_equal(88.0)


# ── 내 등판 판정 ──────────────────────────────────────────────

func _my_world() -> Dictionary:
	var roster: Array = _roster(5, 20)
	roster.append({"id": "ME", "position": "SP",
		"pitching": {"ovr": 99.0, "stamina": 60.0, "velocity": 60.0,
			"command": 60.0, "control": 60.0, "movement": 60.0,
			"mentality": 60.0, "clutch": 50.0, "hold_runners": 50.0},
		"batting": {"ovr": 20.0, "contact": 20.0, "power": 20.0, "eye": 20.0,
			"discipline": 20.0, "speed": 20.0, "base_instinct": 20.0,
			"batting_clutch": 20.0}})
	return {"rosters": {"T1": roster}}


func _g(id: String, home: String = "T1", away: String = "T2") -> Dictionary:
	return {"id": id, "day": 1, "league_id": "LEAGUE_KBL",
		"home": home, "away": away, "result": null}


## ⚠ **선발은 로테이션 차례에만 나온다.** 5인 로테이션 1위면 0·5·10번째다
func test_a_starter_pitches_on_its_turn_only() -> void:
	var w: Dictionary = _my_world()
	for n in 10:
		var want: bool = (n % 5 == 0)
		assert_bool(MatchDay.is_my_start(w, _g("G%d" % n), "ME", "T1", n, 1, "SP")) \
			.override_failure_message("%d번째 경기 등판 판정이 틀렸다" % n).is_equal(want)


## ⚠ **선발이 불펜 판정을 또 받으면 등판이 부푼다.** 실측 20경기 중 17번
## (로테이션은 7번)
func test_a_starter_never_pitches_off_its_turn() -> void:
	var w: Dictionary = _my_world()
	var off: int = 0
	for n in 50:
		if n % 5 == 0:
			continue
		if MatchDay.is_my_start(w, _g("G%d" % n), "ME", "T1", n, 1, "SP"):
			off += 1
	assert_int(off).override_failure_message(
		"차례가 아닌데 %d번 등판했다" % off).is_equal(0)


## ⚠ **불펜은 로테이션 밖에서도 나온다.** 안 나오면 시즌 내내 등판 0이다
func test_a_reliever_pitches_off_the_rotation() -> void:
	var w: Dictionary = _my_world()
	var n_pitched: int = 0
	for n in 50:
		if MatchDay.is_my_start(w, _g("G%d" % n), "RP_ME", "T1", n, 7, "RP"):
			n_pitched += 1
	assert_int(n_pitched).override_failure_message(
		"불펜이 50경기 중 %d번 등판 — 중간계투는 17번쯤이다" % n_pitched) \
		.is_between(10, 25)


## 남의 경기엔 안 나온다
func test_i_do_not_pitch_in_other_teams_games() -> void:
	var w: Dictionary = _my_world()
	assert_bool(MatchDay.is_my_start(w, _g("G1", "T3", "T4"), "ME", "T1", 0, 1, "SP")) \
		.is_false()


## ⚠ **같은 씨앗이면 같은 판정.** 02는 불펜에 `thread_rng()`를 써서 매번 달랐다
func test_the_relief_call_is_reproducible() -> void:
	var w: Dictionary = _my_world()
	for n in 20:
		var a: bool = MatchDay.is_my_start(w, _g("G%d" % n), "RP_ME", "T1", n, 7, "RP")
		var b: bool = MatchDay.is_my_start(w, _g("G%d" % n), "RP_ME", "T1", n, 7, "RP")
		assert_bool(b).is_equal(a)


## ⚠ **하루치를 돌리면 팀별 순번이 늘어 로테이션이 실제로 돈다.**
## 안 늘면 에이스가 전 경기를 던진다
func test_starters_change_across_days() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"team_id": "TEAM_HS_AEWOL"})
	var team: String = World.teams_of("LEAGUE_KBL")[0]["id"]

	# ⚠ **그 팀이 실제로 경기하는 날만 센다.** 일정이 성기게 퍼져 있어서
	# 날짜를 세면 그 팀이 안 뛰는 날이 섞인다 — 처음에 그렇게 써서 헛짚었다
	var my_days: Array = []
	for g in s["schedule"]:
		if g["home"] == team or g["away"] == team:
			var d: int = int(g["day"])
			if not my_days.has(d):
				my_days.append(d)
	my_days.sort()

	var seen: Dictionary = {}
	for i in 5:
		var day: int = my_days[i]
		var counts: Dictionary = MatchDay.team_game_counts(s, day)
		var sp: Dictionary = MatchDay.starter_of(
			World.roster_of(s["world"], team), "LEAGUE_KBL", int(counts.get(team, 0)))
		seen[sp.get("id", "")] = true
		MatchDay.play_day(s, day, _rng(day))
	assert_int(seen.size()).override_failure_message(
		"첫 다섯 경기에 선발이 %d명뿐 — 5인 로테이션이면 다섯이다" % seen.size()) \
		.is_equal(5)


## ⚠ **`play_day`가 실제로 순번을 넘기는지는 결과로 봐야 한다.**
## `starter_of`를 직접 부르는 검사는 그 배선을 안 본다 — 실제로 변이 셋이
## 그렇게 빠져나갔다.
##
## 돌린 경기의 투수 줄에 실린 id가 로테이션대로 바뀌어야 한다
func test_play_day_actually_rotates_the_starters() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"team_id": "TEAM_HS_AEWOL"})
	var team: String = World.teams_of("LEAGUE_KBL")[0]["id"]

	var my_days: Array = []
	for g in s["schedule"]:
		if g["home"] == team or g["away"] == team:
			var d: int = int(g["day"])
			if not my_days.has(d):
				my_days.append(d)
	my_days.sort()

	var seen: Dictionary = {}
	for i in 5:
		var day: int = my_days[i]
		MatchDay.play_day(s, day, _rng(day))
		for g in s["schedule"]:
			if int(g["day"]) != day:
				continue
			if g["home"] != team and g["away"] != team:
				continue
			var res = g.get("result", null)
			if res == null:
				continue
			# 홈이면 첫 투수 줄, 원정이면 둘째
			var idx: int = 0 if g["home"] == team else 1
			var pitchers: Array = []
			for l in res["player_lines"]:
				if l["role"] == "pitcher":
					pitchers.append(l["player_id"])
			if pitchers.size() > idx:
				seen[pitchers[idx]] = true

	assert_int(seen.size()).override_failure_message(
		"다섯 경기에 선발이 %d명뿐 — `play_day`가 순번을 안 넘긴다" % seen.size()) \
		.is_equal(5)


## ⚠ **홈·원정이 각자 순번을 쓴다.** 하나로 쓰면 두 팀 로테이션이 같이 돌아
## 늘 같은 짝이 붙는다 — 맞대결에서 매번 같은 투수전이 된다
func test_home_and_away_use_their_own_game_numbers() -> void:
	# ⚠ **양 팀 id를 갈라야 한다.** 같은 로스터를 두 번 쓰면 홈·원정 투수가
	# 같은 이름이라 순번이 섞여도 안 보인다 — 처음에 그렇게 써서 못 잡았다
	var away: Array = []
	for p in _roster(5, 20):
		var q: Dictionary = p.duplicate(true)
		q["id"] = "A_" + String(p["id"])
		away.append(q)
	var w: Dictionary = {"rosters": {"H": _roster(5, 20), "A": away}}
	var pairs: Dictionary = {}
	for n in 5:
		var out: Dictionary = MatchDay.play(w, "H", "A", _rng(n), {
			"league_id": "LEAGUE_KBL",
			"home_game_no": n,
			"away_game_no": 0,   # 원정은 늘 1선발
		})
		# ⚠ **교체가 붙어 투수가 여럿이다.** 줄 순서로 선발을 판정하면 안 된다 —
		# 로테이션에 직접 물어본다
		var home_starter: String = MatchDay.starter_of(
			w["rosters"]["H"], "LEAGUE_KBL", n).get("id", "")
		var away_starter: String = MatchDay.starter_of(away, "LEAGUE_KBL", 0).get("id", "")
		pairs["%s|%s" % [home_starter, away_starter]] = true

		# ⚠ **원정은 순번을 0으로 고정했으니 늘 1선발이어야 한다.** 짝의
		# 가짓수만 세면 둘이 나란히 바뀌어도 5가지라 안 걸린다
		assert_str(away_starter).override_failure_message(
			"원정 순번을 0으로 고정했는데 %d번째 경기에 %s가 나왔다" % [n, away_starter]) \
			.is_equal("A_P4")

		# 그 선발이 실제로 그 경기에 나왔는지도 본다 — 판정만 맞고 안 나오면
		# 뜻이 없다(불펜 주인공이 그랬다)
		var appeared: Array = []
		for l in out["result"]["player_lines"]:
			if l["role"] == "pitcher":
				appeared.append(l["player_id"])
		assert_array(appeared).override_failure_message(
			"선발 %s·%s가 경기에 안 나왔다" % [home_starter, away_starter]) \
			.contains([home_starter, away_starter])
	assert_int(pairs.size()).override_failure_message(
		"홈 순번을 바꿔도 짝이 %d가지뿐 — 순번을 따로 안 쓴다" % pairs.size()) \
		.is_equal(5)
