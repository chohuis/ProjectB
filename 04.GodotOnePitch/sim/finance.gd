extends RefCounted
class_name Finance

## 개인 재정 — 수입·세금·스폰서·구독·투자·소비. B-5.
##
## 원본: `finance.rs` · `usecases/finance.ts`
##
## ⚠ **단위는 전부 만원이다.** 자산·연봉·계약금·치료비가 같은 단위여야 한다 —
## 02는 치료비만 원 단위라 **보존 치료 한 주에 자산이 0이 됐다.**
##
## ⚠ **화면은 이 결과를 표시만 한다.** 02는 Svelte 컴포넌트 안에서 OVR·사기로
## 수입을 즉석 계산해 **자산과 무관한 숫자를 보여주고 있었다.**


const RULES_PATH: String = "res://data/finance_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("재정 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


static func weeks_per_month() -> float:
	return float(rules().get("weeks_per_month", 4.333333))


static func weeks_per_year() -> float:
	return float(rules().get("weeks_per_year", 52.0))


# ── 무대 ──────────────────────────────────────────────────────

const PRO_STAGES: Array[String] = ["pro", "pro_kbl", "pro_abl", "pro_jbl"]
const STUDENT_STAGES: Array[String] = ["highschool", "university", "military"]


static func is_pro(career_stage: String) -> bool:
	return PRO_STAGES.has(career_stage)


## 학생·군은 과세하지 않는다 — 용돈에 세금을 매기면 숫자만 늘고 재미가 없다
static func is_student(career_stage: String) -> bool:
	return STUDENT_STAGES.has(career_stage)


static func stage_of(career_stage: String) -> Dictionary:
	var key: String = "pro" if is_pro(career_stage) else career_stage
	var s = rules().get("stages", {}).get(key, null)
	return s if s is Dictionary else {}


# ── 세금 ──────────────────────────────────────────────────────

## 누진세 — **구간을 넘어도 전액에 높은 세율이 붙지 않는다.**
##
## 단일세율로 만들면 연봉이 1만원 오를 때 실수령이 줄어드는 구간이 생긴다.
## 그건 규칙이 아니라 결함으로 읽힌다
## 소득이 0 이하면 아래 루프가 첫 구간에서 멈춘다 — 따로 막지 않는다
static func annual_tax(gross: int) -> int:
	var remaining: float = float(gross)
	var prev: float = 0.0
	var tax: float = 0.0
	for b in rules().get("tax", {}).get("brackets", []):
		var until: float = float(b["until"])
		# until 0 = 상한 없음(최고구간)
		var cap: float = INF if until <= 0.0 else until
		var span: float = maxf(cap - prev, 0.0)
		var taxed: float = minf(remaining, span)
		if taxed <= 0.0:
			break
		tax += taxed * float(b["rate"])
		remaining -= taxed
		prev = cap
		if remaining <= 0.0:
			break
	return int(roundf(tax))


## 계약금·스폰서는 기타소득 **분리과세**.
##
## ⚠ **연봉과 합산하지 않는다** — 합산하면 5억 계약금을 받은 신인이 그해
## 최고세율을 맞고 파산한다
static func other_income_tax(gross: int) -> int:
	if gross <= 0:
		return 0
	return int(roundf(float(gross)
		* float(rules().get("tax", {}).get("other_income_rate", 0.0))))


# ── 주간 재정 ─────────────────────────────────────────────────

## 구독 주간 비용
static func subscription_cost(subscriptions: Array) -> int:
	var cost: int = 0
	for s in subscriptions:
		for t in rules().get("training", {}).get("tiers", []):
			if int(t["tier"]) == int(s["tier"]):
				cost += int(t["weekly_cost"])
				break
	return cost


