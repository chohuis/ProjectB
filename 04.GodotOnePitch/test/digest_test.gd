extends GdUnitTestSuite

## 월 1회 야구계 소식 — 통합 다이제스트. M1 기반 자료구조.
##
## 원본 검사: `02.SvelteElectron/apps/ui/src/shared/usecases/weekPhases/__tests__/digest.test.ts`
## 원본 로직: 같은 폴더 `digest.ts` · `standingsNews.ts` · `utils/tournament.ts`
##
## ⚠ **원본에 이 영역 단위 검사가 하나도 없었다.** 그래서 승률 표기 함수가
## 두 벌이고 한쪽이 1.000을 `.1000`으로 찍고 있어도 아무도 몰랐다.
##
## 여기서 보는 것은 **섹션이 실제로 켜지고 꺼지는가**와 **내 자리가 첫 줄인가**다.
## 문구 자체는 안 본다 — 문장이 바뀔 때마다 깨지는 검사는 못 쓴다.


func _st(team_id: String, wins: int, losses: int) -> Dictionary:
	var decided: int = wins + losses
	return {
		"team_id": team_id, "wins": wins, "losses": losses, "draws": 0,
		"win_pct": (float(wins) / float(decided)) if decided > 0 else 0.0,
		"runs_for": wins * 5, "runs_against": losses * 5,
		"streak": "W1", "last10": "",
	}


## 권역 2개 × 3팀. 내 팀은 A권역의 2위
const REGIONS: Dictionary = {
	"STADIUM_A": ["TEAM_A1", "TEAM_A2", "TEAM_A3"],
	"STADIUM_B": ["TEAM_B1", "TEAM_B2", "TEAM_B3"],
}


func _hs_standings() -> Array:
	return [
		_st("TEAM_A1", 10, 2), _st("TEAM_A2", 8, 4), _st("TEAM_A3", 3, 9),
		_st("TEAM_B1", 9, 3), _st("TEAM_B2", 6, 6), _st("TEAM_B3", 2, 10),
	]


func _base() -> Dictionary:
	return {
		"week_num": 12, "season_year": 2027, "month_label": "6월",
		"career_stage": "highschool", "hs_grade": 3,
		"my_team_id": "TEAM_A2", "my_league_id": "LEAGUE_HIGHSCHOOL",
		"league_state": {
			"LEAGUE_KBL": {"standings": [_st("TEAM_KBL_1", 40, 20), _st("TEAM_KBL_2", 20, 40)]},
			"LEAGUE_UNIVERSITY": {"standings": [_st("TEAM_U1", 15, 5)]},
		},
		"my_standings": _hs_standings(),
		"regions": REGIONS,
		"region_names": {"STADIUM_A": "A권역", "STADIUM_B": "B권역"},
		"scout_score": 62,
	}


## 프로 표본 — **실제 데이터 모양대로 만든다.**
##
## ⚠ 원본에서 주인공을 `leagueState.LEAGUE_KBL`에 넣은 표본을 썼는데 **게임은
## 그렇게 담지 않는다.** 내가 뛰는 리그의 순위표는 시즌 상태 최상위에 있고
## `league_state`엔 *내가 안 뛰는* 리그만 들어 있다. 그 잘못된 표본 때문에
## 조립기가 `league_state[my_league_id]`를 읽고 있어도 검사가 통과했고,
## **실제 프로 다이제스트에서는 [내 자리]와 [내 무대]가 통째로 사라졌다.**
func _pro() -> Dictionary:
	var d: Dictionary = _base()
	d.merge({
		"career_stage": "pro_kbl", "hs_grade": 0,
		"my_team_id": "TEAM_KBL_2", "my_league_id": "LEAGUE_KBL",
		"my_standings": [
			_st("TEAM_KBL_1", 40, 20), _st("TEAM_KBL_2", 30, 30), _st("TEAM_KBL_3", 20, 40),
		],
		# 내 리그는 여기 **없다** — 그게 실제 모양이다
		"league_state": {"LEAGUE_ABL": {"standings": [_st("TEAM_ABL_1", 30, 10)]}},
	}, true)
	return d


func _with(o: Dictionary) -> Dictionary:
	var d: Dictionary = _base()
	d.merge(o, true)
	return d


# ── 구간 판정 ──────────────────────────────────────────────────────

func test_high_school_splits_by_grade() -> void:
	# 진로가 아직 안 걸린 1학년에게 프로 순위표는 잡음이다
	assert_str(Digest.tier_of("highschool", 1)).is_equal("hs1")
	assert_str(Digest.tier_of("highschool", 2)).is_equal("hs23")
	assert_str(Digest.tier_of("highschool", 3)).is_equal("hs23")


