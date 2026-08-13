extends RefCounted
class_name BattedBall

## 타구·수비 — 타구 종류·위치·세기, 그리고 처리 결과. M2-2.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##
## 타구 한 개는 사전이다: `{"hit_type", "zone", "hardness"}`.
## 수비수 한 명은 `{"position", "fielding", "arm", "speed"}`.
##
## ⚠ **결과 코드 분류는 `MatchResult`가 갖는다.** 여기서 `is_in_play`나
## 아웃 목록을 다시 적지 않는다 — 코드가 하나 늘 때마다 빠뜨린 자리가 생긴다.


## 구종이 타구 종류를 가른다. 이게 없으면 싱커나 커브나 같은 타구가 나오고
## **땅볼 투수·뜬공 투수라는 성격 자체가 사라진다**
const GROUND_BALL_PITCHES: Array[String] = ["sinker", "cutter", "slider"]
const FLY_BALL_PITCHES: Array[String] = ["changeup", "curve", "forkball", "screwball", "knuckleball"]

## 수비 위치의 기본 자리 (화면 좌표 0~100)
const FIELDER_HOME: Dictionary = {
	"P": Vector2(50, 62), "C": Vector2(50, 90),
	"1B": Vector2(78, 70), "2B": Vector2(63, 55), "3B": Vector2(22, 70),
	"SS": Vector2(37, 55),
	"LF": Vector2(18, 28), "CF": Vector2(50, 16), "RF": Vector2(82, 28),
}

## 실책 바닥 확률 — 타구 종류마다 다르다
const ERROR_BASE: Dictionary = {
	"popup": 0.04, "bunt": 0.08, "flyBall": 0.06,
	"groundBall": 0.11, "lineDrive": 0.09,
}

## 잡고 나서 1루에 던져야 하는 타구
const NEEDS_THROW: Array[String] = ["groundBall", "lineDrive", "bunt"]


# ── 타구 종류 ──────────────────────────────────────────────────────

static func resolve_hit_type(code: String, decision: Dictionary, quality: float, rng) -> String:
	if decision.get("strategy", "") == "safe" and decision.get("power", "") == "low":
		return "bunt"
	if code == "HOME_RUN":
		return "flyBall"
	if code == "HIT_TRIPLE":
		return "flyBall" if rng.randf() < 0.70 else "lineDrive"
	if code == "HIT_DOUBLE":
		return "lineDrive" if rng.randf() < 0.55 else "flyBall"
	# 좋은 코스로 들어간 공은 빗맞는다
	if code == "INPLAY_OUT" and quality >= 60.0 and rng.randf() < 0.30:
		return "popup"

	var roll: float = rng.randf()
	if GROUND_BALL_PITCHES.has(decision.get("pitch_type", "")):
		if roll < 0.68:
			return "groundBall"
		return "lineDrive" if roll < 0.85 else "flyBall"
	if FLY_BALL_PITCHES.has(decision.get("pitch_type", "")):
		if roll < 0.15:
			return "groundBall"
		return "lineDrive" if roll < 0.48 else "flyBall"
	# 직구·스플리터는 그 사이다
	if roll < 0.38:
		return "groundBall"
	return "lineDrive" if roll < 0.68 else "flyBall"


# ── 타구 위치 ──────────────────────────────────────────────────────

## 코스가 타구 방향을 가른다 — 몸쪽(1·4·7)은 당겨지고 바깥쪽(3·6·9)은 밀린다
static func resolve_zone(hit_type: String, location: int, rng) -> String:
	var is_left: bool = location == 1 or location == 4 or location == 7
	var is_right: bool = location == 3 or location == 6 or location == 9

	match hit_type:
		"bunt":
			var opts: Array[String] = ["P", "C", "1B", "3B"]
			return opts[rng.randi_range(0, opts.size() - 1)]
		"popup":
			var opts: Array[String] = ["C", "1B", "2B", "3B", "SS"]
			return opts[rng.randi_range(0, opts.size() - 1)]
		"groundBall":
			if is_left:
				return "3B" if rng.randf() < 0.52 else "SS"
			if is_right:
				return "1B" if rng.randf() < 0.55 else "2B"
			return "SS" if rng.randf() < 0.50 else "2B"
		"flyBall":
			if is_left:
				return "RF" if rng.randf() < 0.72 else "CF"
			if is_right:
				return "LF" if rng.randf() < 0.72 else "CF"
			var r: float = rng.randf()
			if r < 0.60:
				return "CF"
			return "LF" if r < 0.80 else "RF"
		_:  # lineDrive
			if is_left:
				return "1B" if rng.randf() < 0.45 else "RF"
			if is_right:
				return "3B" if rng.randf() < 0.45 else "LF"
			return "2B" if rng.randf() < 0.45 else "CF"


