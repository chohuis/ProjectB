extends GdUnitTestSuite

## 인시즌 1군↔2군 승강 — P-4.
##
## ⚠ **판정과 값은 원래 다 있었는데 부르는 곳이 검사뿐이었다.** 02는 시즌
## 26주에 145건을 옮기는데 04는 0건이었다 — 시즌 중 1군이 고정돼서 2군에서
## 잘해도 안 올라오고, 부상으로 자리가 비어도 안 메웠다.


func _player(id: String, position: String, ovr: float,
		perf: Dictionary = {}, age: int = 25) -> Dictionary:
	return {"id": id, "position": position, "ovr": ovr, "age": age,
		"perf": perf, "salary": 5000, "registrable": true}


func _neutral() -> Dictionary:
	return TeamProfile.DEFAULT.duplicate()


## 1군을 정원만큼 채운다 — 하한에 안 걸리게 투수 13 · 야수 15
func _active(strength: float = 60.0) -> Array:
	var out: Array = []
	for i in range(6):
		out.append(_player("SP%d" % i, "SP", strength))
	for i in range(7):
		out.append(_player("RP%d" % i, "RP", strength))
	for i in range(15):
		out.append(_player("B%d" % i, "1B", strength))
	return out


func _farm(strength: float = 60.0) -> Array:
	var out: Array = []
	for i in range(9):
		out.append(_player("FSP%d" % i, "SP", strength))
	for i in range(10):
		out.append(_player("FB%d" % i, "1B", strength))
	return out


# ── 콜업 ──────────────────────────────────────────────────────

## ⚠ **문턱을 넘어야 올라온다.** 안 그러면 매주 전원이 후보가 된다
func test_an_equal_player_does_not_get_called_up() -> void:
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), _farm(60.0), _active(60.0), [])
	assert_array(picked).override_failure_message(
		"능력치가 같은데 %d명이 올라온다" % picked.size()).is_empty()


## 훨씬 잘하면 올라온다
func test_a_much_better_player_gets_called_up() -> void:
	var farm: Array = _farm(60.0)
	farm.append(_player("STAR", "1B", 85.0))
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, _active(60.0), [])
	assert_int(picked.size()).is_greater(0)
	assert_str(String(picked[0]["player_id"])).is_equal("STAR")


## ⚠ **부상 자리는 능력치 차가 없어도 메운다.** 안 메우면 1군이 빈 채로 돈다
func test_an_injured_slot_gets_filled() -> void:
	var active: Array = _active(60.0)
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), _farm(60.0), active, ["B0"])
	assert_int(picked.size()).is_greater(0)
	var ids: Array = []
	for c in picked:
		ids.append(String(c["replaces_player_id"]))
	assert_bool(ids.has("B0")).override_failure_message(
		"부상자 B0 자리를 아무도 안 메운다").is_true()


## ⚠ **자리가 통째로 비면 같은 부류에서 최약체를 내린다.** 콜업은 같은
## 포지션 1:1이라, 안 그러면 포수가 0명 된 팀은 영영 못 메운다
func test_an_empty_position_is_filled_from_another_slot() -> void:
	var farm: Array = _farm(60.0)
	farm.append(_player("FC0", "C", 55.0))
	farm.append(_player("FC1", "C", 54.0))
	# 1군에 포수가 하나도 없다
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, _active(60.0), [])
	var reasons: Array = []
	for c in picked:
		reasons.append(String(c["reason"]))
	assert_bool(reasons.has(RosterMaintenance.REASON_POSITION_GAP)
		).override_failure_message(
		"1군 포수가 0명인데 공백 충원이 안 걸린다").is_true()


## ⚠ **2군의 마지막 포수는 안 올린다** — 02가 그걸 올려버려 2군이 포수
## 0명으로 한 해를 났다. 단 1군 그 자리가 비었으면 올린다
func test_the_last_farm_catcher_stays_when_the_first_team_has_one() -> void:
	var farm: Array = _farm(60.0)
	farm.append(_player("FC0", "C", 90.0))
	var active: Array = _active(60.0)
	active.append(_player("C0", "C", 40.0))
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, active, [])
	for c in picked:
		assert_str(String(c["player_id"])).override_failure_message(
			"2군의 마지막 포수를 올렸다").is_not_equal("FC0")


## ⚠ **육성선수는 입단 연도에 못 올라간다** (KBO 5월 1일 이후)
func test_an_unregistrable_player_is_not_a_candidate() -> void:
	var farm: Array = _farm(60.0)
	var rookie: Dictionary = _player("ROOKIE", "1B", 95.0)
	rookie["registrable"] = false
	farm.append(rookie)
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, _active(60.0), [])
	for c in picked:
		assert_str(String(c["player_id"])).override_failure_message(
			"육성선수를 올렸다").is_not_equal("ROOKIE")


