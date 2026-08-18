extends VBoxContainer
class_name NewsRow

## 소식 한 줄.
##
## ⚠ **색을 여기서 고르지 않는다.** `AppTheme`에서 가져온다 — 화면 55개에
## 색을 흩으면 톤을 바꿀 때 반드시 몇 개는 빠진다.

## 🔴 **본문을 열 길이 없었다.** 줄이 전부 `Label`이라 눌리지 않았고,
## `sim/` 여덟 파일 **열여섯 자리가 쓰는 여러 줄 본문이 전부 묻혀 있었다** —
## 체육부대 후보 30인 명단도 서른세 줄을 쓰고 아무도 못 읽었다.
## 02는 목록에서 누르면 본문이 열린다(`NewsPage.svelte:243-258`)
signal opened(id: String)

@onready var _category: Label = $Top/Category
@onready var _subject: Button = $Top/Subject
@onready var _date: Label = $Top/Date
@onready var _preview: Label = $Preview

var _row: Dictionary = {}


## 줄 색이 상태를 말한다 — 답을 안 한 결정이 제일 눈에 띄어야 한다
static func row_color(pending: bool, unread: bool) -> Color:
	if pending:
		return AppTheme.WARN
	return AppTheme.TEXT if unread else AppTheme.TEXT_DIM


func setup(row: Dictionary) -> void:
	_row = row
	if is_node_ready():
		_apply()


func _ready() -> void:
	_subject.pressed.connect(func() -> void:
		opened.emit.call_deferred(String(_row.get("id", ""))))
	_apply()


func _apply() -> void:
	if _row.is_empty():
		return
	var pending: bool = _row.get("pending", false)
	var unread: bool = _row.get("unread", false)

	_category.text = _row.get("category_label", "")
	_category.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)

	# 답을 안 한 결정은 표시를 붙인다 — 목록에서 바로 찾을 수 있어야 한다
	var mark: String = "● " if pending else ("· " if unread else "  ")
	_subject.text = mark + String(_row.get("subject", ""))
	_subject.add_theme_color_override("font_color", row_color(pending, unread))

	_date.text = _row.get("date_label", "")
	_date.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)

	_preview.text = "    %s — %s" % [_row.get("sender", ""), _row.get("preview", "")]
	_preview.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
	_preview.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
