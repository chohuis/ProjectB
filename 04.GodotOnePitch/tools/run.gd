extends SceneTree

## 계측·조사 진입점 — **하나로 모은다.**
##
##   godot --headless --script tools/run.gd -- <갈래> [옵션]
##   godot --headless --script tools/run.gd -- list
##
## 예:
##   ... -- bench:season
##   ... -- bench:save
##   ... -- study:careers --runs 30 --weeks 175 --shards 6 --shard 0
##
## ⚠ **이전 프로젝트는 진입점이 20개가 넘었다** (`scripts/*.cjs`). 갈래마다
## 인자 파싱·로그·조각 나누기를 다시 짜서, 한 곳을 고치면 나머지가 안 따라왔다.
## 여기 한 곳에 두고 갈래만 등록한다.
##
## 이전 프로젝트에서 비싸게 배운 것 둘을 여기 박아 둔다:
##
## **① 실패는 회차 단위로 잡는다.** try/catch가 루프 **밖**에 있어서 한 회차가
## 터지면 그 조각 12회가 통째로 날아간 적이 있다. 실패도 결과다 — 무엇이
## 터졌는지 적고 다음으로 간다. `run_isolated()`가 그 틀이다.
##
## **② 진행 상황을 파일에도 쓴다.** stdout만 쓰면 파이프에 버퍼링돼 몇 시간짜리
## 실행의 진행이 안 보인다.

const LOG_DIR := "user://logs"

var _log_path: String = ""
var _log_lines: PackedStringArray = PackedStringArray()
var _failures: int = 0


func _init() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if args.is_empty() or args[0] == "list" or args[0] == "--help":
		_print_tasks()
		quit(0)
		return

	var task: String = args[0]
	DirAccess.make_dir_recursive_absolute(LOG_DIR)
	_log_path = "%s/%s.log" % [LOG_DIR, task.replace(":", "-")]
	var f := FileAccess.open(_log_path, FileAccess.WRITE)
	if f: f.close()

	log_line("── %s ──" % task)
	var t0: int = Time.get_ticks_msec()
	var code: int = await _dispatch(task, args)
	log_line("")
	log_line("경과 %.1f초 · 실패 %d" % [(Time.get_ticks_msec() - t0) / 1000.0, _failures])
	log_line("기록 %s" % ProjectSettings.globalize_path(_log_path))
	quit(code if code != 0 else (1 if _failures > 0 else 0))


## ⚠ **코루틴이다.** `bench:day`가 프레임을 넘기므로 부르는 쪽도 기다려야
## 한다 — 안 기다리면 계측이 시작만 하고 종료 코드를 먼저 낸다
func _dispatch(task: String, args: PackedStringArray) -> int:
	match task:
		"bench:season":
			return _bench_season(args)
		"bench:game":
			return GameBench.new().run(log_line, fail,
				arg_int(args, "games", 200), arg_int(args, "seed", 20260813))
		"bench:day":
			return await _bench_day(args)
		"bench:save":
			return SaveBench.new().run(log_line, fail)
		"bench:rng":
			return RngProbe.new().run(log_line, fail)
		_:
			log_line("모르는 갈래: %s" % task)
			_print_tasks()
			return 2


func _print_tasks() -> void:
	print("갈래:")
	print("  bench:season   한 시즌 시뮬 (P0 게이트)")
	print("  bench:day      최악의 날 — 진짜 일정·진짜 엔진·프레임 쪼개기")
	print("  bench:save     저장·로드 성능")
	print("  bench:rng      난수 분포")
	print("")
	print("공통 옵션:  --runs N  --shards N  --shard N  --seed N")


# ── 갈래 ───────────────────────────────────────────────────────────

