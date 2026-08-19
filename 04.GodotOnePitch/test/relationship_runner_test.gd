extends GdUnitTestSuite

## 관계도 배선 — 세계에서 맥락을 모아 관계에 먹인다. B-2.


const TEAM_A: String = "TEAM_A"
const TEAM_B: String = "TEAM_B"
const ME: String = "PLY_PROTAGONIST"


func _mate(id: String, team: String = TEAM_A) -> Dictionary:
	return {"id": id, "name": id, "team_id": team, "career_status": "active",
		"player_type": "batter", "pitching": {"ovr": 40.0}, "batting": {"ovr": 60.0}}


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 70, "season_year": 2026, "seed": 4242,
		"training_plan": {"primary": "TRN_VEL", "secondary": "", "secondary2": ""},
		"schedule": [],
		"protagonist": {"id": ME, "name": "나", "team_id": TEAM_A,
			"player_type": "pitcher", "pitching": {"ovr": 70.0},
			"batting": {"ovr": 40.0}},
		"world": {"rosters": {
			TEAM_A: [_mate("A_1"), _mate("A_2"), _mate("A_3")],
			TEAM_B: [_mate("B_1", TEAM_B), _mate("B_2", TEAM_B)],
		}},
	}
	s.merge(over, true)
	return s


## 그 주(64~70일차)에 치른 주인공 팀 경기 한 판
func _game(day: int, won: bool, over: Dictionary = {}) -> Dictionary:
	var line: Dictionary = {"role": "pitcher", "player_id": ME,
		"ip": 7.0, "er": 2.0}
	line.merge(over.get("line", {}), true)
	var result: Dictionary = {
		"home_score": 5 if won else 1, "away_score": 1 if won else 5,
		"winner_id": TEAM_A if won else TEAM_B,
		"loser_id": TEAM_B if won else TEAM_A,
		"player_lines": [line] if over.get("pitched", true) else [],
	}
	result.merge(over.get("result", {}), true)
	return {"day": day, "home": TEAM_A, "away": TEAM_B, "result": result}


func _ids(rows: Array) -> Array:
	var out: Array = []
	for r in rows:
		out.append(String(r["person_id"]))
	out.sort()
	return out


# ── 소속 맞추기 ───────────────────────────────────────────────

func test_it_meets_the_whole_team() -> void:
	var s: Dictionary = _state()
	var out: Dictionary = RelationshipRunner.reconcile(s, 70)
	assert_int(int(out["created"])).is_equal(3)
	assert_array(_ids(RelationshipRunner.rows_of(s))).is_equal(["A_1", "A_2", "A_3"])
	for r in RelationshipRunner.rows_of(s):
		assert_str(String(r["kind"])).is_equal("teammate")
		assert_str(String(r["contact"])).is_equal("together")
		assert_str(String(r["last_team"])).is_equal(TEAM_A)


## 주인공은 자기 자신과 관계를 맺지 않는다
func test_i_am_not_my_own_teammate() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"][TEAM_A].append({"id": ME, "team_id": TEAM_A,
		"career_status": "active"})
	RelationshipRunner.reconcile(s, 70)
	assert_array(_ids(RelationshipRunner.rows_of(s))).not_contains([ME])


func test_meeting_the_same_people_twice_creates_nothing() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	assert_int(int(RelationshipRunner.reconcile(s, 77)["created"])).is_equal(0)
	assert_int(RelationshipRunner.rows_of(s).size()).is_equal(3)


