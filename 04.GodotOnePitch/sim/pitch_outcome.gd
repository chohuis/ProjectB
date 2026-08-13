extends RefCounted
class_name PitchOutcome

## 투구 한 개의 결과 — 착탄 · 스윙 · 컨택 · 품질. M2-3.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##
## ⚠ **투구 품질은 항이 열다섯인 합이다.** 한 항이 다른 항보다 크게 움직이면
## 나머지가 무의미해진다 — 원본에서 숙련도 폭이 넓어 1등급 패스트볼이 매
## 투구마다 −7.1을 먹었고 주인공 ERA가 8.78 → 19.86으로 튀었다.
##
## 좌표는 스트라이크존 기준이다: |x| ≤ 1 · |y| ≤ 1이 존 안.


static func _round2(x: float) -> float:
	return roundf(x * 100.0) / 100.0


## 정규분포 — Box-Muller. **난수를 두 번 뽑는다**
static func gaussian(rng, mean: float, std: float) -> float:
	var u: float = maxf(rng.randf(), 1e-10)
	var v: float = rng.randf()
	return mean + std * (sqrt(-2.0 * log(u)) * cos(TAU * v))


# ── 착탄 ───────────────────────────────────────────────────────────

## 겨냥한 곳에서 얼마나 흩어지는가.
##
## ⚠ **벌점만 있고 상은 없다.** 스태미나·멘탈이 50을 넘어도 더 좁아지지
## 않는다 — 양쪽으로 걸면 능력 좋은 투수가 두 번 이득을 본다.
##
## `situation`: `has_scoring` · `is_full_base` · `is_late`
static func dispersion_sigma(control: float, stamina: float, mental: float,
		situation: Dictionary) -> float:
	var sigma: float = maxf(Tuning.DISPERSION_BASE
		- (control - 50.0) * Tuning.DISPERSION_CONTROL_SCALE
		+ (maxf(50.0 - stamina, 0.0)) * Tuning.DISPERSION_STAMINA_SCALE
		+ (maxf(50.0 - mental, 0.0)) * Tuning.DISPERSION_MENTAL_SCALE, 0.02)

	# 상황이 조이면 제구가 흔들린다
	sigma *= 1.0 \
		+ (0.10 if situation.get("has_scoring", false) else 0.0) \
		+ (0.08 if situation.get("is_full_base", false) else 0.0) \
		+ (0.06 if situation.get("is_late", false) else 0.0)
	return sigma


## 존 번호(1~9) → 겨냥 좌표. 5가 한가운데, 7·8·9가 위쪽이다
static func zone_to_target(location: int) -> Vector2:
	var col: float = [-0.67, 0.0, 0.67][(location - 1) % 3] if location >= 1 and location <= 9 else 0.0
	var row: float = 0.0
	if location >= 7:
		row = -0.67
	elif location <= 3 and location >= 1:
		row = 0.67
	return Vector2(col, row)


## "zone" · "shadow" · "ball".
##
## ⚠ **두 축을 다 본다.** x만 보면 대각선으로 빠진 공이 스트라이크가 된다
static func zone_of(landing: Vector2) -> String:
	var ax: float = absf(landing.x)
	var ay: float = absf(landing.y)
	if ax <= 1.0 and ay <= 1.0:
		return "zone"
	var edge: float = 1.0 + Tuning.SHADOW_ZONE_HALF
	return "shadow" if ax <= edge and ay <= edge else "ball"


## `{landing, in_zone, in_shadow, miss_log}`
static func resolve_landing(target: Vector2, control: float, stamina: float, mental: float,
		situation: Dictionary, rng) -> Dictionary:
	var sigma: float = dispersion_sigma(control, stamina, mental, situation)
	var landing := Vector2(
		target.x + gaussian(rng, 0.0, sigma),
		target.y + gaussian(rng, 0.0, sigma))

	var zone: String = zone_of(landing)
	var drift: float = landing.distance_to(target)
	var miss_log: String = ""
	if zone == "ball" and drift > 0.25:
		miss_log = "제구 이탈 (볼존)"
	elif zone == "shadow" and drift > 0.25:
		miss_log = "제구 불안 (경계선)"
	elif zone == "zone" and drift > 0.40:
		miss_log = "제구 불안 (편차 %.2f)" % drift

	return {"landing": landing, "in_zone": zone == "zone",
		"in_shadow": zone == "shadow", "miss_log": miss_log}


