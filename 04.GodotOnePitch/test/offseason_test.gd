extends GdUnitTestSuite

## 오프시즌 — 부상 회복 · 은퇴 판정. M9-2.
##
## 원본: `npc_sim.rs`의 `normalize_offseason_npcs`


func _npc(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"id": "N1", "league_id": "LEAGUE_KBL", "team_id": "TEAM_A",
		"age": 30, "career_status": "active", "player_type": "pitcher",
		"pitching": {"ovr": 70.0}, "batting": {"ovr": 40.0},
		"career_history": [], "career_events": [],
	}
	d.merge(o, true)
	return d


func _rng(seed_value: int) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


## 늘 은퇴시키는 난수 — 확률이 0보다 크면 반드시 걸린다
class AlwaysRng extends RefCounted:
	func randf() -> float: return 0.0

## 절대 은퇴 안 시키는 난수
class NeverRng extends RefCounted:
	func randf() -> float: return 0.999999


# ── 확률 ──────────────────────────────────────────────────────

## ⚠ **34세까지는 안 본다.** 낮추면 전성기 선수가 사라진다
func test_nobody_retires_before_thirty_five() -> void:
	for age in [20, 28, 34]:
		assert_float(Offseason.retire_chance(age, 70.0)).override_failure_message(
			"%d세에 은퇴 확률이 붙었다" % age).is_equal(0.0)


func test_the_chance_starts_at_thirty_five() -> void:
	assert_float(Offseason.retire_chance(35, 70.0)).is_equal_approx(0.06, 0.0001)
	assert_float(Offseason.retire_chance(36, 70.0)).is_equal_approx(0.12, 0.0001)


## 나이가 들수록 오른다
func test_the_chance_rises_with_age() -> void:
	var prev: float = 0.0
	for age in range(35, 45):
		var c: float = Offseason.retire_chance(age, 70.0)
		assert_float(c).is_greater_equal(prev)
		prev = c


## ⚠ **못하는 선수가 먼저 그만둔다.** 벌점이 없으면 40세 저능력 선수가
## 40세 특급과 같은 확률로 남는다
func test_a_weak_player_retires_sooner() -> void:
	assert_float(Offseason.retire_chance(35, 45.0)).override_failure_message(
		"능력치 벌점이 안 붙는다").is_greater(Offseason.retire_chance(35, 70.0))
	# 55 위로는 벌점이 없다
	assert_float(Offseason.retire_chance(35, 80.0)) \
		.is_equal(Offseason.retire_chance(35, 55.0))


## ⚠ **한 해에 이 이상은 안 나간다.** 안 자르면 노장이 한꺼번에 사라진다
func test_the_chance_is_capped() -> void:
	assert_float(Offseason.retire_chance(99, 10.0)).is_equal(Offseason.RETIRE_CAP)


## 투수는 투구 OVR, 야수는 타격 OVR을 본다 — 섞으면 판정이 뒤집힌다
func test_the_core_ovr_follows_the_player_type() -> void:
	assert_float(Offseason.core_ovr(_npc())).is_equal(70.0)
	assert_float(Offseason.core_ovr(_npc({"player_type": "batter"}))).is_equal(40.0)


# ── 은퇴 ──────────────────────────────────────────────────────

func test_an_old_player_can_retire() -> void:
	var n: Dictionary = _npc({"age": 40})
	var out: Dictionary = Offseason.run([n], 2027, AlwaysRng.new())
	assert_int(out["retired"].size()).is_equal(1)
	assert_str(n["career_status"]).is_equal("retired")
	assert_str(n["league_id"]).is_equal(Offseason.RETIRED_LEAGUE)
	assert_str(n["team_id"]).is_empty()


func test_a_young_player_never_retires() -> void:
	var n: Dictionary = _npc({"age": 25})
	assert_array(Offseason.run([n], 2027, AlwaysRng.new())["retired"]).is_empty()
	assert_str(n["career_status"]).is_equal("active")


func test_a_lucky_roll_keeps_the_player() -> void:
	var n: Dictionary = _npc({"age": 36})
	assert_array(Offseason.run([n], 2027, NeverRng.new())["retired"]).is_empty()


## ⚠ **은퇴가 경력 사건으로 남아야 한다.** 02는 NPC 은퇴가 경력 화면에
## 안 떴고, 사건 집계로 세대교체를 볼 방법도 없어서 "나이 은퇴가 한 번도
## 없다"고 잘못 읽기까지 했다
func test_retirement_leaves_a_career_event() -> void:
	var n: Dictionary = _npc({"age": 38})
	Offseason.run([n], 2027, AlwaysRng.new())
	var e: Dictionary = n["career_events"][0]
	assert_str(e["type"]).is_equal("retirement")
	assert_int(int(e["year"])).is_equal(2027)
	assert_str(e["detail"]).contains("38")


