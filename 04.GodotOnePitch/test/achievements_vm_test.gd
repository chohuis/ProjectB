extends GdUnitTestSuite

## 업적 화면 — C-5. "나" 탭의 하위 탭이다.
##
## ⚠ **화면이 달성 판정을 안 한다.** 02는 이 화면이 지표를 직접 계산해서,
## 화면을 안 열면 진행도가 낡은 채로 남았다.

const STATUS := preload("res://ui/screens/status_screen.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {"season_year": 2030,
		"protagonist": {"id": "ME", "team_id": "T1", "pitching": {},
			"career_history": []}}
	s.merge(over, true)
	return s


func _with(k: float = 0.0, weeks: int = 0) -> Dictionary:
	var s: Dictionary = _state({
		"season_stats": {"ME": {"type": "pitcher", "g": 0, "w": 0, "sv": 0,
			"k": k}}})
	s["protagonist"]["training_weeks"] = weeks
	Achievements.check(s, 5 * 7)
	return s


func _find(vm: Dictionary, id: String) -> Dictionary:
	for g in vm["groups"]:
		for r in g["rows"]:
			if String(r["id"]) == id:
				return r
	return {}


# ── 목록 ──────────────────────────────────────────────────────

func test_it_groups_by_category() -> void:
	var vm: Dictionary = AchievementsVm.build(_state())
	var ids: Array = []
	for g in vm["groups"]:
		ids.append(String(g["id"]))
	assert_array(ids).contains(["baseball", "growth", "social"])


## 야구가 먼저다 — 이 게임이 무엇인지가 목록 위에 있어야 한다
func test_baseball_comes_first() -> void:
	assert_str(String(AchievementsVm.build(_state())["groups"][0]["id"])
		).is_equal("baseball")


## ⚠ **아직 못 만든 업적은 목록에서도 뺀다.** 영영 안 열리는 줄이 섞이면
## "몇 개 중 몇 개"가 거짓말이 된다
func test_blocked_achievements_are_not_listed() -> void:
	var vm: Dictionary = AchievementsVm.build(_state())
	assert_bool(_find(vm, "ACH_HIDDEN_RELATIONSHIP_1").is_empty()).is_true()
	assert_bool(_find(vm, "ACH_SOCIAL_FIRST_KAKAO").is_empty()).is_true()
	assert_int(int(vm["total"])).is_equal(Achievements.active_defs().size())


## ⚠ **표에 없는 갈래는 화면에 안 뜬다.** 빠뜨린 갈래를 뒤에 붙이는
## 코드를 두면 지금은 그게 영영 안 도는 갈래다 — 그래서 대신 여기서 막는다.
## 규칙 파일에 갈래를 추가하면 `CATEGORY_ORDER`도 같이 고쳐야 한다
func test_every_live_category_is_in_the_display_order() -> void:
	for d in Achievements.active_defs():
		assert_bool(AchievementsVm.CATEGORY_ORDER.has(String(d["category"]))
			).override_failure_message(
			"%s의 갈래(%s)가 표시 순서에 없다 — 화면에서 통째로 사라진다"
			% [d["id"], d["category"]]).is_true()


## 갈래 이름도 한글로 다 있어야 한다
func test_every_live_category_has_a_label() -> void:
	for d in Achievements.active_defs():
		assert_bool(AchievementsVm.CATEGORY_LABEL.has(String(d["category"]))
			).is_true()


func test_the_summary_counts_what_is_done() -> void:
	var vm: Dictionary = AchievementsVm.build(_with(1.0))
	assert_int(int(vm["unlocked"])).is_greater(0)
	assert_str(String(vm["summary"])).contains("/")


func test_an_untouched_career_says_so() -> void:
	var vm: Dictionary = AchievementsVm.build(_state())
	assert_int(int(vm["unlocked"])).is_equal(0)
	assert_str(String(vm["empty"])).is_not_empty()


# ── 한 줄 ─────────────────────────────────────────────────────

func test_an_unlocked_row_says_when() -> void:
	var r: Dictionary = _find(AchievementsVm.build(_with(1.0)),
		"ACH_BASEBALL_FIRST_STRIKEOUT")
	assert_bool(r["unlocked"]).is_true()
	assert_str(String(r["at"])).is_equal("2030년 5주")
	assert_str(String(r["detail"])).contains("2030년")


## 못 딴 것은 얼마나 남았는지가 보여야 한다
func test_a_locked_row_shows_the_progress() -> void:
	var r: Dictionary = _find(AchievementsVm.build(_with(7.0)),
		"ACH_BASEBALL_10_STRIKEOUTS")
	assert_bool(r["unlocked"]).is_false()
	assert_str(String(r["detail"])).is_equal("7 / 10")
	assert_float(float(r["ratio"])).is_equal_approx(0.7, 0.001)


## ⚠ **진행도가 목표를 넘지 않는다.** 넘으면 막대가 칸을 뚫고 나간다
func test_the_progress_never_passes_the_target() -> void:
	var r: Dictionary = _find(AchievementsVm.build(_with(400.0)),
		"ACH_BASEBALL_100_STRIKEOUTS")
	assert_int(int(r["progress"])).is_equal(100)
	assert_float(float(r["ratio"])).is_equal(1.0)


## ⚠ **보상은 딴 뒤에만 보여준다** — 02도 그랬다
func test_the_reward_shows_only_after_unlocking() -> void:
	var done: Dictionary = _find(AchievementsVm.build(_with(1.0)),
		"ACH_BASEBALL_FIRST_STRIKEOUT")
	var todo: Dictionary = _find(AchievementsVm.build(_with(1.0)),
		"ACH_BASEBALL_500_STRIKEOUTS")
	assert_str(String(done["reward"])).is_not_empty()
	assert_str(String(todo["reward"])).is_empty()


# ── 화면 ──────────────────────────────────────────────────────

func test_the_tab_shows_the_achievements() -> void:
	var s: Dictionary = _with(1.0)
	var screen: StatusScreen = STATUS.instantiate()
	screen.set_view_model(StatusVm.build(s))
	add_child(screen)
	await await_idle_frame()

	var tab: int = -1
	for i in StatusVm.TABS.size():
		if String(StatusVm.TABS[i]["id"]) == "achievements":
			tab = i
	assert_int(tab).override_failure_message("업적 탭이 없다").is_greater(-1)
	screen._on_tab(tab)
	await await_idle_frame()

	var text: String = "\n".join(_texts(screen))
	assert_str(text).contains("첫 삼진")
	assert_str(text).contains("달성")


func test_the_screen_holds_no_achievement_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/status_screen.gd")
	# 02는 이 화면이 지표를 직접 계산했다
	assert_str(src).not_contains("Achievements.")
