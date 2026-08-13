extends GdUnitTestSuite

## NpcStore 검사 — 열 배열이 조용히 틀리는 걸 막는다.
##
##   godot --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd -a test
##
## ⚠ **열 배열의 위험은 성능이 아니라 실수다.** 열 하나를 빠뜨리거나 길이가
## 어긋나도 오류가 안 나고 틀린 값을 준다. 특히:
##   · 열을 추가하고 저장에 안 넣으면 → 그 능력치만 조용히 0이 된다
##   · 옛 세이브를 새 열 개수로 읽으면 → 열이 밀려 **전 능력치가 뒤섞인다**

const TMP := "user://test_store"


func before() -> void:
	DirAccess.make_dir_recursive_absolute(TMP)


func test_resize_keeps_columns_aligned() -> void:
	var s := NpcStore.new(100)
	assert_str(s.verify()).is_empty()
	s.resize(250)
	assert_str(s.verify()).is_empty()
	s.resize(10)
	assert_str(s.verify()).is_empty()


func test_verify_catches_length_mismatch() -> void:
	# 길이를 일부러 어긋내면 잡아야 한다 — 안 잡으면 이 검사가 무의미하다
	var s := NpcStore.new(50)
	var broken: PackedFloat32Array = s.f[NpcStore.PIT_OVR]
	broken.resize(49)
	s.f[NpcStore.PIT_OVR] = broken
	assert_str(s.verify()).is_not_empty()


func test_roundtrip_preserves_values() -> void:
	var n := 500
	var s := NpcStore.new(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for k in n:
		s.f[NpcStore.PIT_OVR][k] = rng.randf() * 100.0
		s.f[NpcStore.BAT_POWER][k] = rng.randf() * 100.0
		s.f[NpcStore.POTENTIAL][k] = 80.0 + rng.randf() * 19.0
		s.i[NpcStore.AGE][k] = 17 + (k % 12)
		s.i[NpcStore.TEAM][k] = s.intern("TEAM_HS_%03d" % (k % 30))
		s.ids[k] = "PLY_%05d" % k
		s.names[k] = "선수%d" % k

	var path := TMP + "/roundtrip.dat"
	assert_int(s.save_to(path)).is_equal(OK)

	var b := NpcStore.new()
	assert_str(b.load_from(path)).is_empty()
	assert_int(b.count).is_equal(n)

	for k in n:
		assert_float(b.f[NpcStore.PIT_OVR][k]).is_equal_approx(s.f[NpcStore.PIT_OVR][k], 0.01)
		assert_float(b.f[NpcStore.POTENTIAL][k]).is_equal_approx(s.f[NpcStore.POTENTIAL][k], 0.01)
		assert_int(b.i[NpcStore.AGE][k]).is_equal(s.i[NpcStore.AGE][k])
		assert_str(b.ids[k]).is_equal(s.ids[k])

	assert_str(b.text(b.i[NpcStore.TEAM][0])).is_equal(s.text(s.i[NpcStore.TEAM][0]))


func test_intern_dedupes() -> void:
	var s := NpcStore.new(0)
	var a := s.intern("LEAGUE_HIGHSCHOOL")
	var b := s.intern("LEAGUE_HIGHSCHOOL")
	var c := s.intern("LEAGUE_KBL")
	assert_int(a).is_equal(b)
	assert_int(a).is_not_equal(c)
	assert_str(s.text(a)).is_equal("LEAGUE_HIGHSCHOOL")


func test_old_save_opens_after_column_added() -> void:
	# ⚠ **이게 제일 중요하고, 처음 만든 검사는 이걸 못 잡았다.**
	#
	# 열을 뒤에 추가하면 옛 세이브는 열이 **적다.** 새 열 개수로 읽으면
	# 바이트가 밀려 전 능력치가 뒤섞인다 — 오류도 안 난다.
	#
	# 처음 검사는 지금 열 개수로 저장하고 그대로 읽어서, 헤더의 열 개수를
	# 무시하도록 코드를 바꿔도 통과했다(변이 미검출). **열이 늘어난 상황을
	# 실제로 만들어야** 검사가 의미를 갖는다.
	var n := 100
	var path := TMP + "/old.dat"
	var nf_old: int = NpcStore.FLOAT_FIELDS.size() - 2
	var ni_old: int = NpcStore.INT_FIELDS.size() - 1

	var raw := PackedByteArray()
	for c in nf_old:
		var col := PackedFloat32Array()
		col.resize(n)
		for k in n:
			# 열마다 다른 값 — 밀리면 바로 티가 난다
			col[k] = float(c) * 1000.0 + float(k)
		raw.append_array(col.to_byte_array())
	for c in ni_old:
		var col := PackedInt32Array()
		col.resize(n)
		for k in n:
			col[k] = c * 1000 + k
		raw.append_array(col.to_byte_array())

	var packed := raw.compress(FileAccess.COMPRESSION_ZSTD)
	var fh := FileAccess.open(path, FileAccess.WRITE)
	fh.store_32(NpcStore.SAVE_MAGIC)
	fh.store_32(NpcStore.SAVE_VERSION)
	fh.store_32(n)
	fh.store_32(nf_old)
	fh.store_32(ni_old)
	fh.store_32(raw.size())
	fh.store_32(packed.size())
	fh.store_buffer(packed)
	var old_ids := PackedStringArray()
	var old_names := PackedStringArray()
	old_ids.resize(n)
	old_names.resize(n)
	for k in n:
		old_ids[k] = "PLY_%05d" % k
		old_names[k] = "옛선수%d" % k
	fh.store_var(old_ids)
	fh.store_var(old_names)
	fh.store_var(PackedStringArray(["LEAGUE_HIGHSCHOOL"]))
	fh.close()

	var b := NpcStore.new()
	assert_str(b.load_from(path)).is_empty()

	# 밀렸는지 본다 — 0번 열은 0,1,2… / 1번 열은 1000,1001…
	assert_float(b.f[0][0]).is_equal_approx(0.0, 0.01)
	assert_float(b.f[0][5]).is_equal_approx(5.0, 0.01)
	assert_float(b.f[1][5]).is_equal_approx(1005.0, 0.01)
	assert_float(b.f[nf_old - 1][0]).is_equal_approx(float(nf_old - 1) * 1000.0, 0.01)

	# 새로 생긴 열은 0으로 채워져야 한다 (옛 파일엔 없던 값)
	for c in range(nf_old, NpcStore.FLOAT_FIELDS.size()):
		for k in n:
			assert_float(b.f[c][k]).is_equal(0.0)

	assert_int(b.i[0][3]).is_equal(3)
	assert_int(b.i[1][3]).is_equal(1003)


func test_column_constants_point_at_right_columns() -> void:
	# 상수와 이름 목록이 어긋나면 엉뚱한 열을 읽는다
	assert_str(NpcStore.FLOAT_FIELDS[NpcStore.PIT_OVR]).is_equal("pit_ovr")
	assert_str(NpcStore.FLOAT_FIELDS[NpcStore.BAT_POWER]).is_equal("bat_power")
	assert_str(NpcStore.FLOAT_FIELDS[NpcStore.POTENTIAL]).is_equal("potential_hidden")
	assert_str(NpcStore.INT_FIELDS[NpcStore.AGE]).is_equal("age")
	assert_str(NpcStore.INT_FIELDS[NpcStore.TEAM]).is_equal("team")
