# -*- coding: utf-8 -*-
"""
High-school roster generator
----------------------------
Creates structured JSON data for eight selectable schools.
Output layout (per team):
  00.OneF/00.Planning/Stage_Rules/HighSchool_Rosters/<TEAM_ID>/
      team_overview.json   # meta + staff
      roster_varsity.json  # 1군 선수 상세
      roster_junior.json   # 2군/육성 선수 상세
An index.json file summarises all teams for quick UI previews.
"""
from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Iterable

random.seed(20260304)

ROOT_DIR = Path("00.OneF/00.Planning/Stage_Rules/HighSchool_Rosters")
ROOT_DIR.mkdir(parents=True, exist_ok=True)

TEAM_CONFIG = {
    "HS_Seoul_Innovation": {
        "name": "서울 이노베이션 고",
        "tier": "powerhouse",
        "keywords": ["데이터랩", "피칭랩", "과학 트레이닝"],
        "region": "서울",
        "facility": "AR·웨어러블 기반 분석 센터",
    },
    "HS_Seoul_Prestige": {
        "name": "서울 프레스티지 고",
        "tier": "powerhouse",
        "keywords": ["엘리트 육성", "전통 강호"],
        "region": "서울",
        "facility": "실내 돔·블루칩 아카데미",
    },
    "HS_Busan_Marine": {
        "name": "부산 마린 고",
        "tier": "powerhouse",
        "keywords": ["강한 피지컬", "바다 도시 정신"],
        "region": "부산",
        "facility": "해양 기후 적응 트레이닝",
    },
    "HS_Suwon_Fusion": {
        "name": "수원 퓨전 고",
        "tier": "mid",
        "keywords": ["공수 밸런스", "신흥 강호"],
        "region": "수원",
        "facility": "퓨전 데이터·비디오 센터",
    },
    "HS_Incheon_Sky": {
        "name": "인천 스카이 고",
        "tier": "mid",
        "keywords": ["기동력", "스몰볼"],
        "region": "인천",
        "facility": "전국급 주루 전용 드릴존",
    },
    "HS_Gwangju_Power": {
        "name": "광주 파워 고",
        "tier": "mid",
        "keywords": ["장타", "열정"],
        "region": "광주",
        "facility": "비거리 특화 슬러거 케이지",
    },
    "HS_Daegu_Spirit": {
        "name": "대구 스피릿 고",
        "tier": "developing",
        "keywords": ["근성", "투혼"],
        "region": "대구",
        "facility": "지역 밀착 멘탈·체력 트랙",
    },
    "HS_Gangneung_Wave": {
        "name": "강릉 웨이브 고",
        "tier": "developing",
        "keywords": ["투지", "한파 적응"],
        "region": "강릉",
        "facility": "동해 한랭 환경 적응 돔",
    },
}

TIER_STATS = {
    "powerhouse": {
        "varsity": {"physical": (25, 2.4), "pitch": (26, 2.3), "hit": (25, 2.3), "mental": (23, 2.0)},
        "junior": {"physical": (22, 2.5), "pitch": (23, 2.4), "hit": (23, 2.4), "mental": (21, 2.0)},
    },
    "mid": {
        "varsity": {"physical": (21, 2.6), "pitch": (21, 2.6), "hit": (21, 2.6), "mental": (19, 2.2)},
        "junior": {"physical": (19, 2.6), "pitch": (19, 2.6), "hit": (19, 2.6), "mental": (18, 2.2)},
    },
    "developing": {
        "varsity": {"physical": (18, 2.7), "pitch": (18, 2.6), "hit": (18, 2.6), "mental": (17, 2.3)},
        "junior": {"physical": (16, 2.7), "pitch": (16, 2.6), "hit": (16, 2.6), "mental": (16, 2.3)},
    },
}

ROSTER_PLAN = {
    "powerhouse": {"varsity_pitchers": 11, "varsity_hitters": 12, "junior_pitchers": 7, "junior_hitters": 8},
    "mid": {"varsity_pitchers": 10, "varsity_hitters": 11, "junior_pitchers": 6, "junior_hitters": 7},
    "developing": {"varsity_pitchers": 9, "varsity_hitters": 10, "junior_pitchers": 6, "junior_hitters": 6},
}

