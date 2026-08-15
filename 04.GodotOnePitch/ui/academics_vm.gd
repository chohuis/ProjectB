extends RefCounted
class_name AcademicsVm

## 학사 화면 — C-3.
##
## 원본: `pages/academics/AcademicsPage.svelte` ("나" 탭의 하위 탭이다)
##
## ⚠ **이 화면이 `study_mode`와 `major`를 쓰는 쪽이다.** 04는 둘 다 읽는
## 코드만 있고 세우는 데가 없어서, 전 커리어가 "normal" 고정이고 전공 표
## 셋이 통째로 도달 불가였다.
##
## ⚠ **04엔 과목·석차백분율이 없다.** 02의 "과목별 현황"(국영수사과)은
## 옮길 대상이 아니다 — 04 학사의 축은 학점 → 졸업 자격이다.
##
## ⚠ **수치를 여기 옮겨 적지 않는다.** 학업 모드 설명은 규칙 파일에서
## 계산해서 만든다 — 옮겨 적으면 규칙을 고쳐도 화면만 안 따라온다.

const STAGE_LABEL: Dictionary = {
	"LEAGUE_HIGHSCHOOL": "고교",
	"LEAGUE_UNIVERSITY": "대학",
}

## 학업 모드 이름. **효과는 규칙 파일에서 계산해 붙인다**
const MODE_LABEL: Dictionary = {
	"focus": "집중 수업",
	"normal": "일반 수업",
	"rest": "수업 중 휴식",
	"sleep": "수업 중 수면",
}

## 표시 순서 — 학점이 높은 쪽부터
const MODE_ORDER: Array = ["focus", "normal", "rest", "sleep"]

const EXAM_LABEL: Dictionary = {"midterm": "중간고사", "final": "기말고사"}

## 전공은 **한 번뿐이고 되돌릴 수 없다** — 고르기 전에 그렇게 말한다
const MAJOR_HINT: String = "전공은 훈련 효율·학점·부상에 영구히 영향을 줍니다. 한 번 고르면 바꿀 수 없습니다."


