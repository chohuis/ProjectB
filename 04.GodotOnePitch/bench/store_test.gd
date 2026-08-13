extends SceneTree

## NpcStore 검사 — 열 배열이 조용히 틀리는 걸 막는다.
##
##   godot --headless --script bench/store_test.gd
##
## ⚠ **열 배열의 위험은 성능이 아니라 실수다.** 열 하나를 빠뜨리거나 길이가
## 어긋나도 오류가 안 나고 틀린 값을 준다. 특히:
##   · 열을 추가하고 저장에 안 넣으면 → 그 능력치만 조용히 0이 된다
##   · 옛 세이브를 새 열 개수로 읽으면 → 열이 밀려 **전 능력치가 뒤섞인다**
##
## 이 검사는 그 둘을 실제 왕복으로 잡는다.

var _pass: int = 0
var _fail: int = 0

func _init() -> void:
	print("── NpcStore 검사 ──")
	_t_resize_keeps_columns_aligned()
	_t_verify_catches_mismatch()
	_t_roundtrip_preserves_values()
	_t_intern_dedupes()
	_t_old_save_opens_after_column_added()
	_t_column_names_match_constants()
	print("")
	print("  %d 통과 · %d 실패" % [_pass, _fail])
	quit(1 if _fail > 0 else 0)


func _ok(name: String, cond: bool, detail: String = "") -> void:
	if cond:
		_pass += 1
		print("  ✓ %s" % name)
	else:
		_fail += 1
		print("  ✗ %s%s" % [name, ("  — " + detail) if detail != "" else ""])


func _t_resize_keeps_columns_aligned() -> void:
	var s := NpcStore.new(100)
	_ok("resize가 모든 열을 맞춘다", s.verify() == "", s.verify())
	s.resize(250)
	_ok("늘려도 맞는다", s.verify() == "", s.verify())
	s.resize(10)
	_ok("줄여도 맞는다", s.verify() == "", s.verify())


func _t_verify_catches_mismatch() -> void:
	# 길이를 일부러 어긋내면 잡아야 한다 — 안 잡으면 이 검사가 무의미하다
	var s := NpcStore.new(50)
	var broken: PackedFloat32Array = s.f[NpcStore.PIT_OVR]
	broken.resize(49)
	s.f[NpcStore.PIT_OVR] = broken
	_ok("길이 어긋남을 잡는다", s.verify() != "")


func _t_roundtrip_preserves_values() -> void:
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

	var path := "user://test_store.dat"
	s.save_to(path)

	var b := NpcStore.new()
	var err := b.load_from(path)
	_ok("왕복 오류 없음", err == "", err)
	_ok("인원 보존", b.count == n)

	var same := true
	for k in n:
		if absf(b.f[NpcStore.PIT_OVR][k] - s.f[NpcStore.PIT_OVR][k]) > 0.01: same = false; break
		if absf(b.f[NpcStore.POTENTIAL][k] - s.f[NpcStore.POTENTIAL][k]) > 0.01: same = false; break
		if b.i[NpcStore.AGE][k] != s.i[NpcStore.AGE][k]: same = false; break
		if b.ids[k] != s.ids[k]: same = false; break
	_ok("값 보존 (실수·정수·문자열)", same)
	_ok("intern 문자열 보존", b.text(b.i[NpcStore.TEAM][0]) == s.text(s.i[NpcStore.TEAM][0]))


func _t_intern_dedupes() -> void:
	var s := NpcStore.new(0)
	var a := s.intern("LEAGUE_HIGHSCHOOL")
	var b := s.intern("LEAGUE_HIGHSCHOOL")
	var c := s.intern("LEAGUE_KBL")
	_ok("같은 문자열은 같은 번호", a == b)
	_ok("다른 문자열은 다른 번호", a != c)
	_ok("번호로 원문을 되찾는다", s.text(a) == "LEAGUE_HIGHSCHOOL")


func _t_old_save_opens_after_column_added() -> void:
	# ⚠ **이게 제일 중요하고, 처음엔 못 잡았다.**
	#
	# 열을 뒤에 추가하면 옛 세이브는 열이 **적다.** 새 열 개수로 읽으면
	# 바이트가 밀려 전 능력치가 뒤섞인다 — 오류도 안 난다.
	#
	# 처음 검사는 지금 열 개수로 저장하고 그대로 읽어서, 헤더의 열 개수를
	# 무시하도록 코드를 바꿔도 통과했다(변이 미검출). **열이 늘어난 상황을
	# 실제로 만들어야** 검사가 의미를 갖는다.
	var n := 100
	var path := "user://test_old.dat"

	# 열이 지금보다 2개 적던 시절의 파일을 손으로 만든다
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
	var err := b.load_from(path)
	_ok("열이 적은 옛 세이브가 열린다", err == "", err)

	# 밀렸는지 본다 — 0번 열은 0,1,2… / 1번 열은 1000,1001…
	var col0_ok: bool = absf(b.f[0][0] - 0.0) < 0.01 and absf(b.f[0][5] - 5.0) < 0.01
	var col1_ok: bool = absf(b.f[1][0] - 1000.0) < 0.01 and absf(b.f[1][5] - 1005.0) < 0.01
	var last_old_ok: bool = absf(b.f[nf_old - 1][0] - float(nf_old - 1) * 1000.0) < 0.01
	_ok("열이 밀리지 않았다", col0_ok and col1_ok and last_old_ok,
		"f[0][5]=%.1f f[1][5]=%.1f" % [b.f[0][5], b.f[1][5]])

	# 새로 생긴 열은 0으로 채워져야 한다 (옛 파일엔 없던 값)
	var new_cols_zero: bool = true
	for c in range(nf_old, NpcStore.FLOAT_FIELDS.size()):
		for k in n:
			if b.f[c][k] != 0.0:
				new_cols_zero = false
				break
	_ok("새 열은 0으로 채워진다", new_cols_zero)
	_ok("정수 열도 안 밀린다", b.i[0][3] == 3 and b.i[1][3] == 1003)


func _t_column_names_match_constants() -> void:
	# 상수와 이름 목록이 어긋나면 엉뚱한 열을 읽는다
	_ok("PIT_OVR 상수가 맞는 열을 가리킨다", NpcStore.FLOAT_FIELDS[NpcStore.PIT_OVR] == "pit_ovr")
	_ok("BAT_POWER 상수가 맞는 열", NpcStore.FLOAT_FIELDS[NpcStore.BAT_POWER] == "bat_power")
	_ok("POTENTIAL 상수가 맞는 열", NpcStore.FLOAT_FIELDS[NpcStore.POTENTIAL] == "potential_hidden")
	_ok("AGE 상수가 맞는 열", NpcStore.INT_FIELDS[NpcStore.AGE] == "age")
	_ok("TEAM 상수가 맞는 열", NpcStore.INT_FIELDS[NpcStore.TEAM] == "team")
