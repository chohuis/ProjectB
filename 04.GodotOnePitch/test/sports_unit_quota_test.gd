extends GdUnitTestSuite

## 체육부대 선발 — 02 `npc_sim.rs:2014-2048` `select_sports_unit_ids`.
##
## 🔴 **04는 세 군데가 02와 달랐다.**
##
## ① **Phase 1이 아예 없었다** — 02는 그해 전역자가 비운 포지션을 팀당 상한을
##    무시하고 먼저 채운다. 04엔 OVR 순(Phase 2)만 있었다.
##
## ② **지원자 풀이 수천 명이었다** — 02는 `topN: 29`로 자르고 주인공을 더해
##    **30명 풀에서 13명**(43%)을 뽑는다. 04는 미필 프로 전원을 세워
##    **7,000명에서 13명**(0.2%)이었다. 주인공은 사실상 못 붙었다.
##
## ③ **정원이 갈라져 있었다** — 주인공 경로와 NPC 경로가 따로 뽑았다.
##    02도 그렇다(`selectedIds`를 받아 놓고 NPC에는 안 쓴다). **02의 명백한
##    결함까지 물려받지 않는다**는 규칙에 걸리는 자리라 04에서 합쳤다.


func _c(id: String, ovr: float, team: String, pos: String = "SP") -> Dictionary:
	return {"id": id, "ovr": ovr, "team_id": team, "position": pos}


# ── Phase 1 — 전역 공백 채우기 ────────────────────────────────────

## ⚠ **팀당 상한을 안 본다.** 자리를 비워 두는 것보다 한 팀에서 둘 데려오는
## 게 낫다는 02의 판단이다
func test_전역_공백은_팀당_상한을_무시한다() -> void:
	var pool: Array = []
	for i in 6:
		pool.append(_c("A%d" % i, 90.0 - i, "TA", "CL"))
	var got: Array = Military.select_sports_unit_ids(pool,
		["CL", "CL", "CL", "CL"], 4, 1)
	assert_int(got.size()).override_failure_message(
		"CL 자리가 넷 비었는데 팀당 상한 1에 막혀 %d명만 뽑았다" % got.size()) \
		.is_equal(4)


## 공백 포지션은 **한 자리에 한 명씩**만 메운다
func test_공백_하나에_한_명만_들어간다() -> void:
	var pool: Array = [_c("A", 90.0, "TA", "CL"), _c("B", 80.0, "TB", "CL")]
	var got: Array = Military.select_sports_unit_ids(pool, ["CL"], 1, 9)
	assert_int(got.size()).is_equal(1)
	assert_bool(got.has("A")).override_failure_message(
		"공백을 OVR 낮은 쪽이 채웠다").is_true()


## 공백이 없으면 Phase 1은 아무 일도 안 한다 — 주인공 경로가 그 모습이다
## (02 `npc_sim.rs:2567`도 `&[]`를 넘긴다)
func test_공백이_없으면_OVR_순이다() -> void:
	var pool: Array = [_c("A", 50.0, "TA", "CL"), _c("B", 90.0, "TB", "SP")]
	var got: Array = Military.select_sports_unit_ids(pool, [], 1, 9)
	assert_bool(got.has("B")).override_failure_message(
		"공백이 없는데 OVR 낮은 쪽이 뽑혔다").is_true()


## 🔴 **02와 일부러 다른 자리다.** 02는 Phase 1을 정원으로 안 막는데,
## 02에선 **Phase 1이 한 번도 안 돈다**(호출부가 하나뿐이고 `&[]`를 넘긴다).
## 04가 진짜 공백을 먹이자 **되먹임**이 생겼다 — 전역 26 → 공백 26 →
## 선발 26. 실측에서 상무 복무가 정원(13×2=26)의 배가 넘는 58명이 됐다
func test_Phase1이_정원을_안_넘는다() -> void:
	var pool: Array = []
	for i in 20:
		pool.append(_c("A%d" % i, 90.0 - i, "T%d" % i, "CL"))
	var vacating: Array = []
	for i in 20:
		vacating.append("CL")
	var got: Array = Military.select_sports_unit_ids(pool, vacating, 5, 9)
	assert_int(got.size()).override_failure_message(
		"공백 20개를 다 채워 정원 5에 %d명을 뽑았다 — 되먹임이 생긴다"
		% got.size()).is_equal(5)


## 막았어도 **빈자리가 먼저다** — Phase 1의 뜻은 남아야 한다
func test_정원_안에서는_빈자리가_먼저다() -> void:
	var pool: Array = [_c("A", 50.0, "TA", "CL"), _c("B", 90.0, "TB", "SP")]
	var got: Array = Military.select_sports_unit_ids(pool, ["CL"], 1, 9)
	assert_bool(got.has("A")).override_failure_message(
		"CL 자리가 비었는데 OVR만 보고 SP를 뽑았다 — Phase 1이 죽었다") \
		.is_true()


