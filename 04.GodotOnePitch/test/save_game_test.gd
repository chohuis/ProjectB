extends GdUnitTestSuite

## 세이브 — M8-4.
##
## 원본: `slotdb.cjs` · `save.ts` · 02의 슬롯 구조
##
## ⚠ **02가 세이브에서 겪은 것 셋:**
##
##   ① 소식 `id`가 겹치면 **세이브가 아예 안 열렸다** — 로드 화면에서 멈춘
##      채 화면엔 단서가 없었다
##   ② **"한 해에 한 번" 가드가 세션 한정이었다.** 가드가 막으려는 결과는
##      DB에 즉시 쓰여 영구인데 가드 자신은 안 저장돼서, 앱을 껐다 켜면
##      없던 일이 됐다
##   ③ 스키마를 `CREATE TABLE IF NOT EXISTS`로만 바꿔서 **기존 슬롯에 조용히
##      반영이 안 됐다**


var _dir: String = "user://test_saves"


func before_test() -> void:
	DirAccess.make_dir_recursive_absolute(_dir)


func after_test() -> void:
	var d := DirAccess.open(_dir)
	if d == null:
		return
	for f in d.get_files():
		d.remove(f)


func _path(name: String = "t.sav") -> String:
	return "%s/%s" % [_dir, name]


func _state() -> Dictionary:
	return World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})


# ── 오가는가 ──────────────────────────────────────────────────

func test_a_saved_game_comes_back() -> void:
	var s: Dictionary = _state()
	assert_int(SaveGame.write(_path(), s)).is_equal(OK)

	var back: Dictionary = SaveGame.read(_path())
	assert_str(back.get("error", "")).is_empty()
	assert_int(back["state"]["day"]).is_equal(s["day"])
	assert_int(back["state"]["season_year"]).is_equal(s["season_year"])
	assert_str(back["state"]["protagonist"]["name"]).is_equal("김한결")


## ⚠ **세계가 통째로 돌아와야 한다.** 선수 하나라도 빠지면 그 팀이 경기를
## 못 치르는데, 오류는 몇 시즌 뒤에 "리그가 이상하다"로 나온다
func test_every_player_comes_back() -> void:
	var s: Dictionary = _state()
	SaveGame.write(_path(), s)
	var back: Dictionary = SaveGame.read(_path())["state"]
	assert_int(World.all_players(back["world"]).size()) \
		.is_equal(World.all_players(s["world"]).size())


func test_the_schedule_comes_back() -> void:
	var s: Dictionary = _state()
	SaveGame.write(_path(), s)
	var back: Dictionary = SaveGame.read(_path())["state"]
	assert_int(back["schedule"].size()).is_equal(s["schedule"].size())


## 진행한 뒤 저장하면 그 자리에서 이어진다
func test_progress_survives_a_round_trip() -> void:
	var s: Dictionary = _state()
	s["day"] = 42
	s["protagonist"]["fatigue"] = 33.0
	s["schedule"][0]["result"] = {"home_score": 3, "away_score": 1, "winner": "TEAM_A"}

	SaveGame.write(_path(), s)
	var back: Dictionary = SaveGame.read(_path())["state"]
	assert_int(back["day"]).is_equal(42)
	assert_float(back["protagonist"]["fatigue"]).is_equal(33.0)
	assert_object(back["schedule"][0]["result"]).is_not_null()


## ⚠ **부른 쪽 사전을 안 건드린다.** 저장이 상태를 바꾸면 저장할 때마다
## 게임이 조금씩 달라진다
func test_writing_does_not_mutate_the_state() -> void:
	var s: Dictionary = _state()
	var before: int = s["schedule"].size()
	SaveGame.write(_path(), s)
	assert_int(s["schedule"].size()).is_equal(before)
	assert_bool(s.has("_meta")).is_false()


# ── 한 해에 한 번 가드 ────────────────────────────────────────

