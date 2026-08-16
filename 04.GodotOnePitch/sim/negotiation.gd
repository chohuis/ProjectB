extends RefCounted
class_name Negotiation

## 계약 협상 — F-2. **얼마를 부르면 받아 주나.**
##
## 원본: `features/contract/ui/ContractNegotiationModal.svelte:58-88`
##
## ⚠ **04는 "계약한다 / 거절한다" 둘뿐이었다.** 구단이 부른 금액을 그대로
## 받거나 걷어차는 것 말고 할 수 있는 게 없었다 — **협상이 아니라 통보다.**
## 02는 연봉 ±20% 슬라이더 · 기간 · 노트레이드 · 구단/선수 옵션 · 수락
## 가능성 막대 · 역제안이 있다.
##
## ⚠ **값은 02 그대로다.** 여기 숫자를 04에서 새로 정하면 "얼마까지
## 부를 수 있나"가 02와 다른 게임이 된다.
##
## ⚠ **계산만 한다.** 화면은 `DecisionVm`을 거쳐 받는다 — 여기에 화면이
## 들어오면 같은 산식이 두 벌이 된다.

## 슬라이더 폭 — 구단 제시액의 ±20%
const RATIO_MIN: float = -0.2
const RATIO_MAX: float = 0.2
const RATIO_STEP: float = 0.01

## 금액은 100만원 단위로 끊는다 (02 `Math.round(x / 100) * 100`)
const ROUND_UNIT: int = 100

## 구단이 받아 줄 선 — 제시액의 1.15배까지
const THRESHOLD_BASE: float = 1.15
## 한 해 늘 때마다 문턱이 3% 올라간다 (길게 묶을수록 구단이 깐깐하다)
const DURATION_STEP: float = 0.03
## 노트레이드를 넣으면 구단이 그만큼 덜 준다
const NO_TRADE_MULT: float = 0.95
## 구단 옵션은 구단에 유리하니 문턱이 올라가고, 선수 옵션은 반대다
const TEAM_OPTION_MULT: Array[float] = [1.0, 1.05, 1.10]
const PLAYER_OPTION_MULT: Array[float] = [1.0, 0.97, 0.94]

## 문턱 안이면 수락 확률이 이 값이다 — 100이 아니다(협상엔 늘 여지가 있다)
const PROB_MAX: int = 95
## 문턱을 넘긴 비율 1당 확률이 얼마나 떨어지나. **400이라 5%만 넘겨도 75%다**
const PROB_FALL: float = 400.0

## 옵션 연수 상한 — 02 슬라이더가 0·1·2다
const OPTION_MAX: int = 2


## 100만원 단위로 끊는다
static func round_money(v: float) -> int:
	return int(roundf(v / float(ROUND_UNIT))) * ROUND_UNIT


## 구단이 실제로 낼 수 있는 금액. **관계 × 예산**.
##
## ⚠ **제시액 자체가 아니다.** 사이가 좋고 지갑이 열린 구단은 적힌 금액보다
## 더 낼 수 있다 — 그 여지가 협상의 폭이다
static func effective_offer(offered: int, owner_bonus: float,
		budget_mod: float) -> int:
	return round_money(float(offered) * (1.0 + owner_bonus) * budget_mod)


## 내가 부르는 금액
static func requested(effective: int, ratio: float) -> int:
	return round_money(float(effective) * (1.0 + clampf(ratio, RATIO_MIN, RATIO_MAX)))


## 구단이 받아 주는 선.
##
## ⚠ **문턱도 같은 배수를 탄다.** 제시액만 올리고 문턱을 그대로 두면
## **"더 주는데 더 짜다"**가 된다 (02 주석 그대로).
##
## `terms`: `{duration_years, base_duration, no_trade, team_option, player_option}`
static func threshold(effective: int, terms: Dictionary) -> int:
	var base: float = float(effective) * THRESHOLD_BASE
	var diff: int = int(terms.get("duration_years", 1)) \
		- int(terms.get("base_duration", 1))
	base *= 1.0 + float(diff) * DURATION_STEP
	if bool(terms.get("no_trade", false)):
		base *= NO_TRADE_MULT
	base *= TEAM_OPTION_MULT[clampi(int(terms.get("team_option", 0)), 0, OPTION_MAX)]
	base *= PLAYER_OPTION_MULT[clampi(int(terms.get("player_option", 0)), 0, OPTION_MAX)]
	return int(roundf(base))


## 구단이 받아 줄 확률(0~95).
##
## ⚠ **문턱 안이면 95다.** 100으로 두면 "확실히 된다"가 되어 협상에
## 긴장이 사라진다
static func accept_chance(requested_salary: int, threshold_salary: int) -> int:
	if threshold_salary <= 0:
		return 0
	if requested_salary <= threshold_salary:
		return PROB_MAX
	var over: float = float(requested_salary - threshold_salary) \
		/ float(threshold_salary)
	return maxi(0, int(roundf(float(PROB_MAX) - over * PROB_FALL)))


## 역제안을 낼 수 있나 — **문턱 안일 때만.**
##
## ⚠ **넘겨도 낼 수 있게 하면 문턱이 뜻을 잃는다.** 02는 버튼을 막고
## "허용 범위를 초과합니다"를 띄운다
static func can_counter(requested_salary: int, threshold_salary: int) -> bool:
	return requested_salary <= threshold_salary


## 계약 총액 — 연봉 × 기간 + 계약금
static func total_value(requested_salary: int, years: int,
		signing_bonus: int) -> int:
	return requested_salary * years + signing_bonus


## 시장가 대비 몇 %인가. **시장가가 없으면 100%로 본다**
static func market_ratio_pct(requested_salary: int, market_salary: int) -> int:
	if market_salary <= 0:
		return 100
	return int(roundf(float(requested_salary) / float(market_salary) * 100.0))


## 화면이 받는 협상 한 벌.
##
## `action`: `salary_negotiation` pending · `terms`: 지금 고른 조건
static func build(action: Dictionary, terms: Dictionary,
		owner_bonus: float, budget_mod: float, market_salary: int) -> Dictionary:
	var eff: int = effective_offer(int(action.get("offered_salary", 0)),
		owner_bonus, budget_mod)
	var req: int = requested(eff, float(terms.get("ratio", 0.0)))
	var th: int = threshold(eff, terms)
	var years: int = int(terms.get("duration_years",
		action.get("duration_years", 1)))
	return {
		"offered": int(action.get("offered_salary", 0)),
		"effective": eff,
		"requested": req,
		"threshold": th,
		"accept_chance": accept_chance(req, th),
		"can_counter": can_counter(req, th),
		"total_value": total_value(req, years,
			int(action.get("signing_bonus", 0))),
		"market_ratio_pct": market_ratio_pct(req, market_salary),
		"duration_years": years,
		"no_trade": bool(terms.get("no_trade", false)),
		"team_option": clampi(int(terms.get("team_option", 0)), 0, OPTION_MAX),
		"player_option": clampi(int(terms.get("player_option", 0)), 0, OPTION_MAX),
	}
