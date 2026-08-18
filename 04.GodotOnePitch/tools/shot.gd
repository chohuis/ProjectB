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

	DisplayServer.window_set_title("OnePitch — %s" % which)

	# ⚠ **게임이 켤 때 하는 것을 여기서도 한다.** 안 하면 저장된 톤을 무시하고
	# 늘 기본 색으로 찍혀서 **캡처가 실제 화면과 다르다** — 밝은 톤을 넣고도
	# 어두운 캡처를 보고 "안 걸렸나" 했다. 계측이 게임 경로를 안 재는 것과
	# 같은 형태다
	App.apply_theme()

	var win := get_root()
	var screen: Control = _build(which)
	if screen == null:
		print("모르는 화면: %s" % which)
		quit(2)
		return
	win.add_child(screen)

	# ⚠ **창 크기는 `DisplayServer`로 바꾼다.** 루트 뷰포트의 `size`에 직접
	# 넣으면 실제 창은 안 따라오고, 찍힌 그림이 기본 크기(1152×648)로 나온다.
	#
	# ⚠ **구장은 1:1로 띄운다.** 축소된 그림으로는 좌표가 몇 px 어긋났는지를
	# 못 잰다 — 눈으로 "위쪽에 걸려 있다"까지만 보이고 수치가 안 나온다.
	#
	# ⚠ **프레임을 돌린 뒤에 정한다.** `App._ready`가 저장된 설정을 창에
	# 물리므로(U-4), 먼저 정하면 그게 덮어써서 **캡처 크기가 사용자 설정에
	# 따라 달라진다** — 바이트를 견줘 결함을 잡아 온 방식이 통째로 무너진다.
	# 실측: 먼저 정했더니 1440이 아니라 1600으로 찍혔다
	var want := Vector2i(1000, 920) if which.begins_with("park") \
		else Vector2i(1440, 900)

	# ⚠ **한 번 그리게 만든 뒤에 찍는다.** `process_frame`을 두 번 기다려도
	# 실제 렌더는 아직일 수 있어서 회색 판만 나왔다. 프레임을 넉넉히 돌리고
	# 마지막에 강제로 한 번 그린다
	# ⚠ **진행을 거치는 갈래가 있다.** `advance`가 프레임을 넘기므로
	# 몇 프레임만 기다리면 진행 중인 화면을 찍는다
	for i in 240:
		await process_frame

	DisplayServer.window_set_size(want)
	for i in 8:
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
const NEW_GAME := preload("res://ui/screens/new_game_screen.tscn")
const MAIN := preload("res://ui/screens/main_screen.tscn")
const APP := preload("res://ui/app_root.tscn")
const APP_ENTRY := preload("res://ui/app.tscn")
const SEASON_END := preload("res://ui/screens/season_end_screen.tscn")
const DRAFT_BOARD := preload("res://ui/screens/draft_board_screen.tscn")
const PEOPLE := preload("res://ui/screens/people_screen.tscn")
const RETIREMENT := preload("res://ui/screens/retirement_screen.tscn")
const PLAYER_DETAIL := preload("res://ui/screens/player_detail_screen.tscn")
const TEAM_DETAIL := preload("res://ui/screens/team_detail_screen.tscn")
const DECISION := preload("res://ui/screens/decision_screen.tscn")


