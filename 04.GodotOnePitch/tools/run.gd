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
		"measure:injury":
			return InjuryMeasure.new().run(log_line, fail,
				arg_int(args, "seed", 20260813))
		"measure:engine":
			return EngineMeasure.new().run(log_line, fail,
				arg_int(args, "games", 400), arg_int(args, "seed", 20260813))
		"bench:day":
			return await _bench_day(args)
		"bench:save":
			return SaveBench.new().run(log_line, fail)
		"measure:offseason":
			return OffseasonMeasure.new().run(log_line, fail,
				arg_int(args, "years", 5), arg_int(args, "seed", 20270101))
		"measure:growth":
			return GrowthMeasure.new().run(log_line, fail,
				arg_int(args, "weeks", 52), arg_int(args, "seed", 20270101))
		"measure:career":
			return CareerMeasure.new().run(log_line, fail,
				arg_int(args, "careers", 60), arg_int(args, "seed", 20270101))
		"bench:rng":
			return RngProbe.new().run(log_line, fail)
		_:
			log_line("모르는 갈래: %s" % task)
			_print_tasks()
			return 2


func _print_tasks() -> void:
	print("갈래:")
	print("  bench:season   한 시즌 시뮬 — 진짜 엔진 (2,612경기)")
	print("  measure:engine 경기 엔진 분포 — 02 audit-engine과 대조용")
	print("  bench:day      최악의 날 — 진짜 일정·진짜 엔진·프레임 쪼개기")
	print("  bench:save     저장·로드 성능")
	print("  bench:rng      난수 분포")
	print("  measure:career 졸업반 진로 — 지명·진학·독립·입대 분포")
	print("  measure:growth NPC 주간 성장")
	print("  measure:offseason 오프시즌")
	print("")
	print("공통 옵션:  --runs N  --shards N  --shard N  --seed N")


# ── 갈래 ───────────────────────────────────────────────────────────

## 한 시즌 — **진짜 엔진으로 잰다.**
##
## ⚠ **이 갈래는 P0 뼈대(`MatchSim`)로 재고 있었다.** 던져버릴 스파이크
## 이식본에 합성 로스터를 물려 놓고 "시즌 0.6초"라고 불렀는데, **게임이
## 실제로 돌리는 엔진이 아니었다.** `GameBench` 주석에 "다시 재지 않으면
## 그 0.659초는 아무 뜻이 없다"고 적혀 있었는데 그대로 남아 있었다.
##
## ⚠ **경기당 투구가 왜 다른지도 여기서 풀린다**(D-1). 실측 167구인데
## 게이트는 250~330이었다 — 두 값이 다른 게 아니라 **다른 엔진의 값**이었다.
func _bench_season(args: PackedStringArray) -> int:
	return GameBench.new().run(log_line, fail,
		arg_int(args, "games", 800), arg_int(args, "seed", 20270101))


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
