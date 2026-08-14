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
