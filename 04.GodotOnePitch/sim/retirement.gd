extends RefCounted
class_name Retirement

## 주인공 은퇴 — 자발 · 노쇠 · 부상. B-7.
##
## 원본: `usecases/retirement.ts` · `team_engine.rs`의
##       `eval_retirement_suggestion` · `generation_rules.json`의 `retirementRules`
##
## ⚠ **02엔 주인공 은퇴 경로가 아예 없었다.** 은퇴 기록을 남기는 두 곳이
## 전부 NPC였고, 주인공을 은퇴시키는 코드는 어디에도 없었다 — 목표 커리어가
## 15~20시즌인 게임인데 **끝나지 않았다.**
##
## ⚠ **판정은 NPC와 같은 표를 쓴다.** 주인공 전용 기준을 새로 만들면
## "NPC는 36세에 은퇴하는데 나는 45세까지 뛴다"가 되고, 그걸 맞추려고 표를
## 두 번 관리하게 된다. 다른 건 **결과를 강제하지 않는다**는 것뿐이다 —
## 권하고 고르는 건 사용자다.


const RULES_PATH: String = "res://data/retirement_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("은퇴 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


## 은퇴를 부르는 세 갈래. 02 설계(`05_히스토리_엔딩.md` §3)가 확정한 것
const REASON_VOLUNTARY: String = "voluntary"
const REASON_DECLINE: String = "decline"
const REASON_INJURY: String = "injury"

const LABELS: Dictionary = {
	REASON_VOLUNTARY: "자발적 은퇴",
	REASON_DECLINE: "노쇠·계약 불발",
	REASON_INJURY: "부상으로 인한 은퇴",
}

## 노쇠 압박을 재는 주차 — 시즌이 끝나는 때다(재계약을 앞둔 자리)
const PRESSURE_WEEK: int = Calendar.WEEKS_PER_SEASON


# ── 상태 ──────────────────────────────────────────────────────

## ⚠ **`retired`가 정본이다.** `DayEngine`과 진행 버튼이 이미 그걸 보고
## 멈춘다 — 다른 필드를 새로 만들면 "은퇴했는데 계속 진행되는" 갈래가 생긴다.
## `retirement`은 그 옆에 남는 **기록**이지 판정에 쓰는 값이 아니다
static func is_retired(p: Dictionary) -> bool:
	return bool(p.get("retired", false))


## 지금 스스로 그만둘 수 있나.
##
## 학생 신분에서는 "은퇴"가 성립하지 않는다 — 그건 진로 포기이고
## 진로 허브가 이미 다룬다
static func can_retire_voluntarily(p: Dictionary) -> bool:
	if is_retired(p):
		return false
	var stage: String = String(p.get("career_stage", ""))
	return Finance.is_pro(stage) or stage == "independent"


# ── 부상 강제 ─────────────────────────────────────────────────

## 수술급 부상이 났을 때 은퇴할 확률(0~1). **NPC·주인공 공용**
static func surgery_retire_chance(age: int, has_prior_surgery: bool) -> float:
	var r: Dictionary = rules().get("surgery", {})
	if age >= int(r.get("age_high", 36)):
		return float(r.get("chance_high", 0.65))
	if age >= int(r.get("age_mid", 33)):
		return float(r.get("chance_mid", 0.35))
	# 젊어도 재수술이면 높다 — **나이 조건보다 뒤에 둔다**
	if has_prior_surgery:
		return float(r.get("prior_surgery_chance", 0.4))
	return float(r.get("base_chance", 0.05))


## 이번 주에 수술급 부상이 났나. **그 주에만 참이다** — 안 그러면
## 회복하는 내내 매주 은퇴를 물어본다
static func surgery_just_happened(p: Dictionary, at_day: int) -> bool:
	var inj = p.get("injury", null)
	if not (inj is Dictionary):
		return false
	if String(inj.get("severity", "")) != "surgery":
		return false
	return int(inj.get("since_day", -1)) == at_day


