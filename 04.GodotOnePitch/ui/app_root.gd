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

const MATCH_SCREEN := preload("res://ui/screens/match_screen.tscn")
const SEASON_END_SCREEN := preload("res://ui/screens/season_end_screen.tscn")
const TRAINING_SCREEN := preload("res://ui/screens/training_screen.tscn")
const RETIREMENT_SCREEN := preload("res://ui/screens/retirement_screen.tscn")
const DECISION_SCREEN := preload("res://ui/screens/decision_screen.tscn")
const PLAYER_DETAIL_SCREEN := preload("res://ui/screens/player_detail_screen.tscn")
const TEAM_DETAIL_SCREEN := preload("res://ui/screens/team_detail_screen.tscn")

@onready var _main: MainScreen = $Main
@onready var _runner_host: Node = $Runner

var _state: Dictionary = {}
var _runner: DayRunner

## 지금 열려 있는 경기. 없으면 빈 사전
var _match: Dictionary = {}
var _match_screen: MatchScreen

## 결산 화면. 시즌이 끝나면 뜨고, 닫으면 다음 해가 시작된다
var _season_screen: SeasonEndScreen

## 훈련 계획 화면
var _training_screen: TrainingScreen
var _retire_screen: RetirementScreen
var _decision_screen: DecisionScreen
## 협상 화면이 고른 조건 (F-2b). **결정 하나가 끝나면 비운다**
var _decision_terms: Dictionary = {}
## 선수 상세 (F-4a)
var _detail_screen: PlayerDetailScreen
## 팀 상세 (F-4b)
var _team_screen: TeamDetailScreen

## 검사와 계측이 보는 값 — 무슨 일이 일어났는지 밖에서 셀 수 있어야 한다
var games_played: int = 0
var weekly_passes: int = 0
## 방금 끝낸 시즌의 결과. 결산 화면이 여기서 읽는다(M7-7)
var last_season_end: Dictionary = {}


func _ready() -> void:
	_runner = DayRunner.new()
	_runner_host.add_child(_runner)
	_runner.progress.connect(_on_progress)

	_main.advance_requested.connect(_on_advance_requested)
	_main.auto_requested.connect(_on_auto_requested)
	_main.match_requested.connect(_on_match_requested)
	_main.season_end_requested.connect(_on_season_end)
	_main.training_requested.connect(_on_training)
	_main.news_filter_selected.connect(_on_news_filter)
	_main.league_selected.connect(_on_league_selected)
	_main.study_mode_picked.connect(_on_study_mode)
	_main.major_picked.connect(_on_major)
	_main.sponsor_signed.connect(_on_sponsor)
	_main.subscription_toggled.connect(_on_subscription)
	_main.life_record_requested.connect(_open_life_record)
	_main.player_selected.connect(_open_player_detail)
	_main.team_selected.connect(_open_team_detail)
	_main.news_decision_picked.connect(_on_news_decision)
	_main.news_opened.connect(_on_news_opened)
	_main.news_closed.connect(_on_news_closed)
	_refresh()


## ⚠ **거르기 선택도 상태에 넣는다.** 화면이 자기 안에 들고 있으면 진행
## 뒤에 새 사전이 오면서 초기화된다 — 소식을 거르고 하루 진행하면 전체로
## 돌아가는데, 사용자는 자기가 뭘 잘못 눌렀는지 모른다
func _on_news_filter(filter_id: String) -> void:
	_state["news_filter"] = filter_id
	_refresh()


## 소식 본문을 편다. **여는 것이 읽음 표시다** — 02도 연 글은 읽음이다.
##
## ⚠ **답을 안 한 결정도 읽음이 된다.** 그래도 목록에서 안 사라진다 —
## `news_vm`이 미결정을 위로 올리고 `markable`에서 빼기 때문이다
func _on_news_opened(message_id: String) -> void:
	_state["news_open_id"] = message_id
	for m in _state.get("mailbox", []):
		if String(m.get("id", "")) == message_id:
			m["read"] = true
			break
	_refresh()