## ⚠ **가드가 세션 한정이면 앱을 껐다 켤 때 없던 일이 된다.** 02가 그랬고,
## 그러면 NPC 전원이 나이를 두 살 먹고 학년이 두 번 오른다
func test_the_once_a_year_guards_are_saved() -> void:
	var s: Dictionary = _state()
	for k in SeasonEnd.SAVED_FIELDS:
		s[k] = 2027

	SaveGame.write(_path(), s)
	var back: Dictionary = SaveGame.read(_path())["state"]
	for k in SeasonEnd.SAVED_FIELDS:
		assert_int(back.get(k, -1)).override_failure_message(
			"가드 %s가 저장에서 사라졌다" % k).is_equal(2027)


# ── 깨진 파일 ─────────────────────────────────────────────────

## ⚠ **없는 파일에 조용히 빈 게임을 주면 안 된다.** 세이브가 사라진 걸
## 모른 채 새로 시작하게 된다
func test_a_missing_file_reports_an_error() -> void:
	var back: Dictionary = SaveGame.read(_path("nope.sav"))
	assert_str(back["error"]).is_not_empty()
	assert_bool(back["state"].is_empty()).is_true()


func test_a_file_that_is_not_a_save_reports_an_error() -> void:
	var f := FileAccess.open(_path(), FileAccess.WRITE)
	f.store_string("이건 세이브가 아니다")
	f.close()
	assert_str(SaveGame.read(_path())["error"]).is_not_empty()


## ⚠ **잘린 파일에서 죽으면 안 된다.** 저장 중에 전원이 나가면 이렇게 된다
func test_a_truncated_file_reports_an_error() -> void:
	var s: Dictionary = _state()
	SaveGame.write(_path(), s)

	var whole := FileAccess.get_file_as_bytes(_path())
	var f := FileAccess.open(_path(), FileAccess.WRITE)
	f.store_buffer(whole.slice(0, whole.size() / 2))
	f.close()

	var back: Dictionary = SaveGame.read(_path())
	assert_str(back["error"]).is_not_empty()
	assert_bool(back["state"].is_empty()).is_true()


## ⚠ **더 새로운 세이브를 억지로 열지 않는다.** 열이 늘어난 세이브를 옛
## 코드가 읽으면 조용히 틀린 값이 들어온다
func test_a_newer_save_is_refused() -> void:
	var s: Dictionary = _state()
	SaveGame.write(_path(), s)

	var whole := FileAccess.get_file_as_bytes(_path())
	var f := FileAccess.open(_path(), FileAccess.WRITE)
	f.store_32(SaveGame.MAGIC)
	f.store_32(SaveGame.VERSION + 1)
	f.store_buffer(whole.slice(8))
	f.close()

	assert_str(SaveGame.read(_path())["error"]).contains("새로운")


## ⚠ **방어가 겹쳐 있어서 하나씩 직접 봐야 한다.** 파일을 망가뜨려 보면
## 앞 가드가 먼저 걸려서, 뒤 가드를 지워도 결과가 같아 보인다 —
## 실제로 변이 여섯이 그렇게 빠져나갔다
func test_verify_names_the_missing_key() -> void:
	for k in ["day", "season_year", "protagonist", "schedule"]:
		var s: Dictionary = {"day": 1, "season_year": 2027,
			"protagonist": {}, "schedule": []}
		s.erase(k)
		assert_str(SaveGame.verify(s)).override_failure_message(
			"'%s'가 없는데 통과했다" % k).contains(k)


func test_verify_refuses_a_day_below_one() -> void:
	var s: Dictionary = {"day": 0, "season_year": 2027,
		"protagonist": {}, "schedule": []}
	assert_str(SaveGame.verify(s)).is_not_empty()
	s["day"] = 1
	assert_str(SaveGame.verify(s)).is_empty()


## 검증을 안 부르면 이게 통과한다
func test_a_state_that_fails_verify_does_not_load() -> void:
	var f := FileAccess.open(_path(), FileAccess.WRITE)
	f.store_32(SaveGame.MAGIC)
	f.store_32(SaveGame.VERSION)
	f.store_var({"day": 1, "season_year": 2027, "player_name": "", "team_name": ""})
	var raw: PackedByteArray = var_to_bytes({"day": 1})   # 필수 키가 없다
	var packed: PackedByteArray = raw.compress(FileAccess.COMPRESSION_ZSTD)
	f.store_32(raw.size())
	f.store_32(packed.size())
	f.store_buffer(packed)
	f.close()

	var back: Dictionary = SaveGame.read(_path())
	assert_str(back["error"]).is_not_empty()
	assert_bool(back["state"].is_empty()).is_true()


