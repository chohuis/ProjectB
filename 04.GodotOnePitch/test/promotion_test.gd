extends GdUnitTestSuite

## 학년 진급·졸업·나이 — M9-1.
##
## 원본: `packages/engine-native/src/npc_sim.rs`의 `advance_all_grades` ·
## `advance_all_ages`
##
## ⚠ **드래프트보다 먼저 돈다.** 졸업생이 드래프트 풀에 있어야 한다.


func _npc(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"id": "N1", "league_id": "LEAGUE_HIGHSCHOOL", "team_id": "TEAM_A",
		"grade": 1, "age": 16, "career_status": "active", "career_history": [],
	}
	d.merge(o, true)
	return d


func _run(npcs: Array, year: int = 2027) -> Dictionary:
	return Promotion.advance_grades(npcs, year)


# ── 진급 ──────────────────────────────────────────────────────

func test_a_highschooler_moves_up_a_grade() -> void:
	var out: Dictionary = _run([_npc({"grade": 1})])
	assert_int(int(out["updated"][0]["grade"])).is_equal(2)


func test_a_third_year_graduates() -> void:
	var out: Dictionary = _run([_npc({"grade": 3})])
	assert_array(out["updated"]).is_empty()
	assert_int(out["hs_graduated"].size()).is_equal(1)


## ⚠ **졸업생은 드래프트 풀로 간다.** 안 보내면 뽑을 사람이 없다
func test_a_graduate_lands_in_the_draft_pool() -> void:
	var g: Dictionary = _run([_npc({"grade": 3})])["hs_graduated"][0]
	assert_str(g["league_id"]).is_equal(Promotion.DRAFT_POOL)
	assert_bool(g.get("grade", null) == null).override_failure_message(
		"졸업했는데 학년이 %s로 남았다" % g.get("grade")).is_true()


func test_a_university_player_graduates_after_four_years() -> void:
	var u: Dictionary = _npc({"league_id": "LEAGUE_UNIVERSITY", "grade": 3, "age": 20})
	assert_int(int(_run([u])["updated"][0]["grade"])).is_equal(4)

	var u4: Dictionary = _npc({"league_id": "LEAGUE_UNIVERSITY", "grade": 4, "age": 21})
	var out: Dictionary = _run([u4])
	assert_int(out["univ_graduated"].size()).is_equal(1)
	assert_str(out["univ_graduated"][0]["league_id"]).is_equal(Promotion.DRAFT_POOL)


## ⚠ **고교와 대학의 졸업 학년이 다르다.** 같게 두면 대학이 3학년에
## 졸업해서 한 해가 사라진다
func test_a_university_third_year_does_not_graduate() -> void:
	var out: Dictionary = _run([_npc({"league_id": "LEAGUE_UNIVERSITY", "grade": 3})])
	assert_array(out["univ_graduated"]).is_empty()


## ⚠ **부상 중이어도 학년은 오른다.** 02는 `active`만 진급시켜서 부상
## 선수가 학년이 안 오르고 졸업도 안 됐다 — 나이만 매 시즌 +1 되어
## 20~21세 고교생이 쌓였다. 자리를 비우는 건 은퇴뿐이다
func test_an_injured_player_still_moves_up() -> void:
	var out: Dictionary = _run([_npc({"career_status": "injured", "grade": 2})])
	assert_int(int(out["updated"][0]["grade"])).override_failure_message(
		"부상 선수가 진급을 못 했다 — 20세 고교생이 쌓인다").is_equal(3)


func test_a_retired_player_stays_put() -> void:
	var out: Dictionary = _run([_npc({"career_status": "retired", "grade": 2})])
	assert_int(int(out["updated"][0]["grade"])).is_equal(2)


## 프로는 학년이 없다 — 건드리지 않는다
func test_a_pro_is_left_alone() -> void:
	var out: Dictionary = _run([_npc({"league_id": "LEAGUE_KBL", "grade": 0})])
	assert_int(out["updated"].size()).is_equal(1)
	assert_array(out["hs_graduated"]).is_empty()
	assert_array(out["univ_graduated"]).is_empty()


# ── 연도 기록 ─────────────────────────────────────────────────

func test_each_year_leaves_a_record() -> void:
	var out: Dictionary = _run([_npc({"grade": 1})], 2027)
	var h: Array = out["updated"][0]["career_history"]
	assert_int(h.size()).is_equal(1)
	assert_int(int(h[0]["year"])).is_equal(2027)
	assert_str(h[0]["league_id"]).is_equal("LEAGUE_HIGHSCHOOL")
	assert_str(h[0]["team_id"]).is_equal("TEAM_A")


