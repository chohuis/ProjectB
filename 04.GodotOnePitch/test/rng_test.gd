extends GdUnitTestSuite

## 재현 가능한 난수 검사.
##
## ⚠ **이전 프로젝트는 재현이 안 됐다.** 경기 엔진이 `thread_rng()`를 써서
## 같은 세이브·같은 시드라도 결과가 매번 달랐다. 시드 기반 조사를 한다고
## 하면서 실제로는 절반만 그랬다.
##
## 그래서 이 검사가 봐야 할 것은 "난수가 나오는가"가 아니라:
##   ① 같은 시드 → 같은 결과인가
##   ② 다른 대상 → 다른 결과인가 (상관이 없는가)
##   ③ **다른 곳에 난수 호출을 추가해도 안 흔들리는가**  ← 제일 중요
##
## ③이 핵심이다. 12~18개월 이주 내내 코드를 고칠 텐데, 고칠 때마다 세계가
## 바뀌면 회귀를 못 잡는다.


func test_same_seed_same_sequence() -> void:
	var a := Rng.new(20260813)
	var b := Rng.new(20260813)
	var ra := a.stream(["game", 1])
	var rb := b.stream(["game", 1])
	for i in 50:
		assert_float(ra.randf()).is_equal(rb.randf())


func test_different_world_seed_differs() -> void:
	var a := Rng.new(1)
	var b := Rng.new(2)
	assert_int(a.seed_for(["x"])).is_not_equal(b.seed_for(["x"]))


func test_different_keys_differ() -> void:
	var r := Rng.new(20260813)
	assert_int(r.seed_for(["draft", 2029])).is_not_equal(r.seed_for(["draft", 2030]))
	assert_int(r.seed_for(["draft", 2029])).is_not_equal(r.seed_for(["growth", 2029]))


func test_key_boundaries_matter() -> void:
	# ["ab","c"]와 ["a","bc"]가 같은 시드를 내면 대상이 뒤섞인다
	var r := Rng.new(1)
	assert_int(r.seed_for(["ab", "c"])).is_not_equal(r.seed_for(["a", "bc"]))


func test_hash_based_is_order_independent() -> void:
	# ⚠ **이 검사가 이 설계의 이유다.**
	#
	# 어딘가에 난수 호출을 추가해도 다른 대상의 값은 안 바뀌어야 한다.
	# 전역 흐름 하나만 쓰면 이게 깨진다 — 호출을 하나 넣는 순간 그 뒤가 전부 밀린다.
	var r := Rng.new(20260813)
	var before: float = r.value_for(["player", "PLY_00042", "potential"])

	# 사이에 다른 난수를 잔뜩 뽑는다 (다른 기능을 추가한 상황)
	for i in 1000:
		r.value_for(["something_else", i])

	var after: float = r.value_for(["player", "PLY_00042", "potential"])
	assert_float(after).is_equal(before)


func test_neighbouring_keys_are_not_correlated() -> void:
	# 하위 비트를 안 섞으면 이웃한 대상이 비슷한 값을 받는다.
	# 선수 1번과 2번의 잠재력이 상관을 가지면 세계가 이상해진다
	var r := Rng.new(20260813)
	var vals: PackedFloat32Array = PackedFloat32Array()
	for i in 200:
		vals.append(r.value_for(["player", i, "potential"]))

	# 이웃 간 차이가 고르게 흩어져야 한다 — 계속 같은 방향이면 상관이 있다
	var same_dir: int = 0
	for i in range(1, vals.size() - 1):
		var d1: float = vals[i] - vals[i - 1]
		var d2: float = vals[i + 1] - vals[i]
		if (d1 > 0.0) == (d2 > 0.0):
			same_dir += 1
	# 무상관이면 절반쯤이다. 8할을 넘으면 이웃이 끌려간다는 뜻
	var ratio: float = float(same_dir) / float(vals.size() - 2)
	assert_float(ratio).is_less(0.75)
	assert_float(ratio).is_greater(0.25)


func test_distribution_is_uniform_enough() -> void:
	# 시드 만드는 방식이 나쁘면 특정 구간에 몰린다
	var r := Rng.new(42)
	var buckets: PackedInt32Array = PackedInt32Array()
	buckets.resize(10)
	var n := 20000
	for i in n:
		var v: float = r.value_for(["u", i])
		var b: int = clampi(int(v * 10.0), 0, 9)
		buckets[b] += 1
	var expected: float = float(n) / 10.0
	for b in 10:
		# 균등하면 각 통이 10%다. ±20%를 넘으면 편중이다
		assert_float(float(buckets[b])).is_between(expected * 0.8, expected * 1.2)


func test_stream_state_can_be_saved_and_resumed() -> void:
	# 경기 도중에 저장하고 나중에 이어도 같은 결과여야 한다
	var r := Rng.new(7)
	var s1 := r.stream(["game", 99])
	for i in 10:
		s1.randf()
	var saved_state: int = s1.state
	var expected: float = s1.randf()

	var s2 := r.stream(["game", 99])
	s2.state = saved_state
	assert_float(s2.randf()).is_equal(expected)


func test_int_range_is_inclusive_and_stable() -> void:
	var r := Rng.new(5)
	var a: int = r.int_for(["pick", 1], 1, 10)
	var b: int = r.int_for(["pick", 1], 1, 10)
	assert_int(a).is_equal(b)
	assert_int(a).is_between(1, 10)