## ⚠ **표식이 없으면 그렇게 말해야 한다.** "머리말이 깨졌다"로 뭉치면
## 세이브가 아닌 파일을 골랐는지, 세이브가 상했는지 구분이 안 된다
func test_a_non_save_file_says_it_is_not_a_save() -> void:
	var f := FileAccess.open(_path(), FileAccess.WRITE)
	f.store_string("이건 세이브가 아니다. 아주 길게 써서 길이는 넉넉하게 만든다.")
	f.close()
	assert_str(SaveGame.read(_path())["error"]).contains("형식")
	assert_str(SaveGame.read_header(_path())["error"]).contains("형식")


func test_a_newer_header_is_refused() -> void:
	var s: Dictionary = _state()
	SaveGame.write(_path(), s)
	var whole := FileAccess.get_file_as_bytes(_path())
	var f := FileAccess.open(_path(), FileAccess.WRITE)
	f.store_32(SaveGame.MAGIC)
	f.store_32(SaveGame.VERSION + 1)
	f.store_buffer(whole.slice(8))
	f.close()
	assert_str(SaveGame.read_header(_path())["error"]).contains("새로운")


## ⚠ **자르는 자리마다 걸리는 가드가 다르다.** 한 자리만 보면 나머지
## 가드를 지워도 안 걸린다
func test_truncation_at_any_point_is_caught() -> void:
	var s: Dictionary = _state()
	SaveGame.write(_path(), s)
	var whole := FileAccess.get_file_as_bytes(_path())

	for frac in [0.05, 0.3, 0.6, 0.9, 0.99]:
		var f := FileAccess.open(_path(), FileAccess.WRITE)
		f.store_buffer(whole.slice(0, int(whole.size() * frac)))
		f.close()
		var back: Dictionary = SaveGame.read(_path())
		assert_str(back["error"]).override_failure_message(
			"%.0f%%에서 자른 파일이 통과했다" % (frac * 100.0)).is_not_empty()
		assert_bool(back["state"].is_empty()).is_true()


## 파일을 쓰는 헬퍼 — 손상 검사가 부분마다 다르게 망가뜨린다
func _write_raw(header: Variant, rawlen: int, packed: PackedByteArray) -> void:
	var f := FileAccess.open(_path(), FileAccess.WRITE)
	f.store_32(SaveGame.MAGIC)
	f.store_32(SaveGame.VERSION)
	f.store_var(header)
	f.store_32(rawlen)
	f.store_32(packed.size())
	f.store_buffer(packed)
	f.close()


## ⚠ **머리말만 상한 경우가 따로 있다.** 표식은 맞는데 그 뒤가 사전이
## 아니면, 목록 화면이 그걸 그대로 읽어 빈 슬롯처럼 보인다
func test_a_broken_header_inside_a_valid_file_is_caught() -> void:
	var raw: PackedByteArray = var_to_bytes(_state())
	_write_raw("머리말이 아니라 그냥 글자", raw.size(),
		raw.compress(FileAccess.COMPRESSION_ZSTD))
	assert_str(SaveGame.read(_path())["error"]).contains("머리말")
	assert_str(SaveGame.read_header(_path())["error"]).contains("머리말")


## ⚠ **적힌 길이가 거짓일 수 있다.** 그러면 압축은 풀리는데 크기가 다르다
func test_a_lying_length_is_caught() -> void:
	var raw: PackedByteArray = var_to_bytes(_state())
	_write_raw({"day": 1}, raw.size() * 2, raw.compress(FileAccess.COMPRESSION_ZSTD))
	var back: Dictionary = SaveGame.read(_path())
	assert_str(back["error"]).is_not_empty()
	assert_bool(back["state"].is_empty()).is_true()