## 주인공이 아닌 팀동료 하나. **주인공을 찍으면 "나" 탭으로 가야 하는
## 화면이라** 상세가 안 열린다 — 캡처가 빈 화면이 된다
func _other_player(state: Dictionary) -> String:
	var p: Dictionary = state.get("protagonist", {})
	for x in World.roster_of(state.get("world", {}), String(p.get("team_id", ""))):
		if String(x.get("id", "")) != String(p.get("id", "")):
			return String(x.get("id", ""))
	return ""


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
		# 선수 정보 카드 (F-6b). **진짜 새 게임으로 만든다** — 픽스처에
		# 손으로 박으면 배선이 죽어도 화면엔 나온다
		"status-profile":
			return _screen(StatusVm.build(NewGameVm.start({
				"seed": 20270101, "season_year": 2027, "name": "김한결",
				"team_id": "TEAM_HS_AEWOL", "handedness": "L",
				"pitching_form": "sidearm", "birth_month": 7, "birth_day": 9})))
		# 새 게임 화면 (F-6b) — 방향 · 폼 · 생년월일 입력
		"new-game":
			return NEW_GAME.instantiate()
		"main":
			return _main(Fixtures.main_state())
		"main-gameday":
			return _main(Fixtures.main_state_gameday())
		# 코치 리포트 (F-8 · F-8b). **선택지가 든 소식을 만드는 곳이 없었다**
		"news-decision":
			var cr: AppRoot = APP.instantiate()
			var cs := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			# 피로를 물려 회복 갈래가 나오게 한다 — 기본 상태로는 "루틴 유지"만 뜬다
			cs["protagonist"]["fatigue"] = 72.0
			cs["day"] = 21
			CoachReport.push(cs, 3, 21)
			cr.set_state(cs)
			cr.ready.connect(func() -> void:
				cr.screen().show_tab("news"), CONNECT_ONE_SHOT)
			return cr
		# 계약 협상 (F-2b). **04는 "계약한다 / 거절한다" 둘뿐이었다**
		# 병역 물음 둘 — 04는 여태 조용히 정했다. 02는 묻는다
		"sports-unit", "enlist":
			var ms: Dictionary = World.new_game({"seed": 20270101,
				"season_year": 2033, "name": "김한결",
				"team_id": "TEAM_HS_AEWOL"})
			var mp: Dictionary = ms["protagonist"]
			mp["league_id"] = "LEAGUE_KBL"
			mp["team_id"] = "TEAM_KBL_SEOUL_ROYALS_1"
			mp["career_stage"] = "pro"
			mp["age"] = 26 if which == "sports-unit" else 28
			Pending.push(ms, {"type": "sports_unit_apply" \
				if which == "sports-unit" else "military_enlist_ask"})
			var mds: DecisionScreen = DECISION.instantiate()
			mds.set_view_model(DecisionVm.build(ms))
			return mds
		"negotiation":
			var ns: Dictionary = World.new_game({"seed": 20270101,
				"season_year": 2031, "name": "김한결",
				"team_id": "TEAM_HS_AEWOL"})
			var np: Dictionary = ns["protagonist"]
			np["league_id"] = "LEAGUE_KBL"
			np["team_id"] = "TEAM_KBL_SEOUL_ROYALS_1"
			np["salary"] = 20000
			np["pro_service_years"] = 5
			np["age"] = 27
			np["fame"] = 40.0
			# ⚠ **제시액을 손으로 박지 않는다.** 박으면 시장가와 동떨어져
			# "시장가 대비 391%" 같은 값이 뜬다 — 구단이 실제로 내게 한다
			np["salary"] = Contract.protagonist_market(np)
			Pending.push(ns, {
				"type": "salary_negotiation",
				"team_id": "TEAM_KBL_SEOUL_ROYALS_1", "league_id": "LEAGUE_KBL",
				"offered_salary": ContractDecision.offer_salary_for(ns, np),
				"duration_years": 2,
				"min_duration_years": 1, "max_duration_years": 3,
				"signing_bonus": 5000, "context": "renewal"})
			var ds: DecisionScreen = DECISION.instantiate()
			ds.set_view_model(DecisionVm.build(ns, {"ratio": 0.08}))
			return ds
		# 팀 상세 (F-4b · F-3b). **구단 성향 열두 축이 F-3으로 살았다** —
		# 그 전엔 아홉 축이 50이라 모든 팀이 같은 그림이었다
		"team-detail":
			var ts: Dictionary = World.new_game({"seed": 20270101,
				"season_year": 2027, "name": "김한결",
				"team_id": "TEAM_HS_AEWOL"})
			var td: TeamDetailScreen = TEAM_DETAIL.instantiate()
			td.set_view_model(TeamDetailVm.build(ts, "TEAM_KBL_SEOUL_ROYALS_1"))
			return td
		# 선수 상세 (F-4a). **진짜 세계에서 뽑는다** — 가짜 사전으로 찍으면
		# 이름표가 새는지·OVR이 0인지를 못 본다(F-5에서 둘 다 실제로 났다)
		"player-detail":
			var st: Dictionary = World.new_game({"seed": 20270101,
				"season_year": 2027, "name": "김한결",
				"team_id": "TEAM_HS_AEWOL"})
			var pd: PlayerDetailScreen = PLAYER_DETAIL.instantiate()
			pd.set_view_model(PlayerDetailVm.build(st, _other_player(st)))
			return pd
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
		"news-detail":
			# 🔴 **본문을 볼 길이 없던 자리다.** `sim/` 여덟 파일 열여섯
			# 자리가 여러 줄 본문을 쓰는데 04는 미리보기만 그렸다.
			# ⚠ **갈래가 그 상태를 못 잡으면 갈래를 새로 만든다**
			var nd: AppRoot = APP.instantiate()
			var st: Dictionary = Fixtures.main_state()
			var lines: Array[String] = [
				"2033년 체육부대 입대 후보로 거론되는 명단입니다.",
				"실제 신청자는 다를 수 있습니다.", ""]
			for i in 12:
				lines.append("%d위  선수%02d  OVR %d" % [i + 1, i, 92 - i])
			st["mailbox"] = [{
				"id": "SHOT1", "category": "news", "sender": "스포츠조선",
				"subject": "2033 체육부대 입대 후보 루머",
				"preview": "이번 시즌 체육부대 후보가 거론되고 있습니다.",
				"body": "\n".join(lines), "day": 300, "read": false,
				"decision": null}]
			st["news_open_id"] = "SHOT1"
			nd.set_state(st)
			return nd
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
		"settings":
			# ⚠ **창 크기를 바꿀 유일한 자리** (U-4). 04엔 설정이 아예 없었다
			var st: App = APP_ENTRY.instantiate()
			st.ready.connect(func() -> void: st.show_settings(), CONNECT_ONE_SHOT)
			return st
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
		"match-briefing":
			# 경기 전 브리핑 (F-5). **첫 공을 안 던진 상태로 찍는다** —
			# 던지면 사라지는 자리라 `match` 갈래로는 안 잡힌다
			var mb: AppRoot = APP.instantiate()
			var mbs := World.new_game({"seed": 777, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			for g in mbs["schedule"]:
				if g["is_protagonist_game"]:
					mbs["day"] = int(g["day"])
					break
			mb.set_state(mbs)
			mb.ready.connect(func() -> void: mb.open_match(), CONNECT_ONE_SHOT)
			return mb
		# 관전 중 (M-4). **내가 안 던지는 순간을 찍는다** — 상대 공격이
		# 끝나 우리가 치는 동안이다. 그때 화면이 무슨 말을 하는지가 요점이라
		# `match-mine`(내가 던지는 순간)으로는 안 잡힌다
		"match-watch":
			var mw: AppRoot = APP.instantiate()
			var mws := World.new_game({"seed": 777, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			var mw_id: String = mws["protagonist"]["id"]
			for g in mws["schedule"]:
				if g["is_protagonist_game"]:
					mws["day"] = int(g["day"])
					break
			mw.set_state(mws)
			mw.ready.connect(func() -> void:
				mw.open_match()
				# 내가 안 던지는 상태가 될 때까지 — 상대 투수 차례가 온다
				for i in 400:
					var st: Dictionary = mw.match_state()["state"]
					if st.get("is_finished", false):
						break
					if String(st.get("pitcher", {}).get("id", "")) != mw_id:
						break
					mw._on_pitch(), CONNECT_ONE_SHOT)
			return mw
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
		"status-injury":
			# ⚠ **부상 이력 카드가 진짜 게임에서 뜨는지 본다** (U-1).
			# 예전엔 `injury_history`를 아무도 안 채워서 이 카드가 영영 안 붙었다 —
			# fixture 캡처(`status`)에는 보였기 때문에 눈으로는 못 잡았다.
			#
			# ⚠ **다치고 낫기까지 기다린다.** 부상은 무작위라 몇 주로는 안 나온다.
			# 이력에 한 줄이 생길 때까지 돌리고, 안 생기면 그대로 찍는다 —
			# 그것도 결과다
			var si: AppRoot = APP.instantiate()
			var sis := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			# ⚠ **피로를 높게 물린다.** 그냥 돌리면 120주를 가도 안 다친다 —
			# 실제로 그렇게 나왔고 캡처가 빈 채로 찍혔다. 부상 확률은 피로를
			# 보므로 벼랑 위에 올려 둬야 이 경로가 돈다
			var healed_at: int = 0
			for w in range(1, 121):
				sis["protagonist"]["fatigue"] = 95.0
				WeekRunner.run(sis, w * 7)
				for e in sis.get("body_log", []):
					if String(e.get("kind", "")) == "healed":
						healed_at = w
						break
				if healed_at > 0:
					sis["day"] = w * 7
					break
			print("부상 완치 주차: %d · body_log %d줄" % [
				healed_at, sis.get("body_log", []).size()])
			si.set_state(sis)
			# ⚠ **`_refresh()`를 덧부르지 않는다.** `set_state`가 이미 그린다 —
			# 덧부르면 탭 강조가 0번으로 돌아가 "소식이 켜졌는데 나 탭이 보이는"
			# 그림이 나온다
			si.ready.connect(func() -> void:
				si.screen()._on_tab(1), CONNECT_ONE_SHOT)
			return si
		"status-military":
			# ⚠ **복무 중인 "나" 탭** (U-2). `Military.enlist`를 실제로 거친다 —
			# 손으로 사전을 만들면 어느 키를 안 채우는지가 안 드러난다
			var sm: AppRoot = APP.instantiate()
			var sms := World.new_game({"seed": 20270101, "season_year": 2033,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			var smp: Dictionary = sms["protagonist"]
			smp["age"] = 24
			smp["league_id"] = "LEAGUE_KBL"
			smp["career_stage"] = "pro"
			Military.enlist(sms, "sports", 7)
			# 40주쯤 복무한 시점 — 남은 주가 보이는 자리다
			smp["military_service_weeks"] = 40
			sm.set_state(sms)
			sm.ready.connect(func() -> void:
				sm.screen()._on_tab(1), CONNECT_ONE_SHOT)
			return sm
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
		"park", "park-pro", "park-univ", "park-hs":
			# ⚠ **1:1로 띄운다** — 좌표가 viewbox 단위(1000×920)와 같은 크기로
			# 그려져야 "그림보다 몇 px 위인가"를 잴 수 있다 (D-6)
			var pk: BaseballField = preload(
				"res://ui/parts/baseball_field.tscn").instantiate()
			pk.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			# ⚠ **실재하는 구장 id를 넣는다.** 예전엔 `STADIUM_PRO`를 넣었는데
			# `parks.json`의 `tier_of` 27개에 그런 id가 없어서 기본값(프로)으로
			# 떨어졌다 — `park`와 **바이트까지 같은 그림**이 나왔다.
			# 티어가 셋이니 셋을 다 찍어야 좌표 대조(D-6)가 뜻을 갖는다
			var park_ids := {
				"park": "",                              # 미지정 → 프로 기본 그림
				"park-pro": "STADIUM_SEOUL_GUARDIANS",   # 전용 그림이 있는 프로
				"park-univ": "STADIUM_GEUMGANG_UNIV",
				"park-hs": "STADIUM_SEORAK_HS",
			}
			pk.set_view_model(ParkVm.build(String(park_ids[which])))
			return pk
		"retire-ask", "retire-summary":
			# ⚠ **진짜 커리어로 연다.** 통산이 비어 있으면 결산이 뜻이 없다 —
			# 몇 해를 실제로 쌓아 은퇴 시점을 만든다
			var rt: RetirementScreen = RETIREMENT.instantiate()
			var rst := World.new_game({"seed": 20270101, "season_year": 2038,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			var rp: Dictionary = rst["protagonist"]
			rp["age"] = 36
			rp["league_id"] = "LEAGUE_KBL"
			rp["career_history"] = []
			for y in range(2030, 2038):
				rp["career_history"].append({
					"year": y, "team_id": "TEAM_KBL_JEJU",
					"stat_line": "%d승 %d패 ERA %.2f" % [12 - (y - 2030),
						6 + (y - 2030), 3.10 + (y - 2030) * 0.2],
					"stats": {"type": "pitcher", "g": 28,
						"w": 12 - (y - 2030), "sv": 0, "k": 140.0 - (y - 2030) * 8},
					"highlights": ["다승왕"] if y == 2031 else [],
				})
			rp["career_events"] = [
				{"year": 2030, "type": "drafted", "detail": "1라운드 3순위 지명"},
				{"year": 2034, "type": "trade", "detail": "트레이드 이적"},
			]
			Pending.push_once(rst, {"type": "retirement_ask",
				"reason": Retirement.REASON_DECLINE,
				"label": String(Retirement.LABELS[Retirement.REASON_DECLINE]),
				"day": 350})
			if which == "retire-summary":
				Retirement.retire(rst, Retirement.REASON_DECLINE, 350)
				rt.set_summary(RetirementVm.build_summary(rst))
			else:
				rt.set_ask(RetirementVm.build_ask(rst),
					RetirementVm.build_summary(rst))
			return rt
		"achievements":
			# ⚠ **진짜로 몇 주를 돌린다.** 손으로 만든 사전이면 진행도가
			# 실제로 쌓이는지, 딴 것과 안 딴 것이 섞여 보이는지를 못 본다
			var ah: AppRoot = APP.instantiate()
			var ast2 := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			ast2["training_plan"] = {"primary": "TRN_VEL"}
			# ⚠ **경기를 실제로 치러야 야구 업적이 움직인다.** `WeekRunner.run`만
			# 돌리면 경기가 안 치러져 야구 쪽이 전부 0으로 남는다 — 실제로 그랬다
			var afirst: int = 999
			for g in ast2["schedule"]:
				afirst = mini(afirst, int(g["day"]))
			ast2["day"] = afirst
			ah.set_state(ast2)
			ah.ready.connect(func() -> void:
				for i in 6:
					await ah.advance(30)
				ah.screen()._on_tab(1)
				await ah.get_tree().process_frame
				for n in ah.screen().find_children("*", "StatusScreen", true, false):
					n.select_tab(4), CONNECT_ONE_SHOT)
			return ah
		"finance", "finance-bottom":
			# ⚠ **프로로 연다.** 학생은 스폰서가 안 붙어서(아마추어 규정)
			# 화면의 절반이 안 뜬다 — 둘 다 보려면 프로여야 한다
			var fi: AppRoot = APP.instantiate()
			var fst := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			fst["protagonist"]["league_id"] = "LEAGUE_KBL"
			fst["protagonist"]["career_stage"] = "pro"
			fst["protagonist"]["salary"] = 12000
			fst["protagonist"]["fame"] = 62.0
			fst["protagonist"]["money"] = 34000
			fi.set_state(fst)
			fi.ready.connect(func() -> void:
				# 구독을 켜고 몇 주를 돌려 자산 추이를 만든다
				fi._on_subscription("PITCH")
				for w in range(1, 9):
					WeekRunner.run(fi.state(), w * 7)
				fi.state()["day"] = 8 * 7
				fi._refresh()
				fi.screen()._on_tab(1)
				await fi.get_tree().process_frame
				for n in fi.screen().find_children("*", "StatusScreen", true, false):
					n.select_tab(3)
					# ⚠ **아래쪽도 눈으로 본다.** 한 화면에 안 들어가는 카드가
					# 있으면 안 본 채로 "됐다"고 하게 된다
					if which == "finance-bottom":
						await fi.get_tree().process_frame
						n.get_node("Scroll").scroll_vertical = 99999
				, CONNECT_ONE_SHOT)
			return fi
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
				# ⚠ **날짜를 옮기고 사전을 다시 만든다.** `WeekRunner.run`은
				# 둘 다 안 건드려서 그냥 찍으면 1주차 그림이 나온다
				for w in range(1, 13):
					WeekRunner.run(ac.state(), w * 7)
				ac.state()["day"] = 12 * 7
				ac._refresh()
				ac.screen()._on_tab(1)
				await ac.get_tree().process_frame
				for n in ac.screen().find_children("*", "StatusScreen", true, false):
					n.select_tab(3), CONNECT_ONE_SHOT)
			return ac
		# 관계 일곱 색을 한 화면에 (U-8). **자연스럽게 굴려선 다 안 나온다** —
		# 새 게임 첫 해엔 중립·우호뿐이라 이웃이 갈리는지를 못 본다.
		# 라벨 구간마다 값을 하나씩 박아 일곱을 나란히 세운다
		"people-tones":
			var tr: AppRoot = APP.instantiate()
			var tst := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			RelationshipRunner.reconcile(tst, 7)
			# ⚠ **동료 행에만 박는다.** 감독·코치·구단주는 정렬 그룹이 달라
			# 위로 올라가므로, 앞에서부터 박으면 일곱이 흩어져 나란히 안 선다
			var mates: Array = []
			for r in RelationshipRunner.rows_of(tst):
				if String(r.get("kind", "")) == "teammate":
					mates.append(r)
			# 각 라벨 구간의 한가운데 값 — `Relationship.LABELS` 순서대로
			var picks: Array = [-80, -45, -20, 0, 22, 50, 82]
			var kept: Array = []
			for i in mini(picks.size(), mates.size()):
				mates[i]["value"] = picks[i]
				kept.append(mates[i])
			# ⚠ **나머지 동료를 치운다.** 목록이 값 내림차순이라 음수 셋이
			# 35명 뒤로 밀려 한 화면에 안 들어온다 — 일곱만 남겨 나란히 세운다
			var slim: Array = []
			for r in RelationshipRunner.rows_of(tst):
				if String(r.get("kind", "")) != "teammate" or kept.has(r):
					slim.append(r)
			tst[RelationshipRunner.STATE_KEY] = slim
			tr.set_state(tst)
			tr.ready.connect(func() -> void:
				tr.screen().show_tab("people"), CONNECT_ONE_SHOT)
			return tr
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
		"training-pitch":
			# 구종 고르기 (F-1). **커맨드를 올려 둔다** — 새 게임 주인공은 48이라
			# 슬라이더가 잠겨 있어서, 그대로 찍으면 목록이 전부 회색이다
			var tp2: AppRoot = APP.instantiate()
			var tps2 := World.new_game({"seed": 20270101, "season_year": 2027,
				"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
			tps2["protagonist"]["pitching"]["command"] = 60.0
			tps2["training_plan"] = {"primary": "TRN_PITCH_DEV"}
			PitchDev.start(tps2["protagonist"], "slider")
			for w in range(1, 5):
				WeekRunner.run(tps2, w * 7)
			# ⚠ **배우는 도중도 봐야 한다.** 다 배우고 나면 진행 막대가 사라져서
			# "습득 중" 자리가 그림에 안 남는다 — 하나를 더 걸어 둔다
			PitchDev.start(tps2["protagonist"], "curve")
			WeekRunner.run(tps2, 5 * 7)
			tp2.set_state(tps2)
			tp2.ready.connect(func() -> void: tp2._on_training(), CONNECT_ONE_SHOT)
			return tp2
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
