extends RefCounted
class_name Fixtures

## 화면용 가짜 데이터 — **검사와 스크린샷이 같은 걸 쓴다.**
##
## ⚠ 둘이 다르면 "검사는 통과하는데 화면은 깨지는" 상태가 된다.
## 이전 프로젝트에서 하네스의 시작 능력치가 게임과 달라 **없는 결함을
## 만들어낸 적**이 있다(하네스 `PITCHING`이 화면 프리셋과 어긋남).
##
## 값은 실측에 맞춘다 — 고교말 OVR 중앙 75, 시즌 이닝 52, ERA 4.8 근처.


static func status_vm() -> Dictionary:
	return {
		"team_name": "제주 애월고",
		"league_short": "고교",
		"injury": {
			"severity": "moderate",
			"severity_label": "중등도",
			"name": "팔꿈치 염증",
			"weeks_left": 3,
			"weeks_total": 6,
		},
		"injury_history": [
			{"year": 2027, "week": 18, "name": "어깨 염증", "severity": "moderate", "severity_label": "중등도"},
			{"year": 2026, "week": 33, "name": "물집", "severity": "light", "severity_label": "경상"},
		],
		"contract": {
			"salary_text": "3,000만원",
			"remaining_text": "2년 (만료: 2030년)",
			"fa_text": "7년 후",
		},
		"pitches": [
			{"name": "포심", "grade": 4},
			{"name": "슬라이더", "grade": 3},
			{"name": "체인지업", "grade": 2},
		],
		"pitching": [
			{"name": "구위", "value": 78.0},
			{"name": "커맨드", "value": 72.0},
			{"name": "제구", "value": 69.0},
			{"name": "무브먼트", "value": 66.0},
			{"name": "스태미나", "value": 71.0},
			{"name": "멘탈", "value": 64.0},
			{"name": "회복", "value": 58.0},
		],
		"season_title": "2028년 시즌 누적",
		"season_stats": [
			{"name": "등판", "value": "11경기"},
			{"name": "이닝", "value": "52.3"},
			{"name": "평균자책", "value": "4.83"},
			{"name": "탈삼진", "value": "47"},
			{"name": "볼넷", "value": "19"},
			{"name": "승-패", "value": "5승 3패"},
		],
		"career": [
			{"year": 2028, "team": "제주 애월고", "stat_line": "5승 3패 ERA 4.83 52.3이닝 47K", "awards": ["다승왕"]},
			{"year": 2027, "team": "제주 애월고", "stat_line": "4승 4패 ERA 4.88 52.8이닝 41K", "awards": []},
			{"year": 2026, "team": "제주 애월고", "stat_line": "3승 5패 ERA 4.54 54.0이닝 38K", "awards": []},
		],
		# 하위 탭 목록도 사전이 정한다 — 학업은 학교에 다닐 때만 뜬다
		"tabs": StatusVm.TABS + [{"id": "academics", "label": "학업"}],
		"academics": AcademicsVm.build({
			"day": 7 * 30, "season_year": 2028,
			"protagonist": {"id": "ME", "league_id": "LEAGUE_UNIVERSITY"},
			"school": {"major": "체육교육", "study_mode": "focus",
				"warning_level": 1, "gpa": 2.35, "gpa_terms": 3},
			"academic_log": [
				{"day": 77, "year": 2028, "exam": "midterm", "gpa": 1.4,
					"warning_level": 1, "label": "학사 경고"},
			],
			"campus_log": [{"day": 224, "kind": "showcase", "selected": true}],
		}),
	}


## 부상 없고 기록도 없는 상태 — 새 게임 첫 주.
## 빈 값에서 화면이 안 깨지는지 보는 용도다
static func status_vm_empty() -> Dictionary:
	return {
		"team_name": "제주 애월고",
		"league_short": "고교",
		"injury": {},
		"injury_history": [],
		"contract": {},
		"pitches": [],
		"pitching": [
			{"name": "구위", "value": 70.0},
			{"name": "커맨드", "value": 70.0},
		],
		"season_stats": [],
		"career": [],
		"tabs": StatusVm.TABS,
		"academics": AcademicsVm.build({"protagonist": {"id": "ME"}}),
	}


