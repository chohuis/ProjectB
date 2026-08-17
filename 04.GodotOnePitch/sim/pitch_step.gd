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


## 이 투수가 그 구종을 얼마나 다듬었나 — **없으면 기준(3)으로 본다.**
##
## ⚠ 기준값이 예전 고정값과 같다. NPC는 아직 구종 배열이 없어서 지금과
## 똑같이 굴러간다 — 밸런스가 동결이라 그래야 한다. 배열을 갖는 건
## 주인공뿐이고, 훈련으로 올린 숙련도가 그때 결과에 닿는다
const DEFAULT_GRADE: int = 3


static func grade_of(pitcher: Dictionary, pitch_type: String) -> int:
	for a in pitcher.get("pitches", []):
		if String(a.get("id", "")) == pitch_type:
			return int(a.get("grade", DEFAULT_GRADE))
	return DEFAULT_GRADE


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

	# ⚠ **제자리에서 고친다** — 복사본이 필요하면 호출부가 직접 복사한다
	var pre: Dictionary = state
	pre["runners"] = steal["runners"]
	pre["outs"] = steal["outs"]
	# 도루사로 이닝이 끝날 수 있다
	if int(pre["outs"]) >= 3:
		MatchState.flip_half(pre)

	# ② 착탄
	var second_empty: bool = pre["runners"].get("second", {}).is_empty()
	var third_empty: bool = pre["runners"].get("third", {}).is_empty()
	var situation: Dictionary = {
		"has_scoring": not (second_empty and third_empty),
		"is_full_base": not pre["runners"].get("first", {}).is_empty() \
			and not second_empty and not third_empty,
		"is_late": int(pre.get("inning", 1)) >= int(pre.get("inning_limit", 9)) - 2,
	}
	# ⚠ **스태미나·멘탈이 팀별이다.** 하나로 두면 한 팀 투수가 지칠 때
	# 상대 투수도 같이 지친다 — 02는 `npc_pitcher_stamina.my`/`.opponent`다.
	# 팀별 값이 없으면 예전처럼 하나로 떨어진다(조각 검사가 그대로 돈다)
	var side: String = _side_of(pre)
	pre["stamina"] = _stat_of(pre, side, "stamina", 100.0)
	pre["mental"] = _stat_of(pre, side, "mental", 50.0)

	# ⚠ **좌표가 있으면 그걸 쓴다** (P-1). 존 번호만 보면 `zone_to_target`이
	# 아홉 칸 대표값으로 되돌려서 **코너도 유인구도 다 뭉갠다** — 존 밖이
	# 아예 표현이 안 돼서 볼넷이 영원히 0이었다.
	# 좌표가 없는 호출부(사용자 투구·옛 검사)는 예전 그대로 돈다
	var target: Vector2 = decision["target"] if decision.get("target") is Vector2 \
		else PitchOutcome.zone_to_target(int(decision.get("location", 5)))
	var landing: Dictionary = PitchOutcome.resolve_landing(target,
		pitcher.get("control", 50.0), pre["stamina"], pre["mental"],
		situation, rng)

	# ③ 품질 — 투구·착탄은 인자로 넘긴다. 상태에 끼워 넣으면 복사가 생긴다
	#
	# ⚠ **던지는 공의 숙련도를 여기서 건다.** 안 걸면 화면엔 "숙련도 4/5"라고
	# 적혀 있는데 던지면 차이가 없다 — 02가 그 상태였고 원본 주석이
	# "배운 구종은 경기에 안 나왔고 숙련도도 결과에 안 닿았다"고 적어 뒀다
	pre["grade"] = grade_of(pitcher, decision.get("pitch_type", "fastball"))
	var quality: float = PitchOutcome.pitch_quality(pre, decision, landing["landing"], rng)

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

	var outs_before: int = int(pre.get("outs", 0))
	var out: Dictionary = apply_result(code, ball, pre, decision, rng, fielding)

	# ⚠ **착탄 좌표를 남긴다** (M-7). 여기서 쓰고 버려서 **화면이 마지막 공이
	# 어디 떨어졌는지 못 보여줬다** — M-0 대조표에서 04에 진짜로 없던 유일한
	# 데이터다. 존 기준(`|x| <= 1`이 스트라이크)이고 `last_pitch_types`와 같은
	# 방식으로 둔다.
	# ⚠ **`ball`이 아니다** — 그건 맞은 타구고 안 맞으면 비어 있다
	(out["state"] as Dictionary)["last_landing"] = landing["landing"]

	# ⑥ 스태미나·멘탈. **던진 쪽만 움직인다**
	#
	# ⚠ **이게 없어서 스태미나가 경기 내내 82로 고정이었다.** 지친 투수가
	# 안 나빠졌고 `pitch_quality`의 `stamina_penalty`가 영영 0이었다
	_drain(pre, side, code, decision, pitcher, outs_before)

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

	# ⚠ **제자리에서 고친다.** 투구마다 상태를 복사하면 그것만으로 시간의
	# 절반이 간다(실측 54.3 → 23.6초). 복사본이 필요하면 호출부가 직접 복사한다.
	#
	# ⚠ **그래서 "이전 값"을 먼저 붙잡아야 한다.** 안 그러면 나중에 자기
	# 자신과 비교하게 되어 득점·타점이 전부 0이 된다 — 조용히 틀린다
	var next: Dictionary = state
	var logs: Array[String] = []
	var result_code: String = code
	var outs_before: int = int(next.get("outs", 0))
	var score_before: int = _total_score(next)
	var half_before: String = next.get("half", "top")
	var strikes_before: int = int(next.get("count", {}).get("strikes", 0))
	var side_before: int = int(next.get("score", {}).get(
		"away" if half_before == "top" else "home", 0))
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
	var runs_added: int = _total_score(next) - score_before

	next["pitch_count"] = int(next.get("pitch_count", 0)) + 1
	_record_defense(next, fielding)
	_record_pitcher(next, result_code, outs_added, runs_added)
	_record_batter(next, result_code, strikes_before, half_before, side_before)
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
	# ⚠ **투수 기록을 어느 줄에 다나.** 원래 `pitcher_line` 하나였는데,
	# 그러면 **양 팀 투수 성적이 한 줄에 섞인다** — 리그 성적표를 이을 때
	# 드러났다(자책점이 두 배, 상대 팀 삼진이 내 것으로).
	#
	# 부르는 쪽이 이닝 반쪽마다 `pitcher_line_key`를 바꾼다. 안 주면
	# 예전처럼 `pitcher_line`으로 떨어진다 — 조각 검사가 그대로 돈다
	var line: Dictionary = state.get(state.get("pitcher_line_key", "pitcher_line"), {})
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


