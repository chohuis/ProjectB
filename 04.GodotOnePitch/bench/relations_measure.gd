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


## 코치가 오르는 두 조건이 몇 번 걸렸나
var _grew_weeks: int = 0
var _area_weeks: int = 0
var _areas: Dictionary = {}


static func _growth_threshold() -> float:
	return float(Relationship.rules().get("weekly", {})
		.get("growth_threshold", 1.0))


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


## 오늘까지의 미처리 주인공 경기를 돌린다 — 사용자가 '자동'을 누른 자리
static func _play_my_pending(state: Dictionary) -> void:
	var day: int = int(state.get("day", 0))
	for g in state.get("schedule", []):
		if int(g.get("day", -1)) > day:
			continue
		if not g.get("is_protagonist_game", false):
			continue
		if g.get("result", null) != null:
			continue
		GameSim.play(g, state)


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
	# ⚠ **프로그램 id를 넣는다.** 처음엔 focus 이름("velocity")을 넣었는데
	# `Training.program()`이 못 찾아 **훈련이 통째로 안 돌았다** — 성장 임계를
	# 넘는 주 0, 훈련 영역이 정해진 주 0이라 코치가 안 올랐다.
	# 계획이 비어 보이지 않아서 `training_skip`도 안 걸리는, 조용한 자리다
	s["training_plan"] = {"primary": "TRN_VEL", "secondary": "TRN_CTRL_CMD",
		"secondary2": ""}

	# ⚠ **주간 처리를 여기서 다시 짜지 않는다.** `WeekRunner.run`이 화면과
	# 같은 함수다 — 계측이 순서를 베끼면 그게 두 번째 정본이고 언젠가 갈린다.
	# 예전엔 `CareerRunner`와 `RelationshipRunner`만 골라 불렀는데, 그러면
	# 훈련·부상·승강이 빠져서 **관계가 움직일 맥락 자체가 안 생겼다**
	var year: int = 2027
	for y in years:
		s["season_year"] = year
		for w in range(1, Calendar.WEEKS_PER_SEASON + 1):
			var day: int = w * Calendar.DAYS_PER_WEEK
			# 경기를 실제로 돌린다 — 동료·라이벌은 `team_played`·`won`을
			# 읽으므로 경기가 없으면 영영 0이다
			# ⚠ **등판일에는 진행이 멈춘다**(`DayEngine.stop_reason`). 화면은
			# 거기서 경기 화면을 띄우고 사용자가 던지거나 '자동'을 누른다 —
			# 계측엔 사용자가 없으니 **그 경기를 자동으로 돌리고 계속 간다.**
			# 안 그러면 주인공 경기가 영영 `result: null`로 남아 **등판이
			# 0경기**가 되고, 라이벌·개인 성적이 통째로 안 생긴다
			var out: Dictionary = DayEngine.advance_to(s, Calendar.DAYS_PER_WEEK)
			for g in out.get("games_today", []):
				GameSim.play(g, out)
			_play_my_pending(out)
			out.erase("games_today")
			out.erase("weeks_crossed")
			s = out
			s["day"] = day
			# 진로 물음이 떠 있으면 지명을 고른다 — 안 고르면 커리어가
			# 고교에서 멈춰 프로 관계(구단주)가 영영 안 생긴다
			if Pending.has(s, "career_choice_hub"):
				CareerDecision.submit_applications(s, {"draft": true,
					"university_choices": ["TEAM_UNIV_BAEKJE"]})
			# ⚠ **입력을 센다.** 코치는 담당 영역 훈련과 성장으로만 오른다 —
			# 산식을 의심하기 전에 그 둘이 몇 번 걸리는지 본다.
			# `WeekRunner` **앞**에서 재야 그 주의 성장분이 잡힌다
			var before_ovr: float = Contract.core_ovr(s["protagonist"])
			var area: String = RelationshipRunner.training_area_of(s)
			WeekRunner.run(s, day)
			var delta: float = Contract.core_ovr(s["protagonist"]) - before_ovr
			if delta >= _growth_threshold():
				_grew_weeks += 1
			if not area.is_empty():
				_area_weeks += 1
				_areas[area] = int(_areas.get(area, 0)) + 1
		SeasonRunner.run(s)
		year += 1
	return s


func run(log_line: Callable, _fail: Callable, seed_value: int,
		years: int = 4) -> int:
	var s: Dictionary = _one(seed_value, years)
	log_line.call("  씨앗 %d · %d해 굴림 (%d년까지)"
		% [seed_value, years, 2027 + years - 1])

	# ⚠ **입력이 있는지부터 본다.** 라이벌은 내가 던진 경기에서만 생긴다 —
	# 등판이 0이면 관계 산식이 아니라 등판 경로를 봐야 한다
	var me: String = String(s.get("protagonist", {}).get("id", ""))
	var appearances: int = 0
	var opponents: int = 0
	for g in s.get("schedule", []):
		var result = g.get("result", null)
		if result == null:
			continue
		var mine: bool = false
		var others: int = 0
		for line in result.get("player_lines", []):
			if String(line.get("role", "")) != "pitcher":
				continue
			if String(line.get("player_id", "")) == me:
				mine = true
			else:
				others += 1
		if mine:
			appearances += 1
			opponents += others
	log_line.call("  주인공 등판 %d경기 · 그 경기의 상대 투수 줄 %d개"
		% [appearances, opponents])
	var area_line: String = ""
	for a in _areas:
		area_line += "%s %d · " % [a, _areas[a]]
	log_line.call("  성장 임계(%.0f) 넘은 주 %d · 훈련 영역이 정해진 주 %d  [%s]"
		% [_growth_threshold(), _grew_weeks, _area_weeks,
			area_line.trim_suffix(" · ")])

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