# ── 스윙 판단 ──────────────────────────────────────────────────────

## `{swung, umpire_strike}`.
##
## ⚠ **경계선은 심판이 잡아줄 수도, 안 잡아줄 수도 있다.** 늘 볼로 두면
## 볼넷이 넘치고, 늘 스트라이크로 두면 존이 커진 것과 같다
static func swing_decision(landing: Vector2, pitch_type: String, batter: Dictionary,
		in_zone: bool, in_shadow: bool, rng) -> Dictionary:
	var discipline: float = batter.get("discipline", 50.0)
	var margin: float = maxf(Tuning.SWING_MARGIN_BASE
		- (discipline - 50.0) * Tuning.SWING_DISCIPLINE_SCALE
		- (batter.get("eye", 50.0) - 50.0) * Tuning.SWING_EYE_SCALE
		+ (Tuning.SWING_FASTBALL_BONUS if pitch_type == "fastball" else 0.0), 0.0)

	var edge: float = 1.0 + margin
	var in_swing_zone: bool = absf(landing.x) <= edge and absf(landing.y) <= edge
	var umpire_strike: bool = in_zone or (in_shadow and rng.randf() < Tuning.SHADOW_UMPIRE_STRIKE_PROB)

	var swing_prob: float
	if in_zone:
		swing_prob = clampf(0.78 + (50.0 - discipline) * 0.003, 0.55, 0.97)
	elif in_shadow:
		swing_prob = clampf(0.45 + (50.0 - discipline) * 0.004, 0.20, 0.80) if in_swing_zone else 0.12
	else:
		swing_prob = clampf(0.22 + (50.0 - discipline) * 0.003, 0.05, 0.55) if in_swing_zone else 0.02

	return {"swung": rng.randf() < swing_prob, "umpire_strike": umpire_strike}


# ── 컨택 ───────────────────────────────────────────────────────────

## **낮을수록 타자에게 유리한** 척도다.
##
## ⚠ 오프셋은 여기 한 곳에서만 더한다. 밴드 표가 "동급 = 56"을 전제하는데
## 실측 평균이 48이라, 표를 다시 쓰는 대신 입력을 옮긴다
static func contact_quality(pitch_q: float, batter: Dictionary, in_zone: bool, in_shadow: bool) -> float:
	var extra: float = (batter.get("contact", 50.0) - 50.0) * 0.20
	# 쫓아간 공은 벌점 — 완전히 빠진 공이 더 나쁘다
	var chase_penalty: float = 0.0
	if not in_zone:
		chase_penalty = 5.0 if in_shadow else 12.0
	return _round2(pitch_q - extra + chase_penalty + Tuning.CONTACT_Q_OFFSET)


