extends GdUnitTestSuite

## 스탯 순위 — 부문 정의·자격·정렬. M1 기반 자료구조.
##
## 원본 검사: `02.SvelteElectron/apps/ui/src/shared/utils/__tests__/leaderboard.test.ts`
## 원본 로직: 같은 폴더 `leaderboard.ts`
##
## ⚠ **비율 부문과 누적 부문은 자격 조건이 다르다.** 10이닝만 던진 선수가
## ERA 0.00으로 1위가 되면 순위표가 의미를 잃는다. 반대로 세이브·홈런 같은
## 누적 부문에 자격을 걸면 **아무도 못 채운다** — 마무리는 규정이닝을 절대
## 못 채우기 때문이다. 실제 야구가 그렇게 나눈다.


func _pit(id: String, o: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"type": "pitcher", "g": 0, "gs": 0, "w": 0, "l": 0, "sv": 0, "hd": 0,
		"ip": 0.0, "er": 0.0, "h": 0.0, "k": 0.0, "bb": 0.0, "era": 0.0, "whip": 0.0,
	}
	s.merge(o, true)
	return {"id": id, "name": id, "team": "T", "stats": s, "qualified": false}


func _bat(id: String, o: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"type": "batter", "g": 0, "pa": 0, "ab": 0, "h": 0, "hr": 0, "rbi": 0,
		"sb": 0, "bb": 0, "k": 0, "avg": 0.0, "obp": 0.0, "slg": 0.0, "ops": 0.0,
	}
	s.merge(o, true)
	return {"id": id, "name": id, "team": "T", "stats": s, "qualified": false}


func _with_qual(rows: Array, q: Dictionary) -> Array:
	var out: Array = []
	for r in rows:
		var n: Dictionary = r.duplicate()
		n["qualified"] = Leaderboard.qualifies(r["stats"], q)
		out.append(n)
	return out


func _ids(rows: Array) -> Array:
	var out: Array = []
	for r in rows:
		out.append(r["id"])
	return out


# ── 부문 정의 ──────────────────────────────────────────────────────

func test_the_missing_categories_exist() -> void:
	# ⚠ 원본은 정렬이 하나뿐이었다 — 투수 ERA 오름차순, 타자 AVG 내림차순 고정.
	# 그래서 세이브 34개를 던진 마무리가 화면 어디에도 안 나왔다
	for k in ["sv", "hd", "sb", "obp", "slg"]:
		assert_dict(Leaderboard.category_by_key(k)).is_not_empty()


func test_category_keys_are_unique() -> void:
	var seen: Dictionary = {}
	for c in Leaderboard.CATEGORIES:
		assert_bool(seen.has(c["key"])).is_false()
		seen[c["key"]] = true


func test_era_and_whip_sort_ascending() -> void:
	assert_str(Leaderboard.category_by_key("era")["dir"]).is_equal("asc")
	assert_str(Leaderboard.category_by_key("whip")["dir"]).is_equal("asc")
	assert_str(Leaderboard.category_by_key("k")["dir"]).is_equal("desc")


func test_counting_categories_have_no_qualification() -> void:
	for k in ["sv", "hd", "sb", "hr", "rbi", "w", "k"]:
		assert_str(Leaderboard.category_by_key(k)["kind"]).is_equal("count")


func test_rate_categories_need_qualification() -> void:
	for k in ["era", "whip", "avg", "obp", "slg", "ops"]:
		assert_str(Leaderboard.category_by_key(k)["kind"]).is_equal("rate")


func test_five_cards_on_each_side() -> void:
	assert_int(Leaderboard.card_categories_for("pitcher").size()).is_equal(5)
	assert_int(Leaderboard.card_categories_for("batter").size()).is_equal(5)


func test_categories_split_by_side() -> void:
	for c in Leaderboard.categories_for("pitcher"):
		assert_str(c["side"]).is_equal("pitcher")
	for c in Leaderboard.categories_for("batter"):
		assert_str(c["side"]).is_equal("batter")


func test_unknown_key_gives_empty() -> void:
	assert_dict(Leaderboard.category_by_key("없는부문")).is_empty()


func test_every_category_reads_a_real_stat_field() -> void:
	# ⚠ 부문 키(`bb_p`)와 기록 칸 이름(`bb`)이 다르다. 그 둘을 섞으면 값이
	# 조용히 0으로 나오고 순위표가 뒤집힌다 — 오류는 안 난다
	var pitcher: Dictionary = _pit("x")["stats"]
	var batter: Dictionary = _bat("x")["stats"]
	for c in Leaderboard.CATEGORIES:
		var sample: Dictionary = pitcher if c["side"] == "pitcher" else batter
		assert_bool(sample.has(c["field"])).is_true()


# ── 규정이닝 · 규정타석 ────────────────────────────────────────────

func test_qualification_scales_with_games() -> void:
	# 실제 야구가 팀 경기 수에 비례한다 (KBO 기준 이닝 ×1.0 · 타석 ×3.1)
	var q: Dictionary = Leaderboard.qualification_of(144)
	assert_int(q["ip"]).is_equal(144)
	assert_int(q["pa"]).is_equal(446)


func test_qualification_keeps_a_floor() -> void:
	# ⚠ 고교처럼 경기 수가 적은 리그에서 비례식만 쓰면 자격자가 0명이 되어
	# 순위표가 통째로 빈다
	var q: Dictionary = Leaderboard.qualification_of(4)
	assert_int(q["ip"]).is_equal(10)
	assert_int(q["pa"]).is_equal(20)


