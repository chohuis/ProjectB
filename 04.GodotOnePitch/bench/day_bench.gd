extends Node
class_name DayBench

## 진행 실행기를 **진짜 일정 · 진짜 경기 엔진**으로 잰다. M7-3.
##
## ⚠ **`bench:game`은 합성 부하다.** "경기 98개를 연달아 돌리면 몇 초"를
## 재는 것이라, 진행기가 붙은 뒤의 실제 모습과 다르다:
##
##   · 일정이 정하는 **진짜 최악의 날**이 몇 경기인지 안 본다
##   · 프레임을 넘기느라 드는 값을 안 센다
##   · 하루 진행에 딸린 나머지(정지 판정·주 경계)를 안 센다
##
## 여기가 그걸 잰다. **사용자가 진행 버튼을 누르고 기다리는 시간**이다.


## 실측 (2027 시즌 · 9개 리그 · 창 모드):
##
##   일정 6,396경기 · 최악의 날 118일차 **83경기**
##   일하는 시간          0.712초   기준 1.0초
##   실제 기다리는 시간   1.078초   기준 2.0초  (프레임 64번 넘김)
##
## ⚠ **헤드리스로 재면 기다리는 시간이 안 나온다.** 렌더가 없어서
## `process_frame`이 거의 즉시라 0.696초로 나온다 — 실제보다 0.4초 짧다.
## 게이트를 헤드리스 값으로 잡으면 창에서 넘는다


## 화면이 멈춘 것처럼 보이지 않는 한계. `bench:game`과 같은 기준이다
const GATE_DAY_SECONDS: float = 1.0

## 프레임을 넘기는 값까지 포함한 한계.
##
## ⚠ **넘기면 그만큼 늘어난다.** 얼어붙는 것보다는 낫지만 기어가면 그것대로
## 못 쓴다 — 실측 0.712 → 1.078초로 0.37초가 붙는다
const GATE_DAY_WALL_SECONDS: float = 2.0


func run(log_line: Callable, fail: Callable, seed_value: int) -> int:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value

	var season_year: int = 2027

	# ⚠ **리그마다 짜서 합친다.** `Schedule.build`는 리그 하나짜리다 —
	# 통째로 부르면 조용히 빈 배열이 나온다(팀도 경기 수도 안 넘어가서)
	var schedule: Array = []
	for lid in Schedule.LEAGUES:
		var teams: Array = []
		for i in int(Schedule.TEAM_COUNTS[lid]):
			teams.append("TEAM_%s_%02d" % [lid.substr(7, 3), i])
		schedule.append_array(Schedule.build_league(lid, teams, season_year))

	# 하루에 경기가 제일 많은 날을 찾는다 — **일정이 정하는 값이지
	# 우리가 고르는 값이 아니다**
	var by_day: Dictionary = {}
	for g in schedule:
		var d: int = int(g.get("day", 0))
		by_day[d] = int(by_day.get(d, 0)) + 1

	var worst_day: int = 0
	var worst_count: int = 0
	for d in by_day:
		if int(by_day[d]) > worst_count:
			worst_count = int(by_day[d])
			worst_day = d

	log_line.call("  일정 %d경기 · 최악의 날 %d일차 %d경기" % [
		schedule.size(), worst_day, worst_count])

	# 그 하루만 담은 상태를 만든다
	var day_games: Array = []
	for g in schedule:
		if int(g.get("day", 0)) == worst_day:
			var e: Dictionary = g.duplicate()
			e["is_protagonist_game"] = false
			e["result"] = null
			day_games.append(e)

	var state: Dictionary = {
		"day": worst_day, "season_days": Calendar.DAYS_PER_SEASON,
		"season_year": season_year,
		"protagonist": {"condition": 80.0, "injury": null,
			"eligibility_blocked": false, "retired": false},
		"schedule": day_games, "pending": [], "mailbox": [],
	}

	# 예열 — 첫 호출은 스크립트 컴파일이 섞인다
	for i in 5:
		GameLoop.play(GameBench.make_state(rng), rng, GameBench._decide)

	# ⚠ **람다가 잡은 지역 변수에 다시 대입하면 밖으로 안 나온다.** 사전에
	# 담아 제자리에서 고친다 — 안 그러면 계측이 조용히 전부 0을 낸다
	var acc: Dictionary = {"played": 0, "pitches": 0, "busy": 0}
	# ⚠ 진행기가 **경기가 속한 상태를 같이 넘긴다** — 시뮬이 거기에 성적을
	# 쌓기 때문이다. 인자 수가 어긋나면 계측이 0경기로 나온다
	var sim := func(_g: Dictionary, _state: Dictionary) -> void:
		var t := Time.get_ticks_usec()
		var out: Dictionary = GameLoop.play(GameBench.make_state(rng), rng, GameBench._decide)
		acc["busy"] += Time.get_ticks_usec() - t
		acc["pitches"] += int(out["pitches"])
		acc["played"] += 1

	var runner := DayRunner.new()
	add_child(runner)

	var t0: int = Time.get_ticks_usec()
	await runner.run(state, 1, sim)
	var wall: float = (Time.get_ticks_usec() - t0) / 1_000_000.0
	var busy: float = acc["busy"] / 1_000_000.0
	var played: int = acc["played"]
	var pitches: int = acc["pitches"]

	log_line.call("  %d경기 돌림 · 투구 %d" % [played, pitches])
	log_line.call("  일하는 시간 %.3f초  (기준 %.1f초)" % [busy, GATE_DAY_SECONDS])
	log_line.call("  실제 기다리는 시간 %.3f초 · 프레임 %d번 넘김  (기준 %.1f초)" % [
		wall, runner.frames_yielded, GATE_DAY_WALL_SECONDS])

	if played != worst_count:
		fail.call("경기 수가 안 맞는다 — 돌린 %d, 일정 %d" % [played, worst_count])
	if busy > GATE_DAY_SECONDS:
		fail.call("최악의 날 %.3f초 — 게이트 %.1f초를 넘었다" % [busy, GATE_DAY_SECONDS])
	if wall > GATE_DAY_WALL_SECONDS:
		fail.call("기다리는 시간 %.3f초 — 게이트 %.1f초를 넘었다 (프레임을 너무 자주 넘긴다)"
			% [wall, GATE_DAY_WALL_SECONDS])
	# ⚠ **한 번도 안 넘기면 프레임 쪼개기가 안 도는 것이다** — 그러면
	# 화면이 그 시간 내내 멈춘다
	if runner.frames_yielded == 0 and busy > 0.05:
		fail.call("프레임을 한 번도 안 넘겼다 — 화면이 %.3f초 멈춘다" % busy)

	runner.queue_free()
	return 0
