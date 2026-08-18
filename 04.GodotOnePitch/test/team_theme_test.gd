extends GdUnitTestSuite

## 팀 색 → 화면 토큰 — U-2. 원본: 02 `shared/utils/teamTheme.ts`
##
## 🔴 **팀 주색을 헤더에 그대로 쓰면 흰 글씨가 죽는다.** 02 실측 —
## 238팀 주색 L* 13~83이고 130팀(55%)이 L* > 45다.
## **헤더용은 항상 어둡게 보정한다** — 그 규칙을 안 옮기면 화면이 안 읽힌다.

const DOMESTIC: Array[String] = ["LEAGUE_KBL", "LEAGUE_HIGHSCHOOL",
	"LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"]


## 02 `HEADER_L` 그대로 — 밝은 톤 26 · 어두운 톤 32
func test_헤더_색이_목표_명도로_내려간다() -> void:
	for tone in ["light", "dark"]:
		var t: Dictionary = TeamTheme.of_team("TEAM_KBL_GWANGJU_PANTHERS_1", tone)
		var l: float = TeamTheme.lightness(t["dark"])
		assert_float(l).override_failure_message(
			"%s 톤 헤더가 L*%.1f다 — %.0f이어야 한다"
			% [tone, l, TeamTheme.HEADER_L[tone]]) \
			.is_equal_approx(float(TeamTheme.HEADER_L[tone]), 1.0)


## 🔴 **02가 이름까지 적어 둔 팀** — 광주 팬서스는 주색 L*=70이라
## 그대로 쓰면 흰 글씨가 죽는다
func test_밝은_주색도_헤더에서는_어두워진다() -> void:
	var colors: Array = World.team_field({}, "TEAM_KBL_GWANGJU_PANTHERS_1",
		"colors", [])
	var raw: float = TeamTheme.lightness(Color(String(colors[0])))
	assert_float(raw).override_failure_message(
		"광주 팬서스 주색이 L*%.0f다 — 02 실측은 70이다" % raw).is_greater(45.0)

	var head: Color = TeamTheme.of_team("TEAM_KBL_GWANGJU_PANTHERS_1")["dark"]
	assert_float(TeamTheme.contrast_on_white_text(head)).override_failure_message(
		"헤더 위 흰 글씨 대비가 %.2f다" %
		TeamTheme.contrast_on_white_text(head)).is_greater(4.5)


## **국내 전 팀**이 헤더에서 흰 글씨를 받는다 — 한 팀이라도 죽으면
## 그 팀을 고른 사람만 화면이 안 읽힌다
func test_국내_전_팀_헤더에서_흰_글씨가_읽힌다() -> void:
	var bad: Array = []
	for lid in DOMESTIC:
		for t in World.teams_of(lid):
			for tone in ["light", "dark"]:
				var head: Color = TeamTheme.of_team(String(t["id"]), tone)["dark"]
				if TeamTheme.contrast_on_white_text(head) < 4.5:
					bad.append("%s %s" % [t["id"], tone])
	assert_int(bad.size()).override_failure_message(
		"헤더에서 흰 글씨가 죽는 팀 %d개: %s"
		% [bad.size(), ", ".join(PackedStringArray(bad.slice(0, 5)))]).is_equal(0)


## ⚠ **보조색이 밝으면 안 쓴다** — 02는 L*38로 보정한 값을 쓴다.
## 그 갈래가 없으면 밝은 보조색 위의 흰 글씨가 죽는다
func test_밝은_보조색은_보정해서_쓴다() -> void:
	# 흰색에 가까운 보조색 — 그대로 쓰면 흰 글씨가 안 보인다
	var t: Dictionary = TeamTheme.tokens(["#1E3050", "#F2F2F2"])
	assert_float(TeamTheme.contrast_on_white_text(t["accent"])) \
		.override_failure_message("밝은 보조색을 그대로 썼다") \
		.is_greater_equal(4.5)


## 쓸 만한 보조색은 그대로 쓴다 — 02도 데이터를 믿는다
func test_쓸_만한_보조색은_그대로_쓴다() -> void:
	var t: Dictionary = TeamTheme.tokens(["#1E3050", "#C1500F"])
	assert_str(Color(t["accent"]).to_html(false)).is_equal("c1500f")


## 어두운 바탕 위의 강조는 밝다 — 02 `GOLD_MIN_L` 72
func test_강조색은_밝다() -> void:
	for tid in ["TEAM_HS_AEWOL", "TEAM_KBL_GWANGJU_PANTHERS_1"]:
		var gold: Color = TeamTheme.of_team(tid)["gold"]
		assert_float(TeamTheme.lightness(gold)).override_failure_message(
			"%s 강조색이 L*%.0f다" % [tid, TeamTheme.lightness(gold)]) \
			.is_greater(65.0)


## 소속이 없으면 기본색 — 타이틀·슬롯 고르기에서 화면이 비지 않는다
func test_소속이_없으면_기본색이다() -> void:
	var a: Dictionary = TeamTheme.of_team("")
	var b: Dictionary = TeamTheme.tokens([])
	assert_str(Color(a["dark"]).to_html(false)).is_equal(
		Color(b["dark"]).to_html(false))


## 1군·2군은 같은 색이다 — 같은 구단이다
func test_일군과_이군이_같은_색이다() -> void:
	var a: Dictionary = TeamTheme.of_team("TEAM_KBL_BUSAN_WAVES_1")
	var b: Dictionary = TeamTheme.of_team("TEAM_KBL_BUSAN_WAVES_2")
	assert_str(Color(a["dark"]).to_html(false)).is_equal(
		Color(b["dark"]).to_html(false))


## 옅게 까는 색은 투명도를 갖는다 — 02 `STRIPE_ALPHA`·`WASH_ALPHA`
func test_줄무늬와_바탕은_옅다() -> void:
	var t: Dictionary = TeamTheme.of_team("TEAM_HS_AEWOL")
	assert_float(Color(t["stripe"]).a).is_equal_approx(TeamTheme.STRIPE_ALPHA, 0.001)
	assert_float(Color(t["wash"]).a).is_equal_approx(TeamTheme.WASH_ALPHA, 0.001)


# ── 화면에 닿나 ──────────────────────────────────────────────────

## 🔴 **계산만 하고 화면이 안 쓰면 없는 것과 같다**(형태 ①).
## `AppTheme`이 팀 색을 들고, 헤더가 그것을 쓴다
func test_테마가_팀_색을_든다() -> void:
	AppTheme.apply_team("TEAM_HS_AEWOL")
	var expect: Dictionary = TeamTheme.of_team("TEAM_HS_AEWOL", AppTheme.tone)
	assert_str(Color(AppTheme.TEAM_DARK).to_html(false)).is_equal(
		Color(expect["dark"]).to_html(false))
	assert_str(AppTheme.team_id).is_equal("TEAM_HS_AEWOL")


## ⚠ **톤을 바꾸면 팀 색도 다시 뽑는다** — 헤더 목표 명도가 톤마다 다르다
func test_톤을_바꾸면_팀_색도_바뀐다() -> void:
	var before: String = AppTheme.tone
	AppTheme.apply_team("TEAM_HS_AEWOL")
	AppTheme.apply_tone("light")
	var light: Color = AppTheme.TEAM_DARK
	AppTheme.apply_tone("dark")
	var dark: Color = AppTheme.TEAM_DARK
	AppTheme.apply_tone(before)

	assert_float(TeamTheme.lightness(light)).is_equal_approx(26.0, 1.0)
	assert_float(TeamTheme.lightness(dark)).is_equal_approx(32.0, 1.0)
