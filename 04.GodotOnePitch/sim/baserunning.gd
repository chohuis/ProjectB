extends RefCounted
class_name Baserunning

## 주루 — 진루·도루·병살. M2-1.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##
## 주자 배치는 사전이다: `{"first": 주자, "second": 주자, "third": 주자}`.
## **빈 사전이 "주자 없음"이다** — null을 쓰면 `.get()` 자리마다 가드가 붙는다.
## 주자 한 명은 `{"speed": float, "instinct": float}`.
##
## ⚠ **난수기를 인자로 받는다.** 전역 흐름 하나를 쓰면 난수 호출을 하나
## 추가하는 순간 그 뒤가 전부 밀린다. 검사에서 값을 손으로 넣어 갈래를
## 짚을 수 있는 것도 이 구조 덕이다 — 통계로만 보면 "성공/실패가 뒤바뀐"
## 변이를 못 잡는다(비율은 그대로다).


## 추가 진루 상황별 [시도 확률, 성공 확률]의 바닥값.
##
## 도루 계수와 달리 여기는 리그 시뮬이 안 쓴다 — `Tuning`에 올리지 않는다
const EXTRA_BASE_ODDS: Dictionary = {
	"1st_to_3rd_single": [0.20, 0.72],
	"2nd_scores_single": [0.35, 0.63],
	"1st_scores_double": [0.30, 0.58],
}


static func _empty_bases() -> Dictionary:
	return {"first": {}, "second": {}, "third": {}}


# ── 볼넷 ───────────────────────────────────────────────────────────

## ⚠ **밀어내기는 앞이 막혔을 때만이다.** 1루가 비어 있으면 2·3루 주자는
## 제자리다 — 조건 없이 밀면 주자가 공짜로 한 베이스씩 간다
static func advance_on_walk(runners: Dictionary, new_runner: Dictionary) -> Dictionary:
	var first: Dictionary = runners.get("first", {})
	var second: Dictionary = runners.get("second", {})
	var third: Dictionary = runners.get("third", {})
	var runs: int = 0

	if not first.is_empty():
		if not second.is_empty():
			if not third.is_empty():
				runs = 1
			third = second
			second = first
		else:
			second = first

	return {"runners": {"first": new_runner, "second": second, "third": third}, "runs": runs}


# ── 추가 진루 ──────────────────────────────────────────────────────

## "stop" · "advance" · "out".
##
## 발과 주루 센스가 시도 확률을 올리고, 성공 확률은 발만 본다
static func try_extra_base(runner: Dictionary, ctx: String, rng) -> String:
	if not EXTRA_BASE_ODDS.has(ctx):
		# 모르는 상황에서 주자를 뛰게 하지 않는다
		return "stop"
	var odds: Array = EXTRA_BASE_ODDS[ctx]
	var speed: float = runner.get("speed", 50.0)
	var instinct: float = runner.get("instinct", 50.0)
	var speed_mod: float = (speed - 50.0) * 0.005
	var instinct_mod: float = (instinct - 50.0) * 0.003

	if rng.randf() >= clampf(odds[0] + speed_mod + instinct_mod, 0.02, 0.75):
		return "stop"
	return "advance" if rng.randf() < clampf(odds[1] + speed_mod, 0.15, 0.95) else "out"


## 안타에 따른 진루. `{runners, runs, extra_outs, logs}`
static func advance_on_hit(runners: Dictionary, code: String, new_runner: Dictionary, rng) -> Dictionary:
	var first: Dictionary = runners.get("first", {})
	var second: Dictionary = runners.get("second", {})
	var third: Dictionary = runners.get("third", {})
	var next: Dictionary = _empty_bases()
	var runs: int = 0
	var extra_outs: int = 0
	var logs: Array[String] = []

	match code:
		"HOME_RUN":
			runs = 1 + (1 if not first.is_empty() else 0) \
				+ (1 if not second.is_empty() else 0) \
				+ (1 if not third.is_empty() else 0)

		"HIT_TRIPLE":
			runs = (1 if not first.is_empty() else 0) \
				+ (1 if not second.is_empty() else 0) \
				+ (1 if not third.is_empty() else 0)
			next["third"] = new_runner

		"HIT_DOUBLE":
			if not third.is_empty():
				runs += 1
			if not second.is_empty():
				runs += 1
			if not first.is_empty():
				match try_extra_base(first, "1st_scores_double", rng):
					"advance":
						runs += 1
						logs.append("적극 주루! 1루 주자 홈인 (스피드 %d)" % int(first.get("speed", 0)))
					"out":
						extra_outs += 1
						logs.append("주루 아웃! 1루 주자 홈 태그아웃 (스피드 %d)" % int(first.get("speed", 0)))
					_:
						next["third"] = first
			next["second"] = new_runner

		"HIT_SINGLE":
			if not third.is_empty():
				runs += 1
			if not second.is_empty():
				match try_extra_base(second, "2nd_scores_single", rng):
					"advance":
						runs += 1
						logs.append("적극 주루! 2루 주자 홈인 (스피드 %d)" % int(second.get("speed", 0)))
					"out":
						extra_outs += 1
						logs.append("주루 아웃! 2루 주자 홈 태그아웃 (스피드 %d)" % int(second.get("speed", 0)))
					_:
						next["third"] = second
			if not first.is_empty():
				# ⚠ **앞 주자가 3루에 멈췄으면 뒤 주자는 3루를 노리지 않는다.**
				# 같은 베이스에 둘을 세우면 그 뒤 진루 계산이 통째로 어긋난다
				if next["third"].is_empty():
					match try_extra_base(first, "1st_to_3rd_single", rng):
						"advance":
							next["third"] = first
							logs.append("적극 주루! 1루 주자 3루까지 (스피드 %d)" % int(first.get("speed", 0)))
						"out":
							extra_outs += 1
							logs.append("주루 아웃! 1루 주자 3루 태그아웃 (스피드 %d)" % int(first.get("speed", 0)))
						_:
							next["second"] = first
				else:
					next["second"] = first
			next["first"] = new_runner

		_:
			# 안타가 아니면 주자는 그대로다
			return {"runners": {"first": first, "second": second, "third": third},
				"runs": 0, "extra_outs": 0, "logs": [] as Array[String]}

	return {"runners": next, "runs": runs, "extra_outs": extra_outs, "logs": logs}


