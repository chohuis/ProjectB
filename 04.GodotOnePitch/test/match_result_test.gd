extends GdUnitTestSuite

## 투구 결과 — 분류·문구·색. M1 기반 자료구조.
##
## 원본 검사: `02.SvelteElectron/apps/ui/src/shared/utils/__tests__/matchResult.test.ts`
## 원본 로직: 같은 폴더 `matchResult.ts`
##
## ⚠ **원본은 같은 표가 네 군데에 따로 있었다** — 엔진 `get_result_comment`,
## 화면 `showResultOverlay`, 화면 `localComment`, Electron `AUTO_SIM_AB_LABEL`.
## 그래서 자동 시뮬은 "삼진"이라 하고 직접 던지면 "헛스윙 스트라이크"가
## 나왔다. 여기 하나로 모은다.


const ALL: Array[String] = [
	"STRIKE_SWING", "STRIKE_LOOK", "BALL", "FOUL",
	"INPLAY_OUT", "GROUND_OUT", "FLY_OUT", "LINE_OUT", "DOUBLE_PLAY",
	"FIELDING_ERROR", "HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN",
	"WALK", "GAME_OVER",
]


func _ball(zone: String = "SS", hit_type: String = "groundBall") -> Dictionary:
	return {"hit_type": hit_type, "zone": zone, "hardness": 3}


func _filter(f: Callable) -> Array:
	var out: Array = []
	for c in ALL:
		if f.call(c):
			out.append(c)
	return out


# ── 분류 ───────────────────────────────────────────────────────────

func test_in_play_outs_are_five_including_legacy_code() -> void:
	# `INPLAY_OUT`은 엔진의 중간값이라 정상 흐름엔 안 오지만 옛 세이브가 낸다
	assert_array(_filter(MatchResult.is_out_in_play)).is_equal(
		["INPLAY_OUT", "GROUND_OUT", "FLY_OUT", "LINE_OUT", "DOUBLE_PLAY"])


func test_double_play_is_an_out() -> void:
	# ⚠ 아웃 집계에서 빠지면 이닝이 안 끝난다
	assert_bool(MatchResult.is_out_in_play("DOUBLE_PLAY")).is_true()
	assert_bool(MatchResult.is_at_bat_over("DOUBLE_PLAY")).is_true()


func test_hits_are_four() -> void:
	assert_array(_filter(MatchResult.is_hit)).is_equal(
		["HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"])


func test_strikes_are_two_and_foul_is_not_one() -> void:
	assert_array(_filter(MatchResult.is_strike)).is_equal(["STRIKE_SWING", "STRIKE_LOOK"])
	assert_bool(MatchResult.is_strike("FOUL")).is_false()


func test_at_bat_ends_only_on_resolving_results() -> void:
	assert_bool(MatchResult.is_at_bat_over("BALL")).is_false()
	assert_bool(MatchResult.is_at_bat_over("FOUL")).is_false()
	assert_bool(MatchResult.is_at_bat_over("STRIKE_SWING")).is_false()
	assert_bool(MatchResult.is_at_bat_over("WALK")).is_true()
	assert_bool(MatchResult.is_at_bat_over("FIELDING_ERROR")).is_true()
	assert_bool(MatchResult.is_at_bat_over("HOME_RUN")).is_true()


# ── 문구 ───────────────────────────────────────────────────────────

func test_every_code_has_a_flash_label() -> void:
	# 코드가 그대로 화면에 노출되면 안 된다
	for c in ALL:
		assert_str(MatchResult.flash_label(c)).is_not_empty()
		assert_str(MatchResult.flash_label(c)).is_not_equal(c)


func test_flash_labels_are_short() -> void:
	# 1.4초 스쳐 지나간다
	for c in ALL:
		assert_int(MatchResult.flash_label(c).length()).is_less_equal(6)