## 한 주의 재정. `{income, expense, gross_weekly, tax_weekly, expense_weekly,
##   net_weekly, gross_annual, tax_annual, effective_tax_rate}`
##
## `p`: `{career_stage, salary, sponsor_annual, subscriptions, treatment_weekly}`
static func weekly(p: Dictionary) -> Dictionary:
	var stage_id: String = String(p.get("career_stage", ""))
	var pro: bool = is_pro(stage_id)
	var stage: Dictionary = stage_of(stage_id)
	var wpy: float = weeks_per_year()
	var wpm: float = weeks_per_month()

	var income: Array = []
	var expense: Array = []

	# ── 수입 ──
	var salary_annual: int = maxi(int(p.get("salary", 0)), 0) if pro else 0
	var sponsor_annual: int = maxi(int(p.get("sponsor_annual", 0)), 0)
	var gross_weekly: int = 0

	if salary_annual > 0:
		var w: int = int(roundf(float(salary_annual) / wpy))
		income.append({"label": "연봉(주할)", "amount": w})
		gross_weekly += w
	if sponsor_annual > 0:
		var w2: int = int(roundf(float(sponsor_annual) / wpy))
		income.append({"label": "스폰서·광고", "amount": w2})
		gross_weekly += w2
	if int(stage.get("income", 0)) > 0:
		var w3: int = int(roundf(float(stage["income"]) / wpm))
		income.append({"label": String(stage.get("label", "지원금")), "amount": w3})
		gross_weekly += w3

	# ── 세금 ──
	var tax_annual: int = 0
	var tax_weekly: int = 0
	var exempt: bool = bool(rules().get("tax", {}).get("student_exempt", false)) \
		and is_student(stage_id)
	if not exempt:
		# ⚠ **연봉은 누진, 스폰서는 분리과세.** 둘을 합산하지 않는 게 핵심이다
		tax_annual = annual_tax(salary_annual) + other_income_tax(sponsor_annual)
		tax_weekly = int(roundf(float(tax_annual) / wpy))
	if tax_weekly > 0:
		expense.append({"label": "세금(원천징수)", "amount": tax_weekly})

	# ── 지출 ──
	var expense_weekly: int = tax_weekly
	if int(stage.get("expense", 0)) > 0:
		var w4: int = int(roundf(float(stage["expense"]) / wpm))
		expense.append({"label": "생활비", "amount": w4})
		expense_weekly += w4

	var sub_cost: int = subscription_cost(p.get("subscriptions", []))
	if sub_cost > 0:
		expense.append({"label": "개인 트레이닝 구독", "amount": sub_cost})
		expense_weekly += sub_cost

	var treatment: int = maxi(int(p.get("treatment_weekly", 0)), 0)
	if treatment > 0:
		expense.append({"label": "부상 치료비", "amount": treatment})
		expense_weekly += treatment

	var gross_annual: int = salary_annual + sponsor_annual \
		+ int(roundf(float(stage.get("income", 0)) * 12.0))

	return {
		"income": income, "expense": expense,
		"gross_weekly": gross_weekly, "tax_weekly": tax_weekly,
		"expense_weekly": expense_weekly,
		"net_weekly": gross_weekly - expense_weekly,
		"gross_annual": gross_annual, "tax_annual": tax_annual,
		"effective_tax_rate": (roundf(float(tax_annual) / float(gross_annual)
			* 1000.0) / 1000.0) if gross_annual > 0 else 0.0,
	}


# ── 개인 트레이닝 ─────────────────────────────────────────────

static func training_areas() -> Array:
	return rules().get("training", {}).get("areas", [])


## 팀 시설이 만든 배수.
##
## ⚠ **보너스가 팀 자원에 반비례한다.** 시설 좋은 구단에선 개인 트레이닝의
## 한계효용이 낮다 — 반대로 열악한 팀에선 사비를 들이는 게 실제로 갈린다.
## **약팀에 지명된 게 순수한 페널티로만 남지 않게 하는 장치**이기도 하다
static func inverse_factor(team_facility: float) -> float:
	var r: Dictionary = rules().get("training", {})
	var strength: float = clampf(float(r.get("team_resource_inverse", 1.0)),
		0.0, 2.0)
	if strength <= 0.0:
		return 1.0
	var c: Array = r.get("inverse_clamp", [0.6, 1.4])
	return clampf(1.0 + (1.0 - team_facility) * strength,
		float(c[0]), float(c[1]))


