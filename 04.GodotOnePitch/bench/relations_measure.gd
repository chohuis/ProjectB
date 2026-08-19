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
##
## ⚠ **이 숫자는 "성장량"이 아니다** (P-16b). "한 주에 core OVR이 1칸 넘게
## 오른 주"의 개수다 — 매주 0.9씩 꾸준히 오르면 여기는 **20해 내내 0**이다.
## 실제로 그 0을 "성장이 막혔다"로 읽어 P-16을 잘못 세웠다.
## **OVR 시작→끝을 같이 낸다** — 아래 `_ovr_start`·`_ovr_by_year`
var _grew_weeks: int = 0
var _area_weeks: int = 0
var _areas: Dictionary = {}
var _trace: Array[String] = []

## ⚠ **입력이 있는지부터 본다.** 라이벌은 내가 던진 경기에서만 생긴다 —
## 등판이 0이면 관계 산식이 아니라 등판 경로를 봐야 한다
var _appearances: int = 0
var _opponents: int = 0

## 🔴 **사람이 궁금한 것은 "얼마나 컸나"다** (P-16b).
## 시작 OVR과 해마다의 OVR을 그대로 낸다 — 이게 있으면 `_grew_weeks`가 0이어도
## 성장이 도는지 한눈에 갈린다
var _ovr_start: float = 0.0
var _ovr_by_year: Array[float] = []

## ⚠ **줄어드는 OVR의 원인 후보를 같이 낸다** (P-16b).
## 잠재력 천장에 붙어 있으면 성장이 0이고, 부상으로 쉰 주가 많으면 훈련이
## 통째로 빠진다 — 둘을 안 내면 "성장 산식이 이상하다"로 잘못 읽는다
var _hurt_weeks: int = 0