func _on_news_closed() -> void:
	_state.erase("news_open_id")
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
	_swap_state(s.duplicate(true))
	if is_node_ready():
		_refresh()


## 상태를 통째로 갈아끼운다. **사전 참조는 그대로 둔다.**
##
## ⚠ **`_state = out`으로 갈아타면 안 된다.** 자동 진행(B-11)은 이 사전
## 하나를 들고 도는데, 한 걸음마다 루트가 새 사전으로 갈아타면 그쪽은
## **옛 사전을 계속 본다** — 날짜가 영원히 안 움직이는 것처럼 보이고
## 상한까지 헛돈 뒤 "최대 반복 초과"로 멈춘다. 원인을 찾기 어려운 형태다
func _swap_state(out: Dictionary) -> void:
	_state.clear()
	_state.merge(out, true)
	# ⚠ **깊은 복사가 주인공 참조를 끊는다.** 세이브를 불러오는 것도 여기를
	# 지나므로, 안 이으면 불러온 게임에서 로스터 쪽만 자란다
	World.relink_protagonist(_state)


## ⚠ **화면이 자기 사전을 따로 만들지 않는다.** 루트가 만든 것 하나를
## 넘긴다 — 두 벌이 되면 하나만 갱신되는 순간이 온다
func _refresh() -> void:
	_main.set_view_model(MainVm.build(_state))


func _on_progress(done: int, total: int) -> void:
	_main.set_progress(done, total)


func _on_advance_requested(days: int) -> void:
	await advance(days)


func _on_auto_requested() -> void:
	await auto_advance()


## 등판 경기를 연다. **닫을 때까지 진행이 멈춘다** — 그게 "등판일에 멈춘다"의 뜻이다
func open_match() -> String:
	var g: Dictionary = _my_game_today()
	if g.is_empty():
		return "오늘 등판이 없다"

	var m: Dictionary = LiveMatch.open(_state, g)
	if not m["ok"]:
		return m["error"]

	m["game_id"] = g.get("id", "")
	m["home"] = g.get("home", "")
	m["away"] = g.get("away", "")
	m["rng"] = RandomNumberGenerator.new()
	m["rng"].seed = m["seed"]
	_match = m

	_match_screen = MATCH_SCREEN.instantiate()
	_match_screen.pitch_requested.connect(_on_pitch)
	_match_screen.auto_requested.connect(_on_auto)
	_match_screen.done_requested.connect(_on_match_done)
	_match_screen.selection_changed.connect(_on_selection)
	add_child(_match_screen)
	_main.visible = false
	_refresh_match()
	return ""


func match_screen() -> MatchScreen:
	return _match_screen


func match_state() -> Dictionary:
	return _match


func _my_game_today() -> Dictionary:
	var day: int = int(_state.get("day", 0))
	for g in _state.get("schedule", []):
		if int(g.get("day", -1)) == day and g.get("is_protagonist_game", false) 				and g.get("result", null) == null:
			return g
	return {}


func _refresh_match() -> void:
	if _match_screen != null:
		_match_screen.set_view_model(MatchVm.build(_match["state"], _match["ctx"]))


## ⚠ **고른 것을 `ctx`에 넣는다.** 화면이 들고 있으면 한 구 던질 때마다
## 새 사전이 오면서 초기화된다 — 소식 거르기와 같은 자리다
func _on_selection(patch: Dictionary) -> void:
	var sel: Dictionary = _match["ctx"].get("selection", {})
	sel.merge(patch, true)
	_match["ctx"]["selection"] = sel
	_refresh_match()


func _on_pitch() -> void:
	# ⚠ **내가 던질 때만 고른 공이 나간다.** 상대 투수 차례에 내 선택을
	# 넘기면 상대가 내 구종으로 던진다
	var vm: Dictionary = MatchVm.build(_match["state"], _match["ctx"])
	var d: Dictionary = PitchVm.to_decision(vm["pitch"]) \
		if vm.get("is_my_pitch", false) else {}
	LiveMatch.pitch(_match["state"], _match["ctx"], _match["rng"], d)
	_refresh_match()


