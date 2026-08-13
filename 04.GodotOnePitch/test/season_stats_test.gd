extends GdUnitTestSuite

## 시즌 누적 기록 — M1 기반 자료구조.
##
## 원본 검사: `02.SvelteElectron/apps/ui/src/shared/utils/__tests__/season-helpers.test.ts`
## 원본 로직: 같은 폴더 `season-helpers.ts`
##
## ⚠ **검사를 로직보다 먼저 옮긴다.** 이 파일이 먼저 빨간불이 되고,
## `sim/season_stats.gd`를 만들면 초록불이 된다.
##
## 원본이 비싸게 배운 것 — 여기서 지킨다:
##   · **타석(pa)은 누적하지 않고 파생한다.** 누적하면 경기 수의 제곱으로 는다
##   · **파생값은 저장된 값을 안 믿는다.** 누적 counter에서 다시 만든다
##   · 방어율 분모가 0이면 0이다 (나눗셈 폭발 금지)
##   · 득점권 스플릿이 없던 시절 세이브도 열려야 한다


# ── 파생 수치 ──────────────────────────────────────────────────────

func test_era_is_nine_innings_scaled() -> void:
	assert_float(SeasonStats.calc_era(2.0, 6.0)).is_equal_approx(3.0, 0.001)
	assert_float(SeasonStats.calc_era(3.0, 9.0)).is_equal_approx(3.0, 0.001)


func test_era_is_zero_without_innings() -> void:
	# 분모가 0이다. 나누면 inf가 나오고 그게 순위표까지 흘러간다
	assert_float(SeasonStats.calc_era(5.0, 0.0)).is_equal_approx(0.0, 0.001)


func test_whip_counts_walks_and_hits() -> void:
	assert_float(SeasonStats.calc_whip(15.0, 55.0, 60.0)).is_equal_approx(1.17, 0.001)
	assert_float(SeasonStats.calc_whip(1.0, 1.0, 0.0)).is_equal_approx(0.0, 0.001)


func test_avg_is_zero_without_at_bats() -> void:
	assert_float(SeasonStats.calc_avg(2.0, 4.0)).is_equal_approx(0.5, 0.001)
	assert_float(SeasonStats.calc_avg(0.0, 0.0)).is_equal_approx(0.0, 0.001)


func test_ops_is_obp_plus_slg() -> void:
	assert_float(SeasonStats.calc_ops(0.400, 0.500)).is_equal_approx(0.9, 0.001)


# ── 투수 누적 ──────────────────────────────────────────────────────

func _pitcher_line(pid: String, ip: float, er: float, h: float, k: float, bb: float, dec: String) -> Dictionary:
	return {
		"role": "pitcher", "player_id": pid,
		"ip": ip, "er": er, "h": h, "k": k, "bb": bb, "decision": dec,
	}


func test_pitcher_first_appearance() -> void:
	var out: Dictionary = SeasonStats.accumulate({}, [_pitcher_line("P1", 6.0, 2.0, 5.0, 7.0, 2.0, "W")])
	var s: Dictionary = out["P1"]
	assert_str(s["type"]).is_equal("pitcher")
	assert_int(s["g"]).is_equal(1)
	assert_int(s["w"]).is_equal(1)
	assert_float(s["ip"]).is_equal_approx(6.0, 0.001)
	assert_float(s["era"]).is_equal_approx(3.0, 0.001)


func test_pitcher_era_recomputed_on_accumulate() -> void:
	# ⚠ 방어율은 경기별 값을 평균 내면 안 된다 — 이닝이 다르면 가중이 달라진다.
	# 누적 자책·이닝에서 매번 다시 만든다
	var st: Dictionary = SeasonStats.accumulate({}, [_pitcher_line("P1", 9.0, 3.0, 7.0, 9.0, 2.0, "W")])
	st = SeasonStats.accumulate(st, [_pitcher_line("P1", 9.0, 3.0, 7.0, 9.0, 2.0, "L")])
	var s: Dictionary = st["P1"]
	assert_int(s["g"]).is_equal(2)
	assert_int(s["w"]).is_equal(1)
	assert_int(s["l"]).is_equal(1)
	assert_float(s["ip"]).is_equal_approx(18.0, 0.001)
	assert_float(s["era"]).is_equal_approx(3.0, 0.001)