## ⚠ **팀이 바뀌는 자리마다 훅을 안 박는다.** 주인공 team_id를 바꾸는 곳이
## 최소 다섯이고 하나만 빠뜨려도 관계가 옛 팀에 남는다 — 그 누락은 조용하다.
## "together인데 last_team이 지금 팀이 아니다"를 증거로 읽는다
func test_a_move_is_noticed_without_a_hook() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	for r in RelationshipRunner.rows_of(s):
		r["value"] = 50

	# 아무 훅도 안 부르고 팀만 바꾼다
	s["protagonist"]["team_id"] = TEAM_B
	var out: Dictionary = RelationshipRunner.reconcile(s, 77)

	assert_int(int(out["left_behind"])).override_failure_message(
		"팀이 바뀌었는데 두고 온 사람이 없다").is_equal(3)
	assert_int(int(out["created"])).is_equal(2)
	for r in RelationshipRunner.rows_of(s):
		if String(r["person_id"]).begins_with("A_"):
			assert_str(String(r["contact"])).is_equal("apart")
			assert_int(int(r["value"])).override_failure_message(
				"감쇠가 리셋이 됐다").is_between(1, 49)


## ⚠ **재회는 감쇠된 값에서 재개된다.** 0에서 다시 시작하면 "옛 감독을
## 프로에서 다시 만나는" 서사가 죽는다
func test_a_reunion_resumes_where_it_left_off() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	for r in RelationshipRunner.rows_of(s):
		r["value"] = 50
	s["protagonist"]["team_id"] = TEAM_B
	RelationshipRunner.reconcile(s, 77)
	var faded: int = int(RelationshipRunner.row_of(s, "A_1")["value"])

	s["protagonist"]["team_id"] = TEAM_A
	var out: Dictionary = RelationshipRunner.reconcile(s, 84)
	assert_int(int(out["reunited"])).is_equal(3)
	assert_int(int(out["created"])).override_failure_message(
		"재회인데 새로 만든 사람이 있다").is_equal(0)

	var row: Dictionary = RelationshipRunner.row_of(s, "A_1")
	assert_str(String(row["contact"])).is_equal("together")
	assert_int(int(row["value"])).override_failure_message(
		"재회하면서 값이 다시 깎였다").is_equal(faded)


## ⚠ **떠난 사람을 매주 다시 감쇠하지 않는다.** 이동 감쇠는 한 번이고
## 그 뒤는 시즌 단위다 — 매주 걸면 옛 팀 사람이 몇 주 만에 0으로 지워진다
func test_leaving_decays_only_once() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	for r in RelationshipRunner.rows_of(s):
		r["value"] = 50
	s["protagonist"]["team_id"] = TEAM_B
	RelationshipRunner.reconcile(s, 77)
	var once: int = int(RelationshipRunner.row_of(s, "A_1")["value"])

	RelationshipRunner.reconcile(s, 84)
	RelationshipRunner.reconcile(s, 91)
	assert_int(int(RelationshipRunner.row_of(s, "A_1")["value"])) \
		.override_failure_message("떠난 사람을 매주 다시 감쇠했다").is_equal(once)


## 라이벌은 소속으로 만난 사이가 아니다 — 팀이 바뀌어도 안 떠난다
func test_a_rival_is_not_left_behind() -> void:
	var s: Dictionary = _state()
	s["relationships"] = [{"person_id": "RIV_1", "kind": "rival", "value": 30,
		"contact": "together", "specialty": "", "last_team": "", "memories": []}]
	s["protagonist"]["team_id"] = TEAM_B
	RelationshipRunner.reconcile(s, 77)
	assert_str(String(RelationshipRunner.row_of(s, "RIV_1")["contact"])) \
		.override_failure_message("라이벌이 팀 이동으로 헤어졌다").is_equal("together")


## 그만둔 선수는 동료가 아니다
func test_someone_who_quit_is_not_a_teammate() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"][TEAM_A].append(_mate("A_GONE"))
	s["world"]["rosters"][TEAM_A][-1]["career_status"] = "retired"
	RelationshipRunner.reconcile(s, 70)
	assert_array(_ids(RelationshipRunner.rows_of(s))).not_contains(["A_GONE"])