## ⚠ **투수 하한 보충은 별도 패스다.** 02가 공백 충원에 묶었다가 투수 12명
## 미만인 모든 팀에서 부진·부상 교체가 사라졌다(회귀 4건)
func test_a_pitcher_short_team_gets_a_pitcher() -> void:
	var active: Array = []
	for i in range(5):
		active.append(_player("SP%d" % i, "SP", 60.0))
	for i in range(20):
		active.append(_player("B%d" % i, "1B", 60.0))
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), _farm(60.0), active, [])
	var reasons: Array = []
	for c in picked:
		reasons.append(String(c["reason"]))
	assert_bool(reasons.has(RosterMaintenance.REASON_PITCHER_SHORT)
		).override_failure_message(
		"1군 투수가 5명인데 하한 보충이 안 걸린다").is_true()


## 하한 보충이 야수 하한을 깨면서까지 하지는 않는다
func test_the_pitcher_floor_does_not_break_the_batter_floor() -> void:
	var active: Array = []
	for i in range(5):
		active.append(_player("SP%d" % i, "SP", 60.0))
	for i in range(FirstTeamMinBatters()):
		active.append(_player("B%d" % i, "1B", 60.0))
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), _farm(60.0), active, [])
	for c in picked:
		assert_str(String(c["reason"])).override_failure_message(
			"야수가 하한인데 하한 보충으로 야수를 내렸다"
		).is_not_equal(RosterMaintenance.REASON_PITCHER_SHORT)


func FirstTeamMinBatters() -> int:
	return RosterMaintenance.FIRST_TEAM_MIN_BATTERS


# ── 콜다운 ────────────────────────────────────────────────────

## ⚠ **정원 초과분만 내린다.** 02는 매번 셋을 내놨고 호출측이 둘을 내려서
## 한 시즌에 1군이 30명 → 16명으로 말랐다
func test_a_roster_within_the_cap_sends_nobody_down() -> void:
	assert_array(RosterMaintenance.eval_calldown(
		_neutral(), _active(60.0), 40)).is_empty()


## ⚠ **초과 3으로 재면 안 된다.** 02의 결함이 `over.max(3)`이라 초과가 3일
## 때는 옳은 코드와 결과가 같다 — 처음에 3으로 재서 변이가 안 잡혔다
func test_only_the_overflow_goes_down() -> void:
	var active: Array = _active(60.0)
	for over in [1, 2, 5]:
		var down: Array = RosterMaintenance.eval_calldown(
			_neutral(), active, active.size() - over)
		assert_int(down.size()).override_failure_message(
			"초과 %d명인데 %d명을 내린다" % [over, down.size()]).is_equal(over)


## ⚠ **하한 둘 다 잠기면 강등을 멈춘다.** 어느 쪽을 내려도 라인업이나
## 등판이 무너지는 로스터다
func test_both_floors_locked_stops_the_calldown() -> void:
	var active: Array = []
	for i in range(RosterMaintenance.FIRST_TEAM_MIN_PITCHERS):
		active.append(_player("SP%d" % i, "SP", 60.0))
	for i in range(RosterMaintenance.FIRST_TEAM_MIN_BATTERS):
		active.append(_player("B%d" % i, "1B", 60.0))
	assert_array(RosterMaintenance.eval_calldown(
		_neutral(), active, 1)).is_empty()


## ⚠ **선발 하한이 없으면 불펜만 빠지고 선발이 쌓인다** — 02 실측 팀당
## 선발 9~12명(로테이션은 5)
func test_the_starter_floor_protects_starters() -> void:
	var active: Array = []
	for i in range(RosterMaintenance.FIRST_TEAM_MIN_STARTERS):
		# 선발을 일부러 약하게 — 하한이 없으면 이들이 먼저 내려간다
		active.append(_player("SP%d" % i, "SP", 30.0))
	for i in range(10):
		active.append(_player("RP%d" % i, "RP", 70.0))
	for i in range(20):
		active.append(_player("B%d" % i, "1B", 70.0))
	var down: Array = RosterMaintenance.eval_calldown(
		_neutral(), active, active.size() - 2)
	for d in down:
		assert_bool(String(d["player_id"]).begins_with("SP")
			).override_failure_message(
			"선발이 하한인데 선발을 내렸다").is_false()


