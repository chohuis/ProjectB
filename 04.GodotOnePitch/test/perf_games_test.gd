extends GdUnitTestSuite

## 성장의 성적 항이 **실제 출전 수**를 본다 — D-2.
##
## ⚠ **02의 결함을 물려받고 있었다.** 02는 `gamesPlayed`를 늘 `1`로 넣어서
## `perf_factor`의 `games` 항이 언제나 `1/GAMES_FULL`이 된다. 그 결과:
##
##   성적이 **있는** 선수 → 0.2 × 품질(최대 0.28)
##   성적이 **없는** 선수 → 0.70 (`NO_PERF_BASE`)
##
## **뛰면 손해다.** 04는 일정에 진짜 출전 기록이 있으므로 셀 수 있다 —
## 지어내는 값이 아니라 **이미 있는 값을 안 읽고 있던 것**이다.
##
## ⚠ 이건 P-11과 같은 판단이다: **02의 명백한 결함까지 물려받지 않는다.**


func _line(pid: String, ip: float) -> Dictionary:
	return {"player_id": pid, "role": "pitcher", "er": 1.0, "ip": ip}


## 같은 투수가 `n`경기에 나온 일정
func _schedule(pid: String, n: int) -> Array:
	var out: Array = []
	for i in n:
		out.append({"day": i + 1, "result": {"player_lines": [_line(pid, 6.0)]}})
	return out


func test_한_경기면_하나로_센다() -> void:
	var perf: Dictionary = NpcGrowth.perf_window(_schedule("P1", 1), 28)
	assert_int(int(perf["P1"]["games_played"])).is_equal(1)


## ⚠ **여기가 D-2다.** 열 경기를 뛰었는데 1로 세면 성장이 안 붙는다
func test_열_경기면_열로_센다() -> void:
	var perf: Dictionary = NpcGrowth.perf_window(_schedule("P1", 10), 28)
	assert_int(int(perf["P1"]["games_played"])).override_failure_message(
		"열 경기를 뛰었는데 %d로 셌다 — 02의 gamesPlayed 1을 그대로 물려받았다"
			% int(perf["P1"]["games_played"])).is_equal(10)


## 창 밖 경기는 안 센다 — 창이 없으면 시즌 내내 누적돼 항이 늘 최대가 된다
func test_창_밖은_안_센다() -> void:
	var sched: Array = _schedule("P1", 10)
	sched.append({"day": 9999, "result": {"player_lines": [_line("P1", 6.0)]}})
	assert_int(int(NpcGrowth.perf_window(sched, 28)["P1"]["games_played"])) \
		.is_equal(10)


## 안 치른 경기는 안 센다
func test_결과가_없으면_안_센다() -> void:
	var sched: Array = _schedule("P1", 3)
	sched.append({"day": 4, "result": null})
	assert_int(int(NpcGrowth.perf_window(sched, 28)["P1"]["games_played"])) \
		.is_equal(3)


## 타자도 같이 센다 — 한쪽만 고치면 투타 성장이 갈린다
func test_타자도_센다() -> void:
	var sched: Array = []
	for i in 7:
		sched.append({"day": i + 1, "result": {"player_lines": [
			{"player_id": "B1", "role": "batter", "h": 1.0, "ab": 4.0}]}})
	assert_int(int(NpcGrowth.perf_window(sched, 28)["B1"]["games_played"])) \
		.is_equal(7)


## ⚠ **많이 뛴 선수가 손해를 안 본다.** D-2의 증상 그 자체다 —
## 성적이 없는 선수(`NO_PERF_BASE`)보다 낮으면 안 된다
func test_많이_뛰면_안_뛴_것보다_낫다() -> void:
	var many: Dictionary = NpcGrowth.perf_window(
		_schedule("P1", int(NpcGrowth.GAMES_FULL)), 28)["P1"]
	var played: float = NpcGrowth.perf_factor(many, "season", "pitcher")
	var idle: float = NpcGrowth.perf_factor({}, "season", "pitcher")
	assert_float(played).override_failure_message(
		"꽉 채워 뛴 선수(%.2f)가 한 경기도 안 뛴 선수(%.2f)보다 못 큰다"
			% [played, idle]).is_greater(idle)


## ⚠ **포화점에서 자른다.** 안 자르면 스무 경기를 뛴 선수가 `games` 4.0을
## 받아 성장이 네 배가 된다 — 02도 `min(1.0)`이다
func test_포화점_위로는_안_는다() -> void:
	var full: Dictionary = {"games_played": int(NpcGrowth.GAMES_FULL)}
	var lots: Dictionary = {"games_played": int(NpcGrowth.GAMES_FULL) * 4}
	assert_float(NpcGrowth.perf_factor(lots, "season", "pitcher")) \
		.override_failure_message("포화점 위로도 계속 는다 — min(1.0)이 없다") \
		.is_equal_approx(NpcGrowth.perf_factor(full, "season", "pitcher"), 0.001)


## 성적이 없으면 여전히 기준값이다 — 고치면서 이쪽을 건드리면 안 된다
func test_성적이_없으면_기준값이다() -> void:
	assert_float(NpcGrowth.perf_factor({}, "season", "pitcher")) \
		.is_equal_approx(NpcGrowth.NO_PERF_BASE
			* float(NpcGrowth.PHASE_WEIGHT.get("season", 1.0)), 0.001)