## ⚠ **소속이 비었다고 아는 사람을 다 잃지 않는다.** 소속 없는 순간(졸업 뒤
## 드래프트 전)에 관계를 통째로 `apart`로 넘기면 새 팀에서 재회로 되살아나는
## 서사가 죽는다
func test_being_between_teams_does_not_lose_everyone() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	s["protagonist"]["team_id"] = ""

	var out: Dictionary = RelationshipRunner.reconcile(s, 77)
	assert_int(int(out["left_behind"])).override_failure_message(
		"소속이 빈 사이에 아는 사람을 다 두고 왔다").is_equal(0)
	assert_int(int(out["created"])).is_equal(0)
	for r in RelationshipRunner.rows_of(s):
		assert_str(String(r["contact"])).is_equal("together")


# ── 이번 주 맥락 ──────────────────────────────────────────────

## ⚠ **02가 여기서 주 인덱스를 하나 어긋나게 읽었다.** 아직 안 치른 주를
## 봐서 결과가 영영 null이었고 **관계가 전 커리어에 걸쳐 안 움직였다**
func test_the_week_that_just_ended_is_the_one_we_read() -> void:
	var s: Dictionary = _state({"schedule": [_game(66, true)]})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	assert_bool(bool(ctx["pitched"])).override_failure_message(
		"방금 끝난 주 경기를 못 읽었다 — 02가 커리어 내내 겪은 결함이다").is_true()
	assert_bool(bool(ctx["team_played"])).is_true()
	assert_bool(bool(ctx["team_won"])).is_true()
	assert_bool(bool(ctx["won"])).is_true()


## 지난주·다음주 경기는 안 센다
func test_only_this_week_counts() -> void:
	var s: Dictionary = _state({"schedule": [_game(63, true), _game(71, true)]})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	assert_bool(bool(ctx["team_played"])).override_failure_message(
		"창 밖의 경기를 읽었다").is_false()


## 남의 경기는 안 센다
func test_someone_elses_game_is_not_mine() -> void:
	var g: Dictionary = _game(66, true)
	g["home"] = "TEAM_C"
	g["away"] = TEAM_B
	var s: Dictionary = _state({"schedule": [g]})
	assert_bool(bool(RelationshipRunner.context_of(s, 70)["team_played"])).is_false()


## 아직 안 치른 경기는 안 센다
func test_an_unplayed_game_is_not_a_result() -> void:
	var g: Dictionary = _game(66, true)
	g["result"] = null
	var s: Dictionary = _state({"schedule": [g]})
	assert_bool(bool(RelationshipRunner.context_of(s, 70)["team_played"])).is_false()


## 팀은 뛰었는데 내가 안 나온 주 — 등판 항목은 안 걸린다
func test_the_team_can_play_without_me() -> void:
	var s: Dictionary = _state({"schedule": [_game(66, true, {"pitched": false})]})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	assert_bool(bool(ctx["team_played"])).is_true()
	assert_bool(bool(ctx["pitched"])).is_false()


## 남이 던진 줄을 내 등판으로 세지 않는다
func test_a_teammates_start_is_not_mine() -> void:
	var g: Dictionary = _game(66, true, {"pitched": false})
	g["result"]["player_lines"] = [{"role": "pitcher", "player_id": "A_1",
		"ip": 9.0, "er": 0.0}]
	var s: Dictionary = _state({"schedule": [g]})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	assert_bool(bool(ctx["pitched"])).override_failure_message(
		"동료가 던진 걸 내 등판으로 셌다").is_false()
	assert_bool(bool(ctx["complete_shutout"])).is_false()


## 내 타석은 등판이 아니다 — 투타겸업이라도 감독은 등판을 본다
func test_my_at_bats_are_not_a_start() -> void:
	var g: Dictionary = _game(66, true, {"pitched": false})
	g["result"]["player_lines"] = [{"role": "batter", "player_id": ME,
		"ab": 4, "h": 3}]
	var s: Dictionary = _state({"schedule": [g]})
	assert_bool(bool(RelationshipRunner.context_of(s, 70)["pitched"])) \
		.override_failure_message("타석을 등판으로 셌다").is_false()


## 내가 던진 경기를 팀이 졌으면 진 것이다
func test_pitching_in_a_loss_is_a_loss() -> void:
	var s: Dictionary = _state({"schedule": [_game(66, false)]})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	assert_bool(bool(ctx["pitched"])).is_true()
	assert_bool(bool(ctx["won"])).override_failure_message(
		"팀이 졌는데 내 승리로 셌다").is_false()