# ── 타구 세기 ──────────────────────────────────────────────────────

## 1~5. 큰 결과일수록 세게 맞은 것이고, **품질이 낮을수록 세게 맞는다**
static func resolve_hardness(code: String, power: String, quality: float, rng) -> int:
	var base: float
	match code:
		"HOME_RUN":
			base = 5.0
		"HIT_TRIPLE":
			base = 4.2
		"HIT_DOUBLE":
			base = 3.5
		"HIT_SINGLE":
			base = 2.8
		_:
			base = 2.0

	if power == "high":
		base += 0.5
	elif power == "low":
		base -= 0.5
	# 두 단계로 가산한다 — 아주 나쁜 공은 더 세게 맞는다
	if quality < 40.0:
		base += 0.5
	if quality < 32.0:
		base += 0.5

	base += (rng.randf() - 0.5) * 1.2
	return int(clampf(roundf(base), 1.0, 5.0))


## 타구 하나. **인플레이가 아니면 빈 사전**이다 — 방망이에 안 맞은 공에
## 타구를 만들면 있지도 않은 수비가 돌아간다
static func resolve(code: String, decision: Dictionary, quality: float, rng) -> Dictionary:
	if not MatchResult.is_in_play(code):
		return {}
	var hit_type: String = resolve_hit_type(code, decision, quality, rng)
	return {
		"hit_type": hit_type,
		"zone": resolve_zone(hit_type, decision.get("location", 5), rng),
		"hardness": resolve_hardness(code, decision.get("power", "normal"), quality, rng),
	}


# ── 수비 ───────────────────────────────────────────────────────────

## ⚠ **하한·상한을 둔다.** 하한이 없으면 최고 수비수가 절대 실책을 안 하고,
## 상한이 없으면 최악의 수비수에게 굴러간 강한 타구가 거의 다 실책이 된다
static func calc_error_prob(ball: Dictionary, fielder: Dictionary) -> float:
	var base: float = ERROR_BASE.get(ball.get("hit_type", ""), 0.09)
	return clampf(base
		+ (float(ball.get("hardness", 3)) - 3.0) * 0.025
		- (float(fielder.get("fielding", 50.0)) - 50.0) * 0.003, 0.01, 0.40)


## 라인업이 비어 있어도 경기는 굴러가야 한다
static func default_fielder(pos: String) -> Dictionary:
	return {"position": pos, "fielding": 50.0, "arm": 50.0, "speed": 50.0}


## 타구 하나를 처리한다.
##
## `{fielder, is_error, threw_to, throw_result, runner_extra_advance, code}`
##
## ⚠ **포구 실패와 송구 실패는 다르다.** 잡기는 했는데 송구가 새면 `is_error`는
## false지만 결과는 출루다. 여기서 아웃으로 처리하면 나간 주자가 사라진다
static func resolve_fielding(ball: Dictionary, fielders: Array, rng) -> Dictionary:
	var zone: String = ball.get("zone", "SS")
	var fielder: Dictionary = default_fielder(zone)
	for f in fielders:
		if f.get("position", "") == zone:
			fielder = f
			break

	var is_error: bool = rng.randf() < calc_error_prob(ball, fielder)
	var threw_to: String = ""
	var throw_result: String = ""
	var code: String = "FIELDING_ERROR" if is_error else "INPLAY_OUT"

	if not is_error and NEEDS_THROW.has(ball.get("hit_type", "")) and zone != "1B":
		threw_to = "1B"
		var arm_mod: float = (float(fielder.get("arm", 50.0)) - 50.0) * 0.004
		var hard_penalty: float = (float(ball.get("hardness", 3)) - 3.0) * 0.02
		var success: float = clampf(0.88 + arm_mod - hard_penalty, 0.45, 0.97)
		if rng.randf() < success:
			throw_result = "out"
		else:
			throw_result = "safe"
			code = "FIELDING_ERROR"

	return {
		"fielder": fielder,
		"is_error": is_error,
		"threw_to": threw_to,
		"throw_result": throw_result,
		# 실책이면 주자가 한 베이스 더 간다
		"runner_extra_advance": 1 if is_error else 0,
		"code": code,
	}
