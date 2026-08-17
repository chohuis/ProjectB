extends GdUnitTestSuite

## 맞대결 상대는 상대편이어야 한다 — P-11.
##
## 원본: `advanceWeek.ts:1215-1222`
##
## ⚠ **02도 같은 결함이 있다.** 02는 `l.playerId !== protagonist.id`만 보고
## **팀을 안 가린다** — 04가 그걸 정확히 옮기면서 결함까지 물려받았다.
##
## ⚠ **실측이 잡았다.** 한 해를 굴리니 라이벌 id 다섯 중 하나가 **내 팀
## 동료**였고, 그것도 **아홉 번 중 다섯 번**으로 제일 많이 잡혔다 —
## 내가 3이닝 던지고 우리 불펜이 6이닝 던지면 그 불펜이 "라이벌"이 된다.
## 그 자리를 뺏기는 만큼 **진짜 상대 선발이 안 잡힌다.**
##
## ⚠ **02가 그랬다고 04도 그래야 하는 건 아니다.** "라이벌"이라는 말 자체가
## 상대편을 뜻한다 — 이건 옮길 값이 아니라 명백한 결함이다.

const ME: String = "PLY_PROTAGONIST"
const MY_TEAM: String = "TEAM_MINE"
const MATE: String = "PLY_MATE"
const FOE: String = "PLY_FOE"


func _state(lines: Array) -> Dictionary:
	return {
		"day": 7,
		"protagonist": {"id": ME, "team_id": MY_TEAM},
		# ⚠ **키는 `home`/`away`다** — `home_team_id`로 쓰면 `context_of`가
		# 경기를 못 찾아 **검사가 조용히 빈 결과를 본다**(실제로 그랬다)
		"schedule": [{
			"day": 3, "home": MY_TEAM, "away": "TEAM_FOE",
			"is_protagonist_game": true,
			"result": {"winner_id": MY_TEAM, "loser_id": "TEAM_FOE",
				"player_lines": lines},
		}],
		"world": {"rosters": {
			MY_TEAM: [{"id": ME}, {"id": MATE}],
			"TEAM_FOE": [{"id": FOE}],
		}},
	}


func _line(id: String, ip: float) -> Dictionary:
	return {"role": "pitcher", "player_id": id, "ip": ip,
		"er": 1.0, "h": 3.0, "k": 4.0, "bb": 1.0, "pc": 60}


## ⚠ **여기가 결함이다.** 우리 불펜이 나보다 많이 던지면 그가 뽑힌다
func test_내_팀_동료는_라이벌이_아니다() -> void:
	var s: Dictionary = _state([
		_line(ME, 3.0), _line(MATE, 6.0), _line(FOE, 9.0)])
	var faced: Array = RelationshipRunner.context_of(s, 7).get("faced_rivals", [])
	assert_array(faced).override_failure_message(
		"내 팀 동료가 라이벌로 잡혔다: %s" % str(faced)).not_contains([MATE])


## 동료를 빼면 **그 자리에 진짜 상대 선발이 들어온다** — 이게 고치는 이유다
func test_동료를_빼면_상대_선발이_잡힌다() -> void:
	var s: Dictionary = _state([
		_line(ME, 3.0), _line(MATE, 6.0), _line(FOE, 4.0)])
	var faced: Array = RelationshipRunner.context_of(s, 7).get("faced_rivals", [])
	assert_array(faced).override_failure_message(
		"동료에게 자리를 뺏겨 상대 선발이 안 잡혔다").contains([FOE])


## 02와 같은 규칙 — **상대 중 이닝 최다 한 명만.** 불펜까지 세면 폭증한다.
##
## ⚠ **적게 던진 쪽을 먼저 둔다.** 많이 던진 쪽이 앞에 오면 "처음 나온 것을
## 잡는다"로 바꿔도 결과가 같아 **변이가 등가가 된다**
func test_상대가_여럿이면_이닝_최다_하나다() -> void:
	var s: Dictionary = _state([
		_line(ME, 5.0), _line("PLY_FOE2", 3.0), _line(FOE, 6.0)])
	(s["world"]["rosters"]["TEAM_FOE"] as Array).append({"id": "PLY_FOE2"})
	var faced: Array = RelationshipRunner.context_of(s, 7).get("faced_rivals", [])
	assert_int(faced.size()).is_equal(1)
	assert_str(String(faced[0])).override_failure_message(
		"이닝이 적은 쪽을 잡았다").is_equal(FOE)


## ⚠ **같은 상대를 두 번 만나면 한 번만 담는다.** 두 번 담으면 관계가
## 이중으로 오르고, 라이벌 수를 셀 때도 어긋난다
func test_같은_상대를_두_번_만나도_하나다() -> void:
	var s: Dictionary = _state([_line(ME, 5.0), _line(FOE, 6.0)])
	# 같은 주에 그 상대와 한 경기 더
	var second: Dictionary = (s["schedule"][0] as Dictionary).duplicate(true)
	second["day"] = 5
	(s["schedule"] as Array).append(second)
	var faced: Array = RelationshipRunner.context_of(s, 7).get("faced_rivals", [])
	assert_int(faced.size()).override_failure_message(
		"같은 상대가 %d번 담겼다" % faced.size()).is_equal(1)


## ⚠ **내가 안 던진 경기는 맞대결이 아니다** — 02도 `myLine`이 있을 때만 잡는다
func test_내가_안_던졌으면_안_잡는다() -> void:
	var s: Dictionary = _state([_line(MATE, 9.0), _line(FOE, 9.0)])
	assert_array(RelationshipRunner.context_of(s, 7).get("faced_rivals", [])) \
		.is_empty()


## ⚠ **"로스터가 비면 안 잡는다"는 가드를 안 만들었다.** 정상 게임에서
## 로스터는 최소 주인공을 담고 있어 **절대 안 빈다** — 검사 픽스처에서만
## 생기는 상황이라 그 가드는 죽은 코드가 된다. 지어낸 규칙을 넣지 않는다.
##
## 대신 **진짜 세계로 확인한다** — 한 해를 굴려 아군이 안 잡히는지 본다
func test_진짜_세계에서_아군이_안_잡힌다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var my_team: String = String(s["protagonist"]["team_id"])
	var mates: Dictionary = {}
	for p in World.roster_of(s["world"], my_team):
		mates[String(p.get("id", ""))] = true

	# 일정에 결과를 심어 맞대결을 만든다 — 실제 로스터의 내 동료를 넣는다
	var mate_id: String = ""
	for id in mates:
		if String(id) != String(s["protagonist"]["id"]):
			mate_id = String(id)
			break
	assert_str(mate_id).override_failure_message("동료를 못 찾았다").is_not_empty()

	for g in s["schedule"]:
		if not g.get("is_protagonist_game", false):
			continue
		g["day"] = 3
		g["result"] = {"winner_id": my_team, "loser_id": "TEAM_HS_HALLA",
			"player_lines": [
				_line(String(s["protagonist"]["id"]), 3.0),
				_line(mate_id, 7.0),
				_line("GEN_TEAM_HS_HALLA_Y2027_001", 5.0)]}
		break

	var faced: Array = RelationshipRunner.context_of(s, 7).get("faced_rivals", [])
	for id in faced:
		assert_bool(mates.has(String(id))).override_failure_message(
			"진짜 세계에서 아군 %s이 라이벌로 잡혔다" % id).is_false()
	assert_array(faced).override_failure_message(
		"동료에게 자리를 뺏겨 상대가 안 잡혔다").is_not_empty()