## ⚠ **이닝은 야구 표기(6.1 = 6⅓)다.** 그냥 더하면 방어율이 어긋난다
func test_the_era_reads_baseball_innings() -> void:
	var s: Dictionary = _state({"schedule": [
		_game(65, true, {"line": {"ip": 6.1, "er": 1.0}}),
		_game(68, true, {"line": {"ip": 6.2, "er": 2.0}})]})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	# 6⅓ + 6⅔ = 13이닝, 자책 3 → 3 × 9 / 13
	assert_float(float(ctx["era"])).is_equal_approx(3.0 * 9.0 / 13.0, 0.001)


func test_no_innings_is_not_a_zero_era() -> void:
	var s: Dictionary = _state()
	assert_float(float(RelationshipRunner.context_of(s, 70)["era"])).is_equal(0.0)


## 9이닝 무자책이 완봉이다
func test_a_complete_shutout_is_nine_scoreless() -> void:
	var nine: Dictionary = _state({"schedule": [
		_game(66, true, {"line": {"ip": 9.0, "er": 0.0}})]})
	assert_bool(bool(RelationshipRunner.context_of(nine, 70)["complete_shutout"])) \
		.is_true()

	var eight: Dictionary = _state({"schedule": [
		_game(66, true, {"line": {"ip": 8.0, "er": 0.0}})]})
	assert_bool(bool(RelationshipRunner.context_of(eight, 70)["complete_shutout"])) \
		.is_false()

	var scored: Dictionary = _state({"schedule": [
		_game(66, true, {"line": {"ip": 9.0, "er": 1.0}})]})
	assert_bool(bool(RelationshipRunner.context_of(scored, 70)["complete_shutout"])) \
		.is_false()


## ⚠ **무승부는 승리가 아니다.** `loser_id`가 비어 있는 것이 무승부다
func test_a_draw_is_not_a_win() -> void:
	var g: Dictionary = _game(66, true)
	g["result"]["loser_id"] = ""
	var s: Dictionary = _state({"schedule": [g]})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	assert_bool(bool(ctx["team_played"])).is_true()
	assert_bool(bool(ctx["team_won"])).override_failure_message(
		"무승부를 승리로 셌다").is_false()


## 훈련 영역은 첫 칸에서 나온다 — 규칙 파일을 거친다
func test_the_training_area_comes_from_the_first_slot() -> void:
	var s: Dictionary = _state()
	assert_str(RelationshipRunner.training_area_of(s)).is_equal("투수")

	s["training_plan"] = {"primary": "TRN_BATTING", "secondary": "TRN_VEL",
		"secondary2": ""}
	assert_str(RelationshipRunner.training_area_of(s)).override_failure_message(
		"둘째 칸까지 세면 코치 여럿이 같이 오른다").is_equal("타격")


## 계획이 비면 거른 주다
func test_an_empty_plan_is_a_skipped_week() -> void:
	var s: Dictionary = _state({"training_plan": {"primary": "", "secondary": "",
		"secondary2": ""}})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	assert_bool(bool(ctx["training_skipped"])).is_true()
	assert_bool(bool(ctx["training_done"])).is_false()
	assert_str(String(ctx["training_area"])).is_empty()

	# 둘째 칸만 채워도 훈련은 한 것이다
	s["training_plan"] = {"primary": "", "secondary": "TRN_VEL", "secondary2": ""}
	assert_bool(bool(RelationshipRunner.context_of(s, 70)["training_skipped"])) \
		.is_false()


# ── 한 주 돌리기 ──────────────────────────────────────────────

