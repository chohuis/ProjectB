extends GdUnitTestSuite

## 팀 마크 — U-1.
##
## 🔴 **04는 `teams.json`의 `colors`를 238팀 다 갖고도 한 번도 안 썼다.**
## 02는 그 색 두 개로 마크를 조립한다(외곽 5 × 문양 12 × 띠 4).
##
## ⚠ **문양 12종은 아직 안 옮겼다** — 외곽 5 × 띠 4 = 20조합이다.
## 그래서 20팀이 넘는 그룹(대학 50)에서는 겹친다. 검사가 그 사실을 못 박는다.


func _mark(team_id: String) -> Dictionary:
	return TeamMarkVm.build(team_id)


# ── 배정 ─────────────────────────────────────────────────────────

## 02 `SHELL_ORDER` 그대로 다섯이다
func test_외곽이_다섯이다() -> void:
	assert_int(TeamMarkVm.SHELLS.size()).is_equal(5)
	assert_array(TeamMarkVm.SHELLS).is_equal(
		["shield", "circle", "hex", "wedge", "rhomb"])


## 🔴 **1군·2군은 같은 마크다**(02와 같다).
## 처음엔 달랐다 — `World.teams_of`가 2군을 걸러서 자리 번호를 못 찾고
## 폴백 해시로 떨어졌다. **실측이 잡았다**
func test_일군과_이군이_같은_마크다() -> void:
	var a: Dictionary = _mark("TEAM_KBL_BUSAN_WAVES_1")
	var b: Dictionary = _mark("TEAM_KBL_BUSAN_WAVES_2")
	assert_str(String(a["shell"])).override_failure_message(
		"1군 %s · 2군 %s" % [a["shell"], b["shell"]]).is_equal(String(b["shell"]))
	assert_int(int(a["band"])).is_equal(int(b["band"]))
	assert_str(String(a["primary"])).is_equal(String(b["primary"]))


## ⚠ **같은 권역에서는 겹치지 않는다.** 02가 그 이유를 적어 뒀다 —
## 해시로만 고르면 한 화면에 같은 마크가 둘 뜬다.
## 고교 권역은 최대 20팀이고 조합도 20이라 딱 맞는다
func test_고교_권역_안에서는_안_겹친다() -> void:
	var by_region: Dictionary = {}
	for t in World.teams_of("LEAGUE_HIGHSCHOOL"):
		var tid: String = String(t["id"])
		var g: String = TeamMarkVm.group_of(tid)
		var m: Dictionary = _mark(tid)
		var pair: String = "%s/%d" % [m["shell"], int(m["band"])]
		if not by_region.has(g):
			by_region[g] = []
		assert_bool(by_region[g].has(pair)).override_failure_message(
			"%s 권역에서 %s가 두 번 나왔다 (%s)" % [g, pair, tid]).is_false()
		by_region[g].append(pair)


## ⚠ **대학은 겹친다** — 50팀인데 조합이 20뿐이다.
## **문양 12종을 옮기면 60으로 늘어난다.** 지금 상태를 검사가 적어 둔다
func test_대학은_아직_겹친다() -> void:
	var seen: Array = []
	var dup: int = 0
	for t in World.teams_of("LEAGUE_UNIVERSITY"):
		var m: Dictionary = _mark(String(t["id"]))
		var pair: String = "%s/%d" % [m["shell"], int(m["band"])]
		if seen.has(pair):
			dup += 1
		seen.append(pair)
	assert_int(dup).override_failure_message(
		"대학에서 겹치는 수가 %d다 — 조합이 20뿐이라 30이어야 한다" % dup) \
		.is_equal(30)


## 색은 데이터가 정한다 — 화면이 고르지 않는다
func test_색이_팀_데이터에서_온다() -> void:
	var m: Dictionary = _mark("TEAM_HS_AEWOL")
	var colors: Array = World.team_field({}, "TEAM_HS_AEWOL", "colors", [])
	assert_str(String(m["primary"])).is_equal(String(colors[0]))
	assert_str(String(m["accent"])).is_equal(String(colors[1]))


## 모르는 팀도 화면이 비지 않는다 — 02도 폴백을 둔다
func test_모르는_팀도_그린다() -> void:
	var m: Dictionary = _mark("TEAM_NOPE")
	assert_array(TeamMarkVm.SHELLS).contains([String(m["shell"])])
	assert_int(int(m["band"])).is_between(0, TeamMarkVm.BANDS - 1)
	assert_str(String(m["primary"])).is_equal(TeamMarkVm.FALLBACK_PRIMARY)


# ── 그리기 ───────────────────────────────────────────────────────

func _drawn(team_id: String) -> TeamMark:
	var mark: TeamMark = auto_free(TeamMark.new())
	mark.size = Vector2(24, 24)
	mark.setup(_mark(team_id))
	return mark


## 외곽 다섯이 다 다각형을 낸다 — 하나라도 비면 그 팀이 안 보인다
func test_외곽_다섯이_다_그려진다() -> void:
	for shell in TeamMarkVm.SHELLS:
		var mark: TeamMark = auto_free(TeamMark.new())
		mark.size = Vector2(24, 24)
		mark.setup({"team_id": "T", "shell": shell, "band": 0,
			"primary": "#194980", "accent": "#C1500F"})
		assert_int(mark._shell_points().size()).override_failure_message(
			"%s 외곽이 %d점이다" % [shell, mark._shell_points().size()]) \
			.is_greater(2)