# ── 도루 ───────────────────────────────────────────────────────────

## 투구 전에 주자가 뛴다. `{runners, outs, logs, steals, caught}`
##
## ⚠ **계수는 `Tuning`이 갖는다** — 리그 시뮬이 같은 규칙을 쓴다. 두 벌로
## 두면 주인공 기록과 리그 기록이 다른 척도가 되고, 원본에서 실제로 그래서
## **리그 전체 도루가 0**이었다
static func attempt_steals(runners: Dictionary, outs: int, pitcher_hold: float,
		manager_boost: float, rng) -> Dictionary:
	var first: Dictionary = runners.get("first", {})
	var second: Dictionary = runners.get("second", {})
	var third: Dictionary = runners.get("third", {})
	var logs: Array[String] = []
	var steals: int = 0
	var caught: int = 0
	var hold_factor: float = Tuning.steal_hold_factor(pitcher_hold)

	# 1루 → 2루. 2루가 차 있으면 갈 곳이 없다
	if not first.is_empty() and second.is_empty():
		var speed: float = first.get("speed", 50.0)
		var probs: Array = Tuning.steal_second_probs(speed, first.get("instinct", 50.0),
			hold_factor, manager_boost)
		if rng.randf() < probs[0]:
			if rng.randf() < probs[1]:
				second = first
				first = {}
				steals += 1
				logs.append("도루 성공! 1루→2루 (스피드 %d)" % int(speed))
			else:
				first = {}
				outs += 1
				caught += 1
				logs.append("도루 실패! 1루 주자 아웃 (스피드 %d)" % int(speed))

	# 2루 → 3루. 문턱 미만은 `steal_third_probs`가 [0, 0]을 준다
	if not second.is_empty() and third.is_empty():
		var speed: float = second.get("speed", 50.0)
		var probs: Array = Tuning.steal_third_probs(speed, second.get("instinct", 50.0),
			hold_factor, manager_boost)
		if probs[0] > 0.0 and rng.randf() < probs[0]:
			if rng.randf() < probs[1]:
				third = second
				second = {}
				steals += 1
				logs.append("도루 성공! 2루→3루 (스피드 %d)" % int(speed))
			else:
				second = {}
				outs += 1
				caught += 1
				logs.append("도루 실패! 2루 주자 아웃 (스피드 %d)" % int(speed))

	return {
		"runners": {"first": first, "second": second, "third": third},
		"outs": outs, "logs": logs, "steals": steals, "caught": caught,
	}


# ── 병살 ───────────────────────────────────────────────────────────

## ⚠ **타구 종류를 본다.** 원본은 안 봐서 주자 1루면 **뜬공에도 22%로 병살이
## 붙었다** — 결과 코드가 `INPLAY_OUT` 하나뿐이라 화면엔 "아웃"으로만 나와
## 안 보였다. 코드를 쪼개자마자 "중견수 병살타"가 로그에 찍혔다
static func try_double_play(ball: Dictionary, runners: Dictionary, outs_before: int, rng) -> Dictionary:
	var first: Dictionary = runners.get("first", {})
	var second: Dictionary = runners.get("second", {})
	var third: Dictionary = runners.get("third", {})
	var unchanged: Dictionary = {"is_double_play": false,
		"runners": {"first": first, "second": second, "third": third}}

	if outs_before >= 2 or first.is_empty():
		return unchanged

	var type_mod: float
	match ball.get("hit_type", ""):
		"groundBall", "bunt":
			type_mod = 1.0
		"lineDrive":
			type_mod = Tuning.DOUBLE_PLAY_LINEDRIVE_MOD
		_:
			# 뜬공·팝업으로는 병살이 안 된다. 타구 정보가 없어도 지어내지 않는다
			type_mod = 0.0
	if type_mod <= 0.0:
		return unchanged

	# 앞 주자가 있으면 잡을 곳이 는다
	var prob: float = (Tuning.DOUBLE_PLAY_BASE_PROB
		+ (0.05 if not second.is_empty() else 0.0)
		+ (0.03 if not third.is_empty() else 0.0)) * type_mod
	if rng.randf() >= prob:
		return unchanged

	# 1루 주자만 지워진다 — 타자는 1루에서 아웃이고 2·3루는 그대로다
	return {"is_double_play": true, "runners": {"first": {}, "second": second, "third": third}}