## 진행 화면용 **상태**. ViewModel이 아니라 상태다 —
## 스크린샷도 검사도 `MainVm.build()`를 거쳐야 실제 경로와 같아진다
static func main_state() -> Dictionary:
	return {
		"day": 10, "season_days": 350, "season_year": 2027,
		"protagonist": {
			# ⚠ **`team_id`를 빠뜨리면 조용히 뒤집힌다.** 실제로 그랬다 —
			# 홈 경기가 전부 "원정"이 되고 승이 패로 찍혔다. 오류도 로그도
			# 안 나고 화면을 띄워야만 보인다
			"name": "김한결", "team_id": "TEAM_A", "team_name": "제주 애월고",
			"condition": 72.0, "injury": null, "eligibility_blocked": false,
			"retired": false,
			# ⚠ **능력치가 없으면 캡처에 OVR 0이 뜬다.** U-3에서 "내 능력치를
			# 어디에서도 안 보여준다"고 붙인 자리인데, 픽스처가 비어 있어서
			# **띄워 봐도 되는지 안 되는지를 알 수 없었다** — 실제로 0으로
			# 찍혀 있었다. 포지션도 있어야 투수 OVR로 갈린다
			"position": "SP", "fatigue": 34.0,
			"pitching": {"ovr": 61.0, "velocity": 70.0, "control": 68.0,
				"command": 66.0, "movement": 62.0, "stamina": 64.0, "mental": 60.0},
		},
		"team_names": {
			"TEAM_A": "제주 애월고", "TEAM_B": "서귀포고",
			"TEAM_C": "한림고", "TEAM_D": "제주일고",
		},
		"schedule": [
			# 치른 것 · 놓친 것 · 오늘 · 예정이 한 화면에 다 보이게
			{"id": "G03", "day": 3, "is_protagonist_game": true,
				"home": "TEAM_A", "away": "TEAM_C",
				"result": {"home_score": 4, "away_score": 2, "winner": "TEAM_A"}},
			{"id": "G06", "day": 6, "is_protagonist_game": true,
				"home": "TEAM_D", "away": "TEAM_A",
				"result": {"home_score": 5, "away_score": 1, "winner": "TEAM_D"}},
			{"id": "G08", "day": 8, "is_protagonist_game": true,
				"home": "TEAM_A", "away": "TEAM_B",
				"result": {"home_score": 2, "away_score": 2, "winner": ""}},
			{"id": "G09", "day": 9, "is_protagonist_game": true,
				"home": "TEAM_B", "away": "TEAM_A", "result": null},
			{"id": "G15", "day": 15, "is_protagonist_game": true,
				"home": "TEAM_A", "away": "TEAM_B", "result": null},
			{"id": "G22", "day": 22, "is_protagonist_game": true,
				"home": "TEAM_C", "away": "TEAM_A", "result": null},
			{"id": "G12", "day": 12, "is_protagonist_game": false,
				"home": "TEAM_C", "away": "TEAM_D", "result": null},
		],
		"pending": [],
		"mailbox": [
			{"id": "M1", "category": "manager", "sender": "감독",
				"subject": "다음 등판 준비", "preview": "월요일 불펜 피칭 잡아두마.",
				"day": 9, "read": false, "decision": null},
			{"id": "M2", "category": "news", "sender": "스포츠조선",
				"subject": "제주 애월고, 개막 3연전 1승 1무 1패",
				"preview": "선발진이 버텼지만 타선이 침묵했다.",
				"day": 8, "read": false, "decision": null},
			{"id": "M3", "category": "coach", "sender": "투수코치",
				"subject": "훈련 방향을 정하자",
				"preview": "제구를 먼저 잡을지, 구속을 올릴지 골라라.",
				"day": 7, "read": true, "decision": {"selected": null}},
			{"id": "M4", "category": "system", "sender": "시스템",
				"subject": "2027 시즌이 시작되었습니다",
				"preview": "고교 3학년 시즌입니다.",
				"day": 1, "read": true, "decision": null},
		],
	}


## 등판 당일 — 진행 버튼이 잠기고 "오늘 등판"이 강조되는 상태
static func main_state_gameday() -> Dictionary:
	var s: Dictionary = main_state()
	s["day"] = 15
	return s



