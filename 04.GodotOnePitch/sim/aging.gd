extends RefCounted
class_name Aging

## 에이징 — 한 시즌 나이 먹기. M4-5.
##
## 원본: `packages/engine-native/src/growth_engine.rs`의 `calc_protagonist_aging`
##
## ⚠ **자기관리는 비율로 본다.** 절대 주 수로 보면 시즌 길이가 바뀔 때
## 판정이 통째로 달라진다 — 일정을 압축하면 "위기 5주"가 훨씬 무거워진다.
## 지금은 안 압축하지만, 나중에 바꿔도 여기는 안 흔들린다.
##
## 시즌 통계: `low_condition_weeks`(컨디션 60 미만) ·
## `high_fatigue_weeks`(피로 70 초과) · `injury_count` · `total_weeks`


## 능력이 이 아래로 가면 시뮬 산식이 이상해진다. **은퇴는 다른 곳이 정한다**
const STAT_FLOOR: float = 20.0
const STAT_CEIL: float = 99.0

## 관리 소홀의 상한. 없으면 관리 소홀 + 부상이 겹칠 때 한 시즌에 무너진다
const MGMT_MAX: float = 1.50

## 나이대별 기준 감퇴 — 투수.
##
## ⚠ 33~35에서 **제구(3.2·3.0)가 구속(2.5)보다 빨리 무너진다.** 순서를
## 뒤집으면 노장 투수의 성격이 통째로 바뀐다. 경험(mentality)은 제일 늦게 준다
const PITCH_DECAY: Dictionary = {
	25: {"velocity": 0.00, "stamina": 0.00, "movement": 0.00, "recovery": 0.00,
		"command": 0.00, "control": 0.00, "mentality": 0.00},
	29: {"velocity": 0.05, "stamina": 0.05, "movement": 0.00, "recovery": 0.00,
		"command": 0.00, "control": 0.00, "mentality": 0.00},
	32: {"velocity": 1.00, "stamina": 0.80, "movement": 0.30, "recovery": 0.20,
		"command": 0.30, "control": 0.30, "mentality": 0.00},
	35: {"velocity": 2.50, "stamina": 2.00, "movement": 0.80, "recovery": 0.50,
		"command": 3.20, "control": 3.00, "mentality": 0.50},
	999: {"velocity": 4.00, "stamina": 3.50, "movement": 1.50, "recovery": 0.80,
		"command": 5.00, "control": 4.50, "mentality": 1.00},
}

## 타자 — 발이 힘보다 빨리 준다
const BAT_DECAY: Dictionary = {
	29: {"speed": 0.05, "power": 0.00},
	32: {"speed": 0.80, "power": 0.50},
	35: {"speed": 2.00, "power": 1.50},
	999: {"speed": 3.50, "power": 2.80},
}


static func _decay_for(table: Dictionary, age: int) -> Dictionary:
	var bounds: Array = table.keys()
	bounds.sort()
	for b in bounds:
		if age <= b:
			return table[b]
	return table[bounds[bounds.size() - 1]]


## 자기관리 배율. **비율로 본다** — 절대 주 수면 시즌 길이가 판정을 바꾼다
static func self_management(season: Dictionary) -> float:
	var total: float = maxf(season.get("total_weeks", 52), 1)
	var low_ratio: float = season.get("low_condition_weeks", 0) / total
	var fat_ratio: float = season.get("high_fatigue_weeks", 0) / total

	var base: float
	if low_ratio <= 0.10 and fat_ratio <= 0.15:
		base = 0.35      # 철저한 자기관리
	elif low_ratio <= 0.20 and fat_ratio <= 0.30:
		base = 0.65      # 양호
	elif low_ratio <= 0.35 and fat_ratio <= 0.45:
		base = 1.00      # 보통
	else:
		base = 1.50      # 소홀

	var injuries: int = season.get("injury_count", 0)
	if injuries >= 2:
		return minf(base + 0.40, MGMT_MAX)
	if injuries == 1:
		return minf(base + 0.15, MGMT_MAX)
	return base


static func _grade_label(mgmt: float) -> String:
	if mgmt <= 0.40:
		return "자기관리 우수"
	if mgmt <= 0.70:
		return "관리 양호"
	if mgmt <= 1.00:
		return "보통"
	return "자기관리 소홀"


## 한 시즌 에이징. `{pitching, batting, logs}`
##
## **원본 선수 사전을 안 바꾼다**
static func calc(player: Dictionary, season: Dictionary) -> Dictionary:
	var age: int = player.get("age", 25)
	var mgmt: float = self_management(season)
	var player_type: String = player.get("player_type", "pitcher")

	var pitching: Dictionary = player.get("pitching", {}).duplicate()
	var batting: Dictionary = player.get("batting", {}).duplicate()
	var logs: Array[String] = []

	if player_type == "pitcher" or player_type == "twoWay":
		var decay: Dictionary = _decay_for(PITCH_DECAY, age)
		for stat in decay:
			if pitching.has(stat):
				pitching[stat] = clampf(pitching[stat] - decay[stat] * mgmt, STAT_FLOOR, STAT_CEIL)
		# 눈에 띄는 감퇴만 알린다 — 매년 소식이 오면 잡음이다
		var vel_loss: float = decay["velocity"] * mgmt
		var sta_loss: float = decay["stamina"] * mgmt
		if vel_loss >= 0.3 or sta_loss >= 0.3:
			logs.append("[에이징] %d세 시즌 — %s (구속 -%.1f / 스태미나 -%.1f)"
				% [age, _grade_label(mgmt), vel_loss, sta_loss])

	if player_type == "batter" or player_type == "twoWay":
		var decay: Dictionary = _decay_for(BAT_DECAY, age)
		for stat in decay:
			if batting.has(stat):
				batting[stat] = clampf(batting[stat] - decay[stat] * mgmt, STAT_FLOOR, STAT_CEIL)

	return {"pitching": pitching, "batting": batting, "logs": logs}
