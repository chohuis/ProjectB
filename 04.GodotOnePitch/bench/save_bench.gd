extends SceneTree

## P1-1 — 저장 성능. **미검증 위험 중 제일 큰 것.**
##
##   godot --headless --script bench/save_bench.gd
##
## P0는 경기 시뮬만 쟀다. 현재 Electron 병목은 거기가 아니다:
## 실측으로 **주당 2~3초 중 55%가 `gameStore.save()`의 전량 재저장**이다.
##
## 실제 세이브 규모 (slot3_slot_1.db 실측):
##   npc 9,603행 · 행당 JSON 1,979바이트 · npc만 18.1MB
##   staff 1,195 · transactions 2,610 · season_stats 1,727 · schedule 860
##
## 그래서 재는 것: **9,603명치 상태를 저장·로드하는 데 몇 초인가.**
##
## 게이트: 저장 **0.2초 이하**, 로드 **0.5초 이하**.
## 주 진행이 초당 여러 번 도는 게 아니라 주 경계마다 한 번이므로, 0.2초면
## 체감되지 않는다. 지금(1.1~1.65초)의 5분의 1 이하가 목표다.
##
## 세 방식을 비교한다:
##   ① var       FileAccess.store_var — Godot 이진. 가장 단순
##   ② JSON      사람이 읽을 수 있다. 디버깅·이관 검증에 유리
##   ③ 열 분리   숫자를 PackedArray로 모아 통째로 — 가장 빠를 것으로 본다
##
## ⚠ **압축도 같이 본다.** 18MB를 매번 쓰면 SSD 수명과 저장 용량이 문제가 된다.

const NPC_COUNT: int = 9603
## 실측 행당 컬럼 수
const NUM_FIELDS: int = 22
const STR_FIELDS: int = 8

func _init() -> void:
	var dir: String = "user://bench"
	DirAccess.make_dir_recursive_absolute(dir)

	print("── P1-1 저장 성능 ──")
	print("  NPC %d명 · 숫자 %d + 문자열 %d 필드" % [NPC_COUNT, NUM_FIELDS, STR_FIELDS])
	print("  현재(Electron): 주당 저장 1.1~1.65초 · 파일 18MB")
	print("")

	var rng := RandomNumberGenerator.new()
	rng.seed = 20260813

	# ── ① 사전 배열 (지금 구조에 가장 가깝다) ──────────────────
	var as_dicts: Array = []
	as_dicts.resize(NPC_COUNT)
	for i in NPC_COUNT:
		var d := {}
		d["id"] = "PLY_HS26_HS_TEAM_%04d" % i
		d["name"] = "선수%04d" % i
		d["team"] = "TEAM_HS_%03d" % (i % 102)
		d["league"] = "LEAGUE_HIGHSCHOOL"
		d["pos"] = "SP"
		d["status"] = "active"
		d["mil"] = "none"
		d["type"] = "pitcher"
		for f in NUM_FIELDS:
			d["n%d" % f] = rng.randf() * 100.0
		as_dicts[i] = d

	# ── ③ 열 분리 (숫자를 통째로) ──────────────────────────────
	var cols: Array[PackedFloat32Array] = []
	for f in NUM_FIELDS:
		var c := PackedFloat32Array()
		c.resize(NPC_COUNT)
		for i in NPC_COUNT:
			c[i] = as_dicts[i]["n%d" % f]
		cols.append(c)
	var ids := PackedStringArray()
	var names := PackedStringArray()
	for i in NPC_COUNT:
		ids.append(as_dicts[i]["id"])
		names.append(as_dicts[i]["name"])

	print("  방식            저장      로드      파일")
	_bench_var(dir, as_dicts)
	_bench_json(dir, as_dicts)
	_bench_columnar(dir, cols, ids, names)
	_bench_columnar_compressed(dir, cols, ids, names)

	print("")
	print("  게이트: 저장 0.2초 · 로드 0.5초")
	quit()


func _bench_var(dir: String, data: Array) -> void:
	var path := dir + "/save_var.dat"
	var t0 := Time.get_ticks_usec()
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_var(data)
	f.close()
	var save_us := Time.get_ticks_usec() - t0

	t0 = Time.get_ticks_usec()
	var f2 := FileAccess.open(path, FileAccess.READ)
	var back = f2.get_var()
	f2.close()
	var load_us := Time.get_ticks_usec() - t0

	_report("① var", save_us, load_us, path, back.size() == data.size())


func _bench_json(dir: String, data: Array) -> void:
	var path := dir + "/save.json"
	var t0 := Time.get_ticks_usec()
	var txt := JSON.stringify(data)
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(txt)
	f.close()
	var save_us := Time.get_ticks_usec() - t0

	t0 = Time.get_ticks_usec()
	var f2 := FileAccess.open(path, FileAccess.READ)
	var back = JSON.parse_string(f2.get_as_text())
	f2.close()
	var load_us := Time.get_ticks_usec() - t0

	_report("② JSON", save_us, load_us, path, back != null and back.size() == data.size())


func _bench_columnar(dir: String, cols: Array[PackedFloat32Array], ids: PackedStringArray, names: PackedStringArray) -> void:
	var path := dir + "/save_col.dat"
	var t0 := Time.get_ticks_usec()
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_32(cols.size())
	for c in cols:
		f.store_buffer(c.to_byte_array())
	f.store_var(ids)
	f.store_var(names)
	f.close()
	var save_us := Time.get_ticks_usec() - t0

	t0 = Time.get_ticks_usec()
	var f2 := FileAccess.open(path, FileAccess.READ)
	var n := f2.get_32()
	var got: Array[PackedFloat32Array] = []
	for i in n:
		got.append(f2.get_buffer(NPC_COUNT * 4).to_float32_array())
	var _i = f2.get_var()
	var _nm = f2.get_var()
	f2.close()
	var load_us := Time.get_ticks_usec() - t0

	_report("③ 열분리", save_us, load_us, path, got.size() == cols.size())


func _bench_columnar_compressed(dir: String, cols: Array[PackedFloat32Array], ids: PackedStringArray, names: PackedStringArray) -> void:
	var path := dir + "/save_col_z.dat"
	var t0 := Time.get_ticks_usec()
	var raw := PackedByteArray()
	for c in cols:
		raw.append_array(c.to_byte_array())
	var packed := raw.compress(FileAccess.COMPRESSION_ZSTD)
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_32(raw.size())
	f.store_32(packed.size())
	f.store_buffer(packed)
	f.store_var(ids)
	f.store_var(names)
	f.close()
	var save_us := Time.get_ticks_usec() - t0

	t0 = Time.get_ticks_usec()
	var f2 := FileAccess.open(path, FileAccess.READ)
	var rawlen := f2.get_32()
	var plen := f2.get_32()
	var back := f2.get_buffer(plen).decompress(rawlen, FileAccess.COMPRESSION_ZSTD)
	var _i = f2.get_var()
	var _nm = f2.get_var()
	f2.close()
	var load_us := Time.get_ticks_usec() - t0

	_report("④ 열+zstd", save_us, load_us, path, back.size() == rawlen)


func _report(label: String, save_us: int, load_us: int, path: String, ok: bool) -> void:
	var size := 0
	var f := FileAccess.open(path, FileAccess.READ)
	if f:
		size = f.get_length()
		f.close()
	var mark := "" if ok else "  ⚠ 왕복 불일치"
	print("  %-12s %7.3f초  %7.3f초  %6.1fMB%s" % [
		label, save_us / 1_000_000.0, load_us / 1_000_000.0, size / 1048576.0, mark,
	])
