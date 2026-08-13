extends GdUnitTestSuite

## 이름 생성 — M8-2.
##
## 원본: `npc_sim.rs`의 내장 한국 풀 · `roster_gen.rs`의 `gen_name_from_pool`
##
## ⚠ **02가 여기서 겪은 결함 셋:**
##
##   ① 짝이 어긋나면 **김씨가 Lee로 나온다.** 한글과 로마자를 따로 뽑으면
##      영어 표기를 켰을 때 다른 사람이 된다
##   ② `name_en`에 **한글이 들어갔다** — 영어 표기를 켜면 그대로 한글이 떴다
##   ③ 리그 풀이 없으면 내장 한국 풀로 떨어져 **ABL·JBL이 한국 이름**으로 찼다


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


## ⚠ **첫 글자로 판정하면 오탐이 난다.** "이선 리베라"(Ethan Rivera)의 첫
## 글자가 한국 성 "이"와 겹친다 — 실제로 검사가 헛짚었다.
##
## 한국 이름은 **공백 없는 세 글자**이고 해외는 성과 이름을 띄어 쓴다.
## 그 구조가 가르는 기준이다
func _is_korean_name(ko: String) -> bool:
	if ko.contains(" ") or ko.length() != 3:
		return false
	return NameGen.KO_SURNAMES.has(ko.substr(0, 1))


func _is_ascii(s: String) -> bool:
	for i in s.length():
		if s.unicode_at(i) > 127:
			return false
	return true


# ── 짝이 맞는가 ───────────────────────────────────────────────

## ⚠ **인덱스로 뽑아 두 표기가 같은 사람을 가리키게 한다.** 값을 따로 뽑으면
## 영어로 바꿨을 때 다른 사람이 된다 — 김씨가 Lee가 된다
func test_the_korean_and_roman_names_are_the_same_person() -> void:
	for i in 200:
		var n: Dictionary = NameGen.korean(_rng(i))
		var sur_ko: String = n["ko"].substr(0, 1)
		var idx: int = NameGen.KO_SURNAMES.find(sur_ko)
		assert_int(idx).override_failure_message("모르는 성: %s" % sur_ko).is_greater_equal(0)
		# 로마자는 **이름-성** 순이다 — `Woo-chan Kim`
		var sur_en: String = n["en"].split(" ")[-1]
		assert_str(sur_en).override_failure_message(
			"%s인데 로마자가 %s다 — 성 짝이 어긋났다" % [n["ko"], n["en"]]) \
			.is_equal(NameGen.KO_SURNAMES_EN[idx])

		# ⚠ **이름 음절 짝도 대조한다.** 성만 보면 이름 쪽이 밀려도 안 걸린다
		var given: PackedStringArray = n["en"].split(" ")[0].split("-")
		var ja: int = NameGen.KO_GIVEN_A.find(n["ko"].substr(1, 1))
		var jb: int = NameGen.KO_GIVEN_B.find(n["ko"].substr(2, 1))
		assert_str(given[0]).override_failure_message(
			"%s인데 로마자가 %s다 — 이름 첫 음절 짝이 어긋났다" % [n["ko"], n["en"]]) \
			.is_equal(NameGen.KO_GIVEN_A_EN[ja])
		assert_str(given[1]).override_failure_message(
			"%s인데 로마자가 %s다 — 이름 끝 음절 짝이 어긋났다" % [n["ko"], n["en"]]) \
			.is_equal(NameGen.KO_GIVEN_B_EN[jb])


## ⚠ **짝 배열의 길이가 같아야 한다.** 하나만 늘리면 인덱스가 밀려서
## 조용히 다른 사람이 된다
func test_every_korean_pool_has_a_matching_roman_pool() -> void:
	assert_int(NameGen.KO_SURNAMES_EN.size()).is_equal(NameGen.KO_SURNAMES.size())
	assert_int(NameGen.KO_GIVEN_A_EN.size()).is_equal(NameGen.KO_GIVEN_A.size())
	assert_int(NameGen.KO_GIVEN_B_EN.size()).is_equal(NameGen.KO_GIVEN_B.size())


## ⚠ **`name_en`에 한글이 들어가면 안 된다.** 02에선 두 번째 값이
## `"김 우찬"`(띄어쓴 한글)이었고, 영어 표기를 켜면 그대로 한글이 떴다
func test_the_roman_name_is_actually_roman() -> void:
	for i in 200:
		var n: Dictionary = NameGen.korean(_rng(i))
		assert_bool(_is_ascii(n["en"])).override_failure_message(
			"로마자에 한글이 있다: %s" % n["en"]).is_true()


