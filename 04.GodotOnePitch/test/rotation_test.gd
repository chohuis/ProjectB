extends GdUnitTestSuite

## 로테이션 — M3-2. **선발을 돌려 다음 등판을 정한다.**
##
## 원본: `rosterEngine.ts`의 `teamRotation` · `rotationIndex.test.ts`
##
## ⚠ **`rotationIndex.test.ts`에서 인자 자리가 밀린 결함이 나왔다.**
## 소스 정규식으로는 못 잡았고 **함수를 직접 부른 검사**가 잡았다 —
## 여기서도 그렇게 본다.
##
## ⚠ **주인공이 팀 경기를 다 던지면 안 된다.** 붙이기 전에는 고교 20경기를
## 전부 등판했다 — 실제 로테이션은 셋이라 일곱 번쯤 던진다.


func _p(id: String, pos: String, ovr: float) -> Dictionary:
	return {"id": id, "name": id, "position": pos,
		"player_type": "pitcher" if PlayerGen.is_pitcher(pos) else "batter",
		"pitching": {"ovr": ovr}, "batting": {"ovr": 40.0}}


func _roster(sp: int, rp: int = 3, bat: int = 12) -> Array:
	var out: Array = []
	for i in sp:
		out.append(_p("SP%d" % i, "SP", 70.0 - i))
	for i in rp:
		out.append(_p("RP%d" % i, "RP", 60.0 - i))
	for i in bat:
		out.append(_p("B%d" % i, "1B", 30.0))
	return out


# ── 로테이션을 짜는가 ─────────────────────────────────────────

## ⚠ **리그마다 로테이션이 다르다.** 고교·대학 3인, 독립 4인, 프로 5인
func test_the_rotation_size_follows_the_league() -> void:
	assert_int(Rotation.size_of("LEAGUE_HIGHSCHOOL")).is_equal(3)
	assert_int(Rotation.size_of("LEAGUE_UNIVERSITY")).is_equal(3)
	assert_int(Rotation.size_of("LEAGUE_INDEPENDENT")).is_equal(4)
	assert_int(Rotation.size_of("LEAGUE_KBL")).is_equal(5)
	assert_int(Rotation.size_of("LEAGUE_ABL")).is_equal(5)


## ⚠ **센 선발부터 넣는다.** 컨디션으로 뽑으면 로테이션이 매 경기 바뀐다 —
## 실측 OVR–ERA 상관이 선발 61명일 때 −0.63인데 96명일 때 **+0.12**까지 갔다
func test_the_rotation_takes_the_best_starters() -> void:
	var r: Array = Rotation.build(_roster(6), "LEAGUE_KBL")
	assert_array(r).is_equal(["SP0", "SP1", "SP2", "SP3", "SP4"])


func test_a_short_roster_fills_from_the_bullpen() -> void:
	var r: Array = Rotation.build(_roster(2), "LEAGUE_KBL")
	assert_int(r.size()).is_equal(5)
	assert_str(r[0]).is_equal("SP0")
	assert_bool(r.has("RP0")).override_failure_message(
		"선발이 모자란데 불펜에서 안 채웠다").is_true()


## 투수가 아예 모자라면 있는 만큼만 — 억지로 야수를 넣지 않는다
func test_a_roster_without_enough_pitchers_gives_what_it_has() -> void:
	var r: Array = Rotation.build(_roster(1, 0), "LEAGUE_KBL")
	assert_int(r.size()).is_equal(1)
	assert_str(r[0]).is_equal("SP0")


func test_no_pitchers_gives_an_empty_rotation() -> void:
	assert_array(Rotation.build(_roster(0, 0), "LEAGUE_KBL")).is_empty()


# ── 돌아가는가 ────────────────────────────────────────────────

## ⚠ **경기 순번으로 정한다.** 인덱스를 상태에 들고 있으면 저장·불러오기와
## 어긋나고, 하루 진행과 여러 날 진행이 달라진다
func test_the_starter_rotates_by_game_number() -> void:
	var r: Array = ["A", "B", "C"]
	assert_str(Rotation.starter_at(r, 0)).is_equal("A")
	assert_str(Rotation.starter_at(r, 1)).is_equal("B")
	assert_str(Rotation.starter_at(r, 2)).is_equal("C")
	assert_str(Rotation.starter_at(r, 3)).is_equal("A")


func test_an_empty_rotation_has_no_starter() -> void:
	assert_str(Rotation.starter_at([], 5)).is_empty()


## ⚠ **경기 번호가 음수여도 죽지 않는다.** GDScript의 `%`는 음수에서
## 음수를 준다 — 배열 색인이 되면 뒤에서부터 잡힌다
func test_a_negative_game_number_still_picks_someone() -> void:
	assert_str(Rotation.starter_at(["A", "B", "C"], -1)).is_not_empty()


# ── 몇 번 던지나 ──────────────────────────────────────────────

