extends GdUnitTestSuite

## 러너의 공통 부품 검사.
##
## ⚠ `shard_indices`·`arg_int`는 **아직 아무도 안 쓴다.** P4(계측 재구축)에서
## 쓸 때 이미 검증돼 있어야 한다 — 그때 조각이 겹치거나 빠지면 조사 결과가
## 조용히 틀린다. 이전 프로젝트에서 조각 나누기를 회차마다 손으로 계산했고
## 그게 겹친 적이 있다.

const Runner := preload("res://tools/run.gd")


func test_shards_cover_everything_exactly_once() -> void:
	# 조각이 겹치거나 빠지면 조사 회차가 중복되거나 사라진다
	for shards in [1, 2, 3, 6, 7]:
		var seen: Dictionary = {}
		for shard in shards:
			for idx in Runner.shard_indices(30, shards, shard):
				assert_bool(seen.has(idx)).override_failure_message(
					"조각 %d/%d에서 %d가 겹쳤다" % [shard, shards, idx]).is_false()
				seen[idx] = true
		assert_int(seen.size()).override_failure_message(
			"조각 %d개가 30개를 다 못 덮었다" % shards).is_equal(30)


func test_shards_are_balanced() -> void:
	# 한 조각에 몰리면 병렬 실행의 의미가 없다
	var sizes: Array[int] = []
	for shard in 6:
		sizes.append(Runner.shard_indices(30, 6, shard).size())
	for s in sizes:
		assert_int(s).is_between(4, 6)


func test_single_shard_returns_all() -> void:
	assert_int(Runner.shard_indices(12, 1, 0).size()).is_equal(12)


func test_more_shards_than_items() -> void:
	# 조각이 항목보다 많으면 빈 조각이 생긴다 — 터지면 안 된다
	var total := 0
	for shard in 10:
		total += Runner.shard_indices(3, 10, shard).size()
	assert_int(total).is_equal(3)


func test_arg_int_parses_and_defaults() -> void:
	var a := PackedStringArray(["study:careers", "--runs", "30", "--shard", "2"])
	assert_int(Runner.arg_int(a, "runs", 12)).is_equal(30)
	assert_int(Runner.arg_int(a, "shard", 0)).is_equal(2)
	assert_int(Runner.arg_int(a, "weeks", 440)).is_equal(440)


func test_arg_int_ignores_trailing_name() -> void:
	# `--runs`가 마지막이면 값이 없다 — 기본값으로 떨어져야지 터지면 안 된다
	var a := PackedStringArray(["x", "--runs"])
	assert_int(Runner.arg_int(a, "runs", 12)).is_equal(12)


func test_arg_str_and_flag() -> void:
	var a := PackedStringArray(["x", "--arm", "growth", "--verbose"])
	assert_str(Runner.arg_str(a, "arm", "base")).is_equal("growth")
	assert_str(Runner.arg_str(a, "missing", "base")).is_equal("base")
	assert_bool(Runner.has_flag(a, "verbose")).is_true()
	assert_bool(Runner.has_flag(a, "quiet")).is_false()
