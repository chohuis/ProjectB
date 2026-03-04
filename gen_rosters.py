# -*- coding: utf-8 -*-
import json, random, pathlib

random.seed(20260304)

TEAM_CONFIG = {
    "HS_Seoul_Innovation": {"name": "서울 이노베이션 고", "tier": "powerhouse", "keywords": "데이터·피칭랩", "region": "서울"},
    "HS_Seoul_Prestige": {"name": "서울 프레스티지 고", "tier": "powerhouse", "keywords": "엘리트·육성", "region": "서울"},
    "HS_Busan_Marine": {"name": "부산 마린 고", "tier": "powerhouse", "keywords": "강한 피지컬", "region": "부산"},
    "HS_Suwon_Fusion": {"name": "수원 퓨전 고", "tier": "mid", "keywords": "공수 밸런스", "region": "수원"},
    "HS_Incheon_Sky": {"name": "인천 스카이 고", "tier": "mid", "keywords": "기동력", "region": "인천"},
    "HS_Gwangju_Power": {"name": "광주 파워 고", "tier": "mid", "keywords": "장타·열정", "region": "광주"},
    "HS_Daegu_Spirit": {"name": "대구 스피릿 고", "tier": "developing", "keywords": "근성", "region": "대구"},
    "HS_Gangneung_Wave": {"name": "강릉 웨이브 고", "tier": "developing", "keywords": "투혼", "region": "강릉"}
}
TIER_STATS = {
    "powerhouse": {
        "varsity": {"physical": (24, 2.5), "skill_pitch": (25, 2.5), "skill_hit": (25, 2.5), "mental": (23, 2.0)},
        "junior": {"physical": (21, 2.5), "skill_pitch": (22, 2.5), "skill_hit": (22, 2.5), "mental": (20, 2.0)}
    },
    "mid": {
        "varsity": {"physical": (20, 2.5), "skill_pitch": (21, 2.5), "skill_hit": (21, 2.5), "mental": (19, 2.0)},
        "junior": {"physical": (18, 2.5), "skill_pitch": (18, 2.5), "skill_hit": (18, 2.5), "mental": (17, 2.0)}
    },
    "developing": {
        "varsity": {"physical": (17, 2.5), "skill_pitch": (18, 2.5), "skill_hit": (18, 2.5), "mental": (16, 2.0)},
        "junior": {"physical": (15, 2.5), "skill_pitch": (15, 2.5), "skill_hit": (15, 2.5), "mental": (15, 2.0)}
    }
}

ROSTER_PLAN = {
    "powerhouse": {"varsity_pitchers": 11, "varsity_hitters": 12, "junior_pitchers": 7, "junior_hitters": 7},
    "mid": {"varsity_pitchers": 10, "varsity_hitters": 10, "junior_pitchers": 6, "junior_hitters": 6},
    "developing": {"varsity_pitchers": 9, "varsity_hitters": 9, "junior_pitchers": 5, "junior_hitters": 5}
}

PITCHER_ROLES = [
    ("SP", "에이스 선발", "파워 선발", "varsity", 3.0),
    ("SP", "선발 2선", "균형형", "varsity", 1.5),
    ("SP", "선발 3선", "제구형", "varsity", 0.0),
    ("SP", "선발 4선", "스윙맨", "varsity", 0.0),
    ("SP", "선발 5선", "컨트롤", "varsity", -1.0),
    ("RP", "셋업맨", "강속구", "varsity", 1.0),
    ("RP", "불펜 필승조", "분위기 메이커", "varsity", 0.0),
    ("RP", "좌완 원포인트", "특수", "varsity", 0.0),
    ("RP", "롱릴리프", "안정감", "varsity", -0.5),
    ("RP", "유틸 불펜", "스윙맨", "varsity", -0.5),
    ("CP", "마무리", "클로저", "varsity", 2.0),
    ("SP", "차세대 에이스", "유망주", "junior", 1.0),
    ("SP", "차세대 선발", "컨트롤", "junior", 0.0),
    ("RP", "파워 불펜", "강속구", "junior", 0.0),
    ("RP", "전략 불펜", "변화구", "junior", 0.0),
    ("RP", "재활조", "프로젝트", "junior", -1.0)
]

HITTER_ROLES = [
    ("C", "주전 포수", "리더형", "varsity", 1.5),
    ("C", "백업 포수", "수비형", "varsity", -0.5),
    ("1B", "클린업 1루수", "장타", "varsity", 1.5),
    ("2B", "컨택 2루수", "스몰볼", "varsity", 0.5),
    ("SS", "수비형 유격수", "민첩", "varsity", 0.5),
    ("3B", "코너 파워", "장타", "varsity", 0.5),
    ("LF", "중장거리 LF", "밸런스", "varsity", 0.0),
    ("CF", "테이블세터 CF", "주루", "varsity", 0.5),
    ("RF", "거포 RF", "장타", "varsity", 1.0),
    ("DH", "지명타자", "클러치", "varsity", 0.5),
    ("UTIL", "슈퍼 서브", "유틸", "varsity", 0.0),
    ("3B", "백업 코너", "육성", "varsity", -0.5),
    ("C", "1군 콜업 후보", "유망주", "junior", 0.0),
    ("IF", "멀티 내야", "스몰볼", "junior", 0.0),
    ("OF", "발 빠른 외야", "주루", "junior", 0.0),
    ("1B", "파워 유망주", "장타", "junior", 0.0),
    ("UTIL", "다재다능", "밸런스", "junior", 0.0)
]
System.Management.Automation.Runspaces.PipelineReader`1+<GetReadEnumerator>d__20[System.Object]