func test_pitcher_decisions_are_separate_counters() -> void:
	var st: Dictionary = {}
	for dec in ["W", "W", "L", "SV", "HD", "HD", "ND"]:
		st = SeasonStats.accumulate(st, [_pitcher_line("P1", 1.0, 0.0, 1.0, 1.0, 0.0, dec)])
	var s: Dictionary = st["P1"]
	assert_int(s["g"]).is_equal(7)
	assert_int(s["w"]).is_equal(2)
	assert_int(s["l"]).is_equal(1)
	assert_int(s["sv"]).is_equal(1)
	assert_int(s["hd"]).is_equal(2)


# ── 타자 누적 ──────────────────────────────────────────────────────

func _batter_line(pid: String, ab: int, h: int, hr: int, rbi: int, bb: int, k: int, sb: int) -> Dictionary:
	return {
		"role": "batter", "player_id": pid,
		"ab": ab, "h": h, "hr": hr, "rbi": rbi, "bb": bb, "k": k, "sb": sb,
	}


func test_batter_first_game() -> void:
	var out: Dictionary = SeasonStats.accumulate({}, [_batter_line("B1", 4, 2, 1, 2, 1, 1, 0)])
	var s: Dictionary = out["B1"]
	assert_str(s["type"]).is_equal("batter")
	assert_int(s["g"]).is_equal(1)
	assert_int(s["hr"]).is_equal(1)
	assert_float(s["avg"]).is_equal_approx(0.5, 0.001)


func test_batter_avg_recomputed_on_accumulate() -> void:
	var st: Dictionary = SeasonStats.accumulate({}, [_batter_line("B1", 4, 1, 0, 0, 0, 1, 0)])
	st = SeasonStats.accumulate(st, [_batter_line("B1", 4, 3, 0, 0, 0, 0, 0)])
	var s: Dictionary = st["B1"]
	assert_int(s["ab"]).is_equal(8)
	assert_int(s["h"]).is_equal(4)
	assert_float(s["avg"]).is_equal_approx(0.5, 0.001)


func test_plate_appearances_are_derived_not_accumulated() -> void:
	# ⚠ **이 저장소에서 제일 비쌌던 결함이다.**
	#
	# 예전 식이 `prev.pa + ab + bb`였는데 `ab`·`bb`가 이미 누적 합계라
	# 매 경기 누적값을 또 더했다 — pa가 경기 수의 제곱으로 늘었다.
	# 100경기면 실제 ~450인데 계산값이 ~20,200(45배)이었다.
	#
	# 그게 수상 자격선(minPa 200)을 실질 4~5타석으로 만들어 12타수 7안타가
	# 타격왕이 됐고, obp·ops가 45배 작아져 승강 판정까지 무너뜨렸다.
	var st: Dictionary = {}
	for i in 3:
		st = SeasonStats.accumulate(st, [_batter_line("B1", 4, 1, 0, 0, 1, 0, 0)])
	var s: Dictionary = st["B1"]
	assert_int(s["ab"]).is_equal(12)
	assert_int(s["bb"]).is_equal(3)
	# 타수 12 + 볼넷 3 = 15. 누적식이면 4·13·30처럼 부푼다
	assert_int(s["pa"]).is_equal(15)


func test_obp_and_slg_and_ops() -> void:
	# 4타수 2안타(1홈런) 1볼넷 → pa 5 · obp (2+1)/5 = .600
	# slg는 (h + hr*3)/ab = (2+3)/4 = 1.250 (이 모델은 2·3루타를 안 센다)
	var out: Dictionary = SeasonStats.accumulate({}, [_batter_line("B1", 4, 2, 1, 2, 1, 0, 0)])
	var s: Dictionary = out["B1"]
	assert_float(s["obp"]).is_equal_approx(0.6, 0.001)
	assert_float(s["slg"]).is_equal_approx(1.25, 0.001)
	assert_float(s["ops"]).is_equal_approx(1.85, 0.001)


# ── 옛 세이브·깨진 값 ──────────────────────────────────────────────

