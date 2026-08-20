extends RefCounted
class_name Contract

## 연봉·계약연수·프로 연차 — M9-11.
##
## 원본: `npc_sim.rs`의 `estimate_salary_and_contract` · `service_factor` ·
##       `career_history.rs`의 `pick_entry_age`
##
## ⚠ **FA가 이 셋을 입력으로 쓴다.** 등급은 리그 연봉 순위 백분위로 갈리고,
## 자격은 프로 연차로 갈린다 — 둘 다 없으면 FA 시장이 아예 못 선다.
##
## 단위는 **만원**이다.


const SALARY_PATH: String = "res://data/salary_rules.json"

## 파일을 한 번만 읽는다
static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(SALARY_PATH, FileAccess.READ)
	if f == null:
		push_error("연봉 규칙을 못 읽는다: %s" % SALARY_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


# ── 주인공 재계약 오퍼 (F-7) ──────────────────────────────────
#
# ⚠ **04엔 이 식이 아예 없었다.** `salary_negotiation` pending을 만드는 두
# 곳(`contract_decision.gd:144` · `military.gd:189`)이 **이미 있는 값을
# 그대로 옮겨 담을 뿐**이었고, 아래 `estimate`는 NPC 계약 생성에서만 쓰인다.
#
# ⚠ **그래서 스태프 `budget` 계수(구단주)가 소비처 0건이었다.**
# `Staff.mods_of`가 만들어 주는데 읽는 곳이 없었다 — 여기가 그 자리다.
#
# 원본: `player_engine.rs:282-311` · 호출부는 `advanceWeek.ts:1017-1030`(W43)

## 구단주 계수 상한선 — 02 Rust의 `clamp(0.80, 1.25)`.
## **안 가두면 지갑 큰 구단 하나가 연봉 체계를 통째로 흔든다**
static var OFFER_BUDGET_MIN: float = float(rules().get(
	"protagonist_offer", {}).get("budget_min", 0.80))
static var OFFER_BUDGET_MAX: float = float(rules().get(
	"protagonist_offer", {}).get("budget_max", 1.25))
## 최저선 — 없으면 못 던진 해에 0원 계약이 나온다
static var OFFER_FLOOR: int = int(float(rules().get(
	"protagonist_offer", {}).get("floor", 1500.0)))


## 시즌 평점 0~100. **기록이 없으면 50이다.**
##
## ⚠ **한 이닝도 안 던졌으면 기록이 없는 것과 같다.** 0으로 나누면 방어율이
## 무한이 되고 오퍼가 최저선으로 떨어진다 — 다치거나 2군에 있던 해가 그렇다
static func season_rating(stats: Dictionary) -> float:
	var r: Dictionary = rules().get("season_rating", {})
	var no_record: float = float(r.get("no_record", 50.0))
	var ip: float = float(stats.get("ip", 0.0))
	if stats.is_empty() or ip <= 0.0:
		return no_record

	var lo: float = float(r.get("score_min", 20.0))
	var hi: float = float(r.get("score_max", 100.0))
	var era_score: float = clampf(float(r.get("era_base", 100.0))
		- (float(stats.get("era", 0.0)) - float(r.get("era_pivot", 2.0)))
		* float(r.get("era_step", 18.0)), lo, hi)
	var whip_score: float = clampf(float(r.get("whip_base", 100.0))
		- (float(stats.get("whip", 0.0)) - float(r.get("whip_pivot", 1.0)))
		* float(r.get("whip_step", 55.0)), lo, hi)
	var k9: float = float(stats.get("k", 0)) / ip * 9.0
	var k_score: float = clampf(float(r.get("k_base", 40.0))
		+ k9 * float(r.get("k_step", 6.0)), lo, hi)

	return era_score * float(r.get("w_era", 0.45)) \
		+ whip_score * float(r.get("w_whip", 0.3)) \
		+ k_score * float(r.get("w_k", 0.25))


## 주인공의 시장가(만원) — 구단주 성향을 안 탄 값.
##
## 원본: `player_engine.rs:263-266`의 `calc_market_salary`.
## OVR 50 · 명성 0 · KBL이면 1800, OVR 80이면 8400 (02 검사가 못 박은 값).
##
## ⚠ **`market_value`(NPC 계약 생성용)와 다른 식이다.** 그쪽은 OVR 곡선·
## 연차·나이로 내고 이쪽은 평평한 선형이다 — 협상 화면에서 그쪽을 쓰면
## **"시장가 대비 277%"** 같은 값이 뜬다(실제로 그렇게 찍혔다).
## 02도 협상 화면에서 이 식을 쓴다(`calcMarketSalary`)
static func protagonist_market(p: Dictionary) -> int:
	var r: Dictionary = rules().get("protagonist_offer", {})
	var ovr: float = float(p.get("pitching", {}).get("ovr", 0.0))
	var mult: float = float(r.get("league_mult", {}).get(
		String(p.get("league_id", "")), r.get("league_mult_default", 1.0)))
	return int(roundf((float(r.get("base_flat", 1800.0))
		+ maxf(ovr - float(r.get("ovr_pivot", 50.0)), 0.0)
			* float(r.get("ovr_step", 220.0))
		+ float(p.get("fame", 0.0)) * float(r.get("fame_step", 28.0))) * mult))


## 구단이 주인공에게 내미는 재계약 연봉(만원).
##
## `budget_mod`는 구단주 성향 계수다 — `Staff.mods_of(...)["budget"]`.
##
## ⚠ **시장가에만 곱한다.** 지금 연봉은 이미 계약된 값이라 구단주가 못
## 바꾼다 (02 주석 그대로).
##
## ⚠ **지금 연봉이 없으면 시장가를 쓴다.** 0으로 두면 첫 계약이 시장가의
## 40%로 떨어진다
static func protagonist_offer(p: Dictionary, stats: Dictionary,
		budget_mod: float = 1.0) -> int:
	var r: Dictionary = rules().get("protagonist_offer", {})
	var market: float = float(protagonist_market(p)) \
		* clampf(budget_mod, OFFER_BUDGET_MIN, OFFER_BUDGET_MAX)

	var current: float = float(p.get("salary", 0))
	if current <= 0.0:
		current = market

	var perf: float = 1.0 + (season_rating(stats) - 50.0) \
		* float(r.get("perf_step", 0.012))
	var blended: float = current * perf * float(r.get("current_weight", 0.6)) \
		+ market * float(r.get("market_weight", 0.4))
	return int(roundf(maxf(blended, float(OFFER_FLOOR))))


# ── 입단 나이 ─────────────────────────────────────────────────

## 고졸 20 · 대졸 24 · 독립 25~27. **비중은 고졸 55 · 대졸 30 · 독립 15**
const ENTRY_HS_AGE: int = 20
const ENTRY_UNIV_AGE: int = 24
const ENTRY_INDIE_MIN: int = 25
const ENTRY_INDIE_MAX: int = 27
const ENTRY_WEIGHT_HS: float = 55.0
const ENTRY_WEIGHT_UNIV: float = 30.0
const ENTRY_WEIGHT_INDIE: float = 15.0


## 몇 살에 프로에 들어왔나.
##
## ⚠ **입단 경로를 먼저 뽑고 연차를 역산한다.** 연차를 균등하게 뽑으면
## 입단 나이가 중간값에 몰려 출신 분포가 뒤집힌다 — 02에서 실제로
## **대졸 57% / 고졸 28%** 가 나왔다(KBO는 반대다)
static func entry_age(r: float, r2: float) -> int:
	var total: float = ENTRY_WEIGHT_HS + ENTRY_WEIGHT_UNIV + ENTRY_WEIGHT_INDIE
	var t: float = r * total
	t -= ENTRY_WEIGHT_HS
	if t <= 0.0:
		return ENTRY_HS_AGE
	t -= ENTRY_WEIGHT_UNIV
	if t <= 0.0:
		return ENTRY_UNIV_AGE
	var span: int = ENTRY_INDIE_MAX - ENTRY_INDIE_MIN
	return ENTRY_INDIE_MIN + int(r2 * float(span + 1))


## 지금 나이에서 프로 연차. **음수가 안 나오게 바닥이 0이다** —
## 스물 이전에 들어온 사람은 없다
static func service_years(age: int, r: float, r2: float) -> int:
	return maxi(age - entry_age(r, r2), 0)


# ── 연봉 ──────────────────────────────────────────────────────

## 연차 계수. **표를 위에서부터 처음 걸리는 것으로 읽는다**
static func service_factor(years: int) -> float:
	for b in rules().get("service", []):
		if years <= int(b["until"]):
			return float(b["factor"])
	return 1.0


## 연봉과 계약 연수. `{salary, years}` — 단위 만원
##
## ⚠ **OVR 곡선이 선형이 아니다.** 상위 몇 명이 시장을 지배하는 게 실제에
## 가깝다 — 선형으로 두면 리그 연봉 순위 백분위가 밋밋해져서 **FA 등급이
## 사실상 무작위**가 된다
## 리그 연봉 배수 — **여기가 정본이다.**
##
## ⚠ **부르는 쪽마다 표를 다시 적지 않는다** — FA 제안이 그 배수를 써야 하는데
## 거기서 복사하면 언젠가 갈린다(ABL 3.5 · JBL 2.0)
static func league_mult(league_id: String) -> float:
	var r: Dictionary = rules()
	return float(r.get("league_mult", {}).get(league_id,
		r.get("league_mult_default", 1.0)))


# ── NPC 재계약 (G-6) ──────────────────────────────────────────
#
# 🔴 **04엔 재계약이 없었다.** 계약이 끝나면 `advance_year`가 0으로 만들고
# **전부 FA 시장으로** 갔다 — 실측에서 **FA 자격자의 80%가 팀을 옮겼다.**
# 02는 원소속 재계약을 먼저 하고 안 되는 사람만 시장에 내보낸다.
#
# 아래 셋은 02 값 그대로다:
#   `player_engine.rs:594` calc_npc_renewal_salary
#   `player_engine.rs:615` calc_npc_contract_years
#   `market.ts:328`        성향 해시


## NPC 성향 — 02 `market.ts:328`이 **id의 글자 코드 합**으로 만든다.
##
## ⚠ **04엔 성향이 통째로 없었다.** 재계약 연봉·기간이 이걸 입력으로 받는다.
## ⚠ **`Rng`를 안 쓴다** — 02가 해시라서다. 같은 사람은 언제 물어도 같은
## 성향이어야 하고, 난수 흐름에 얹으면 부르는 순서에 따라 달라진다
static func _personality_hash(npc_id: String) -> int:
	var h: int = 0
	for c in npc_id.to_utf8_buffer():
		h += c
	return h


## 탐욕 25~79 — 02 `25 + ((h * 3) % 55)`
static func greed_of(npc_id: String) -> float:
	return 25.0 + float((_personality_hash(npc_id) * 3) % 55)


## 안정 선호 25~84 — 02 `25 + ((h * 13) % 60)`
static func stability_of(npc_id: String) -> float:
	return 25.0 + float((_personality_hash(npc_id) * 13) % 60)


## 재계약 연봉 — 02 `calc_npc_renewal_salary` 그대로.
##
## ⚠ **`estimate`와 다른 식이다.** 그쪽은 지수 곡선(OVR 50에서 3000,
## 1.1^Δ)인데 이쪽은 **선형**(1800 + (OVR-50)×220)이고 **현재 연봉을 60%
## 물려받는다** — 재계약은 새 계약이 아니라 이어지는 것이기 때문이다.
## 02도 두 식을 따로 갖고 있다.
##
## ⚠ **리그 배수는 04 표를 쓴다**(`salary_rules.json`). 02는 재계약용을
## 따로 하드코딩하는데(독립 0.35, 04 표는 0.14) **표가 정본이다** — 같은
## 리그에 배수를 둘 두면 어느 쪽이 맞는지 못 가린다
static func npc_renewal_salary(ovr: float, age: int, league_id: String,
		current_salary: int, performance_score: float, greed: float) -> int:
	var mult: float = float(rules().get("league_mult", {}).get(league_id, 1.0))
	var market: float = (1800.0 + maxf(ovr - 50.0, 0.0) * 220.0) * mult
	var blend: float = float(current_salary) * 0.6 + market * 0.4
	var perf: float = 0.9 + (performance_score / 100.0) * 0.2
	var greed_mult: float = 1.0 + (greed - 50.0) / 500.0
	var age_damp: float = 0.9 if age >= 33 else 1.0
	var raw: float = blend * perf * greed_mult * age_damp
	# 02: raw.max(market * 0.55).min(market * 1.35)
	return int(roundf(clampf(raw, market * 0.55, market * 1.35)))


## 재계약 기간 — 02 `calc_npc_contract_years` 그대로.
## ⚠ **순서가 뜻을 갖는다** — 나이가 먼저고, 승부 압박이 육성보다 앞선다
static func npc_contract_years(age: int, development_focus: float,
		win_now_pressure: float, stability_preference: float) -> int:
	if age >= 34:
		return 1
	if win_now_pressure > 70.0 and age >= 30:
		return 1
	if development_focus > 60.0 and age <= 25:
		return 3 if stability_preference > 60.0 else 2
	return 2 if stability_preference > 65.0 else 1


## 성적이 급변했나 — 02 `market.ts:139` `detectPerfSwing` 그대로.
## `+1` 급등 · `-1` 급락 · `0` 평소.
##
## ⚠ **경기 수가 줄어도 급락이다** — 다쳐서 못 나온 해를 성적으로만 보면
## "작년만큼 했다"가 된다
static func perf_swing(curr: Dictionary, prev: Dictionary) -> int:
	var kind: String = String(curr.get("type", ""))
	if kind != String(prev.get("type", "")):
		return 0
	var games_drop: float = float(prev.get("g", 0)) - float(curr.get("g", 0))
	if kind == "pitcher":
		# ERA는 **낮을수록 좋다** — 개선이면 양수가 되게 뺀다
		var era_delta: float = float(prev.get("era", 0.0)) \
			- float(curr.get("era", 0.0))
		if absf(era_delta) >= 1.5 or games_drop >= 20.0:
			return 1 if era_delta >= 0.0 else -1
	elif kind == "batter":
		var ops_delta: float = float(curr.get("ops", 0.0)) \
			- float(prev.get("ops", 0.0))
		if absf(ops_delta) >= 0.100 or games_drop >= 30.0:
			return 1 if ops_delta >= 0.0 else -1
	return 0


## 중간 조정 문턱 — 02 `market.ts:1163` "10% 이상 차이날 때만"
const ADJUST_THRESHOLD: float = 0.10


static func estimate(ovr: float, league_id: String, years_of_service: int,
		age: int, team_index: float, rng: RandomNumberGenerator) -> Dictionary:
	var r: Dictionary = rules()
	var mult: float = float(r.get("league_mult", {}).get(league_id, 1.0))

	# ① OVR 곡선
	var base: float = float(r.get("ovr_base", 3000.0)) \
		* pow(float(r.get("ovr_growth", 1.1)), ovr - float(r.get("ovr_pivot", 50.0)))

	# ② 연차 — 신인은 구단이 정하고, FA 자격을 얻어야 협상력이 생긴다
	var svc: float = service_factor(years_of_service)

	# ③ 나이 — 노장은 깎인다. **하한이 있다** — 없으면 마흔에 0이 된다
	var from_age: int = int(r.get("aging_from_age", 34))
	var aging: float = 1.0
	if age > from_age:
		aging = maxf(1.0 - float(age - from_age) * float(r.get("aging_per_year", 0.06)), 0.45)

	# ④ 팀 사정 — 부유한 팀이 더 준다
	var team: float = clampf(team_index, float(r.get("team_index_min", 0.8)),
		float(r.get("team_index_max", 1.35)))

	# ⑤ 흔들기 — 같은 조건이어도 계약마다 조금씩 다르다
	var jitter: float = 1.0 + (rng.randf() * 2.0 - 1.0) * float(r.get("jitter", 0.1))

	var raw: float = base * svc * aging * team * mult * jitter
	var floor_salary: float = float(r.get("min_salary", {}).get(league_id, 0.0))
	var salary: int = int(roundf(maxf(raw, floor_salary)))

	# 계약 연수 — 잘하는 선수가 길게 간다
	var contract_years: int
	if ovr >= 75.0:
		contract_years = 3 + int(rng.randf() * 3.0)
	elif ovr >= 68.0:
		contract_years = 2 + int(rng.randf() * 3.0)
	elif ovr >= 55.0:
		contract_years = 1 + int(rng.randf() * 2.0)
	else:
		contract_years = 1
	return {"salary": salary, "years": contract_years}


## 흔들림 없는 시장가. **방출 판정의 분모다** — 과지급인지 보려면 기준이
## 흔들리면 안 된다.
##
## ⚠ **`estimate`와 같은 식을 써야 한다.** 두 벌로 두면 "시장가보다 싸게
## 받는데 과지급"이 나온다
static func market_value(ovr: float, league_id: String, years_of_service: int,
		age: int) -> int:
	var fixed := RandomNumberGenerator.new()
	# 흔들기 폭의 한가운데 — `estimate`가 `randf()`를 한 번 쓰고 0.5면 배수가 1.0이다
	fixed.seed = 0
	var r: Dictionary = rules()
	var mult: float = float(r.get("league_mult", {}).get(league_id, 1.0))
	var base: float = float(r.get("ovr_base", 3000.0)) \
		* pow(float(r.get("ovr_growth", 1.1)), ovr - float(r.get("ovr_pivot", 50.0)))
	var from_age: int = int(r.get("aging_from_age", 34))
	var aging: float = 1.0
	if age > from_age:
		aging = maxf(1.0 - float(age - from_age) * float(r.get("aging_per_year", 0.06)), 0.45)
	var raw: float = base * service_factor(years_of_service) * aging * mult
	return int(roundf(maxf(raw, float(r.get("min_salary", {}).get(league_id, 0.0)))))


# ── 선수 하나에 붙이기 ────────────────────────────────────────

## 프로 리그인가. **연봉이 붙는 리그** — 학교엔 계약이 없다
static func has_contract(league_id: String) -> bool:
	return rules().get("league_mult", {}).has(league_id)


## 그 선수의 OVR — 투수는 투구, 야수는 타격
static func core_ovr(p: Dictionary) -> float:
	if String(p.get("player_type", "pitcher")) == "pitcher":
		return float(p.get("pitching", {}).get("ovr", 0.0))
	return float(p.get("batting", {}).get("ovr", 0.0))


## 계약이 없는 선수에게 하나 붙인다. **제자리에서 고친다.**
##
## ⚠ **연차를 연봉보다 먼저 정한다** — 연차가 연봉의 입력이다
static func ensure(p: Dictionary, rng: RandomNumberGenerator,
		team_index: float = 1.0) -> bool:
	var league: String = String(p.get("league_id", ""))
	if not has_contract(league):
		return false
	if p.has("salary"):
		return false

	var age: int = int(p.get("age", 25))
	var svc: int = service_years(age, rng.randf(), rng.randf())
	var c: Dictionary = estimate(core_ovr(p), league, svc, age, team_index, rng)
	p["pro_service_years"] = svc
	p["salary"] = c["salary"]
	p["contract_years"] = c["years"]
	return true


## 세계 전체에 계약을 붙인다. 붙인 사람 수를 돌려준다.
##
## ⚠ **씨앗을 팀과 섞는다.** 하나로 두면 모든 팀이 같은 연봉표를 갖는다
static func ensure_world(state: Dictionary) -> int:
	var world: Dictionary = state.get("world", {})
	var rosters: Dictionary = world.get("rosters", {})
	var seed_value: int = int(state.get("seed", 0))
	var rng := RandomNumberGenerator.new()

	var n: int = 0
	for tid in rosters:
		rng.seed = Rng.mix(["contract", tid, seed_value])
		for p in rosters[tid]:
			if ensure(p, rng):
				n += 1
	return n


# ── 해가 바뀔 때 ──────────────────────────────────────────────

## 한 시즌이 지나면 연차가 오르고 계약이 한 해 줄어든다.
##
## ⚠ **계약이 0이 되면 FA 후보다.** 안 줄이면 아무도 FA가 안 되고 시장이
## 영영 비어 있다 — 02에서 시장이 마른 이유 중 하나다
static func advance_year(players: Array) -> int:
	var n: int = 0
	for p in players:
		if not p.has("salary"):
			continue
		p["pro_service_years"] = int(p.get("pro_service_years", 0)) + 1
		p["contract_years"] = maxi(int(p.get("contract_years", 1)) - 1, 0)
		n += 1
	return n


## FA 자격이 있나 — **계약이 끝났고 연차가 리그 기준을 넘었다**
static func is_fa_eligible(p: Dictionary) -> bool:
	if not p.has("salary"):
		return false
	if int(p.get("contract_years", 1)) > 0:
		return false
	return int(p.get("pro_service_years", 0)) \
		>= TeamProfile.fa_eligibility_years(String(p.get("league_id", "")))
