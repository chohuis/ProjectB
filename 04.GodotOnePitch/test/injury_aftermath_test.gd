extends GdUnitTestSuite

## 부상 후유증이 **다음 성장 주에 지워지던 것** — D-4.
##
## ⚠ **읽는 쪽과 쓰는 쪽이 어긋나 있었다.** `InjuryRunner._apply_npc_penalty`가
## `stats["ovr"]`만 깎는데, `NpcGrowth`는 능력치가 오르거나 노화가 걸리면
## **`stats`에서 OVR을 다시 만든다**(`npc_growth.gd:392-394`). 다시 만드는
## 순간 후유증이 사라지고, 후유증은 **한 번만** 먹이므로(`penalty_applied`)
## 영영 안 돌아온다.
##
## 02는 그 자리에서 **세부 능력치를 깎고 나서 OVR을 다시 만든다**
## (`advanceWeek.ts:516-533`). 04도 그래야 한다.
##
## ⚠ **어느 능력치를 얼마나 깎을지는 지어내지 않는다.** `pitching_ovr`은
## 가중 평균이라 **모든 능력치를 같은 비율로 줄이면 OVR도 같은 비율로 준다** —
## 목표 OVR에 맞는 비율 하나면 된다.


func _pitcher() -> Dictionary:
	var s: Dictionary = {"velocity": 70.0, "command": 60.0, "control": 65.0,
		"movement": 55.0, "stamina": 60.0, "mentality": 50.0,
		"recovery": 50.0, "clutch": 50.0, "hold_runners": 50.0}
	s["ovr"] = PlayerGen.pitching_ovr(s)
	return {"id": "P1", "player_type": "pitcher", "pitching": s}


func test_후유증이_OVR을_깎는다() -> void:
	var p: Dictionary = _pitcher()
	var before: float = float(p["pitching"]["ovr"])
	InjuryRunner._apply_npc_penalty(p, -3.0)
	assert_float(float(p["pitching"]["ovr"])).override_failure_message(
		"후유증인데 OVR이 안 내려갔다").is_less(before)


## ⚠ **여기가 D-4다.** 성장이 OVR을 다시 만들어도 후유증이 남아야 한다
func test_다시_만들어도_후유증이_남는다() -> void:
	var p: Dictionary = _pitcher()
	InjuryRunner._apply_npc_penalty(p, -3.0)
	var after: float = float(p["pitching"]["ovr"])
	# 성장이 하는 것과 같은 일 — 능력치에서 OVR을 다시 만든다
	var rebuilt: float = PlayerGen.pitching_ovr(p["pitching"])
	assert_float(rebuilt).override_failure_message(
		"OVR을 다시 만드니 후유증이 지워졌다 (%.0f → %.0f)" % [after, rebuilt]) \
		.is_equal_approx(after, 1.0)


## 세부 능력치가 실제로 내려간다 — OVR만 만지면 화면·드래프트가 갈린다
func test_세부_능력치가_내려간다() -> void:
	var p: Dictionary = _pitcher()
	var before: float = float(p["pitching"]["velocity"])
	InjuryRunner._apply_npc_penalty(p, -5.0)
	assert_float(float(p["pitching"]["velocity"])).override_failure_message(
		"OVR만 깎고 능력치는 그대로다").is_less(before)


## 타자도 같은 자리를 지난다
func test_타자도_남는다() -> void:
	var s: Dictionary = {"contact": 65.0, "power": 60.0, "eye": 55.0,
		"discipline": 55.0, "speed": 60.0, "instinct": 55.0,
		"batting_clutch": 50.0, "fielding": 55.0, "arm": 55.0}
	s["ovr"] = PlayerGen.batting_ovr(s)
	var p: Dictionary = {"id": "B1", "player_type": "batter", "batting": s}
	InjuryRunner._apply_npc_penalty(p, -4.0)
	assert_float(PlayerGen.batting_ovr(p["batting"])).override_failure_message(
		"타자는 다시 만들면 후유증이 지워진다") \
		.is_equal_approx(float(p["batting"]["ovr"]), 1.0)


## ⚠ **바닥이 1이다.** 0에 가까운 능력치를 두면 그 선수가 다시는 못 자란다 —
## 성장은 곱셈이라 0 언저리에서 안 올라온다
func test_바닥을_안_뚫는다() -> void:
	var p: Dictionary = _pitcher()
	InjuryRunner._apply_npc_penalty(p, -999.0)
	assert_float(float(p["pitching"]["ovr"])).is_greater_equal(1.0)
	for k in p["pitching"]:
		assert_float(float(p["pitching"][k])).override_failure_message(
			"%s가 %.3f로 바닥을 뚫었다" % [k, float(p["pitching"][k])]) \
			.is_greater_equal(1.0)


## 후유증이 0이면 능력치가 그대로다 — 경상까지 만지면 안 된다.
## ⚠ **가드로 막지 않는다** — 비율이 1.0이라 저절로 그렇다.
## 부르는 자리가 이미 `delta != 0.0`으로 거른다
func test_후유증이_없으면_그대로다() -> void:
	var p: Dictionary = _pitcher()
	var before: float = float(p["pitching"]["velocity"])
	InjuryRunner._apply_npc_penalty(p, 0.0)
	assert_float(float(p["pitching"]["velocity"])).is_equal_approx(before, 0.001)
