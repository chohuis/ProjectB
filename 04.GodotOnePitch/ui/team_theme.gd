extends RefCounted
class_name TeamTheme

## 팀 색 → 화면 토큰 — U-2. 원본: 02 `shared/utils/teamTheme.ts`
##
## 02 주석이 이 기능의 뜻을 적어 뒀다:
##
## > 유니폼 안의 핵심은 **소속팀이 바뀌면 화면 색이 바뀐다**는 것이다.
## > 그게 공짜로 얻어지려면 색이 **한 곳에서만** 계산돼야 한다.
##
## 🔴 **팀 주색을 헤더에 그대로 쓰면 안 된다.** 02 실측 — 238팀 주색의 명도가
## L* 13~83이고 **130팀(55%)이 L* > 45**다. 광주 팬서스(`#F49530`)는 L*=70이라
## 흰 글씨가 죽는다. **헤더용은 항상 어둡게 보정한 값을 쓴다.**
##
## ⚠ **04 규칙("색은 `AppTheme`에서만")과 어긋나지 않는다** — 여기는 색을
## **계산**만 하고, 바르는 것은 `AppTheme`이 한다. 화면은 여전히 테마만 본다.

## 헤더 목표 명도 — 02 `HEADER_L`. 밝은 톤/어두운 톤이 다르다
const HEADER_L: Dictionary = {"light": 26.0, "dark": 32.0}

## 어두운 바탕 위의 강조(내 이름·점수) — 02 `GOLD_MIN_L`
const GOLD_MIN_L: float = 72.0

## 줄무늬·바탕에 아주 옅게 까는 팀 색 — 02 `STRIPE_ALPHA` · `WASH_ALPHA`
const STRIPE_ALPHA: float = 0.055
const WASH_ALPHA: float = 0.16

## 소속이 없는 화면(타이틀·슬롯 고르기) — 02 `DEFAULT_PRIMARY`
const DEFAULT_PRIMARY: String = "#1E3050"


static func _lin(v: float) -> float:
	return v / 12.92 if v <= 0.03928 else pow((v + 0.055) / 1.055, 2.4)


static func _srgb(v: float) -> float:
	var c: float = clampf(v, 0.0, 1.0)
	return c * 12.92 if c <= 0.0031308 else 1.055 * pow(c, 1.0 / 2.4) - 0.055


static func luminance(c: Color) -> float:
	return 0.2126 * _lin(c.r) + 0.7152 * _lin(c.g) + 0.0722 * _lin(c.b)


## CIE L* — 02 `lightness`
static func lightness(c: Color) -> float:
	var y: float = luminance(c)
	return 116.0 * pow(y, 1.0 / 3.0) - 16.0 if y > 0.008856 else 903.3 * y


## 색상을 지키면서 명도만 목표로 옮긴다 — 02 `toLightness`.
##
## ⚠ **완전한 검정은 배율로 못 올린다** — 회색으로 올린다(02와 같다)
static func to_lightness(c: Color, target_l: float) -> Color:
	if absf(lightness(c) - target_l) < 0.5:
		return c
	var target_y: float = pow((target_l + 16.0) / 116.0, 3.0) if target_l > 8.0 \
		else target_l / 903.3
	var cur_y: float = luminance(c)
	if cur_y <= 0.0:
		var g: float = _srgb(target_y)
		return Color(g, g, g)
	var k: float = target_y / cur_y
	return Color(_srgb(_lin(c.r) * k), _srgb(_lin(c.g) * k), _srgb(_lin(c.b) * k))


static func contrast_on_white_text(c: Color) -> float:
	return 1.05 / (luminance(c) + 0.05)


## 팀 색 두 개에서 화면 토큰 다섯을 낸다 — 02 `teamTokens` 그대로.
##
## ⚠ **보조색이 없거나 흰 글씨가 안 얹히면 못 쓴다** — 02는 그때 L*38로
## 보정한 값을 쓴다. 그 갈래가 없으면 밝은 보조색 위에 흰 글씨가 얹혀 죽는다
static func tokens(colors: Array, tone: String = "light") -> Dictionary:
	var primary := Color(String(colors[0]) if colors.size() > 0 else DEFAULT_PRIMARY)
	var has_second: bool = colors.size() > 1
	var secondary := Color(String(colors[1])) if has_second else primary

	var accent: Color = secondary
	if not has_second or contrast_on_white_text(secondary) < 4.5:
		accent = to_lightness(secondary, 38.0)

	return {
		# 헤더·사이드바·표 머리선 — **항상 어둡다**
		"dark": to_lightness(primary, float(HEADER_L.get(tone, 26.0))),
		# 주 행동 버튼 — 흰 글씨가 얹힌다
		"accent": accent,
		# 어두운 바탕 위의 강조 — 밝다
		"gold": to_lightness(primary, GOLD_MIN_L),
		"stripe": Color(primary.r, primary.g, primary.b, STRIPE_ALPHA),
		"wash": Color(primary.r, primary.g, primary.b, WASH_ALPHA),
	}


## 그 팀의 토큰. 팀을 모르면 기본색으로 — 화면이 비지 않는다
static func of_team(team_id: String, tone: String = "light") -> Dictionary:
	if team_id.is_empty():
		return tokens([], tone)
	return tokens(World.team_field({}, TeamMarkVm.mark_key(team_id) + "_1"
		if team_id.ends_with("_2") else team_id, "colors", []), tone)
