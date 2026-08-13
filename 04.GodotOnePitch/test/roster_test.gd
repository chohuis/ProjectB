extends GdUnitTestSuite

## 로스터 편성 — 로테이션·불펜·라인업. M3-1.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/utils/rosterEngine.ts`
## 원본 검사: `__tests__/rotationIndex.test.ts`
##
## ⚠ **인자를 사전으로 받는다.** 지난 세션 결함이 위치 인자 10개 중 하나가
## 한 칸 밀려 들어간 것이었다 — 둘 다 number라 조용히 통과했고 로테이션이
## 통째로 안 돌았다. 소스 문자열 검사로는 못 잡았다.


func _pitcher(id: String, team: String, pos: String, ovr: int, o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"id": id, "team_id": team, "role": "player", "status": "active",
		"player_type": "pitcher", "position": pos,
		"pitching": {"ovr": ovr}, "batting": {"ovr": 20},
	}
	d.merge(o, true)
	return d


func _batter(id: String, team: String, pos: String, ovr: int, o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"id": id, "team_id": team, "role": "player", "status": "active",
		"player_type": "batter", "position": pos,
		"batting": {"ovr": ovr, "eye": 50, "speed": 50, "power": 50, "contact": 50},
	}
	d.merge(o, true)
	return d


## SP 8명 · RP 4명 · CP 1명 · 야수 9명
func _team(team: String = "T") -> Array:
	var out: Array = []
	for i in 8:
		out.append(_pitcher("SP%d" % i, team, "SP", 80 - i * 3))
	for i in 4:
		out.append(_pitcher("RP%d" % i, team, "RP", 70 - i * 2))
	out.append(_pitcher("CP0", team, "CP", 74))
	var positions: Array = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"]
	for i in positions.size():
		out.append(_batter("B%d" % i, team, positions[i], 70 - i))
	return out


func _params(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"team_id": "T", "entities": _team(), "league_id": "LEAGUE_KBL",
		"max_rotation": 5, "conditions": {}, "current_week": 0,
		"team_game_count": 0, "rot_idx": 0, "rotation_sense": 50,
		"injuries": {}, "retired": [],
	}
	d.merge(o, true)
	return d


# ── 리그별 상수 ────────────────────────────────────────────────────

func test_rotation_size_by_league() -> void:
	assert_int(Roster.rotation_size_for_league("LEAGUE_HIGHSCHOOL")).is_equal(3)
	assert_int(Roster.rotation_size_for_league("LEAGUE_UNIVERSITY")).is_equal(3)
	assert_int(Roster.rotation_size_for_league("LEAGUE_INDEPENDENT")).is_equal(4)
	assert_int(Roster.rotation_size_for_league("LEAGUE_KBL")).is_equal(5)