func _on_auto() -> void:
	LiveMatch.finish(_match["state"], _match["ctx"], _match["rng"])
	_refresh_match()


## ⚠ **경기를 안 끝내고 닫으면 결과를 안 남긴다.** 남기면 도중까지의
## 점수가 순위표에 들어간다 — 다시 열어 이어서 던지면 된다
func _on_match_done() -> void:
	_record_match(_match)

	if _match_screen != null:
		remove_child(_match_screen)
		_match_screen.free()
		_match_screen = null
	_match = {}
	_main.visible = true
	_refresh()


## 다음 결정까지 자동으로 간다 — B-11. `{stopped, steps}`.
##
## ⚠ **`AutoAdvance`는 정책만 갖고 있었다.** `run`을 부르는 곳이 검사밖에
## 없어서, "무엇 앞에서 멈추나"를 실컷 정해 놓고 게임에서는 한 번도 안
## 돌았다 — 만들어 놓고 안 이은 자리다.
##
## ⚠ **02는 이걸 개발자 도구에만 뒀다**(`MainPage.svelte:477`, DevToolsHub
## 경유). 04엔 그 허브가 없어 그대로 옮기면 화면을 하나 새로 만들어야 하고,
## **실제로 쓸모 있는 자리는 진행 버튼 옆이다** — 다음 등판까지 하루씩
## 누르는 게 지금 유일한 방법이다. 그래서 메인 진행 줄에 붙였다
func auto_advance() -> Dictionary:
	var out: Dictionary = await AutoAdvance.run(_state, _auto_step, _auto_answer)
	_refresh()
	# ⚠ **왜 멈췄는지를 말한다.** 안 말하면 "눌렀는데 조금 가다 섰다"가 되고,
	# 사용자는 게임이 고장 난 줄 안다
	_main.set_auto_stop(String(out.get("stopped", {}).get("label", "")))

	# ⚠ **자동 진행 뒤에도 물어본 건 띄운다.** `advance()`가 하는 것과 같다 —
	# 여기만 빠뜨리면 결정이 대기줄에 오른 채 화면이 안 뜬다
	if RetirementVm.is_asking(_state):
		_open_retirement()
	elif DecisionVm.is_asking(_state):
		_open_decision()
	return out


## 한 걸음 진행. **며칠 갈지는 `DayEngine`이 정한다** — 여기서 세면
## 진행 버튼과 갈린다
func _auto_step(s: Dictionary) -> void:
	var span: int = DayEngine.next_stop_day(s) - int(s.get("day", 1))
	await advance(maxi(span, 1))


## 대신 답한다. **날을 막는 것 중 커리어가 안 갈리는 것들**이다 —
## 무엇이 여기 오는지는 `AutoAdvance.STOPPING`이 정한다
func _auto_answer(s: Dictionary, action: Dictionary) -> void:
	match String(action.get("type", "")):
		"game":
			_auto_play_my_game(String(action.get("schedule_id", "")))
		"message":
			_auto_answer_message(s, String(action.get("message_id", "")))


## 내 등판을 화면 없이 끝까지 돌린다.
##
## ⚠ **결과를 남기는 길은 `_record_match` 하나다.** 여기서 따로 꽂으면
## 자동으로 넘긴 등판만 성적이 비거나 순위표가 갈린다
func _auto_play_my_game(schedule_id: String) -> void:
	var g: Dictionary = _my_game_today()
	if g.is_empty():
		return
	var m: Dictionary = LiveMatch.open(_state, g)
	if not m["ok"]:
		# 열 수 없는 경기다 — 붙잡고 있으면 자동 진행이 여기서 헛돈다
		g["result"] = {}
		return
	m["game_id"] = g.get("id", schedule_id)
	m["home"] = g.get("home", "")
	m["away"] = g.get("away", "")
	m["rng"] = RandomNumberGenerator.new()
	m["rng"].seed = m["seed"]
	LiveMatch.finish(m["state"], m["ctx"], m["rng"])
	_record_match(m)


