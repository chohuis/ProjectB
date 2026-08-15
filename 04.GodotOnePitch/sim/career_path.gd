extends RefCounted
class_name CareerPath

## 진로 — 학적 전이 · 대학 요건 · 입시 판정. B-6a.
##
## 원본: `utils/careerTransition.ts` · `utils/universityUtils.ts` ·
##       `week_engine.rs`의 `calc_hs_admissions`
##
## ⚠ **요건을 손으로 적지 않는다.** 02엔 대학 7개짜리 하드코딩 표가 있었는데
## 그중 실재하는 팀이 하나뿐이었다 — 팀이 50개로 늘 때 표가 안 따라갔고,
## 표에 없는 49개 대학이 `?? 9` / `?? 0`으로 떨어져 **전부 무조건 합격**이었다.
## 요건은 팀 데이터의 전력★에서 낸다.
##
## ⚠ **여기는 판정만 한다.** 상태를 바꾸는 것은 `CareerDecision`이다.


const RULES_PATH: String = "res://data/career_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("진로 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


# ── 전력★ → 등급 ─────────────────────────────────────────────

## 전력★을 등급으로. **범위 밖도 등급을 받는다** — 등급 없는 대학을
## 만들면 그 대학이 요건 없이 통과한다
static func tier_of_power(power) -> String:
	var r: Dictionary = rules()
	if power == null:
		power = r.get("default_power", 3)
	var p: int = int(roundf(float(power)))
	var table: Dictionary = r.get("power_tier", {})
	var key: String = str(p)
	if table.has(key):
		return String(table[key])
	return "S" if p > 5 else "D"


## 등급의 입학 요건. `{tier, min_academic_grade, min_baseball_score}`
static func requirement_of_power(power) -> Dictionary:
	var tier: String = tier_of_power(power)
	var t: Dictionary = rules().get("tiers", {}).get(tier, {})
	return {
		"tier": tier,
		"min_academic_grade": int(t.get("min_academic_grade", 9)),
		"min_baseball_score": int(t.get("min_baseball_score", 0)),
	}


## 그 대학에 다니면 스카우트가 얼마나 더 보나.
##
## ⚠ **약한 대학은 음수다.** 전부 0 이상이면 어디를 가든 손해가 같아서
## 대학을 고를 이유가 없다 — 02가 실제로 그랬다(표에 없어 전부 D의 −3)
static func scout_bonus_of_power(power) -> int:
	return int(rules().get("tiers", {}).get(tier_of_power(power), {}).get("scout_bonus", 0))


# ── 학업 등급 ─────────────────────────────────────────────────

## 학점 → 9등급. **1이 제일 좋다** — 학점과 방향이 반대다.
##
## ⚠ 02는 석차백분율에서 등급을 냈다. 04 학사는 석차를 안 만들고 학점만
## 만들어서, 02의 두 표(석차→등급 · 석차→학점)를 합쳐 하나로 뒀다 —
## 값은 그대로고 중간 다리만 없앴다. 석차 표를 그대로 옮기면 아무도
## 안 먹이는 죽은 코드가 된다
static func grade_of_gpa(gpa: float) -> int:
	var cuts: Array = rules().get("gpa_grade_cuts", [])
	for i in range(cuts.size()):
		if gpa >= float(cuts[i]):
			return i + 1
	return cuts.size() + 1


# ── 고교 야구 점수 ────────────────────────────────────────────

## 입시가 보는 야구 성적. **고교 시즌만 센다** — 대학 우승을 고교 입시에
## 넣으면 시간이 거꾸로 간다
static func hs_baseball_score(records: Array) -> int:
	var r: Dictionary = rules().get("hs_baseball", {})
	var total: int = 0
	for rec in records:
		if String(rec.get("league_id", "")) != "LEAGUE_HIGHSCHOOL":
			continue
		total += int(r.get(String(rec.get("ps_result", "")), 0))
		total += rec.get("awards", []).size() * int(r.get("per_award", 0))
	return total


# ── 독립리그 ──────────────────────────────────────────────────

static func sangmu_team_id() -> String:
	return String(rules().get("sangmu_team_id", ""))


## ⚠ **상무는 지원 대상이 아니다.** 독립 리그에 들어 있지만 병역 경로가
## 정본이다 — 안 빼면 고교생이 상무에 원서를 넣는다
static func is_applicable_independent(team_id: String) -> bool:
	return team_id != sangmu_team_id()