## 스윙 한 번의 결과.
##
## ⚠ **원본에서 이 표가 세 축에서 동시에 어긋나 있었다.** 실측(OVR 70 대 70)
## 헛스윙 15% · 파울 15% · 인플레이 중 안타 50%였는데 현실은 대략 헛스윙 25% ·
## 파울 35% · BABIP 30%다. 헛스윙과 파울이 둘 다 적어 삼진이 안 쌓이고 BABIP은
## 1.7배라 피안타/삼진 비가 4.67이 나왔다(같은 조건 리그 시뮬은 1.17).
## **단일 계수로는 못 맞춘다** — 구간마다 분포를 따로 둔다.
##
## 구간이 올라갈수록(투수가 이긴 공) 헛스윙이 늘고 인플레이가 줄며, 인플레이
## 중 안타 비율도 함께 떨어진다. **파울은 어느 구간이든 22~35%로 둔다** —
## 파울이 적으면 승부가 너무 빨리 끝나 삼진도 볼넷도 안 나온다
static func resolve_contact(pitch_q: float, contact_q: float, batter: Dictionary, rng) -> String:
	var roll: float = rng.randf()
	var hit_bonus: float = clampf((60.0 - pitch_q) * 0.003
		+ (batter.get("power", 50.0) - 50.0) * 0.002, -0.12, 0.20)

	# 투수 완승 — 헛스윙 50 / 파울 30 / 인플레이 20 (그중 안타 15%)
	if contact_q >= 72.0:
		if roll < 0.50:
			return "STRIKE_SWING"
		if roll < 0.80:
			return "FOUL"
		return "INPLAY_OUT" if roll < 0.97 else "HIT_SINGLE"

	# 헛스윙 32 / 파울 33 / 인플레이 35 (안타 22%)
	if contact_q >= 60.0:
		if roll < 0.32:
			return "STRIKE_SWING"
		if roll < 0.65:
			return "FOUL"
		return "INPLAY_OUT" if roll < 0.92 else "HIT_SINGLE"

	# 헛스윙 22 / 파울 35 / 인플레이 43 (안타 28%)
	if contact_q >= 52.0:
		if roll < 0.22:
			return "STRIKE_SWING"
		if roll < 0.57:
			return "FOUL"
		return "INPLAY_OUT" if roll < 0.88 else "HIT_SINGLE"

	# 헛스윙 15 / 파울 35 / 인플레이 50 (안타 33%)
	if contact_q >= 45.0:
		if roll < 0.15:
			return "STRIKE_SWING"
		if roll < 0.50:
			return "FOUL"
		if roll < clampf(0.835 - hit_bonus, 0.62, 0.92):
			return "INPLAY_OUT"
		return "HIT_SINGLE" if roll < clampf(0.95 - hit_bonus * 0.5, 0.90, 0.98) else "HIT_DOUBLE"

	# 헛스윙 10 / 파울 32 / 인플레이 58 (안타 40%)
	if contact_q >= 38.0:
		if roll < 0.10:
			return "STRIKE_SWING"
		if roll < 0.42:
			return "FOUL"
		if roll < clampf(0.768 - hit_bonus, 0.55, 0.87):
			return "INPLAY_OUT"
		if roll < clampf(0.93 - hit_bonus * 0.5, 0.87, 0.97):
			return "HIT_SINGLE"
		return "HIT_DOUBLE" if roll < clampf(0.98 - hit_bonus * 0.3, 0.95, 0.99) else "HIT_TRIPLE"

	# 헛스윙 6 / 파울 28 / 인플레이 66 (안타 50%)
	if contact_q >= 32.0:
		if roll < 0.06:
			return "STRIKE_SWING"
		if roll < 0.34:
			return "FOUL"
		if roll < clampf(0.67 - hit_bonus, 0.45, 0.78):
			return "INPLAY_OUT"
		if roll < clampf(0.87 - hit_bonus * 0.5, 0.80, 0.93):
			return "HIT_SINGLE"
		if roll < clampf(0.95 - hit_bonus * 0.3, 0.92, 0.97):
			return "HIT_DOUBLE"
		return "HIT_TRIPLE" if roll < clampf(0.98 + hit_bonus * 0.2, 0.97, 0.99) else "HOME_RUN"

	# 통타 — 파울 22 / 인플레이 78 (안타 62%). **헛스윙이 없다.**
	# 여기서도 100%는 아니다
	if roll < 0.22:
		return "FOUL"
	if roll < clampf(0.535 - hit_bonus, 0.35, 0.66):
		return "INPLAY_OUT"
	if roll < clampf(0.78 - hit_bonus * 0.5, 0.68, 0.86):
		return "HIT_SINGLE"
	if roll < clampf(0.90 - hit_bonus * 0.3, 0.86, 0.94):
		return "HIT_DOUBLE"
	return "HIT_TRIPLE" if roll < clampf(0.94 + hit_bonus * 0.2, 0.92, 0.96) else "HOME_RUN"


# ── 보정 항 ────────────────────────────────────────────────────────

static func count_modifier(balls: int, strikes: int) -> float:
	if strikes == 2:
		match balls:
			0:
				return 5.0
			1:
				return 3.0
			2:
				return 2.0
	if strikes == 0 and balls == 3:
		return -8.0
	if strikes == 1 and balls == 3:
		return -5.0
	return 0.0