## 소식 결정을 대신 고른다 — **지침 정도는 피로다**(`AutoAdvance.pick_choice`).
##
## ⚠ **늘 첫 번째를 고르면 자동 진행이 피로를 무시하고 부상으로 간다**
## ⚠ **고른 뒤엔 `CoachReport.apply`를 거친다** (F-8). 여기서 `selected`를
## 직접 쓰면 **효과가 안 걸린다** — 자동 진행으로 지나간 주만 조언이
## 공짜가 된다. 적용하는 자리는 하나여야 한다
func _auto_answer_message(s: Dictionary, message_id: String) -> void:
	for m in s.get("mailbox", []):
		if String(m.get("id", "")) != message_id:
			continue
		var d = m.get("decision", null)
		if d == null:
			return
		var picked: String = AutoAdvance.pick_choice(d.get("choices", []),
			float(s.get("protagonist", {}).get("fatigue", 50.0)))
		if CoachReport.apply(s, message_id, picked):
			return
		# 효과 표가 없는 소식이다 — 답만 남기고 넘어간다
		m["read"] = true
		d["selected"] = picked
		return


## 끝난 경기를 일정과 시즌 성적에 남긴다.
##
## ⚠ **자동 진행도 여기를 지난다.** 손으로 던진 경기와 자동으로 넘긴
## 경기가 다른 길로 기록되면, 자동 진행으로 지나간 등판만 성적이 비거나
## 순위표가 갈린다 — **두 정본을 만들지 않는다**
func _record_match(m: Dictionary) -> void:
	if not m.get("state", {}).get("is_finished", false):
		return
	var r: Dictionary = LiveMatch.to_result(m["state"], m["home"], m["away"])
	for g in _state.get("schedule", []):
		if g.get("id", "") == m["game_id"]:
			g["result"] = r

	# ⚠ **손으로 던진 경기도 성적에 쌓인다.** 자동 시뮬 쪽에만 붙이면
	# 내가 직접 던진 날만 기록이 빈다 — 하필 제일 중요한 경기들이다
	if not _state.has("season_stats"):
		_state["season_stats"] = {}
	SeasonStats.accumulate_into(_state["season_stats"], r.get("player_lines", []))

	# ⚠ **경기 뒤 성장이 통째로 죽어 있었다** (F-9). `GameGrowth`를 아무도
	# 안 불러서 능력·사기·명성·피로가 한 경기도 안 움직였다.
	# **식은 `MatchOutcome`이 갖는다** — 여기 적으면 자동 진행 경로와 갈린다
	MatchOutcome.apply(_state, r)


func _on_match_requested() -> void:
	open_match()


## 시즌을 끝내고 다음 해로. **`SeasonRunner` 하나만 거친다** —
## 02는 이 자리가 세 분기에 각각 있었고 그중 어디도 안 타는 경로가 있었다
func _on_season_end() -> void:
	last_season_end = SeasonRunner.finish_season(_state)
	if not last_season_end.get("ran", false):
		_refresh()
		return

	# ⚠ **결산을 보여준 뒤에 다음 해로 넘어간다.** 안 보여주면 한 시즌이
	# 통째로 사라진 것처럼 느껴진다 — 사용자가 한 해 동안 한 일이 거기 있다
	_season_screen = SEASON_END_SCREEN.instantiate()
	_season_screen.done_requested.connect(_on_season_end_done)
	add_child(_season_screen)
	_season_screen.set_view_model(SeasonEndVm.build(last_season_end.get("digest", {})))
	_main.visible = false


