extends RefCounted
class_name Trade

## 트레이드 — 제안 생성과 가치 평가. M9-15.
##
## 원본: `team_engine.rs`의 `generate_trade_proposals` · `eval_trade_value`
##
## ⚠ **02에서 트레이드가 말라 죽었다** — 9 → 8 → 2 → 1 → 1 → 0.
## 원인은 산식이 아니라 **구단 성향을 아무도 안 갱신한 것**이었다.
## buyer 조건이 `상위 30% · 성적압박 > 60`인데 전 팀이 정확히 50이라
## **buyer가 구조적으로 0팀**이었고, seller만 남으면 거래 상대가 없다.
##
## 그래서 이 모듈은 `TeamProfile`이 선 뒤에야 뜻이 있다.
##
## ⚠ **아직 못 옮긴 갈래 둘이 있다** — 04에 데이터가 없다:
##   · **부상 긴급 보강** — `injured_positions`(자리별 부상자 목록)이 필요하다
##   · **선수 야망 이적** — `personality.ambition`이 필요하다
## 둘 다 붙으면 여기 갈래를 늘린다


## 자리 목록. **02와 같은 순서다** — 순서가 바뀌면 같은 세계에서 다른
## 제안이 먼저 나온다
const POSITIONS: Array[String] = ["SP", "RP", "CP", "C", "1B", "2B", "3B",
	"SS", "LF", "CF", "RF", "DH"]

## 프로 연차가 이 이하면 유망주다 (02 `isProspect`)
const PROSPECT_SERVICE: int = 2

## 자리가 남는다/모자란다의 경계
const SURPLUS_COUNT: int = 3
const DEFICIT_COUNT: int = 1

# ── 갈래별 문턱 (02 값 그대로) ────────────────────────────────

## ① 계약 만료 선점 — FA로 잃기 전에 유망주와 바꾼다
const EXPIRING_YEARS: int = 1
const EXPIRING_PROSPECT_OVR: float = 55.0
const EXPIRING_GIVE_WEIGHT: float = 0.8
const EXPIRING_GET_WEIGHT: float = 0.6
const EXPIRING_MIN_SCORE: float = 75.0

## ② seller — 베테랑을 유망주 둘로
const SELLER_PROSPECT_OVR: float = 52.0
const SELLER_BUNDLE_SIZE: int = 2
const SELLER_BUNDLE_WEIGHT: float = 0.55
const SELLER_GAP_MAX: float = 18.0

## ③ buyer — 즉시전력을 요구한다
const BUYER_TARGET_OVR: float = 65.0
const BUYER_TARGET_AGE_MAX: int = 33
const BUYER_GIVE_WEIGHT: float = 0.6
const BUYER_MIN_SCORE: float = 90.0

## ④ 중립 — 서로 남는 자리를 바꾼다
const NEUTRAL_GIVE_WEIGHT: float = 0.5
const NEUTRAL_MIN_SCORE: float = 60.0

## ⑤ 유망주 번들 — 성적 압박이 낮은 팀이 미래를 산다
const REBUILD_PRESSURE: float = 40.0
const REBUILD_PROSPECT_OVR: float = 55.0


static func is_prospect(a: Dictionary) -> bool:
	return int(a.get("service_years", 0)) <= PROSPECT_SERVICE


static func _count_at(players: Array, pos: String) -> int:
	var n: int = 0
	for p in players:
		if String(p.get("position", "")) == pos and not is_prospect(p):
			n += 1
	return n


## 능력 내림차순 사본
static func _by_ovr_desc(players: Array) -> Array:
	var out: Array = players.duplicate()
	out.sort_custom(func(a, b) -> bool:
		var oa: float = float(a.get("ovr", 0.0))
		var ob: float = float(b.get("ovr", 0.0))
		if oa != ob:
			return oa > ob
		# ⚠ **동점 갈래가 없으면 재현이 무너진다**
		return String(a.get("id", "")) < String(b.get("id", "")))
	return out