# ── Phase 2 — 팀당 상한 ───────────────────────────────────────────

func test_팀당_상한이_걸린다() -> void:
	var pool: Array = []
	for i in 6:
		pool.append(_c("A%d" % i, 90.0 - i, "TA"))
	var got: Array = Military.select_sports_unit_ids(pool, [], 6, 2)
	assert_int(got.size()).override_failure_message(
		"한 팀에서 %d명 뽑았다 — 상한 2를 안 봤다" % got.size()).is_equal(2)


func test_정원에서_자른다() -> void:
	var pool: Array = []
	for i in 20:
		pool.append(_c("A%d" % i, 90.0 - i, "T%d" % i))
	assert_int(Military.select_sports_unit_ids(pool, [], 5, 9).size()).is_equal(5)


# ── 지원자 풀 상위 29 ─────────────────────────────────────────────

func _world(n: int) -> Dictionary:
	var rosters: Dictionary = {}
	for i in n:
		rosters["T%d" % i] = [{
			"id": "N%d" % i, "age": 24, "career_stage": "pro", "position": "SP",
			"military_status": Military.STATUS_UNSERVED,
			"pitching": {"ovr": float(i)}, "contract_years": 3,
		}]
	return {"protagonist": {"id": "ME", "is_protagonist": true},
		"season_year": 2033, "seed": 7, "world": {"rosters": rosters}}


## 🔴 **여기가 ②다.** 02 `advanceWeek.ts:2052` `topN: 29`
func test_지원자_풀이_29명에서_잘린다() -> void:
	var got: Array = Military.sports_candidates(_world(500), "")
	assert_int(got.size()).override_failure_message(
		"지원자 풀이 %d명이다 — 정원 13에 이만큼 세우면 주인공은 못 붙는다"
		% got.size()).is_equal(Military.SPORTS_APPLICANT_TOP)


## 자를 때 **위에서** 자른다 — 아무나 29명이 아니다
func test_풀은_OVR_상위로_채운다() -> void:
	var got: Array = Military.sports_candidates(_world(100), "")
	for c in got:
		assert_float(float(c["ovr"])).override_failure_message(
			"OVR %.0f가 상위 29에 들어왔다" % float(c["ovr"])).is_greater(60.0)


func test_주인공은_풀에_없다() -> void:
	var s: Dictionary = _world(40)
	s["world"]["rosters"]["MINE"] = [{
		"id": "ME", "is_protagonist": true, "age": 24, "career_stage": "pro",
		"position": "SP", "military_status": Military.STATUS_UNSERVED,
		"pitching": {"ovr": 99.0}}]
	for c in Military.sports_candidates(s, ""):
		assert_str(String(c["id"])).override_failure_message(
			"주인공이 NPC 풀에 두 번 들어간다").is_not_equal("ME")


# ── 정원 공유 ─────────────────────────────────────────────────────

## 🔴 **여기가 ③다.** 한 해의 명단은 하나뿐이다
func test_한_해에_한_번만_뽑는다() -> void:
	var s: Dictionary = _world(40)
	var first: Array = Military.resolve_sports_unit(s, [])
	# 두 번째 호출 때 세계를 흔들어도 명단이 바뀌면 안 된다
	s["world"]["rosters"]["T0"][0]["pitching"]["ovr"] = 999.0
	assert_array(Military.resolve_sports_unit(s, [])) \
		.override_failure_message("같은 해에 두 번 뽑았다 — 정원이 샌다") \
		.is_equal(first)


## ⚠ **해를 같이 적어야 한다.** 안 적으면 이듬해에 작년 명단을 읽는다
func test_해가_바뀌면_다시_뽑는다() -> void:
	var s: Dictionary = _world(40)
	Military.resolve_sports_unit(s, [])
	s["season_year"] = 2034
	for tid in s["world"]["rosters"]:
		s["world"]["rosters"][tid][0]["military_status"] = Military.STATUS_UNSERVED
	s["world"]["rosters"]["T0"][0]["pitching"]["ovr"] = 999.0
	assert_bool(Military.resolve_sports_unit(s, []).has("N0")) \
		.override_failure_message("이듬해에도 작년 명단을 그대로 읽었다").is_true()


## 지원한 주인공은 **같은 명단에서** 겨룬다
func test_지원한_주인공이_명단에_오른다() -> void:
	var s: Dictionary = _world(5)
	s["protagonist"] = {"id": "ME", "is_protagonist": true, "position": "SP",
		"team_id": "TM", "sports_unit_applied": true, "pitching": {"ovr": 99.0}}
	assert_bool(Military.resolve_sports_unit(s, []).has("ME")) \
		.override_failure_message(
			"OVR 99인데 5명 풀에서 안 뽑혔다 — 주인공이 명단에 안 들어갔다") \
		.is_true()


