extends RefCounted
class_name SaveBench

## 저장 성능 — **P0가 안 잰 위험.**
##
##   godot --headless --script tools/run.gd -- bench:save
##
## 현재 Electron 병목은 경기 시뮬이 아니다: 실측으로 **주당 2~3초 중 55%가
## `gameStore.save()`의 전량 재저장**이다.
##
## 실제 세이브 규모 (slot3_slot_1.db 실측):
##   npc 9,603행 · 행당 JSON 1,979바이트 · npc만 18.1MB
##
## 게이트: 저장 0.2초 · 로드 0.5초.
## 주 경계마다 한 번이므로 0.2초면 체감되지 않는다.

const NPC_COUNT: int = 9603
const NUM_FIELDS: int = 22

var _log: Callable
var _fail: Callable


func run(log_fn: Callable, fail_fn: Callable) -> int:
	_log = log_fn
	_fail = fail_fn

	var dir := "user://bench"
	DirAccess.make_dir_recursive_absolute(dir)
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260813

	_log.call("  NPC %d명 · 숫자 %d 필드" % [NPC_COUNT, NUM_FIELDS])
	_log.call("  현재(Electron): 주당 저장 1.1~1.65초 · 18MB")
	_log.call("")

	# 지금 구조에 가장 가까운 형태 — 선수 하나가 사전 하나
	var as_dicts: Array = []
	as_dicts.resize(NPC_COUNT)
	for i in NPC_COUNT:
		var d := {}
		d["id"] = "PLY_HS26_HS_TEAM_%04d" % i
		d["name"] = "선수%04d" % i
		d["team"] = "TEAM_HS_%03d" % (i % 102)
		d["league"] = "LEAGUE_HIGHSCHOOL"
		for f in NUM_FIELDS:
			d["n%d" % f] = rng.randf() * 100.0
		as_dicts[i] = d

	_log.call("  방식            저장      로드      파일")
	var t_var := _bench_var(dir, as_dicts)
	var t_json := _bench_json(dir, as_dicts)
	var t_store := _bench_store(dir, rng)

	_log.call("")
	if t_store > 0.2:
		_fail.call("열 배열 저장 %.3f초 — 게이트 0.2초" % t_store)
	# 열 배열이 사전보다 느리면 설계 전제가 깨진 것이다
	if t_store >= t_var:
		_fail.call("열 배열(%.3f)이 사전(%.3f)보다 안 빠르다" % [t_store, t_var])
	if t_json < 0.0:
		_fail.call("JSON 왕복 실패")
	return 0


func _bench_var(dir: String, data: Array) -> float:
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

	_report("① 사전", save_us, load_us, path, back.size() == data.size())
	return save_us / 1_000_000.0


func _bench_json(dir: String, data: Array) -> float:
	var path := dir + "/save.json"
	var t0 := Time.get_ticks_usec()
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(JSON.stringify(data))
	f.close()
	var save_us := Time.get_ticks_usec() - t0

	t0 = Time.get_ticks_usec()
	var f2 := FileAccess.open(path, FileAccess.READ)
	var back = JSON.parse_string(f2.get_as_text())
	f2.close()
	var load_us := Time.get_ticks_usec() - t0

	var ok: bool = back != null and back.size() == data.size()
	_report("② JSON", save_us, load_us, path, ok)
	return (save_us / 1_000_000.0) if ok else -1.0


## 실제로 쓸 방식 — `NpcStore`를 그대로 잰다.
##
## ⚠ **벤치가 따로 구현하지 않는다.** 벤치용 코드와 실제 코드가 다르면
## 벤치가 통과해도 실제는 느릴 수 있다
func _bench_store(dir: String, rng: RandomNumberGenerator) -> float:
	var s := NpcStore.new(NPC_COUNT)
	for k in NPC_COUNT:
		for c in mini(NUM_FIELDS, NpcStore.FLOAT_FIELDS.size()):
			s.f[c][k] = rng.randf() * 100.0
		s.i[NpcStore.AGE][k] = 17 + (k % 12)
		s.i[NpcStore.TEAM][k] = s.intern("TEAM_HS_%03d" % (k % 102))
		s.ids[k] = "PLY_HS26_HS_TEAM_%04d" % k
		s.names[k] = "선수%04d" % k

	var path := dir + "/save_store.dat"
	var t0 := Time.get_ticks_usec()
	s.save_to(path)
	var save_us := Time.get_ticks_usec() - t0

	t0 = Time.get_ticks_usec()
	var b := NpcStore.new()
	var err := b.load_from(path)
	var load_us := Time.get_ticks_usec() - t0

	_report("③ NpcStore", save_us, load_us, path, err == "" and b.count == NPC_COUNT)
	return save_us / 1_000_000.0


func _report(label: String, save_us: int, load_us: int, path: String, ok: bool) -> void:
	var size := 0
	var f := FileAccess.open(path, FileAccess.READ)
	if f:
		size = f.get_length()
		f.close()
	var mark := "" if ok else "  ⚠ 왕복 불일치"
	_log.call("  %-12s %7.3f초  %7.3f초  %6.1fMB%s" % [
		label, save_us / 1_000_000.0, load_us / 1_000_000.0, size / 1048576.0, mark,
	])
