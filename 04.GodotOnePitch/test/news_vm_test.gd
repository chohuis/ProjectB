extends GdUnitTestSuite

## 소식 탭 ViewModel — M7-5.
##
## 원본: `pages/news/NewsPage.svelte` (540줄) · `utils/messageCategory.ts`
##
## ⚠ **02가 여기서 배운 것 셋이 그대로 온다:**
##
##   ① `id`가 겹치면 세이브가 아예 안 열린다 — 목록이 id를 키로 잡아서
##      Svelte가 `each_key_duplicate`로 죽었고 로드 화면에서 멈췄다
##   ② 분류 4종을 그대로 칩으로 깔면 한 줄에 안 들어간다 — 3묶음으로 준다
##   ③ 답을 안 한 결정은 **읽어도 안 읽음이 아니다** — 따로 세고 위로 올린다


func _msg(id: String, over: Dictionary = {}) -> Dictionary:
	var m: Dictionary = {
		"id": id, "category": "news", "sender": "스포츠조선",
		"subject": "제목 %s" % id, "preview": "미리보기",
		"day": 10, "read": false, "decision": null,
	}
	m.merge(over, true)
	return m


func _state(msgs: Array = [], over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {"day": 10, "season_year": 2027, "mailbox": msgs}
	s.merge(over, true)
	return s


func _ids(rows: Array) -> Array:
	var out: Array = []
	for r in rows:
		out.append(r["id"])
	return out


# ── 순서 ──────────────────────────────────────────────────────

## ⚠ **답을 안 한 결정이 맨 위다.** 밑에 묻히면 진행이 왜 막혔는지 모른다
func test_undecided_messages_come_first() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A", {"day": 20}),
		_msg("B", {"day": 5, "decision": {"selected": null}}),
		_msg("C", {"day": 30}),
	]))
	assert_str(_ids(vm["rows"])[0]).is_equal("B")


## 나머지는 최신순
func test_the_rest_are_newest_first() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A", {"day": 5}), _msg("B", {"day": 30}), _msg("C", {"day": 20})]))
	assert_array(_ids(vm["rows"])).is_equal(["B", "C", "A"])


func test_oldest_first_can_be_asked_for() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A", {"day": 5}), _msg("B", {"day": 30})], {"news_oldest_first": true}))
	assert_array(_ids(vm["rows"])).is_equal(["A", "B"])


## ⚠ **뒤집어도 미결정은 위에 남는다.** 정렬이 그걸 밀어내면 결정이 사라진다
func test_undecided_stays_on_top_even_when_reversed() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A", {"day": 5}),
		_msg("B", {"day": 30, "decision": {"selected": null}}),
	], {"news_oldest_first": true}))
	assert_str(_ids(vm["rows"])[0]).is_equal("B")


# ── 거르기 ────────────────────────────────────────────────────

## ⚠ **분류 4종을 그대로 칩으로 깔면 한 줄에 안 들어간다.** 보낸 사람이
## 누구인가로 3묶음. 코치·감독은 둘 다 팀 사람이고 실측에서 각각 2건뿐이었다
func test_the_filters_are_all_unread_and_three_groups() -> void:
	var ids: Array = []
	for f in NewsVm.build(_state())["filters"]:
		ids.append(f["id"])
	assert_array(ids).is_equal(["all", "unread", "staff", "news", "system"])


func test_the_unread_filter_shows_only_unread() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A", {"read": true}), _msg("B", {"read": false})], {"news_filter": "unread"}))
	assert_array(_ids(vm["rows"])).is_equal(["B"])


func test_a_group_filter_covers_every_category_in_it() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A", {"category": "coach"}),
		_msg("B", {"category": "manager"}),
		_msg("C", {"category": "news"}),
	], {"news_filter": "staff"}))
	assert_array(_ids(vm["rows"])).is_equal(["A", "B"])


func test_an_unknown_filter_shows_everything() -> void:
	var vm: Dictionary = NewsVm.build(_state([_msg("A"), _msg("B")],
		{"news_filter": "no_such"}))
	assert_int(vm["rows"].size()).is_equal(2)