## ⚠ **뒤집기로 만들면 안 된다.** 내림차순의 동점 갈래(id 오름차순)까지
## 같이 뒤집혀서 **동점일 때 제일 큰 id가 뽑힌다** — 오름차순으로 따로 센다
static func _by_ovr_asc(players: Array) -> Array:
	var out: Array = players.duplicate()
	out.sort_custom(func(a, b) -> bool:
		var oa: float = float(a.get("ovr", 0.0))
		var ob: float = float(b.get("ovr", 0.0))
		if oa != ob:
			return oa < ob
		return String(a.get("id", "")) < String(b.get("id", "")))
	return out


# ── 제안 만들기 ───────────────────────────────────────────────

static func _proposal(from_team: String, to_team: String, offering: Array,
		requesting: Array, score: float, reason: String) -> Dictionary:
	return {"from_team_id": from_team, "to_team_id": to_team,
		"offering_ids": offering, "requesting_ids": requesting,
		"score": score, "reason": reason}


## 두 팀 사이의 제안들.
##
## `mode`는 `"buyer"` · `"seller"` · `"neutral"` — `TeamProfile`이 정한다
static func between(a: Dictionary, b: Dictionary,
		a_players: Array, b_players: Array,
		a_mode: String, b_mode: String) -> Array:
	var out: Array = []
	var a_id: String = String(a["team_id"])
	var b_id: String = String(b["team_id"])

	# ① 계약 만료 선점 — **FA로 잃기 전에** 유망주와 바꾼다
	out.append_array(_expiring(a_id, b_id, a_players, b_players))
	out.append_array(_expiring(b_id, a_id, b_players, a_players))

	# ② 자리 남음/모자람 — 양쪽 다 본다
	for pos in POSITIONS:
		var a_cnt: int = _count_at(a_players, pos)
		var b_cnt: int = _count_at(b_players, pos)
		if a_cnt >= SURPLUS_COUNT and b_cnt <= DEFICIT_COUNT:
			out.append_array(_surplus(a, b, a_players, b_players, pos, a_mode))
		elif b_cnt >= SURPLUS_COUNT and a_cnt <= DEFICIT_COUNT:
			out.append_array(_surplus(b, a, b_players, a_players, pos, b_mode))

	return out


## ① 계약이 한 해 남은 선수를 유망주와 바꾼다
static func _expiring(from_team: String, to_team: String,
		mine: Array, theirs: Array) -> Array:
	var out: Array = []
	for p in _by_ovr_desc(mine):
		if int(p.get("contract_years", 99)) > EXPIRING_YEARS:
			continue
		var candidates: Array = []
		for q in theirs:
			if is_prospect(q) and float(q.get("ovr", 0.0)) >= EXPIRING_PROSPECT_OVR:
				candidates.append(q)
		if candidates.is_empty():
			continue
		var best: Dictionary = _by_ovr_desc(candidates)[0]
		var score: float = float(p["ovr"]) * EXPIRING_GIVE_WEIGHT \
			+ float(best["ovr"]) * EXPIRING_GET_WEIGHT
		if score > EXPIRING_MIN_SCORE:
			out.append(_proposal(from_team, to_team, [String(p["id"])],
				[String(best["id"])], score, "expiring_contract"))
	return out