## 지금 일정에서 주인공 등판을 세어 누적한다. **시즌을 넘기기 전에 부른다**
func _count_appearances(s: Dictionary) -> void:
	var me: String = String(s.get("protagonist", {}).get("id", ""))
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
			_appearances += 1
			_opponents += others


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
	_ovr_start = Contract.core_ovr(p)
	p["grade"] = 1
	s["school"] = {"gpa": 3.2, "major": "체육교육"}

	# 🔴 **첫 주 계획만 넣는다** — 매주는 `AutoTraining.apply`가 갱신한다.
	# 이걸 박아만 두고 갱신을 안 걸었더니 **피로가 95를 넘어도 고강도를 계속
	# 밀어서 6해 중 247주(79%)를 부상으로 보냈다.** 그 상태의 OVR 하락을
	# "성장 산식이 이상하다"로 읽을 뻔했다 — `AutoAdvance.run`이 매 걸음
	# 부르는 것과 같은 자리다(형태 ⑦)
	#
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
			# 진로 결정 셋을 차례로 답한다 — **한 주에 하나씩 열린다.**
			#
			# ⚠ **`career_choice_hub`만 답하면 3학년에서 멈춘다.** 결과 확인과
			# 최종 선택이 남아 대기줄이 안 풀리고, 커리어가 그 자리에 선다 —
			# 실측에서 2029·2030년에 `career_results`가 떠 있었다
			if Pending.has(s, "career_choice_hub"):
				# 🔴 **화면이 내는 목록에서 고른다** (P-43b). 예전엔
				# `TEAM_UNIV_BAEKJE` 하나를 박아 뒀는데 `MAX_CHOICES`는 셋이다
				# — 하나만 넣으면 떨어질 확률이 세 배로 커지고, 실제로
				# **12해 내내 고교 3학년**인 실행이 나왔다.
				#
				# ⚠ **화면과 같은 함수로 낸다**(`DecisionVm.apply`) — 계측이
				# 제 손으로 원서를 지으면 그게 두 번째 정본이다
				# 🔴 **`build`는 대기줄의 첫 번째를 낸다**(`blocking`).
				# hub가 대기줄 뒤에 있으면 **다른 물음의 선택지**가 오고,
				# 거기에 `submit:`을 보내면 아무 일도 안 일어난다 —
				# 대기줄이 안 풀려 커리어가 그 자리에 선다.
				# **낸 것이 hub인지 확인하고 쓴다**
				var hub: Dictionary = DecisionVm.build(s)
				if String(hub.get("type", "")) != "career_choice_hub":
					# 🔴 **앞선 물음을 먼저 답한다.** `build`는 대기줄의
					# **첫 번째**를 내므로(`blocking`), hub가 뒤에 있으면
					# 다른 물음의 선택지가 온다 — 거기에 `submit:`을 보내면
					# 아무 일도 안 일어나고 **대기줄이 영영 안 풀린다.**
					# 실측에서 `draft_observe`가 앞에 있어 그랬다.
					# 확인만 하면 되는 물음이라 빈 선택으로 넘긴다
					DecisionVm.apply(s, "", day)
					continue
				# 🔴 **전력이 낮은 대학부터 고른다** (P-49). 예전엔 목록의 **앞 셋**을
				# 그대로 집었는데, 그 앞자리에 전력 5(합격 8%)가 있어 **셋 다 떨어질
				# 확률이 8%**였다 — 고정 시드라 매번 같은 자리를 뽑아 커리어가 늘
				# 병역 → 독립으로 갔다.
				#
				# **사용자는 화면에서 자격·확률을 보고 고른다**(`_hub`가 그 정보를
				# 내려고 만든 것이다) — 계측도 그렇게 고른다.
				# ⚠ **게임 값은 안 건드린다** — fixture의 선택 전략일 뿐이다
				var picks: Array = []
				var univ: Array = []
				for ch in hub.get("choices", []):
					var cid: String = String(ch.get("id", ""))
					if cid == "draft":
						picks.append(cid)
					elif cid.begins_with("university:"):
						univ.append(cid)
				univ.sort_custom(func(a, b) -> bool:
					var pa: int = int(World.team_field({}, String(a).substr(11), "power", 9))
					var pb: int = int(World.team_field({}, String(b).substr(11), "power", 9))
					return pa < pb)
				for i in mini(univ.size(), CareerDecision.MAX_CHOICES):
					picks.append(univ[i])
				if not picks.is_empty():
					DecisionVm.apply(s, "submit:" + ",".join(picks), day)
			elif Pending.has(s, "career_results"):
				CareerDecision.confirm_results(s)
			# 🔴 **여기 없는 물음은 대기줄을 막는다** (P-13). 20해를 굴렸더니
			# 주인공이 **2032년부터 15해를 대학 4학년에 멈춰** 있었다 —
			# `draft_observe`·`sports_unit_apply`·`military_enlist_ask`가
			# 계속 떠 있는데 계측이 안 답했다. 그 상태의 라이벌 0.0을
			# "라이벌이 안 큰다"로 읽을 뻔했다(형태 ⑦).
			#
			# ⚠ **화면과 같은 함수로 답한다**(`DecisionVm.apply`) — 계측이
			# 제 손으로 대기줄을 지우면 그게 두 번째 정본이다
			elif Pending.has(s, "draft_observe"):
				DecisionVm.apply(s, "", day)
			# 지명을 받으면 받는다 — 프로에 가야 프로 관계가 생긴다
			elif Pending.has(s, "draft_notification"):
				DecisionVm.apply(s, "accept", day)
			# ⚠ **상무에 지원하지 않고 입대를 미룬다.** 계측이 재려는 건
			# 관계이므로 커리어가 2년 멈추면 표본이 그만큼 준다.
			# **한 번 물으면 표시가 남아** 같은 자리를 다시 돌지 않는다
			elif Pending.has(s, "sports_unit_apply"):
				CareerDecision.answer_sports_unit(s, false)
			elif Pending.has(s, "military_enlist_ask"):
				CareerDecision.answer_enlist(s, false, day)
			elif Pending.has(s, "career_choice"):
				# 🔴 **화면이 내는 선택지를 그대로 쓴다** (P-42).
				# 예전엔 "지명이 안 되면 대학"으로 박아 뒀는데, 대학 4학년이
				# 다시 대학에 가는 것이라 **학적 역행 가드에 막혀** 대기줄에
				# 쌓였다 — 진로가 열려도 답이 안 됐다.
				# `DecisionVm.build`가 그때의 실제 선택지를 낸다
				var d: Dictionary = DecisionVm.build(s)
				var ids: Array = []
				for ch in d.get("choices", []):
					ids.append(String(ch.get("id", "")))
				# ⚠ **프로가 있으면 프로다** — 계측이 재려는 관계(구단주·감독)와
				# 라이벌은 프로에 가야 표본이 생긴다
				if not ids.is_empty():
					DecisionVm.apply(s,
						"draft" if ids.has("draft") else String(ids[0]), day)
			# ⚠ **입력을 센다.** 코치는 담당 영역 훈련과 성장으로만 오른다 —
			# 산식을 의심하기 전에 그 둘이 몇 번 걸리는지 본다.
			# `WeekRunner` **앞**에서 재야 그 주의 성장분이 잡힌다
			# ⚠ **낫고도 사전이 남는다** — 있는지가 아니라 `weeks_left`를 본다
			var cur_inj = (s["protagonist"] as Dictionary).get("injury", null)
			if cur_inj is Dictionary and int(cur_inj.get("weeks_left", 0)) > 0:
				_hurt_weeks += 1
			# 🔴 **게임의 자동 진행과 같은 자리다** (`auto_advance.gd:205`).
			# 피로·사기가 오르내리므로 한 번 정하고 두면 탈진한 채로 구속을
			# 올린다 — 실제로 그래서 부상이 79%였다
			AutoTraining.apply(s)
			var before_ovr: float = Contract.core_ovr(s["protagonist"])
			var area: String = RelationshipRunner.training_area_of(s)
			WeekRunner.run(s, day)
			var delta: float = Contract.core_ovr(s["protagonist"]) - before_ovr
			if delta >= _growth_threshold():
				_grew_weeks += 1
			if not area.is_empty():
				_area_weeks += 1
				_areas[area] = int(_areas.get(area, 0)) + 1
		# ⚠ **해마다 어디 있는지 찍는다.** 4해를 굴렸는데 등판이 1해와 같은
		# 10경기였다 — 어느 해부터 안 뛰는지 모르면 산식을 엉뚱하게 뒤진다
		var pp: Dictionary = s.get("protagonist", {})
		# ⚠ **"내 경기"는 등판 수지 팀 경기 수가 아니다** (P-17).
		# 둘을 같이 안 내면 "대학이 해마다 9경기"가 리그 크기 문제로 읽힌다 —
		# 실제로는 고교 20경기 중 등판 9였고 그 9가 우연히 같았다
		var mine: int = 0
		var team_games: int = 0
		var my_team: String = String(pp.get("team_id", ""))
		for g in s.get("schedule", []):
			if String(g.get("home", "")) == my_team 					or String(g.get("away", "")) == my_team:
				team_games += 1
			if g.get("is_protagonist_game", false):
				mine += 1
		var pend: Array = []
		for q in s.get("pending", []):
			pend.append(String(q.get("type", "?")))
		var inj = pp.get("injury", null)
		# ⚠ **OVR을 해마다 남긴다** — 어느 해에 멈췄는지는 합계로는 안 보인다
		_ovr_by_year.append(Contract.core_ovr(pp))
		_trace.append("%d년 OVR %.1f/%.0f · %s/%s · 학년 %s · 팀 %d경기 중 등판 %d · 게이트 %s · 부상 %s · 대기 %s" % [
			year, Contract.core_ovr(pp),
			# 🔴 **키는 `potential_hidden`이다** — `potential`로 읽어 6해 내내
			# 0이 찍혔다. 계측이 게임의 계약을 모르던 자리(형태 ⑦)가 또 나왔고,
			# 이번엔 **P-16b가 낸 줄이 스스로 그걸 드러냈다**
			float(pp.get("potential_hidden", 0.0)),
			String(pp.get("career_stage", "?")),
			String(pp.get("league_id", "?")), str(pp.get("grade", "-")),
			team_games, mine, DayEngine.appearance_gate(pp),
			("%s %d주" % [String(inj.get("type", "?")),
				int(inj.get("weeks_left", 0))]) if inj is Dictionary else "없음",
			str(pend) if not pend.is_empty() else "없음"])

		# ⚠ **해마다 세어 누적한다.** `state["schedule"]`은 시즌 넘길 때
		# 통째로 덮어써지므로(`season_runner.gd:664`) 끝나고 한 번 세면
		# **마지막 해 것만** 남는다 — "4해에 10경기"로 읽혀 등판이 안 느는
		# 줄 알았는데, 10경기는 **한 시즌 등판 수**였다
		_count_appearances(s)

		var season_out: Dictionary = SeasonRunner.run(s)
		# ⚠ **로스터 쪽 주인공을 따로 본다.** `all_players`는 로스터를 훑는데,
		# 사전이 두 벌이면 로스터만 오르고 `state["protagonist"]`는 그대로다
		var in_roster: String = "못 찾음"
		for pl in World.roster_of(s.get("world", {}),
				String(pp.get("team_id", ""))):
			if bool(pl.get("is_protagonist", false)):
				in_roster = "학년 %s%s" % [str(pl.get("grade", "-")),
					"" if pl == pp else " (다른 사전!)"]
		_trace.append("     → 시즌종료 ran=%s · 로스터 속 나: %s" % [
			str(season_out.get("ran", "?")), in_roster])
		year += 1
	return s


