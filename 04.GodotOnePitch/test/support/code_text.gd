extends RefCounted
class_name CodeText

## 소스에서 **코드만** 뽑는다 — "화면을 모른다" 검사가 쓰는 것.
##
## ⚠ **`assert_str(src).not_contains(...)`로는 못 본다** (D-8). 그 단언은
##   ① **대소문자를 무시한다** — 사전 키 `"label"`을 `Label` 노드로 잡는다
##   ② **주석까지 코드로 본다** — 02 심볼을 근거로 인용하면 걸린다
## 둘 다 **거짓 실패**를 만든다. `F-6b`에서 `new_game_vm_test`가 실제로
## 그렇게 막혔다. 검사가 틀렸지 코드가 틀린 게 아니었다.
##
## ⚠ **주석만 뺀다. 문자열 안의 `#`은 안 가린다** — 그 줄이 잘려 검사가
## 더 느슨해질 뿐 거짓 통과를 만들지는 않는다.
static func of(path: String) -> String:
	var out := PackedStringArray()
	for line in FileAccess.get_file_as_string(path).split("\n"):
		var at: int = line.find("#")
		out.append(line if at < 0 else line.substr(0, at))
	return "\n".join(out)


## 그 심볼이 코드에 없나. **대소문자를 가린다**
static func lacks(path: String, symbol: String) -> bool:
	return of(path).find(symbol) == -1