## ⚠ **이 검사가 02의 게이트(`measure:relations`)를 대신한다.** 관계가
## 전원 중립이면 실패한다 — 02는 그 상태로 커리어 전체를 돌았다
func test_relationships_actually_move() -> void:
	var s: Dictionary = _state({"schedule": [_game(66, true)]})
	RelationshipRunner.reconcile(s, 63)
	# 초기값은 성향 편차로 0이 아니다 — **처음 값과 비교해야** 안 움직인 걸 잡는다
	var before: Dictionary = {}
	for r in RelationshipRunner.rows_of(s):
		before[String(r["person_id"])] = int(r["value"])

	RelationshipRunner.run(s, 70)

	var moved: int = 0
	for r in RelationshipRunner.rows_of(s):
		if int(r["value"]) != int(before[String(r["person_id"])]):
			moved += 1
	assert_int(moved).override_failure_message(
		"한 주를 돌렸는데 관계가 처음 값 그대로다 — 02가 커리어 내내 그랬다") \
		.is_greater(0)


## 경기가 없던 주라도 첫 만남은 이뤄진다
func test_a_quiet_week_still_meets_the_team() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.run(s, 70)
	assert_int(RelationshipRunner.rows_of(s).size()).is_equal(3)


func test_it_records_the_day() -> void:
	var s: Dictionary = _state({"schedule": [_game(66, true), _game(73, true)]})
	# 먼저 만나 두고 — 만들 때가 아니라 **갱신할 때** 날짜가 바뀌어야 한다
	RelationshipRunner.reconcile(s, 63)
	RelationshipRunner.run(s, 77)
	for r in RelationshipRunner.rows_of(s):
		assert_int(int(r["updated_day"])).override_failure_message(
			"갱신했는데 날짜가 만난 날(63)에 머물러 있다").is_equal(77)


## ⚠ **라벨이 바뀐 것만 남긴다.** 값이 1 움직일 때마다 적으면 소식함이
## 관계 통보로 찬다
func test_only_a_label_change_is_worth_telling() -> void:
	var s: Dictionary = _state({"schedule": [_game(66, true), _game(73, true)]})
	RelationshipRunner.reconcile(s, 70)
	# 중립 한가운데서 시작한다 — +1로는 라벨이 안 바뀐다
	for r in RelationshipRunner.rows_of(s):
		r["value"] = 0
	RelationshipRunner.run(s, 70)
	assert_bool(s.has("relation_log")).override_failure_message(
		"1점 움직인 것까지 소식으로 남겼다").is_false()

	# 우호 문턱(11)을 넘기게 올려 둔다
	for r in RelationshipRunner.rows_of(s):
		r["value"] = 10
	RelationshipRunner.run(s, 77)
	assert_int(s["relation_log"].size()).is_greater(0)
	assert_str(String(s["relation_log"][0]["prev_label"])).is_equal("중립")
	assert_str(String(s["relation_log"][0]["label"])).is_equal("우호")
	assert_str(String(s["relation_log"][0]["kind"])).is_equal("teammate")


## ⚠ **주인공이 없으면 아무 일도 없다.** 그냥 두면 "훈련을 걸렀다"로 읽혀
## 감독·코치 관계가 저 혼자 내려간다
func test_a_world_without_me_is_quiet() -> void:
	var s: Dictionary = _state({"protagonist": {},
		"training_plan": {"primary": "", "secondary": "", "secondary2": ""}})
	s["relationships"] = [{"person_id": "MGR", "kind": "manager", "value": 30,
		"contact": "together", "specialty": "", "last_team": "", "memories": []}]
	assert_array(RelationshipRunner.run(s, 70)).is_empty()
	assert_int(int(RelationshipRunner.row_of(s, "MGR")["value"])) \
		.override_failure_message("주인공이 없는데 감독 관계가 움직였다").is_equal(30)


