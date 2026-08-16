extends RefCounted
class_name RelationsMeasure

## 관계 대조 계측 — 02 `scripts/measure-relations.cjs`가 찍는 **세 줄**을 낸다.
##
## ① 종류별 인원 · 값 범위 · 평균 (teammate / rival / coach / manager / owner)
## ② 라벨 분포
## ③ 중립을 벗어난 인원
##
## **진짜 커리어를 굴린다** — `CareerRunner`로 주를 넘기고 주 경계마다
## `RelationshipRunner.run`을 부른다. `app_root.gd:619`가 부르는 그대로다.
##
## ⚠ **성장분을 넘겨야 한다.** 감독·코치 관계가 그걸 먹는다 — 0으로 두면
## 두 관계가 안 움직이고 "04는 코치 관계가 없다"로 잘못 읽힌다
##
## ⚠ **여기서 판정하지 않는다.** 02 값과 나란히 놓는 건 사람이 한다


static func _stat(vals: Array) -> String:
	if vals.is_empty():
		return "-"
	var lo: int = int(vals[0])
	var hi: int = int(vals[0])
	var sum: float = 0.0
	for v in vals:
		lo = mini(lo, int(v))
		hi = maxi(hi, int(v))
		sum += float(v)
	return "값 %d ~ %d (평균 %.1f)" % [lo, hi, sum / float(vals.size())]


func _one(seed_value: int, years: int) -> Dictionary:
	var s: Dictionary = World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var p: Dictionary = s["protagonist"]
	p["career_stage"] = "highschool"
	p["grade"] = 1
	s["school"] = {"gpa": 3.2, "major": "체육교육"}

	# ⚠ **훈련 계획을 세워야 한다.** 안 세우면 매주 `training_skip`이 걸려
	# 코치 −2 · 감독 −1이 191주 쌓인다 — 처음에 안 세우고 재서 코치 평균이
	# **−81.5**로 바닥에 붙었다(02는 +29). 04 결함이 아니라 fixture가 빈 것이다
	s["training_plan"] = {"primary": "velocity", "secondary": "control",
		"secondary2": "stamina"}

	var year: int = 2027
	for y in years:
		s["season_year"] = year
		for w in range(1, Calendar.WEEKS_PER_SEASON + 1):
			var day: int = w * Calendar.DAYS_PER_WEEK
			s["day"] = day
			var before: float = Contract.core_ovr(p)
			CareerRunner.run(s, day)
			# 진로 물음이 떠 있으면 지명을 고른다 — 안 고르면 커리어가
			# 고교에서 멈춰 프로 관계(구단주)가 영영 안 생긴다
			if Pending.has(s, "career_choice_hub"):
				CareerDecision.submit_applications(s, {"draft": true,
					"university_choices": ["TEAM_UNIV_BAEKJE"]})
			# ⚠ `app_root.gd:619`와 같은 자리·같은 인자
			RelationshipRunner.run(s, day, Contract.core_ovr(p) - before)
		SeasonRunner.run(s)
		year += 1
	return s


func run(log_line: Callable, _fail: Callable, seed_value: int,
		years: int = 4) -> int:
	var s: Dictionary = _one(seed_value, years)
	log_line.call("  씨앗 %d · %d해 굴림 (%d년까지)"
		% [seed_value, years, 2027 + years - 1])

	var by_kind: Dictionary = {}
	var by_label: Dictionary = {}
	var off_neutral: int = 0
	for row in RelationshipRunner.rows_of(s):
		var kind: String = String(row.get("kind", "?"))
		var v: int = int(row.get("value", 0))
		if not by_kind.has(kind):
			by_kind[kind] = []
		by_kind[kind].append(v)
		var label: String = Relationship.label_of(v)
		by_label[label] = int(by_label.get(label, 0)) + 1
		if label != Relationship.NEUTRAL_LABEL:
			off_neutral += 1

	log_line.call("")
	# 02와 같은 차례로 찍는다 — 라벨이 다르면 나란히 못 놓는다
	for kind in [Relationship.KIND_TEAMMATE, Relationship.KIND_RIVAL,
			Relationship.KIND_COACH, Relationship.KIND_MANAGER,
			Relationship.KIND_OWNER]:
		var vals: Array = by_kind.get(kind, [])
		log_line.call("    %-10s %-6s %s"
			% [kind, "%d명" % vals.size(), _stat(vals)])
	for kind in by_kind:
		if kind not in [Relationship.KIND_TEAMMATE, Relationship.KIND_RIVAL,
				Relationship.KIND_COACH, Relationship.KIND_MANAGER,
				Relationship.KIND_OWNER]:
			log_line.call("    %-10s %-6s %s  (02에 없는 종류)"
				% [kind, "%d명" % (by_kind[kind] as Array).size(),
					_stat(by_kind[kind])])

	log_line.call("  라벨 %s" % JSON.stringify(by_label))
	log_line.call("  %d명이 중립을 벗어났다." % off_neutral)
	return 0
