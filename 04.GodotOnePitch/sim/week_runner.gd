extends RefCounted
class_name WeekRunner

## 한 주의 처리 — 성장·학사·부상·승강·진로·재정·훈련·업적·관계. P-7.
##
## 원본: `apps/ui/src/shared/usecases/advanceWeek.ts`
##
## ⚠ **이건 원래 `app_root`에 있었다.** 화면 스크립트 안에 있어서
## **헤드리스가 커리어를 끝까지 못 굴렸다** — 계측이 관계를 재려 하면
## 동료·라이벌이 0으로 나오고(경기가 안 돌아 `team_played`가 없다), 승강을
## 재려 하면 상시 경로가 0건이었다(부상·성적이 안 쌓인다). 02는 `advanceWeek`가
## usecase라 스크립트가 그대로 불렀는데 04는 그 자리가 화면이었다.
##
## ⚠ **화면이 부르는 것과 계측이 부르는 것이 같은 함수여야 한다.** 계측이
## 이 순서를 베끼면 그건 두 번째 정본이고, 언젠가 갈린다.
##
## ⚠ **시간 축만 일 단위다.** 성장·훈련·재정·관계는 02 그대로 7일마다 돈다 —
## 밸런스를 안 건드려야 02 실측값과 대조할 수 있다.
##
## 프레임 쪼개기는 여기 없다. 그건 화면 몫이라 `ui/day_runner.gd`에 남긴다 —
## 계측은 프레임이 없고, 여기에 두면 헤드리스가 다시 못 부른다.


## 학적이 있는 리그. **프로에는 학사가 없다** — 02는 프로 선수에게도 주간
## 학업이 돌아 훈련 효율에 곱해지고 로그까지 남았다
const SCHOOL_LEAGUES: Array[String] = [
	"LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY",
]


## 코치가 훈련 효율에 더하는 몫 — F-2c. **02 값 그대로**
## (`advanceWeek.ts:302-303`).
##
## ⚠ **능력치와 관계를 더한 뒤 한 번에 자른다.** 02 주석 그대로 —
## "각각 clamp하면 상한이 두 배가 된다".
##
## ⚠ **04엔 이 clamp가 아예 없었다.** 코치 능력치 몫만 그대로 더했고
## (`factor_of` 범위가 ±0.1875) 관계 몫은 **소비처가 0건이었다.**
## 02를 덜 옮긴 자리다.
##
## `training_factor`는 `Staff.mods_of(...)["training"]`(1.0이 중립),
## `relation_bonus`는 `Relationship.effects`의 `training_bonus`다
const COACH_BONUS_MIN: float = -0.15
const COACH_BONUS_MAX: float = 0.25


static func coach_efficiency(training_factor: float,
		relation_bonus: float) -> float:
	return clampf(training_factor - 1.0 + relation_bonus,
		COACH_BONUS_MIN, COACH_BONUS_MAX)


## 이번 주 1순위 훈련을 봐 주는 코치의 전문분야 — F-2c.
##
## ⚠ **매핑은 훈련 어휘(`focus`)로 한다.** `training_area` 표의 키가
## `velocity`·`batting` 같은 어휘이지 `TRN_VEL` 같은 프로그램 id가 아니다 —
## id를 그대로 넘기면 **표에 없어서 늘 빈 문자열이 되고, 그러면 어느 코치도
## 안 걸린다.** 실제로 그렇게 짰다가 검사가 잡았다.
##
## 계획이 없거나 표에 없는 어휘면 `""`다 — 그 주는 코치 관계가 0이다.
##
## ⚠ **빈 id를 따로 막지 않는다.** 아래 루프가 못 찾고 `""`를 주므로
## 결과가 같다 — 막는 줄을 두면 **절대 안 걸리는 죽은 가드**가 된다
## (변이가 등가로 나와서 잡았다)
static func primary_coach_area(state: Dictionary) -> String:
	var id: String = String(state.get("training_plan", {}).get("primary", ""))
	for prog in Training.programs():
		if String(prog.get("id", "")) == id:
			return Relationship.training_area_of(String(prog.get("focus", "")))
	return ""


## 여러 주를 한 번에. **어느 날이었는지는 `DayEngine`이 안다** — 여기서
## 세면 그게 두 번째 정본이 된다.
##
## ⚠ **도착한 날짜로 N번 돌리면 같은 주를 N번 사는 것**이 된다. NPC가
## 같은 난수·같은 성적 창을 N번 받아서 하루씩 간 것과 결과가 달라진다
static func run_weeks(state: Dictionary, weeks: int) -> int:
	var passes: int = 0
	for boundary in DayEngine.week_end_days(int(state.get("day", 1)), weeks):
		run(state, boundary)
		passes += 1
	return passes