## ② 자리가 남는 팀이 모자란 팀에 제안한다. **모드가 무엇을 요구할지 정한다**
static func _surplus(surplus_team: Dictionary, deficit_team: Dictionary,
		surplus_players: Array, deficit_players: Array,
		pos: String, mode: String) -> Array:
	var out: Array = []
	var from_id: String = String(surplus_team["team_id"])
	var to_id: String = String(deficit_team["team_id"])

	# 남는 자리에서 **제일 약한 선수**를 내놓는다
	var mine: Array = []
	for p in surplus_players:
		if String(p.get("position", "")) == pos and not is_prospect(p):
			mine.append(p)
	if mine.is_empty():
		return out
	var offer: Dictionary = _by_ovr_asc(mine)[0]

	if mode == "seller":
		# 베테랑 하나를 유망주 둘로 — **미래를 산다**
		var prospects: Array = []
		for q in deficit_players:
			if is_prospect(q) and float(q.get("ovr", 0.0)) >= SELLER_PROSPECT_OVR:
				prospects.append(q)
		var bundle: Array = _by_ovr_desc(prospects).slice(0, SELLER_BUNDLE_SIZE)
		if not bundle.is_empty():
			var bundle_val: float = 0.0
			var ids: Array = []
			for q in bundle:
				bundle_val += float(q["ovr"])
				ids.append(String(q["id"]))
			bundle_val *= SELLER_BUNDLE_WEIGHT
			# **값이 비슷해야 성사된다** — 한쪽이 손해면 상대가 안 받는다
			if absf(float(offer["ovr"]) - bundle_val) < SELLER_GAP_MAX:
				out.append(_proposal(from_id, to_id, [String(offer["id"])], ids,
					(float(offer["ovr"]) + bundle_val) / 2.0, "seller_mode"))

	if mode == "buyer":
		# 즉시전력을 요구한다 — 유망주는 안 받는다
		var targets: Array = []
		for q in deficit_players:
			if is_prospect(q):
				continue
			if float(q.get("ovr", 0.0)) >= BUYER_TARGET_OVR \
					and int(q.get("age", 99)) <= BUYER_TARGET_AGE_MAX:
				targets.append(q)
		if not targets.is_empty():
			var want: Dictionary = _by_ovr_desc(targets)[0]
			var score: float = float(offer["ovr"]) * BUYER_GIVE_WEIGHT \
				+ float(want["ovr"])
			if score > BUYER_MIN_SCORE:
				out.append(_proposal(from_id, to_id, [String(offer["id"])],
					[String(want["id"])], score, "buyer_mode"))

	# ③ 중립 — **서로 남는 자리를 맞바꾼다.** 모드와 무관하게 늘 본다
	var want_pos: String = ""
	for p2 in POSITIONS:
		if _count_at(surplus_players, p2) <= DEFICIT_COUNT \
				and _count_at(deficit_players, p2) >= SURPLUS_COUNT:
			want_pos = p2
			break
	if not want_pos.is_empty():
		var theirs: Array = []
		for q in deficit_players:
			if String(q.get("position", "")) == want_pos and not is_prospect(q):
				theirs.append(q)
		if not theirs.is_empty():
			var req: Dictionary = _by_ovr_asc(theirs)[0]
			var mutual: float = (
				(float(offer["ovr"]) * NEUTRAL_GIVE_WEIGHT + float(req["ovr"]))
				+ (float(req["ovr"]) * NEUTRAL_GIVE_WEIGHT + float(offer["ovr"]))
			) / 2.0
			if mutual > NEUTRAL_MIN_SCORE:
				out.append(_proposal(from_id, to_id, [String(offer["id"])],
					[String(req["id"])], mutual, "position_surplus"))

	# ④ 유망주 번들 — 성적 압박이 낮은 팀이 미래를 산다. **buyer는 안 한다**
	if float(surplus_team.get("win_now_pressure", 50.0)) < REBUILD_PRESSURE \
			and mode != "buyer":
		var young: Array = []
		for q in deficit_players:
			if is_prospect(q) and float(q.get("ovr", 0.0)) >= REBUILD_PROSPECT_OVR:
				young.append(q)
		var bundle2: Array = _by_ovr_desc(young).slice(0, SELLER_BUNDLE_SIZE)
		if not bundle2.is_empty():
			var ids2: Array = []
			var val2: float = 0.0
			for q in bundle2:
				ids2.append(String(q["id"]))
				val2 += float(q["ovr"])
			out.append(_proposal(from_id, to_id, [String(offer["id"])], ids2,
				(float(offer["ovr"]) + val2 * SELLER_BUNDLE_WEIGHT) / 2.0,
				"rebuild_bundle"))

	return out


# ── 받을까 ────────────────────────────────────────────────────