func _bench_season(args: PackedStringArray) -> int:
	var games: int = arg_int(args, "games", 2124)
	var seed_value: int = arg_int(args, "seed", 20260813)
	var sim := MatchSim.new()
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value

	var rosters: Array = BenchFixtures.make_league(rng, 102)

	# 예열 — 첫 호출은 스크립트 컴파일이 섞인다
	for i in 20:
		var w: Array = rosters[i % 102]
		var l: Array = rosters[(i + 1) % 102]
		sim.sim_game(w[0], l[0], w[1], l[1], i)

	var t0: int = Time.get_ticks_usec()
	var pitches: int = 0
	var runs: int = 0
	for g in games:
		var h: Array = rosters[g % 102]
		var a: Array = rosters[(g * 7 + 3) % 102]
		var r: PackedInt32Array = sim.sim_game(h[0], a[0], h[1], a[1], g)
		runs += r[0] + r[1]
		pitches += r[2]
	var sec: float = (Time.get_ticks_usec() - t0) / 1_000_000.0

	log_line("  %d경기  %.3f초  %d 투구/초" % [games, sec, int(pitches / maxf(sec, 0.0001))])
	log_line("  경기당 투구 %.1f · 득점 %.2f" % [float(pitches) / games, float(runs) / games])

	# 빠르기만 하고 야구가 아니면 의미 없다
	var pg: float = float(pitches) / games
	var rg: float = float(runs) / games
	if pg < 150.0 or pg > 400.0:
		fail("경기당 투구 %.1f — 정상 250~330" % pg)
	if rg < 3.0 or rg > 20.0:
		fail("경기당 득점 %.2f — 정상 6~12" % rg)
	if sec > 2.0:
		fail("게이트 2.0초 초과")
	return 0


# ── 공통 ───────────────────────────────────────────────────────────

func log_line(s: String) -> void:
	print(s)
	_log_lines.append(s)
	# ⚠ 매번 쓴다. stdout만 쓰면 파이프에 버퍼링돼 진행이 안 보인다 —
	# 몇 시간짜리 실행에서 이게 없으면 살았는지 죽었는지 모른다
	var f := FileAccess.open(_log_path, FileAccess.WRITE)
	if f:
		f.store_string("\n".join(_log_lines))
		f.close()


func fail(msg: String) -> void:
	_failures += 1
	log_line("  ✗ %s" % msg)


## 한 회차를 격리해서 돌린다 — 터져도 나머지가 산다.
##
## ⚠ 이전 프로젝트는 try/catch가 루프 **밖**에 있어서 한 회차가 터지면
## 그 조각 12회가 통째로 날아갔다. 조각 셋이 1~3회만 남기고 끝난 적이 있다.
func run_isolated(label: String, fn: Callable) -> Variant:
	var out: Variant = fn.call()
	if out == null:
		fail("%s 실패" % label)
	return out


static func arg_int(args: PackedStringArray, name: String, dflt: int) -> int:
	var i: int = args.find("--" + name)
	if i >= 0 and i + 1 < args.size():
		return int(args[i + 1])
	return dflt


static func arg_str(args: PackedStringArray, name: String, dflt: String) -> String:
	var i: int = args.find("--" + name)
	if i >= 0 and i + 1 < args.size():
		return args[i + 1]
	return dflt


static func has_flag(args: PackedStringArray, name: String) -> bool:
	return args.find("--" + name) >= 0


## 조각 나누기 — 여러 프로세스로 병렬 실행할 때 겹치지 않게
static func shard_indices(total: int, shards: int, shard: int) -> PackedInt32Array:
	var out := PackedInt32Array()
	if shards <= 1:
		for i in total:
			out.append(i)
		return out
	var i: int = shard
	while i < total:
		out.append(i)
		i += shards
	return out




## 최악의 날 — **일정이 정하는 값이지 우리가 고르는 값이 아니다**
func _bench_day(args: PackedStringArray) -> int:
	# ⚠ **트리에 붙이고 한 프레임 기다린다.** `_init`은 SceneTree 생성자라
	# 그 자리에서 바로 붙이면 `get_tree()`가 아직 null이고, 프레임을 넘기려는
	# 순간 터진다 — 계측은 0경기로 끝나고 원인은 스택 밑에 묻힌다
	var b := DayBench.new()
	root.add_child(b)
	await process_frame
	var code: int = await b.run(log_line, fail, arg_int(args, "seed", 20260813))
	b.queue_free()
	return code
