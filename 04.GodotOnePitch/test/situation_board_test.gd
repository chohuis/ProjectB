extends GdUnitTestSuite

## 상황판 — 베이스 다이아몬드 + S/B/O 램프 (M-3).
##
## 원본: `MatchPage.svelte:1591-1631`(마크업) · `:2384-2415`(다이아몬드) ·
## `:2455-2482`(램프)
##
## ⚠ **02가 둘을 한 패널로 합쳤다.** 주석이 근거를 적어 뒀다 —
## "둘은 **한 상황의 두 축**이고 따로 보면 '2사 만루'를 읽는 데 눈이 두 번
## 움직인다."
##
## ⚠ **04는 글자로만 보여줬다**("2·3루" · "카운트 1-2" · "2아웃").
## 데이터는 다 있는데 **한눈에 안 읽힌다.**

const SIZE: float = 104.0


func _board() -> SituationBoard:
	var b: SituationBoard = auto_free(SituationBoard.new())
	b.size = Vector2(SIZE, SIZE)
	return b


## 02 `.b1/.b2/.b3/.home`은 **대칭이 아니다** — `left: 52`인데 104폭에
## 16짜리 베이스의 중앙은 44다. `_draw()`로 그리는 04는 정확히 맞출 수
## 있으므로 **비율로 대칭으로 뒀다**
func test_네_베이스가_마름모로_대칭이다() -> void:
	var p: Dictionary = SituationBoard.base_points(Vector2(SIZE, SIZE))
	var second: Vector2 = p["second"]
	var third: Vector2 = p["third"]
	var first: Vector2 = p["first"]
	var home: Vector2 = p["home"]

	# 2루와 홈은 가로 중앙에 있다
	assert_float(second.x).is_equal_approx(SIZE * 0.5, 0.01)
	assert_float(home.x).is_equal_approx(SIZE * 0.5, 0.01)
	# 1루와 3루는 세로 중앙에 있다
	assert_float(first.y).is_equal_approx(SIZE * 0.5, 0.01)
	assert_float(third.y).is_equal_approx(SIZE * 0.5, 0.01)
	# 1루와 3루가 중앙에서 같은 거리에 있다
	assert_float(SIZE * 0.5 - third.x).is_equal_approx(first.x - SIZE * 0.5, 0.01)
	# 2루와 홈도 마찬가지
	assert_float(SIZE * 0.5 - second.y).is_equal_approx(home.y - SIZE * 0.5, 0.01)


## ⚠ **야구판의 방향이다.** 2루가 위, 홈이 아래, 1루가 오른쪽 —
## 뒤집으면 3루 주자가 1루에 서 있는 것으로 보인다
func test_방향이_야구판과_같다() -> void:
	var p: Dictionary = SituationBoard.base_points(Vector2(SIZE, SIZE))
	assert_float(p["second"].y).override_failure_message(
		"2루가 홈보다 아래에 있다").is_less(p["home"].y)
	assert_float(p["third"].x).override_failure_message(
		"3루가 1루보다 오른쪽에 있다").is_less(p["first"].x)


## 주자가 있는 베이스만 채운다 — 02 `.base.on`
func test_주자가_있는_베이스만_채워진다() -> void:
	var b: SituationBoard = _board()
	b.setup({"on_first": true, "on_second": false, "on_third": true,
		"balls": 0, "strikes": 0, "outs": 0})
	assert_bool(b.is_base_on("first")).is_true()
	assert_bool(b.is_base_on("second")).is_false()
	assert_bool(b.is_base_on("third")).is_true()
	# 홈은 주자 자리가 아니다 — 늘 비어 있다
	assert_bool(b.is_base_on("home")).override_failure_message(
		"홈에 주자가 서 있다").is_false()


## 02 `:1606-1628` — S 2칸 · B 3칸 · O 2칸. **개수가 다르다**
func test_램프_개수가_02와_같다() -> void:
	assert_int(SituationBoard.lamp_count("strike")).is_equal(2)
	assert_int(SituationBoard.lamp_count("ball")).is_equal(3)
	assert_int(SituationBoard.lamp_count("out")).is_equal(2)


## `count.strike > lampIndex` — 스트라이크 1개면 첫 칸만 켜진다
func test_켜진_램프_수가_카운트와_같다() -> void:
	var b: SituationBoard = _board()
	b.setup({"on_first": false, "on_second": false, "on_third": false,
		"balls": 2, "strikes": 1, "outs": 0})
	assert_bool(b.is_lamp_on("strike", 0)).is_true()
	assert_bool(b.is_lamp_on("strike", 1)).is_false()
	assert_bool(b.is_lamp_on("ball", 0)).is_true()
	assert_bool(b.is_lamp_on("ball", 1)).is_true()
	assert_bool(b.is_lamp_on("ball", 2)).is_false()
	assert_bool(b.is_lamp_on("out", 0)).is_false()


## ⚠ **삼진·볼넷 직전 값이 들어올 수 있다.** 스트라이크 3은 램프가 둘인데
## 3이 온다 — 넘쳐도 안 죽어야 한다
func test_램프보다_큰_카운트가_와도_안_죽는다() -> void:
	var b: SituationBoard = _board()
	b.setup({"on_first": false, "on_second": false, "on_third": false,
		"balls": 4, "strikes": 3, "outs": 3})
	assert_bool(b.is_lamp_on("strike", 1)).is_true()
	assert_bool(b.is_lamp_on("ball", 2)).is_true()
	assert_bool(b.is_lamp_on("out", 1)).is_true()


## 02 `:2465-2477` — S 초록 · B 노랑 · O 빨강. **뜻이 색으로 갈린다**
func test_램프_색이_02와_같다() -> void:
	assert_object(SituationBoard.lamp_color("strike")).is_equal(AppTheme.OK)
	assert_object(SituationBoard.lamp_color("ball")).is_equal(AppTheme.WARN)
	assert_object(SituationBoard.lamp_color("out")).is_equal(AppTheme.BAD)


## 배선의 끝 — 경기 화면이 상황판을 쓰나
func test_경기_화면이_상황판을_쓴다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/match_screen.gd")
	assert_int(src.find("SituationBoard")).override_failure_message(
		"경기 화면이 상황판을 안 쓴다").is_greater(-1)
