extends RefCounted
class_name CareerMeasure

## 진로를 **진짜 세계로** 굴려 본다 — B-6 계측.
##
## 검사는 한 갈래씩 본다. "고3 졸업반 100명이 실제로 어디로 가나"는
## 굴려야 보인다 — 02가 겪은 결함(주인공이 애초에 지명될 수 없었다)이
## 딱 이런 계측으로만 보이는 종류다.
##
## ⚠ **여기서 답을 고르는 건 계측이지 게임이 아니다.** 실제로는 사용자가
## 누른다. 여기서는 "지명 > 진학 > 독립" 순으로 고르는 사람을 가정한다 —
## B-11 자동 진행이 쓸 규칙과 같은 순서다.


func run(log_line: Callable, fail: Callable, careers: int = 60,
		seed_value: int = 20270101) -> int:
	log_line.call("졸업반 진로 계측 — %d커리어 · 씨앗 %d" % [careers, seed_value])
	log_line.call("")

	var went: Dictionary = {}
	var rounds: Array = []
	var bonuses: Array = []
	var drafted: int = 0
	var applied_univ: int = 0
	var passed_univ: int = 0

	for i in range(careers):
		var out: Dictionary = _one(seed_value + i * 101)
		var path: String = String(out["path"])
		went[path] = int(went.get(path, 0)) + 1
		if out.get("drafted", false):
			drafted += 1
			rounds.append(int(out["round"]))
			bonuses.append(int(out["signing_bonus"]))
		applied_univ += 1
		if out.get("university_passed", 0) > 0:
			passed_univ += 1

	var keys: Array = went.keys()
	keys.sort()
	log_line.call("진로 분포")
	for k in keys:
		log_line.call("  %-12s %3d명  (%.0f%%)"
			% [k, went[k], float(went[k]) / float(careers) * 100.0])

	log_line.call("")
	log_line.call("지명 %d명 (%.0f%%) · 대학 합격 %d/%d"
		% [drafted, float(drafted) / float(careers) * 100.0, passed_univ, applied_univ])
	if not rounds.is_empty():
		log_line.call("지명 라운드 중앙 %d · 최고 %d · 최저 %d"
			% [_median(rounds), rounds.min(), rounds.max()])
		log_line.call("계약금 중앙 %d만원 · 최고 %d만원"
			% [_median(bonuses), bonuses.max()])

	# ⚠ **하나도 지명이 안 되면 배선이 끊긴 것이다.** 02가 정확히 그 상태로
	# 커리어 내내 돌았다 — 지명 결과를 true로 만드는 곳이 아예 없었다
	if drafted == 0:
		fail.call("%d커리어에 지명이 0명이다 — 주인공이 프로에 갈 수 없다" % careers)
	if went.get("nowhere", 0) == careers:
		fail.call("전원이 갈 곳이 없다 — 입시 판정이 안 돈다")
	return 0


## 한 커리어. 졸업반 한 해만 굴린다
func _one(seed_value: int) -> Dictionary:
	var s: Dictionary = World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var p: Dictionary = s["protagonist"]
	p["career_stage"] = "highschool"
	p["grade"] = CareerRunner.HS_FINAL_GRADE
	s["school"] = {"gpa": 3.2, "major": "체육교육"}

	var out: Dictionary = {"path": "nowhere", "drafted": false,
		"university_passed": 0}
	for w in range(1, Calendar.WEEKS_PER_SEASON + 1):
		var day: int = w * Calendar.DAYS_PER_WEEK
		s["day"] = day
		CareerRunner.run(s, day)
		_answer(s, day, out)
	return out


## 사용자가 누르는 자리. **지명 > 진학 > 독립** 순으로 고른다
func _answer(s: Dictionary, day: int, out: Dictionary) -> void:
	if Pending.has(s, "career_choice_hub"):
		CareerDecision.submit_applications(s, {
			"draft": true,
			# 상향 하나 · 안전 하나 — 02의 "3지망" 구조를 그대로 쓴다
			"university_choices": ["TEAM_UNIV_BAEKJE", "TEAM_UNIV_ASAN",
				"TEAM_UNIV_NAMAK"],
			"independent_choices": ["TEAM_IND_DAEJEON_BLAZE",
				"TEAM_IND_SEOUL_COMETS"],
		})
		return

	if Pending.has(s, "career_results"):
		var r: Dictionary = CareerDecision.of(s).get("results", {})
		out["drafted"] = bool(r.get("drafted", false))
		out["round"] = int(r.get("draft_round", 0))
		out["university_passed"] = r.get("university_passed", []).size()
		CareerDecision.confirm_results(s)
		return

	if Pending.has(s, "career_choice"):
		var r2: Dictionary = CareerDecision.of(s).get("results", {})
		if bool(r2.get("drafted", false)):
			CareerDecision.choose_draft(s)
		elif not r2.get("university_passed", []).is_empty():
			CareerDecision.choose_school_or_independent(s, "university",
				String(r2["university_passed"][0]))
			out["path"] = "university"
		elif not r2.get("independent_passed", []).is_empty():
			CareerDecision.choose_school_or_independent(s, "independent",
				String(r2["independent_passed"][0]))
			out["path"] = "independent"
		else:
			# 갈 곳이 없다 — 현역 입대
			Military.enlist(s, "general", day)
			out["path"] = "army"
		return

	if Pending.has(s, "draft_notification"):
		var a: Dictionary = Pending.first(s, "draft_notification")
		out["signing_bonus"] = int(a.get("signing_bonus", 0))
		CareerDecision.accept_draft_offer(s, a)
		out["path"] = "draft"
		return

	# 독립 입단 제안은 그 자리에서 받는다
	if Pending.has(s, "salary_negotiation"):
		var n: Dictionary = Pending.first(s, "salary_negotiation")
		ContractDecision.sign_negotiated(s, n, {
			"team_id": n["team_id"], "league_id": n["league_id"],
			"salary": int(n["offered_salary"]),
			"duration_years": int(n["duration_years"]),
			"signing_bonus": int(n.get("signing_bonus", 0)),
		}, day)


func _median(values: Array) -> int:
	var v: Array = values.duplicate()
	v.sort()
	return int(v[v.size() / 2])