func test_amateur_and_pro_tiers() -> void:
	assert_str(Digest.tier_of("university", 0)).is_equal("amateur")
	assert_str(Digest.tier_of("independent", 0)).is_equal("amateur")
	for s in ["pro_kbl", "pro_abl", "pro_jbl"]:
		assert_str(Digest.tier_of(s, 0)).is_equal("pro")


# ── 주기 ───────────────────────────────────────────────────────────

func test_digest_weeks_reach_the_end_of_the_pro_season() -> void:
	# ⚠ 프로 정규시즌은 W51까지 간다. 주기가 W44에서 끊기면 **마지막 두 달이
	# 통째로 빈다** — 원본이 그래서 후반 둘을 더했다
	var late: int = 0
	for w in Digest.DIGEST_WEEKS:
		if w > 44:
			late += 1
	assert_int(late).is_greater(0)


# ── 섹션 노출 ──────────────────────────────────────────────────────

func test_first_year_gets_no_pro_standings() -> void:
	var m: Dictionary = Digest.build(_with({"hs_grade": 1}))
	assert_str(m["body"]).not_contains("[다른 무대]")
	assert_str(m["body"]).not_contains("[나를 보는 눈]")
	assert_str(m["body"]).contains("[내 자리]")


func test_third_year_gets_other_stages_and_scouts() -> void:
	var m: Dictionary = Digest.build(_base())
	assert_str(m["body"]).contains("[다른 무대]")
	assert_str(m["body"]).contains("[나를 보는 눈]")


func test_pro_gets_no_scout_section() -> void:
	# 이미 소속이 있다
	var m: Dictionary = Digest.build(_pro())
	assert_str(m["body"]).not_contains("[나를 보는 눈]")
	assert_str(m["body"]).contains("[내 무대]")


func test_section_table_matches_the_body() -> void:
	# 표만 고치고 조립 코드를 안 고치는 실수를 잡는다.
	# ⚠ 표본이 단계마다 달라야 한다 — 대학 선수는 KBL을 안 뛰므로 KBL이
	# `league_state`에 있고(그래서 스카우트가 나온다), 프로 KBL 선수는 자기
	# 리그가 거기 없다. 한 표본으로 넷을 다 보면 그 차이가 지워진다
	var univ: Dictionary = _pro()
	univ.merge({
		"career_stage": "university", "hs_grade": 0,
		"my_league_id": "LEAGUE_UNIVERSITY", "league_state": _base()["league_state"],
	}, true)

	for input in [_with({"hs_grade": 1}), _base(), univ, _pro()]:
		var tier: String = Digest.tier_of(input["career_stage"], input.get("hs_grade", 0))
		var m: Dictionary = Digest.build(input)
		assert_dict(m).is_not_empty()
		assert_bool(m["body"].contains("[다른 무대]")).is_equal(Digest.SECTIONS[tier]["others"])
		assert_bool(m["body"].contains("[나를 보는 눈]")).is_equal(Digest.SECTIONS[tier]["scout"])


func test_enabled_sections_actually_appear() -> void:
	# ⚠ 위 검사는 others/scout만 보고 mine/stage는 안 봤다 — 그 사이로 프로에서
	# [내 자리]와 [내 무대]가 통째로 빠진 게 지나갔다
	for input in [_base(), _pro()]:
		var tier: String = Digest.tier_of(input["career_stage"], input.get("hs_grade", 0))
		var m: Dictionary = Digest.build(input)
		assert_dict(m).is_not_empty()
		if Digest.SECTIONS[tier]["mine"]:
			assert_str(m["body"]).contains("[내 자리]")
		if Digest.SECTIONS[tier]["stage"]:
			assert_str(m["body"]).contains("[내 무대]")


func test_pro_reads_my_league_from_my_standings() -> void:
	# 게임은 내가 뛰는 리그를 `league_state`에 담지 않는다.
	# 그걸 통째로 비워도 [내 자리]·[내 무대]가 나와야 한다
	var m: Dictionary = _pro()
	m["league_state"] = {}
	var out: Dictionary = Digest.build(m)
	assert_str(out["body"]).contains("[내 자리]")
	assert_str(out["body"]).contains("[내 무대]")
	assert_str(out["body"]).contains("← 우리")
	assert_str(out["preview"]).contains("2위")  # 3팀 중 30승 30패 = 2위


# ── 내 자리가 먼저 ─────────────────────────────────────────────────

