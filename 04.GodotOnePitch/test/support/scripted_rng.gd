extends RefCounted

## 정해둔 값을 순서대로 내주는 난수기. 다 쓰면 마지막 값을 계속 낸다.
##
## ⚠ **확률 함수를 통계로만 검사하면 "성공/실패 갈래가 뒤바뀐" 변이를 못 잡는다**
## — 비율이 그대로이기 때문이다. 그래서 시뮬 함수는 난수기를 인자로 받고
## 검사는 값을 손으로 넣어 갈래를 짚는다.
##
## `class_name`을 안 붙인다 — 검사 도우미가 전역 이름을 차지할 이유가 없다.
## 쓰는 쪽에서 `const ScriptedRng = preload(...)`.

var values: Array = []
var idx: int = 0
## 몇 번 뽑혔나 — 난수를 안 써야 하는 갈래를 검사할 때 본다
var used: int = 0


func _init(v: Array = []) -> void:
	values = v


func randf() -> float:
	used += 1
	if idx < values.size():
		var v: float = values[idx]
		idx += 1
		return v
	return values[values.size() - 1] if not values.is_empty() else 0.5


## 정수 범위 — 첫 값을 비율로 본다
func randi_range(from: int, to: int) -> int:
	return from + int(randf() * float(to - from + 1))