## 구독의 실효 보너스. `{by_area, weekly_cost, inverse_factor}`
static func training_bonus(subscriptions: Array,
		team_facility: float = 1.0) -> Dictionary:
	var r: Dictionary = rules().get("training", {})
	var inverse: float = inverse_factor(team_facility)

	var by_area: Array = []
	for s in subscriptions:
		for t in r.get("tiers", []):
			if int(t["tier"]) != int(s["tier"]):
				continue
			by_area.append({"area_id": String(s["area_id"]),
				"tier": int(s["tier"]), "base": float(t["bonus"]),
				"effective": float(t["bonus"]) * inverse})
			break

	# ⚠ **합계 상한.** 분야를 다 켜도 스태프 15종의 폭을 넘지 못한다 —
	# 넘으면 "돈으로 성장을 산다"가 지배 루프가 된다
	var cap: float = float(r.get("max_total_bonus", 0.0))
	if cap > 0.0:
		var total: float = 0.0
		for a in by_area:
			total += float(a["effective"])
		if total > cap:
			var scale: float = cap / total
			for a in by_area:
				a["effective"] = float(a["effective"]) * scale
	for a in by_area:
		a["effective"] = roundf(float(a["effective"]) * 10000.0) / 10000.0

	return {"by_area": by_area,
		"weekly_cost": subscription_cost(subscriptions),
		"inverse_factor": roundf(inverse * 10000.0) / 10000.0}


## 구독이 훈련 효율에 더할 값 — `TrainingGrowth`가 읽는 자리
static func total_training_bonus(subscriptions: Array,
		team_facility: float = 1.0) -> float:
	var total: float = 0.0
	for a in training_bonus(subscriptions, team_facility)["by_area"]:
		total += float(a["effective"])
	return total


# ── 스폰서 ────────────────────────────────────────────────────

## 명성 연동 스폰서 오퍼.
##
## ⚠ **학생·독립은 제외한다** — 아마추어 규정 위반이다.
##
## ⚠ **카테고리 안에서도 선형 보간한다.** 문턱을 겨우 넘은 선수와 한참 위인
## 선수가 같은 돈을 받으면 명성이 계단이 된다
static func sponsor_offers(fame: float, salary: int, career_stage: String,
		pr_mod: float = 1.0, signed_ids: Array = []) -> Dictionary:
	var r: Dictionary = rules().get("sponsor", {})
	if bool(r.get("pro_only", false)) and not is_pro(career_stage):
		return {"offers": [], "total_annual": 0, "capped": false}

	var base: float = float(maxi(salary, int(r.get("min_salary_base", 0))))
	var c: Array = r.get("pr_clamp", [1.0, 1.0])
	var pr: float = clampf(pr_mod, float(c[0]), float(c[1]))
	var span: float = float(r.get("fame_span", 0.0))

	var offers: Array = []
	for cat in r.get("categories", []):
		if fame < float(cat["fame_min"]):
			continue
		if signed_ids.has(String(cat["id"])):
			continue
		var t: float = 1.0 if span <= 0.0 \
			else clampf((fame - float(cat["fame_min"])) / span, 0.0, 1.0)
		var pct: float = float(cat["pct_min"]) \
			+ (float(cat["pct_max"]) - float(cat["pct_min"])) * t
		var annual: int = int(roundf(base * pct * pr))
		if annual <= 0:
			continue
		offers.append({"category_id": String(cat["id"]),
			"name": String(cat["name"]), "annual": annual,
			"term_years": int(cat["term_years"]),
			"pct_of_salary": roundf(float(annual) / base * 1000.0) / 1000.0})

	# ⚠ **상한 — 광고 수입이 연봉을 넘어가면 야구가 부업이 된다**
	var cap: int = int(roundf(base * float(r.get("max_total_pct", 1.0))))
	var total: int = 0
	for o in offers:
		total += int(o["annual"])
	var capped: bool = total > cap and cap > 0
	if capped:
		var scale: float = float(cap) / float(total)
		total = 0
		for o in offers:
			o["annual"] = int(roundf(float(o["annual"]) * scale))
			o["pct_of_salary"] = roundf(float(o["annual"]) / base * 1000.0) / 1000.0
			total += int(o["annual"])

	return {"offers": offers, "total_annual": total, "capped": capped}


## 지금 유효한 계약만 골라 연 합계를 낸다.
##
## ⚠ **`sponsor_annual`을 따로 들고 있지 않는다.** 계약 목록이 정본이다 —
## 합계를 별도 칸에 두면 계약이 끝난 해에 한쪽만 줄어들고, 그 어긋남은
## 조용하다(주간 수입은 그대로인데 스폰서 목록은 비어 있다)
static func sponsor_annual(sponsors: Array, season_year: int) -> int:
	var total: int = 0
	for s in sponsors:
		if int(s.get("until_season", 0)) >= season_year:
			total += maxi(int(s.get("annual", 0)), 0)
	return total