# ── 노쇠 압박 ─────────────────────────────────────────────────

## 최근 OVR 추세. **시즌 기록에서 뽑는다** — 은퇴 판정의 핵심 입력이다
static func ovr_trend_of(p: Dictionary) -> float:
	var recs: Array = p.get("career_records", [])
	if recs.size() < 2:
		return 0.0
	return float(recs[recs.size() - 1].get("ovr", 0.0)) \
		- float(recs[recs.size() - 2].get("ovr", 0.0))


## 시장가 — **연봉 협상과 같은 엔진을 쓴다.** 기준이 둘이면 어긋난다.
##
## ⚠ 02는 여기 페이로드를 두 번째로 적었다가 `leagueId`를 빠뜨렸고, 실패를
## 0으로 삼켜서 `salary / marketValue`가 늘 최대가 됐다 — **없는 압박을
## 만들었다**
static func market_value_of(p: Dictionary) -> int:
	return Contract.market_value(Contract.core_ovr(p),
		String(p.get("league_id", "")), int(p.get("pro_service_years", 0)),
		int(p.get("age", 25)))


## 내 자리를 위협하는 팀 안 최고 OVR (나 제외)
static func prospect_ovr_of(state: Dictionary) -> float:
	var p: Dictionary = state.get("protagonist", {})
	var me: String = String(p.get("id", ""))
	var best: float = 0.0
	for q in World.roster_of(state.get("world", {}), String(p.get("team_id", ""))):
		if String(q.get("id", "")) == me:
			continue
		best = maxf(best, Contract.core_ovr(q))
	return best


## 구단 관점에서 은퇴를 권할 상황인가. `{suggest, urgency, score}`
##
## ⚠ **참이어도 자동으로 은퇴시키지 않는다.** "구단들이 다음 시즌 계약을
## 안 해주는 상황"을 알려주는 용도다
static func pressure(p: Dictionary, profile: Dictionary, ovr_trend: float,
		market_value: int, prospect_ovr: float) -> Dictionary:
	var r: Dictionary = rules().get("pressure", {})
	var age: int = int(p.get("age", 25))
	var score: float = 0.0

	if age >= int(r.get("age_hard", 38)):
		score += float(r.get("age_hard_score", 40.0))
	elif age >= int(r.get("age_soft", 35)):
		score += float(age - int(r.get("age_soft", 35))) \
			* float(r.get("age_soft_step", 8.0))

	if ovr_trend < float(r.get("trend_steep", -3.0)):
		score += float(r.get("trend_steep_score", 20.0))
	elif ovr_trend < float(r.get("trend_mild", -1.5)):
		score += float(r.get("trend_mild_score", 10.0))

	# 과지급 — **분모가 0이면 비율이 무한이다.** 02가 그 자리에서 없는 압박을
	# 만들었다
	var overpay: float = float(p.get("salary", 0)) / float(maxi(market_value, 1))
	if overpay > float(r.get("overpay_ratio", 1.5)):
		score += float(r.get("overpay_score", 15.0))

	if prospect_ovr >= Contract.core_ovr(p):
		score += float(r.get("prospect_score", 10.0))

	if float(profile.get("discipline", 50.0)) > float(r.get("discipline_over", 70.0)):
		score += float(r.get("discipline_score", 8.0))
	# 안정적인 구단은 이름값 있는 노장을 붙잡는다
	if float(profile.get("stability", 50.0)) > float(r.get("stability_over", 70.0)) \
			and float(p.get("fame", 0.0)) > float(r.get("fame_over", 30.0)):
		score += float(r.get("loyalty_score", -10.0))

	# 급함은 0~1. **위를 자르지 않는다** — 점수 상한이 40+20+15+10+8 = 93이라
	# 나누는 수(100)를 넘을 수가 없다. 자르는 줄을 두면 절대 안 걸리는
	# 죽은 가드가 된다
	return {
		"suggest": score >= float(r.get("suggest_at", 40.0)),
		"urgency": score / float(r.get("urgency_divisor", 100.0)),
		"score": score,
	}


