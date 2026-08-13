extends PanelContainer
class_name Card

## 제목 붙은 카드 — 원본의 `<article class="card">`.
##
## 내용은 `body`에 붙인다. 화면이 카드 안쪽 구조를 몰라도 되게 하려는 것이다.

@onready var body: VBoxContainer = $Body
@onready var _title: Label = $Body/Title


func setup(title: String) -> void:
	if body == null:
		body = get_node_or_null("Body")
		_title = get_node_or_null("Body/Title")
	if _title:
		_title.text = title
		_title.visible = title != ""


## 내용을 넣기 전에 비운다 — 탭을 바꿀 때 쓴다
func clear_body() -> void:
	if body == null:
		body = get_node_or_null("Body")
	for c in body.get_children():
		if c.name != "Title":
			c.queue_free()