## 한 주. `at_day`는 **방금 끝난 주의 마지막 날**이다
static func run(state: Dictionary, at_day: int = -1) -> void:
	# NPC는 계획 없이 자기 환경대로 자란다 — 주인공만 매주 크면 몇 시즌
	# 뒤에 세계에서 혼자 뛰어오른다
	NpcGrowth.run(state, at_day)

	# 캠퍼스 이벤트 — 쇼케이스(32주)·올스타(34주).
	#
	# ⚠ **주인공이 없어도 돈다.** 대학 무대는 세계의 일이고, 주인공이 안
	# 불렸다는 것도 결과다 — 아래 `p.is_empty()` 뒤로 내리면 그게 사라진다
	CampusRunner.run(state, at_day)

	# 국가대표 — 발탁·차출·결과·면제.
	#
	# ⚠ **주인공이 없어도 돈다.** 세계의 일이고, 내가 안 뽑혔다는 것도
	# 결과다 — 아래 `p.is_empty()` 뒤로 내리면 그게 사라진다
	NationalRunner.run(state, at_day)

	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty():
		return

	# 학사 — **학교에 다니는 동안만.** 시험 주에 학기가 확정되고, 경고가
	# 훈련 효율을 깎는다
	var academic_eff: float = apply_academics(state, p, at_day)

	# 부상 — **훈련보다 먼저다.** 이번 주 부상 배수가 훈련 효율에 걸리고,
	# 판정이 보는 피로는 **이 주에 들어설 때의 피로**여야 한다. 뒤로 미루면
	# 이번 주 훈련 부하가 이번 주 부상 판정에 들어가 한 주 앞당겨진다
	InjuryRunner.run(state, at_day)

	# 승강 — **부상 뒤다.** 이번 주에 다친 사람이 비운 자리를 이번 주에
	# 메워야 한다. 앞에 두면 한 주 늦게 메우고, 그동안 1군이 빈 채로 돈다
	#
	# ⚠ **이 한 줄이 없으면 승강이 통째로 안 돈다.** 판정과 값은 다 있는데
	# 부르는 곳이 검사뿐이었다 — 02는 시즌 145건인데 04는 0건이었다
	PromotionRunner.run(state, at_day)

	# 진로 — 지원이 열리고 결과가 나오고 복무가 흐르고 은퇴를 묻는다.
	#
	# ⚠ **이 한 줄이 없으면 진로 모듈 전체가 아무도 안 부르는 코드다.**
	# 02가 겪은 결함 대부분이 그 자리였다 — 주인공은 지명될 수 없었고
	# 프로 콘텐츠 전부가 도달 불가였다.
	#
	# ⚠ **부상보다 뒤다.** 수술급 부상이 난 그 주에 은퇴를 묻는데,
	# 앞에 두면 이번 주 부상을 다음 주에 보게 된다
	CareerRunner.run(state, at_day)

	# 재정 — **자산이 실제로 움직인다.**
	#
	# ⚠ **화면이 자기 식으로 계산하면 안 된다.** 02는 컴포넌트 안에서
	# OVR·사기로 수입을 즉석 계산해 **자산과 무관한 숫자**를 보여줬다
	apply_finance(state, p, at_day)

	# ⚠ **훈련 계획이 비어 있어도 돈다.** 주간 자동 회복(−5)이 계획과 무관하게
	# 붙기 때문이다 — 건너뛰면 아무 훈련도 안 짠 주에 피로가 안 빠진다.
	#
	# ⚠ **`TrainingGrowth`가 정본이다.** 예전엔 `Training.plan_load`만 불러
	# **피로만 움직이고 능력치는 안 올랐다** — 훈련 화면에서 뭘 짜든 결과가
	# 같았다. 피로·컨디션도 이 안에서 같은 함수로 나온다
	var before_ovr: float = Contract.core_ovr(p)

	# ⚠ **다치면 훈련이 안 된다** — 값만 두고 아무도 안 읽으면 수술 중에도
	# 평소처럼 큰다. **구독한 개인 트레이닝도 여기 얹힌다** — 안 이으면
	# 매주 돈만 나가고 아무 일도 안 일어난다
	#
	# ⚠ **코치가 훈련 효율에 걸린다.** 스태프가 없으면 중립(1.0)이라
	# 지금까지와 같게 돈다 — 좋은 코치를 데려온 팀이 실제로 더 큰다.
	# 팀마다 다른 유일한 축이라 안 이으면 스태프가 장식이 된다
	# ⚠ **내 자리의 코치를 먼저 본다.** 투수에게는 투수 코치가 정본이다 —
	# 없으면 팀 코치 평균으로 떨어진다
	var staff: Dictionary = Staff.mods_of(state.get("world", {}),
		String(p.get("team_id", "")), Staff.specialty_for(
			String(p.get("player_type", "pitcher"))))
	#
	# ⚠ **곱하지 않고 더한다.** 04는 훈련 효율을 덧셈으로 합치는 구조고,
	# 곱하면 부상 배수까지 같이 늘어난다. 그리고 중립 코치(50)면 더하는 값이
	# 정확히 0이라 **지금까지의 수가 그대로 남는다** — 밸런스가 동결이라
	# 그게 중요하다
	#
	# ⚠ **학사도 여기 걸린다.** `Academics.training_mod`는 만들어 놓고
	# **아무도 안 불렀다** — 경고를 받아도 훈련은 그대로였고, 그러면
	# 학사가 경기 출전 정지 하나뿐인 시스템이 된다. 학업 모드의 대가도
	# 같이 걸린다 — 안 걸면 집중 수업이 학점만 올리는 공짜 선택이 된다.
	# **학교에 다닐 때만 0이 아니다**
	# ⚠ **코치 몫은 능력치와 관계를 더한 뒤 한 번에 자른다** (F-2c).
	# 02 주석 그대로: "각각 clamp하면 상한이 두 배가 된다".
	# 관계 쪽(`training_bonus`)은 만들어만 놓고 **소비처가 0건이었다**
	var coach: float = coach_efficiency(float(staff["training"]),
		float(RelationshipRunner.effects_of(state,
			primary_coach_area(state)).get("training_bonus", 0.0)))

	var efficiency: float = float(p.get("injury_eff_mod", 1.0)) \
		+ Finance.total_training_bonus(
			state.get("training_subscriptions", []),
			float(p.get("team_facility", 1.0))) \
		+ coach \
		+ academic_eff
	var out: Dictionary = TrainingGrowth.calc(p,
		state.get("training_plan", {}),
		Training.programs(), efficiency)

	p["pitching"] = out["pitching"]
	p["batting"] = out["batting"]
	p["pitching_xp"] = out["pitching_xp"]
	p["batting_xp"] = out["batting_xp"]
	p["fatigue"] = clampf(p.get("fatigue", 0.0) + float(out["fatigue_delta"]),
		0.0, 100.0)
	p["condition"] = clampf(p.get("condition", 100.0)
		+ float(out["condition_delta"]), 0.0, 100.0)

	# 구종 숙련도 진행 — 100을 넘으면 배우거나 등급이 오른다.
	#
	# ⚠ **예전엔 `p["pitch_dev"]`라는 키에 쌓기만 했다.** 읽는 곳이 0건이었고
	# 어느 구종을 배우는 중인지도 없어서, 얼마를 쌓아도 아무 일이 안 일어났다 —
	# 소비처(`pitch_step`·`training_growth`)는 다 있는데 생산처가 없었다
	var learned: Array = PitchDev.advance(p, float(out.get("pitch_dev_gain", 0.0)))
	if not learned.is_empty():
		out["logs"] = (out["logs"] as Array) + learned

	# ⚠ **훈련한 주를 센다.** 아래 `training_log`로는 못 센다 — 그건
	# "뭔가 오른 주"만 남아서, 능력치가 안 오른 주는 줄이 없다
	if not state.get("training_plan", {}).is_empty():
		p["training_weeks"] = int(p.get("training_weeks", 0)) + 1

	# 무엇이 올랐는지 — 소식이 이걸 읽는다
	if not out["logs"].is_empty():
		var log: Array = state.get("training_log", [])
		log.append({"day": int(state.get("day", 0)), "gains": out["logs"]})
		state["training_log"] = log

	# 업적 — **훈련 뒤다.** 이번 주 훈련까지 세고 나서 판정한다.
	#
	# ⚠ **주 경계마다 돈다.** 02도 그랬다(`advanceWeek`) — 화면을 열어야만
	# 달성되면 자동 진행에서는 은퇴할 때까지 하나도 안 열린다
	Achievements.check(state, at_day)

	# 관계도 — **훈련 뒤다.** 성장분(`ovr_delta`)이 감독·코치 관계에 걸린다
	#
	# ⚠ **02는 여기서 주 인덱스를 하나 어긋나게 읽어 결과가 영영 `null`이었고
	# 관계가 전 커리어에 걸쳐 한 번도 안 움직였다.** `at_day`는 방금 끝난 주의
	# 마지막 날이다 — 여기서 자기 손으로 세지 않는다
	RelationshipRunner.run(state, at_day, Contract.core_ovr(p) - before_ovr)

	# 코치 리포트 — **선택지가 든 소식을 만드는 유일한 자리** (F-8).
	#
	# ⚠ **04엔 `decision`이 든 소식을 만드는 곳이 없었다.** 채우는 건
	# `fixtures.gd`뿐인데 읽는 쪽은 셋이다 — `DayEngine.stop_reason`이
	# 진행을 막고, `AutoAdvance.pick_choice`가 대신 답하고, `NewsVm`이
	# 걸러 낸다. **셋 다 실제 게임에서 한 번도 안 돌았다.**
	#
	# ⚠ **맨 뒤다.** 이번 주 훈련·경기·관계가 다 끝난 뒤의 상태를 보고
	# 권고해야 한다 — 앞에 두면 지난주 몸 상태로 조언한다
	CoachReport.push(state, Calendar.week_of(at_day), at_day)