func test_preview_is_my_own_rank() -> void:
	# 원본 다이제스트는 미리보기가 첫 섹션이라 **남의 리그가 먼저 떴다** —
	# 목록에서 열어볼 이유가 안 보였다
	var m: Dictionary = Digest.build(_base())
	assert_str(m["preview"]).contains("A권역")
	assert_str(m["preview"]).contains("2위")


func test_my_place_is_the_first_section() -> void:
	var m: Dictionary = Digest.build(_base())
	var mine: int = m["body"].find("[내 자리]")
	var others: int = m["body"].find("[다른 무대]")
	assert_int(mine).is_greater(-1)
	assert_int(mine).is_less(others)


func test_my_team_is_marked_in_the_table() -> void:
	assert_str(Digest.build(_base())["body"]).contains("← 우리")


func test_high_school_stage_shows_the_region_not_the_nation() -> void:
	# ⚠ 102팀 전국 표를 통째로 넣으면 본문이 100줄이 되고 그건 안 읽힌다.
	# 내 권역 3팀만 나온다
	var m: Dictionary = Digest.build(_base())
	assert_str(m["body"]).contains("A권역")
	assert_str(m["body"]).not_contains("B1")


# ── 빈 데이터 ──────────────────────────────────────────────────────

func test_leagues_without_games_are_not_reported() -> void:
	# 시즌 초엔 전부 0-0이다. 그때 "선두 ○○ (.000)"을 내보내면 거짓 정보다
	var zero: Array = []
	for s in _hs_standings():
		zero.append(_st(s["team_id"], 0, 0))
	var m: Dictionary = Digest.build(_with({
		"my_standings": zero,
		"league_state": {"LEAGUE_KBL": {"standings": [_st("TEAM_KBL_1", 0, 0)]}},
	}))
	if not m.is_empty():
		assert_str(m["body"]).not_contains("[내 무대]")
		assert_str(m["body"]).not_contains("[다른 무대]")


func test_nothing_to_say_means_no_message() -> void:
	# 빈 껍데기를 보내면 "소식이 왔는데 아무것도 없다"가 된다
	var m: Dictionary = Digest.build(_with({
		"my_standings": [], "league_state": {},
		"my_team_id": "TEAM_NONE", "my_league_id": "LEAGUE_NONE",
	}))
	assert_dict(m).is_empty()


func test_missing_team_does_not_crash() -> void:
	var m: Dictionary = Digest.build(_with({"my_team_id": "TEAM_GHOST"}))
	assert_dict(m).is_not_null()


func test_my_own_league_is_not_listed_under_other_stages() -> void:
	# ⚠ **내 리그를 빼는 건 호출부가 아니라 조립기 몫이다.** 원본은 호출부가
	# 건너뛰기만 해서 정작 내 리그 순위표가 아무 데도 안 나왔다. 여기서는
	# [내 무대]가 이미 그걸 싣고 있으므로 [다른 무대]에 또 나오면 중복이다
	var d: Dictionary = _base()
	d.merge({
		"career_stage": "university", "hs_grade": 0,
		"my_league_id": "LEAGUE_UNIVERSITY", "my_team_id": "TEAM_U1",
		"my_standings": [_st("TEAM_U1", 15, 5), _st("TEAM_U2", 5, 15)],
	}, true)
	var body: String = Digest.build(d)["body"]
	var from: int = body.find("[다른 무대]")
	var to: int = body.find("[", from + 1)
	var others: String = body.substr(from, to - from)
	# 대학은 `league_state`에도 있지만 내 리그다 — 여기 실리면 안 된다
	assert_str(others).not_contains("대학")
	assert_str(others).contains("KBL")


func test_inactive_leagues_are_skipped() -> void:
	# ⚠ 이 게이트를 없애면 **겨울에도 순위표가 온다.** 원본의 프로 순위 소식이
	# 코드상 연 52통일 것 같은데 실측 28통이던 이유가 이것이다
	#
	# 게이트가 거는 것은 `[다른 무대]`뿐이다 — `[나를 보는 눈]`은 스카우트를
	# 보내는 구단 이야기라 리그 일정과 무관하게 KBL을 본다
	var d: Dictionary = _base()
	d["active_leagues"] = ["LEAGUE_UNIVERSITY"]
	var body: String = Digest.build(d)["body"]
	var from: int = body.find("[다른 무대]")
	var to: int = body.find("[", from + 1)
	var others: String = body.substr(from, to - from)
	assert_str(others).contains("대학")
	assert_str(others).not_contains("KBL")
	# 게이트가 없으면 KBL이 실린다 — 대조군이 없으면 이 검사가 아무것도 안 본다
	var ungated: String = Digest.build(_base())["body"]
	var uf: int = ungated.find("[다른 무대]")
	assert_str(ungated.substr(uf, ungated.find("[", uf + 1) - uf)).contains("KBL")


