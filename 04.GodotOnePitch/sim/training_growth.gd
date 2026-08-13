extends RefCounted
class_name TrainingGrowth

## 훈련 성장 — 한 주 훈련이 능력을 얼마나 올리나. M4-3.
##
## 원본: `packages/engine-native/src/growth_engine.rs`의 `calc_training_growth`
##
## ⚠ 피로·컨디션은 **`Training.plan_load`가 정본이다.** 여기서 또 더하면
## 두 배가 된다 — 회복 훈련을 통째로 건너뛰는 이유가 그것이다.
##
## ⚠ 프로그램 표는 **데이터에서 온다.** 여기 하드코딩이 있던 시절엔
## 마스터·화면과 값이 서로 달라서 화면이 거짓말을 했다.
##
## 여기 `fatigue`는 **100 = 탈진** (주인공 축).


## 슬롯별 XP 배수 — `Training.SLOT_XP_MULT`가 정본이다
## 구종 숙련도가 오를수록 진행이 느려진다. 없으면 5등급까지 같은 속도로
## 올라 숙련도 체계가 뜻을 잃는다
static func _pitch_grade_factor(grade: int) -> float:
	if grade <= 1:
		return 1.00
	if grade == 2:
		return 2.0 / 3.0
	if grade == 3:
		return 1.0 / 3.0
	return 2.0 / 9.0


static func _slot_ids(plan: Dictionary) -> Array[String]:
	return [plan.get("primary", ""), plan.get("secondary", ""), plan.get("secondary2", "")]


static func _find(programs: Array, id: String) -> Dictionary:
	for c in programs:
		if c.get("id", "") == id:
			return c
	return {}


## 한 주 훈련의 결과.
##
## `{pitching, batting, pitching_xp, batting_xp, fatigue_delta, condition_delta,
##   pitch_dev_gain, logs}`
##
## **원본 선수 사전을 안 바꾼다** — 호출부가 훈련 전 상태를 아직 쥐고 있다
static func calc(player: Dictionary, plan: Dictionary, programs: Array,
		efficiency_mod: float = 1.0) -> Dictionary:
	var eff: float = efficiency_mod * Growth.age_train_factor(player.get("age", 25))
	var diligence: float = player.get("diligence", 50.0)
	var condition: float = player.get("condition", 100.0)
	var fatigue: float = player.get("fatigue", 0.0)

	# ⚠ 피로·컨디션은 여기가 정본이다 — 훈련 화면 미리보기가 같은 함수를 부른다
	var load: Dictionary = Training.plan_load(fatigue, plan, programs)

	var pitch_gains: Dictionary = {}
	var bat_gains: Dictionary = {}
	var pitch_dev_gain: float = 0.0

	var ids: Array[String] = _slot_ids(plan)
	for i in ids.size():
		var cfg: Dictionary = _find(programs, ids[i])
		if cfg.is_empty():
			continue
		# ⚠ **회복 훈련은 건너뛴다.** 피로·컨디션은 `plan_load`가 이미 셌고
		# 여기서 또 처리하면 두 배가 된다
		if cfg.get("is_recovery", false):
			continue

		var xp_mult: float = Training.SLOT_XP_MULT[i]

		if cfg.get("is_pitch_dev", false):
			var cond_factor: float = condition / 100.0
			var fat_factor: float = maxf(1.0 - fatigue / 120.0, 0.3)
			var grade_factor: float = 1.0
			var ts: Dictionary = player.get("training_pitch_state", {})
			if not ts.is_empty():
				for e in player.get("pitches", []):
					if e.get("id", "") == ts.get("id", ""):
						grade_factor = _pitch_grade_factor(e.get("grade", 0))
						break
			pitch_dev_gain += cfg.get("progress_per_week", 0.0) * xp_mult \
				* cond_factor * fat_factor * eff * grade_factor
			continue

		var xp: float = Growth.week_xp(cfg.get("base_xp", 0.0), condition, fatigue,
			player.get("development_rate", 62.0), diligence) * xp_mult * eff

		for stat in cfg.get("gains_pitching", {}):
			pitch_gains[stat] = pitch_gains.get(stat, 0.0) + xp * cfg["gains_pitching"][stat]
		for stat in cfg.get("gains_batting", {}):
			bat_gains[stat] = bat_gains.get(stat, 0.0) + xp * cfg["gains_batting"][stat]

	# ── 잠재력 보정 → 레벨업 ────────────────────────────────────
	var potential: float = clampf(player.get("potential_hidden", 75.0), 60.0, 99.0)
	var speed: float = Growth.potential_speed_factor(potential)

	var pitching: Dictionary = player.get("pitching", {}).duplicate()
	var batting: Dictionary = player.get("batting", {}).duplicate()
	var pitching_xp: Dictionary = player.get("pitching_xp", {}).duplicate()
	var batting_xp: Dictionary = player.get("batting_xp", {}).duplicate()
	var logs: Array[String] = []

	_apply(pitching, pitching_xp, pitch_gains, potential, speed, logs)
	_apply(batting, batting_xp, bat_gains, potential, speed, logs)

	return {
		"pitching": pitching, "batting": batting,
		"pitching_xp": pitching_xp, "batting_xp": batting_xp,
		"fatigue_delta": load["fatigue_delta"],
		"condition_delta": load["condition_delta"],
		"pitch_dev_gain": pitch_dev_gain,
		"logs": logs,
	}


## ⚠ **천장은 스탯마다 따로 본다.** 하나로 묶으면 이미 다 큰 스탯이 아직
## 낮은 스탯의 성장까지 막는다
static func _apply(stats: Dictionary, xp_map: Dictionary, gains: Dictionary,
		potential: float, speed: float, logs: Array[String]) -> void:
	# 순서를 고정한다 — 사전 순회 순서가 바뀌면 로그가 흔들린다
	var names: Array = gains.keys()
	names.sort()
	for stat in names:
		var gain: float = gains[stat]
		if gain <= 0.0:
			continue
		var cur: float = stats.get(stat, 0.0)
		var adjusted: float = gain * speed * Growth.potential_cap_factor(cur, potential)
		var r: Dictionary = Growth.try_level_up(cur, xp_map.get(stat, 0.0), adjusted)
		xp_map[stat] = r["acc_xp"]
		if r["leveled"] > 0:
			stats[stat] = r["value"]
			logs.append("%s +%d" % [stat, r["leveled"]])