## 리그 샐러리캡 — 02가 넘기던 고정값
const SALARY_CAP: int = 300000
const OVR_WEIGHT: float = 1.5
## 안정성 높은 구단은 전성기를 좋아하고 어린 선수를 낮게 본다
const STABILITY_HIGH: float = 60.0
const PRIME_AGE_MIN: int = 27
const PRIME_AGE_MAX: int = 31
const PRIME_BONUS: float = 1.2
const YOUNG_AGE: int = 23
const YOUNG_PENALTY: float = 0.85
## 육성 지향 구단은 반대다
const DEV_FOCUS_HIGH: float = 60.0
const DEV_YOUNG_BONUS: float = 1.3
const DEV_OLD_AGE: int = 32
const DEV_OLD_PENALTY: float = 0.7
## 성적 압박이 크면 즉시전력을 높게, 유망주를 낮게 본다
const PRESSURE_HIGH: float = 70.0
const NOW_OVR: float = 70.0
const NOW_AGE: int = 25
const NOW_BONUS: float = 1.25
const PROSPECT_PENALTY: float = 0.7
## 모자란 자리를 채우면 얹는 값
const NEED_BONUS: float = 20.0
## 연봉 부담
const BURDEN_SHARE: float = 0.3
const BURDEN_WEIGHT: float = 5.0
## 받아들일 확률
const ACCEPT_BASE: float = 0.5
const ACCEPT_SCALE: float = 100.0
const ACCEPT_MIN: float = 0.05
const ACCEPT_MAX: float = 0.95
## 이 아래면 거절한다
const ACCEPT_THRESHOLD: float = 0.35


## 한 선수가 그 팀에 얼마짜리인가. **구단 성향이 값을 바꾼다**
static func asset_value(a: Dictionary, profile: Dictionary, needs: Array,
		flex: float) -> float:
	var v: float = float(a.get("ovr", 0.0)) * OVR_WEIGHT
	var age: int = int(a.get("age", 27))

	if float(profile.get("stability", 50.0)) > STABILITY_HIGH:
		if age >= PRIME_AGE_MIN and age <= PRIME_AGE_MAX:
			v *= PRIME_BONUS
		if age < YOUNG_AGE:
			v *= YOUNG_PENALTY
	if float(profile.get("development_focus", 50.0)) > DEV_FOCUS_HIGH:
		if age <= YOUNG_AGE:
			v *= DEV_YOUNG_BONUS
		if age > DEV_OLD_AGE:
			v *= DEV_OLD_PENALTY
	if float(profile.get("win_now_pressure", 50.0)) > PRESSURE_HIGH:
		if float(a.get("ovr", 0.0)) >= NOW_OVR and age >= NOW_AGE:
			v *= NOW_BONUS
		if is_prospect(a):
			v *= PROSPECT_PENALTY

	if needs.has(String(a.get("position", ""))):
		v += NEED_BONUS

	# ⚠ **연봉이 값을 깎는다.** 없으면 비싼 선수가 늘 좋은 자산이 되고
	# 팀들이 연봉만 주고받는다
	var burden: float = float(a.get("salary", 0)) \
		/ maxf(flex * float(SALARY_CAP), 1.0) / BURDEN_SHARE
	return v - burden * BURDEN_WEIGHT


## 받는 쪽이 이 거래를 어떻게 보나. `{net, accept_probability}`
static func evaluate(giving: Array, receiving: Array, profile: Dictionary,
		payroll: int, needs: Array = []) -> Dictionary:
	var flex: float = float(SALARY_CAP - payroll) / float(SALARY_CAP)
	var give: float = 0.0
	for a in giving:
		give += asset_value(a, profile, needs, flex)
	var get_val: float = 0.0
	for a in receiving:
		get_val += asset_value(a, profile, needs, flex)
	var net: float = get_val - give
	return {"net": net, "accept_probability": clampf(
		ACCEPT_BASE + net / ACCEPT_SCALE, ACCEPT_MIN, ACCEPT_MAX)}


static func accepts(giving: Array, receiving: Array, profile: Dictionary,
		payroll: int, needs: Array = []) -> bool:
	return float(evaluate(giving, receiving, profile, payroll, needs)
		["accept_probability"]) >= ACCEPT_THRESHOLD