func run(log_line: Callable, _fail: Callable, seed_value: int,
		years: int = 4) -> int:
	var s: Dictionary = _one(seed_value, years)
	log_line.call("  씨앗 %d · %d해 굴림 (%d년까지)"
		% [seed_value, years, 2027 + years - 1])

	# 마지막 해 몫을 마저 센다 — 위 루프는 시즌을 넘기기 직전에만 센다
	_count_appearances(s)
	log_line.call("  주인공 등판 %d경기 · 그 경기의 상대 투수 줄 %d개"
		% [_appearances, _opponents])
	for t in _trace:
		log_line.call("    %s" % t)
	var area_line: String = ""
	for a in _areas:
		area_line += "%s %d · " % [a, _areas[a]]
	# 🔴 **성장은 이 줄로 읽는다** (P-16b) — 아래 "임계 넘은 주"가 아니다
	var ovr_end: float = _ovr_by_year[-1] if not _ovr_by_year.is_empty() 		else _ovr_start
	var by_year: String = ""
	for i in _ovr_by_year.size():
		by_year += "%d년 %.1f · " % [2027 + i, _ovr_by_year[i]]
	log_line.call("  OVR %.1f → %.1f (%+.1f · 해마다 %+.1f)"
		% [_ovr_start, ovr_end, ovr_end - _ovr_start,
			(ovr_end - _ovr_start) / float(maxi(1, _ovr_by_year.size()))])
	log_line.call("    %s" % by_year.trim_suffix(" · "))
	log_line.call("    부상으로 쉰 주 %d / %d주" % [_hurt_weeks,
		_ovr_by_year.size() * Calendar.WEEKS_PER_SEASON])
	# ⚠ **아래는 "한 주에 1칸 넘은 주"의 개수다** — 0이어도 성장은 돈다.
	# 코치 관계가 그 조건을 보므로 남겨 두지만, 성장의 척도로 읽으면 안 된다
	log_line.call("  코치 조건 — 한 주에 %.0f칸 넘은 주 %d · 훈련 영역이 정해진 주 %d  [%s]"
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
