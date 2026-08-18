extends RefCounted
class_name FinanceVm

## 재정 화면 — C-4. "나" 탭의 하위 탭이다.
##
## 원본: `pages/finance/FinancePage.svelte`
##
## ⚠ **여기서 계산하지 않는다.** 02는 이 화면이 컴포넌트 안에서 OVR·사기로
## 수입을 즉석 계산했고, 그 숫자가 **실제 `money`와 아무 관계가 없었다.**
## 전부 `Finance`가 낸 값을 표시만 한다.
##
## ⚠ **이 화면이 스폰서 계약과 구독을 쓰는 쪽이다.** 04는 `sponsor_offers`와
## `training_subscriptions`를 읽는 코드만 있고 세우는 데가 없어서, 스폰서는
## 한 건도 안 생기고 구독은 영영 빈 배열이었다.
##
## ⚠ **가계부·예산 배분 화면은 없다** (02 설계 §7.3). 지출은 구독 토글과
## 이벤트 선택으로만 한다 — 그래서 여기 "예산 짜기"가 없다.

const STAGE_LABEL: Dictionary = {
	"LEAGUE_HIGHSCHOOL": "고등학교",
	"LEAGUE_UNIVERSITY": "대학교",
	"LEAGUE_INDEPENDENT": "독립리그",
	"LEAGUE_MILITARY": "군 복무",
}

## 자산 추이에 몇 주를 보여주나. **한 시즌**이면 계절이 한 바퀴 돈다
const TREND_WEEKS: int = 52


## 만원 단위를 사람이 읽는 문자열로. **1억(10,000만원)부터는 억으로** —
## 02 `won()` 그대로다
static func won(v: int) -> String:
	var abs_v: int = absi(v)
	if abs_v >= 10000:
		var eok: float = float(v) / 10000.0
		return "%d억" % int(eok) if is_equal_approx(eok, roundf(eok)) \
			else "%.2f억" % eok
	return "%d만" % v


static func signed_won(v: int) -> String:
	return "%s%s" % ["+" if v >= 0 else "", won(v)]