## 한 주의 재정. **자산이 실제로 움직인다** — 안 이으면 수입·지출이
## 화면에만 있고 자산은 시작값 그대로다
static func apply_finance(state: Dictionary, p: Dictionary,
		at_day: int) -> Dictionary:
	var out: Dictionary = Finance.weekly({
		"career_stage": String(p.get("career_stage",
			Finance.PRO_STAGES[0] if Contract.has_contract(
				String(p.get("league_id", ""))) else "highschool")),
		"salary": int(p.get("salary", 0)),
		# ⚠ **계약 목록이 정본이다.** 합계를 따로 들고 있으면 계약이 끝난
		# 해에 수입만 그대로 남는다
		"sponsor_annual": Finance.sponsor_annual(p.get("sponsors", []),
			int(state.get("season_year", 0))),
		"subscriptions": state.get("training_subscriptions", []),
		"treatment_weekly": int(p.get("treatment_weekly", 0)),
	})
	p["money"] = int(p.get("money", 0)) + int(out["net_weekly"])

	# 무슨 돈이 오갔는지 — 재정 화면이 이걸 읽는다
	var log: Array = state.get("finance_log", [])
	log.append({"day": at_day, "net": int(out["net_weekly"]),
		"gross": int(out["gross_weekly"]), "expense": int(out["expense_weekly"]),
		"money": int(p["money"])})
	state["finance_log"] = log
	return out