## ⚠ **주 경계를 받는다.** `state.day`만 보면 여러 주를 한 번에 넘길 때
## 같은 주를 N번 사는 것이 된다
func test_it_uses_the_boundary_it_is_given() -> void:
	var s: Dictionary = _state({"day": 200, "schedule": [_game(66, true)]})
	var ctx: Dictionary = RelationshipRunner.context_of(s, 70)
	assert_bool(bool(ctx["team_played"])).override_failure_message(
		"건네받은 주 경계(70)를 안 보고 state.day(200)를 봤다").is_true()

	# 한 주 돌리기도 같은 날짜를 써야 한다 — 여기만 `state.day`를 보면
	# 여러 주를 한 번에 넘길 때 전부 같은 주가 된다
	RelationshipRunner.reconcile(s, 63)
	for r in RelationshipRunner.rows_of(s):
		r["value"] = 0
	RelationshipRunner.run(s, 70)
	var moved: int = 0
	for r in RelationshipRunner.rows_of(s):
		if int(r["value"]) != 0:
			moved += 1
	assert_int(moved).override_failure_message(
		"한 주 돌리기가 건네받은 경계를 무시했다").is_greater(0)


# ── 시즌 ──────────────────────────────────────────────────────

func test_the_season_sums_it_up() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	var deltas: Array = RelationshipRunner.run_season(s, 2.10, 0.30, true, 364)
	assert_int(deltas.size()).is_equal(3)
	# 초기값은 성향 편차로 ±10이라 절댓값이 아니라 변화로 본다
	for d in deltas:
		assert_int(int(d["delta"])).override_failure_message(
			"한 시즌을 같이 났는데 안 올랐다").is_greater(0)
	for r in RelationshipRunner.rows_of(s):
		assert_int(int(r["updated_day"])).is_equal(364)


func test_a_season_with_no_relationships_is_quiet() -> void:
	assert_array(RelationshipRunner.run_season(_state(), 2.0, 0.3, true)).is_empty()


# ── 효과 ──────────────────────────────────────────────────────

func test_the_effects_read_the_right_rows() -> void:
	var s: Dictionary = _state()
	s["relationships"] = [
		{"person_id": "MGR", "kind": "manager", "value": 80,
			"contact": "together", "specialty": ""},
		{"person_id": "OWN", "kind": "owner", "value": -80,
			"contact": "together", "specialty": ""},
		{"person_id": "COA_P", "kind": "coach", "value": 80,
			"contact": "together", "specialty": "투수"},
		{"person_id": "COA_B", "kind": "coach", "value": -80,
			"contact": "together", "specialty": "타격"}]

	var out: Dictionary = RelationshipRunner.effects_of(s, "투수")
	assert_float(float(out["role_ovr_bias"])).is_greater(0.0)
	assert_float(float(out["contract_bonus"])).is_less(0.0)
	assert_float(float(out["training_bonus"])).override_failure_message(
		"담당 아닌 코치의 관계를 읽었다").is_greater(0.0)

	assert_float(float(RelationshipRunner.effects_of(s, "타격")["training_bonus"])) \
		.is_less(0.0)
	# 영역을 안 주면 어느 코치도 안 본다
	assert_float(float(RelationshipRunner.effects_of(s)["training_bonus"])).is_equal(0.0)


## 헤어진 사람의 관계는 판정에 안 쓴다
func test_someone_who_left_does_not_pick_my_role() -> void:
	var s: Dictionary = _state()
	s["relationships"] = [{"person_id": "MGR", "kind": "manager", "value": 80,
		"contact": "apart", "specialty": ""}]
	assert_float(float(RelationshipRunner.effects_of(s)["role_ovr_bias"])).is_equal(0.0)


# ── 종료 · 기억 ───────────────────────────────────────────────

func test_ending_freezes_the_relationship() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	assert_int(RelationshipRunner.end_for(s, ["A_1", "A_2"])).is_equal(2)
	assert_str(String(RelationshipRunner.row_of(s, "A_1")["contact"])).is_equal("ended")
	# 두 번 불러도 다시 세지 않는다
	assert_int(RelationshipRunner.end_for(s, ["A_1"])).is_equal(0)

	# 끝난 관계는 주간 갱신을 안 받는다
	s["schedule"] = [_game(66, true)]
	var deltas: Array = RelationshipRunner.run(s, 77)
	for d in deltas:
		assert_str(String(d["person_id"])).is_not_equal("A_1")


