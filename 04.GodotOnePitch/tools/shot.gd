extends SceneTree

## 화면을 띄워 스크린샷을 남긴다.
##
##   godot --script tools/shot.gd -- status
##
## ⚠ **헤드리스로는 못 찍는다.** 렌더링이 없으므로 창을 띄워야 한다.
## P5에서 화면 55개를 옮길 때 **스크린샷 대조가 완료 판정**이 되므로,
## 이 진입점이 그 도구가 된다.

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var which: String = args[0] if args.size() > 0 else "status"

	# ⚠ **창 크기는 `DisplayServer`로 바꾼다.** 루트 뷰포트의 `size`에 직접
	# 넣으면 실제 창은 안 따라오고, 찍힌 그림이 기본 크기(1152×648)로 나온다
	DisplayServer.window_set_size(Vector2i(1440, 900))
	DisplayServer.window_set_title("OnePitch — %s" % which)

	var win := get_root()
	var screen: Control = _build(which)
	if screen == null:
		print("모르는 화면: %s" % which)
		quit(2)
		return
	win.add_child(screen)

	# ⚠ **한 번 그리게 만든 뒤에 찍는다.** `process_frame`을 두 번 기다려도
	# 실제 렌더는 아직일 수 있어서 회색 판만 나왔다. 프레임을 넉넉히 돌리고
	# 마지막에 강제로 한 번 그린다
	# ⚠ **진행을 거치는 갈래가 있다.** `advance`가 프레임을 넘기므로
	# 몇 프레임만 기다리면 진행 중인 화면을 찍는다
	for i in 240:
		await process_frame
	RenderingServer.force_draw()

	var dir := "user://shots"
	DirAccess.make_dir_recursive_absolute(dir)
	var path := "%s/%s.png" % [dir, which]
	var img := win.get_texture().get_image()
	img.save_png(path)
	print("찍음: %s  (%d×%d · 자식 %d)" % [
		ProjectSettings.globalize_path(path), img.get_width(), img.get_height(),
		screen.get_child_count(),
	])
	quit(0)


const STATUS := preload("res://ui/screens/status_screen.tscn")
const MAIN := preload("res://ui/screens/main_screen.tscn")
const APP := preload("res://ui/app_root.tscn")
const APP_ENTRY := preload("res://ui/app.tscn")
const SEASON_END := preload("res://ui/screens/season_end_screen.tscn")
const DRAFT_BOARD := preload("res://ui/screens/draft_board_screen.tscn")
const PEOPLE := preload("res://ui/screens/people_screen.tscn")


## 씬을 인스턴스화하고 사전을 넣는다
func _screen(vm: Dictionary) -> Control:
	var s: StatusScreen = STATUS.instantiate()
	s.set_view_model(vm)
	return s


## 진행 화면은 **상태를 받아 ViewModel을 거친다** — 화면이 보는 사전이
## 실제 경로와 같아야 스크린샷이 뜻을 갖는다
func _main(state: Dictionary) -> Control:
	var s: MainScreen = MAIN.instantiate()
	s.set_view_model(MainVm.build(state))
	return s


