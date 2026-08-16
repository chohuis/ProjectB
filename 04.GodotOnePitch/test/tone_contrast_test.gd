extends GdUnitTestSuite

## 관계 7색 — U-8. **이웃끼리 안 갈렸다.**
##
## 관계는 −100~100인데 플레이어에게 보이는 건 **라벨 일곱과 색뿐**이다
## (`relationship.gd:42-50`). 이웃 색이 안 갈리면 "우호와 신뢰가 뭐가
## 다른지"를 화면에서 못 읽는다 — UI 보고서가 **신뢰↔각별 대비 1.06**을
## 쟀다(1.0이 같은 색이다).
##
## ⚠ **02는 배지를 배경+글자 쌍으로 갈랐다**(`PeoplePage.svelte:266-272`) —
## 밝은 테마라 연한 배경(#D5EADD)과 진한 배경(--ok)이 확 다르다. 04는
## 어두운 테마에 색 하나로 배경(18%)·테두리(55%)·글자를 파생하므로
## (`theme.gd:pill_style`) **그 색 자체가 갈려야 한다.**


## 관계 라벨 순서 그대로 — `Relationship.LABELS`가 정본이다
func _tones() -> PackedStringArray:
	var out := PackedStringArray()
	for row in Relationship.LABELS:
		out.append(String(row[3]))
	return out


## WCAG 상대 휘도
func _luminance(c: Color) -> float:
	var parts: Array = [c.r, c.g, c.b]
	var lin: Array = []
	for v in parts:
		var x: float = float(v)
		lin.append(x / 12.92 if x <= 0.03928 else pow((x + 0.055) / 1.055, 2.4))
	return 0.2126 * float(lin[0]) + 0.7152 * float(lin[1]) + 0.0722 * float(lin[2])


## 명도 대비비 (1.0 = 같은 밝기)
func _contrast(a: Color, b: Color) -> float:
	var la: float = _luminance(a)
	var lb: float = _luminance(b)
	return (maxf(la, lb) + 0.05) / (minf(la, lb) + 0.05)


# ── 일곱이 다 있는가 ──────────────────────────────────────────

## ⚠ **라벨과 색은 짝이다.** 하나라도 빠지면 그 관계가 기본색으로 떨어져
## 이웃과 완전히 같아진다
func test_every_label_has_a_colour() -> void:
	for tone in _tones():
		assert_bool(AppTheme.TONE_COLOR.has(tone)).override_failure_message(
			"관계 톤 '%s'에 색이 없다" % tone).is_true()
	assert_int(AppTheme.TONE_COLOR.size()).is_equal(Relationship.LABELS.size())
	assert_int(AppTheme.TONE_COLOR.size()).is_equal(7)


## 일곱 색이 서로 다르다 — 같은 값이 둘이면 두 관계가 한 색이다
func test_no_two_tones_share_a_colour() -> void:
	var seen: Dictionary = {}
	for tone in _tones():
		var hex: String = AppTheme.TONE_COLOR[tone].to_html(false)
		assert_bool(seen.has(hex)).override_failure_message(
			"'%s'가 '%s'와 같은 색이다 (%s)" % [tone, seen.get(hex, ""), hex]
			).is_false()
		seen[hex] = tone


# ── 이웃이 갈리는가 ───────────────────────────────────────────

## 이웃 사이 최소 대비. **1.0이 같은 밝기다** — U-8 이전 신뢰↔각별이 1.06,
## 즉 사실상 같은 색이었다.
##
## ⚠ **명도만으로 가른다.** 색상(hue)이 달라도 어두운 화면에서 같은 밝기면
## 나란히 놓았을 때 구분이 안 된다 — 배지가 줄줄이 붙어 뜨는 자리라 더 그렇다
const NEIGHBOUR_MIN: float = 1.25


func test_neighbouring_tones_are_distinguishable() -> void:
	var tones := _tones()
	for i in range(tones.size() - 1):
		var a: Color = AppTheme.TONE_COLOR[tones[i]]
		var b: Color = AppTheme.TONE_COLOR[tones[i + 1]]
		var ratio: float = _contrast(a, b)
		assert_float(ratio).override_failure_message(
			"'%s'와 '%s'의 대비가 %.2f다 (%s vs %s) — 나란히 두면 같은 색으로 보인다"
				% [tones[i], tones[i + 1], ratio,
				a.to_html(false), b.to_html(false)]
			).is_greater_equal(NEIGHBOUR_MIN)


## ⚠ **어두운 배경에서 읽혀야 한다.** 배지 글자가 그 색이므로 배경 대비가
## 낮으면 아예 안 보인다
func test_every_tone_reads_on_the_dark_background() -> void:
	for tone in _tones():
		var ratio: float = _contrast(AppTheme.TONE_COLOR[tone], AppTheme.BG)
		assert_float(ratio).override_failure_message(
			"'%s'가 배경에 묻힌다 (대비 %.2f)" % [tone, ratio]).is_greater_equal(3.0)


## ⚠ **좋은 쪽과 나쁜 쪽이 색으로 갈려야 한다.** 적대가 초록이면
## 관계도가 거짓말을 한다 — 나쁜 쪽은 붉고 좋은 쪽은 푸르거나 초록이다
func test_the_bad_side_is_warm_and_the_good_side_is_not() -> void:
	for tone in ["hostile", "distrust"]:
		var c: Color = AppTheme.TONE_COLOR[tone]
		assert_float(c.r).override_failure_message(
			"'%s'가 붉지 않다" % tone).is_greater(c.g)
	for tone in ["friendly", "trusted", "close"]:
		var c: Color = AppTheme.TONE_COLOR[tone]
		assert_float(c.r).override_failure_message(
			"'%s'가 붉다 — 좋은 관계인데 경고색으로 보인다" % tone).is_less(
			maxf(c.g, c.b))


## 중립은 무채색에 가깝다 — 색이 붙으면 "아무 사이도 아니다"가 안 읽힌다
func test_the_neutral_tone_is_greyish() -> void:
	var c: Color = AppTheme.TONE_COLOR["neutral"]
	var spread: float = maxf(c.r, maxf(c.g, c.b)) - minf(c.r, minf(c.g, c.b))
	assert_float(spread).override_failure_message(
		"중립에 색이 붙었다 (편차 %.2f)" % spread).is_less(0.12)