# ── 한국 이름 ─────────────────────────────────────────────────

## 성 한 글자 + 이름 두 글자, 붙여 쓴다
func test_a_korean_name_is_three_syllables() -> void:
	for i in 50:
		assert_int(NameGen.korean(_rng(i))["ko"].length()).is_equal(3)


func test_the_roman_name_puts_the_given_name_first() -> void:
	# `Woo-chan Kim` — 이름-성 순, 이름 두 음절은 붙임표로 잇는다
	var n: Dictionary = NameGen.korean(_rng(7))
	var parts: PackedStringArray = n["en"].split(" ")
	assert_int(parts.size()).is_equal(2)
	assert_bool(parts[0].contains("-")).override_failure_message(
		"이름 두 음절이 붙임표로 안 이어졌다: %s" % n["en"]).is_true()


func test_the_same_seed_gives_the_same_name() -> void:
	assert_str(NameGen.korean(_rng(42))["ko"]).is_equal(NameGen.korean(_rng(42))["ko"])


func test_different_seeds_give_different_names() -> void:
	var seen: Dictionary = {}
	for i in 200:
		seen[NameGen.korean(_rng(i))["ko"]] = true
	assert_int(seen.size()).override_failure_message("이름이 안 흩어진다").is_greater(100)


# ── 리그 풀 ───────────────────────────────────────────────────

## ⚠ **리그 풀이 없으면 내장 한국 풀로 떨어진다.** 02에서 그래서
## **ABL·JBL이 한국 이름으로 찼다** — 풀을 넘겼는지가 유일한 갈림길이다
func test_an_overseas_pool_does_not_produce_korean_names() -> void:
	for lid in ["LEAGUE_ABL", "LEAGUE_JBL"]:
		for i in 50:
			var n: Dictionary = NameGen.for_league(lid, _rng(i))
			assert_bool(_is_korean_name(n["ko"])) \
				.override_failure_message("%s에 한국 이름: %s" % [lid, n["ko"]]).is_false()


func test_a_korean_league_uses_the_korean_pool() -> void:
	for lid in ["LEAGUE_KBL", "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY"]:
		var n: Dictionary = NameGen.for_league(lid, _rng(3))
		assert_bool(_is_korean_name(n["ko"])) \
			.override_failure_message("%s인데 한국 이름이 아니다: %s" % [lid, n["ko"]]).is_true()


## 모르는 리그도 이름은 나와야 한다 — 빈칸이면 화면이 비어 보인다
func test_an_unknown_league_still_gets_a_name() -> void:
	var n: Dictionary = NameGen.for_league("LEAGUE_NOPE", _rng(1))
	assert_str(n["ko"]).is_not_empty()
	assert_str(n["en"]).is_not_empty()


# ── 서양식 (ABL) ──────────────────────────────────────────────

## ⚠ **원본이 영문이고 한글이 짝이다.** 한국·일본과 반대다 — 뒤집으면
## 한글 표기에 영문이 뜬다
func test_a_western_name_is_given_then_surname_in_both() -> void:
	for i in 50:
		var n: Dictionary = NameGen.for_league("LEAGUE_ABL", _rng(i))
		assert_bool(_is_ascii(n["en"])).is_true()
		assert_int(n["en"].split(" ").size()).is_equal(2)
		# 한글 표기도 이름-성 순이고 띄어 쓴다
		assert_int(n["ko"].split(" ").size()).is_equal(2)
		assert_bool(_is_ascii(n["ko"])).override_failure_message(
			"한글 표기가 영문 그대로다: %s" % n["ko"]).is_false()


# ── 일본식 (JBL) ──────────────────────────────────────────────

## ⚠ **일본은 한글이 원본이고 영문이 짝이다.** 그리고 **성-이름을 띄어 쓴다**
## (야마구치 다쿠미) — 한국식은 붙여 쓴다(김우찬)
func test_a_japanese_name_is_spaced_in_korean() -> void:
	for i in 50:
		var n: Dictionary = NameGen.for_league("LEAGUE_JBL", _rng(i))
		assert_int(n["ko"].split(" ").size()).override_failure_message(
			"일본 이름을 안 띄어 썼다: %s" % n["ko"]).is_equal(2)
		assert_bool(_is_ascii(n["en"])).is_true()