## 지금 상태로 압박을 잰다 — 입력을 모으는 자리
static func pressure_of(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	return pressure(p,
		TeamProfile.of(state.get("world", {}), String(p.get("team_id", ""))),
		ovr_trend_of(p), market_value_of(p), prospect_ovr_of(state))


# ── 물어본다 ──────────────────────────────────────────────────

## 한 주. 은퇴를 물어야 하면 대기줄에 올린다. 올렸으면 그 사유
##
## ⚠ **강제하지 않는다.** 커리어가 끝나는 결정은 사용자가 한다
static func check(state: Dictionary, at_day: int,
		rng: RandomNumberGenerator) -> String:
	# 두 번 쌓이는 것은 `_ask`의 `push_once`가 막는다 — 여기서 또 물으면
	# 정본이 둘이 된다
	var p: Dictionary = state.get("protagonist", {})
	if not can_retire_voluntarily(p):
		return ""

	if surgery_just_happened(p, at_day):
		var chance: float = surgery_retire_chance(int(p.get("age", 25)),
			bool(p.get("has_prior_surgery", false)))
		if rng.randf() < chance:
			_ask(state, REASON_INJURY, at_day)
			return REASON_INJURY
		return ""

	if Calendar.week_of(at_day) != PRESSURE_WEEK:
		return ""
	if not bool(pressure_of(state)["suggest"]):
		return ""
	_ask(state, REASON_DECLINE, at_day)
	return REASON_DECLINE


static func _ask(state: Dictionary, reason: String, at_day: int) -> void:
	Pending.push_once(state, {"type": "retirement_ask", "reason": reason,
		"label": String(LABELS.get(reason, "")), "day": at_day})


# ── 확정 ──────────────────────────────────────────────────────

## 은퇴를 확정한다. **커리어가 여기서 끝난다** — 진행이 멈추고 기록이 남는다.
##
## ⚠ **`career_stage`는 그대로 둔다.** 마지막 소속이 어디였는지가 기록의
## 일부고, 여기에 "은퇴"를 넣으면 단계별 분기 수십 곳이 전부 그걸 모른다
static func retire(state: Dictionary, reason: String, at_day: int) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty() or is_retired(p):
		return false

	var year: int = int(state.get("season_year", 0))
	var label: String = String(LABELS.get(reason, LABELS[REASON_VOLUNTARY]))
	p["retired"] = true
	p["retirement"] = {"year": year, "day": at_day, "reason": reason,
		"label": label}

	var events: Array = p.get("career_events", [])
	events.append({
		"year": year, "type": "retirement",
		"from_team_id": String(p.get("team_id", "")),
		"from_league_id": String(p.get("league_id", "")),
		"detail": label,
	})
	p["career_events"] = events

	Pending.resolve(state, "retirement_ask")

	var seasons: int = p.get("career_records", []).size()
	var mailbox: Array = state.get("mailbox", [])
	mailbox.append({
		"id": "msg-retire-%d" % year,
		"category": "news", "sender": "구단",
		"subject": "은퇴",
		"preview": "%d시즌을 끝으로 선수 생활을 마칩니다." % year,
		"body": "\n".join([
			"%d시즌을 끝으로 선수 생활을 마칩니다." % year,
			"",
			"사유: %s" % label,
			"통산 %d시즌" % seasons,
		]),
		"day": at_day, "read": false, "decision": null,
	})
	state["mailbox"] = mailbox
	return true


## 은퇴를 미룬다 — 물어본 것을 치우기만 한다. 다음 해에 또 물어본다
static func keep_playing(state: Dictionary) -> bool:
	return Pending.resolve(state, "retirement_ask")