## 독립리그 입단 컷(OVR). **팀의 전력★에서 낸다.**
##
## ⚠ 02 엔진은 지망 순서로만 컷을 정했다(1지망 52 · 2지망 48 · 3지망 44) —
## 어느 팀을 쓰든 같았고 **1지망에 약팀을 써도 컷이 52**였다
static func indie_cut_of_power(power) -> int:
	var p: int = int(roundf(float(power if power != null else 2)))
	for row in rules().get("independent", {}).get("cuts", []):
		if p >= int(row[0]):
			return int(row[1])
	return 39


# ── 학적 전이 ─────────────────────────────────────────────────

## 전이 허용표. **없는 조합은 전부 거부한다.**
##
## ⚠ **학적은 되돌릴 수 없다.** 02는 `applyDraftDecision`이 어떤 단계든
## 검증 없이 받아서 구조적 보호가 없었고, **대학 두 번 입학**이 실제로
## 성립했다(결과 주차 판정이 대학 재학생에게도 발동했다).
##
## ⚠ **`military`가 빈 목록인 것은 실수가 아니다.** 전역은 입대 전 단계를
## 되돌리는 별도 경로라 이 표를 안 탄다 — 표에 넣으면 "군인 → 대학"이 열린다
const TRANSITION: Dictionary = {
	"highschool": ["university", "independent", "pro", "pro_kbl", "pro_abl",
		"pro_jbl", "military"],
	# 대학은 1~4학년 매년 드래프트 신청 가능. 미지명이면 독립으로 간다.
	# **대학은 없다** — 두 번 입학 불가
	"university": ["independent", "pro", "pro_kbl", "pro_abl", "pro_jbl", "military"],
	# 독립은 매년 재지원. 학교로는 안 돌아간다
	"independent": ["pro", "pro_kbl", "pro_abl", "pro_jbl", "military"],
	"pro": ["pro", "pro_kbl", "pro_abl", "pro_jbl", "independent", "military"],
	"pro_kbl": ["pro", "pro_kbl", "pro_abl", "pro_jbl", "independent", "military"],
	"pro_abl": ["pro", "pro_kbl", "pro_abl", "pro_jbl", "independent", "military"],
	"pro_jbl": ["pro", "pro_kbl", "pro_abl", "pro_jbl", "independent", "military"],
	"military": [],
}


static func can_transition(from: String, to: String) -> bool:
	if from == to:
		return true                       # 재계약·팀 이동은 전이가 아니다
	return TRANSITION.get(from, []).has(to)


## 거부 이유. 통과하면 빈 문자열 — 로그와 검사가 읽는다
static func transition_reason(from: String, to: String) -> String:
	if can_transition(from, to):
		return ""
	if to == "highschool":
		return "고교 재입학 불가"
	if to == "university" and from == "university":
		return "대학 두 번 입학 불가"
	if to == "university":
		return "%s → 대학 진학 불가 (학적 역행)" % from
	if from == "military":
		return "전역은 입대 전 단계 복원 경로로만"
	return "%s → %s 전이 불가" % [from, to]


## 대학에 지원할 수 있는 단계인가. **고교생만이다** — 보이는데 눌러도
## 아무 일이 없으면 그게 더 나쁘다
static func can_apply_university(stage: String) -> bool:
	return stage == "highschool"


## 독립리그에 지원할 수 있는 단계인가. 프로는 방출 경로로 따로 간다
static func can_apply_independent(stage: String) -> bool:
	return stage == "highschool" or stage == "university"


# ── 대학 학년 ─────────────────────────────────────────────────

## 대학은 4년제다 — 그 이상은 없다
const UNIVERSITY_FINAL_GRADE: int = 4


## 지금 몇 학년인가.
##
## ⚠ **정본이 둘이었다.** 저장 필드 `grade`와 재학 주차를 서로 다른 곳에서
## 각자 계산했고, `grade`는 진학할 때 지워져 늘 비어 있었다. 화면만 주차로
## 버텨서 **화면은 4학년에서 진급을 막는데 헤드리스는 7년째 "계속"을 눌렀다**
## (실측 29세 대학생). **주차가 정본이다** — 매주 오르는 실제 계수기이고
## 진학이 시즌 도중에 확정돼도 안 어긋난다
static func university_grade_of(grade: int, university_week: int) -> int:
	if university_week >= 1:
		return mini((university_week - 1) / 52 + 1, UNIVERSITY_FINAL_GRADE)
	if grade >= 1:
		return mini(grade, UNIVERSITY_FINAL_GRADE)
	return 1