## ⚠ **같은 공만 던지면 읽힌다.** 이게 없으면 제일 좋은 구종 하나만 던지는
## 게 언제나 최선이 되어 구종 구성이 뜻을 잃는다
static func pattern_modifier(pitch_type: String, last_types: Array) -> float:
	if last_types.is_empty():
		return 0.0
	var consecutive: int = 0
	for i in range(last_types.size() - 1, -1, -1):
		if last_types[i] == pitch_type:
			consecutive += 1
		else:
			break
	if consecutive >= 3:
		return -4.0
	if consecutive >= 2:
		return -2.0
	if consecutive >= 1:
		return -1.0
	# 최근 셋에 없던 공이면 신선하다
	var recent: Array = last_types.slice(maxi(0, last_types.size() - 3))
	return 0.0 if recent.has(pitch_type) else 1.0


## 득점권 압박. 주자가 2·3루에 없으면 압박이 없다
static func jam_modifier(runners: Dictionary, outs: int, mental: float, batter_clutch: float) -> float:
	var second: Dictionary = runners.get("second", {})
	var third: Dictionary = runners.get("third", {})
	if second.is_empty() and third.is_empty():
		return 0.0

	var pressure: float = -1.0
	if outs == 2:
		pressure -= 1.0
	if not runners.get("first", {}).is_empty() and not second.is_empty() and not third.is_empty():
		pressure -= 1.0
	if mental < 30.0:
		pressure -= 1.5
	elif mental < 50.0:
		pressure -= 0.5
	# 강한 타자를 만나면 더 눌린다
	pressure -= (batter_clutch - 50.0) * 0.02
	return pressure


## 후반 접전 압박. 초반이거나 점수차가 크면 없다
static func clutch_modifier(inning: int, inning_limit: int, home_score: int, away_score: int,
		pitcher_clutch: float) -> float:
	var inning_ratio: float = float(inning) / float(inning_limit)
	if inning_ratio < 0.67:
		return 0.0
	var score_diff: float = absf(float(home_score - away_score))
	if score_diff > 3.0:
		return 0.0

	var inning_pressure: float = (inning_ratio - 0.67) * 6.0
	var score_pressure: float = maxf(3.0 - score_diff, 0.0) * 0.5
	var raw: float = -(inning_pressure + score_pressure) * 0.8
	# 배짱이 좋으면 덜 눌린다
	var clutch_factor: float = 1.0 - clampf((pitcher_clutch - 50.0) * 0.008, -0.3, 0.3)
	return raw * clutch_factor


## 결과가 투수 멘탈을 얼마나 움직이나
static func mental_delta(code: String) -> float:
	match code:
		"STRIKE_LOOK", "STRIKE_SWING":
			return 0.5
		"INPLAY_OUT", "GROUND_OUT", "FLY_OUT", "LINE_OUT":
			return 0.8
		# 아웃 두 개를 한 번에 잡았다. 0.8을 두 번 준 셈으로 둔다
		"DOUBLE_PLAY":
			return 1.6
		# 내 잘못이 아니어도 흔들린다
		"FIELDING_ERROR":
			return -1.2
		"BALL":
			return -0.4
		"FOUL":
			return -0.1
		"WALK":
			return -0.9
		"HIT_SINGLE":
			return -1.0
		"HIT_DOUBLE":
			return -1.4
		"HIT_TRIPLE":
			return -1.8
		"HOME_RUN":
			return -2.4
		_:
			return 0.0


## 힘과 바람이 안타를 키운다. **단타·2루타만 대상이다** — 아웃이 홈런이 되면 안 된다
static func apply_hit_upgrade(code: String, power: float, weather: String, rng) -> String:
	if code != "HIT_SINGLE" and code != "HIT_DOUBLE":
		return code
	var power_factor: float = (power - 50.0) / 50.0
	var wind: float = Tuning.weather_power_modifier(weather)
	var result: String = code

	if result == "HIT_SINGLE":
		if rng.randf() < maxf(Tuning.HIT_UPGRADE_SINGLE_TO_DOUBLE_BASE + power_factor * 0.10 + wind, 0.0):
			result = "HIT_DOUBLE"
	if result == "HIT_DOUBLE":
		if rng.randf() < maxf(Tuning.HIT_UPGRADE_DOUBLE_TO_HR_BASE + power_factor * 0.08 + wind, 0.0):
			result = "HOME_RUN"
	return result


# ── 투구 품질 ──────────────────────────────────────────────────────