## 훈련 계획을 연다. **계획은 상태가 들고 있다** — 화면이 들면 진행 뒤에
## 새 사전이 오면서 초기화된다
func _on_training() -> void:
	_training_screen = TRAINING_SCREEN.instantiate()
	_training_screen.slot_changed.connect(_on_training_slot)
	_training_screen.pitch_picked.connect(_on_pitch_picked)
	_training_screen.done_requested.connect(_on_training_done)
	add_child(_training_screen)
	_training_screen.set_view_model(TrainingVm.build(_state))
	_main.visible = false


func training_screen() -> TrainingScreen:
	return _training_screen


func _on_training_slot(patch: Dictionary) -> void:
	var plan: Dictionary = _state.get("training_plan", {})
	var pid: String = String(patch.get("program_id", ""))
	if pid.is_empty():
		plan.erase(String(patch.get("slot_id", "")))
	else:
		plan[String(patch.get("slot_id", ""))] = pid
	_state["training_plan"] = plan
	if _training_screen != null:
		_training_screen.set_view_model(TrainingVm.build(_state))


## 어느 구종을 배울지 골랐다 — F-1.
##
## ⚠ **엔진이 한 번 더 막는다.** `PitchDev.start`가 잠긴 구종·정원 초과를
## 거른다 — 02는 화면에만 가드가 있어서 다른 호출부가 그대로 통과했다.
##
## ⚠ **같은 것을 다시 누르면 접는다.** 잘못 골랐을 때 되돌릴 길이 없으면
## 그 주가 통째로 날아간다
func _on_pitch_picked(pitch_id: String) -> void:
	var p: Dictionary = _state.get("protagonist", {})
	var ts: Dictionary = p.get("training_pitch_state", {})
	if String(ts.get("id", "")) == pitch_id:
		PitchDev.cancel(p)
	else:
		PitchDev.start(p, pitch_id)
	if _training_screen != null:
		_training_screen.set_view_model(TrainingVm.build(_state))


func _on_training_done() -> void:
	if _training_screen != null:
		remove_child(_training_screen)
		_training_screen.free()
		_training_screen = null
	_main.visible = true
	_refresh()


## 은퇴를 묻는다.
##
## ⚠ **`retirement_ask`를 밀어넣는 코드는 있는데 받는 자리가 없었다.**
## 02가 그랬고 04도 그대로였다 — 대기줄에 올라간 채 아무도 안 받아서
## 자동 진행이 "은퇴 여부 결정"에서 멈춘 채 안 풀리고, `Retirement.retire`도
## 호출부가 없어 **커리어가 영영 안 끝났다**
func _open_retirement() -> void:
	if _retire_screen != null:
		return
	_retire_screen = RETIREMENT_SCREEN.instantiate()
	_retire_screen.retire_requested.connect(_on_retire)
	_retire_screen.keep_playing_requested.connect(_on_keep_playing)
	_retire_screen.done_requested.connect(_on_retirement_done)
	add_child(_retire_screen)
	_retire_screen.set_ask(RetirementVm.build_ask(_state),
		RetirementVm.build_summary(_state))
	_main.visible = false


## 인생 기록을 다시 본다. **은퇴 뒤에도, 현역일 때도** 같은 화면이다 —
## 은퇴하는 순간이 첫 관람이고 그 뒤로는 여기가 입구다
func _open_life_record() -> void:
	if _retire_screen != null:
		return
	_retire_screen = RETIREMENT_SCREEN.instantiate()
	_retire_screen.done_requested.connect(_on_retirement_done)
	add_child(_retire_screen)
	_retire_screen.set_summary(RetirementVm.build_summary(_state))
	_main.visible = false


func retirement_screen() -> RetirementScreen:
	return _retire_screen


func _on_retire() -> void:
	var ask: Dictionary = RetirementVm.ask_of(_state)
	Retirement.retire(_state, String(ask.get("reason",
		Retirement.REASON_DECLINE)), int(_state.get("day", 1)))
	# ⚠ **은퇴가 확정된 뒤에 결산을 다시 만든다** — 마지막 시즌과 은퇴
	# 사유가 빠진 채로 나오면 인생 기록이 아니다
	if _retire_screen != null:
		_retire_screen.set_summary(RetirementVm.build_summary(_state))