## ⚠ **소속을 비우기 전에 남긴다.** 어디서 은퇴했는지가 사라진다
func test_the_event_remembers_where_he_played() -> void:
	var n: Dictionary = _npc({"age": 38, "team_id": "TEAM_X",
		"league_id": "LEAGUE_KBL"})
	Offseason.run([n], 2027, AlwaysRng.new())
	assert_str(n["career_events"][0]["from_team_id"]).override_failure_message(
		"소속을 비운 뒤에 사건을 남겼다").is_equal("TEAM_X")
	assert_str(n["career_events"][0]["from_league_id"]).is_equal("LEAGUE_KBL")
	assert_str(n["career_history"][0]["team_id"]).is_equal("TEAM_X")


func test_retirement_leaves_a_year_record() -> void:
	var n: Dictionary = _npc({"age": 38})
	Offseason.run([n], 2027, AlwaysRng.new())
	assert_str(n["career_history"][0]["stat_line"]).is_equal("retired")


## 이미 은퇴한 선수는 다시 안 잡는다
func test_an_already_retired_player_is_skipped() -> void:
	var n: Dictionary = _npc({"age": 40, "career_status": "retired",
		"league_id": Offseason.RETIRED_LEAGUE})
	assert_array(Offseason.run([n], 2027, AlwaysRng.new())["retired"]).is_empty()
	assert_int(n["career_events"].size()).is_equal(0)


# ── 부상 회복 ─────────────────────────────────────────────────

## ⚠ **부상은 시즌이 끝나면 낫는다.** 02는 완치돼도 상태가 안 풀려서
## 시즌 중 고교의 47%가 injured였다
func test_an_injured_player_heals() -> void:
	var n: Dictionary = _npc({"career_status": "injured"})
	assert_int(int(Offseason.run([n], 2027, AlwaysRng.new())["healed"])).is_equal(1)
	assert_str(n["career_status"]).is_equal("active")


## 낫는 해엔 은퇴 판정을 안 받는다 — 02가 그 순서다
func test_a_healed_player_is_not_judged_this_year() -> void:
	var n: Dictionary = _npc({"age": 42, "career_status": "injured"})
	assert_array(Offseason.run([n], 2027, AlwaysRng.new())["retired"]).is_empty()
	assert_str(n["career_status"]).is_equal("active")


# ── 세계 전체 ─────────────────────────────────────────────────

## ⚠ **한 시즌에 전멸하면 안 된다.** 상한이 그걸 막는다
func test_a_real_world_loses_only_some_veterans() -> void:
	var pool: Array = []
	for i in 200:
		pool.append(_npc({"id": "N%d" % i, "age": 35 + (i % 8), "player_type": "batter",
			"batting": {"ovr": 50.0 + float(i % 30)}}))
	var out: Dictionary = Offseason.run(pool, 2027, _rng(99))
	var n: int = out["retired"].size()
	assert_int(n).override_failure_message(
		"35세 이상 200명 중 %d명이 은퇴했다" % n).is_between(20, 120)


func test_an_empty_world_does_not_break() -> void:
	var out: Dictionary = Offseason.run([], 2027, _rng(1))
	assert_array(out["retired"]).is_empty()
	assert_int(int(out["healed"])).is_equal(0)


# ── 기록이 실제로 붙는가 ──────────────────────────────────────

## ⚠ **키가 없는 선수에게도 붙어야 한다.** `get`이 돌려준 빈 배열은 선수
## 사전에 안 달려 있다 — 대입을 빠뜨리면 그 선수만 조용히 기록이 없다.
## 변이 검증에서 이 자리가 실제로 안 잡혔다
func test_a_player_without_history_still_gets_one() -> void:
	var n: Dictionary = {"id": "N1", "league_id": "LEAGUE_KBL", "team_id": "TEAM_A",
		"age": 40, "career_status": "active", "player_type": "pitcher",
		"pitching": {"ovr": 50.0}}
	Offseason.run([n], 2027, AlwaysRng.new())

	assert_bool(n.has("career_history")).override_failure_message(
		"연도 기록이 아예 안 달렸다").is_true()
	assert_int(n["career_history"].size()).is_equal(1)
	assert_bool(n.has("career_events")).override_failure_message(
		"경력 사건이 아예 안 달렸다").is_true()
	assert_int(n["career_events"].size()).is_equal(1)


## ⚠ **은퇴 상태인데 리그가 아직 안 바뀐 선수를 다시 잡으면 안 된다.**
## 진로 배정이 그런 중간 상태를 만든다
func test_a_retired_player_with_a_stale_league_is_skipped() -> void:
	var n: Dictionary = _npc({"age": 40, "career_status": "retired",
		"league_id": "LEAGUE_KBL"})
	assert_array(Offseason.run([n], 2027, AlwaysRng.new())["retired"]).is_empty()
	assert_int(n["career_events"].size()).override_failure_message(
		"이미 은퇴한 선수에게 은퇴 사건이 또 붙었다").is_equal(0)