## 칩마다 몇 통인지 붙는다 — 들어가 보지 않고도 안다
func test_each_filter_carries_its_count() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A", {"category": "coach", "read": true}),
		_msg("B", {"category": "news"}),
		_msg("C", {"category": "system"}),
	]))
	var by: Dictionary = {}
	for f in vm["filters"]:
		by[f["id"]] = f["count"]
	assert_int(by["all"]).is_equal(3)
	assert_int(by["unread"]).is_equal(2)
	assert_int(by["staff"]).is_equal(1)


# ── 줄에 무엇이 실리나 ────────────────────────────────────────

func test_a_row_carries_what_the_screen_shows() -> void:
	var r: Dictionary = NewsVm.build(_state([_msg("A", {"day": 12})]))["rows"][0]
	assert_str(r["subject"]).is_equal("제목 A")
	assert_str(r["sender"]).is_equal("스포츠조선")
	assert_str(r["category_label"]).is_equal("뉴스")
	assert_str(r["date_label"]).is_equal("3월 12일")
	assert_bool(r["unread"]).is_true()


## ⚠ **모르는 분류에 빈칸을 주지 않는다.** 분류가 늘 때 화면이 조용히
## 비어 보이면 새 분류가 붙은 걸 아무도 모른다
func test_an_unknown_category_falls_back_to_its_id() -> void:
	var r: Dictionary = NewsVm.build(_state([_msg("A", {"category": "weird"})]))["rows"][0]
	assert_str(r["category_label"]).is_equal("weird")


func test_a_pending_row_is_marked() -> void:
	var r: Dictionary = NewsVm.build(_state([
		_msg("A", {"decision": {"selected": null}})]))["rows"][0]
	assert_bool(r["pending"]).is_true()


func test_a_decided_row_is_not_pending() -> void:
	var r: Dictionary = NewsVm.build(_state([
		_msg("A", {"decision": {"selected": "yes"}})]))["rows"][0]
	assert_bool(r["pending"]).is_false()
	assert_bool(r["decided"]).is_true()


# ── 모두 읽음 ─────────────────────────────────────────────────

## ⚠ **답을 안 한 결정은 "모두 읽음"으로 안 지운다.** 지우면 그 결정이
## 목록에서 조용히 사라져 진행이 영영 막힌다
func test_mark_all_read_skips_undecided() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A"), _msg("B", {"decision": {"selected": null}})]))
	assert_int(vm["markable_count"]).is_equal(1)


func test_nothing_to_mark_when_all_read() -> void:
	var vm: Dictionary = NewsVm.build(_state([_msg("A", {"read": true})]))
	assert_int(vm["markable_count"]).is_equal(0)


# ── id 유일성 ─────────────────────────────────────────────────

## ⚠ **`id`가 겹치면 02에선 세이브가 아예 안 열렸다.** 목록이 id를 키로
## 잡아서 Svelte가 죽었고 로드 화면에서 멈춘 채 화면엔 단서가 없었다.
##
## Godot은 안 죽지만 **줄이 겹쳐 하나가 사라진다.** 조용하다 —
## 그래서 겹침을 세어 밖으로 낸다
func test_duplicate_ids_are_reported() -> void:
	var vm: Dictionary = NewsVm.build(_state([
		_msg("A"), _msg("A"), _msg("B")]))
	assert_int(vm["duplicate_ids"]).is_equal(1)
	# 그래도 둘 다 보여준다 — 조용히 지우는 게 더 나쁘다
	assert_int(vm["rows"].size()).is_equal(3)


func test_unique_ids_report_nothing() -> void:
	assert_int(NewsVm.build(_state([_msg("A"), _msg("B")]))["duplicate_ids"]).is_equal(0)


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_mailbox_does_not_break() -> void:
	var vm: Dictionary = NewsVm.build({})
	assert_array(vm["rows"]).is_empty()
	assert_int(vm["markable_count"]).is_equal(0)
	assert_int(vm["filters"].size()).is_equal(5)


func test_the_view_model_does_not_know_the_screen() -> void:
	# ⚠ **`not_contains`로는 못 본다** (D-8) — 대소문자를 무시하고 주석까지
	# 코드로 본다
	for node in ["Control", "Label"]:
		assert_bool(CodeText.lacks("res://ui/news_vm.gd", node)) \
			.override_failure_message("ViewModel이 화면 노드를 안다: %s" % node) \
			.is_true()
