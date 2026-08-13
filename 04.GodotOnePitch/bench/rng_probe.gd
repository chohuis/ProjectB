extends SceneTree

## 마지막 섞기(avalanche)가 실제로 일을 하나 — 재서 확인한다.
##
## 검사 변이에서 그 줄을 빼도 안 잡혔다. 두 가지 중 하나다:
##   ① 검사가 부실하다 → 제대로 된 검사를 찾아야 한다
##   ② 그 줄이 하는 일이 없다 → 빼야 한다
##
## 추측하지 말고 잰다.

func _init() -> void:
	print("── avalanche 유무 비교 ──")
	_compare("연속 정수 키", func(i: int) -> Array: return ["player", i, "potential"])
	_compare("연속 정수만", func(i: int) -> Array: return [i])
	_compare("긴 공통 접두사", func(i: int) -> Array: return ["PLY_HS26_HS_TEAM_%05d" % i])
	quit()


func _compare(label: String, keyfn: Callable) -> void:
	var n := 4000
	var with_av := PackedFloat32Array()
	var without := PackedFloat32Array()
	for i in n:
		var parts: Array = [20260813]
		parts.append_array(keyfn.call(i))
		with_av.append(_first_draw(_mix(parts, true)))
		without.append(_first_draw(_mix(parts, false)))

	print("  %s" % label)
	print("    있음  %s" % _stats(with_av))
	print("    없음  %s" % _stats(without))


## 시드로 난수기를 만들어 첫 값 — 실제로 쓰이는 방식 그대로
func _first_draw(seed_value: int) -> float:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r.randf()


func _mix(parts: Array, avalanche: bool) -> int:
	var h: int = Rng.HASH_INIT
	for p in parts:
		var s: String = str(p)
		for k in s.length():
			h = ((h * 33) ^ s.unicode_at(k)) & Rng.MASK63
		h = ((h * 33) ^ 0x5bf0) & Rng.MASK63
	if avalanche:
		h ^= h >> 30
		h = (h * 0x2545F4914F6CDD1D) & Rng.MASK63
		h ^= h >> 27
	return h


## 균등한가 · 이웃이 끌려가는가
func _stats(v: PackedFloat32Array) -> String:
	var buckets := PackedInt32Array()
	buckets.resize(10)
	for x in v:
		buckets[clampi(int(x * 10.0), 0, 9)] += 1
	var expected: float = float(v.size()) / 10.0
	var worst: float = 0.0
	for b in buckets:
		worst = maxf(worst, absf(float(b) - expected) / expected)

	var same_dir: int = 0
	for i in range(1, v.size() - 1):
		if ((v[i] - v[i - 1]) > 0.0) == ((v[i + 1] - v[i]) > 0.0):
			same_dir += 1
	var ratio: float = float(same_dir) / float(v.size() - 2)

	return "통 편차 최대 %5.1f%% · 이웃 동방향 %4.1f%%" % [worst * 100.0, ratio * 100.0]
