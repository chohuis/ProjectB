extends GdUnitTestSuite

## 병역·전역이 로스터를 같이 옮긴다 — P-44.
##
## 🔴 **P-14와 같은 결함이 병역 경로에 남아 있었다.** 그때는
## `CareerDecision._move_to`가 `team_id`만 바꾸고 로스터를 안 건드렸다.
## 이번엔 `Military.enlist`·`Military.discharge`다 — 실측 트레이스가
## **병역 이후 12해 내내 "로스터 속 나: 못 찾음"**이었다.
##
## ⚠ **04는 주인공도 로스터에 산다**(`world.gd:280`). 로스터에 없으면
## `relink_protagonist`가 못 찾고, 동료·라이벌·성장이 전부 그 위에 선다 —
## 실측에서 rival이 −2~0(평균 −0.3)으로 눌려 있었다.
##
## ⚠ **02엔 대응 코드가 없다** — 02는 주인공을 로스터 밖(`g.protagonist`)에
## 둔다. **04 자기 규칙을 04가 안 지키던 것**이다(P-14와 같은 말).

const HS: String = "TEAM_HS_AEWOL"
const DAY: int = 340


func _state() -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": HS})
	var p: Dictionary = s["protagonist"]
	p["career_stage"] = "independent"
	p["league_id"] = "LEAGUE_INDEPENDENT"
	p["age"] = 22
	p.erase("grade")
	# 독립리그 팀 하나에 넣어 둔다 — 거기서 입대한다
	var team: String = _indie_team()
	p["team_id"] = team
	var rosters: Dictionary = s["world"]["rosters"]
	for tid in rosters:
		var r: Array = rosters[tid]
		for i in range(r.size() - 1, -1, -1):
			if bool(r[i].get("is_protagonist", false)):
				r.remove_at(i)
	if not rosters.has(team):
		rosters[team] = []
	rosters[team].append(p)
	return s


func _indie_team() -> String:
	var t: Array = Military.discharge_teams()
	return String(t[0]) if not t.is_empty() else "TEAM_IND_A"


## 로스터 어딘가에 주인공이 있나 — 있으면 그 팀 id
func _holder(s: Dictionary) -> String:
	for tid in s["world"]["rosters"]:
		for q in s["world"]["rosters"][tid]:
			if bool(q.get("is_protagonist", false)):
				return tid
	return ""


## 로스터에 몇 번 들어 있나 — **둘이면 같은 사람이 두 팀에 있다**
func _count(s: Dictionary) -> int:
	var n: int = 0
	for tid in s["world"]["rosters"]:
		for q in s["world"]["rosters"][tid]:
			if bool(q.get("is_protagonist", false)):
				n += 1
	return n


# ── 입대 ─────────────────────────────────────────────────────────

## 🔴 **입대하면 옛 팀 로스터에서 빠진다.** 안 빼면 군인이 리그 경기에 나온다
func test_입대하면_옛_팀에서_빠진다() -> void:
	var s: Dictionary = _state()
	var before: String = String(s["protagonist"]["team_id"])
	assert_str(_holder(s)).is_equal(before)

	assert_bool(Military.enlist(s, "general", DAY)).is_true()
	assert_str(_holder(s)).override_failure_message(
		"입대했는데 %s 로스터에 그대로 있다" % _holder(s)).is_equal("")


## ⚠ **빈 팀 칸을 만들지 않는다** — `team_id`가 ""인데 `rosters[""]`에 넣으면
## 로스터를 훑는 코드가 유령 팀을 보게 된다
func test_입대가_빈_팀_칸을_안_만든다() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", DAY)
	assert_bool((s["world"]["rosters"] as Dictionary).has("")) \
		.override_failure_message("빈 이름의 팀이 생겼다").is_false()


# ── 전역 ─────────────────────────────────────────────────────────

func _served(s: Dictionary) -> void:
	Military.enlist(s, "general", DAY)
	var p: Dictionary = s["protagonist"]
	p["military_service_weeks"] = Military.SERVICE_WEEKS


## 🔴 **전역하면 새 팀 로스터에 들어간다.** 이게 P-44의 본체다
func test_전역하면_새_팀에_들어간다() -> void:
	var s: Dictionary = _state()
	_served(s)
	assert_bool(Military.discharge(s, DAY)).is_true()

	var p: Dictionary = s["protagonist"]
	assert_str(_holder(s)).override_failure_message(
		"전역했는데 로스터 어디에도 없다 — 동료·라이벌·성장이 그 위에 선다") \
		.is_equal(String(p["team_id"]))


## ⚠ **한 곳에만 있는다** — 양쪽 배열을 같이 안 고치면 두 팀에 걸린다
func test_전역_뒤_한_곳에만_있는다() -> void:
	var s: Dictionary = _state()
	_served(s)
	Military.discharge(s, DAY)
	assert_int(_count(s)).override_failure_message(
		"주인공이 로스터에 %d번 있다" % _count(s)).is_equal(1)


## 🔴 **같은 사전이어야 한다.** 복사본이면 로스터 쪽만 자라고
## `state["protagonist"]`는 그대로다 — 04가 이미 한 번 데인 자리다
func test_같은_사전이_들어간다() -> void:
	var s: Dictionary = _state()
	_served(s)
	Military.discharge(s, DAY)

	var p: Dictionary = s["protagonist"]
	var holder: String = _holder(s)
	for q in s["world"]["rosters"][holder]:
		if bool(q.get("is_protagonist", false)):
			q["__probe"] = 42
	assert_int(int(p.get("__probe", 0))).override_failure_message(
		"로스터에 복사본이 들어갔다 — 한쪽만 자란다").is_equal(42)


## 프로에서 입대했으면 원소속으로 돌아간다 — 로스터도 같이
func test_프로는_원소속_로스터로_돌아간다() -> void:
	var s: Dictionary = _state()
	var p: Dictionary = s["protagonist"]
	var home: String = "TEAM_KBL_BUSAN_WAVES_1"
	# 프로에서 입대한 상태를 만든다
	var rosters: Dictionary = s["world"]["rosters"]
	rosters[String(p["team_id"])].erase(p)
	p["career_stage"] = "pro_kbl"
	p["league_id"] = "LEAGUE_KBL"
	p["team_id"] = home
	if not rosters.has(home):
		rosters[home] = []
	rosters[home].append(p)

	_served(s)
	Military.discharge(s, DAY)
	assert_str(String(p["team_id"])).is_equal(home)
	assert_str(_holder(s)).override_failure_message(
		"원소속으로 돌아왔는데 로스터엔 없다").is_equal(home)
