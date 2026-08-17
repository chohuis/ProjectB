extends GdUnitTestSuite

## 무대를 옮기면 **로스터도 따라 옮긴다** — P-14.
##
## 🔴 **20해를 굴렸더니 대학 진학 시즌부터 18해 연속 주인공을 못 찾았다.**
## `CareerDecision._move_to`가 `p["team_id"]`만 바꾸고 로스터는 안 건드렸다.
##
## ⚠ **04는 주인공도 로스터에 산다**(`world.gd:280`이 `is_protagonist`를
## 켜서 넣는다). `World.relink_protagonist`가 **새 팀 로스터에서** 주인공을
## 찾으므로, 로스터에 안 넣으면 영영 못 찾는다 — 02와 다른 구조라 02에
## 대응 코드가 없다. **04 자기 규칙을 04가 안 지키던 것이다.**
##
## ⚠ **옛 팀에서 빼는 것도 같이 해야 한다.** 안 빼면 같은 사람이 두 팀에
## 있고 로스터 상한·순위표·성적 집계가 전부 어긋난다 —
## `FaRunner._move`가 같은 자리에서 "양쪽 배열을 같이 고쳐야 한다"고
## 적어 뒀다.


const HS: String = "TEAM_HS_AEWOL"
const UNIV: String = "TEAM_UNIV_BAEKJE"


func _state() -> Dictionary:
	var me: Dictionary = {"id": "ME", "name": "김한결", "is_protagonist": true,
		"team_id": HS, "league_id": "LEAGUE_HIGHSCHOOL",
		"career_stage": "highschool", "grade": 3, "age": 18,
		"player_type": "pitcher", "position": "SP",
		"pitching": {"ovr": 61.0}, "batting": {"ovr": 30.0}}
	var mate: Dictionary = {"id": "HS1", "team_id": HS,
		"league_id": "LEAGUE_HIGHSCHOOL", "pitching": {"ovr": 50.0}}
	# ⚠ **나를 가운데에 둔다.** 끝에 두면 "빼고 뒤에 붙이기"가 순서를 안 바꿔서
	# 같은 팀 변이가 등가가 된다 — 실제로 그렇게 안 잡혔다
	var mate2: Dictionary = {"id": "HS2", "team_id": HS,
		"league_id": "LEAGUE_HIGHSCHOOL", "pitching": {"ovr": 45.0}}
	var univ_mate: Dictionary = {"id": "U1", "team_id": UNIV,
		"league_id": "LEAGUE_UNIVERSITY", "pitching": {"ovr": 55.0}}
	return {
		"protagonist": me,
		"world": {"rosters": {HS: [mate, me, mate2], UNIV: [univ_mate]}},
	}


func _me_in(state: Dictionary, team: String) -> bool:
	for p in World.roster_of(state.get("world", {}), team):
		if String(p.get("id", "")) == "ME":
			return true
	return false


func _move(state: Dictionary) -> void:
	CareerDecision._move_to(state, state["protagonist"], "university",
		"LEAGUE_UNIVERSITY", UNIV)


## ⚠ **여기가 P-14다.** 옮기고 나면 새 팀 로스터에 있어야 한다
func test_새_팀_로스터에_들어간다() -> void:
	var s: Dictionary = _state()
	_move(s)
	assert_bool(_me_in(s, UNIV)).override_failure_message(
		"진학했는데 대학 로스터에 없다 — relink_protagonist가 영영 못 찾는다") \
		.is_true()


## 옛 팀에서는 빠진다 — 안 빼면 같은 사람이 두 팀에 있다
func test_옛_팀에서_빠진다() -> void:
	var s: Dictionary = _state()
	_move(s)
	assert_bool(_me_in(s, HS)).override_failure_message(
		"진학했는데 고교 로스터에도 남아 있다").is_false()


## 배선의 끝 — `relink_protagonist`가 실제로 찾나
func test_relink이_찾는다() -> void:
	var s: Dictionary = _state()
	_move(s)
	assert_bool(World.relink_protagonist(s)).override_failure_message(
		"옮긴 뒤 주인공을 못 찾는다 — 20해 계측이 본 그 증상이다").is_true()
	assert_str(String(s["protagonist"]["team_id"])).is_equal(UNIV)


## ⚠ **같은 사람이어야 한다.** 복사본을 넣으면 로스터 쪽과 `protagonist` 쪽이
## 갈려서 한쪽만 자란다 — 04가 이미 한 번 데인 자리다(`world.gd` 주석).
##
## ⚠ **`relink_protagonist`를 부르고 재면 안 된다.** 그건 로스터에서 찾은
## 것을 `protagonist`에 도로 물리므로 **복사본이어도 둘이 같아진다** —
## 실제로 그 검사가 "복사본을 넣는다" 변이를 못 잡았다.
## **바깥에 들고 있던 원본을 고쳐서** 로스터가 따라 움직이는지 본다
func test_같은_사람이_들어간다() -> void:
	var s: Dictionary = _state()
	var original: Dictionary = s["protagonist"]
	_move(s)
	original["pitching"]["ovr"] = 77.0
	for p in World.roster_of(s["world"], UNIV):
		if String(p.get("id", "")) == "ME":
			assert_float(float(p["pitching"]["ovr"])).override_failure_message(
				"로스터에 복사본이 들어갔다 — 원본을 고쳐도 안 따라온다") \
				.is_equal(77.0)
			return
	fail("대학 로스터에 내가 없다")


## 같이 있던 사람은 그대로다 — 옮기다 남을 밀어내면 안 된다
func test_남은_안_건드린다() -> void:
	var s: Dictionary = _state()
	_move(s)
	assert_int(World.roster_of(s["world"], HS).size()).is_equal(2)
	assert_int(World.roster_of(s["world"], UNIV).size()).is_equal(2)


## ⚠ **주인공이 아니면 로스터를 안 건드린다.** 이 함수는 NPC 진로에도
## 쓰일 수 있고, NPC는 `FaRunner._move`가 따로 옮긴다
func test_주인공이_아니면_안_옮긴다() -> void:
	var s: Dictionary = _state()
	var npc: Dictionary = World.roster_of(s["world"], HS)[0]
	CareerDecision._move_to(s, npc, "university", "LEAGUE_UNIVERSITY", UNIV)
	assert_int(World.roster_of(s["world"], UNIV).size()).override_failure_message(
		"NPC까지 로스터를 옮겼다").is_equal(1)


## 같은 팀으로 옮기면(재계약) 로스터를 아예 안 건드린다.
##
## ⚠ **개수만 보면 안 된다** — 빼고 뒤에 붙이면 개수는 그대로다.
## **자리가 그대로인지**를 본다. 실제로 개수만 보던 검사가 그 변이를 놓쳤다
func test_같은_팀이면_안_건드린다() -> void:
	var s: Dictionary = _state()
	CareerDecision._move_to(s, s["protagonist"], "highschool",
		"LEAGUE_HIGHSCHOOL", HS)
	var ids: Array = []
	for p in World.roster_of(s["world"], HS):
		ids.append(String(p.get("id", "")))
	assert_array(ids).override_failure_message(
		"같은 팀인데 로스터를 건드렸다: %s" % str(ids)) \
		.is_equal(["HS1", "ME", "HS2"])