func _on_keep_playing() -> void:
	Retirement.keep_playing(_state)
	_on_retirement_done()


## ⚠ **여기서는 즉시 해제가 위험하다.** 이 화면이 쏜 신호 안에서 그 화면을
## 지우게 되므로 "잠긴 객체"가 된다 — 미뤄서 지운다. 매 줄마다 다시 그리는
## 자리가 아니라 화면 하나를 한 번 닫는 자리라 고아가 쌓이지도 않는다
func _on_retirement_done() -> void:
	if _retire_screen != null:
		remove_child(_retire_screen)
		_retire_screen.queue_free()
		_retire_screen = null
	_main.visible = true
	_refresh()


## 결정을 묻는다.
##
## ⚠ **밀어넣는 코드는 있는데 받는 자리가 없었다** — 은퇴 말고 아홉이
## 그랬다. 대기줄에 올라간 채 아무도 안 받으면 `AutoAdvance`가 그 자리에서
## 안 풀리고 커리어가 막힌다
func _open_decision() -> void:
	if _decision_screen != null:
		return
	_decision_screen = DECISION_SCREEN.instantiate()
	_decision_screen.chosen.connect(_on_decision)
	# 협상 조건이 바뀌면 사전을 다시 만든다 (F-2b) — 화면이 산식을 갖지 않는다
	_decision_screen.terms_changed.connect(_on_decision_terms)
	add_child(_decision_screen)
	_decision_terms = {}
	_decision_screen.set_view_model(DecisionVm.build(_state))
	_main.visible = false


func decision_screen() -> DecisionScreen:
	return _decision_screen


## 소식의 선택지를 골랐다 — F-8b.
##
## ⚠ **효과를 거는 자리는 `CoachReport.apply` 하나다.** 여기서 상태를
## 직접 고치면 자동 진행이 고른 답과 다른 일이 벌어진다
func _on_news_decision(message_id: String, choice_id: String) -> void:
	if CoachReport.apply(_state, message_id, choice_id):
		_refresh()


## 선수 상세를 연다 — F-4.
##
## ⚠ **주인공은 "나" 탭으로 보낸다.** 그쪽이 훨씬 자세하고, 두 화면이 같은
## 사람을 다르게 그리면 어느 쪽이 맞는지 알 수 없다
func _open_player_detail(player_id: String) -> void:
	if _detail_screen != null:
		return
	var vm: Dictionary = PlayerDetailVm.build(_state, player_id)
	if vm.get("is_me", false):
		_main.show_tab("me")
		return
	_detail_screen = PLAYER_DETAIL_SCREEN.instantiate()
	_detail_screen.closed.connect(_close_player_detail)
	add_child(_detail_screen)
	_detail_screen.set_view_model(vm)
	_main.visible = false


func player_detail_screen() -> PlayerDetailScreen:
	return _detail_screen


func _close_player_detail() -> void:
	if _detail_screen == null:
		return
	remove_child(_detail_screen)
	_detail_screen.queue_free()
	_detail_screen = null
	# ⚠ **팀 상세에서 열었으면 그리로 돌아간다.** 진행 화면으로 튕기면
	# 보던 팀을 다시 찾아 들어가야 한다
	if _team_screen != null:
		_team_screen.visible = true
		return
	_main.visible = true
	_refresh()


## 팀 상세를 연다 — F-4b. **리그 표에서 누르면 온다**
func _open_team_detail(team_id: String) -> void:
	if _team_screen != null:
		return
	var vm: Dictionary = TeamDetailVm.build(_state, team_id)
	if vm.is_empty():
		return
	_team_screen = TEAM_DETAIL_SCREEN.instantiate()
	_team_screen.closed.connect(_close_team_detail)
	# 팀에서 사람으로 들어가는 길 — 없으면 로스터가 다시 "이름과 숫자"다
	_team_screen.player_selected.connect(_open_player_from_team)
	add_child(_team_screen)
	_team_screen.set_view_model(vm)
	_main.visible = false


