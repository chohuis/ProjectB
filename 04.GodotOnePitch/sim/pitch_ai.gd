extends RefCounted
class_name PitchAi

## NPC 투구 선택 — 코스·구종·전략. P-1.
##
## 원본: `match_engine.rs`의 `pick_target`(코스 정본) · `pick_from_arsenal`
##       (구종) · `auto_pick_decision`. 수치는 `tuning.rs`.
##
## ⚠ **예전엔 벤치마크용 자리표시자가 리그를 돌렸다.** `MatchDay._decide`가
## `GameBench._decide`와 같은 코드였고 주석도 "성능을 재는 게 목적이라 전술은
## 안 넣는다"였는데, 그게 **리그 경기 수천 개**에 쓰였다.
##
## ⚠ **존 밖을 한 번도 안 던졌다.** `OUT_OF_ZONE_RATE = 0.0`이라 볼이 4개
## 쌓일 일이 없어 **9이닝당 볼넷 0.0**이었다(02는 3.3). 제구 흔들림만으로는
## 볼넷이 안 난다 — 실측으로 확인했다.
##
## ⚠ **카운트도 투수도 안 봤다.** 인자가 `(_state, rng)`인데 상태를 통째로
## 버렸다. 볼 3개든 스트라이크 2개든 같은 공이었고, **배운 구종은 마운드에
## 안 나왔다**(직구/슬라이더 둘로 고정).
##
## ⚠ **비율을 지어내지 않았다.** 26%로 시험했더니 볼넷은 0→1.2로 늘지만
## ERA가 3.95→5.69, 타율이 .251→.285로 같이 치솟았다. 02 표를 그대로 옮긴다.

# ── 코스 (02 `tuning.rs`) ─────────────────────────────────────

## 유인구 확률. **순서가 뜻이다** — 볼 3개면 스트라이크를 던져야 하고
## 스트라이크 2개면 유인구를 던진다
const CHASE_BEHIND: float = 0.30
const CHASE_NEUTRAL: float = 0.50
const CHASE_AHEAD: float = 0.66

## 존 밖으로 빼는 거리. 존 반지름이 1.0이므로 1.05가 갓 밖이다
const CHASE_MIN: float = 1.05
const CHASE_SPAN: float = 0.45

## 볼 3개에 스트라이크를 던질 때 — 존 한복판
const MIDDLE_SPAN: float = 1.0
## 스트라이크 2개에 존 안을 노릴 때 — 코너
const CORNER_MIN: float = 0.55
const CORNER_SPAN: float = 0.40
## 그 밖 — 존 전체
const NEUTRAL_SPAN: float = 1.6

## 결정구를 고를 확률. **늘 같은 공이면 읽힌다**
const OUT_PITCH_PROB: float = 0.70

## 속구 계열 — 볼 3개에 "제일 잘 넣는 공"을 여기서 고른다
const FASTBALLS: Array[String] = ["fastball", "sinker", "cutter"]


## 숙련도 가중 추첨의 무게 (02 `tuning.rs::grade_pick_weight`)
static func grade_pick_weight(grade: int) -> float:
	if grade <= 1:
		return 0.5
	if grade == 2:
		return 0.8
	if grade == 3:
		return 1.0
	if grade == 4:
		return 1.5
	return 2.0


static func _sign(rng) -> float:
	return -1.0 if rng.randf() < 0.5 else 1.0


## 카운트별 목표 지점 — **코스 선택의 정본이다.**
##
## ⚠ 02는 이 표가 두 곳에 있었고 **둘 다 존 밖을 안 겨냥했다**(최대 0.8과
## 1.1인데 볼 판정선은 1.2였다). 200경기에 볼넷이 3개였다. 표를 두 곳에 두면
## 한쪽만 고쳐지므로 여기 하나로 모은다
static func pick_target(balls: int, strikes: int, rng) -> Vector2:
	var chase: float = CHASE_NEUTRAL
	if balls >= 3:
		chase = CHASE_BEHIND
	elif strikes == 2:
		chase = CHASE_AHEAD

	if rng.randf() < chase:
		# ⚠ **한 축만 뺀다.** 두 축 다 빼면 대각선으로 크게 벗어나 타자가
		# 아예 안 속고 볼만 쌓인다
		var out: float = CHASE_MIN + rng.randf() * CHASE_SPAN
		var other: float = (rng.randf() - 0.5) * 1.8
		if rng.randf() < 0.5:
			return Vector2(_sign(rng) * out, other)
		return Vector2(other, _sign(rng) * out)

	if balls >= 3:
		# 볼넷을 피해야 한다 — 존 한복판
		return Vector2((rng.randf() - 0.5) * MIDDLE_SPAN,
			(rng.randf() - 0.5) * MIDDLE_SPAN)
	if strikes == 2:
		return Vector2(_sign(rng) * (CORNER_MIN + rng.randf() * CORNER_SPAN),
			_sign(rng) * (CORNER_MIN + rng.randf() * CORNER_SPAN))
	return Vector2((rng.randf() - 0.5) * NEUTRAL_SPAN,
		(rng.randf() - 0.5) * NEUTRAL_SPAN)


