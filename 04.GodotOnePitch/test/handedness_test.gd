extends GdUnitTestSuite

## 투구·타격 방향 — F-6a.
##
## 원본: `roster_gen.rs:558` · `:727` (둘이 같은 식이다)
##
## ```rust
## let handedness = if rng.next() < (if is_pitcher { 0.30 } else { 0.35 }) { "L" } else { "R" };
## ```
##
## **투수 30% 좌완 · 야수 35% 좌타.** `military_roster.rs:199`만 0.30 고정인데
## 그쪽은 투수·야수를 안 가른다.
##
## ⚠ **"S"(양손)는 NPC에 없다.** 02 `NewGamePage`의 선택지도 R·L 둘뿐이고
## `handednessLabel`에만 S가 적혀 있다 — 라벨만 있는 죽은 값이다.
##
## ⚠ **해시 기반으로 뽑는다.** 02처럼 흐름 난수(`rng.randf()`)를 `roster()`
## 안에 하나 더 끼우면 **그 뒤 모든 난수가 밀려** 세계가 통째로 달라진다.
## 밸런스 실측을 유지하려면 순서와 무관해야 한다 — `Rng.value_for`가 그것이다.

const PIT_LEFT: float = 0.30
const BAT_LEFT: float = 0.35


func _roster(count: int, pitcher_ratio: float) -> Array:
	return PlayerGen.roster({
		"count": count, "school_id": "SCH_T", "team_id": "TEAM_T",
		"league_id": "LEAGUE_KBL", "season_year": 2026,
		"pitcher_ratio": pitcher_ratio, "age_min": 20, "age_max": 30,
	})


func test_모든_선수가_방향을_갖는다() -> void:
	for p in _roster(40, 0.45):
		var h: String = String(p.get("handedness", ""))
		assert_bool(h == "L" or h == "R").override_failure_message(
			"방향이 L·R이 아니다: '%s'" % h).is_true()


func test_양손은_안_나온다() -> void:
	# 02 NPC 생성에 "S" 갈래가 없다. 만들면 이름·화면이 그 값을 모른다
	for p in _roster(200, 0.45):
		assert_str(String(p["handedness"])).is_not_equal("S")


func test_같은_선수는_늘_같은_방향이다() -> void:
	# 해시 기반이므로 두 번 만들어도 같아야 한다
	var a: Array = _roster(30, 0.45)
	var b: Array = _roster(30, 0.45)
	for k in a.size():
		assert_str(String(a[k]["handedness"])).is_equal(String(b[k]["handedness"]))


func test_투수는_좌완이_30퍼센트다() -> void:
	var left: int = 0
	var total: int = 0
	for p in _roster(600, 1.0):
		if String(p["player_type"]) != "pitcher":
			continue
		total += 1
		if String(p["handedness"]) == "L":
			left += 1
	assert_int(total).is_greater(400)
	var ratio: float = float(left) / float(total)
	assert_float(ratio).override_failure_message(
		"투수 좌완 %.3f — 02는 %.2f다" % [ratio, PIT_LEFT]) \
		.is_between(PIT_LEFT - 0.06, PIT_LEFT + 0.06)


func test_야수는_좌타가_35퍼센트다() -> void:
	var left: int = 0
	var total: int = 0
	for p in _roster(600, 0.0):
		if String(p["player_type"]) != "batter":
			continue
		total += 1
		if String(p["handedness"]) == "L":
			left += 1
	assert_int(total).is_greater(400)
	var ratio: float = float(left) / float(total)
	assert_float(ratio).override_failure_message(
		"야수 좌타 %.3f — 02는 %.2f다" % [ratio, BAT_LEFT]) \
		.is_between(BAT_LEFT - 0.06, BAT_LEFT + 0.06)


## ⚠ **투수와 야수의 문턱이 다르다.** 하나로 합치면 이 검사가 잡는다
func test_투수가_야수보다_좌가_적다() -> void:
	var pit: float = _left_ratio(_roster(800, 1.0), "pitcher")
	var bat: float = _left_ratio(_roster(800, 0.0), "batter")
	assert_float(pit).override_failure_message(
		"투수 좌 %.3f · 야수 좌 %.3f — 문턱이 하나로 합쳐졌다" % [pit, bat]) \
		.is_less(bat)


func _left_ratio(roster: Array, want: String) -> float:
	var left: int = 0
	var total: int = 0
	for p in roster:
		if String(p["player_type"]) != want:
			continue
		total += 1
		if String(p["handedness"]) == "L":
			left += 1
	return float(left) / float(maxi(total, 1))


## 진짜 세계로 본다 — `roster()`가 유일한 생성 경로가 아니면 여기서 걸린다
func test_진짜_세계의_선수가_전부_방향을_갖는다() -> void:
	var world: Dictionary = World.build({"seed": 4242, "season_year": 2027})
	var missing: int = 0
	var total: int = 0
	var left: int = 0
	for team_id in world.get("rosters", {}):
		for p in World.roster_of(world, String(team_id)):
			total += 1
			var h: String = String(p.get("handedness", ""))
			if h == "L":
				left += 1
			elif h != "R":
				missing += 1
	assert_int(total).is_greater(3000)
	assert_int(missing).override_failure_message(
		"%d/%d명이 방향이 없다 — 다른 생성 경로가 있다" % [missing, total]).is_equal(0)
	# 투수·야수가 섞여 있으니 0.30~0.35 사이에 든다
	var ratio: float = float(left) / float(total)
	assert_float(ratio).override_failure_message(
		"세계 전체 좌 %.3f" % ratio).is_between(0.28, 0.38)


func test_화면_한_줄에_방향이_들어간다() -> void:
	# 투수는 "투", 야수는 "타" — 야수한테 "좌투"라고 쓰면 던지는 손 이야기가 된다
	assert_str(PlayerDetailVm.handedness_label("L", true)).is_equal("좌투")
	assert_str(PlayerDetailVm.handedness_label("R", true)).is_equal("우투")
	assert_str(PlayerDetailVm.handedness_label("L", false)).is_equal("좌타")
	assert_str(PlayerDetailVm.handedness_label("R", false)).is_equal("우타")
	# 옛 세이브엔 축이 없다. "우투"로 채우면 없는 것과 오른손이 안 갈린다
	assert_str(PlayerDetailVm.handedness_label("", true)).is_equal("")
	assert_str(PlayerDetailVm.handedness_label("S", true)).is_equal("")


## 난수 흐름을 안 밀었나 — **밸런스가 여기에 걸린다.**
## 방향을 뽑느라 흐름을 한 칸 밀면 그 뒤 능력치가 전부 달라진다
func test_능력치가_안_밀렸다() -> void:
	var r: Array = _roster(5, 0.45)
	# 값을 못 박는다 — 흐름이 밀리면 이 숫자가 바뀐다
	assert_float(float(r[0]["pitching"]["ovr"])).is_equal_approx(54.0, 0.01)
	assert_float(float(r[0]["batting"]["ovr"])).is_equal_approx(69.0, 0.01)
	assert_int(int(r[0]["age"])).is_equal(22)
	assert_float(float(r[4]["pitching"]["ovr"])).is_equal_approx(68.0, 0.01)
	assert_int(int(r[4]["age"])).is_equal(26)