func team_detail_screen() -> TeamDetailScreen:
	return _team_screen


## ⚠ **팀 상세를 덮고 연다.** 닫으면 팀 상세로 돌아간다
func _open_player_from_team(player_id: String) -> void:
	if _team_screen != null:
		_team_screen.visible = false
	_open_player_detail(player_id)
	# 주인공이면 "나" 탭으로 갔다 — 팀 상세는 접고 진행 화면을 보인다
	if _detail_screen == null:
		_close_team_detail()


func _close_team_detail() -> void:
	if _team_screen == null:
		return
	remove_child(_team_screen)
	_team_screen.queue_free()
	_team_screen = null
	_main.visible = true
	_refresh()


## ⚠ **답한 뒤에 또 있는지 본다.** 결정은 줄줄이 온다(진로 결과 → 최종
## 선택 → 지명 통보) — 하나 답하고 화면을 닫으면 다음 것이 다시 대기줄에
## 남은 채로 진행이 막힌다
## 협상 조건이 바뀌었다 — 새 조건으로 사전을 다시 만든다 (F-2b)
func _on_decision_terms(terms: Dictionary) -> void:
	if _decision_screen == null:
		return
	_decision_terms = terms
	_decision_screen.set_view_model(DecisionVm.build(_state, terms))


func _on_decision(choice_id: String) -> void:
	DecisionVm.apply(_state, choice_id, int(_state.get("day", 1)),
		_decision_terms)
	# ⚠ **조건을 비운다.** 다음 결정이 지난 협상의 슬라이더 값을 물려받으면
	# 안 만진 조건으로 계약이 나간다
	_decision_terms = {}
	if DecisionVm.is_asking(_state):
		_decision_screen.set_view_model(DecisionVm.build(_state))
		return
	if _decision_screen != null:
		remove_child(_decision_screen)
		_decision_screen.queue_free()
		_decision_screen = null
	_main.visible = true
	_refresh()


func season_screen() -> SeasonEndScreen:
	return _season_screen


func _on_season_end_done() -> void:
	if _season_screen != null:
		remove_child(_season_screen)
		_season_screen.free()
		_season_screen = null
	_main.visible = true
	_refresh()


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
	_swap_state(out)
	# ⚠ **센 만큼 돌린다.** `weeks_crossed`를 무시하고 자기 손으로 다시 세면
	# 그게 두 번째 정본이 된다
	_apply_weekly(weeks)
	_refresh()

	# ⚠ **물어봤으면 띄운다.** 대기줄에 올려 놓고 받는 자리가 없으면
	# 자동 진행이 그 자리에서 멈춘 채 영영 안 풀린다
	if RetirementVm.is_asking(_state):
		_open_retirement()
	elif DecisionVm.is_asking(_state):
		_open_decision()


## 경기 하나. 결과를 **일정에 되꽂는다** — 안 꽂으면 다시 진행할 때 또 돌린다.
##
## ⚠ **경기마다 씨앗을 따로 뽑는다.** 흐름 하나로 이으면 어딘가에 난수
## 호출을 하나 추가하는 순간 그 뒤 경기가 전부 밀린다 — 이주 내내 코드를
## 고칠 텐데 그러면 회귀를 못 잡는다
## ⚠ **`state`는 진행기가 돌리는 복사본이다.** 바깥 `_state`에 쌓으면
## 진행이 끝날 때 통째로 덮어써진다 — 성장이 조용히 사라졌던 그 자리다
## 경기 하나. **판단은 `GameSim`이 한다** — 여기는 화면이 세는 것만 더한다
func _play_game(g: Dictionary, state: Dictionary = _state) -> void:
	games_played += 1
	GameSim.play(g, state)