## 항 열다섯의 합. **난수를 두 번까지 뽑는다** (3-2 흔들림 · 기본 잡음).
##
## ⚠ 위치 점수는 **착탄 기준**이다 — 중심에서 멀수록 좋다. 원본에 "겨냥한
## 곳의 난이도 + 얼마나 정확히 꽂혔는가"로 보는 갈래가 있었지만 기본이 꺼져
## 있었다(계측용). 흩어짐이 품질을 올려주는 셈이라 이상하지만 **밸런스가
## 동결이라 그대로 옮긴다** — 이주 후에 다시 본다.
static func pitch_quality(ctx: Dictionary, rng) -> float:
	var pitcher: Dictionary = ctx.get("pitcher", {})
	var batter: Dictionary = ctx.get("batter", {})
	var decision: Dictionary = ctx.get("decision", {})
	var landing: Vector2 = ctx.get("landing", Vector2.ZERO)
	var pitch_type: String = decision.get("pitch_type", "fastball")
	var is_fastball: bool = pitch_type == "fastball"

	var location_q: float = Tuning.LOCATION_CENTER_PENALTY \
		+ landing.length() * Tuning.LOCATION_DISTANCE_SCALE

	# 능력치 기여는 배수를 탄다 — 잡음을 줄인 만큼 키워 균형을 맞춘다
	var sk: float = Tuning.PITCH_SKILL_SCALE
	var command_bonus: float = (pitcher.get("command", 50.0) - 50.0) * 0.10 * sk
	# 구속은 직구에서 훨씬 크게 걸린다
	var velocity_bonus: float = (pitcher.get("velocity", 50.0) - 50.0) * (0.12 if is_fastball else 0.03) * sk
	var control_bonus: float = (pitcher.get("control", 50.0) - 50.0) * 0.06 * sk
	# 무브먼트는 변화구에만 — 직구에 걸면 변화구의 존재 이유가 사라진다
	var movement_bonus: float = 0.0 if is_fastball else (pitcher.get("movement", 50.0) - 50.0) * 0.08 * sk

	var batter_penalty: float = (batter.get("contact", 50.0) - 50.0) * 0.10 \
		+ (batter.get("eye", 50.0) - 50.0) * 0.06 \
		+ (batter.get("discipline", 50.0) - 50.0) * 0.04

	var count: Dictionary = ctx.get("count", {})
	var balls: int = count.get("balls", 0)
	var strikes: int = count.get("strikes", 0)
	var count_mod: float = count_modifier(balls, strikes)
	# 3-2는 승부처다 — 여기만 흔들림을 하나 더 얹는다
	var full_count_noise: float = (rng.randf() * 6.0 - 3.0) if (balls == 3 and strikes == 2) else 0.0

	var stamina_penalty: float = maxf(50.0 - ctx.get("stamina", 100.0), 0.0) * 0.18
	var mental_bonus: float = (ctx.get("mental", 50.0) - 50.0) * 0.08
	var noise: float = Tuning.PITCH_QUALITY_NOISE
	var random_noise: float = rng.randf() * noise - noise / 2.0

	var score: Dictionary = ctx.get("score", {})

	return _round2(
		Tuning.PITCH_BASE.get(pitch_type, 55.0)
		+ Tuning.grade_quality_bonus(ctx.get("grade", 3))
		+ Tuning.STRATEGY_BONUS.get(decision.get("strategy", "balanced"), 0.0)
		+ Tuning.POWER_BONUS.get(decision.get("power", "normal"), 0.0)
		+ location_q
		+ command_bonus + velocity_bonus + control_bonus + movement_bonus
		+ count_mod + full_count_noise
		- batter_penalty
		+ mental_bonus - stamina_penalty
		+ Tuning.weather_quality_modifier(ctx.get("weather", "sunny"), pitch_type)
		+ Tuning.park_quality_modifier(ctx.get("park", "neutral"))
		+ pattern_modifier(pitch_type, ctx.get("last_pitch_types", []))
		+ jam_modifier(ctx.get("runners", {}), ctx.get("outs", 0),
			ctx.get("mental", 50.0), batter.get("batting_clutch", 50.0))
		+ clutch_modifier(ctx.get("inning", 1), ctx.get("inning_limit", 9),
			score.get("home", 0), score.get("away", 0), pitcher.get("clutch", 50.0))
		+ random_noise
	)
