extends RefCounted
class_name Settings

## 설정 — 창 크기와 전체화면. U-4.
##
## ⚠ **04엔 설정이 아예 없었다.** `ui/` 아래에서 `설정`·`Settings`·`언어`·
## `locale`이 0건이었다 — **창 크기도 못 바꿨다.** PC(Steam)가 1차 목표인데
## 전체화면 전환이 없었다.
##
## ⚠ **읽는 곳이 없는 설정은 안 만든다.** 02엔 테마·언어·연출 속도·모션
## 줄이기가 있었지만 04는 한국어 단일이고 `AppTheme`이 어두운 톤 하나이며,
## **"연출 속도"가 볼 값은 어디에도 없다**(`theme.gd:55`의 "1.4초"는 주석일
## 뿐 타이머가 없다). 스위치만 만들면 그게 또 죽은 배선이다 —
## 이번에 고친 `injury_history`가 바로 그 모양이었다.
##
## ⚠ **정본은 파일이다.** 화면이 지금 창 크기를 물어보면 사용자가 창틀을
## 끌어 바꾼 값이 섞여 "고른 적 없는 크기"가 켜져 보인다.

const PATH: String = "user://settings.cfg"

## 고를 수 있는 창 크기. **세로 900 아래를 안 넣는다** — `main_screen`이
## 3단이라 좁으면 오른쪽 칸이 눌린다
const SIZES: Array[Vector2i] = [
	Vector2i(1280, 720), Vector2i(1600, 900), Vector2i(1920, 1080),
]

const DEFAULT_SIZE: Vector2i = Vector2i(1600, 900)


static func _cfg() -> ConfigFile:
	var c := ConfigFile.new()
	c.load(PATH)
	return c


## 지금 설정. **파일이 정본이다**
## 톤 설정 세 갈래 — 02 `settings.ts:16`과 같은 이름·같은 뜻.
##
## ⚠ **`system`이 기본이다.** 02도 그렇고, 껐다 켰을 때 OS가 밝은데 게임만
## 어두우면 "설정을 잃어버렸나"로 읽힌다
const THEMES: Array[String] = ["light", "dark", "system"]
const DEFAULT_THEME: String = "system"

const THEME_LABEL: Dictionary = {
	"light": "밝게", "dark": "어둡게", "system": "시스템 따름",
}


static func of() -> Dictionary:
	var c: ConfigFile = _cfg()
	var w: int = int(c.get_value("window", "width", DEFAULT_SIZE.x))
	var h: int = int(c.get_value("window", "height", DEFAULT_SIZE.y))
	var t: String = String(c.get_value("look", "theme", DEFAULT_THEME))
	return {
		"size": Vector2i(w, h),
		"fullscreen": bool(c.get_value("window", "fullscreen", false)),
		# ⚠ **모르는 값이 오면 기본으로 되돌린다.** 설정 파일은 사람이
		# 고칠 수 있고, 오타 하나로 색이 통째로 빈 사전이 되면 안 된다
		"theme": t if THEMES.has(t) else DEFAULT_THEME,
	}


static func set_theme(theme: String) -> void:
	if not THEMES.has(theme):
		return
	var c: ConfigFile = _cfg()
	c.set_value("look", "theme", theme)
	c.save(PATH)


## 설정값 → 실제 톤. `system`이면 OS에 묻는다 — 02 `resolveTone`과 같은 자리
static func resolve_tone(theme: String, system_dark: bool) -> String:
	if theme == "light":
		return "light"
	if theme == "dark":
		return "dark"
	return "dark" if system_dark else "light"


## OS가 어두운 쪽인가. **Godot이 못 알려주면 어두움으로 둔다** —
## 04가 지금까지 어두웠으므로 모를 때 화면이 안 바뀌는 쪽이 놀랍지 않다
static func system_dark() -> bool:
	return not DisplayServer.is_dark_mode_supported() or DisplayServer.is_dark_mode()


static func set_size(size: Vector2i) -> void:
	var c: ConfigFile = _cfg()
	c.set_value("window", "width", size.x)
	c.set_value("window", "height", size.y)
	# 크기를 고르면 전체화면은 풀린다 — 안 그러면 고른 게 아무 일도 안 한다
	c.set_value("window", "fullscreen", false)
	c.save(PATH)
	apply()


static func set_fullscreen(on: bool) -> void:
	var c: ConfigFile = _cfg()
	c.set_value("window", "fullscreen", on)
	c.save(PATH)
	apply()


## 창에 실제로 물린다.
##
## ⚠ **헤드리스에서는 아무것도 안 한다.** 검사가 창을 못 만드는데
## `DisplayServer`를 부르면 그 자리에서 죽는다
static func apply() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var s: Dictionary = of()
	if bool(s["fullscreen"]):
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		return
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	DisplayServer.window_set_size(s["size"])


static func size_label(size: Vector2i) -> String:
	return "%d × %d" % [size.x, size.y]


static func clear() -> void:
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))
