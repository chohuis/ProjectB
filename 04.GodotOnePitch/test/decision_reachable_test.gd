extends GdUnitTestSuite

## 결정 갈래가 **실제로 뜨나** — 🔴 셋이 도달 불가였다.
##
## `DecisionVm`은 아홉 갈래를 받고 `AutoAdvance`도 아홉을 세는데,
## **대기줄에 올리는 곳이 없는 갈래가 셋**이다:
##
## | 갈래 | 받는 쪽 | 해소하는 쪽 | **올리는 쪽** |
## |---|---|---|---|
## | `draft_observe` | ✅ `_observe` | ✅ `apply` | ❌ **없다** |
## | `option_clause` | ✅ `_option` | ✅ `Pending.resolve` | ❌ **없다** |
##
## ❓ **`trade`는 가리지 못했다.** `"type": "trade"`가 둘 있는데 둘 다
## `career_events`에 쌓는 기록이지 대기줄 입구가 아니다 — 읽어서는
## 입구가 없는 것으로 보이나 **문자열로는 못 가른다**. ⬜ 굴려서 확인한다
## | `draft_observe` | ✅ `_observe` | ✅ `apply` | ❌ **없다** |
## | `option_clause` | ✅ `_option` | ✅ `Pending.resolve` | ❌ **없다** |
##
## ⚠ **체육부대와 똑같은 모양이다**(열여덟 번째 죽은 배선). 코드는 네 곳에
## 흩어져 있는데 입구가 없어서 게임에 한 번도 안 나타난다.
##
## ⚠ **`retirement_ask`는 반대 모양이었다** — 올리는 쪽만 있고 받는 쪽이
## 없어 자동 진행이 거기서 멈췄다. **양쪽을 다 센다.**


## 대기줄에 올리는 코드가 있는 갈래 — 여기 있으면 "입구가 있다"
const HAS_ENTRY: Array[String] = [
	"career_results", "career_choice_hub", "career_choice",
	"draft_notification", "salary_negotiation", "fa_market", "trade",
	"sports_unit_apply", "military_enlist_ask",
]

## 🔴 **입구가 없는 갈래.** 고칠 때마다 여기서 뺀다 —
## 목록이 줄지 않으면 아무것도 안 고친 것이다
const NO_ENTRY: Array[String] = ["draft_observe", "option_clause"]


func _sources() -> String:
	var out: String = ""
	for f in ["career_decision", "contract_decision", "career_runner",
			"military", "trade_runner", "week_runner", "season_runner",
			"draft", "fa_runner", "retirement"]:
		var path: String = "res://sim/%s.gd" % f
		if FileAccess.file_exists(path):
			out += CodeText.of(path)
	return out


# ── 입구가 있나 ───────────────────────────────────────────────────

## 입구가 있다고 적어 둔 갈래는 정말 있어야 한다
func test_입구가_있다고_적은_것은_정말_있다() -> void:
	var src: String = _sources()
	for t in HAS_ENTRY:
		assert_int(src.find("\"type\": \"%s\"" % t)).override_failure_message(
			"`%s`를 대기줄에 올리는 곳이 없다 — 화면이 영영 안 뜬다" % t) \
			.is_greater(-1)


## 🔴 **여기가 요점이다.** 고치면 이 검사가 깨진다 — 그때 `NO_ENTRY`에서 뺀다
func test_입구가_없는_갈래를_세어_둔다() -> void:
	var src: String = _sources()
	var still: Array[String] = []
	for t in NO_ENTRY:
		if src.find("\"type\": \"%s\"" % t) < 0:
			still.append(t)
	assert_array(still).override_failure_message(
		"입구가 생긴 갈래가 있다 — `NO_ENTRY`에서 빼라. 지금 없는 것: %s"
		% str(still)).is_equal(NO_ENTRY)


## ⚠ **받는 쪽은 다 있다.** 없는 건 입구뿐이라는 걸 못 박는다 —
## 그래야 "화면을 만들면 된다"는 오해를 안 한다
func test_받는_쪽은_다_있다() -> void:
	var vm := CodeText.of("res://ui/decision_vm.gd")
	for t in NO_ENTRY + HAS_ENTRY:
		assert_int(vm.find("\"%s\"" % t)).override_failure_message(
			"`%s`를 화면이 못 받는다" % t).is_greater(-1)


## ⚠ **`AutoAdvance`가 안 세면 자동 진행이 안 멈춘다** — 물음이 떠도
## 그냥 지나간다. 목록이 정본인 자리를 같이 본다
func test_자동_진행도_다_센다() -> void:
	var aa := CodeText.of("res://sim/auto_advance.gd")
	for t in NO_ENTRY + HAS_ENTRY:
		assert_int(aa.find("\"%s\"" % t)).override_failure_message(
			"`%s`를 자동 진행이 안 센다 — 물음이 떠도 지나간다" % t) \
			.is_greater(-1)
