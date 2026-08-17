extends Control
class_name App

## 앱 진입점 — M7-6d. **타이틀 ↔ 새 게임 ↔ 게임을 오간다.**
##
## ⚠ **진입점이 비어 있었다.** 지금까지는 코드로만 게임을 시작할 수 있었다.
##
## ⚠ **여기는 화면 전환만 한다.** 게임 상태는 `AppRoot`가, 슬롯은 `Slots`가
## 든다 — 여기가 상태를 들면 화면 전환마다 잃어버릴 자리가 생긴다.

const TITLE := preload("res://ui/screens/title_screen.tscn")
const NEW_GAME := preload("res://ui/screens/new_game_screen.tscn")
const APP_ROOT := preload("res://ui/app_root.tscn")
const SETTINGS := preload("res://ui/screens/settings_screen.tscn")

## 지금 고른 슬롯. 저장할 때 어디에 쓸지 정한다
var _slot: int = 1
var _current: Control


func _ready() -> void:
	# ⚠ **톤을 먼저 건다.** `AppTheme.build()`가 지금 색으로 테마를 만들므로
	# 순서가 뒤바뀌면 첫 화면만 옛 톤으로 뜬다
	apply_theme()
	theme = AppTheme.build()
	# ⚠ **저장된 창 크기를 켤 때 물린다.** 안 하면 설정이 그 세션에만 살고
	# 다시 켜면 기본값으로 돌아간다 — 고른 적이 없는 것처럼 보인다
	Settings.apply()
	show_title()


## 저장된 설정 → 실제 톤 → `AppTheme`.
##
## ⚠ **`system`을 푸는 곳은 여기 하나다.** 화면이 각자 풀면 OS 설정이 바뀌는
## 순간 화면마다 다른 톤이 된다
static func apply_theme() -> void:
	AppTheme.apply_tone(Settings.resolve_tone(
		String(Settings.of()["theme"]), Settings.system_dark()))


func current() -> Control:
	return _current


func _swap(node: Control) -> void:
	if _current != null:
		remove_child(_current)
		_current.free()
	_current = node
	node.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(node)


func show_title() -> void:
	var t: TitleScreen = TITLE.instantiate()
	t.continue_requested.connect(_on_continue)
	t.new_game_requested.connect(_on_new_game)
	t.settings_requested.connect(show_settings)
	_swap(t)


func show_settings() -> void:
	var s: SettingsScreen = SETTINGS.instantiate()
	s.back_requested.connect(show_title)
	# ⚠ **톤이 바뀌면 설정 화면 자신도 다시 만든다.** 색은 `_ready`에서 한 번
	# 집어 가므로 값만 바꾸면 **고른 사람 눈에는 아무 일도 안 일어난다**
	s.tone_changed.connect(func() -> void:
		apply_theme()
		theme = AppTheme.build()
		show_settings.call_deferred())
	_swap(s)


func show_new_game() -> void:
	var n: NewGameScreen = NEW_GAME.instantiate()
	# ⚠ **찬 슬롯이면 시작이 곧 덮어쓰기다** (U-7). `_on_start`가
	# `Slots.save`로 옛 세이브를 지우는데 버튼엔 "시작"이라고만 적혀 있었다 —
	# **되돌릴 수 없는 유일한 동작**이다. `_swap` 전에 넣는다(`_ready`가 읽는다)
	n.overwrite = _slot_taken(_slot)
	n.start_requested.connect(_on_start)
	n.back_requested.connect(show_title)
	_swap(n)


## 그 슬롯에 세이브가 있나. **깨진 슬롯도 있는 것으로 센다** —
## 못 읽는다고 덮어써도 되는 건 아니다
func _slot_taken(slot: int) -> bool:
	for row in Slots.list():
		if int(row["slot"]) == slot:
			return not bool(row["empty"])
	return false


## 게임을 띄운다. **상태는 `AppRoot`가 든다**
func show_game(state: Dictionary) -> AppRoot:
	var r: AppRoot = APP_ROOT.instantiate()
	_swap(r)
	r.set_state(state)
	return r


func _on_new_game(slot: int) -> void:
	_slot = slot
	show_new_game()


## ⚠ **불러오기가 실패하면 타이틀에 머문다.** 빈 게임으로 넘어가면
## 사용자가 세이브를 잃은 줄 모른 채 새로 시작한다
func _on_continue(slot: int) -> void:
	var r: Dictionary = Slots.load_slot(slot)
	if not String(r["error"]).is_empty():
		if _current is TitleScreen:
			(_current as TitleScreen).set_status("불러올 수 없습니다 — %s" % r["error"])
		return
	_slot = slot
	show_game(r["state"])


func _on_start(profile: Dictionary) -> void:
	var state: Dictionary = NewGameVm.start(profile)
	# ⚠ **만들자마자 저장한다.** 안 하면 첫 진행 전에 껐을 때 슬롯이 비어
	# 있고, 사용자는 새 게임을 만든 기억만 남는다
	Slots.save(_slot, state)
	show_game(state)