## ⚠ **이게 이 모듈의 존재 이유다.** 붙이기 전에는 고교 20경기를 다 던졌다.
## 3인 로테이션이면 일곱 번쯤이다
func test_a_high_school_ace_starts_about_a_third() -> void:
	var r: Array = Rotation.build(_roster(4), "LEAGUE_HIGHSCHOOL")
	var mine: int = 0
	for g in 20:
		if Rotation.starter_at(r, g) == "SP0":
			mine += 1
	assert_int(mine).override_failure_message(
		"20경기 중 %d번 등판 — 3인 로테이션이면 7번쯤이다" % mine).is_between(6, 8)


func test_a_pro_ace_starts_about_a_fifth() -> void:
	var r: Array = Rotation.build(_roster(6), "LEAGUE_KBL")
	var mine: int = 0
	for g in 144:
		if Rotation.starter_at(r, g) == "SP0":
			mine += 1
	assert_int(mine).override_failure_message(
		"144경기 중 %d번 등판 — 5인 로테이션이면 29번쯤이다" % mine).is_between(28, 30)


## ⚠ **등판이 고르게 나뉜다.** 한 명에게 몰리면 그 투수만 지치고 나머지는
## 표본이 얇아 ERA가 운에 흔들린다
func test_starts_are_spread_evenly() -> void:
	var r: Array = Rotation.build(_roster(6), "LEAGUE_KBL")
	var counts: Dictionary = {}
	for g in 145:
		var id: String = Rotation.starter_at(r, g)
		counts[id] = int(counts.get(id, 0)) + 1
	for id in counts:
		assert_int(counts[id]).override_failure_message(
			"%s가 145경기 중 %d번 — 5인이면 29번쯤이다" % [id, counts[id]]) \
			.is_between(28, 30)


# ── 보직 배정 ─────────────────────────────────────────────────

## ⚠ **로테이션 인원과 맞물린다.** 고교 3인이면 "나보다 센 투수 둘 이하"가
## 곧 팀 3위 안이다 — 어긋나면 선발로 배정됐는데 로테이션엔 못 드는
## 선수가 생기고, 그러면 **한 경기도 못 던진다**
func test_top_three_pitchers_become_starters() -> void:
	assert_str(Rotation.assign_position(70.0, [80.0, 75.0])).is_equal("SP")
	assert_str(Rotation.assign_position(70.0, [80.0, 75.0, 72.0])).is_equal("RP")


func test_the_ace_is_a_starter() -> void:
	assert_str(Rotation.assign_position(90.0, [80.0, 75.0, 72.0, 60.0])).is_equal("SP")


func test_a_lone_pitcher_is_a_starter() -> void:
	assert_str(Rotation.assign_position(50.0, [])).is_equal("SP")


## ⚠ **배정과 로테이션이 같은 답을 내야 한다.** 둘이 갈리면 선발로
## 배정됐는데 등판을 못 한다
func test_assignment_and_rotation_agree() -> void:
	var roster: Array = _roster(6, 0, 0)
	var rot: Array = Rotation.build(roster, "LEAGUE_HIGHSCHOOL")
	for p in roster:
		var others: Array = []
		for q in roster:
			if q["id"] != p["id"]:
				others.append(q["pitching"]["ovr"])
		var pos: String = Rotation.assign_position(p["pitching"]["ovr"], others)
		if pos == "SP":
			assert_bool(rot.has(p["id"])).override_failure_message(
				"%s가 선발로 배정됐는데 로테이션에 없다" % p["id"]).is_true()


# ── 불펜 등판 ─────────────────────────────────────────────────

## ⚠ **로테이션에 못 들어도 나온다.** 아니면 주인공이 시즌 내내 한 경기도
## 못 던진다 — 실제로 그 상태가 나왔다
func test_a_reliever_pitches_sometimes() -> void:
	var yes: int = 0
	for i in 100:
		if Rotation.reliever_would_pitch({"role": "중간계투",
				"roll": float(i) / 100.0}):
			yes += 1
	# 중간계투는 0.35
	assert_int(yes).override_failure_message(
		"100경기 중 %d번 등판 — 중간계투는 35번쯤이다" % yes).is_between(33, 37)


func test_the_closer_pitches_more_often() -> void:
	var closer: int = 0
	var long: int = 0
	for i in 100:
		var r: float = float(i) / 100.0
		if Rotation.reliever_would_pitch({"role": "마무리", "roll": r}):
			closer += 1
		if Rotation.reliever_would_pitch({"role": "롱릴리프", "roll": r}):
			long += 1
	assert_int(closer).is_greater(long)


func test_an_unknown_role_never_pitches() -> void:
	assert_bool(Rotation.reliever_would_pitch({"role": "없는역할", "roll": 0.0})) \
		.is_false()


## ⚠ **많이 던진 다음 경기엔 거의 안 나온다.** 없으면 불펜이 매 경기 나와
## 시즌 내내 지쳐 있다
func test_a_heavy_outing_blocks_the_next_game() -> void:
	var fresh: int = 0
	var tired: int = 0
	for i in 100:
		var r: float = float(i) / 100.0
		if Rotation.reliever_would_pitch({"role": "중간계투", "roll": r, "outs_last": 0}):
			fresh += 1
		if Rotation.reliever_would_pitch({"role": "중간계투", "roll": r, "outs_last": 21}):
			tired += 1
	assert_int(tired).is_less(fresh)


