extends GdUnitTestSuite

## 화면 톤 — 밝게 / 어둡게 / 시스템 따름.
##
## 원본: 02 `settings.ts:16`(세 갈래) · `utils/theme.ts:20`(`resolveTone`) ·
## `SettingsModal.svelte:72-82`(radiogroup) · `styles.css`(값 두 벌).
##
## ⚠ **04는 "톤이 하나라 안 넣는다"고 적어 뒀었다**(`settings_screen.gd:9-11`).
## 사용자가 그 결정을 뒤집었다(2026-08-18). **주석은 결정 기록이지 금지가
## 아니다.**
##
## ⚠ **값을 지어내지 않았다.** 어두운 값은 04가 쓰던 그대로, 밝은 값은 02
## `styles.css`가 U5에서 정한 그대로다.


func after() -> void:
	# 다른 검사가 색을 읽으므로 어두움으로 되돌린다
	AppTheme.apply_tone("dark")


# ── 설정값 → 톤 ───────────────────────────────────────────────

func test_밝게는_밝다() -> void:
	assert_str(Settings.resolve_tone("light", true)).is_equal("light")
	assert_str(Settings.resolve_tone("light", false)).is_equal("light")


func test_어둡게는_어둡다() -> void:
	assert_str(Settings.resolve_tone("dark", true)).is_equal("dark")
	assert_str(Settings.resolve_tone("dark", false)).is_equal("dark")


## ⚠ **`system`만 OS를 본다.** 다른 둘까지 OS를 보면 고른 게 무시된다
func test_시스템_따름은_OS를_본다() -> void:
	assert_str(Settings.resolve_tone("system", true)).is_equal("dark")
	assert_str(Settings.resolve_tone("system", false)).is_equal("light")


## 모르는 값이 오면 기본으로 — 설정 파일은 사람이 고칠 수 있다
func test_모르는_값은_시스템_따름이다() -> void:
	assert_str(Settings.resolve_tone("보라색", false)).is_equal("light")


# ── 톤 → 색 ───────────────────────────────────────────────────

## ⚠ **여기가 이 기능의 전부다.** 톤을 바꾸면 바탕과 글자가 뒤집힌다
func test_톤을_바꾸면_바탕과_글자가_뒤집힌다() -> void:
	AppTheme.apply_tone("dark")
	var dark_bg: Color = AppTheme.BG
	var dark_text: Color = AppTheme.TEXT
	AppTheme.apply_tone("light")
	assert_float(AppTheme.BG.v).override_failure_message(
		"밝은 톤인데 바탕이 안 밝아졌다").is_greater(dark_bg.v)
	assert_float(AppTheme.TEXT.v).override_failure_message(
		"밝은 톤인데 글자가 안 어두워졌다").is_less(dark_text.v)


## 밝은 톤에서 바탕과 글자가 실제로 읽히나 — 명도 차가 충분해야 한다
func test_두_톤_다_읽힌다() -> void:
	for tone in ["light", "dark"]:
		AppTheme.apply_tone(tone)
		assert_float(absf(AppTheme.BG.v - AppTheme.TEXT.v)) \
			.override_failure_message("%s 톤에서 바탕과 글자가 안 갈린다" % tone) \
			.is_greater(0.5)


## 카드가 바탕과 갈린다 — 같으면 카드 경계가 사라진다
func test_카드가_바탕과_갈린다() -> void:
	for tone in ["light", "dark"]:
		AppTheme.apply_tone(tone)
		assert_bool(AppTheme.CARD.is_equal_approx(AppTheme.BG)) \
			.override_failure_message("%s 톤에서 카드가 바탕과 같다" % tone) \
			.is_false()


## ⚠ **지금 톤이 무엇인지 남겨야 한다.** 안 남기면 설정 화면이 어느 칸을
## 켤지 모른다. **어두움에서 어두움으로 가는 것만 재면 등가라 안 잡힌다**
func test_지금_톤을_남긴다() -> void:
	AppTheme.apply_tone("light")
	assert_str(AppTheme.tone).override_failure_message(
		"밝게 걸었는데 톤 이름이 '%s'다" % AppTheme.tone).is_equal("light")
	AppTheme.apply_tone("dark")
	assert_str(AppTheme.tone).is_equal("dark")