func test_log_label_names_the_fielder() -> void:
	assert_str(MatchResult.log_label("GROUND_OUT", _ball("SS"))).is_equal("유격수 땅볼 아웃")
	assert_str(MatchResult.log_label("FLY_OUT", _ball("CF", "flyBall"))).is_equal("중견수 뜬공 아웃")
	assert_str(MatchResult.log_label("LINE_OUT", _ball("2B", "lineDrive"))).is_equal("2루수 직선타 아웃")


func test_popup_is_called_a_fly_ball() -> void:
	assert_str(MatchResult.log_label("FLY_OUT", _ball("1B", "popup"))).is_equal("1루수 뜬공 아웃")


func test_double_play_names_the_fielder() -> void:
	assert_str(MatchResult.log_label("DOUBLE_PLAY", _ball("SS"))).is_equal("유격수 병살타")


func test_line_drive_double_play_uses_a_different_word() -> void:
	# ⚠ **"병살타"는 땅볼에만 쓰는 말이다.** 엔진은 직선타에서도 병살을 낸다
	# (잡아서 주자를 묶는 경우). "중견수 병살타"는 틀린 야구 용어이고
	# 실제로 화면에 찍혔다
	assert_str(MatchResult.log_label("DOUBLE_PLAY", _ball("CF", "lineDrive"))).is_equal("중견수 직선타 병살")
	assert_str(MatchResult.log_label("DOUBLE_PLAY", _ball("SS", "groundBall"))).is_equal("유격수 병살타")


func test_missing_ball_info_is_not_invented() -> void:
	assert_str(MatchResult.log_label("GROUND_OUT")).is_equal("땅볼 아웃")
	assert_str(MatchResult.log_label("DOUBLE_PLAY")).is_equal("병살타")
	assert_str(MatchResult.log_label("GROUND_OUT", {})).is_equal("땅볼 아웃")


func test_unknown_zone_falls_back() -> void:
	assert_str(MatchResult.log_label("GROUND_OUT", _ball("DH"))).is_equal("땅볼 아웃")


func test_only_singles_get_a_direction() -> void:
	# 엔진이 2·3루타의 낙구 지점을 안 준다 — 없는 정보를 지어내지 않는다
	assert_str(MatchResult.log_label("HIT_SINGLE", _ball("LF"))).is_equal("좌익수 앞 안타")
	assert_str(MatchResult.log_label("HIT_DOUBLE", _ball("LF"))).is_equal("2루타")


# ── 색 ─────────────────────────────────────────────────────────────

func test_double_play_is_not_an_out_color() -> void:
	# 병살은 삼진보다 좋은 일이다 — 아웃 색이 아니라 제 색을 준다
	var dp: Dictionary = MatchResult.log_style("DOUBLE_PLAY")
	var go: Dictionary = MatchResult.log_style("GROUND_OUT")
	assert_bool(dp["color"] == go["color"]).is_false()
	assert_bool(dp["bold"]).is_true()


func test_plain_in_play_outs_share_one_color() -> void:
	var a: Color = MatchResult.log_style("GROUND_OUT")["color"]
	var b: Color = MatchResult.log_style("FLY_OUT")["color"]
	var c: Color = MatchResult.log_style("LINE_OUT")["color"]
	assert_bool(a == b and b == c).is_true()


func test_log_colors_come_from_the_theme() -> void:
	# ⚠ 색을 여기 직접 적으면 톤을 바꿀 때 반드시 몇 개가 빠진다.
	# `AppTheme`이 정본이라는 걸 검사가 붙잡는다
	assert_bool(MatchResult.log_style("HIT_SINGLE")["color"] == AppTheme.BAD).is_true()
	assert_bool(MatchResult.log_style("WALK")["color"] == AppTheme.WARN).is_true()
	assert_bool(MatchResult.log_style("STRIKE_SWING")["color"] == AppTheme.OK).is_true()


func test_every_code_has_a_flash_color() -> void:
	for c in ALL:
		assert_bool(MatchResult.flash_color(c).a > 0.0).is_true()


func test_home_run_and_strikeout_differ() -> void:
	assert_bool(MatchResult.flash_color("HOME_RUN") == MatchResult.flash_color("STRIKE_SWING")).is_false()