## 지금 유효한 계약들
static func active_sponsors(sponsors: Array, season_year: int) -> Array:
	var out: Array = []
	for s in sponsors:
		if int(s.get("until_season", 0)) >= season_year:
			out.append(s)
	return out


## 오퍼를 계약으로 바꾼다. **몇 해까지인지를 여기서 정한다** —
## 화면이 계산하면 화면과 엔진이 갈린다
static func sign_sponsor(offer: Dictionary, season_year: int) -> Dictionary:
	return {
		"category_id": String(offer.get("category_id", "")),
		"name": String(offer.get("name", "")),
		"annual": int(offer.get("annual", 0)),
		"until_season": season_year + maxi(int(offer.get("term_years", 1)), 1) - 1,
		"since_season": season_year,
	}


# ── 투자 ──────────────────────────────────────────────────────

static func investment_options() -> Array:
	return rules().get("investment", {}).get("options", [])


static func investment_option(option_id: String) -> Dictionary:
	for o in investment_options():
		if String(o["id"]) == option_id:
			return o
	return {}


## 투자에 필요한 최소 현금 — **화면이 이유를 말할 때 쓴다.**
## 여기서 안 내면 화면이 숫자를 또 적게 되고 언젠가 갈린다
static func invest_min_cash() -> int:
	return int(rules().get("investment", {}).get("min_cash", 0))


## 투자 화면이 뜨나. **생활비도 빠듯한 신인에게 투자 화면을 띄우면 조롱이다**
static func can_invest(cash: int, career_stage: String) -> bool:
	var r: Dictionary = rules().get("investment", {})
	if bool(r.get("pro_only", false)) and not is_pro(career_stage):
		return false
	return cash >= int(r.get("min_cash", 0))


## 시즌말 투자 정산. **원금 손실을 허용한다** (사용자 확정).
##
## ⚠ **전액 소실은 안 만든다** — 그건 세이브 리셋 유도라 재미가 아니라 벌이다.
## `floor`가 하한이다
static func resolve_investment(option_id: String, amount: int,
		rng: RandomNumberGenerator) -> Dictionary:
	var opt: Dictionary = investment_option(option_id)
	if opt.is_empty():
		return {"option_id": option_id, "name": "-", "principal": amount,
			"rate": 0.0, "profit": 0, "payout": amount}

	var rate: float
	# 확정 수익은 난수를 안 쓴다 — 흔들림이 0인데 뽑으면 뒤 흐름만 밀린다
	if float(opt["sd"]) <= 0.0:
		rate = float(opt["mean"])
	else:
		# 정규분포 근사 (Box–Muller)
		var u1: float = maxf(rng.randf(), 1e-12)
		var u2: float = rng.randf()
		var z: float = sqrt(-2.0 * log(u1)) * cos(TAU * u2)
		rate = maxf(float(opt["mean"]) + float(opt["sd"]) * z, float(opt["floor"]))

	var profit: int = int(roundf(float(amount) * rate))
	return {"option_id": String(opt["id"]), "name": String(opt["name"]),
		"principal": amount, "rate": roundf(rate * 10000.0) / 10000.0,
		"profit": profit, "payout": amount + profit}


# ── 사치품 ────────────────────────────────────────────────────

const LUXURY_UNIT: float = 100.0


## 사치품 소비. 동료에게 쓰면 관계가 오르고, 자기 소비는 **성격에 따라
## 명성의 부호가 갈린다.**
##
## ⚠ **성실한 선수의 씀씀이는 구설이 되고, 과시형에겐 화제가 된다** —
## 같은 지출이 사람에 따라 다르게 읽히는 게 이 시스템의 요점이다
static func luxury(cost: int, on_teammate: bool,
		diligence: float = 0.0) -> Dictionary:
	var r: Dictionary = rules().get("luxury", {})
	var units: float = float(cost) / LUXURY_UNIT
	if on_teammate:
		return {"cost": cost, "fame_delta": 0.0,
			"relation_delta": roundf(units
				* float(r.get("teammate_relation_per_cost", 0.0)) * 100.0
				* 100.0) / 100.0}
	var sign: float = -1.0 if diligence >= float(
		r.get("self_fame_split_diligence", 999.0)) else 1.0
	return {"cost": cost, "relation_delta": 0.0,
		"fame_delta": roundf(units * float(r.get("self_fame_per_cost", 0.0))
			* 100.0 * sign * 100.0) / 100.0}
