extends GdUnitTestSuite

## 경기 전 브리핑 — F-5. **누구를 상대하는지 못 봤다.**
##
## ⚠ 04는 "지금 무슨 일이 벌어지는가"는 다 보여주는데(점수·이닝·카운트·주자)
## **상대 타자가 이름 한 줄이었다.** 승부처인지 아닌지를 알 수가 없었다.
## 02는 경기 전에 상대 선발을 OVR·구속·무브먼트·커맨드로 보여주고, 상대
## 타선을 표로 준다(번·이름·포지션·OVR·성적·**주의사항**).
##
## ⚠ **04는 타순과 선발을 이미 만들어 둔다**(`MatchDay._make_state`).
## 브리핑은 **새로 계산하지 않고 그걸 보여주기만 한다** — 화면이 자기 목록을
## 따로 만들면 그게 두 번째 정본이 된다(02 드래프트 보드가 그랬다).
##
## 원본: `features/pre-game-briefing/ui/PreGameBriefingModal.svelte`


func _batter(id: String, over: Dictionary = {}) -> Dictionary:
	var b: Dictionary = {"id": id, "name": id, "position": "CF",
		"contact": 50.0, "power": 50.0, "eye": 50.0, "discipline": 50.0,
		"platoon": 50.0, "ovr": 55.0}
	b.merge(over, true)
	return b


func _state(over: Dictionary = {}) -> Dictionary:
	var away: Array = []
	for i in 9:
		away.append(_batter("A%d" % i))
	var s: Dictionary = {
		"half": "top", "pitch_count": 0,
		"home_pitcher": {"id": "HP", "name": "홈선발", "position": "SP",
			"velocity": 70.0, "movement": 60.0, "command": 58.0, "ovr": 66.0},
		"away_pitcher": {"id": "AP", "name": "원정선발", "position": "SP",
			"velocity": 64.0, "movement": 55.0, "command": 52.0, "ovr": 60.0},
		"home_lineup": [], "away_lineup": away,
	}
	s.merge(over, true)
	return s


## 주인공이 홈이면 상대는 원정이다
func _ctx(mine: String = "home") -> Dictionary:
	return {"my_side": mine, "names": {}}


# ── 무엇을 보여주나 ───────────────────────────────────────────

func test_it_shows_the_opposing_starter() -> void:
	var b: Dictionary = BriefingVm.build(_state(), _ctx("home"))
	var st: Dictionary = b["starter"]
	assert_str(String(st["name"])).is_equal("원정선발")
	assert_int(int(st["ovr"])).is_equal(60)
	# ⚠ **능력치를 보여줘야 한다.** 이름만 있으면 어떤 투수인지 모른다
	assert_array(st.keys()).contains(["velocity", "movement", "command"])


## ⚠ **상대가 누구인지는 내가 어느 편인가에 달렸다.** 뒤집히면 자기 팀
## 선발을 스카우팅하는 화면이 된다
func test_the_side_decides_who_the_opponent_is() -> void:
	assert_str(String(BriefingVm.build(_state(), _ctx("home"))["starter"]["name"])
		).is_equal("원정선발")
	assert_str(String(BriefingVm.build(_state(), _ctx("away"))["starter"]["name"])
		).is_equal("홈선발")


func test_it_shows_nine_batters_in_order() -> void:
	var rows: Array = BriefingVm.build(_state(), _ctx("home"))["lineup"]
	assert_int(rows.size()).is_equal(9)
	for i in rows.size():
		assert_int(int(rows[i]["order"])).is_equal(i + 1)


# ── 주의사항 (02 `threatLevel`) ───────────────────────────────

## 02: 파워 68 이상이거나 클러치 66 이상이면 2
func test_a_slugger_is_the_top_threat() -> void:
	var away: Array = [_batter("A0", {"power": 70.0})]
	for i in range(1, 9):
		away.append(_batter("A%d" % i))
	var rows: Array = BriefingVm.build(_state({"away_lineup": away}),
		_ctx("home"))["lineup"]
	assert_int(int(rows[0]["threat"])).is_equal(2)
	assert_str(String(rows[0]["note"])).is_not_empty()


## 02: 파워 62 이상 · 눈 40 이하 · 참을성 40 이하 · 좌우 42 이하 중 하나면 1
func test_a_middling_bat_is_a_lesser_threat() -> void:
	var away: Array = [_batter("A0", {"power": 63.0})]
	for i in range(1, 9):
		away.append(_batter("A%d" % i))
	var rows: Array = BriefingVm.build(_state({"away_lineup": away}),
		_ctx("home"))["lineup"]
	assert_int(int(rows[0]["threat"])).is_equal(1)


func test_an_average_bat_is_no_threat() -> void:
	var rows: Array = BriefingVm.build(_state(), _ctx("home"))["lineup"]
	assert_int(int(rows[0]["threat"])).is_equal(0)
	assert_str(String(rows[0]["note"])).is_empty()