func test_a_memory_sticks() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	assert_bool(RelationshipRunner.add_memory(s, "A_1",
		{"intensity": 9, "season": 2026, "week": 10, "text": "데뷔전"})).is_true()
	assert_int(RelationshipRunner.row_of(s, "A_1")["memories"].size()).is_equal(1)
	assert_bool(RelationshipRunner.add_memory(s, "NOBODY", {})).is_false()


## 기억이 넘치면 약한 것부터 버린다
func test_memories_are_capped() -> void:
	var s: Dictionary = _state()
	RelationshipRunner.reconcile(s, 70)
	RelationshipRunner.add_memory(s, "A_1",
		{"intensity": 9, "season": 2026, "week": 1, "text": "데뷔전"})
	for i in 15:
		RelationshipRunner.add_memory(s, "A_1",
			{"intensity": 1, "season": 2030, "week": i, "text": "평범"})

	var kept: Array = RelationshipRunner.row_of(s, "A_1")["memories"]
	assert_int(kept.size()).is_equal(Relationship.MAX_MEMORIES)
	var strong: bool = false
	for m in kept:
		if int(m["intensity"]) == 9:
			strong = true
	assert_bool(strong).override_failure_message(
		"데뷔전이 평범한 최근 기억에 밀렸다").is_true()


# ── 라이벌 ────────────────────────────────────────────────────
#
# ⚠ **`faced_rivals`가 늘 빈 배열이었다.** 읽는 곳은 있는데 채우는 곳이
# 없어서 **라이벌이 0명**이었다 — 02는 커리어 하나에 8명이 생긴다.


## 그 경기에 상대 선발을 세운 일정
func _game_with_rival(day: int, won: bool, rival_ip: float = 8.0) -> Dictionary:
	var g: Dictionary = _game(day, won)
	g["result"]["player_lines"].append({"role": "pitcher",
		"player_id": "B_1", "ip": rival_ip, "er": 3.0})
	return g


## ⚠ **사건이 관계의 시작이다.** `reconcile`은 같은 팀만 보므로 라이벌 행을
## 못 만든다 — 이 자리가 없으면 산식이 아무 행도 못 찾는다
func test_facing_a_starter_creates_a_rival() -> void:
	var s: Dictionary = _state({"schedule": [_game_with_rival(70, true)]})
	RelationshipRunner.run(s, 70)
	var kinds: Dictionary = {}
	for r in RelationshipRunner.rows_of(s):
		kinds[String(r["person_id"])] = String(r["kind"])
	assert_str(String(kinds.get("B_1", ""))).override_failure_message(
		"맞붙은 상대 선발이 라이벌로 안 생겼다").is_equal(Relationship.KIND_RIVAL)


## 🔴 **만들어진 라이벌 행에 팀이 안 적혀 있다** (P-13 · 02
## `relationships.ts:270`도 빈 문자열이다).
##
## ⚠ **위의 `test_a_rival_is_not_left_behind`가 이걸 못 잡았다.**
## 그쪽은 `last_team: ""`를 **손으로 넣은 fixture**로 확인한다 — 정작 행을
## **만드는 자리**가 내 팀을 채우고 있었는데도 초록불이었다(형태 ⑦).
## 그래서 여기서는 게임 경로로 만든 행을 본다
func test_a_created_rival_carries_no_team() -> void:
	var s: Dictionary = _state({"schedule": [_game_with_rival(70, true)]})
	RelationshipRunner.run(s, 70)
	var row: Dictionary = RelationshipRunner.row_of(s, "B_1")
	assert_str(String(row.get("last_team", "?"))).override_failure_message(
		"라이벌에 팀이 적혔다(%s) — 이적하면 두고 온 사람으로 잡힌다"
		% row.get("last_team", "?")).is_empty()
	assert_str(String(row.get("met_team", "?"))).is_empty()