## 외국인은 2군에 안 내린다 — 보유 한도가 강등으로 새면 안 된다
func test_a_foreign_player_never_goes_down() -> void:
	var active: Array = _active(60.0)
	var foreign: Dictionary = _player("FOREIGN", "1B", 10.0)
	foreign["is_foreign"] = true
	active.append(foreign)
	var down: Array = RosterMaintenance.eval_calldown(
		_neutral(), active, active.size() - 2)
	for d in down:
		assert_str(String(d["player_id"])).override_failure_message(
			"외국인을 2군에 내렸다").is_not_equal("FOREIGN")


# ── 성적이 판정에 닿는가 ─────────────────────────────────────
#
# ⚠ **`perf`를 아무도 안 채웠다.** `form_score`가 읽는 키인데 `sim/` 전체에서
# 쓰는 곳이 `roster_maintenance.gd` 하나였다 — 그래서 `rated()`의
# `form_score × 8` 항이 늘 0이고 **승강이 능력치만 봤다.**
# 02가 "성적이 능력치를 뒤집되 완전히 무시하진 않는" 지점으로 잡은 가중이다.
#
# 02는 시즌 누계를 그대로 넘긴다 — 창을 안 자른다(`market.ts:39` `seasonPerfOf`)


func test_a_season_line_becomes_perf() -> void:
	var p: Dictionary = _player("P1", "SP", 60.0)
	PromotionRunner.attach_perf([p], {"P1": {"type": "pitcher",
		"g": 20, "ip": 120.0, "era": 2.10, "whip": 1.05}})
	assert_float(float(p["perf"]["era"])).is_equal(2.10)
	assert_float(float(p["perf"]["innings"])).override_failure_message(
		"이닝을 안 넘겼다 — 표본 항이 죽어 성적이 0으로 눌린다").is_equal(120.0)


func test_a_batter_line_becomes_perf() -> void:
	var p: Dictionary = _player("B1", "1B", 60.0)
	PromotionRunner.attach_perf([p], {"B1": {"type": "batter",
		"g": 100, "pa": 400, "ops": 0.910}})
	assert_float(float(p["perf"]["ops"])).is_equal(0.910)
	assert_float(float(p["perf"]["pa"])).is_equal(400.0)


## 기록이 없으면 빈 사전이다 — 없는 성적을 좋게도 나쁘게도 읽지 않는다
func test_a_player_without_stats_gets_an_empty_perf() -> void:
	var p: Dictionary = _player("P1", "SP", 60.0)
	PromotionRunner.attach_perf([p], {})
	assert_bool((p["perf"] as Dictionary).is_empty()).is_true()


## ⚠ **이게 이 축의 요점이다.** 같은 능력치면 성적이 갈라야 한다 —
## 부진한 1군이 호투한 2군에게 자리를 내준다
func test_a_slumping_first_teamer_loses_the_spot() -> void:
	var active: Array = _active(60.0)
	var farm: Array = _farm(60.0)
	# 성적 없이는 안 올라온다(문턱을 못 넘는다)
	assert_array(RosterMaintenance.eval_callup(
		_neutral(), farm, active, [])).is_empty()

	# 1군 하나가 크게 부진하고 2군 하나가 호투했다 — 능력치는 그대로다
	PromotionRunner.attach_perf(active, {"SP0": {"type": "pitcher",
		"g": 20, "ip": 100.0, "era": 9.00, "whip": 2.00}})
	PromotionRunner.attach_perf(farm, {"FSP0": {"type": "pitcher",
		"g": 20, "ip": 100.0, "era": 1.00, "whip": 0.80}})

	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, active, [])
	assert_int(picked.size()).override_failure_message(
		"성적이 크게 갈렸는데 아무도 안 올라온다 — 성적이 판정에 안 닿는다"
	).is_greater(0)
	assert_str(String(picked[0]["player_id"])).is_equal("FSP0")
	assert_str(String(picked[0]["replaces_player_id"])).is_equal("SP0")


# ── 주기 ──────────────────────────────────────────────────────

## ⚠ **주 경계가 아니면 아무것도 안 한다.** 매일 돌리면 02의 7배가 된다
func test_nothing_happens_mid_week() -> void:
	var s: Dictionary = {"season_year": 2027, "world": {"rosters": {}}}
	var out: Dictionary = PromotionRunner.run(s, 3)
	assert_int(int(out["callups"])).is_equal(0)
	assert_bool(bool(out["regular"])).is_false()


