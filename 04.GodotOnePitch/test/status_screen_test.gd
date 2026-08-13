extends GdUnitTestSuite

## 화면 검사 — **P5 화면 55개가 따를 본이다.**
##
## 화면이 `ViewModel` 사전 하나만 받으므로, 게임 상태 없이 가짜 사전으로
## 띄울 수 있다. 그래서 검사가 싸고 빠르다.
##
## 무엇을 보나:
##   ① 터지지 않는가 (빈 값·없는 키 포함)
##   ② 화면에 있어야 할 글자가 실제로 있는가
##   ③ **화면이 계산을 안 하는가** ← 이게 제일 중요하다
##
## ⚠ ③은 이전 프로젝트가 반복해서 겪은 결함의 뿌리다 — 수상 집계가 결산
## 모달에만 있었고, 드래프트 보드가 자기 후보 풀을 따로 만들었고, 경력 기록
## 조립이 모달 안에만 있었다. 전부 "화면이 계산을 갖고 있어서" 생겼다.


## 화면 안의 모든 Label 글자를 모은다 — 무엇이 보이는지 확인용
func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _mount(vm: Dictionary) -> StatusScreen:
	var s := StatusScreen.new(vm)
	add_child(s)
	# `_ready`가 돌아야 자식이 생긴다
	await await_idle_frame()
	return s


func test_builds_with_full_data() -> void:
	var s := await _mount(Fixtures.status_vm())
	var t := _texts(s)
	assert_array(t).contains(["신체 상태", "계약 정보", "투구 능력치"])
	assert_array(t).contains(["능력치", "기록", "커리어"])


func test_shows_injury_details() -> void:
	var s := await _mount(Fixtures.status_vm())
	var t := _texts(s)
	assert_array(t).contains(["중등도", "팔꿈치 염증", "3주 남음"])
	# 부상 이력도 보여야 한다
	assert_array(t).contains(["부상 이력"])


func test_empty_state_does_not_break() -> void:
	# ⚠ 새 게임 첫 주 — 부상도 계약도 기록도 없다. 여기서 터지는 게 흔하다
	var s := await _mount(Fixtures.status_vm_empty())
	var t := _texts(s)
	assert_array(t).contains(["이상 없음"])
	assert_array(t).not_contains(["부상 이력"])


func test_missing_keys_do_not_break() -> void:
	# 사전에 키가 아예 없어도 떠야 한다 — 이관 중엔 반쪽 사전이 흔하다
	var s := await _mount({})
	assert_object(s).is_not_null()
	assert_array(_texts(s)).contains(["신체 상태"])


func test_tabs_switch_content() -> void:
	var s := await _mount(Fixtures.status_vm())
	assert_array(_texts(s)).contains(["투구 능력치"])

	s._on_tab(1)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["2028년 시즌 누적", "평균자책"])

	s._on_tab(2)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["시즌별 성적", "다승왕"])


func test_career_empty_shows_placeholder() -> void:
	var s := await _mount(Fixtures.status_vm_empty())
	s._on_tab(2)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["아직 기록이 없습니다"])


func test_screen_does_not_compute() -> void:
	# ⚠ **화면은 표시만 한다.** 계산이 들어오면 여기서 막는다.
	#
	# 원본 `StatusPage.svelte`는 1,004줄인데 그중 상당수가 계산이었다.
	# 옮기면서 그걸 같이 가져오면 같은 결함을 다시 만든다.
	var src := FileAccess.get_file_as_string("res://ui/status_screen.gd")
	# 시즌·연도 집계, 정렬, 누적 — 전부 ViewModel이 할 일이다
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains("filter(")
	# 화면이 스토어를 직접 읽으면 안 된다
	assert_str(src).not_contains("NpcStore")
	assert_str(src).not_contains("load_from")


func test_grade_color_marks_levels() -> void:
	# 숫자만 보면 70이 좋은지 나쁜지 모른다 — 색이 등급을 말한다
	assert_object(Parts.grade_color(90.0)).is_equal(AppTheme.ACCENT)
	assert_object(Parts.grade_color(78.0)).is_equal(AppTheme.OK)
	assert_object(Parts.grade_color(65.0)).is_equal(AppTheme.TEXT)
	assert_object(Parts.grade_color(50.0)).is_equal(AppTheme.TEXT_DIM)


func test_font_is_embedded_not_system() -> void:
	# ⚠ **시스템 폰트로 떨어지면 안 된다.** 기기마다 다르게 보이고, 한글
	# 폰트가 없는 환경에서는 □□□로 깨진다. 자간·굵기가 달라 레이아웃도 밀린다.
	#
	# 폰트를 실수로 지우거나 경로를 바꾸면 `korean_font()`가 조용히
	# `SystemFont`로 떨어진다 — 개발 중엔 티가 안 나고 배포본에서 터진다
	assert_bool(ResourceLoader.exists(AppTheme.FONT_REGULAR)).override_failure_message(
		"임베드 폰트가 없다: %s" % AppTheme.FONT_REGULAR).is_true()
	assert_bool(ResourceLoader.exists(AppTheme.FONT_BOLD)).is_true()

	var f := AppTheme.korean_font()
	assert_bool(f is SystemFont).override_failure_message(
		"시스템 폰트로 떨어졌다 — 임베드 폰트를 못 읽었다").is_false()


func test_font_covers_hangul() -> void:
	# 라틴만 있는 폰트를 잘못 넣으면 한글이 두부(□)로 나온다.
	# 글자 폭이 0이 아닌지로 본다
	var f := AppTheme.korean_font()
	var w: float = f.get_string_size("능력치", HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
	assert_float(w).is_greater(10.0)


func test_license_ships_with_font() -> void:
	# ⚠ OFL은 **라이선스 전문을 같이 배포**하는 게 조건이다.
	# 파일이 빠지면 라이선스 위반이다
	assert_bool(FileAccess.file_exists("res://fonts/OFL.txt")).is_true()
	var txt := FileAccess.get_file_as_string("res://fonts/OFL.txt")
	assert_str(txt).contains("SIL OPEN FONT LICENSE")