## ⚠ **같은 해를 두 번 넣지 않는다.** 02는 연도 기록을 네 곳이 각자 썼고
## 방어가 한 곳에만 있어서 고교생은 같은 해가 두 줄로 남았다. 경력 화면과
## **드래프트 경로 판정**(마지막 기록으로 고졸·대졸을 가른다)이 이 배열을
## 읽으므로 중복은 그대로 오작동이 된다
func test_the_same_year_is_not_written_twice() -> void:
	var n: Dictionary = _npc({"grade": 1, "career_history": [
		{"year": 2027, "league_id": "LEAGUE_HIGHSCHOOL", "team_id": "TEAM_A"}]})
	var h: Array = _run([n], 2027)["updated"][0]["career_history"]
	assert_int(h.size()).override_failure_message(
		"같은 해가 %d줄이다" % h.size()).is_equal(1)


func test_a_graduate_also_gets_the_year() -> void:
	var g: Dictionary = _run([_npc({"grade": 3})], 2027)["hs_graduated"][0]
	assert_int(int(g["career_history"][0]["year"])).is_equal(2027)


## 마지막 기록이 진로를 가른다 — 고졸과 대졸이 구별돼야 한다
func test_the_last_record_tells_the_path() -> void:
	var hs: Dictionary = _run([_npc({"grade": 3})], 2027)["hs_graduated"][0]
	assert_str(hs["career_history"][-1]["league_id"]).is_equal("LEAGUE_HIGHSCHOOL")

	var uni: Dictionary = _run([_npc({"league_id": "LEAGUE_UNIVERSITY",
		"grade": 4, "age": 21})], 2027)["univ_graduated"][0]
	assert_str(uni["career_history"][-1]["league_id"]).is_equal("LEAGUE_UNIVERSITY")


# ── 나이 ──────────────────────────────────────────────────────

func test_everyone_gets_a_year_older() -> void:
	var out: Array = Promotion.advance_ages([_npc({"age": 16}),
		_npc({"league_id": "LEAGUE_KBL", "age": 27})])
	assert_int(int(out[0]["age"])).is_equal(17)
	assert_int(int(out[1]["age"])).is_equal(28)


## 은퇴한 선수는 나이를 안 센다 — 은퇴 나이가 기록으로 남아야 한다
func test_a_retired_player_stops_aging() -> void:
	var out: Array = Promotion.advance_ages([
		_npc({"career_status": "retired", "age": 38}),
		_npc({"league_id": Promotion.RETIRED_LEAGUE, "age": 40})])
	assert_int(int(out[0]["age"])).is_equal(38)
	assert_int(int(out[1]["age"])).is_equal(40)


## ⚠ **나이는 진급 뒤다.** 02 주석이 그렇게 못박아 뒀다 — 먼저 올리면
## 졸업 판정이 한 살 많은 선수를 본다
func test_ages_advance_after_grades() -> void:
	var src := FileAccess.get_file_as_string("res://sim/season_end.gd")
	var grades: int = src.find("advance_grades")
	var aging: int = src.find("\"aging\"")
	assert_int(grades).is_greater(-1)
	assert_int(aging).is_greater(grades)


# ── 한 해 전체 ────────────────────────────────────────────────

## 고교 3년 → 대학 4년 → 드래프트 풀. **7년 만에 나온다**
func test_a_full_school_career_takes_seven_years() -> void:
	var pool: Array = [_npc({"grade": 1, "age": 16})]
	var year: int = 2027

	# 고교 3년
	for i in 3:
		var out: Dictionary = _run(pool, year)
		pool = out["updated"] + out["hs_graduated"] + out["univ_graduated"]
		pool = Promotion.advance_ages(pool)
		year += 1
	assert_str(pool[0]["league_id"]).is_equal(Promotion.DRAFT_POOL)
	assert_int(int(pool[0]["age"])).is_equal(19)
	assert_int(pool[0]["career_history"].size()).is_equal(3)


func test_an_empty_roster_does_not_break() -> void:
	var out: Dictionary = _run([])
	assert_array(out["updated"]).is_empty()
	assert_array(out["hs_graduated"]).is_empty()
	assert_array(out["univ_graduated"]).is_empty()