static func build(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var league: String = String(p.get("league_id", ""))
	var at_school: bool = STAGE_LABEL.has(league)
	var school: Dictionary = state.get("school", {})
	var week: int = Calendar.week_of(int(state.get("day", 1)))

	return {
		# ⚠ **"학교에 다니나"의 정본은 여기 하나다.** 탭을 만드는 쪽도
		# 이 값을 읽는다 — 두 곳이 각자 판정하면 언젠가 갈린다
		"at_school": at_school,
		"stage": String(STAGE_LABEL.get(league, "")),
		"gpa": _gpa(school),
		"warning": _warning(school),
		"exam": _exam(week),
		"major": _major(school, league),
		"study": _study(school),
		"semesters": _semesters(state),
		"campus": _campus(state),
	}


## 누적 학점. **아직 한 학기도 안 끝났으면 숫자를 안 만든다** —
## 0.00으로 채우면 시험도 안 본 신입생이 낙제로 보인다
static func _gpa(school: Dictionary) -> Dictionary:
	var terms: int = int(school.get("gpa_terms", 0))
	if terms <= 0:
		return {"has": false, "label": "아직 학점이 없습니다", "value": 0.0,
			"graduates": false, "note": ""}
	var gpa: float = float(school.get("gpa", 0.0))
	var need: float = float(Academics.university().get("graduation_gpa", 2.0))
	var ok: bool = Academics.can_graduate(school)
	return {
		"has": true,
		"value": gpa,
		"label": "%.2f / %.1f" % [gpa,
			float(Academics.university().get("gpa_max", 4.5))],
		"graduates": ok,
		# 졸업 자격이 이 화면의 뜻이다 — 학점 자체는 수단이다
		"note": "졸업 자격 충족" if ok else "졸업까지 %.2f 부족" % (need - gpa),
	}


static func _warning(school: Dictionary) -> Dictionary:
	var level: int = int(school.get("warning_level", 0))
	var eff: Dictionary = Academics.warning_effect(level)
	return {
		"level": level,
		"label": String(eff.get("label", "정상")),
		"blocked": bool(eff.get("blocks_games", false)),
		# 경고가 훈련을 깎는다 — 그게 학사의 무게다. 몇 %인지 규칙에서 낸다
		"training_label": "훈련 효율 %d%%" % int(roundf(
			Academics.training_mod(school) * 100.0)),
	}


static func _exam(week: int) -> Dictionary:
	var n: Dictionary = Academics.next_exam(week)
	var left: int = int(n["weeks_left"])
	return {
		"label": String(EXAM_LABEL.get(String(n["exam"]), String(n["exam"]))),
		"weeks_left": left,
		"line": "이번 주가 %s입니다" % EXAM_LABEL.get(String(n["exam"]), "") \
			if left == 0 else "%s까지 D-%d주" % [
				EXAM_LABEL.get(String(n["exam"]), ""), left],
	}


## ⚠ **전공은 대학에서만 고른다.** 고교생에게 띄우면 아직 갈 수도 없는
## 학교의 전공을 고르게 된다 — 02도 `isUniv`로 막았다
static func _major(school: Dictionary, league: String) -> Dictionary:
	var name: String = String(school.get("major", ""))
	var options: Array = []
	for m in Academics.majors():
		options.append({"name": String(m), "desc": _major_desc(String(m))})
	return {
		"picked": not name.is_empty(),
		"name": name if not name.is_empty() else "미선택",
		"selectable": league == "LEAGUE_UNIVERSITY" and name.is_empty(),
		"hint": MAJOR_HINT,
		"effect": _major_desc(name) if not name.is_empty() else "",
		"options": options,
	}


## 전공 효과를 **규칙 파일에서 만든다** — 옮겨 적으면 표가 둘이 된다
static func _major_desc(name: String) -> String:
	var m: Dictionary = Academics.major_of(name)
	if m.is_empty():
		return ""
	var parts: Array = []
	var train: float = float(m.get("training_eff_bonus", 0.0))
	if train != 0.0:
		parts.append("훈련 %+d%%" % int(roundf(train * 100.0)))
	var gpa: float = float(m.get("gpa_gain_mult", 1.0))
	if gpa != 1.0:
		parts.append("학점 ×%.1f" % gpa)
	var inj: float = float(m.get("injury_mod", 1.0))
	if inj != 1.0:
		parts.append("부상 %+d%%" % int(roundf((inj - 1.0) * 100.0)))
	return " · ".join(parts)


## ⚠ **학점과 훈련을 나란히 보여준다.** 대가가 안 보이면 늘 집중이다
static func _study(school: Dictionary) -> Dictionary:
	var current: String = String(school.get("study_mode", "normal"))
	var options: Array = []
	for id in MODE_ORDER:
		var mode: String = String(id)
		options.append({
			"id": mode,
			"name": String(MODE_LABEL.get(mode, mode)),
			"current": mode == current,
			"effect": "학점 %.2f · 훈련 %d%%" % [Academics.study_quality(mode),
				int(roundf(Academics.study_training(mode) * 100.0))],
		})
	return {
		"current": current,
		"current_label": String(MODE_LABEL.get(current, current)),
		"hint": "고른 방식은 다음 주부터 적용됩니다.",
		"options": options,
	}


## 지나간 학기. **최근이 위다** — 마지막 시험이 제일 궁금하다
static func _semesters(state: Dictionary) -> Array:
	var out: Array = []
	for e in state.get("academic_log", []):
		out.push_front({
			# ⚠ **연도는 기록이 갖고 있어야 한다.** 지금 연도를 붙이면
			# 3년 전 중간고사가 올해 것으로 뜬다
			"title": "%d년 %s" % [int(e.get("year", 0)),
				EXAM_LABEL.get(String(e.get("exam", "")), "")],
			"gpa_label": "%.2f" % float(e.get("gpa", 0.0)),
			"label": String(e.get("label", "")),
			"warned": int(e.get("warning_level", 0)) > 0,
		})
	return out


const CAMPUS_LABEL: Dictionary = {
	"showcase": "쇼케이스", "allstar": "대학 올스타",
}


## 대학 무대. **안 뽑힌 것도 결과다** — 빈칸으로 두면 무대가 없는 것처럼 보인다
static func _campus(state: Dictionary) -> Array:
	var out: Array = []
	for e in state.get("campus_log", []):
		var kind: String = String(e.get("kind", ""))
		out.push_front({
			"title": String(CAMPUS_LABEL.get(kind, kind)),
			"line": "참가" if bool(e.get("selected", false)) else "미선발",
			"selected": bool(e.get("selected", false)),
		})
	return out