## ⚠ **의무 휴식은 하루 단위다.** 02는 주 단위라 불펜이 한 주에 두 번 못
## 나오고, 반대로 주말 연투(토→일)는 못 막았다
func test_mandatory_rest_is_counted_in_days() -> void:
	assert_int(Rotation.required_rest_days(0)).is_equal(0)
	assert_int(Rotation.required_rest_days(20)).is_equal(1)
	assert_int(Rotation.required_rest_days(35)).is_equal(2)
	assert_int(Rotation.required_rest_days(60)).is_equal(3)


func test_pitching_too_soon_is_blocked() -> void:
	# 어제 60구를 던졌으면 3일은 쉰다
	assert_bool(Rotation.reliever_would_pitch({"role": "마무리", "roll": 0.0,
		"last_pitch_count": 60, "rest_days": 1})).is_false()
	assert_bool(Rotation.reliever_would_pitch({"role": "마무리", "roll": 0.0,
		"last_pitch_count": 60, "rest_days": 3})).is_true()


## 처음 등판하는 투수는 이전 기록이 없다 — 막히면 안 된다
func test_a_pitcher_with_no_history_can_pitch() -> void:
	assert_bool(Rotation.reliever_would_pitch({"role": "마무리", "roll": 0.0})).is_true()


## ⚠ **선발과 불펜을 가른다.** 안 가르면 능력치 순으로만 뽑혀서, 센 불펜이
## 약한 선발보다 앞선다 — 실제 로테이션은 선발이 우선이다
func test_starters_outrank_stronger_relievers() -> void:
	var roster: Array = [
		{"id": "SP_weak", "position": "SP", "player_type": "pitcher",
			"pitching": {"ovr": 50.0}, "batting": {"ovr": 20.0}},
		{"id": "RP_strong", "position": "RP", "player_type": "pitcher",
			"pitching": {"ovr": 80.0}, "batting": {"ovr": 20.0}},
	]
	var r: Array = Rotation.build(roster, "LEAGUE_HIGHSCHOOL")
	assert_str(r[0]).override_failure_message(
		"약한 선발보다 센 불펜을 먼저 넣었다").is_equal("SP_weak")


## ⚠ **음수 경기 번호에서 죽는다.** GDScript의 `%`는 음수에서 음수를 주고,
## 그게 배열 색인이 되면 **범위 밖 오류**가 난다
func test_a_negative_game_number_does_not_crash() -> void:
	for n in [-1, -3, -7, -100]:
		assert_str(Rotation.starter_at(["A", "B", "C"], n)) \
			.override_failure_message("경기 번호 %d에서 빈 값" % n).is_not_empty()


## ⚠ **역할마다 등판 확률이 다르다.** 같게 두면 마무리가 롱릴리프만큼만
## 나와서 세이브가 리그 전체에서 줄어든다
func test_each_relief_role_has_its_own_chance() -> void:
	var counts: Dictionary = {}
	for role in ["마무리", "셋업맨", "중간계투", "롱릴리프", "스윙맨"]:
		var n: int = 0
		for i in 100:
			if Rotation.reliever_would_pitch({"role": role, "roll": float(i) / 100.0}):
				n += 1
		counts[role] = n
	assert_int(counts["마무리"]).is_greater(counts["셋업맨"])
	assert_int(counts["셋업맨"]).is_greater(counts["중간계투"])
	assert_int(counts["중간계투"]).is_greater(counts["롱릴리프"])
	assert_int(counts["롱릴리프"]).is_greater(counts["스윙맨"])


## ⚠ **기록이 없는 투수를 막으면 시즌 첫 등판이 영영 안 온다**
func test_a_first_appearance_is_never_blocked_by_rest() -> void:
	# 휴식 정보가 아예 없다 — 시즌 첫 경기
	assert_bool(Rotation.reliever_would_pitch({"role": "중간계투", "roll": 0.0})) \
		.override_failure_message("시즌 첫 등판이 휴식 규칙에 막혔다").is_true()


## ⚠ **경계에서 봐야 갈린다.** 60구 후 3일이 필요한데, 1일만 보면
## "하루 덜 쉬고 나온다"는 변이가 그대로 통과한다 — 2일이 갈림길이다
func test_the_rest_boundary_is_exact() -> void:
	for days in [0, 1, 2]:
		assert_bool(Rotation.reliever_would_pitch({"role": "마무리", "roll": 0.0,
			"last_pitch_count": 60, "rest_days": days})) \
			.override_failure_message("60구 후 %d일 쉬고 나왔다 (3일 필요)" % days) \
			.is_false()
	assert_bool(Rotation.reliever_would_pitch({"role": "마무리", "roll": 0.0,
		"last_pitch_count": 60, "rest_days": 3})).is_true()

	# 20구는 하루면 된다
	assert_bool(Rotation.reliever_would_pitch({"role": "마무리", "roll": 0.0,
		"last_pitch_count": 20, "rest_days": 0})).is_false()
	assert_bool(Rotation.reliever_would_pitch({"role": "마무리", "roll": 0.0,
		"last_pitch_count": 20, "rest_days": 1})).is_true()