## 좌표 → 존 번호(1~9). **화면이 보는 값이다.**
##
## ⚠ **존 밖도 번호가 붙는다.** 02도 그렇다 — 판정은 좌표가 하고 번호는
## "어느 쪽으로 던졌나"를 말할 뿐이다
static func target_to_zone(t: Vector2) -> int:
	var col: int = 0 if t.x < -0.33 else (1 if t.x < 0.33 else 2)
	var row: int = 0 if t.y < -0.33 else (1 if t.y < 0.33 else 2)
	return [[7, 8, 9], [4, 5, 6], [1, 2, 3]][row][col]


# ── 구종 ──────────────────────────────────────────────────────

static func _best(arsenal: Array, only: Array = []) -> Dictionary:
	var best: Dictionary = {}
	for a in arsenal:
		var id: String = String(a.get("id", ""))
		if not only.is_empty() and not only.has(id):
			continue
		if only.is_empty() and id == "fastball":
			continue
		if best.is_empty() or int(a.get("grade", 0)) > int(best.get("grade", 0)):
			best = a
	return best


## 무엇을 던지나. **보유 목록에서 나온다** — 전략만 카운트가 정한다
static func pick_from_arsenal(pitcher: Dictionary, balls: int, strikes: int,
		rng) -> String:
	var arsenal: Array = pitcher.get("pitches", [])
	if arsenal.is_empty():
		return "fastball"

	# 볼 3개 — 제일 잘 넣는 속구 계열. 없으면 숙련도 최고
	if balls >= 3:
		var fb: Dictionary = _best(arsenal, FASTBALLS)
		if not fb.is_empty():
			return String(fb["id"])
		var top: Dictionary = {}
		for a in arsenal:
			if top.is_empty() or int(a.get("grade", 0)) > int(top.get("grade", 0)):
				top = a
		return String(top.get("id", "fastball"))

	# 두 스트라이크 — 결정구. 속구가 아닌 것 중 숙련도 최고를 크게 선호한다
	if strikes == 2:
		var out_pitch: Dictionary = _best(arsenal)
		if not out_pitch.is_empty() and rng.randf() < OUT_PITCH_PROB:
			return String(out_pitch["id"])

	# 그 외 — 숙련도 가중 추첨
	var total: float = 0.0
	for a in arsenal:
		total += grade_pick_weight(int(a.get("grade", 0)))
	if total <= 0.0:
		return String(arsenal[0].get("id", "fastball"))
	var roll: float = rng.randf() * total
	for a in arsenal:
		roll -= grade_pick_weight(int(a.get("grade", 0)))
		if roll <= 0.0:
			return String(a.get("id", "fastball"))
	return String(arsenal[-1].get("id", "fastball"))


# ── 한 구 ─────────────────────────────────────────────────────

## `{pitch_type, location, target, strategy, power}`
##
## ⚠ **`target`을 같이 넘긴다.** 존 번호만 넘기면 `zone_to_target`이 아홉 칸
## 대표값으로 되돌려서 **코너도 유인구도 다 뭉갠다** — 존 밖이 아예 표현이 안 된다
static func decide(state: Dictionary, rng) -> Dictionary:
	var count: Dictionary = state.get("count", {})
	var balls: int = int(count.get("balls", 0))
	var strikes: int = int(count.get("strikes", 0))
	var target: Vector2 = pick_target(balls, strikes, rng)

	var strategy: String = "balanced"
	if balls >= 3:
		strategy = "safe"
	elif strikes == 2:
		strategy = "aggressive"

	return {
		"pitch_type": pick_from_arsenal(state.get("pitcher", {}), balls, strikes, rng),
		"location": target_to_zone(target),
		"target": target,
		"strategy": strategy,
		"power": "normal",
	}