func test_qualification_is_smaller_early_in_the_season() -> void:
	# 시즌 중엔 치른 경기 수만큼만 요구한다 — 순위표가 처음부터 돈다
	assert_int(Leaderboard.qualification_of(30)["ip"]).is_equal(30)
	assert_int(Leaderboard.qualification_of(30)["pa"]).is_equal(93)


# ── 순위 매기기 ────────────────────────────────────────────────────

func test_cameo_does_not_steal_the_era_title() -> void:
	var q: Dictionary = Leaderboard.qualification_of(100)  # ip 100 · pa 310
	var rows: Array = _with_qual([
		_pit("ace", {"ip": 180.0, "era": 2.14}),
		_pit("cameo", {"ip": 10.0, "era": 0.0}),
	], q)
	var top: Array = Leaderboard.rank_by(rows, Leaderboard.category_by_key("era"))
	assert_int(top.size()).is_equal(1)
	assert_str(top[0]["id"]).is_equal("ace")


func test_closer_wins_saves_without_qualifying() -> void:
	# ⚠ 여기에 자격을 걸면 세이브왕이 영원히 안 나온다 — 원본에서 41개를
	# 던진 마무리가 화면 어디에도 없었던 이유다
	var q: Dictionary = Leaderboard.qualification_of(100)
	var rows: Array = _with_qual([
		_pit("closer", {"ip": 64.0, "sv": 34}),
		_pit("ace", {"ip": 180.0, "sv": 0}),
	], q)
	var top: Array = Leaderboard.rank_by(rows, Leaderboard.category_by_key("sv"))
	assert_str(top[0]["id"]).is_equal("closer")
	assert_int(top.size()).is_equal(2)


func test_stolen_base_title_needs_no_qualification_either() -> void:
	var q: Dictionary = Leaderboard.qualification_of(100)
	var rows: Array = _with_qual([
		_bat("runner", {"pa": 120, "sb": 47}),
		_bat("slug", {"pa": 600, "sb": 2}),
	], q)
	assert_str(Leaderboard.rank_by(rows, Leaderboard.category_by_key("sb"))[0]["id"]).is_equal("runner")


func test_batting_title_needs_plate_appearances() -> void:
	var q: Dictionary = Leaderboard.qualification_of(100)
	var rows: Array = _with_qual([
		_bat("reg", {"pa": 500, "avg": 0.312}),
		_bat("part", {"pa": 40, "avg": 0.500}),
	], q)
	var top: Array = Leaderboard.rank_by(rows, Leaderboard.category_by_key("avg"))
	assert_int(top.size()).is_equal(1)
	assert_str(top[0]["id"]).is_equal("reg")


func test_ties_break_by_id_so_the_screen_does_not_flicker() -> void:
	# 동률의 순서가 렌더마다 바뀌면 화면이 흔들린다 — 정렬이 안정적이지 않은
	# 엔진에서 실제로 그렇다
	var q: Dictionary = Leaderboard.qualification_of(100)
	var rows: Array = _with_qual([
		_pit("zz", {"ip": 120.0, "w": 15}),
		_pit("aa", {"ip": 120.0, "w": 15}),
		_pit("mm", {"ip": 120.0, "w": 15}),
	], q)
	var cat: Dictionary = Leaderboard.category_by_key("w")
	var a: Array = _ids(Leaderboard.rank_by(rows, cat))
	var reversed_rows: Array = rows.duplicate()
	reversed_rows.reverse()
	var b: Array = _ids(Leaderboard.rank_by(reversed_rows, cat))
	assert_array(a).is_equal(["aa", "mm", "zz"])
	assert_array(a).is_equal(b)


func test_limit_zero_returns_everyone() -> void:
	# 전체표가 이걸 쓴다
	var q: Dictionary = Leaderboard.qualification_of(100)
	var rows: Array = []
	for i in 30:
		rows.append(_pit("p%d" % i, {"ip": 120.0, "k": float(i)}))
	rows = _with_qual(rows, q)
	var cat: Dictionary = Leaderboard.category_by_key("k")
	assert_int(Leaderboard.rank_by(rows, cat).size()).is_equal(30)
	assert_int(Leaderboard.rank_by(rows, cat, 5).size()).is_equal(5)


func test_rank_does_not_mutate_input() -> void:
	var q: Dictionary = Leaderboard.qualification_of(100)
	var rows: Array = _with_qual([
		_pit("zz", {"ip": 120.0, "w": 5}),
		_pit("aa", {"ip": 120.0, "w": 15}),
	], q)
	Leaderboard.rank_by(rows, Leaderboard.category_by_key("w"))
	assert_str(rows[0]["id"]).is_equal("zz")


# ── 표기 ───────────────────────────────────────────────────────────

func test_rates_drop_the_leading_zero() -> void:
	# 야구 관습이다
	assert_str(Leaderboard.rate3(0.312)).is_equal(".312")
	assert_str(Leaderboard.rate3(0.05)).is_equal(".050")


func test_values_above_one_keep_the_digit() -> void:
	# OPS는 1을 넘는다
	assert_str(Leaderboard.rate3(1.024)).is_equal("1.024")


func test_innings_are_not_rounded() -> void:
	# 이닝의 소수 첫자리는 3분의 몇이라 반올림하면 안 된다
	var cat: Dictionary = Leaderboard.category_by_key("ip")
	assert_str(Leaderboard.format_value(cat, 178.1)).is_equal("178.1")


func test_counting_stats_print_as_integers() -> void:
	assert_str(Leaderboard.format_value(Leaderboard.category_by_key("w"), 15.0)).is_equal("15")
	assert_str(Leaderboard.format_value(Leaderboard.category_by_key("era"), 2.14)).is_equal("2.14")
