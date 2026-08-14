extends RefCounted
class_name Release

## 2단계 방출 — M9-13.
##
## 원본: `team_engine.rs`의 `eval_release_priority`
##
## **1단계는 로스터 초과분**(`RosterMaintenance`)이고, 여기 2단계는 **정원
## 안이어도** 성적·연봉·뎁스로 걸러내는 판정이다.
##
## ⚠ **구단 성향이 판정을 가른다.** 02는 전 팀이 정확히 50이라 규율·안정성·
## 성적압박 항이 **하나도 안 갈렸다** — 어느 팀에 있든 같은 점수였다.


## 점수가 이보다 높으면 방출 후보
const SCORE_THRESHOLD: float = 55.0
## 한 시즌에 한 팀이 방출할 수 있는 최대 인원.
## **없으면 성적 나쁜 해에 팀이 통째로 갈린다**
const MAX_PER_TEAM: int = 3

## 성적이 기준(50)에 못 미친 만큼
const PERF_BASE: float = 50.0
const PERF_WEIGHT: float = 0.8
## 시장가 대비 과지급
const OVERPAY_MILD: float = 1.5
const OVERPAY_MILD_SCORE: float = 20.0
const OVERPAY_HEAVY: float = 2.0
const OVERPAY_HEAVY_SCORE: float = 30.0
## 같은 자리에 몇 명부터 두꺼운가
const DEPTH_FROM: int = 4
const DEPTH_SCORE: float = 15.0
## 나이
const AGE_FROM: int = 35
const AGE_STEP: float = 3.0
## 구단 성향
const DISCIPLINE_HIGH: float = 70.0
const PRO_LOW: float = 35.0
const PRO_SCORE: float = 25.0
const STABILITY_HIGH: float = 70.0
const STABILITY_AGE: int = 30
const STABILITY_MERCY: float = 10.0
const PRESSURE_HIGH: float = 80.0
const PRESSURE_MULT: float = 1.3
## 구단주 관계 1점당 감산폭. **주인공에게만 값이 들어온다** —
## 관계도가 주인공 기준 1:N이라 NPC끼리의 구단주 관계는 존재하지 않는다
const OWNER_RELATION_WEIGHT: float = 0.4

## 왜 후보가 됐나 — 비트 자리
const FLAG_PERF: int = 1
const FLAG_OVERPAY: int = 2
const FLAG_DEPTH: int = 4
const FLAG_AGE: int = 8
const FLAG_PRO: int = 16
const FLAG_OWNER: int = 32


## 방출 점수. `{score, flags}` — 점수는 **0 아래로 안 간다**
##
## `p`: `{age, professionalism}` · `profile`: `TeamProfile.of(...)`
static func score_of(p: Dictionary, profile: Dictionary, perf_rating: float,
		depth_at_position: int, salary: int, market_value: int,
		owner_relation: float = 0.0) -> Dictionary:
	var score: float = 0.0
	var flags: int = 0

	# ① 성적 — 기준에 못 미친 만큼
	var deficit: float = PERF_BASE - perf_rating
	if deficit > 0.0:
		score += deficit * PERF_WEIGHT
		flags |= FLAG_PERF

	# ② 과지급 — 시장가의 몇 배를 받나
	var overpay: float = float(salary) / float(maxi(market_value, 1))
	if overpay > OVERPAY_MILD:
		score += OVERPAY_MILD_SCORE
		flags |= FLAG_OVERPAY
	if overpay > OVERPAY_HEAVY:
		score += OVERPAY_HEAVY_SCORE

	# ③ 뎁스 — 같은 자리가 두꺼우면 밀린다
	if depth_at_position >= DEPTH_FROM:
		score += DEPTH_SCORE
		flags |= FLAG_DEPTH

	# ④ 나이
	var age: int = int(p.get("age", 25))
	if age >= AGE_FROM:
		score += float(age - AGE_FROM) * AGE_STEP
		flags |= FLAG_AGE

	# ⑤ 구단 성향 — **여기가 팀마다 달라야 뜻이 있다**
	if float(profile.get("discipline", 50.0)) > DISCIPLINE_HIGH:
		if float(p.get("professionalism", 50.0)) < PRO_LOW:
			score += PRO_SCORE
			flags |= FLAG_PRO
	# 안정성 높은 구단은 노장에게 한 번 더 기회를 준다
	if float(profile.get("stability", 50.0)) > STABILITY_HIGH and age >= STABILITY_AGE:
		score -= STABILITY_MERCY
	# 성적 압박이 크면 전부 세진다
	if float(profile.get("win_now_pressure", 50.0)) > PRESSURE_HIGH:
		score *= PRESSURE_MULT

	# ⑥ 구단주 관계 — 좋으면 한 번 더 기회를 준다. **주인공에게만 값이 있다**
	if owner_relation != 0.0:
		score -= owner_relation * OWNER_RELATION_WEIGHT
		flags |= FLAG_OWNER

	return {"score": maxf(score, 0.0), "flags": flags}


## 한 팀의 방출 대상. **점수 높은 순으로 최대 `MAX_PER_TEAM`명.**
##
## ⚠ **주인공은 대상이 아니다.** 사용자가 정할 일을 세계가 대신 정하면 안 된다
static func pick(roster: Array, profile: Dictionary,
		depth: Dictionary = {}) -> Array:
	var scored: Array = []
	for p in roster:
		if p.get("is_protagonist", false):
			continue
		var pos: String = String(p.get("position", ""))
		var r: Dictionary = score_of(p, profile,
			float(p.get("recent_rating", PERF_BASE)),
			int(depth.get(pos, 0)),
			int(p.get("salary", 0)), int(p.get("market_value", p.get("salary", 1))))
		if float(r["score"]) <= SCORE_THRESHOLD:
			continue
		scored.append({"player": p, "score": float(r["score"]), "flags": r["flags"]})

	# ⚠ **점수 → id 순.** 뒤 갈래가 없으면 같은 점수에서 순서가 흔들려
	# 재현이 무너진다
	scored.sort_custom(func(a, b) -> bool:
		if not is_equal_approx(a["score"], b["score"]):
			return a["score"] > b["score"]
		return String(a["player"].get("id", "")) < String(b["player"].get("id", "")))

	return scored.slice(0, MAX_PER_TEAM)


## 자리별 인원 — 뎁스 판정의 입력
static func depth_of(roster: Array) -> Dictionary:
	var out: Dictionary = {}
	for p in roster:
		var pos: String = String(p.get("position", ""))
		out[pos] = int(out.get(pos, 0)) + 1
	return out