func test_foreign_leagues_use_the_pro_rules() -> void:
	# ⚠ **"KBL이 아니면 프로"로 갈라야 한다.** 리그를 하나씩 적으면 ABL·JBL이
	# 빠지고, 그 리그만 다른 규칙으로 돈다 — 02에서 승강·FA가 그래서
	# `LEAGUE_KBL`에만 걸려 있었고 해외 로스터가 상한 34에 41명까지 불었다
	for lid in ["LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]:
		assert_int(Roster.rotation_size_for_league(lid)).is_equal(5)
		assert_int(Roster.rotation_rest_games(lid)).is_equal(4)


func test_amateur_leagues_rest_less() -> void:
	assert_int(Roster.rotation_rest_games("LEAGUE_HIGHSCHOOL")).is_equal(2)
	assert_int(Roster.rotation_rest_games("LEAGUE_KBL")).is_equal(4)


# ── 로테이션은 고정이다 ────────────────────────────────────────────

func test_the_rotation_takes_the_best_starters() -> void:
	var rot: Array = Roster.team_rotation(_params())
	assert_int(rot.size()).is_equal(5)
	assert_array(rot).is_equal(["SP0", "SP1", "SP2", "SP3", "SP4"])


func test_the_rotation_does_not_move_with_condition() -> void:
	# ⚠ **이게 M3의 핵심이다.** 예전엔 매 경기 "휴식 완료된 SP를 컨디션 반영
	# OVR 순"으로 다시 뽑았다. 그 값은 매주 흔들리므로 **상위 5명 집합이 계속
	# 바뀐다** — SP가 12명이면 12명이 돌아가며 각자 7~12번만 던졌다.
	#
	# 실제 야구는 로테이션이 시즌 내내 고정이고 5명이 각자 28번 던진다.
	# 표본이 4배 두꺼워야 ERA가 능력치를 반영한다 — 실측 OVR–ERA 상관이
	# 선발 61명일 때 −0.63인데 96명일 때 **+0.12**(양수)까지 갔다
	var tired: Dictionary = {}
	for i in 5:
		tired["SP%d" % i] = {"fatigue": 20, "last_pitched_week": 9,
			"last_start_game_count": 9, "last_appearance_game_count": 9,
			"consecutive_appearances": 0}
	var rot: Array = Roster.team_rotation(_params({"conditions": tired, "current_week": 10}))
	assert_array(rot).is_equal(["SP0", "SP1", "SP2", "SP3", "SP4"])


func test_the_rotation_shrinks_for_amateur_leagues() -> void:
	var rot: Array = Roster.team_rotation(_params({"max_rotation": 3}))
	assert_int(rot.size()).is_equal(3)


func test_injured_starters_drop_out() -> void:
	var inj: Dictionary = {"SP0": {"severity": "severe", "is_playing_through": false}}
	var rot: Array = Roster.team_rotation(_params({"injuries": inj}))
	assert_bool(rot.has("SP0")).is_false()
	assert_int(rot.size()).is_equal(5)


func test_playing_through_an_injury_costs_ovr() -> void:
	# 가벼운 부상은 강행할 수 있다. 다만 능력이 깎여 순위가 내려간다.
	# 80 × 0.88 = 70 → SP3(71) 아래, SP4(68) 위
	var light: Dictionary = {"SP0": {"severity": "light", "is_playing_through": true}}
	var rot: Array = Roster.team_rotation(_params({"injuries": light}))
	assert_bool(rot.has("SP0")).is_true()
	assert_str(rot[0]).is_equal("SP1")
	assert_int(rot.find("SP0")).is_equal(3)


func test_a_heavy_injury_pushes_a_starter_out_of_the_rotation() -> void:
	# 80 × 0.70 = 56 → 선발 여덟 중 꼴찌라 로테이션에서 빠진다.
	# **자리를 비우지 않고 다음 선수가 들어온다**
	var heavy: Dictionary = {"SP0": {"severity": "moderate", "is_playing_through": true}}
	var rot: Array = Roster.team_rotation(_params({"injuries": heavy}))
	assert_bool(rot.has("SP0")).is_false()
	assert_int(rot.size()).is_equal(5)
	assert_array(rot).is_equal(["SP1", "SP2", "SP3", "SP4", "SP5"])


func test_retired_players_are_gone() -> void:
	var rot: Array = Roster.team_rotation(_params({"retired": ["SP0", "SP1"]}))
	assert_bool(rot.has("SP0")).is_false()
	assert_str(rot[0]).is_equal("SP2")


func test_relievers_fill_a_short_rotation() -> void:
	# SP가 셋뿐인 팀
	var thin: Array = []
	for i in 3:
		thin.append(_pitcher("SP%d" % i, "T", "SP", 70))
	for i in 4:
		thin.append(_pitcher("RP%d" % i, "T", "RP", 60 - i))
	var r: Dictionary = Roster.build(_params({"entities": thin}))
	assert_int(r["rotation"].size()).is_equal(5)
	assert_bool(r["rotation"].has("RP0")).is_true()
	# ⚠ 로테이션에 들어간 불펜은 불펜 목록에서 빠져야 한다. 남으면 같은
	# 투수가 선발로도 구원으로도 계산된다.
	#
	# **1번이 아니라 2번을 본다.** 1번은 빠져도 그 투수가 마무리가 되면서
	# 불펜 목록에서 사라지므로, 가드를 없애도 검사가 통과한다
	for id in r["rotation"]:
		assert_bool(r["bullpen"].has(id)).is_false()
		assert_str(r["closer"]).is_not_equal(id)
	assert_bool(r["rotation"].has("RP1")).is_true()
	assert_bool(r["bullpen"].has("RP1")).is_false()


# ── 회전 — 지난 세션 결함 ──────────────────────────────────────────

func test_the_rotation_turns_game_to_game() -> void:
	# ⚠ **명단은 고정이고 회전은 여기서 한다.** 회전을 안 하면 1번 선발이
	# 매 경기 나간다. 지난 세션에 인자가 한 칸 밀려 회전값이 버려졌고,
	# 둘 다 number라 조용히 통과했다
	assert_str(Roster.build(_params({"rot_idx": 0}))["rotation"][0]).is_equal("SP0")
	assert_str(Roster.build(_params({"rot_idx": 1}))["rotation"][0]).is_equal("SP1")
	assert_str(Roster.build(_params({"rot_idx": 4}))["rotation"][0]).is_equal("SP4")


func test_the_rotation_wraps_around() -> void:
	assert_str(Roster.build(_params({"rot_idx": 5}))["rotation"][0]).is_equal("SP0")
	assert_str(Roster.build(_params({"rot_idx": 7}))["rotation"][0]).is_equal("SP2")


func test_turning_keeps_everyone_in_the_rotation() -> void:
	# 회전은 순서만 바꾼다 — 빠지는 사람이 있으면 그만큼 등판이 사라진다
	var turned: Array = Roster.build(_params({"rot_idx": 3}))["rotation"]
	assert_int(turned.size()).is_equal(5)
	for id in ["SP0", "SP1", "SP2", "SP3", "SP4"]:
		assert_bool(turned.has(id)).is_true()


func test_every_starter_gets_the_ball_over_a_cycle() -> void:
	# ⚠ 한 바퀴를 돌면 다섯이 각자 한 번씩 선발이어야 한다. 이게 깨지면
	# 이닝이 몇 명에게 쏠리고 ERA가 능력치를 못 따라간다
	var seen: Dictionary = {}
	for g in 5:
		seen[Roster.build(_params({"rot_idx": g}))["rotation"][0]] = true
	assert_int(seen.size()).is_equal(5)


# ── 불펜·마무리 ────────────────────────────────────────────────────

func test_the_closer_is_the_cp() -> void:
	assert_str(Roster.build(_params())["closer"]).is_equal("CP0")


func test_a_team_without_a_cp_still_gets_a_closer() -> void:
	# ⚠ **마무리가 비면 세이브가 리그 전체에서 0이 된다.** 호출측이 마무리
	# 없이 넘기면 엔진이 세이브를 안 붙이고, 오류도 없이 조용히 사라진다 —
	# 실측 규정투수 94~110명 전원의 sv가 0이었다.
	# 실제 구단도 마무리가 없으면 제일 좋은 불펜을 쓴다
	var no_cp: Array = []
	for e in _team():
		if e["id"] != "CP0":
			no_cp.append(e)
	var r: Dictionary = Roster.build(_params({"entities": no_cp}))
	assert_str(r["closer"]).is_not_empty()
	assert_str(r["closer"]).is_equal("RP0")
	# ⚠ 마무리는 불펜 목록에서 빠진다. 남으면 같은 투수가 두 번 계산된다
	assert_bool(r["bullpen"].has("RP0")).is_false()


func test_the_closer_is_not_in_the_rotation() -> void:
	var r: Dictionary = Roster.build(_params())
	assert_bool(r["rotation"].has(r["closer"])).is_false()


func test_a_reliever_who_worked_twice_is_out_of_the_bullpen() -> void:
	# ⚠ 마무리를 살려둔 채로 본다. 마무리까지 쉬게 하면 그 투수가 대신
	# 마무리가 되면서 불펜에서 빠지고, **연투 제한을 없애도 검사가 통과한다**
	var r: Dictionary = Roster.build(_params({"conditions": {"RP0": {"consecutive_appearances": 2}}}))
	assert_str(r["closer"]).is_equal("CP0")
	assert_bool(r["bullpen"].has("RP0")).is_false()
	assert_bool(r["bullpen"].has("RP1")).is_true()


func test_a_closer_who_worked_three_times_hands_it_over() -> void:
	var cond: Dictionary = {"CP0": {"consecutive_appearances": 3}}
	var r: Dictionary = Roster.build(_params({"conditions": cond}))
	# CP가 쉬면 다른 투수가 마무리를 맡는다 — 자리를 비우지 않는다
	assert_str(r["closer"]).is_not_empty()
	assert_str(r["closer"]).is_not_equal("CP0")


func test_a_cp_at_two_outings_can_still_pitch() -> void:
	var r: Dictionary = Roster.build(_params({"conditions": {"CP0": {"consecutive_appearances": 2}}}))
	assert_str(r["closer"]).is_equal("CP0")


func test_the_bullpen_excludes_the_rotation() -> void:
	var r: Dictionary = Roster.build(_params())
	for id in r["rotation"]:
		assert_bool(r["bullpen"].has(id)).is_false()


# ── 라인업 ─────────────────────────────────────────────────────────

func test_the_lineup_is_nine() -> void:
	assert_int(Roster.build(_params())["lineup"].size()).is_equal(9)


func test_a_short_lineup_is_filled_with_whoever_is_left() -> void:
	# ⚠ **9명을 못 채우면 남은 타자의 타석이 부푼다.** 타순을 `lineup[i % n]`으로
	# 도는데 n=6이면 한 바퀴가 짧아져 타석이 1.5배가 되고, **능력치가 아니라
	# 출전량이 성적을 만든다** — 실측 경기당 7.1타석(정상 4.7), OVR–ERA 상관
	# −0.5 → −0.25.
	#
	# 예전엔 야수가 **0명일 때만** 폴백했다. 8명이면 8명짜리 라인업이 그대로
	# 나갔고 아무 신호도 없었다. 실제 야구도 모자라면 투수를 세운다
	var thin: Array = []
	for i in 6:
		thin.append(_batter("B%d" % i, "T", ["C", "1B", "2B", "3B", "SS", "LF"][i], 70))
	for i in 6:
		thin.append(_pitcher("SP%d" % i, "T", "SP", 70))
	var lineup: Array = Roster.build(_params({"entities": thin}))["lineup"]
	assert_int(lineup.size()).is_equal(9)


func test_the_lineup_is_never_longer_than_nine() -> void:
	# ⚠ 자리 후보가 아홉보다 많은 팀으로 본다. 딱 아홉인 팀만 보면 상한을
	# 없애도 검사가 통과한다
	var deep: Array = _team()
	deep.append(_batter("UT0", "T", "UT", 66))
	assert_int(Roster.build(_params({"entities": deep}))["lineup"].size()).is_equal(9)


func test_the_lineup_has_no_duplicates() -> void:
	# 같은 선수가 두 번 나오면 그 선수 타석이 두 배가 된다
	var thin: Array = []
	for i in 6:
		thin.append(_batter("B%d" % i, "T", ["C", "1B", "2B", "3B", "SS", "LF"][i], 70))
	for i in 6:
		thin.append(_pitcher("SP%d" % i, "T", "SP", 70))
	# ⚠ **자리가 모자라 남은 선수로 메우는 쪽이 위험하다.** 거기서 중복이
	# 생기면 이미 뽑힌 타자가 다시 들어간다
	for entities in [_team(), thin]:
		var seen: Dictionary = {}
		for id in Roster.build(_params({"entities": entities}))["lineup"]:
			assert_bool(seen.has(id)).is_false()
			seen[id] = true


func test_the_lineup_prefers_one_per_position() -> void:
	# 포수 둘에 유격수 0명이면 수비가 성립하지 않는다
	var lineup: Array = Roster.build(_params())["lineup"]
	assert_bool(lineup.has("B0")).is_true()   # C
	assert_bool(lineup.has("B4")).is_true()   # SS


func test_the_leadoff_gets_on_base() -> void:
	# 1번은 눈·발, 3·4번은 힘·컨택 — 타순이 능력을 따라야 한다
	#
	# ⚠ **힘꾼을 자리 우선순위의 맨 뒤(RF)에 둔다.** 앞쪽에 두면 정렬을
	# 없애도 우연히 앞에 남아서 검사가 통과한다
	var team: Array = _team()
	for e in team:
		if e["id"] == "B8":       # DH — 눈·발
			e["batting"] = {"ovr": 70, "eye": 95, "speed": 95, "power": 20, "contact": 20}
		elif e["id"] == "B7":     # RF — 힘·컨택, 자리 순서로는 맨 뒤
			e["batting"] = {"ovr": 70, "eye": 20, "speed": 20, "power": 95, "contact": 95}
	var lineup: Array = Roster.build(_params({"entities": team}))["lineup"]
	assert_str(lineup[0]).is_equal("B8")
	# 힘꾼이 중심 타선으로 올라온다
	assert_int(lineup.find("B7")).is_equal(1)


# ── 다른 팀·상태 ───────────────────────────────────────────────────

func test_only_this_team_is_used() -> void:
	var both: Array = _team("T")
	both.append_array(_team("OTHER"))
	for id in Roster.build(_params({"entities": both}))["rotation"]:
		assert_bool(id.begins_with("SP")).is_true()
	# 다른 팀 선수가 섞이면 로스터가 통째로 이상해진다
	assert_int(Roster.team_players({"team_id": "T", "entities": both}).size()).is_equal(22)


func test_non_players_are_ignored() -> void:
	var mixed: Array = _team()
	mixed.append({"id": "COACH1", "team_id": "T", "role": "staff", "status": "active"})
	assert_int(Roster.team_players({"team_id": "T", "entities": mixed}).size()).is_equal(22)


func test_players_away_on_service_are_not_on_the_roster() -> void:
	# 복무 중인 선수는 소속 팀에 안 뜬다 — 상무 로스터에서만 보인다
	var team: Array = _team()
	team[0]["status"] = "military"
	assert_bool(Roster.build(_params({"entities": team}))["rotation"].has("SP0")).is_false()
