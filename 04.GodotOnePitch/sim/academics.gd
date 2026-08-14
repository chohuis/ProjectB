extends RefCounted
class_name Academics

## 학사 — 학업 품질·학점·경고·전공. B-1.
##
## 원본: `generation_rules.json`의 `academicsRules` ·
##       `usecases/weekPhases/academics.ts` · `advanceWeek.ts`의 학사 갈래
##
## ⚠ **수치를 코드에 다시 적지 않는다.** 규칙 파일이 정본이다 — 02 Phase 7에서
## "표가 두 곳"으로 시작한 결함만 15건 나왔다.
##
## ⚠ **고교와 대학은 축이 다르다.** 고교는 석차로 대학 입학 티어를 정하고,
## 대학은 **학점 → 졸업 자격 → 진로 안전망**이 축이다. 대학에 고교 9등급을
## 그대로 쓰면 성립하지 않는다.
##
## ⚠ **02는 대학 시험 트리거가 없어 학기 확정이 죽은 코드였다.** `EVT_HS_*`가
## 고교 전용이라 대학에서는 아예 안 떴고, 학점 확정 경로가 **영영 실행되지
## 않았다.** 그래서 여기 시험 주차는 두 무대가 같이 쓴다.


const RULES_PATH: String = "res://data/academics_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("학사 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


static func university() -> Dictionary:
	return rules().get("university", {})


# ── 학기 ──────────────────────────────────────────────────────

## 학기가 끝나는 주. **고교·대학이 같다** — 02의 `week_eq` 값 그대로
static func midterm_week() -> int:
	return int(rules().get("midterm_week", 11))


static func final_week() -> int:
	return int(rules().get("final_week", 38))


## 이 주가 시험 주인가. `""` · `"midterm"` · `"final"`
static func exam_at(week: int) -> String:
	if week == midterm_week():
		return "midterm"
	if week == final_week():
		return "final"
	return ""


## 그 날이 시험 주인가. **부르는 쪽이 주차를 세지 않게 한다** — 루트가
## 자기 손으로 세기 시작하면 그게 두 번째 정본이 된다
static func exam_at_day(day: int) -> String:
	return exam_at(Calendar.week_of(day))


# ── 주간 학업 ─────────────────────────────────────────────────

## 한 주의 학업 품질 (0~1). 모르는 방식은 보통으로 본다
static func study_quality(mode: String) -> float:
	return float(university().get("study_mode_gpa", {}).get(mode, 0.55))


## 그 주의 학업을 쌓는다. **제자리에서 고친다.**
##
## ⚠ **주차 수도 같이 센다.** 평균을 내야 학기 길이가 달라도 공정하다 —
## 합계만 쌓으면 기말(27주)이 중간(11주)보다 무조건 높은 학점이 된다
static func study_week(school: Dictionary) -> void:
	school["study_quality_sum"] = float(school.get("study_quality_sum", 0.0)) \
		+ study_quality(String(school.get("study_mode", "normal")))
	school["study_weeks"] = int(school.get("study_weeks", 0)) + 1


# ── 학기 확정 ─────────────────────────────────────────────────

## 이번 학기 학점. **평균 품질 × 만점 × 전공 배수**
static func semester_gpa(school: Dictionary) -> float:
	var weeks: int = int(school.get("study_weeks", 0))
	if weeks <= 0:
		return 0.0
	var avg: float = float(school.get("study_quality_sum", 0.0)) / float(weeks)
	var major: Dictionary = major_of(String(school.get("major", "")))
	return avg * float(university().get("gpa_max", 4.5)) \
		* float(major.get("gpa_gain_mult", 1.0))


## 경고 단계 갱신. **못 넘으면 +1, 넘으면 −1** — 0 아래로 안 내려간다.
##
## ⚠ **내려가는 길이 있어야 한다.** 한 번 경고를 받으면 영영 안 풀리면
## 한 학기 실수로 커리어가 끝난다
static func next_warning_level(current: int, gpa: float) -> int:
	if gpa < float(university().get("warning_gpa", 1.75)):
		return current + 1
	return maxi(current - 1, 0)


## 그 단계의 효과. 없으면 빈 사전(= 아무 효과 없음)
static func warning_effect(level: int) -> Dictionary:
	var best: Dictionary = {}
	for e in university().get("warning_effects", []):
		if level >= int(e["level"]):
			best = e
	return best


## 훈련 효율 배수. **경고가 훈련을 깎는다** — 그게 학사의 무게다
static func training_mod(school: Dictionary) -> float:
	var eff: Dictionary = warning_effect(int(school.get("warning_level", 0)))
	var base: float = float(eff.get("training_eff_mod", 1.0))
	# 전공 보너스는 경고와 별개 축이다
	return base + float(major_of(String(school.get("major", ""))).get(
		"training_eff_bonus", 0.0))


## 경기에 못 나가나 — 2단계부터다
static func blocks_games(school: Dictionary) -> bool:
	return bool(warning_effect(int(school.get("warning_level", 0)))
		.get("blocks_games", false))


## 학기를 확정한다. **제자리에서 고친다.** `{gpa, warning_level, label, blocked}`
##
## ⚠ **누적 학점을 같이 쌓는다.** 졸업 판정이 그걸 본다 — 학기 학점만 두면
## 마지막 학기만 잘 봐도 졸업한다
static func close_semester(school: Dictionary) -> Dictionary:
	var gpa: float = semester_gpa(school)
	var level: int = next_warning_level(int(school.get("warning_level", 0)), gpa)

	var terms: int = int(school.get("gpa_terms", 0)) + 1
	school["gpa_total"] = float(school.get("gpa_total", 0.0)) + gpa
	school["gpa_terms"] = terms
	school["gpa"] = float(school["gpa_total"]) / float(terms)
	school["warning_level"] = level
	school["last_semester_gpa"] = gpa
	# 다음 학기를 위해 비운다 — 안 비우면 평균이 학기마다 희석된다
	school["study_quality_sum"] = 0.0
	school["study_weeks"] = 0

	var eff: Dictionary = warning_effect(level)
	return {
		"gpa": gpa, "warning_level": level,
		"label": String(eff.get("label", "")),
		"blocked": bool(eff.get("blocks_games", false)),
		"repeats": bool(eff.get("repeats", false)),
	}


## 졸업할 수 있나 — **누적 학점이 기준을 넘어야 한다**
static func can_graduate(school: Dictionary) -> bool:
	return float(school.get("gpa", 0.0)) >= float(
		university().get("graduation_gpa", 2.0))


# ── 전공 ──────────────────────────────────────────────────────

## 고를 수 있는 전공
static func majors() -> Array:
	var out: Array = []
	for k in rules().get("majors", {}):
		out.append(k)
	out.sort()
	return out


## 그 전공의 효과. 모르면 빈 사전
static func major_of(name: String) -> Dictionary:
	return rules().get("majors", {}).get(name, {})


## 전공이 주는 XP 보너스 — 스탯별 배수
static func xp_bonus(school: Dictionary) -> Dictionary:
	return major_of(String(school.get("major", ""))).get("xp_bonus", {})


## 전공이 주는 부상 배수 — 스포츠과학이 낮다
static func injury_mod(school: Dictionary) -> float:
	return float(major_of(String(school.get("major", ""))).get("injury_mod", 1.0))