## ⚠ **파일은 멀쩡한데 내용이 빈 사전일 수 있다.** 그대로 열면 새 게임처럼
## 보이는데 사용자는 세이브를 불러왔다고 믿는다
func test_an_empty_state_is_caught() -> void:
	var raw: PackedByteArray = var_to_bytes({})
	_write_raw({"day": 1}, raw.size(), raw.compress(FileAccess.COMPRESSION_ZSTD))
	var back: Dictionary = SaveGame.read(_path())
	assert_str(back["error"]).is_not_empty()
	assert_bool(back["state"].is_empty()).is_true()


## ⚠ **본문이 상하면 압축을 못 푼다.** 그 결과를 그대로 쓰면 `null`이 나와
## **빈 게임처럼 보인다**
func test_a_corrupted_body_is_caught() -> void:
	var s: Dictionary = _state()
	SaveGame.write(_path(), s)
	var whole := FileAccess.get_file_as_bytes(_path())

	# 본문 한가운데를 뒤집는다 — 길이는 그대로다
	var mid: int = whole.size() / 2
	whole[mid] = whole[mid] ^ 0xFF
	whole[mid + 1] = whole[mid + 1] ^ 0xFF
	var f := FileAccess.open(_path(), FileAccess.WRITE)
	f.store_buffer(whole)
	f.close()

	var back: Dictionary = SaveGame.read(_path())
	assert_str(back["error"]).is_not_empty()
	assert_bool(back["state"].is_empty()).is_true()


# ── 머리말 ────────────────────────────────────────────────────

## ⚠ **목록을 보려고 세이브를 통째로 읽으면 안 된다.** 슬롯 화면이 슬롯마다
## 0.6MB씩 풀면 목록 하나 여는 데 몇 초가 걸린다 — 머리말만 읽는다
func test_the_header_reads_without_the_body() -> void:
	var s: Dictionary = _state()
	s["day"] = 88
	SaveGame.write(_path(), s)

	var h: Dictionary = SaveGame.read_header(_path())
	assert_str(h.get("error", "")).is_empty()
	assert_int(h["day"]).is_equal(88)
	assert_int(h["season_year"]).is_equal(2027)
	assert_str(h["player_name"]).is_equal("김한결")
	assert_str(h["team_name"]).is_not_empty()


func test_a_broken_header_reports_an_error() -> void:
	assert_str(SaveGame.read_header(_path("nope.sav"))["error"]).is_not_empty()


# ── 세이브가 그대로 이어지는가 ────────────────────────────────

## ⚠ **불러온 세이브가 화면에 그대로 떠야 한다.** 여기가 끊기면 "불러왔는데
## 아무것도 안 보인다"가 된다
func test_a_loaded_game_feeds_the_view_model() -> void:
	var s: Dictionary = _state()
	s["day"] = 70
	SaveGame.write(_path(), s)

	var vm: Dictionary = MainVm.build(SaveGame.read(_path())["state"])
	assert_str(vm["date_label"]).is_equal("2027년 5월 9일")
	assert_str(vm["player_name"]).is_equal("김한결")
	assert_bool(vm["schedule"]["rows"].is_empty()).is_false()


## ⚠ **불러온 뒤 진행이 이어져야 한다.** 상태 모양이 조금이라도 달라지면
## 진행기가 다르게 움직인다
func test_a_loaded_game_advances_the_same() -> void:
	var s: Dictionary = _state()
	s["day"] = 70
	SaveGame.write(_path(), s)
	var back: Dictionary = SaveGame.read(_path())["state"]

	var a: Dictionary = DayEngine.advance_to(s, 20)
	var b: Dictionary = DayEngine.advance_to(back, 20)
	assert_int(b["day"]).is_equal(a["day"])
	assert_int(b["weeks_crossed"]).is_equal(a["weeks_crossed"])


## ⚠ **사전이 아닌 내용이 올 수 있다.** `bytes_to_var`가 `null`이나 배열을
## 주면 그대로 `verify`에 넘어가 터진다 — 오류 메시지 대신 스택이 뜬다
func test_a_non_dictionary_body_is_caught() -> void:
	var raw: PackedByteArray = var_to_bytes([1, 2, 3])
	_write_raw({"day": 1}, raw.size(), raw.compress(FileAccess.COMPRESSION_ZSTD))
	var back: Dictionary = SaveGame.read(_path())
	assert_str(back["error"]).is_not_empty()
	assert_bool(back["state"].is_empty()).is_true()