## 한 주의 학사. **학교에 다니는 동안만 돈다.** 이번 주 훈련 효율에
## 더할 값을 돌려준다 — 학적이 없으면 0이다.
##
## ⚠ **시험 주에 학기를 확정한다.** 02는 대학 시험 트리거가 없어 학기
## 확정이 죽은 코드였다 — 학점이 영영 안 매겨졌다
##
## ⚠ **프로에는 학사가 없다.** 02는 프로 선수에게도 주간 학업이 돌아
## `efficiencyMod`가 훈련에 곱해지고 "[학업] 주간 효율 85%" 로그까지
## 남았다 — 학적이 없는 단계에서 학업 상태는 뜻이 없다
static func apply_academics(state: Dictionary, p: Dictionary,
		at_day: int) -> float:
	if not SCHOOL_LEAGUES.has(String(p.get("league_id", ""))):
		return 0.0

	var school: Dictionary = state.get("school", {})
	if school.is_empty():
		school = {"major": "", "study_mode": "normal", "warning_level": 0}
	Academics.study_week(school)

	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	var exam: String = Academics.exam_at_day(day)
	if not exam.is_empty():
		var r: Dictionary = Academics.close_semester(school)
		# 학사 경고는 소식으로 알린다 — 조용히 훈련만 깎이면 원인을 모른다
		var log: Array = state.get("academic_log", [])
		# ⚠ **연도를 같이 남긴다.** 학사 화면이 학기를 줄 세우는데, 연도가
		# 없으면 3년 전 중간고사가 올해 것으로 뜬다
		log.append({"day": day, "year": int(state.get("season_year", 0)),
			"exam": exam, "gpa": r["gpa"],
			"warning_level": r["warning_level"], "label": r["label"]})
		state["academic_log"] = log
		# ⚠ **출전 정지가 경기 판정에 닿아야 한다.** 안 이으면 경고가
		# 훈련만 깎고 경기에는 아무 일도 안 일어난다
		p["eligibility_blocked"] = bool(r["blocked"])

	state["school"] = school
	return Academics.training_delta(school)