# ── id 유일성 ──────────────────────────────────────────────────────

func test_same_week_different_season_gives_a_different_id() -> void:
	# ⚠ **`week_num`은 시즌마다 1로 리셋된다.** 원본이 `msg-digest-w13`으로
	# 뒀다가 3시즌째에 중복이 됐고, 소식 목록이 id를 키로 잡기 때문에
	# **세이브가 아예 안 열렸다** — 로드 화면에서 멈춘 채 단서가 없다
	var a: Dictionary = Digest.build(_with({"week_num": 13, "season_year": 2026}))
	var b: Dictionary = Digest.build(_with({"week_num": 13, "season_year": 2027}))
	assert_str(a["id"]).is_not_equal(b["id"])


func test_different_weeks_give_different_ids() -> void:
	var a: Dictionary = Digest.build(_with({"week_num": 13, "season_year": 2026}))
	var b: Dictionary = Digest.build(_with({"week_num": 18, "season_year": 2026}))
	assert_str(a["id"]).is_not_equal(b["id"])


func test_id_carries_no_display_label() -> void:
	# `msg-digest-3월-w13`으로 뒀더니 종류 키가 달마다 쪼개져 계측이 무너졌다
	assert_str(Digest.build(_with({"month_label": "6월"}))["id"]).not_contains("월")


# ── 승률 표기 ──────────────────────────────────────────────────────

func test_a_perfect_record_prints_as_one_thousand() -> void:
	# ⚠ 원본은 이 함수가 두 벌이었고 한쪽이 자릿수가 밀려 `.1000`을 냈다
	assert_str(Digest.pct_str(1.0)).is_equal("1.000")
	assert_str(Digest.pct_str(0.526)).is_equal(".526")
	assert_str(Digest.pct_str(0.05)).is_equal(".050")
	var m: Dictionary = Digest.build(_with({"my_standings": [
		_st("TEAM_A1", 12, 0), _st("TEAM_A2", 8, 4), _st("TEAM_A3", 0, 12),
	]}))
	assert_str(m["body"]).contains("1.000")
	assert_str(m["body"]).not_contains(".1000")


# ── 내 순위 계산 ───────────────────────────────────────────────────

func test_my_rank_gives_both_region_and_nation() -> void:
	# ⚠ 권역마다 팀 수가 달라(제주 2팀 ~ 충청 12팀) 권역 순위만으로는 전국
	# 위치를 알 수 없다. 둘 다 필요하다
	var r: Dictionary = Digest.calc_my_rank(_hs_standings(), "TEAM_A2", REGIONS)
	assert_str(r["region_id"]).is_equal("STADIUM_A")
	assert_int(r["region_rank"]).is_equal(2)
	assert_int(r["region_total"]).is_equal(3)
	assert_int(r["national_rank"]).is_equal(3)  # A1 .833 · B1 .750 · A2 .667
	assert_int(r["national_total"]).is_equal(6)


func test_equal_win_pct_breaks_by_runs() -> void:
	# ⚠ 고교는 팀마다 치른 경기 수가 다르다 — 6승 6패와 4승 4패가 둘 다 5할이다.
	# 승률만 보면 순서가 임의로 정해지고, 그러면 같은 자료로 만든 화면이
	# 열 때마다 다르게 보인다
	var rows: Array = [_st("TEAM_A1", 4, 4), _st("TEAM_A2", 6, 6), _st("TEAM_A3", 0, 12)]
	var reg: Array = Digest.region_rankings(rows, {"STADIUM_A": ["TEAM_A1", "TEAM_A2", "TEAM_A3"]})
	assert_array(reg[0]["ranked_teams"]).is_equal(["TEAM_A2", "TEAM_A1", "TEAM_A3"])
	# 전국 순위도 같은 기준이어야 한다 — 다르면 "권역 1위인데 전국 3위"가 나온다
	assert_int(Digest.calc_my_rank(rows, "TEAM_A2", {"STADIUM_A": ["TEAM_A1", "TEAM_A2", "TEAM_A3"]})["national_rank"]).is_equal(1)


func test_my_rank_is_empty_when_the_team_is_absent() -> void:
	assert_dict(Digest.calc_my_rank(_hs_standings(), "TEAM_GHOST", REGIONS)).is_empty()
	assert_dict(Digest.calc_my_rank([], "TEAM_A2", REGIONS)).is_empty()