static func build(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var year: int = int(state.get("season_year", 0))
	var stage: String = _stage_of(p)
	var sponsors: Array = p.get("sponsors", [])
	var subs: Array = state.get("training_subscriptions", [])
	var facility: float = float(p.get("team_facility", 1.0))

	var weekly: Dictionary = Finance.weekly({
		"career_stage": stage,
		"salary": int(p.get("salary", 0)),
		"sponsor_annual": Finance.sponsor_annual(sponsors, year),
		"subscriptions": subs,
		"treatment_weekly": int(p.get("treatment_weekly", 0)),
	})

	return {
		"stage_label": String(STAGE_LABEL.get(
			String(p.get("league_id", "")), "프로")),
		"money_label": "%s원" % won(int(p.get("money", 0))),
		"kpi": _kpi(p, weekly, sponsors, year),
		"ledger": _ledger(weekly),
		"trend": _trend(state),
		"sponsor": _sponsor(state, p, stage, sponsors, year),
		"training": _training(subs, facility),
		"investment": _investment(p, stage),
	}


## 시즌말 투자 — 02 `FinancePage`의 `<h3>투자</h3>` 절.
##
## 🔴 **엔진만 있고 부르는 곳이 없었다.** `Finance.investment_options` ·
## `can_invest` · `resolve_investment`가 다 있고 규칙 파일에 세 갈래와 값까지
## 있는데 **넷 다 아무도 안 불렀다** — 형태 ②를 다섯 번째 만난 자리다.
##
## ⚠ **위험을 같이 적는다.** 기대 수익만 보면 사업이 늘 나아 보인다 —
## `floor`가 최대 손실률이다.
##
## ⚠ **못 하면 이유를 말한다.** 빈 칸은 고장으로 보인다
static func _investment(p: Dictionary, stage: String) -> Dictionary:
	var cash: int = int(p.get("money", 0))
	var can: bool = Finance.can_invest(cash, stage)

	var options: Array = []
	for o in Finance.investment_options():
		var sd: float = float(o.get("sd", 0.0))
		options.append({
			"id": String(o.get("id", "")),
			"name": String(o.get("name", "")),
			"desc": String(o.get("desc", "")),
			"mean_label": "기대 %+.0f%%" % (float(o.get("mean", 0.0)) * 100.0),
			# 흔들림이 0이면 "확정"이라 적는다 — `-0%`는 뜻이 없다
			"risk_label": "확정" if sd <= 0.0 \
				else "최대 %.0f%%" % (float(o.get("floor", 0.0)) * 100.0),
		})

	var reason: String = ""
	if not can:
		reason = "프로 무대에서만 할 수 있습니다." if not Finance.is_pro(stage) \
			else "현금이 %s 이상이어야 합니다." % won(Finance.invest_min_cash())
	return {"can": can, "reason": reason, "cash_label": won(cash),
		"options": options}


## 재정은 무대 이름을 리그에서 낸다 — `career_stage`는 프로만 갈래가 있다
static func _stage_of(p: Dictionary) -> String:
	if Contract.has_contract(String(p.get("league_id", ""))):
		return Finance.PRO_STAGES[0]
	return String(p.get("career_stage", "highschool"))


static func _kpi(p: Dictionary, weekly: Dictionary, sponsors: Array,
		year: int) -> Array:
	var net: int = int(weekly["net_weekly"])
	var rate: float = float(weekly["effective_tax_rate"])
	return [
		{"label": "보유 자산", "value": won(int(p.get("money", 0))), "tone": ""},
		# 순현금이 마이너스면 그게 제일 먼저 보여야 한다
		{"label": "주간 순현금", "value": signed_won(net),
			"tone": "up" if net >= 0 else "down"},
		{"label": "연 총수입", "value": won(int(weekly["gross_annual"])), "tone": ""},
		{"label": "실효 세율",
			"value": "%.1f%%" % (rate * 100.0) if int(weekly["tax_annual"]) > 0 \
				else "비과세", "tone": ""},
		{"label": "명성", "value": "%d" % int(roundf(float(p.get("fame", 0.0)))),
			"tone": ""},
		{"label": "스폰서 계약",
			"value": "%d건" % Finance.active_sponsors(sponsors, year).size(),
			"tone": ""},
	]


## ⚠ **세금이 어디로 갔는지 말해 준다.** 안 쓰면 "왜 연봉보다 적게 들어오지"가
## 되고, 02는 학생 무대가 비과세인 것도 안 보여줬다
static func _ledger(weekly: Dictionary) -> Dictionary:
	var income: Array = []
	for i in weekly["income"]:
		income.append({"label": String(i["label"]), "value": won(int(i["amount"]))})
	var expense: Array = []
	for e in weekly["expense"]:
		expense.append({"label": String(e["label"]), "value": won(int(e["amount"]))})
	return {
		"income": income, "expense": expense,
		"income_empty": "수입 없음", "expense_empty": "지출 없음",
		"note": "세금은 수령 시 원천징수됩니다 — 순현금은 세후입니다." \
			if int(weekly["tax_annual"]) > 0 else "학생·군 무대는 과세하지 않습니다.",
	}


## 자산이 어떻게 움직였나. **`finance_log`를 읽는 자리가 여기뿐이다** —
## 매주 쌓기만 하고 아무도 안 봤다
static func _trend(state: Dictionary) -> Dictionary:
	var log: Array = state.get("finance_log", [])
	if log.is_empty():
		return {"has": false, "rows": [], "note": "아직 기록이 없습니다"}

	var rows: Array = []
	var from: int = maxi(log.size() - TREND_WEEKS, 0)
	for i in range(log.size() - 1, from - 1, -1):
		var e: Dictionary = log[i]
		rows.append({
			"week": Calendar.week_of(int(e.get("day", 0))),
			"net": signed_won(int(e.get("net", 0))),
			"money": won(int(e.get("money", 0))),
			"down": int(e.get("net", 0)) < 0,
		})
	# ⚠ **첫 주에 들어서기 전 자산에서 잰다.** `money`는 그 주가 끝난 뒤의
	# 값이라, 첫 줄의 `money`를 기준으로 삼으면 "최근 8주"라고 써 놓고
	# 7주치만 재게 된다 — 스크린샷을 보고 알았다(8×152인데 1064였다)
	var before: int = int(log[from].get("money", 0)) - int(log[from].get("net", 0))
	var last: int = int(log[-1].get("money", 0))
	return {
		"has": true, "rows": rows,
		"note": "최근 %d주 %s" % [rows.size(), signed_won(last - before)],
	}


## ⚠ **학생·독립에는 스폰서가 안 붙는다** — 아마추어 규정이다.
## 그 이유를 화면이 말해야 "왜 아무 제안도 없지"가 안 된다
static func _sponsor(state: Dictionary, p: Dictionary, stage: String,
		sponsors: Array, year: int) -> Dictionary:
	var active: Array = []
	for s in Finance.active_sponsors(sponsors, year):
		active.append({
			"name": String(s.get("name", "")),
			"value": "%s / 년 · %d까지" % [won(int(s.get("annual", 0))),
				int(s.get("until_season", 0))],
		})

	var signed_ids: Array = []
	for s in Finance.active_sponsors(sponsors, year):
		signed_ids.append(String(s.get("category_id", "")))

	var fame: float = float(p.get("fame", 0.0))
	var out: Dictionary = Finance.sponsor_offers(fame, int(p.get("salary", 0)),
		stage, Staff.mods_of(state.get("world", {}),
			String(p.get("team_id", "")))["fame"], signed_ids)

	var offers: Array = []
	for o in out["offers"]:
		offers.append({
			"category_id": String(o["category_id"]),
			"name": String(o["name"]),
			"value": "%s / 년 · %d년 · 연봉의 %.1f%%" % [won(int(o["annual"])),
				int(o["term_years"]), float(o["pct_of_salary"]) * 100.0],
		})

	return {
		"active": active,
		"active_empty": "계약 중인 스폰서가 없습니다",
		"annual_label": "연 합계 %s" % won(Finance.sponsor_annual(sponsors, year)),
		"offers": offers,
		"note": _offer_note(stage, offers.size(), fame, bool(out["capped"])),
	}


static func _offer_note(stage: String, count: int, fame: float,
		capped: bool) -> String:
	if not Finance.is_pro(stage):
		return "학생·독립 무대에는 스폰서가 붙지 않습니다 (아마추어 규정)."
	if count == 0:
		var lowest: float = 999.0
		for cat in Finance.rules().get("sponsor", {}).get("categories", []):
			lowest = minf(lowest, float(cat.get("fame_min", 999.0)))
		return "지금 명성(%d)으로 들어온 제안이 없습니다. 가장 낮은 문턱은 명성 %d입니다." \
			% [int(roundf(fame)), int(lowest)]
	if capped:
		return "명성이 오르면 금액도 같이 오릅니다 · 연봉 대비 상한에 걸려 조정됐습니다."
	return "명성이 오르면 금액도 같이 오릅니다."


## ⚠ **누를 때마다 단계가 오르고 마지막에서 누르면 해지된다** — 02 그대로.
## 버튼 글자가 다음에 무슨 일이 나는지를 말해야 한다
static func _training(subs: Array, facility: float) -> Dictionary:
	var bonus: Dictionary = Finance.training_bonus(subs, facility)
	var by_area: Dictionary = {}
	for b in bonus["by_area"]:
		by_area[String(b["area_id"])] = b

	var tiers: Array = Finance.rules().get("training", {}).get("tiers", [])
	var tier_of: Dictionary = {}
	for s in subs:
		tier_of[String(s.get("area_id", ""))] = int(s.get("tier", 0))

	var rows: Array = []
	for a in Finance.training_areas():
		var id: String = String(a["id"])
		var tier: int = int(tier_of.get(id, 0))
		rows.append({
			"area_id": id,
			"name": String(a["name"]),
			"tier": tier,
			"tier_label": _tier_label(tiers, tier),
			"effect": "" if tier <= 0 else "효율 +%.1f%% · 주 %s" % [
				float(by_area.get(id, {}).get("effective", 0.0)) * 100.0,
				won(_tier_cost(tiers, tier))],
			# 다음에 무슨 일이 나는지 — 마지막 단계면 해지다
			"action": "구독" if tier <= 0 \
				else ("해지" if tier >= tiers.size() else "상향"),
		})

	var inverse: float = float(bonus["inverse_factor"])
	return {
		"rows": rows,
		"weekly_cost": "주간 구독료 합계 %s" % won(int(bonus["weekly_cost"])),
		"note": "위 개요의 순현금에 이미 반영돼 있습니다.",
		# ⚠ **시설이 열악할수록 사비가 크게 먹힌다** — 약팀 지명이 순수한
		# 페널티로만 남지 않게 하는 장치다
		"facility_note": "" if is_equal_approx(inverse, 1.0) \
			else ("팀 시설 보정 ×%.2f — 시설이 열악해 개인 트레이닝이 더 크게 먹힙니다." % inverse \
				if inverse > 1.0 \
				else "팀 시설 보정 ×%.2f — 시설이 좋아 개인 트레이닝의 추가 효과가 줄어듭니다." % inverse),
	}


static func _tier_label(tiers: Array, tier: int) -> String:
	if tier <= 0:
		return "미구독"
	for t in tiers:
		if int(t["tier"]) == tier:
			return String(t.get("name", "%d단계" % tier))
	return "%d단계" % tier


static func _tier_cost(tiers: Array, tier: int) -> int:
	for t in tiers:
		if int(t["tier"]) == tier:
			return int(t.get("weekly_cost", 0))
	return 0


## 다음 단계. **마지막에서 누르면 해지(0)** — 02 그대로
static func next_tier(subs: Array, area_id: String) -> int:
	var tiers: Array = Finance.rules().get("training", {}).get("tiers", [])
	var cur: int = 0
	for s in subs:
		if String(s.get("area_id", "")) == area_id:
			cur = int(s.get("tier", 0))
	return 0 if cur >= tiers.size() else cur + 1