## 지원 안 했으면 안 오른다 — 안 물어보고 보내면 안 된다
func test_지원_안_하면_명단에_없다() -> void:
	var s: Dictionary = _world(5)
	s["protagonist"] = {"id": "ME", "is_protagonist": true, "position": "SP",
		"team_id": "TM", "pitching": {"ovr": 99.0}}
	assert_bool(Military.resolve_sports_unit(s, []).has("ME")) \
		.override_failure_message("지원도 안 했는데 체육부대에 뽑혔다").is_false()


# ── 실제로 보내나 ─────────────────────────────────────────────────

## 🔴 **뽑아 놓고 안 보내면 정원이 새는 것과 같다.** 02가 그렇다
func test_뽑힌_NPC가_실제로_상무에_간다() -> void:
	var s: Dictionary = _world(60)
	s["day"] = Calendar.DAYS_PER_SEASON
	NpcMilitary.run(s, Calendar.DAYS_PER_SEASON)

	var sports: int = 0
	for tid in s["world"]["rosters"]:
		for q in s["world"]["rosters"][tid]:
			if String(q.get("military_unit", "")) == "sports":
				sports += 1
	assert_int(sports).override_failure_message(
		"NPC가 아무도 체육부대에 안 갔다 — 정원을 주인공만 쓴다").is_greater(0)


## 체육부대로 간 사람이 **일반병으로 또 가지 않는다**
func test_상무에_간_사람은_일반병이_안_된다() -> void:
	var s: Dictionary = _world(60)
	NpcMilitary.run(s, Calendar.DAYS_PER_SEASON)
	for tid in s["world"]["rosters"]:
		for q in s["world"]["rosters"][tid]:
			if String(q.get("military_status", "")) != Military.STATUS_SERVING:
				continue
			assert_str(String(q.get("military_unit", ""))).override_failure_message(
				"복무 중인데 부대가 비었다 — 덮어썼다").is_not_empty()


## ⚠ **전역자 포지션이 Phase 1로 흘러야 한다.**
##
## ⚠ **소스에 `vacating`이 있는지로 재면 안 된다** — 빈 배열을 넘기게
## 바꿔도 그 글자는 그대로 남아 변이가 안 잡힌다(실제로 놓쳤다).
## **CL 자리를 비워 놓고, OVR이 낮은 CL이 높은 SP를 제치는지** 본다
func test_전역_공백이_Phase1로_흐른다() -> void:
	var rosters: Dictionary = {}
	# 전역할 CL 열넷 — 이만큼 자리가 빈다
	for i in 14:
		rosters["D%d" % i] = [{
			"id": "D%d" % i, "age": 24, "career_stage": "pro", "position": "CL",
			"military_status": Military.STATUS_SERVING, "military_unit": "sports",
			"military_service_weeks": Military.SERVICE_WEEKS,
			"pitching": {"ovr": 50.0}, "contract_years": 3}]
	# 미필 — SP가 잘하고 CL이 못한다. 공백을 보면 CL이 먼저다
	for i in 20:
		rosters["S%d" % i] = [{
			"id": "S%d" % i, "age": 24, "career_stage": "pro", "position": "SP",
			"military_status": Military.STATUS_UNSERVED,
			"pitching": {"ovr": 90.0 - i}, "contract_years": 3}]
	for i in 5:
		rosters["C%d" % i] = [{
			"id": "C%d" % i, "age": 24, "career_stage": "pro", "position": "CL",
			"military_status": Military.STATUS_UNSERVED,
			"pitching": {"ovr": 40.0 - i}, "contract_years": 3}]

	var s: Dictionary = {"protagonist": {"id": "ME", "is_protagonist": true},
		"season_year": 2033, "seed": 3, "world": {"rosters": rosters}}
	NpcMilitary.run(s, Calendar.DAYS_PER_SEASON)

	var picked: Array = s.get(Military.SPORTS_PICK_KEY, [])
	var cl: int = 0
	for id in picked:
		if String(id).begins_with("C"):
			cl += 1
	assert_int(cl).override_failure_message(
		"CL 자리가 열넷 비었는데 OVR 40짜리 CL이 %d명만 뽑혔다 — 전역 공백이 "
		% cl + "Phase 1로 안 흘렀다 (뽑힌 명단 %s)" % str(picked)).is_greater(0)


## 배선의 끝 — 주인공 경로가 **자기 정원으로 따로 뽑지 않는다**
func test_주인공_경로가_따로_안_뽑는다() -> void:
	var src := CodeText.of("res://sim/career_runner.gd")
	assert_int(src.find("select_sports_unit(")).override_failure_message(
		"커리어가 아직 자기 풀로 뽑는다 — NPC와 정원이 갈라진다").is_equal(-1)
	assert_int(src.find("resolve_sports_unit")).override_failure_message(
		"커리어가 공용 명단을 안 읽는다").is_greater(-1)