func _build(which: String) -> Control:
	match which:
		"status":
			return _screen(Fixtures.status_vm())
		"status-empty":
			return _screen(Fixtures.status_vm_empty())
		"main":
			return _main(Fixtures.main_state())
		"main-gameday":
			return _main(Fixtures.main_state_gameday())
		"app":
			var a: AppRoot = APP.instantiate()
			a.set_state(Fixtures.main_state())
			return a
		"schedule":
			var sc: AppRoot = APP.instantiate()
			sc.set_state(Fixtures.main_state())
			sc.ready.connect(func() -> void: sc.screen()._on_tab(5), CONNECT_ONE_SHOT)
			return sc
		"news":
			var nw: AppRoot = APP.instantiate()
			nw.set_state(Fixtures.main_state())
			return nw
		"newgame":
			# ⚠ **진짜 새 게임이다.** 손으로 만든 사전이 아니라 세계 생성을
			# 거친다 — 그래야 스크린샷이 실제 경로를 본다
			var ng: AppRoot = APP.instantiate()
			ng.set_state(World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"}))
			return ng
		"newgame-schedule":
			var ns: AppRoot = APP.instantiate()
			ns.set_state(World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"}))
			ns.ready.connect(func() -> void: ns.screen()._on_tab(5), CONNECT_ONE_SHOT)
			return ns
		"league":
			var lg: AppRoot = APP.instantiate()
			lg.set_state(Fixtures.played_state(40))
			lg.ready.connect(func() -> void: lg.screen()._on_tab(3), CONNECT_ONE_SHOT)
			return lg
		"team":
			var tm: AppRoot = APP.instantiate()
			tm.set_state(World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"}))
			tm.ready.connect(func() -> void: tm.screen()._on_tab(2), CONNECT_ONE_SHOT)
			return tm
		"me":
			var mp: AppRoot = APP.instantiate()
			mp.set_state(World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"}))
			mp.ready.connect(func() -> void: mp.screen()._on_tab(1), CONNECT_ONE_SHOT)
			return mp
		"title":
			return APP_ENTRY.instantiate()
		"title-saved":
			# 슬롯에 세이브가 있는 상태
			Slots.clear_all()
			Slots.save(1, World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"}))
			var t2 := World.new_game({"seed": 777, "season_year": 2027,
				"name": "박한별", "team_id": "TEAM_HS_BAEKHO"})
			t2["day"] = 120
			Slots.save(2, t2)
			return APP_ENTRY.instantiate()
		"newgame-screen":
			var ne: App = APP_ENTRY.instantiate()
			ne.ready.connect(func() -> void: ne.show_new_game(), CONNECT_ONE_SHOT)
			return ne
		"match":
			# 등판일까지 진행한 뒤 경기를 열고 몇 구 던진다
			var mt: AppRoot = APP.instantiate()
			var st := World.new_game({"seed": 777, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			for g in st["schedule"]:
				if g["is_protagonist_game"]:
					st["day"] = int(g["day"])
					break
			mt.set_state(st)
			mt.ready.connect(func() -> void:
				mt.open_match()
				for i in 24:
					mt._on_pitch(), CONNECT_ONE_SHOT)
			return mt
		"match-mine":
			# ⚠ **주인공이 마운드에 있는 순간을 찍는다.** 등판일이라고 첫 구부터
			# 내가 던지는 게 아니다 — 원정이면 1회말부터고, 불펜이면 한참 뒤다.
			# 그냥 찍으면 선택 화면이 없는 그림이 나온다
			var mm: AppRoot = APP.instantiate()
			var st3 := World.new_game({"seed": 777, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			var me_id: String = st3["protagonist"]["id"]
			for g in st3["schedule"]:
				if not g["is_protagonist_game"]:
					continue
				var probe: Dictionary = LiveMatch.open(st3, g)
				if not probe["ok"]:
					continue
				# 이 경기 어딘가에서 내가 던지나 — 실제로 돌려서 본다
				var r := RandomNumberGenerator.new()
				r.seed = probe["seed"]
				var found: bool = false
				for i in 400:
					if String(probe["state"].get("pitcher", {}).get("id", "")) == me_id:
						found = true
						break
					if LiveMatch.pitch(probe["state"], probe["ctx"], r) == "GAME_OVER":
						break
				if found:
					st3["day"] = int(g["day"])
					break
			mm.set_state(st3)
			mm.ready.connect(func() -> void:
				mm.open_match()
				while not MatchVm.build(mm.match_state()["state"],
						mm.match_state()["ctx"])["is_my_pitch"]:
					if mm.match_state()["state"].get("is_finished", false):
						break
					mm._on_pitch()
				# 내가 던지는 상태에서 몇 구 더 — 로그와 성적이 채워진 그림이 낫다
				for i in 6:
					mm._on_pitch(), CONNECT_ONE_SHOT)
			return mm
		"match-done":
			var md: AppRoot = APP.instantiate()
			var st2 := World.new_game({"seed": 777, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			for g in st2["schedule"]:
				if g["is_protagonist_game"]:
					st2["day"] = int(g["day"])
					break
			md.set_state(st2)
			md.ready.connect(func() -> void:
				md.open_match()
				md._on_auto(), CONNECT_ONE_SHOT)
			return md
		"me-played":
			# 경기를 몇 개 치른 뒤의 "나" 탭 — 시즌 성적이 실제로 쌓였는지 본다
			var mpl: AppRoot = APP.instantiate()
			var mps := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			# ⚠ **주인공 등판 뒤여야 성적이 있다.** 고교 개막이 64일차라
			# 첫날부터 진행하면 내 기록은 계속 빈칸이다
			var mfirst: int = 999
			for g in mps["schedule"]:
				if g["is_protagonist_game"]:
					mfirst = mini(mfirst, int(g["day"]))
			mps["day"] = mfirst
			mpl.set_state(mps)
			mpl.ready.connect(func() -> void:
				for i in 6:
					await mpl.advance(30)
				mpl.screen()._on_tab(1)
				# "나" 탭 안의 "기록" 하위 탭 — 시즌 성적이 거기 있다
				await mpl.get_tree().process_frame
				for n in mpl.screen().find_children("*", "StatusScreen", true, false):
					n._on_tab(1), CONNECT_ONE_SHOT)
			return mpl
		"season-end":
			# 시즌 마지막 날로 보내 "시즌 종료"를 실제로 누른다
			var se: AppRoot = APP.instantiate()
			var sst := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			sst["day"] = int(sst["season_days"])
			se.set_state(sst)
			se.ready.connect(func() -> void: se._on_season_end(), CONNECT_ONE_SHOT)
			return se
		"season-digest":
			# ⚠ **화면 확인은 fixture로 한다.** 진짜 시즌을 돌리면 등판일마다
			# 멈춰서 스크린샷 전에 안 끝난다 — 진짜 데이터로 도는지는 검사가 본다
			var sd: SeasonEndScreen = SEASON_END.instantiate()
			sd.set_view_model(SeasonEndVm.build(Fixtures.season_digest()))
			return sd
		"draft-board":
			# ⚠ **진짜 세계로 연다.** 손으로 만든 사전이면 "라운드가 열한 개다"
			# 같은 실제 모양을 못 본다 — 시즌을 한 번 끝내 진짜 지명을 만든다
			var db: DraftBoardScreen = DRAFT_BOARD.instantiate()
			var dbs := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			for g in dbs["schedule"]:
				g["result"] = {"home_score": 3, "away_score": 1, "winner": g["home"]}
			SeasonRunner.finish_season(dbs)
			db.set_view_model(DraftBoardVm.build(dbs, 2027))
			return db
		"draft-board-empty":
			var de: DraftBoardScreen = DRAFT_BOARD.instantiate()
			de.set_view_model(DraftBoardVm.build({"protagonist": {}}, 2027))
			return de
		"academics":
			# ⚠ **진짜 세계로, 진짜 탭으로 연다.** 한 학기를 실제로 돌려
			# 학점·경고·학기 기록이 쌓인 뒤를 본다
			var ac: AppRoot = APP.instantiate()
			var ast := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			ast["protagonist"]["league_id"] = "LEAGUE_UNIVERSITY"
			ac.set_state(ast)
			ac.ready.connect(func() -> void:
				# ⚠ **주 처리를 직접 돌린다.** `advance`로 가면 등판일마다
				# 멈춰서 중간고사(11주)에 닿기 전에 스크린샷이 끝난다 —
				# 실제로 2주차에서 멈췄다(`season-digest`와 같은 이유).
				# ⚠ **날짜를 옮기고 사전을 다시 만든다.** `_apply_one_week`은
				# 둘 다 안 건드려서 그냥 찍으면 1주차 그림이 나온다
				for w in range(1, 13):
					ac._apply_one_week(w * 7)
				ac.state()["day"] = 12 * 7
				ac._refresh()
				ac.screen()._on_tab(1)
				await ac.get_tree().process_frame
				for n in ac.screen().find_children("*", "StatusScreen", true, false):
					n.select_tab(3), CONNECT_ONE_SHOT)
			return ac
		"people":
			# ⚠ **진짜 세계로, 진짜 탭으로 연다.** 손으로 만든 사전이면 코치가
			# 몇 명인지 이름이 붙는지 같은 실제 모양을 못 본다
			var pp: AppRoot = APP.instantiate()
			var pst := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			RelationshipRunner.reconcile(pst, 7)
			# ⚠ **처음엔 전원이 중립이다** — 규칙이 그렇다(편차 ±10은 중립 폭
			# 안이다). 그대로 찍으면 알약 일곱 색 중 하나만 보이므로 시즌
			# 총평을 몇 번 돌려 실제로 갈라지게 한다
			for i in 3:
				RelationshipRunner.run_season(pst, 2.20, 0.05, true, 7)
			# ⚠ **두 칸을 다 본다.** 팀을 옮기면 옛 사람들이 "지난 인연"으로
			# 간다 — `reconcile`이 소속 바뀜을 스스로 알아본다
			for t in World.teams_of("LEAGUE_HIGHSCHOOL"):
				if String(t["id"]) != String(pst["protagonist"]["team_id"]):
					pst["protagonist"]["team_id"] = String(t["id"])
					break
			RelationshipRunner.reconcile(pst, 14)
			pp.set_state(pst)
			pp.ready.connect(func() -> void: pp.screen()._on_tab(4), CONNECT_ONE_SHOT)
			return pp
		"people-empty":
			var pe: PeopleScreen = PEOPLE.instantiate()
			pe.set_view_model(PeopleVm.build({"protagonist": {}}))
			return pe
		"season-end-before":
			var sb: AppRoot = APP.instantiate()
			var sbt := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			sbt["day"] = int(sbt["season_days"])
			sb.set_state(sbt)
			return sb
		"training":
			# 실제 새 게임에서 훈련 화면을 연다 — 손으로 만든 사전이 아니다
			var tr: AppRoot = APP.instantiate()
			tr.set_state(World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"}))
			tr.ready.connect(func() -> void: tr._on_training(), CONNECT_ONE_SHOT)
			return tr
		"training-picking":
			# 슬롯을 눌러 고르는 중 — 선택지가 실제로 뜨는지 본다
			var tp: AppRoot = APP.instantiate()
			var tps := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			# 이미 짜둔 계획이 있는 상태 — 비우기 버튼도 같이 본다
			tps["training_plan"] = {"primary": "TRN_VEL", "secondary": "TRN_MOVEMENT"}
			tps["protagonist"]["fatigue"] = 66.0
			tp.set_state(tps)
			tp.ready.connect(func() -> void:
				tp._on_training()
				tp.training_screen()._on_slot("secondary2"), CONNECT_ONE_SHOT)
			return tp
		"app-running":
			# 진행 중 표시 — 실제로 그 상태를 만들어 찍는다
			var b: AppRoot = APP.instantiate()
			b.set_state(Fixtures.main_state())
			b.ready.connect(func() -> void: b.screen().set_progress(2, 5), CONNECT_ONE_SHOT)
			return b
		_:
			return null