static func is_university_final_year(grade: int, university_week: int) -> bool:
	return university_grade_of(grade, university_week) >= UNIVERSITY_FINAL_GRADE


# ── 입시 확률 ─────────────────────────────────────────────────

## 그 대학에 붙을 확률(%). **요건 둘을 다 넘으면 대개 붙는다.**
##
## ⚠ **위를 자른다.** 안 자르면 성적 하나로 합격이 확정이 된다
static func university_chance(power, academic_grade: int, baseball_score: float) -> float:
	var req: Dictionary = requirement_of_power(power)
	var a: Dictionary = rules().get("admission", {})
	var meets_academic: bool = academic_grade <= int(req["min_academic_grade"])
	var meets_baseball: bool = baseball_score >= float(req["min_baseball_score"])

	if meets_academic and meets_baseball:
		var a_bonus: float = maxf(float(req["min_academic_grade"]) - float(academic_grade),
			0.0) * float(a.get("academic_bonus_per_grade", 3.0))
		var b_bonus: float = minf(
			(baseball_score - float(req["min_baseball_score"]))
				/ float(a.get("baseball_bonus_divisor", 20.0)),
			float(a.get("baseball_bonus_max", 10.0)))
		return minf(float(a.get("both", 70.0)) + a_bonus + b_bonus,
			float(a.get("cap", 92.0)))
	if meets_academic:
		return float(a.get("academic_only", 28.0))
	if meets_baseball:
		return float(a.get("baseball_only", 22.0))
	return float(a.get("neither", 8.0))


## 그 독립팀에 입단할 확률(%). `order`는 지망 순서(0부터).
##
## ⚠ **한참 모자라면 0이다.** 흔들림만으로 뚫리면 컷이 죽은 값이다
static func independent_chance(power, ovr: float, order: int) -> float:
	var r: Dictionary = rules().get("independent", {})
	var penalties: Array = r.get("order_penalty", [])
	var penalty: float = float(penalties[mini(order, penalties.size() - 1)]) \
		if not penalties.is_empty() else 0.0
	var cut: float = float(indie_cut_of_power(power)) - penalty
	if ovr < cut - float(r.get("hopeless_margin", 10.0)):
		return 0.0
	return clampf(float(r.get("base", 36.0)) + (ovr - cut) * float(r.get("slope", 3.2)),
		float(r.get("min", 12.0)), float(r.get("max", 96.0)))


# ── 입시 판정 ─────────────────────────────────────────────────

## 지원 결과. `{university_passed, independent_passed}`
##
## `inp`: `{ovr, gpa, hs_baseball_score, university_choices, independent_choices}`
##
## ⚠ **요건을 팀 id로 받아 여기서 낸다.** 02는 값(요건)과 대상(팀 목록)을
## 따로 넘겼고, 층마다 맞는데 잇는 선이 빠진 결함이 거기서 여러 번 나왔다
##
## ⚠ **난수 흐름이 하나다.** 대학·독립이 각자 새 난수를 만들면 지원 조합이
## 뭐든 한쪽 결과가 늘 같아진다
static func admissions(inp: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var academic_grade: int = grade_of_gpa(float(inp.get("gpa", 0.0)))
	var baseball: float = float(inp.get("hs_baseball_score", 0.0))
	var ovr: float = float(inp.get("ovr", 0.0))

	var univ_passed: Array = []
	for team_id in inp.get("university_choices", []):
		var power = World.team_field({}, String(team_id), "power", null)
		if rng.randf() * 100.0 < university_chance(power, academic_grade, baseball):
			univ_passed.append(String(team_id))

	# ⚠ **상무를 먼저 뺀 뒤에 지망 순서를 센다.** 빼기 전에 세면 상무를
	# 1지망에 쓴 사람만 나머지 지망이 한 칸씩 밀린다
	var indie_choices: Array = []
	for team_id in inp.get("independent_choices", []):
		if is_applicable_independent(String(team_id)):
			indie_choices.append(String(team_id))

	var indie_passed: Array = []
	for i in range(indie_choices.size()):
		var power2 = World.team_field({}, String(indie_choices[i]), "power", null)
		if rng.randf() * 100.0 < independent_chance(power2, ovr, i):
			indie_passed.append(String(indie_choices[i]))

	return {"university_passed": univ_passed, "independent_passed": indie_passed}
