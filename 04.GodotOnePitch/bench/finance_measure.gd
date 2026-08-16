extends RefCounted
class_name FinanceMeasure

## 재정 대조 계측 — 02 `scripts/measure-finance.cjs`와 **같은 네 표**를 낸다.
##
## ① 실효 세율 곡선 (연봉만, 스폰서 제외)
## ② 명성 → 스폰서 (연봉 2억 기준)
## ③ 개인 트레이닝 — 팀 시설에 반비례
## ④ 투자 1억 × 5000회 분포
##
## ⚠ **단위는 만원이다.** 02도 만원이라 그대로 견줄 수 있다.
##
## ⚠ **여기서 판정하지 않는다.** 02 값과 나란히 놓는 건 사람이 한다


const TRIALS: int = 5000
const PRINCIPAL: int = 10000  # 1억
const BASE_SALARY: int = 20000  # 2억


static func _won(v: int) -> String:
	if absi(v) >= 10000:
		return "%.2f억" % (float(v) / 10000.0)
	return "%s만" % String.num_uint64(absi(v)).lpad(1)


static func _signed(v: int) -> String:
	return ("-" if v < 0 else "") + _won(v)


static func _bar(ratio: float) -> String:
	return "█".repeat(maxi(int(roundf(ratio * 60.0)), 0))


func _tax_curve(log_line: Callable) -> void:
	log_line.call("실효 세율 곡선 (연봉만, 스폰서 제외)")
	for salary in [3000, 5000, 8000, 12000, 20000, 40000, 80000, 200000]:
		var tax: int = Finance.annual_tax(salary)
		var rate: float = float(tax) / float(salary)
		log_line.call("  연봉 %8s → 세금 %8s (%.1f%%) %s"
			% [_won(salary), _won(tax), rate * 100.0, _bar(rate / 0.5)])


func _sponsor_curve(log_line: Callable) -> void:
	log_line.call("명성 → 스폰서 (연봉 2억 기준)")
	for fame in [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]:
		var r: Dictionary = Finance.sponsor_offers(
			float(fame), BASE_SALARY, "pro")
		var total: int = int(r.get("total_annual", 0))
		var ratio: float = float(total) / float(BASE_SALARY)
		log_line.call("  명성 %3d → %8s (연봉의 %.1f%%, %d건%s) %s"
			% [fame, _won(total), ratio * 100.0,
				(r.get("offers", []) as Array).size(),
				" 상한적용" if bool(r.get("capped", false)) else "",
				_bar(ratio / 0.5)])


func _training_curve(log_line: Callable) -> void:
	# 02와 같은 조건: 상시(tier 2) 3개
	var subs: Array = []
	for area in (Finance.training_areas() as Array).slice(0, 3):
		subs.append({"area_id": String(area["id"]), "tier": 2})
	var base: float = Finance.total_training_bonus(subs, 1.0)
	log_line.call("개인 트레이닝 — 팀 시설에 반비례 (상시 %d개)" % subs.size())
	var stages: Array = [["독립리그", 0.85], ["고교", 0.90], ["대학", 0.95],
		["프로 2군", 1.00], ["프로 1군", 1.15], ["명문 1군", 1.32]]
	for s in stages:
		var facility: float = float(s[1])
		log_line.call("  %-9s %.2f  배수 ×%.2f → 훈련 +%.1f%% (기본 +%.1f%%)"
			% [s[0], facility, Finance.inverse_factor(facility),
				Finance.total_training_bonus(subs, facility) * 100.0,
				base * 100.0])


func _investment_curve(log_line: Callable, seed_value: int) -> void:
	log_line.call("투자 1억 × %d회 분포" % TRIALS)
	for opt in Finance.investment_options():
		var rng := RandomNumberGenerator.new()
		rng.seed = seed_value
		var profits: Array[int] = []
		var loss: int = 0
		for i in TRIALS:
			var got: int = int(Finance.resolve_investment(
				String(opt["id"]), PRINCIPAL, rng)["profit"])
			profits.append(got)
			if got < 0:
				loss += 1
		profits.sort()
		log_line.call("  %-9s 하위5%% %9s | 중앙 %9s | 상위5%% %9s | 손실 %.1f%%"
			% [String(opt["name"]),
				_signed(profits[int(TRIALS * 0.05)]),
				_signed(profits[int(TRIALS * 0.5)]),
				_signed(profits[int(TRIALS * 0.95)]),
				float(loss) / float(TRIALS) * 100.0])


## 주간 순현금 — **적자 구간이 있는가.** 02는 커리어 시나리오 셋 모두에서
## 최악 주간 -79~-81만원을 봤다. 구독을 켠 저연봉이 그 구간이다
func _weekly_net(log_line: Callable) -> void:
	var subs: Array = []
	for area in (Finance.training_areas() as Array).slice(0, 3):
		subs.append({"area_id": String(area["id"]), "tier": 2})
	log_line.call("주간 순현금 (프로 · 스폰서 없음)")
	for salary in [3000, 5000, 8000, 20000]:
		var bare: int = int(Finance.weekly({"career_stage": "pro",
			"salary": salary})["net_weekly"])
		var with_subs: int = int(Finance.weekly({"career_stage": "pro",
			"salary": salary, "subscriptions": subs})["net_weekly"])
		log_line.call("  연봉 %8s → 구독 없음 %s · 상시 3개 %s"
			% [_won(salary), _signed(bare), _signed(with_subs)])


func run(log_line: Callable, fail: Callable, seed_value: int) -> int:
	log_line.call("  씨앗 %d · 단위 만원" % seed_value)
	log_line.call("")
	_tax_curve(log_line)
	log_line.call("")
	_sponsor_curve(log_line)
	log_line.call("")
	_training_curve(log_line)
	log_line.call("")
	_weekly_net(log_line)
	log_line.call("")
	_investment_curve(log_line, seed_value)
	return 0
