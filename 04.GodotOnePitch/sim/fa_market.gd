extends RefCounted
class_name FaMarket

## FA 시장 — 등급·보상선수·계약. M9-12.
##
## 원본: `free_agency.rs`의 `resolve_market`
##
## **보상선수가 실제로 움직인다** (02 사용자 확정, KBO식 A/B/C 등급).
## 등급은 리그 연봉 순위 백분위로 정하고, A/B는 보호선수 밖에서 한 명 +
## 보상금, C는 보상금만 간다.
##
## ⚠ **좋은 선수부터 팀을 고른다.** 계약이 성사되면 그 팀의 자리가 하나
## 줄어든다 — 순차 처리라 상위 FA가 먼저 자리를 가져간다. 실제 FA와 같다.
##
## ⚠ **자격 연수의 정본은 `TeamProfile.FA_YEARS` 하나다.** 02는 TS와 Rust에
## 각각 있었고, 값이 같아도 정본이 둘이면 언젠가 갈라진다 — 이 프로젝트에서
## 그 부류로만 결함이 열 번 나왔다.


const RULES_PATH: String = "res://data/fa_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("FA 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


# ── 등급 ──────────────────────────────────────────────────────

## 연봉 백분위 0(최고연봉) ~ 100(최저연봉).
##
## ⚠ **높은 쪽이 0이다.** 뒤집으면 최저연봉 선수가 A등급을 받아 보상선수가
## 딸려 간다
static func salary_percentile(salary: int, sorted_desc: Array) -> float:
	if sorted_desc.is_empty():
		return 50.0
	var better: int = 0
	for s in sorted_desc:
		if int(s) > salary:
			better += 1
	return float(better) / float(sorted_desc.size()) * 100.0


## 규칙 파일을 못 읽었을 때의 등급. **보상선수 없음 · 보상금 없음** —
## 안 두면 `resolve`가 빈 사전을 읽다 터진다
const FALLBACK_GRADE: Dictionary = {
	"grade": "C", "until_percent": 100.0, "protected_count": 0, "money_pct": 0.0,
}


## 그 백분위의 등급. **구간에 구멍이 없어야 한다** — 있으면 그 선수만
## 조용히 보상 없이 이적한다.
##
## `grades`를 넘기면 그걸 쓴다 — 규칙 파일이 없는 상황을 검사가 만들 수 있어야
## 폴백이 죽은 코드가 아니게 된다
static func grade_of(percentile: float, grades: Array = []) -> Dictionary:
	var table: Array = grades if not grades.is_empty() else rules().get("grades", [])
	for g in table:
		if percentile <= float(g["until_percent"]):
			return g
	return FALLBACK_GRADE


# ── 입찰 ──────────────────────────────────────────────────────

## 폼이 능력에 얹히는 정도 — 최근에 잘한 선수가 먼저 팔린다
const FORM_WEIGHT: float = 8.0
## 원소속 프리미엄. **보상 부담이 없어 유리하다**
const HOME_BONUS: float = 0.15
## 성적 압박이 입찰에 얹히는 정도
const PRESSURE_DIVISOR: float = 200.0
## 입찰 흔들림
const BID_MIN: float = 0.85
const BID_SPAN: float = 0.30
## 계약 연봉 = 직전 연봉 × (이 값 + 입찰 × 배수)
const SALARY_BASE: float = 0.9
const SALARY_BID_WEIGHT: float = 0.35


static func rating(p: Dictionary) -> float:
	return float(p.get("ovr", 0.0)) + float(p.get("form", 0.0)) * FORM_WEIGHT


# ── 시장 ──────────────────────────────────────────────────────