PITCHER_ROLES = [
    ("SP", "에이스 선발", "파워 선발", "varsity", 3.0),
    ("SP", "선발 2선", "균형형", "varsity", 1.5),
    ("SP", "선발 3선", "제구형", "varsity", 0.5),
    ("SP", "선발 4선", "스윙맨", "varsity", 0.0),
    ("SP", "선발 5선", "컨트롤", "varsity", -1.0),
    ("RP", "셋업맨", "강속구", "varsity", 1.0),
    ("RP", "불펜 필승조", "멘탈 강함", "varsity", 0.2),
    ("RP", "좌완 원포인트", "특수", "varsity", 0.0),
    ("RP", "롱릴리프", "안정감", "varsity", -0.3),
    ("RP", "유틸 불펜", "스윙맨", "varsity", -0.4),
    ("CP", "마무리", "클로저", "varsity", 2.0),
    ("SP", "차세대 에이스", "유망주", "junior", 1.0),
    ("SP", "차세대 선발", "컨트롤", "junior", 0.2),
    ("RP", "파워 불펜", "강속구", "junior", 0.2),
    ("RP", "전략 불펜", "변화구", "junior", 0.0),
    ("RP", "재활조", "프로젝트", "junior", -0.8),
]

HITTER_ROLES = [
    ("C", "주전 포수", "리더형", "varsity", 1.5),
    ("C", "백업 포수", "수비형", "varsity", -0.4),
    ("1B", "클린업 1루수", "장타", "varsity", 1.4),
    ("2B", "컨택 2루수", "스몰볼", "varsity", 0.5),
    ("SS", "수비형 유격수", "민첩", "varsity", 0.5),
    ("3B", "코너 파워", "장타", "varsity", 0.7),
    ("LF", "중장거리 LF", "밸런스", "varsity", 0.3),
    ("CF", "테이블세터 CF", "기동력", "varsity", 0.6),
    ("RF", "거포 RF", "장타", "varsity", 1.0),
    ("DH", "지명타자", "클러치", "varsity", 0.6),
    ("UTIL", "슈퍼 서브", "유틸", "varsity", 0.0),
    ("3B", "백업 코너", "육성", "varsity", -0.4),
    ("C", "콜업 후보", "유망주", "junior", 0.1),
    ("IF", "멀티 내야", "스몰볼", "junior", 0.0),
    ("OF", "발 빠른 외야", "주루", "junior", 0.0),
    ("1B", "파워 유망주", "장타", "junior", 0.0),
    ("UTIL", "다재다능", "밸런스", "junior", 0.0),
]

FAMILY_NAMES = [
    "김",
    "이",
    "박",
    "최",
    "정",
    "강",
    "조",
    "윤",
    "장",
    "임",
    "한",
    "오",
    "서",
    "신",
    "권",
    "황",
    "안",
    "송",
    "류",
    "홍",
]
GIVEN_HEADS = [
    "도",
    "현",
    "서",
    "민",
    "지",
    "승",
    "우",
    "태",
    "하",
    "유",
    "연",
    "시",
    "예",
    "주",
    "가",
    "수",
    "채",
    "세",
    "소",
    "온",
]
GIVEN_TAILS = [
    "현",
    "우",
    "호",
    "린",
    "원",
    "준",
    "윤",
    "혁",
    "경",
    "빈",
    "용",
    "솔",
    "별",
    "하",
    "겸",
    "서",
    "라",
    "율",
    "주",
    "연",
]

MANAGER_STYLES = [
    ("데이터 기반 전술", "분석과 리스크 관리를 중시"),
    ("강한 기초·수비 중심", "실수 최소화와 멘탈 유지"),
    ("공격적 주루", "상황별 기동력을 끌어올리는 운영"),
    ("투수 육성 전문", "피칭 프로그램과 피지컬 강화"),
    ("선수 주도 문화", "리더십 순환제와 책임 분담"),
]

COACH_ROLES = [
    ("투수 코치", "피칭"),
    ("타격 코치", "컨택"),
    ("전략 코치", "전술"),
    ("수비 코치", "글러브"),
    ("체력 코치", "피지컬"),
]

PHYSICAL_KEYS = ["힘", "순발력", "스피드", "유연성", "밸런스", "체력", "회복력", "하체 드라이브"]
PITCH_KEYS = ["패스트볼", "커맨드", "무브먼트", "세컨더리", "체인지업", "슬라이더", "스피드 유지", "주자 견제"]
BAT_KEYS = ["컨택", "장타력", "선구안", "배트 스피드", "번트", "상황대응", "기동력", "수비 전환"]
MENTAL_KEYS = ["집중력", "멘탈 회복", "리더십", "야구 IQ", "침착성"]
HIDDEN_KEYS = ["큰경기", "긴장도", "회복탄력"]
PRIVATE_KEYS = ["프로의식", "노력", "인성"]

PITCH_TYPES = [
    "포심 패스트볼",
    "투심 패스트볼",
    "커브",
    "슬라이더",
    "체인지업",
    "커터",
    "스플리터",
    "포크볼",
]

