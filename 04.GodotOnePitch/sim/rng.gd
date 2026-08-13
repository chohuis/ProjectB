extends RefCounted
class_name Rng

## 재현 가능한 난수 — **세계 하나에 시드 하나.**
##
## ⚠ **이전 프로젝트는 재현이 안 됐다.** Rust 엔진이 `thread_rng()`(OS 엔트로피)를
## 30곳에서 썼고 시드 기반 `LcgRand`는 26곳뿐이었다. 경기 엔진이 전자였기
## 때문에 **같은 세이브·같은 시드라도 경기 결과가 매번 달랐다.**
## `NewGamePage`의 `Math.random()`(주인공 잠재력·성장률)도 마찬가지였다.
##
## 그래서 시드 기반 조사를 한다고 하면서 실제로는 절반만 그랬다.
##
## ## 두 가지 방식을 나눠 쓴다
##
## **① 해시 기반** (`for_*`) — 무엇에 대한 난수인지로 시드를 만든다.
##   같은 대상이면 언제 불러도 같은 값이다. **호출 순서가 바뀌어도 안 흔들린다.**
##   세계 생성·드래프트·성장처럼 "이 결과는 고정이어야 한다"는 곳에 쓴다.
##
## **② 흐름 기반** (`stream`) — 한 번 시드를 받고 계속 뽑는다. 빠르다.
##   경기 안의 투구처럼 **한 덩어리 안에서만 이어지면 되는** 곳에 쓴다.
##   경기 하나가 통째로 한 흐름이라, 다른 곳에 난수 호출을 추가해도
##   그 경기 결과는 안 바뀐다.
##
## ⚠ **흐름을 전역으로 하나만 두면 안 된다.** 그러면 어딘가에 난수 호출
## 하나를 추가하는 순간 그 뒤 모든 것이 밀린다 — 12~18개월 이주 내내
## 코드를 고칠 텐데, 고칠 때마다 세계가 바뀌면 회귀를 못 잡는다.

var world_seed: int = 0


func _init(seed_value: int = 0) -> void:
	world_seed = seed_value


## 문자열·정수를 섞어 시드를 만든다.
##
## ⚠ **Godot 정수는 부호 있는 64비트다.** FNV-1a의 표준 상수
## `0xcbf29ce484222325`와 흔히 쓰는 마무리 상수 `0xff51afd7ed558ccd`는
## 2⁶³을 넘어서 **리터럴 파싱 자체가 실패한다**:
##
##   ERROR: Cannot represent 0xff51afd7ed558ccd as a 64-bit signed integer
##
## 처음에 그대로 썼다가 해시가 의도대로 안 돌았다. 오류가 콘솔에만 나고
## 값은 나오니 조용히 넘어간다 — 검사도 못 잡았다. **범위에 맞는 상수를 쓴다.**
##
## ⚠ **마무리 섞기(avalanche)를 안 넣는다 — 재보니 오히려 나빴다.**
##
## 처음엔 넣었다. "곱셈만 하면 이웃한 대상의 난수가 상관을 갖는다"는
## 이전 프로젝트의 `scout_bias` 경험 때문이었다. `bench/rng_probe.gd`로 재니
## 통 편차가 **있을 때 5.8% / 없을 때 3.0%** (연속 정수 키, 4000개 기준)로
## 셋 다 있을 때가 나빴다.
##
## 이유: 시드를 받는 쪽이 `RandomNumberGenerator`(PCG32)라 **자기가 이미
## 섞는다.** `scout_bias`는 해시값을 직접 난수로 썼기 때문에 필요했던 것이고
## 여기는 상황이 다르다. 앞에서 또 섞으면 일만 늘고 이득이 없다.
const MASK63: int = 0x7FFFFFFFFFFFFFFF
## djb2 시작값 — 작아서 범위 문제가 없다
const HASH_INIT: int = 5381

static func mix(parts: Array) -> int:
	var h: int = HASH_INIT
	for p in parts:
		var s: String = str(p)
		for k in s.length():
			h = ((h * 33) ^ s.unicode_at(k)) & MASK63
		# 항목 사이에 구분자를 넣는다 — 안 그러면 ["ab","c"]와 ["a","bc"]가 같다
		h = ((h * 33) ^ 0x5bf0) & MASK63
	return h


## 이 세계에서 "무엇에 대한" 난수인지로 시드를 만든다.
##
## 예: seed_for(["draft", 2029, "PLY_00042"])
## 같은 인자면 언제 불러도 같다 — 호출 순서와 무관하다.
func seed_for(keys: Array) -> int:
	var parts: Array = [world_seed]
	parts.append_array(keys)
	return mix(parts)


## 한 덩어리용 난수기. 경기 하나, 시즌 처리 한 번처럼 **안에서만 이어지면
## 되는** 범위에 쓴다.
func stream(keys: Array) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_for(keys)
	return r


## 값 하나만 필요할 때 — 난수기를 만들 것도 없는 자리
func value_for(keys: Array) -> float:
	var r := RandomNumberGenerator.new()
	r.seed = seed_for(keys)
	return r.randf()


func int_for(keys: Array, from: int, to: int) -> int:
	var r := RandomNumberGenerator.new()
	r.seed = seed_for(keys)
	return r.randi_range(from, to)
