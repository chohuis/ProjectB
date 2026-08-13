extends RefCounted
class_name PitchStep

## 투구 한 번 — 카운트·아웃·주자·득점·기록을 한 번에 옮긴다. M2-5b.
##
## 원본: `packages/engine-native/src/match_engine.rs`의 `step_pitch_core`
##
## 여기는 **엮는 자리**다. 판정은 앞의 조각들이 한다:
##   `PitchOutcome`   착탄·스윙·컨택·품질
##   `BattedBall`     타구 종류·위치·수비
##   `MatchResult`    결과 코드 분류·좁히기
##   `Baserunning`    진루·도루·병살
##   `MatchState`     이닝 전환·득점 기록·종료 판정
##
## ⚠ **결과 코드 분류를 여기서 새로 적지 않는다.** 원본이 그 자리에
## "목록을 두 번 적으면 코드가 늘 때 빠뜨린 자리가 조용히 생긴다"고 적어 뒀다.


## 투구 하나 전체 — 도루 → 착탄 → 스윙 → 컨택 → 타구 → 수비 → 뒤처리.
##
## `{state, code, quality, ball, fielding, logs}`
static func step(state: Dictionary, decision: Dictionary, rng) -> Dictionary:
	if state.get("is_finished", false):
		return {"state": state, "code": "GAME_OVER", "quality": 0.0,
			"ball": {}, "fielding": {}, "logs": [] as Array[String]}

	var pitcher: Dictionary = state.get("pitcher", {})
	var batter: Dictionary = state.get("batter", {})

	# ① 투구 전에 주자가 뛴다
	var steal: Dictionary = Baserunning.attempt_steals(state.get("runners", {}),
		int(state.get("outs", 0)), pitcher.get("hold_runners", 50.0),
		state.get("manager_steal_boost", 0.0), rng)

	var pre: Dictionary = state.duplicate(true)
	pre["runners"] = steal["runners"]
	pre["outs"] = steal["outs"]
	# 도루사로 이닝이 끝날 수 있다
	if int(pre["outs"]) >= 3:
		pre = MatchState.flip_half(pre)

	# ② 착탄
	var second_empty: bool = pre["runners"].get("second", {}).is_empty()
	var third_empty: bool = pre["runners"].get("third", {}).is_empty()
	var situation: Dictionary = {
		"has_scoring": not (second_empty and third_empty),
		"is_full_base": not pre["runners"].get("first", {}).is_empty() \
			and not second_empty and not third_empty,
		"is_late": int(pre.get("inning", 1)) >= int(pre.get("inning_limit", 9)) - 2,
	}
	var target: Vector2 = PitchOutcome.zone_to_target(int(decision.get("location", 5)))
	var landing: Dictionary = PitchOutcome.resolve_landing(target,
		pitcher.get("control", 50.0), pre.get("stamina", 100.0), pre.get("mental", 50.0),
		situation, rng)

	# ③ 품질
	var ctx: Dictionary = pre.duplicate()
	ctx["decision"] = decision
	ctx["landing"] = landing["landing"]
	var quality: float = PitchOutcome.pitch_quality(ctx, rng)

	# ④ 스윙 → 결과 코드
	var swing: Dictionary = PitchOutcome.swing_decision(landing["landing"],
		decision.get("pitch_type", "fastball"), batter,
		landing["in_zone"], landing["in_shadow"], rng)

	var code: String
	if not swing["swung"]:
		code = "STRIKE_LOOK" if swing["umpire_strike"] else "BALL"
	else:
		var cq: float = PitchOutcome.contact_quality(quality, batter,
			landing["in_zone"], landing["in_shadow"])
		code = PitchOutcome.apply_hit_upgrade(
			PitchOutcome.resolve_contact(quality, cq, batter, rng),
			batter.get("power", 50.0), pre.get("weather", "sunny"), rng)

	# ⑤ 타구 → 수비
	var ball: Dictionary = BattedBall.resolve(code, decision, quality, rng)
	var fielding: Dictionary = {}
	if not ball.is_empty() and code == "INPLAY_OUT":
		fielding = BattedBall.resolve_fielding(ball, pre.get("fielders", []), rng)
		code = fielding["code"]

	var out: Dictionary = apply_result(code, ball, pre, decision, rng, fielding)
	out["quality"] = quality
	out["ball"] = ball
	out["fielding"] = fielding
	out["logs"] = (steal["logs"] as Array) + (out["logs"] as Array) \
		+ ([landing["miss_log"]] if not String(landing["miss_log"]).is_empty() else [])
	return out