## ⚠ **띠는 외곽 안에만 그린다.** Godot엔 clip-path가 없어서 안 자르면
## 마크 밖으로 삐져나온다.
##
## ⚠ **점이 외곽 안인지로 재면 흔들린다** — 잘린 폴리곤의 점은 대부분
## **경계 위**에 있고 `is_point_in_polygon`은 경계를 애매하게 본다.
## **넓이로 잰다**: 잘린 것이 원본 띠보다 작고 외곽보다도 작으면 잘린 것이다
func test_띠가_외곽을_안_넘는다() -> void:
	for band in range(1, TeamMarkVm.BANDS):
		var mark: TeamMark = auto_free(TeamMark.new())
		mark.size = Vector2(40, 40)
		mark.setup({"team_id": "T", "shell": "circle", "band": band,
			"primary": "#194980", "accent": "#C1500F"})
		var shell: PackedVector2Array = mark._shell_points()
		var polys: Array = mark._band_polygons(shell)
		assert_int(polys.size()).override_failure_message(
			"띠 %d가 아무것도 안 그린다" % band).is_greater(0)

		var band_area: float = 0.0
		for poly in polys:
			band_area += _area(poly)
		assert_float(band_area).override_failure_message(
			"띠 %d가 외곽보다 넓다 — 안 잘렸다" % band).is_less(_area(shell))
		assert_float(band_area).override_failure_message(
			"띠 %d의 넓이가 0이다" % band).is_greater(0.0)


## 사선 띠는 마크 밖까지 뻗은 사각형이다 — 자르면 확 줄어든다
func test_사선_띠가_실제로_잘린다() -> void:
	var mark: TeamMark = auto_free(TeamMark.new())
	mark.size = Vector2(40, 40)
	mark.setup({"team_id": "T", "shell": "circle", "band": 2,
		"primary": "#194980", "accent": "#C1500F"})
	var shell: PackedVector2Array = mark._shell_points()
	var cut: float = 0.0
	for poly in mark._band_polygons(shell):
		cut += _area(poly)
	# 자르기 전 사각형은 마크 폭(-10~110)을 넘는다
	assert_float(cut).override_failure_message(
		"사선 띠가 안 잘렸다 — %f" % cut).is_less(mark.size.x * mark.size.y * 0.5)


func _area(poly: PackedVector2Array) -> float:
	var a: float = 0.0
	for i in poly.size():
		var p: Vector2 = poly[i]
		var q: Vector2 = poly[(i + 1) % poly.size()]
		a += p.x * q.y - q.x * p.y
	return absf(a) * 0.5


## 띠 0은 안 그린다 — 없는 것을 그리면 조합이 하나 줄어든다
func test_띠_없음은_안_그린다() -> void:
	var mark: TeamMark = auto_free(TeamMark.new())
	mark.size = Vector2(24, 24)
	mark.setup({"team_id": "T", "shell": "hex", "band": 0,
		"primary": "#194980", "accent": "#C1500F"})
	assert_int(mark._band_polygons(mark._shell_points()).size()).is_equal(0)


# ── 대비 ─────────────────────────────────────────────────────────

## ⚠ **02가 무엇을 재는지 읽고 나서 세웠다.**
## `scripts/check-teamcolors.cjs:15`가 정본이다 —
## **"보조색 위에 흰 글씨 — 대비 4.5:1 이상"**. 주색이 아니다.
##
## 🔴 **처음엔 주색에 4.5:1을 걸었다가 101팀 미달이 나왔다.** 02 규칙을
## 잘못 읽은 것이었다 — **04 데이터를 02 규칙이라 착각한 검사**가 될 뻔했다.
##
## ⚠ **국내만 잰다.** 02도 그렇다 — 해외(ABL·JBL)는 실제 구단 색을 그대로
## 써서 밝은 색이 섞여 있다(실측: 238팀 중 50팀 미달, 전부 해외).
## 국내 172팀은 **전부 통과**한다
const DOMESTIC: Array[String] = ["LEAGUE_KBL", "LEAGUE_HIGHSCHOOL",
	"LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"]


func _white_ratio(c: Color) -> float:
	var l: float = 0.2126 * _lin(c.r) + 0.7152 * _lin(c.g) + 0.0722 * _lin(c.b)
	return 1.05 / (l + 0.05)


func _lin(v: float) -> float:
	return v / 12.92 if v <= 0.03928 else pow((v + 0.055) / 1.055, 2.4)


## 보조색 위의 흰 글씨가 읽힌다 — 마크에 흰 문양을 얹을 자리다
func test_국내_보조색_위에서_흰색이_읽힌다() -> void:
	var bad: Array = []
	for lid in DOMESTIC:
		for t in World.teams_of(lid):
			var m: Dictionary = TeamMarkVm.build(String(t["id"]))
			var r: float = _white_ratio(Color(String(m["accent"])))
			if r < 4.5:
				bad.append("%s %s %.2f" % [t["id"], m["accent"], r])
	assert_int(bad.size()).override_failure_message(
		"보조색 위에서 흰 글씨가 안 읽히는 국내 팀 %d개: %s"
		% [bad.size(), ", ".join(PackedStringArray(bad.slice(0, 5)))]).is_equal(0)


## ⚠ **해외는 안 잰다** — 실제 구단 색이라 밝은 것이 섞여 있다.
## 그 사실을 검사가 적어 둔다(모르고 규칙을 넓히면 데이터를 고치게 된다)
func test_해외는_밝은_색이_섞여_있다() -> void:
	var bad: int = 0
	for lid in ["LEAGUE_ABL", "LEAGUE_JBL"]:
		for t in World.teams_of(lid):
			var m: Dictionary = TeamMarkVm.build(String(t["id"]))
			if _white_ratio(Color(String(m["accent"]))) < 4.5:
				bad += 1
	assert_int(bad).override_failure_message(
		"해외 미달이 %d팀이다 — 데이터가 바뀌었으면 이 검사를 다시 본다" % bad) \
		.is_greater(0)