## FA 시장을 한 번에 정산한다. `{signings, unsigned}`
##
## `players`: `{id, name, from_team_id, ovr, age, salary, form}`
## `teams`: `{team_id, budget_index, win_now_pressure, open_slots, roster[{id, ovr}]}`
##
## ⚠ **팀의 `roster`는 보상 대상만이다.** 전체 로스터를 넣으면 보호선수 다음
## 순위가 거의 항상 용병이라 매 FA마다 한 명씩 팀을 옮긴다
static func resolve(players: Array, teams: Array, league_salaries: Array,
		rng: RandomNumberGenerator) -> Dictionary:
	var sorted_salaries: Array = league_salaries.duplicate()
	sorted_salaries.sort_custom(func(a, b) -> bool: return int(a) > int(b))

	var by_id: Dictionary = {}
	for t in teams:
		by_id[String(t["team_id"])] = t

	var pool: Array = players.duplicate()
	pool.sort_custom(func(a, b) -> bool: return rating(a) > rating(b))

	var signings: Array = []
	var unsigned: Array = []
	# 보상선수로 이미 빠져나간 사람은 다시 뽑히면 안 된다
	var taken: Dictionary = {}

	for p in pool:
		var from_team: String = String(p.get("from_team_id", ""))

		# 입찰 — 자리가 있는 팀만. 예산·성적 압박이 높을수록 세게 부른다
		var best_id: String = ""
		var best_bid: float = -1.0
		for t in teams:
			if int(t.get("open_slots", 0)) <= 0:
				continue
			# 원소속도 경쟁에 낀다(재계약) — 보상 부담이 없어 유리하다
			var home: float = HOME_BONUS if String(t["team_id"]) == from_team else 0.0
			var bid: float = float(t.get("budget_index", 1.0)) \
				* (1.0 + float(t.get("win_now_pressure", 0.0)) / PRESSURE_DIVISOR) \
				* (BID_MIN + rng.randf() * BID_SPAN) + home
			if bid > best_bid:
				best_bid = bid
				best_id = String(t["team_id"])

		if best_id.is_empty():
			unsigned.append(String(p["id"]))
			continue

		var pct: float = salary_percentile(int(p.get("salary", 0)), sorted_salaries)
		var grade: Dictionary = grade_of(pct)

		var salary: int = int(roundf(float(p.get("salary", 0))
			* (SALARY_BASE + best_bid * SALARY_BID_WEIGHT)))
		# 나이가 많으면 연수가 짧다
		var age: int = int(p.get("age", 27))
		var years: int = 1 if age >= 34 else (2 if age >= 31 else 3)

		# 보상 — **원소속을 떠날 때만.** 재계약이면 보상이 없다
		var comp_id: String = ""
		var comp_money: int = 0
		if best_id != from_team:
			comp_money = int(roundf(float(p.get("salary", 0))
				* float(grade["money_pct"]) / 100.0))
			var protected_count: int = int(grade["protected_count"])
			if protected_count > 0 and by_id.has(best_id):
				var roster: Array = []
				for r in by_id[best_id].get("roster", []):
					if not taken.has(String(r["id"])):
						roster.append(r)
				roster.sort_custom(func(a, b) -> bool:
					return float(a["ovr"]) > float(b["ovr"]))
				# 보호선수 밖에서 제일 나은 선수를 데려간다
				if roster.size() > protected_count:
					comp_id = String(roster[protected_count]["id"])
					taken[comp_id] = true

		if by_id.has(best_id):
			by_id[best_id]["open_slots"] = int(by_id[best_id]["open_slots"]) - 1
		# 보상선수가 빠진 팀은 자리가 하나 생긴다
		if not comp_id.is_empty() and by_id.has(from_team):
			by_id[from_team]["open_slots"] = int(by_id[from_team].get("open_slots", 0)) + 1

		signings.append({
			"id": String(p["id"]), "name": String(p.get("name", "")),
			"from_team_id": from_team, "to_team_id": best_id,
			"grade": String(grade["grade"]), "salary": salary, "years": years,
			"compensation_id": comp_id, "compensation_money": comp_money,
		})

	return {"signings": signings, "unsigned": unsigned}