## ⚠ **04는 일 단위라 주 인덱스를 세지 않는다.** 달력의 달이 바뀌면 정기다 —
## 매주 4로 나누는 식으로 세면 달과 서서히 어긋난다
func test_the_first_week_of_a_month_is_the_regular_run() -> void:
	var s: Dictionary = {"season_year": 2027, "world": {"rosters": {}}}
	var months: Dictionary = {}
	var regulars: int = 0
	for w in range(1, 27):
		var day: int = w * Calendar.DAYS_PER_WEEK
		if PromotionRunner.run(s, day)["regular"]:
			regulars += 1
			months[int(Calendar.date_of(2027, day)["month"])] = true
	assert_int(regulars).override_failure_message(
		"26주에 정기가 %d회 — 달마다 한 번이 아니다" % regulars
	).is_equal(months.size())


## 상시 주에는 콜다운이 안 돈다 — **빈 자리 메우기만**
func test_an_urgent_week_does_not_send_anyone_down() -> void:
	var s: Dictionary = {"season_year": 2027, "world": {"rosters": {}}}
	# 첫 주로 달을 기록해 둔다 — 그다음 주는 상시다
	PromotionRunner.run(s, Calendar.DAYS_PER_WEEK)
	var out: Dictionary = PromotionRunner.run(s, Calendar.DAYS_PER_WEEK * 2)
	assert_bool(bool(out["regular"])).is_false()
	assert_int(int(out["calldowns"])).is_equal(0)


# ── 기록에 남나 (G-6) ─────────────────────────────────────────
#
# 🔴 **여기까지 배선 검사가 소스 문자열이었다.** `run_team`을 부르는 검사가
# 없어서 "`EventLog.push`라는 글자가 파일에 있나"만 봤다 — 그런 검사는
# 인자를 뒤바꿔도, 빈 배열을 넘겨도 통과한다.
#
# ⚠ **`run`을 불러야 한다.** 기록은 `run_team`이 아니라 `run`이 남긴다
# (리그마다 모아서 한 건으로). 그래서 fixture도 **진짜 팀 id**를 써야
# `World.teams_of`가 훑는 목록에 걸린다.


## 승강이 실제로 일어나는 판. **2군이 더 세야 콜업이 난다** — 같으면
## 문턱에 걸려 아무도 안 올라오고, 그러면 기록도 안 남아 검사가 헛돈다
func _promotion_state() -> Dictionary:
	var league: String = String(RosterMaintenance.active_pro_leagues()[0])
	var team: String = String(World.teams_of(league)[0]["id"])
	return {
		"season_year": 2030, "day": Calendar.DAYS_PER_WEEK,
		"season_stats": {},
		"world": {"rosters": {
			team: _active(60.0),
			team + World.FARM_SUFFIX: _farm(78.0),
		}},
		"_team": team, "_league": league,
	}


## 🔴 **콜업이 기록에 남는다.** 개수만 반환하면 자동 진행을 돌려도
## "콜업 3건"까지만 보이고 누구인지 알 길이 없다
func test_a_callup_is_written_to_the_log() -> void:
	EventLog.clear()
	var s: Dictionary = _promotion_state()
	var out: Dictionary = PromotionRunner.run(s, Calendar.DAYS_PER_WEEK)
	assert_int(int(out["callups"])).override_failure_message(
		"fixture에서 콜업이 아예 안 일어났다 — 검사가 헛돈다").is_greater(0)

	assert_int(EventLog.count_of("callup")).override_failure_message(
		"콜업이 %d건인데 기록이 없다" % int(out["callups"])).is_greater(0)

	# **누가 올라갔는지**가 들어 있어야 한다 — 그게 이 장치의 목적이다
	var found: Dictionary = {}
	for e in EventLog.all():
		if String(e["type"]) == "callup":
			found = e
			break
	assert_int(found["players"].size()).is_greater(0)
	var who: Dictionary = found["players"][0]
	assert_str(String(who["name"])).override_failure_message(
		"이름이 비었다 — id만 남으면 화면에서 못 읽는다").is_not_empty()
	assert_str(String(who["to_team"])).override_failure_message(
		"올라간 팀이 안 적혔다").is_equal(String(s["_team"]))
	assert_str(String(found["league_id"])).is_equal(String(s["_league"]))


## ⚠ **아무 일도 없으면 안 적는다.** 매주 도는 자리라 빈 줄이 쌓이면
## 정작 일어난 일이 안 보인다
func test_a_quiet_week_writes_nothing() -> void:
	EventLog.clear()
	var s: Dictionary = _promotion_state()
	# 2군을 약하게 — 문턱을 못 넘는다
	s["world"]["rosters"][String(s["_team"]) + World.FARM_SUFFIX] = _farm(40.0)
	PromotionRunner.run(s, Calendar.DAYS_PER_WEEK)
	assert_int(EventLog.count_of("callup")).override_failure_message(
		"아무도 안 올라갔는데 기록이 남았다").is_equal(0)
