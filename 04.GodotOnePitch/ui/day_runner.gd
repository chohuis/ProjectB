extends Node
class_name DayRunner

## 진행 실행기 — M7-3. **프레임 쪼개기.**
##
## ⚠ **M2가 남긴 숙제다.** 최악의 날이 83경기 0.69초인데 그걸 한 프레임에
## 다 돌리면 화면이 **멈춘 것처럼 보인다.** 경기 사이에 프레임을 넘기면
## 그게 진행 표시가 된다.
##
## M2에서 안 만든 이유는 **소비자가 없었기 때문**이다 — 소비자 없는 API를
## 미리 만들면 실제로 필요한 모양과 어긋난다. 이제 진행 버튼이 생겼다.
##
## ⚠ **판단은 `DayEngine`이 한다.** 여기는 그 판단을 하루씩 밟으면서 중간에
## 숨을 쉴 뿐이다. 결과가 `DayEngine.advance_to`와 같아야 하고, 검사가
## 그걸 대조한다 — 두 경로가 갈리면 어느 쪽이 맞는지 알 방법이 없다.


## 한 프레임에 쓸 시간. 넘으면 다음 프레임으로 넘긴다.
##
## ⚠ **너무 짧으면 프레임 값이 더 비싸다.** 한 번 넘길 때마다 약 16ms가
## 드는데 예산이 1ms면 일하는 시간보다 기다리는 시간이 길어진다.
## 8ms면 60fps 예산(16.7ms)의 절반이라 화면이 부드럽게 남는다
const FRAME_BUDGET_USEC: int = 8000

## 얼마나 갔나 / 얼마나 가야 하나 (일 단위)
signal progress(done: int, total: int)

## 넘긴 프레임 수 — 검사가 본다
var frames_yielded: int = 0

## 겹쳐 불려서 거절한 횟수.
##
## ⚠ **조용히 거절하면 안 된다.** GDScript는 코루틴 결과를 안 기다리고
## 버릴 수 있어서, 겹친 호출이 빈 사전을 받고도 호출부가 그걸 못 본다 —
## 그러면 "진행 버튼을 눌렀는데 아무 일도 안 났다"의 원인을 못 찾는다
var rejected_runs: int = 0

var _running: bool = false


func is_running() -> bool:
	return _running


## 하루씩 밟는다. `sim`은 경기 사전 하나를 받아 돌린다.
##
## ⚠ **겹쳐 부르면 빈 사전을 준다.** 두 번 겹쳐 돌면 같은 경기를 두 번
## 돌려서 순위표에 승패가 두 번 들어간다 — 진행 버튼을 빠르게 두 번 누르는
## 건 흔한 일이다
func run(state: Dictionary, days: int, sim: Callable) -> Dictionary:
	if _running:
		rejected_runs += 1
		return {}
	_running = true
	frames_yielded = 0

	var out: Dictionary = state.duplicate(true)
	var start: int = out.get("day", 0)
	var target: int = start + days
	var budget: int = Time.get_ticks_usec()

	progress.emit(0, maxi(days, 0))

	while out["day"] < target:
		var before: int = out["day"]
		var step: Dictionary = DayEngine.advance_day(out)
		if step["day"] == before:
			# 멈췄다 — 하루도 안 나아갔다.
			# 이유는 아래에서 다시 묻는다 — 여기서 붙잡아 둘 필요가 없다
			out = step
			break
		out = step

		for g in step["games_today"]:
			# ⚠ **경기가 속한 상태를 같이 넘긴다.** 여기서 도는 건 복사본이라,
			# 시뮬이 바깥 사전에 뭔가를 쌓으면 진행이 끝날 때 **통째로 덮어써진다** —
			# 성장이 조용히 사라졌던 것과 같은 형태다
			sim.call(g, out)
			# ⚠ **경기 하나마다 예산을 본다.** 하루가 끝날 때만 보면 83경기가
			# 든 날에 그 하루가 통째로 한 프레임이 된다 — 여기가 제일 무거운 날이다
			if Time.get_ticks_usec() - budget >= FRAME_BUDGET_USEC:
				progress.emit(out["day"] - start, days)
				await get_tree().process_frame
				frames_yielded += 1
				budget = Time.get_ticks_usec()

	# ⚠ **주 경계는 출발점과 도착점으로 다시 센다.** 하루씩 더하면
	# 멈춘 날의 몫이 섞인다
	out["weeks_crossed"] = DayEngine.week_boundaries_crossed(start, out["day"])
	out["stopped_by"] = DayEngine.stop_reason(out)
	out["games_today"] = []

	progress.emit(out["day"] - start, maxi(days, 0))
	_running = false
	return out