## 모르는 톤이면 안 바꾼다 — 반쯤 바뀐 색으로 서면 안 된다
func test_모르는_톤이면_안_바꾼다() -> void:
	AppTheme.apply_tone("dark")
	AppTheme.apply_tone("무지개")
	assert_str(AppTheme.tone).is_equal("dark")
	assert_str(AppTheme.BG.to_html(false)).is_equal("13161c")


## 02 값을 그대로 가져왔나 — 밝은 바탕은 02 `--surface`다
func test_02_값_그대로다() -> void:
	AppTheme.apply_tone("light")
	assert_str(AppTheme.BG.to_html(false)).override_failure_message(
		"02 `--surface: #F6F8FB`가 아니다").is_equal("f6f8fb")
	assert_str(AppTheme.TEXT.to_html(false)).override_failure_message(
		"02 `--ink: #0F1D3D`가 아니다").is_equal("0f1d3d")
	AppTheme.apply_tone("dark")
	assert_str(AppTheme.BG.to_html(false)).is_equal("13161c")


# ── 톤을 타는 색 ──────────────────────────────────────────────

## ⚠ **사전 상수로 두면 첫 톤에 굳는다.** 단계 색이 톤을 따라와야 한다
func test_단계_색이_톤을_따라온다() -> void:
	AppTheme.apply_tone("dark")
	var dark_ok: Color = AppTheme.vital_color("ok")
	AppTheme.apply_tone("light")
	assert_bool(AppTheme.vital_color("ok").is_equal_approx(dark_ok)) \
		.override_failure_message("톤을 바꿨는데 단계 색이 그대로다 — 사전이 굳었다") \
		.is_false()


func test_부상_색이_톤을_따라온다() -> void:
	AppTheme.apply_tone("dark")
	var dark_sev: Color = AppTheme.sev_color("moderate")
	AppTheme.apply_tone("light")
	assert_bool(AppTheme.sev_color("moderate").is_equal_approx(dark_sev)) \
		.override_failure_message("톤을 바꿨는데 부상 색이 그대로다").is_false()


## 수술색은 톤과 무관한 고정색이다 — 뜻이 톤에 따라 바뀌면 안 된다
func test_수술색은_고정이다() -> void:
	AppTheme.apply_tone("dark")
	var d: Color = AppTheme.sev_color("surgery")
	AppTheme.apply_tone("light")
	assert_bool(AppTheme.sev_color("surgery").is_equal_approx(d)).is_true()


# ── 배선 ──────────────────────────────────────────────────────

## 설정 화면이 세 갈래를 그리나
func test_설정_화면이_톤을_고르게_한다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/settings_screen.gd")
	assert_int(src.find("_build_themes")).override_failure_message(
		"설정 화면에 톤 고르는 자리가 없다").is_greater(-1)
	assert_int(src.find("tone_changed")).override_failure_message(
		"톤을 바꿔도 화면이 다시 안 그려진다").is_greater(-1)


## `App`이 켤 때 톤을 거나 — 안 걸면 저장해도 다음에 안 살아난다
func test_App이_켤_때_건다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/app.gd")
	assert_int(src.find("apply_theme")).override_failure_message(
		"켤 때 저장된 톤을 안 건다").is_greater(-1)


## ⚠ **`system`을 푸는 곳이 하나여야 한다** — 화면마다 풀면 갈린다
func test_system을_푸는_곳이_하나다() -> void:
	var hits: int = 0
	for path in ["res://ui/app.gd", "res://ui/theme.gd",
			"res://ui/screens/settings_screen.gd"]:
		if CodeText.of(path).find("resolve_tone") != -1:
			hits += 1
	assert_int(hits).override_failure_message(
		"`resolve_tone`을 부르는 화면이 %d곳이다 — 하나여야 한다" % hits) \
		.is_equal(1)
