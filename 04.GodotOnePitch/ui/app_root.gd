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
	_main.match_requested.connect(_on_match_requested)
	_main.season_end_requested.connect(_on_season_end)
	_main.training_requested.connect(_on_training)
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
	if _match["state"].get("is_finished", false):
		var r: Dictionary = LiveMatch.to_result(_match["state"],
			_match["home"], _match["away"])
		for g in _state.get("schedule", []):
			if g.get("id", "") == _match["game_id"]:
				g["result"] = r

		# ⚠ **손으로 던진 경기도 성적에 쌓인다.** 자동 시뮬 쪽에만 붙이면
		# 내가 직접 던진 날만 기록이 빈다 — 하필 제일 중요한 경기들이다
		if not _state.has("season_stats"):
			_state["season_stats"] = {}
		SeasonStats.accumulate_into(_state["season_stats"],
			r.get("player_lines", []))

	if _match_screen != null:
		remove_child(_match_screen)
		_match_screen.free()
		_match_screen = null
	_match = {}
	_main.visible = true
	_refresh()


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


func _on_training_done() -> void:
	if _training_screen != null:
		remove_child(_training_screen)
		_training_screen.free()
		_training_screen = null
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
## ⚠ **`state`는 진행기가 돌리는 복사본이다.** 바깥 `_state`에 쌓으면
## 진행이 끝날 때 통째로 덮어써진다 — 성장이 조용히 사라졌던 그 자리다
func _play_game(g: Dictionary, state: Dictionary = _state) -> void:
	games_played += 1

	var world: Dictionary = state.get("world", {})
	if world.is_empty():
		# 세계가 없는 상태(검사·부분 이주)에서는 자리만 채운다
		g["result"] = {"home_score": 0, "away_score": 0, "placeholder": true}
		return

	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix([state.get("seed", 0), "game", g.get("id", "")])
	# ⚠ **오늘 등판하기로 한 주인공을 불펜 앞에 세운다.** 안 넘기면
	# "오늘 등판"이 화면에만 뜨고 실제로는 안 나온다
	var relief: String = ""
	if g.get("is_protagonist_game", false):
		relief = String(state.get("protagonist", {}).get("id", ""))
	var my_team: String = String(state.get("protagonist", {}).get("team_id", ""))
	var out: Dictionary = MatchDay.play(world, g.get("home", ""), g.get("away", ""), rng, {
		"league_id": g.get("league_id", ""),
		"home_relief": relief if g.get("home", "") == my_team else "",
		"away_relief": relief if g.get("away", "") == my_team else "",
	})
	if not out["ok"]:
		g["result"] = {"home_score": 0, "away_score": 0, "error": out["error"]}
		return
	g["result"] = out["result"]

	# ⚠ **여기서 안 쌓으면 시즌 성적이 영영 안 생긴다.** "나" 탭도 수상도
	# 이 사전을 읽는데 채우는 자리가 없었다 — 화면은 늘 빈칸이었다.
	#
	# ⚠ **제자리로 쌓는다.** 매 경기 7,000키 사전을 복사하면 하루 83경기에
	# 58만 키다 — 성능 여유가 1.41배뿐이라 그것만으로 게이트를 넘는다
	if not state.has("season_stats"):
		state["season_stats"] = {}
	SeasonStats.accumulate_into(state["season_stats"],
		out["result"].get("player_lines", []))


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
		_apply_one_week(boundary)


func _apply_one_week(at_day: int = -1) -> void:
	# NPC는 계획 없이 자기 환경대로 자란다 — 주인공만 매주 크면 몇 시즌
	# 뒤에 세계에서 혼자 뛰어오른다
	NpcGrowth.run(_state, at_day)

	# 카퍼스 이벤트 — 쇼케이스(32주)·올스타(34주).
	#
	# ⚠ **주인공이 없어도 돈다.** 대학 무대는 세계의 일이고, 주인공이 안
	# 불렸다는 것도 결과다 — 아래 `p.is_empty()` 뒤로 내리면 그게 사라진다
	CampusRunner.run(_state, at_day)

	var p: Dictionary = _state.get("protagonist", {})
	if p.is_empty():
		return

	# 학사 — **학교에 다니는 동안만.** 시험 주에 학기가 확정되고, 경고가
	# 훈련 효율을 깎는다
	_apply_academics(p, at_day)

	# ⚠ **훈련 계획이 비어 있어도 돈다.** 주간 자동 회복(−5)이 계획과 무관하게
	# 붙기 때문이다 — 건너뛰면 아무 훈련도 안 짠 주에 피로가 안 빠진다.
	#
	# ⚠ **`TrainingGrowth`가 정본이다.** 예전엔 `Training.plan_load`만 불러
	# **피로만 움직이고 능력치는 안 올랐다** — 훈련 화면에서 뭘 짜든 결과가
	# 같았다. 피로·컨디션도 이 안에서 같은 함수로 나온다
	var out: Dictionary = TrainingGrowth.calc(p,
		_state.get("training_plan", {}),
		Training.programs())

	p["pitching"] = out["pitching"]
	p["batting"] = out["batting"]
	p["pitching_xp"] = out["pitching_xp"]
	p["batting_xp"] = out["batting_xp"]
	p["fatigue"] = clampf(p.get("fatigue", 0.0) + float(out["fatigue_delta"]), 0.0, 100.0)
	p["condition"] = clampf(p.get("condition", 100.0) + float(out["condition_delta"]),
		0.0, 100.0)

	# 구종 숙련도 진행 — 쌓이면 등급이 오른다(훈련 화면이 그걸 보여준다)
	if float(out.get("pitch_dev_gain", 0.0)) > 0.0:
		p["pitch_dev"] = float(p.get("pitch_dev", 0.0)) + float(out["pitch_dev_gain"])

	# 무엇이 올랐는지 — 소식이 이걸 읽는다
	if not out["logs"].is_empty():
		var log: Array = _state.get("training_log", [])
		log.append({"day": int(_state.get("day", 0)), "gains": out["logs"]})
		_state["training_log"] = log


## 학교에 다니는 리그. **프로에는 학사가 없다**
const SCHOOL_LEAGUES: Array[String] = ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY"]


## 한 주의 학사. **학교에 다니는 동안만 돈다.**
##
## ⚠ **시험 주에 학기를 확정한다.** 02는 대학 시험 트리거가 없어 학기
## 확정이 죽은 코드였다 — 학점이 영영 안 매겨졌다
func _apply_academics(p: Dictionary, at_day: int) -> void:
	if not SCHOOL_LEAGUES.has(String(p.get("league_id", ""))):
		return

	var school: Dictionary = _state.get("school", {})
	if school.is_empty():
		school = {"major": "", "study_mode": "normal", "warning_level": 0}
	Academics.study_week(school)

	var day: int = at_day if at_day > 0 else int(_state.get("day", 1))
	var exam: String = Academics.exam_at_day(day)
	if not exam.is_empty():
		var r: Dictionary = Academics.close_semester(school)
		# 학사 경고는 소식으로 알린다 — 조용히 훈련만 깎이면 원인을 모른다
		var log: Array = _state.get("academic_log", [])
		log.append({"day": day, "exam": exam, "gpa": r["gpa"],
			"warning_level": r["warning_level"], "label": r["label"]})
		_state["academic_log"] = log
		# ⚠ **출전 정지가 경기 판정에 닿아야 한다.** 안 이으면 경고가
		# 훈련만 깎고 경기에는 아무 일도 안 일어난다
		p["eligibility_blocked"] = bool(r["blocked"])

	_state["school"] = school