HIT_PROFILES = [
    "라인드라이브 중거리형",
    "장타 지향 플라이볼",
    "컨택·스몰볼 집중",
    "좌우 갭 파워형",
    "테이블세터 출루형",
    "투웨이 컨택형",
]

TRAIT_TAGS = ["클러치", "강심장", "멘탈관리", "팀리더", "프로젝트", "슈퍼유망주", "스피드러너"]

name_cache: set[str] = set()


def rand_name() -> str:
    for _ in range(99):
        name = random.choice(FAMILY_NAMES) + random.choice(GIVEN_HEADS) + random.choice(GIVEN_TAILS)
        if name not in name_cache:
            name_cache.add(name)
            return name
    return name


def clamp_gauss(mean_val: float, spread: float, low: int = 8, high: int = 30) -> int:
    return int(max(low, min(high, round(random.gauss(mean_val, spread)))))


def hidden_score(stage: str) -> int:
    base = {"powerhouse": 75, "mid": 68, "developing": 63}[stage]
    val = random.gauss(base, 6)
    return int(max(45, min(96, round(val))))


def build_staff(tier: str):
    base = {"powerhouse": 80, "mid": 73, "developing": 68}[tier]
    style = random.choice(MANAGER_STYLES)
    manager = {
        "name": rand_name(),
        "role": "감독",
        "style": style[0],
        "philosophy": style[1],
        "ratings": {
            "leadership": base + random.randint(-3, 4),
            "tactics": base + random.randint(-4, 4),
            "development": base + random.randint(-5, 5),
            "motivation": base + random.randint(-4, 5),
            "discipline": base + random.randint(-4, 4),
        },
    }
    coaches = []
    for role, specialty in COACH_ROLES:
        shift = random.randint(-5, 5)
        coaches.append(
            {
                "name": rand_name(),
                "role": role,
                "specialty": specialty,
                "ratings": {
                    "leadership": base - 8 + shift,
                    "teaching": base - 6 + random.randint(-4, 4),
                    "tactics": base - 6 + random.randint(-4, 4),
                },
            }
        )
    return manager, coaches


def choose_year(level: str) -> int:
    weights = [0.25, 0.5, 0.25] if level == "varsity" else [0.6, 0.3, 0.1]
    roll = random.random()
    if roll < weights[0]:
        return 1
    if roll < weights[0] + weights[1]:
        return 2
    return 3


def build_player(role: tuple[str, str, str, str, float], tier: str, level: str):
    config = TIER_STATS[tier][level]
    is_pitcher = role[0] in {"SP", "RP", "CP"}
    phys = {k: clamp_gauss(config["physical"][0], config["physical"][1]) for k in PHYSICAL_KEYS}
    if is_pitcher:
        pitch = {k: clamp_gauss(config["pitch"][0] + role[4], config["pitch"][1]) for k in PITCH_KEYS}
        bat = {k: clamp_gauss(14 if level == "varsity" else 12, 2.5, 7, 22) for k in BAT_KEYS}
        arsenal = random.sample(PITCH_TYPES, k=3) + random.sample(PITCH_TYPES, k=1)
        bat_profile = "투수용 기본 타격"
    else:
        pitch = {k: clamp_gauss(11, 2.0, 6, 19) for k in PITCH_KEYS}
        bat = {k: clamp_gauss(config["hit"][0] + role[4], config["hit"][1]) for k in BAT_KEYS}
        arsenal = []
        bat_profile = random.choice(HIT_PROFILES)
    mental = {k: clamp_gauss(config["mental"][0], config["mental"][1]) for k in MENTAL_KEYS}
    hidden = {k: hidden_score(tier) for k in HIDDEN_KEYS}
    private = {k: hidden_score(tier) for k in PRIVATE_KEYS}
    block = pitch if is_pitcher else bat
    overall = int(
        round((mean(phys.values()) + mean(block.values()) + mean(mental.values())) / 3 / 30 * 100, 0)
    )
    potential = min(95, max(overall + random.randint(5, 18), overall))
    tags = []
    if overall >= 82:
        tags.append("핵심")
    if potential - overall >= 12:
        tags.append("유망주")
    tags.extend(random.sample(TRAIT_TAGS, k=random.choice([1, 1, 2])))
    bats = random.choice(["R", "L", "S"]) if not is_pitcher else random.choice(["R", "L"])
    throws = random.choice(["R", "L"])
    profile = {
        "name": rand_name(),
        "position": role[0],
        "role_label": role[1],
        "archetype": role[2],
        "status": level,
        "year": choose_year(level),
        "bats": bats,
        "throws": throws,
        "tags": tags,
        "overall": min(94, overall),
        "potential": potential,
    }
    if is_pitcher:
        profile["pitch_arsenal"] = arsenal[:3]
    else:
        profile["bat_profile"] = bat_profile
    return {
        "profile": profile,
        "ratings": {
            "physical": phys,
            "pitching": pitch,
            "batting": bat,
            "mental": mental,
            "hidden": hidden,
            "personality": private,
        },
    }