## 주기 처리 — 7일마다 도는 것들.
##
## ⚠ **시간 축만 일 단위다.** 성장·훈련·재정·관계는 02 그대로 7일마다 돈다.
## 밸런스를 안 건드려야 02 실측값과 대조할 수 있다
## ⚠ **몇 번째 주 경계인지를 같이 넘긴다.** 여러 날을 한 번에 진행하면
## 여기서 N번 도는데, 전부 도착한 날짜를 쓰면 **같은 주를 N번 사는 것**이
## 된다 — NPC가 같은 난수·같은 성적 창을 N번 받아서 하루씩 간 것과 결과가
## 달라진다. **어느 날이었는지는 `DayEngine`이 안다** — 여기서 세면 그게
## 두 번째 정본이 된다
func _apply_weekly(weeks: int) -> void:
	for boundary in DayEngine.week_end_days(int(_state.get("day", 1)), weeks):
		weekly_passes += 1
		WeekRunner.run(_state, boundary)



## 스폰서와 계약한다.
##
## ⚠ **여기가 스폰서를 세우는 유일한 자리다.** 없을 땐 `sponsor_offers`가
## 계산만 하고 아무 데도 안 닿아서 계약이 한 건도 안 생겼다.
##
## ⚠ **금액을 화면이 아니라 지금 다시 낸다.** 화면이 들고 있던 오퍼를
## 그대로 받으면, 그 사이에 명성이 바뀌어도 옛 금액으로 계약된다
func _on_sponsor(category_id: String) -> void:
	var p: Dictionary = _state.get("protagonist", {})
	if p.is_empty():
		return
	var year: int = int(_state.get("season_year", 0))
	var sponsors: Array = p.get("sponsors", [])
	var signed_ids: Array = []
	for s in Finance.active_sponsors(sponsors, year):
		signed_ids.append(String(s.get("category_id", "")))

	var out: Dictionary = Finance.sponsor_offers(float(p.get("fame", 0.0)),
		int(p.get("salary", 0)), FinanceVm._stage_of(p),
		Staff.mods_of(_state.get("world", {}),
			String(p.get("team_id", "")))["fame"], signed_ids)
	for o in out["offers"]:
		if String(o["category_id"]) != category_id:
			continue
		sponsors.append(Finance.sign_sponsor(o, year))
		p["sponsors"] = sponsors
		_refresh()
		return


## 개인 트레이닝 구독을 한 단계 올린다. **마지막에서 누르면 해지다.**
##
## ⚠ **여기가 `training_subscriptions`를 세우는 유일한 자리다.** 없을 땐
## 읽는 곳이 둘인데 쓰는 곳이 없어서 영영 빈 배열이었다
func _on_subscription(area_id: String) -> void:
	var subs: Array = _state.get("training_subscriptions", [])
	var tier: int = FinanceVm.next_tier(subs, area_id)

	var next: Array = []
	for s in subs:
		if String(s.get("area_id", "")) != area_id:
			next.append(s)
	# 0단계는 해지다 — 줄을 남기면 "미구독인데 목록에 있는" 상태가 된다
	if tier > 0:
		next.append({"area_id": area_id, "tier": tier})
	_state["training_subscriptions"] = next
	_refresh()




## 이번 주부터 이렇게 공부한다.
##
## ⚠ **여기가 `study_mode`를 쓰는 유일한 자리다.** 없을 땐 읽는 코드만
## 있어서 전 커리어가 "normal" 고정이었고 나머지 셋은 도달 불가였다
func _on_study_mode(mode: String) -> void:
	var school: Dictionary = _state.get("school", {})
	school["study_mode"] = mode
	_state["school"] = school
	_refresh()


## 전공을 고른다. **한 번뿐이다** — 이미 골랐으면 아무 일도 없다
func _on_major(name: String) -> void:
	var school: Dictionary = _state.get("school", {})
	if not String(school.get("major", "")).is_empty():
		return
	school["major"] = name
	_state["school"] = school
	_refresh()
