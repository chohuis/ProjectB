extends Control
class_name AppRoot

## 앱 루트 — M7-4. **지금까지 만든 조각이 실제로 이어지는 첫 지점.**
##
##   진행 버튼 → `DayRunner` → 경기 시뮬 → 주기 처리 → 새 ViewModel
##
## ⚠ **여기는 잇는 곳이지 계산하는 곳이 아니다.** 날짜·정지 판정·주 경계는
## 전부 이미 있는 모듈에 물어본다. 루트가 자기 손으로 세기 시작하면 그게
## 또 하나의 정본이 되고, 두 정본은 언젠가 갈린다.
##
## ⚠ **제일 위험한 자리는 주 경계다.** `DayEngine`이 세고 여기가 적용한다 —
## 한 번 더 돌면 성장이 2배, 건너뛰면 0인데 **오류도 로그도 안 난다.**
## 검사가 "센 만큼 정확히 돌렸나"와 "하루씩 간 것과 같나"를 둘 다 본다.

@onready var _main: MainScreen = $Main
@onready var _runner_host: Node = $Runner

var _state: Dictionary = {}
var _runner: DayRunner

## 검사와 계측이 보는 값 — 무슨 일이 일어났는지 밖에서 셀 수 있어야 한다
var games_played: int = 0
var weekly_passes: int = 0


func _ready() -> void:
	_runner = DayRunner.new()
	_runner_host.add_child(_runner)
	_runner.progress.connect(_on_progress)

	_main.advance_requested.connect(_on_advance_requested)
	_main.news_filter_selected.connect(_on_news_filter)
	_main.league_selected.connect(_on_league_selected)
	_refresh()


## ⚠ **거르기 선택도 상태에 넣는다.** 화면이 자기 안에 들고 있으면 진행
## 뒤에 새 사전이 오면서 초기화된다 — 소식을 거르고 하루 진행하면 전체로
## 돌아가는데, 사용자는 자기가 뭘 잘못 눌렀는지 모른다
func _on_news_filter(filter_id: String) -> void:
	_state["news_filter"] = filter_id
	_refresh()


func _on_league_selected(league_id: String) -> void:
	_state["league_tab"] = league_id
	_refresh()


## 세이브가 놓이는 자리. 슬롯은 M7-6(화면)에서 여러 개가 된다
const SAVE_PATH := "user://slot1.sav"


func state() -> Dictionary:
	return _state


## ⚠ **진행 중에는 저장하지 않는다.** 진행기가 상태를 갈아타는 도중이라
## 반쯤 진행된 세이브가 남는다 — 불러오면 그날 경기가 사라져 있다
func save(path: String = SAVE_PATH) -> Error:
	if _runner != null and _runner.is_running():
		return ERR_BUSY
	return SaveGame.write(path, _state)


## 불러오기. **실패하면 지금 게임을 안 건드린다** — 세이브가 상했다고
## 진행 중이던 게임까지 날아가면 안 된다
func load_from(path: String = SAVE_PATH) -> String:
	var r: Dictionary = SaveGame.read(path)
	var err: String = r.get("error", "")
	if not err.is_empty():
		return err
	set_state(r["state"])
	return ""


func screen() -> MainScreen:
	return _main


func runner() -> DayRunner:
	return _runner


func set_state(s: Dictionary) -> void:
	_state = s.duplicate(true)
	if is_node_ready():
		_refresh()


## ⚠ **화면이 자기 사전을 따로 만들지 않는다.** 루트가 만든 것 하나를
## 넘긴다 — 두 벌이 되면 하나만 갱신되는 순간이 온다
func _refresh() -> void:
	_main.set_view_model(MainVm.build(_state))


func _on_progress(done: int, total: int) -> void:
	_main.set_progress(done, total)


func _on_advance_requested(days: int) -> void:
	await advance(days)


## 며칠 진행한다. 실제로 몇 날 가는지는 `DayRunner`가 정한다
func advance(days: int) -> void:
	if days <= 0:
		return
	# ⚠ **은퇴하면 더 안 간다.** 안 막으면 은퇴한 선수가 계속 등판하고
	# 나이를 먹는다. `DayEngine`도 막지만 여기서 먼저 돌아선다
	if _state.get("protagonist", {}).get("retired", false):
		return

	var out: Dictionary = await _runner.run(_state, days, _play_game)
	if out.is_empty():
		# 겹쳐 눌렀다 — 진행기가 거절했다
		return

	var weeks: int = int(out.get("weeks_crossed", 0))

	# 진행 결과에만 있는 필드는 상태에 안 남긴다 — 다음 진행이 옛 값을 본다
	out.erase("games_today")
	out.erase("weeks_crossed")

	# ⚠ **새 상태로 갈아탄 뒤에 주기 처리를 돌린다.** 순서가 반대면
	# 성장이 통째로 사라진다 — `DayRunner`가 시작할 때 상태를 복사하므로,
	# 옛 사전을 고쳐 봐야 여기서 덮어써진다. **조용히 틀린다:** 날짜는
	# 멀쩡히 가고 경기도 치러지는데 능력치만 안 움직인다
	_state = out
	# ⚠ **센 만큼 돌린다.** `weeks_crossed`를 무시하고 자기 손으로 다시 세면
	# 그게 두 번째 정본이 된다
	_apply_weekly(weeks)
	_refresh()


## 경기 하나. 결과를 **일정에 되꽂는다** — 안 꽂으면 다시 진행할 때 또 돌린다.
##
## ⚠ **경기마다 씨앗을 따로 뽑는다.** 흐름 하나로 이으면 어딘가에 난수
## 호출을 하나 추가하는 순간 그 뒤 경기가 전부 밀린다 — 이주 내내 코드를
## 고칠 텐데 그러면 회귀를 못 잡는다
func _play_game(g: Dictionary) -> void:
	games_played += 1

	var world: Dictionary = _state.get("world", {})
	if world.is_empty():
		# 세계가 없는 상태(검사·부분 이주)에서는 자리만 채운다
		g["result"] = {"home_score": 0, "away_score": 0, "placeholder": true}
		return

	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix([_state.get("seed", 0), "game", g.get("id", "")])
	var out: Dictionary = MatchDay.play(world, g.get("home", ""), g.get("away", ""), rng)
	if not out["ok"]:
		g["result"] = {"home_score": 0, "away_score": 0, "error": out["error"]}
		return
	g["result"] = out["result"]


## 주기 처리 — 7일마다 도는 것들.
##
## ⚠ **시간 축만 일 단위다.** 성장·훈련·재정·관계는 02 그대로 7일마다 돈다.
## 밸런스를 안 건드려야 02 실측값과 대조할 수 있다
func _apply_weekly(weeks: int) -> void:
	for i in weeks:
		weekly_passes += 1
		_apply_one_week()


func _apply_one_week() -> void:
	var p: Dictionary = _state.get("protagonist", {})
	if p.is_empty():
		return

	# ⚠ **훈련 계획이 비어 있어도 돈다.** 주간 자동 회복(−5)이 계획과 무관하게
	# 붙기 때문이다 — 건너뛰면 아무 훈련도 안 짠 주에 피로가 안 빠진다
	var load: Dictionary = Training.plan_load(
		p.get("fatigue", 0.0),
		_state.get("training_plan", {}),
		_state.get("training_programs", []))

	p["fatigue"] = clampf(p.get("fatigue", 0.0) + float(load["fatigue_delta"]), 0.0, 100.0)
	p["condition"] = clampf(p.get("condition", 100.0) + float(load["condition_delta"]),
		0.0, 100.0)