def average_overall(players: Iterable[dict]) -> float:
    return round(mean(p["profile"]["overall"] for p in players), 1)


def save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def legacy_player_payload(player: dict) -> dict:
    profile = player["profile"]
    stats = player["ratings"]
    return {
        "name": profile["name"],
        "status": profile["status"],
        "year": profile["year"],
        "position": profile["position"],
        "role_label": profile["role_label"],
        "archetype": profile["archetype"],
        "throws": profile["throws"],
        "bats": profile["bats"],
        "overall": profile["overall"],
        "potential": profile["potential"],
        "tags": profile["tags"],
        "stats": {
            "physical": stats["physical"],
            "pitching": stats["pitching"],
            "batting": stats["batting"],
            "mental": stats["mental"],
            "hidden": stats["hidden"],
            "personality": stats["personality"],
        },
    }


def main():
    # reset directory
    for child in ROOT_DIR.iterdir():
        if child.is_dir():
            for grand in child.iterdir():
                if grand.is_file():
                    grand.unlink()
            child.rmdir()
        else:
            child.unlink()

    index_payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "teams": [],
    }

    for team_id, meta in TEAM_CONFIG.items():
        tier = meta["tier"]
        manager, coaches = build_staff(tier)
        plan = ROSTER_PLAN[tier]

        varsity_pitch_roles = (tuple(r for r in PITCHER_ROLES if r[3] == "varsity") * 2)[
            : plan["varsity_pitchers"]
        ]
        varsity_hit_roles = (tuple(r for r in HITTER_ROLES if r[3] == "varsity") * 2)[
            : plan["varsity_hitters"]
        ]
        junior_pitch_roles = (tuple(r for r in PITCHER_ROLES if r[3] == "junior") * 3)[
            : plan["junior_pitchers"]
        ]
        junior_hit_roles = (tuple(r for r in HITTER_ROLES if r[3] == "junior") * 3)[
            : plan["junior_hitters"]
        ]

        varsity_players = [build_player(role, tier, "varsity") for role in varsity_pitch_roles + varsity_hit_roles]
        junior_players = [build_player(role, tier, "junior") for role in junior_pitch_roles + junior_hit_roles]

        team_dir = ROOT_DIR / team_id
        team_dir.mkdir(parents=True, exist_ok=True)

        overview = {
            "team_id": team_id,
            "team_name": meta["name"],
            "tier": tier,
            "region": meta["region"],
            "keywords": meta["keywords"],
            "facility": meta["facility"],
            "manager": manager,
            "coaches": coaches,
            "headcounts": {
                "varsity": len(varsity_players),
                "junior": len(junior_players),
            },
            "metrics": {
                "avg_overall_varsity": average_overall(varsity_players),
                "avg_overall_junior": average_overall(junior_players),
            },
        }
        save_json(team_dir / "team_overview.json", overview)
        save_json(team_dir / "roster_varsity.json", varsity_players)
        save_json(team_dir / "roster_junior.json", junior_players)
        legacy_payload = {
            "team_id": team_id,
            "team_name": meta["name"],
            "tier": tier,
            "region": meta["region"],
            "keywords": meta["keywords"],
            "manager": manager,
            "coaches": coaches,
            "players": {
                "varsity": [legacy_player_payload(p) for p in varsity_players],
                "junior": [legacy_player_payload(p) for p in junior_players],
            },
        }
        save_json(ROOT_DIR / f"{team_id}.json", legacy_payload)

        combined = sorted(
            varsity_players + junior_players,
            key=lambda p: (p["profile"]["status"] == "varsity", p["profile"]["overall"]),
            reverse=True,
        )
        index_payload["teams"].append(
            {
                "team_id": team_id,
                "team_name": meta["name"],
                "tier": tier,
                "region": meta["region"],
                "keywords": meta["keywords"],
                "facility": meta["facility"],
                "summary": {
                    "varsity_count": len(varsity_players),
                    "junior_count": len(junior_players),
                    "avg_overall": average_overall(varsity_players + junior_players),
                    "top_players": [
                        {
                            "name": player["profile"]["name"],
                            "position": player["profile"]["position"],
                            "overall": player["profile"]["overall"],
                            "tags": player["profile"]["tags"],
                        }
                        for player in combined[:4]
                    ],
                },
            }
        )

    save_json(ROOT_DIR / "index.json", index_payload)


if __name__ == "__main__":
    main()