## ⚠ **진짜 세계를 굴린 상태.** 순위표·성적은 경기가 실제로 치러져야
## 뜻이 있다 — 손으로 만든 사전으로 찍으면 화면만 보고 이어졌다고 믿게 된다
static func played_state(days: int = 40) -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	# ⚠ **게임이 실제로 타는 경로로 굴린다.** MatchDay.play_day를 직접
	# 부르면 시즌 성적이 안 쌓인다 — 그걸 쌓는 것은 GameSim.play다.
	# 그래서 스탯 순위 화면이 픽스처에선 늘 비어 있었다
	for g in s["schedule"]:
		if int(g.get("day", 0)) > days:
			continue
		GameSim.play(g, s)
	s["day"] = days + 1
	s["league_tab"] = "LEAGUE_KBL"
	return s


## 결산 화면용 사전. **스크린샷 확인에 쓴다** — 진짜 시즌을 돌리면
## 등판일마다 멈춰서 스크린샷 전에 안 끝난다
static func season_digest() -> Dictionary:
	return {
		"year": 2027,
		"summary": {"graduated": 1420, "drafted": 110, "placed": 400,
			"gave_up": 900, "demoted": 110, "released": 110, "freshmen": 1420,
			"retired": 0},
		"league_id": "LEAGUE_HIGHSCHOOL",
		"team_id": "TEAM_HS_AEWOL", "team_name": "애월고",
		# G-1b · G-1c · G-1d로 붙은 절들. **화면이 어떻게 생겼는지 보려면
		# 값이 있어야 한다** — 새 게임 첫 해는 대회도 수상도 비어 있어서
		# 캡처에 절이 하나도 안 뜬다
		"tournaments": [
			{"name": "황금사자기", "champion": "유성고", "reached": "4강"},
			{"name": "청룡기", "champion": "애월고", "reached": "우승"},
		],
		"team_best": {
			"pitcher": {"name": "김한결", "era": 2.31, "w": 7, "ip": 88.0},
			"batter": {"name": "오재훈", "avg": 0.341, "hr": 6, "rbi": 28},
		},
		"team_games": [
			{"week": 3, "is_home": true, "opponent": "유성고",
				"my_score": 5, "opp_score": 2},
			{"week": 5, "is_home": false, "opponent": "백호고",
				"my_score": 1, "opp_score": 4},
			{"week": 7, "is_home": true, "opponent": "한라고",
				"my_score": 7, "opp_score": 0},
			{"week": 9, "is_home": false, "opponent": "서귀고",
				"my_score": 3, "opp_score": 3},
		],
		"my_record": {"year": 2027, "ovr": 63, "ps_result": "champion",
			"stat_line": "7승 2패 ERA 2.31 88.0이닝 91K",
			"game_log": [
				{"day": 69, "opponent_id": "유성고", "my_score": 5, "opp_score": 2,
					"ip": 6.0, "er": 2.0, "h": 5.0, "k": 7.0, "bb": 1.0, "pc": 95},
				{"day": 78, "opponent_id": "백호고", "my_score": 1, "opp_score": 4,
					"ip": 5.1, "er": 4.0, "h": 8.0, "k": 3.0, "bb": 3.0, "pc": 88},
				{"day": 91, "opponent_id": "한라고", "my_score": 7, "opp_score": 0,
					"ip": 9.0, "er": 0.0, "h": 3.0, "k": 12.0, "bb": 0.0, "pc": 108},
			]},
		"my_awards": ["MVP", "탈삼진 (91)"],
		"awards": {"awards": [
			{"label": "다승", "player_id": "김한결", "value_text": "7"},
			{"label": "평균자책", "player_id": "박도윤", "value_text": "1.87"},
			{"label": "탈삼진", "player_id": "김한결", "value_text": "91"},
		], "mvp": ["김한결"]},
		"standings": {"rows": [
			{"team_id": "TEAM_X", "team_name": "유성고", "wins": 15, "losses": 5,
				"draws": 0, "pct_label": ".750"},
			{"team_id": "TEAM_HS_AEWOL", "team_name": "애월고", "wins": 12,
				"losses": 8, "draws": 0, "pct_label": ".600"},
			{"team_id": "TEAM_Y", "team_name": "백호고", "wins": 8, "losses": 12,
				"draws": 0, "pct_label": ".400"},
		]},
	}