## 결과 코드가 정해진 뒤의 처리. `{state, code, logs}`
##
## 착탄·스윙·컨택을 거쳐 코드를 뽑는 건 `step()`이 하고, 여기는 **그 뒤**만
## 맡는다. 나눠 둔 이유는 검사다 — 뒤처리를 보려고 난수 여덟 개를 맞추면
## 계수 하나만 바뀌어도 검사가 깨진다.
static func apply_result(code: String, ball: Dictionary, state: Dictionary,
		decision: Dictionary, rng, fielding: Dictionary = {}) -> Dictionary:
	if state.get("is_finished", false):
		return {"state": state, "code": "GAME_OVER", "logs": [] as Array[String]}

	var next: Dictionary = state.duplicate(true)
	var logs: Array[String] = []
	var result_code: String = code
	var outs_before: int = int(next.get("outs", 0))
	var count: Dictionary = next["count"]

	match code:
		"BALL":
			count["balls"] = int(count.get("balls", 0)) + 1
			if count["balls"] >= 4:
				result_code = "WALK"
				next["count"] = {"balls": 0, "strikes": 0}
				var walk: Dictionary = Baserunning.advance_on_walk(next["runners"], _runner_of(next))
				next["runners"] = walk["runners"]
				next = MatchState.add_runs(next, walk["runs"])

		"STRIKE_LOOK", "STRIKE_SWING":
			count["strikes"] = int(count.get("strikes", 0)) + 1
			if count["strikes"] >= 3:
				next["outs"] = int(next["outs"]) + 1
				next["count"] = {"balls": 0, "strikes": 0}

		"FOUL":
			# ⚠ 파울로 삼진을 잡지 않는다 — 승부가 너무 빨리 끝난다
			if int(count.get("strikes", 0)) < 2:
				count["strikes"] = int(count["strikes"]) + 1

		"INPLAY_OUT":
			next["outs"] = int(next["outs"]) + 1
			next["count"] = {"balls": 0, "strikes": 0}
			var dp: Dictionary = Baserunning.try_double_play(ball, next["runners"], outs_before, rng)
			if dp["is_double_play"]:
				next["outs"] = int(next["outs"]) + 1
				next["runners"] = dp["runners"]
			# 여기서야 타구 종류와 병살 여부가 다 정해진다 — 이제 코드를 좁힌다
			result_code = MatchResult.narrow_in_play_out(ball, dp["is_double_play"])

		"FIELDING_ERROR":
			next["count"] = {"balls": 0, "strikes": 0}
			# 실책은 단타와 같은 진루로 본다
			var adv: Dictionary = Baserunning.advance_on_hit(next["runners"], "HIT_SINGLE",
				_runner_of(next), rng)
			next["runners"] = adv["runners"]
			next = MatchState.add_runs(next, adv["runs"])
			next["outs"] = int(next["outs"]) + int(adv["extra_outs"])
			logs.append_array(adv["logs"])

		_:
			if MatchResult.is_hit(code):
				var adv: Dictionary = Baserunning.advance_on_hit(next["runners"], code,
					_runner_of(next), rng)
				next["runners"] = adv["runners"]
				next = MatchState.add_runs(next, adv["runs"])
				# ⚠ **주루사도 아웃이다.** 안 세면 이닝이 안 끝나고 투수
				# 이닝이 짧아져 9이닝당 피안타·ERA가 그대로 부푼다
				next["outs"] = int(next["outs"]) + int(adv["extra_outs"])
				next["count"] = {"balls": 0, "strikes": 0}
				logs.append_array(adv["logs"])

	# ⚠ **아웃을 "있었다/없었다"로 세면 안 된다.** 병살은 한 타석에 둘이고
	# 주루사도 아웃이다. 원본이 불리언이라 그 아웃들이 투수 이닝에 안 잡혔다
	var outs_added: int = maxi(int(next["outs"]) - outs_before, 0)
	var runs_added: int = _total_score(next) - _total_score(state)

	next["pitch_count"] = int(next.get("pitch_count", 0)) + 1
	_record_defense(next, fielding)
	_record_pitcher(next, result_code, outs_added, runs_added)
	_record_batter(next, state, result_code, outs_added)
	_push_pitch_type(next, decision.get("pitch_type", "fastball"))

	# ⚠ **콜드게임 판정은 3아웃 전환 전이다.** 전환이 이닝을 올리고 반을
	# 바꾸므로 뒤에서 보면 "말 종료"라는 조건이 이미 사라져 있다
	var cold: bool = int(next["outs"]) >= 3 and MatchState.is_cold_game(next)
	var cold_log: String = MatchState.finish_log(next) if cold else ""

	if int(next["outs"]) >= 3:
		next = MatchState.flip_half(next)

	if cold:
		next["is_finished"] = true
		logs.append(cold_log)
	elif MatchState.should_finish(next):
		next["is_finished"] = true
		logs.append(MatchState.finish_log(next))

	next["logs"] = (next.get("logs", []) as Array) + logs
	return {"state": next, "code": result_code, "logs": logs}


