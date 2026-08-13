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
	}


## 진행 화면용 **상태**. ViewModel이 아니라 상태다 —
## 스크린샷도 검사도 `MainVm.build()`를 거쳐야 실제 경로와 같아진다
static func main_state() -> Dictionary:
	return {
		"day": 10, "season_days": 350, "season_year": 2027,
		"protagonist": {
			"name": "김한결", "team_name": "제주 애월고",
			"condition": 72.0, "injury": null, "eligibility_blocked": false,
			"retired": false,
		},
		"schedule": [
			{"id": "G15", "day": 15, "is_protagonist_game": true,
				"home": "TEAM_A", "away": "TEAM_B", "result": null},
			{"id": "G12", "day": 12, "is_protagonist_game": false,
				"home": "TEAM_C", "away": "TEAM_D", "result": null},
		],
		"pending": [],
		"mailbox": [
			{"id": "M1", "read": false},
			{"id": "M2", "read": false},
			{"id": "M3", "read": true},
		],
	}


## 등판 당일 — 진행 버튼이 잠기고 "오늘 등판"이 강조되는 상태
static func main_state_gameday() -> Dictionary:
	var s: Dictionary = main_state()
	s["day"] = 15
	return s