## 로마자는 어느 리그든 **이름-성** 순으로 통일한다
func test_every_league_puts_the_given_name_first_in_roman() -> void:
	# 일본은 한글이 성-이름, 로마자는 이름-성이라 순서가 뒤집힌다
	var n: Dictionary = NameGen.for_league("LEAGUE_JBL", _rng(5))
	var ko_sur: String = n["ko"].split(" ")[0]
	var idx: int = NameGen.JP_SURNAMES.find(ko_sur)
	assert_int(idx).is_greater_equal(0)
	assert_str(n["en"].split(" ")[-1]).override_failure_message(
		"%s인데 로마자가 %s다" % [n["ko"], n["en"]]).is_equal(NameGen.JP_SURNAMES_EN[idx])


func test_the_japanese_pools_are_paired() -> void:
	assert_int(NameGen.JP_SURNAMES_EN.size()).is_equal(NameGen.JP_SURNAMES.size())
	assert_int(NameGen.JP_GIVEN_EN.size()).is_equal(NameGen.JP_GIVEN.size())


func test_the_western_pools_are_paired() -> void:
	assert_int(NameGen.EN_SURNAMES_KO.size()).is_equal(NameGen.EN_SURNAMES.size())
	assert_int(NameGen.EN_GIVEN_KO.size()).is_equal(NameGen.EN_GIVEN.size())


## ⚠ **서양도 두 표기가 같은 사람이어야 한다.** 길이만 맞고 인덱스가
## 밀리면 "Ethan Rivera / 이선 워런"이 된다 — 화면 언어를 바꾸면 다른 사람이다
func test_a_western_name_is_the_same_person_in_both_scripts() -> void:
	for i in 100:
		var n: Dictionary = NameGen.for_league("LEAGUE_ABL", _rng(i))
		var en: PackedStringArray = n["en"].split(" ")
		var ko: PackedStringArray = n["ko"].split(" ")
		var gi: int = NameGen.EN_GIVEN.find(en[0])
		var si: int = NameGen.EN_SURNAMES.find(en[1])
		assert_int(gi).is_greater_equal(0)
		assert_int(si).is_greater_equal(0)
		assert_str(ko[0]).override_failure_message(
			"%s인데 한글이 %s다 — 이름 짝이 어긋났다" % [n["en"], n["ko"]]) \
			.is_equal(NameGen.EN_GIVEN_KO[gi])
		assert_str(ko[1]).override_failure_message(
			"%s인데 한글이 %s다 — 성 짝이 어긋났다" % [n["en"], n["ko"]]) \
			.is_equal(NameGen.EN_SURNAMES_KO[si])


## 일본도 이름 음절까지 대조한다 — 성만 보면 이름 쪽이 밀려도 안 걸린다
func test_a_japanese_given_name_is_paired_too() -> void:
	for i in 100:
		var n: Dictionary = NameGen.for_league("LEAGUE_JBL", _rng(i))
		var ko: PackedStringArray = n["ko"].split(" ")
		var gi: int = NameGen.JP_GIVEN.find(ko[1])
		assert_int(gi).is_greater_equal(0)
		assert_str(n["en"].split(" ")[0]).override_failure_message(
			"%s인데 로마자가 %s다 — 이름 짝이 어긋났다" % [n["ko"], n["en"]]) \
			.is_equal(NameGen.JP_GIVEN_EN[gi])


# ── 붙여서 쓸 때 ──────────────────────────────────────────────

## 로스터 생성이 이름을 붙여 준다 — 그게 실제 경로다
func test_generated_players_carry_names() -> void:
	for p in PlayerGen.roster({"team_id": "T1", "school_id": "S1",
			"season_year": 2027, "count": 20, "league_id": "LEAGUE_HIGHSCHOOL"}):
		assert_str(p["name"]).is_not_empty()
		assert_str(p["name_en"]).is_not_empty()
		assert_bool(_is_ascii(p["name_en"])).is_true()


## ⚠ **해외 리그 로스터가 한국 이름으로 차면 안 된다** — 02의 결함 그대로다
func test_an_overseas_roster_does_not_get_korean_names() -> void:
	for p in PlayerGen.roster({"team_id": "T1", "school_id": "S1",
			"season_year": 2027, "count": 20, "league_id": "LEAGUE_JBL"}):
		assert_bool(_is_korean_name(p["name"])) \
			.override_failure_message("JBL에 한국 이름: %s" % p["name"]).is_false()