static func _runner_of(state: Dictionary) -> Dictionary:
	var b: Dictionary = state.get("batter", {})
	return {"speed": b.get("speed", 50.0), "instinct": b.get("instinct", 50.0)}


static func _total_score(state: Dictionary) -> int:
	var s: Dictionary = state.get("score", {})
	return int(s.get("home", 0)) + int(s.get("away", 0))


## 수비 기록.
##
## ⚠ **포구 실패와 송구 실패는 다른 칸이다.** 잡았는데 송구가 샌 건 실책이
## 아니다 — 한 칸에 몰면 수비율이 틀린다
static func _record_defense(state: Dictionary, fielding: Dictionary) -> void:
	if fielding.is_empty():
		return
	var d: Dictionary = state.get("defense", {})
	if d.is_empty():
		return
	if fielding.get("is_error", false):
		d["errors"] = int(d.get("errors", 0)) + 1
	elif fielding.get("throw_result", "") == "out":
		d["throw_outs"] = int(d.get("throw_outs", 0)) + 1
		d["assists"] = int(d.get("assists", 0)) + 1
	elif fielding.get("throw_result", "") == "safe":
		d["throw_safes"] = int(d.get("throw_safes", 0)) + 1


## 투수 기록. **삼진은 세 번째 스트라이크에만 센다**
static func _record_pitcher(state: Dictionary, code: String, outs_added: int, runs_added: int) -> void:
	var line: Dictionary = state.get("pitcher_line", {})
	if line.is_empty():
		return
	line["pc"] = int(line.get("pc", 0)) + 1
	line["outs"] = int(line.get("outs", 0)) + outs_added
	var count: Dictionary = state.get("count", {})
	var count_reset: bool = int(count.get("balls", 0)) == 0 and int(count.get("strikes", 0)) == 0

	if (code == "STRIKE_SWING" or code == "STRIKE_LOOK") and count_reset:
		line["k"] = int(line.get("k", 0)) + 1
	elif code == "WALK":
		line["bb"] = int(line.get("bb", 0)) + 1
	elif MatchResult.is_hit(code):
		line["h"] = int(line.get("h", 0)) + 1
	# 자책점 — 이번 투구로 늘어난 점수를 지금 투수 앞으로 단다.
	# (실책 실점 구분은 리그 시뮬도 안 한다 — 같은 수준으로 맞춘다)
	if runs_added > 0:
		line["er"] = int(line.get("er", 0)) + runs_added


## 타자 기록. **타석이 끝났을 때만** 쌓는다
static func _record_batter(state: Dictionary, before: Dictionary, code: String, outs_added: int) -> void:
	var is_k: bool = (code == "STRIKE_SWING" or code == "STRIKE_LOOK") \
		and int(before.get("count", {}).get("strikes", 0)) == 2
	if not (is_k or MatchResult.is_at_bat_over(code)):
		return

	var bid: String = state.get("batter", {}).get("id", "")
	if bid.is_empty():
		return

	var accum: Dictionary = state.get("batter_accum", {})
	var acc: Dictionary = accum.get(bid, {"pa": 0, "ab": 0, "h": 0, "hr": 0, "bb": 0, "k": 0, "rbi": 0})
	acc["pa"] = int(acc["pa"]) + 1
	# ⚠ 볼넷은 타석이지 타수가 아니다. 타수로 세면 타율이 통째로 내려간다
	if code != "WALK":
		acc["ab"] = int(acc["ab"]) + 1
	if MatchResult.is_hit(code):
		acc["h"] = int(acc["h"]) + 1
	if code == "HOME_RUN":
		acc["hr"] = int(acc["hr"]) + 1
	if code == "WALK":
		acc["bb"] = int(acc["bb"]) + 1
	if is_k:
		acc["k"] = int(acc["k"]) + 1

	# 타점 — 이번 타석에 들어온 자기 팀 점수
	var side: String = "away" if before.get("half", "top") == "top" else "home"
	acc["rbi"] = int(acc["rbi"]) + maxi(
		int(state.get("score", {}).get(side, 0)) - int(before.get("score", {}).get(side, 0)), 0)
	accum[bid] = acc


## ⚠ **안 자르면 경기 내내 자란다.** 패턴 판정은 최근 셋만 본다
static func _push_pitch_type(state: Dictionary, pitch_type: String) -> void:
	var last: Array = state.get("last_pitch_types", [])
	last.append(pitch_type)
	if last.size() > 5:
		last.remove_at(0)
	state["last_pitch_types"] = last