## 🔴 **이적해도 라이벌은 안 헤어진다** (P-13).
##
## 20해 실측에서 **라이벌 21명이 전부 0**이었다. 라이벌 행에 내 팀이
## 적혀 있어서 이적 한 번에 `_leave_stale_teams`가 "두고 온 사람"으로 잡아
## 감쇠시키고 `apart`로 넘겼고, `reconcile`은 **같은 팀 사람만 보므로**
## 되돌릴 자리가 없었다 — 그 뒤로 몇 번을 맞붙어도 값이 안 움직였다.
##
## 커리어는 고교 → 대학 → 독립 → 프로로 여러 번 옮긴다. 즉 라이벌은
## **거의 첫 팀에서만** 자랐다
func test_a_rival_survives_a_transfer_through_the_game_path() -> void:
	var s: Dictionary = _state({"schedule": [_game_with_rival(70, true)]})
	RelationshipRunner.run(s, 70)
	var before: int = int(RelationshipRunner.row_of(s, "B_1")["value"])

	# 제3의 팀으로 옮긴다 — TEAM_B로 가면 라이벌이 동료가 되어 딴 이야기다
	s["protagonist"]["team_id"] = "TEAM_C"
	s["world"]["rosters"]["TEAM_C"] = [_mate("C_1", "TEAM_C")]
	s["schedule"] = []
	RelationshipRunner.run(s, 77)

	var row: Dictionary = RelationshipRunner.row_of(s, "B_1")
	assert_str(String(row["contact"])).override_failure_message(
		"이적하니 라이벌이 헤어진 사이가 됐다 — 다시 맞붙어도 값이 안 움직인다") \
		.is_equal(Relationship.CONTACT_TOGETHER)
	assert_int(int(row["value"])).override_failure_message(
		"이적 감쇠가 라이벌한테 걸렸다 (%d → %d)" % [before, int(row["value"])]) \
		.is_equal(before)


## ⚠ **불펜을 먼저 넣는다.** 선발을 먼저 두면 "이닝 최다"가 아니라
## "처음 만난 투수"를 잡아도 검사가 통과한다 — 실제로 그 변이를 놓쳤다
func test_only_the_opposing_starter_becomes_a_rival() -> void:
	var g: Dictionary = _game(70, true)
	g["result"]["player_lines"].append({"role": "pitcher",
		"player_id": "B_2", "ip": 1.0, "er": 0.0})
	g["result"]["player_lines"].append({"role": "pitcher",
		"player_id": "B_1", "ip": 8.0, "er": 3.0})
	var s: Dictionary = _state({"schedule": [g]})
	RelationshipRunner.run(s, 70)
	for r in RelationshipRunner.rows_of(s):
		if String(r["kind"]) == Relationship.KIND_RIVAL:
			assert_str(String(r["person_id"])).override_failure_message(
				"불펜까지 라이벌로 잡았다").is_equal("B_1")


## ⚠ **내가 던진 경기만 맞대결이다.** 벤치에 앉은 날의 상대 선발은 아니다
func test_a_game_i_did_not_pitch_makes_no_rival() -> void:
	var g: Dictionary = _game(70, true, {"pitched": false})
	g["result"]["player_lines"] = [{"role": "pitcher",
		"player_id": "B_1", "ip": 9.0, "er": 0.0}]
	var s: Dictionary = _state({"schedule": [g]})
	RelationshipRunner.run(s, 70)
	for r in RelationshipRunner.rows_of(s):
		assert_str(String(r["kind"])).override_failure_message(
			"안 던진 경기의 상대가 라이벌이 됐다"
		).is_not_equal(Relationship.KIND_RIVAL)


## 같은 상대를 다시 만나도 행이 하나다
func test_meeting_the_same_rival_twice_makes_one_row() -> void:
	var s: Dictionary = _state({"schedule": [
		_game_with_rival(70, true), _game_with_rival(77, false)]})
	RelationshipRunner.run(s, 70)
	RelationshipRunner.run(s, 77)
	var n: int = 0
	for r in RelationshipRunner.rows_of(s):
		if String(r["person_id"]) == "B_1":
			n += 1
	assert_int(n).override_failure_message(
		"같은 라이벌 행이 %d개다" % n).is_equal(1)
