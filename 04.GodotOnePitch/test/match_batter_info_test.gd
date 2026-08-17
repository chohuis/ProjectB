extends GdUnitTestSuite

## 타자 정보 카드 — M-5.
##
## 원본: `MatchPage.svelte:1790-1822`(패널) · `statCard.ts:38-44`(능력치 다섯) ·
## `:73-85`(시즌 줄)
##
## ⚠ **04는 이름만 보여줬다.** 브리핑(F-5)이 상대 타선의 OVR·태그를 주지만
## **첫 공 전에만 뜨고 사라진다** — 던지는 중엔 지금 상대가 어떤 타자인지
## 알 방법이 없다.
##
## ⚠ **02가 그 자리에 적어 뒀다**: "엔진은 처음부터 열 개를 보내고 있었는데
## **화면은 셋만 읽었다**." 그래서 다섯으로 정리한 것이 `BATTER_KEYS`다.
##
## ⚠ **뒷면은 실제 기록만 그린다** — 없으면 0이 아니라 "기록 없음"이다
## (`statCard.ts` 머리말).

const ME: String = "P_ME"


func _batter() -> Dictionary:
	return {"id": "B1", "contact": 72.0, "power": 55.0, "eye": 61.0,
		"batting_clutch": 48.0, "speed": 80.0}


func _state(extra: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"inning": 3, "half": "top", "outs": 1,
		"score": {"home": 2, "away": 1},
		"count": {"balls": 1, "strikes": 2},
		"runners": {}, "pitcher": {"id": ME}, "batter": _batter(),
	}
	s.merge(extra, true)
	return s


func _vm(ctx_extra: Dictionary = {}, extra: Dictionary = {}) -> Dictionary:
	var ctx: Dictionary = {"my_side": "home", "my_id": ME,
		"names": {"B1": "김타자"}}
	ctx.merge(ctx_extra, true)
	return MatchVm.build(_state(extra), ctx)


## 02 `statCard.ts:38-44` — 다섯이고 순서도 그대로다.
## **값을 못 박는다** — 상수에서 끌어오면 아무것도 안 본다
func test_능력치_다섯이_02_순서로_나온다() -> void:
	var bars: Array = _vm()["batter_bars"]
	assert_int(bars.size()).is_equal(5)
	assert_str(String(bars[0]["label"])).is_equal("컨택")
	assert_str(String(bars[1]["label"])).is_equal("파워")
	assert_str(String(bars[2]["label"])).is_equal("선구")
	assert_str(String(bars[3]["label"])).is_equal("클러치")
	assert_str(String(bars[4]["label"])).is_equal("주력")
	assert_float(float(bars[0]["value"])).is_equal(72.0)
	assert_float(float(bars[4]["value"])).is_equal(80.0)


## ⚠ **키 이름을 지어내면 그 줄이 조용히 빠진다.** F-4a에서 `clutch`로
## 적었다가 실제 키가 `batting_clutch`인 것을 뒤늦게 찾았다
func test_클러치_키가_실제_키다() -> void:
	var bars: Array = _vm()["batter_bars"]
	assert_float(float(bars[3]["value"])).override_failure_message(
		"클러치가 기본값이다 — 키 이름이 틀렸다").is_equal(48.0)


## 02 `batterBars` — 값이 없는 항목은 **아예 뺀다**
func test_없는_능력치는_줄을_안_만든다() -> void:
	var b: Dictionary = _batter()
	b.erase("speed")
	b.erase("eye")
	var bars: Array = _vm({}, {"batter": b})["batter_bars"]
	assert_int(bars.size()).is_equal(3)
	for r in bars:
		assert_str(String(r["label"])).is_not_equal("주력")


## 02 `:77` — 타석이 없으면 **빈 배열**이고 화면이 "기록 없음"을 쓴다
func test_기록이_없으면_빈_배열이다() -> void:
	assert_array(_vm()["batter_season"]).override_failure_message(
		"기록이 없는데 0으로 채운 줄이 나온다").is_empty()


func test_시즌_줄이_02_순서로_나온다() -> void:
	var stats: Dictionary = {"B1": {"type": "batter", "g": 20, "pa": 80,
		"ab": 72, "h": 24, "hr": 3, "rbi": 15, "avg": 0.333, "ops": 0.910}}
	var lines: Array = _vm({"season_stats": stats})["batter_season"]
	assert_int(lines.size()).is_equal(5)
	assert_str(String(lines[0]["label"])).is_equal("타율")
	assert_str(String(lines[1]["label"])).is_equal("OPS")
	assert_str(String(lines[2]["label"])).is_equal("홈런")
	assert_str(String(lines[3]["label"])).is_equal("타점")
	assert_str(String(lines[4]["label"])).is_equal("경기")
	assert_str(String(lines[2]["value"])).is_equal("3")
	assert_str(String(lines[4]["value"])).is_equal("20")


## 02 `rate3` — **야구 표기는 앞의 0을 뗀다**
func test_비율은_앞의_0을_뗀다() -> void:
	assert_str(MatchVm.rate3(0.333)).is_equal(".333")
	assert_str(MatchVm.rate3(0.910)).is_equal(".910")
	# 1을 넘으면 0을 안 뗀다 — OPS는 1을 넘는다
	assert_str(MatchVm.rate3(1.024)).is_equal("1.024")


## ⚠ **타석은 있는데 타수가 0일 수 있다**(볼넷만 골랐다) — 나눗셈이 죽는다.
## 02는 `stats.ab > 0`을 따로 본다
func test_타수가_0이면_타율은_대시다() -> void:
	var stats: Dictionary = {"B1": {"type": "batter", "g": 3, "pa": 4,
		"ab": 0, "h": 0, "hr": 0, "rbi": 0, "avg": 0.0, "ops": 0.0}}
	var lines: Array = _vm({"season_stats": stats})["batter_season"]
	assert_str(String(lines[0]["value"])).is_equal("-")
	assert_str(String(lines[1]["value"])).is_equal("-")


## 배선의 끝 — 화면이 실제로 그리나
func test_화면이_타자_카드를_그린다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/match_screen.gd")
	assert_int(src.find("batter_bars")).override_failure_message(
		"경기 화면이 타자 능력치를 안 그린다").is_greater(-1)
