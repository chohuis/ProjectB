extends RefCounted
class_name Growth

## 성장 핵심 산식 — XP·잠재력·나이·피로. M4-1.
##
## 원본: `packages/engine-native/src/growth_engine.rs`
##
## ⚠ **여기 `fatigue`는 100 = 탈진이다.** 리그·경기 쪽 `freshness`(100 = 쌩쌩)와
## 방향이 반대다. 02가 둘 다 `fatigue`라 불렀지만 확인해 보니 **다른 값이다** —
## 주인공은 자기 필드로 `fatigue`를 갖고 리그 `playerConditions`에는 안 들어간다.
##
## 뒤집어 쓰면 "지친 선수가 더 잘 큰다"가 되고, 오류도 로그도 안 난다.


## 능력 한 칸을 올리는 데 드는 XP. **능력에 비례한다** — 고정이면 90도 40도
## 같은 속도로 올라 상한이 뜻을 잃는다
static func xp_threshold(value: float) -> float:
	return 7.5 + value * 0.35


## 잠재력이 높을수록 같은 훈련에서 더 배운다 (0.80 ~ 1.20배)
static func potential_speed_factor(potential: float) -> float:
	var p: float = clampf(potential, 60.0, 99.0)
	return 0.80 + (p - 60.0) / 39.0 * 0.40


## 잠재력 상한에 가까울수록 감쇠.
##
## ⚠ **비율로 본다.** 잠재력 대비 어디쯤인지가 기준이다 — 절대값으로 보면
## 잠재력이 낮은 선수가 영영 안 자란다.
##
## ⚠ **0을 안 준다.** 천장에 닿아도 0.10은 열어 둔다 — 0이면 그 순간부터
## 영영 안 자라고, 화면엔 "성장 중"이라고 적힌 채 아무 일도 안 일어난다
static func potential_cap_factor(current: float, potential: float) -> float:
	if potential <= 0.0:
		return 1.0
	var ratio: float = current / potential
	if ratio < 0.75:
		return 1.00
	if ratio < 0.85:
		return 0.70
	if ratio < 0.95:
		return 0.35
	return 0.10


## 나이가 들면 훈련 효과가 준다. **0은 안 준다** — 노장도 아주 조금은 는다
static func age_train_factor(age: int) -> float:
	if age <= 29:
		return 1.00
	if age <= 32:
		return 0.85
	if age <= 35:
		return 0.70
	if age <= 38:
		return 0.55
	return 0.45


## 한 주에 버는 XP.
##
## ⚠ **`fatigue`는 100 = 탈진이다.** 85 이상이면 0.35배까지 떨어진다 —
## 지친 채로 계속 밀어붙이면 배우는 게 없다는 뜻이다.
##
## 성실성은 0.6 하한이 있다 — 0이어도 훈련이 무의미하진 않다
static func week_xp(base: float, condition: float, fatigue: float,
		dev_rate: float, diligence: float) -> float:
	var cond_factor: float = condition / 100.0
	var fat_factor: float
	if fatigue >= 85.0:
		fat_factor = 0.35
	elif fatigue >= 70.0:
		fat_factor = 0.65
	else:
		fat_factor = maxf(1.0 - fatigue / 200.0, 0.80)
	var dev_factor: float = dev_rate / 62.0
	var diligence_factor: float = 0.6 + (diligence / 99.0) * 0.8
	return base * cond_factor * fat_factor * dev_factor * diligence_factor


## XP를 쌓아 능력을 올린다. `{value, acc_xp, leveled}`
##
## ⚠ **남은 XP를 이월한다.** 버리면 성장이 눈에 띄게 느려진다.
## 올릴 때마다 문턱이 커지므로 한 번에 무한정 오르지 않는다
static func try_level_up(current: float, acc_xp: float, gain_xp: float) -> Dictionary:
	var xp: float = acc_xp + gain_xp
	var value: float = current
	var leveled: int = 0
	while xp >= xp_threshold(value):
		xp -= xp_threshold(value)
		value += 1.0
		leveled += 1
	return {"value": value, "acc_xp": xp, "leveled": leveled}


## 모은 XP를 능력으로 바꾼다. **훈련 성장과 경기 성장이 같이 쓴다** —
## 두 벌로 두면 같은 선수가 경로에 따라 다르게 자란다.
##
## ⚠ **천장은 스탯마다 따로 본다.** 하나로 묶으면 이미 다 큰 스탯이 아직
## 낮은 스탯의 성장까지 막는다.
##
## `stats`·`xp_map`·`logs`를 제자리에서 고친다
static func apply_gains(stats: Dictionary, xp_map: Dictionary, gains: Dictionary,
		potential: float, logs: Array[String]) -> void:
	var p: float = clampf(potential, 60.0, 99.0)
	var speed: float = potential_speed_factor(p)
	# 순서를 고정한다 — 사전 순회 순서가 바뀌면 로그가 흔들린다
	var names: Array = gains.keys()
	names.sort()
	for stat in names:
		var gain: float = gains[stat]
		if gain <= 0.0:
			continue
		var cur: float = stats.get(stat, 0.0)
		var adjusted: float = gain * speed * potential_cap_factor(cur, p)
		var r: Dictionary = try_level_up(cur, xp_map.get(stat, 0.0), adjusted)
		xp_map[stat] = r["acc_xp"]
		if r["leveled"] > 0:
			stats[stat] = r["value"]
			logs.append("%s +%d" % [stat, r["leveled"]])


## 피로 구간 승수 — 70/80/90에서 볼록하게 뛴다.
##
## ⚠ **지칠수록 같은 훈련이 더 지치게 한다.** 이게 없으면 피로를 무시하고
## 계속 훈련하는 게 언제나 최선이 된다. 회복 훈련에는 안 걸린다
static func fatigue_zone_mult(fatigue: float) -> float:
	if fatigue >= 90.0:
		return 4.0
	if fatigue >= 80.0:
		return 2.5
	if fatigue >= 70.0:
		return 1.5
	return 1.0