## 타자 기록. **타석이 끝났을 때만** 쌓는다.
##
## ⚠ 상태를 제자리에서 고치므로 "이전 값"은 **스칼라로 받는다.** 사전을
## 받으면 자기 자신과 비교하게 되어 타점이 언제나 0이 된다
static func _record_batter(state: Dictionary, code: String, strikes_before: int,
		half_before: String, side_score_before: int) -> void:
	var is_k: bool = (code == "STRIKE_SWING" or code == "STRIKE_LOOK") and strikes_before == 2
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
	var side: String = "away" if half_before == "top" else "home"
	acc["rbi"] = int(acc["rbi"]) + maxi(
		int(state.get("score", {}).get(side, 0)) - side_score_before, 0)
	accum[bid] = acc


## ⚠ **안 자르면 경기 내내 자란다.** 패턴 판정은 최근 셋만 본다
static func _push_pitch_type(state: Dictionary, pitch_type: String) -> void:
	var last: Array = state.get("last_pitch_types", [])
	last.append(pitch_type)
	if last.size() > 5:
		last.remove_at(0)
	state["last_pitch_types"] = last


# ── 팀별 스태미나·멘탈 (M2-6) ─────────────────────────────────

## 지금 수비 중인 쪽. **초에는 홈이 던진다**
static func _side_of(state: Dictionary) -> String:
	return "home" if state.get("half", "top") == "top" else "away"


## 팀별 값. 없으면 예전처럼 하나로 떨어진다 — 조각 검사가 그대로 돈다
static func _stat_of(state: Dictionary, side: String, key: String,
		fallback: float) -> float:
	var team_key: String = "%s_%s" % [side, key]
	if state.has(team_key):
		return float(state[team_key])
	return float(state.get(key, fallback))


## 한 구 뒤의 스태미나·멘탈. **던진 쪽만 움직인다**
static func _drain(state: Dictionary, side: String, code: String,
		decision: Dictionary, pitcher: Dictionary, outs_before: int) -> void:
	var cap: float = float(pitcher.get("stamina_cap", 50.0))
	var now: float = _stat_of(state, side, "stamina", 100.0)
	var next_stamina: float = clampf(
		now - Tuning.stamina_loss(decision, cap, now), 0.0, 100.0)

	# 이닝이 바뀌면 멘탈이 조금 돌아온다
	var inning_changed: bool = int(state.get("outs", 0)) == 0 and outs_before > 0
	var next_mental: float = clampf(
		_stat_of(state, side, "mental", 50.0)
		+ Tuning.mental_delta(code, float(pitcher.get("mental_resil", 50.0)),
			inning_changed), 0.0, 100.0)

	var stamina_key: String = "%s_stamina" % side
	var mental_key: String = "%s_mental" % side
	if state.has(stamina_key):
		state[stamina_key] = next_stamina
		state[mental_key] = next_mental
	else:
		state["stamina"] = next_stamina
		state["mental"] = next_mental