## ⚠ **문턱이 02 그대로여야 한다.** 여기 숫자를 04에서 새로 정하면
## "누가 무서운 타자인가"가 02와 다른 게임이 된다
func test_the_threat_thresholds_match_the_original() -> void:
	assert_int(BriefingVm.threat_of(_batter("x", {"power": 68.0}))).is_equal(2)
	assert_int(BriefingVm.threat_of(_batter("x", {"power": 67.0}))).is_equal(1)
	assert_int(BriefingVm.threat_of(_batter("x", {"batting_clutch": 66.0}))).is_equal(2)
	assert_int(BriefingVm.threat_of(_batter("x", {"eye": 40.0}))).is_equal(1)
	assert_int(BriefingVm.threat_of(_batter("x", {"discipline": 40.0}))).is_equal(1)
	assert_int(BriefingVm.threat_of(_batter("x", {"platoon": 42.0}))).is_equal(1)
	assert_int(BriefingVm.threat_of(_batter("x"))).is_equal(0)


# ── 언제 뜨나 ─────────────────────────────────────────────────

## ⚠ **첫 공을 던지면 사라진다.** 경기 중에 계속 떠 있으면 지금 벌어지는
## 일을 가린다 — 02도 경기 전에만 띄웠다
func test_it_is_gone_once_the_game_starts() -> void:
	var b: Dictionary = BriefingVm.build(_state({"pitch_count": 12}), _ctx("home"))
	assert_bool(b.is_empty()).is_true()


func test_an_empty_state_does_not_break() -> void:
	assert_bool(BriefingVm.build({}, {}).is_empty()).is_true()


# ── 화면에 실제로 뜨는가 ──────────────────────────────────────
#
# ⚠ **사전만 맞고 화면이 안 그리면 없는 것과 같다.** 이번 세션에서 그 종류로
# 결함 넷을 찾았다


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _mount(vm: Dictionary) -> MatchScreen:
	var s: MatchScreen = preload("res://ui/screens/match_screen.tscn").instantiate()
	s.set_view_model(vm)
	add_child(s)
	await await_idle_frame()
	return s


func test_the_screen_shows_the_briefing() -> void:
	var vm: Dictionary = {"briefing": BriefingVm.build(_state(), _ctx("home"))}
	var t := _texts(await _mount(vm))
	assert_array(t).contains(["상대 타선"])
	var joined: String = " ".join(t)
	assert_str(joined).contains("원정선발")
	assert_str(joined).contains("구위 64")


## ⚠ **첫 공을 던지면 사라진다.** 경기 중에 계속 떠 있으면 지금 벌어지는
## 일을 가린다
func test_the_screen_drops_the_briefing_once_pitching() -> void:
	var vm: Dictionary = {"briefing": BriefingVm.build(
		_state({"pitch_count": 5}), _ctx("home"))}
	assert_array(_texts(await _mount(vm))).not_contains(["상대 타선"])


## ⚠ **이름이 원문 id로 새면 안 된다.** 경기 상태의 타자 사전엔 `id`만
## 있어서, `ctx["names"]`를 안 보면 화면에
## `GEN_TEAM_HS_YUSEONG_777_Y2027_030`이 그대로 뜬다 — **실제로 그렇게
## 찍혔고 검사는 통과했다.** 가짜 사전에 `name`을 넣어 뒀기 때문이다
func test_names_come_from_the_context() -> void:
	var away: Array = []
	for i in 9:
		# **`name`을 일부러 안 넣는다** — 진짜 경기 상태가 그렇다
		away.append({"id": "GEN_%d" % i, "position": "CF", "power": 50.0,
			"eye": 50.0, "discipline": 50.0, "platoon": 50.0, "ovr": 55.0})
	var s: Dictionary = _state({"away_lineup": away,
		"away_pitcher": {"id": "GEN_P", "position": "SP", "ovr": 60.0}})
	var ctx: Dictionary = {"my_side": "home",
		"names": {"GEN_0": "송태준", "GEN_P": "윤기식"}}
	var b: Dictionary = BriefingVm.build(s, ctx)
	assert_str(String(b["starter"]["name"])).is_equal("윤기식")
	assert_str(String(b["lineup"][0]["name"])).is_equal("송태준")


## ⚠ **OVR이 0으로 뜨면 안 된다.** 경기 상태에 `ovr`을 안 실으면 브리핑이
## 전부 0이 된다 — 이것도 실제로 그렇게 찍혔다
func test_the_match_state_carries_the_ovr() -> void:
	var roster: Array = []
	for i in 12:
		roster.append({"id": "P%d" % i, "name": "선수%d" % i, "position": "CF",
			"batting": {"ovr": 60.0 + i, "contact": 50.0, "power": 50.0},
			"pitching": {"ovr": 55.0 + i, "velocity": 60.0, "command": 50.0,
				"control": 50.0, "movement": 50.0, "stamina": 60.0}})
	var st: Dictionary = MatchDay._make_state(roster, roster,
		roster[0], roster[1])
	for b in st["away_lineup"]:
		assert_float(float(b.get("ovr", 0.0))).override_failure_message(
			"경기 상태에 OVR이 없다 — 브리핑이 전부 0으로 뜬다").is_greater(0.0)
	assert_float(float(st["away_pitcher"].get("ovr", 0.0))).is_greater(0.0)