func test_risp_split_survives_lines_without_it() -> void:
	# 엔진이 득점권을 안 넘기던 시절 세이브가 있다. 없으면 0으로 본다
	var st: Dictionary = SeasonStats.accumulate({}, [_batter_line("B1", 4, 2, 0, 1, 0, 0, 0)])
	assert_int(st["B1"]["risp_ab"]).is_equal(0)
	var line: Dictionary = _batter_line("B1", 4, 2, 0, 1, 0, 0, 0)
	line["risp_ab"] = 2
	line["risp_h"] = 1
	st = SeasonStats.accumulate(st, [line])
	assert_int(st["B1"]["risp_ab"]).is_equal(2)
	assert_int(st["B1"]["risp_h"]).is_equal(1)


func test_nan_in_stored_stats_does_not_spread() -> void:
	# NaN은 더하면 전염된다. 한 번 들어가면 그 선수 기록이 영영 NaN이다
	var broken: Dictionary = {"P1": {
		"type": "pitcher", "g": 1, "gs": 0, "w": 0, "l": 0, "sv": 0, "hd": 0,
		"ip": NAN, "er": 3.0, "h": 5.0, "k": 4.0, "bb": 1.0, "era": NAN, "whip": NAN,
	}}
	var out: Dictionary = SeasonStats.accumulate(broken, [_pitcher_line("P1", 9.0, 3.0, 7.0, 9.0, 2.0, "W")])
	var s: Dictionary = out["P1"]
	assert_bool(is_nan(s["ip"])).is_false()
	assert_float(s["ip"]).is_equal_approx(9.0, 0.001)
	assert_float(s["era"]).is_equal_approx(6.0, 0.001)


func test_accumulate_does_not_mutate_input() -> void:
	# 호출측이 옛 사전을 아직 쥐고 있다. 제자리에서 바꾸면 되돌리기·비교가 깨진다
	var before: Dictionary = SeasonStats.accumulate({}, [_batter_line("B1", 4, 2, 0, 0, 0, 0, 0)])
	SeasonStats.accumulate(before, [_batter_line("B1", 4, 4, 0, 0, 0, 0, 0)])
	assert_int(before["B1"]["h"]).is_equal(2)
	assert_int(before["B1"]["ab"]).is_equal(4)


# ── sanitize (세이브를 열 때) ──────────────────────────────────────

func test_sanitize_rebuilds_batter_derived_values() -> void:
	# ⚠ **원본은 타자 쪽이 통째로 비어 있었다.** 투수만 고치고 타자는 통과시켜서,
	# 한 번 어긋난 pa·obp·ops가 세이브를 왕복해도 영영 안 고쳐졌다.
	#
	# 파생값은 저장된 값을 안 믿고 누적 counter에서 다시 만든다
	var save: Dictionary = {"B1": {
		"type": "batter", "g": 100, "pa": 20200, "ab": 400, "h": 120, "hr": 20,
		"rbi": 70, "sb": 5, "bb": 50, "k": 80,
		"avg": 0.010, "obp": 0.008, "slg": 0.011, "ops": 0.019,
	}}
	var out: Dictionary = SeasonStats.sanitize(save)
	var s: Dictionary = out["B1"]
	assert_int(s["pa"]).is_equal(450)
	assert_float(s["avg"]).is_equal_approx(0.3, 0.001)
	assert_float(s["obp"]).is_equal_approx(0.378, 0.001)
	assert_float(s["ops"]).is_equal_approx(0.828, 0.001)


func test_sanitize_replaces_nan_with_zero() -> void:
	var save: Dictionary = {"P1": {
		"type": "pitcher", "g": NAN, "gs": 0, "w": 5, "l": 3, "sv": 0, "hd": 0,
		"ip": 60.0, "er": 20.0, "h": 55.0, "k": 70.0, "bb": 15.0, "era": NAN, "whip": NAN,
	}}
	var out: Dictionary = SeasonStats.sanitize(save)
	var s: Dictionary = out["P1"]
	assert_int(s["g"]).is_equal(0)
	assert_float(s["era"]).is_equal_approx(3.0, 0.001)
	assert_float(s["whip"]).is_equal_approx(1.17, 0.001)


func test_sanitize_does_not_mutate_input() -> void:
	var save: Dictionary = {"B1": {
		"type": "batter", "g": 10, "pa": 999, "ab": 40, "h": 10, "hr": 0,
		"rbi": 5, "sb": 0, "bb": 5, "k": 8, "avg": 0.0, "obp": 0.0, "slg": 0.0, "ops": 0.0,
	}}
	SeasonStats.sanitize(save)
	assert_int(save["B1"]["pa"]).is_equal(999)
