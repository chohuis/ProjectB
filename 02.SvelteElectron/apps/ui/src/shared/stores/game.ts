import { writable, derived, get } from 'svelte/store';
import type { CareerStage, CareerSchoolState } from '../../app/mockCareer';
import type { MessageItem } from '../types/main';
import { mockMainSnapshot } from '../../app/mockMain';
import { mockCareerProfile, mockCareerSchool } from '../../app/mockCareer';

// ── 타입 정의 ──────────────────────────────────────────────────────────────

export interface PlayerState {
  name: string;
  team: string;
  year: string;
  position: string;
  role: string;
  throws: string;
  bats: string;
  overall: number;
  potentialHidden: number;
  condition: number;
  fatigue: number;
  morale: number;
  tags: string[];
}

export interface TrainingPlanState {
  primaryProgramId: string | null;
  secondaryProgramId: string | null;
  recoveryProgramId: string | null;
}

export interface GameStoreState {
  // 날짜/시즌
  day: number;
  seasonYear: number;
  stage: CareerStage;
  dayLabel: string;
  // 선수
  player: PlayerState;
  school: CareerSchoolState;
  // 메시지
  mailbox: MessageItem[];
  // 훈련
  trainingPlan: TrainingPlanState;
  // 로그 / 일정
  logs: string[];
  upcoming: string[];
}

// core IPC로 주고받는 최소 상태 형태
export interface CoreGameState {
  day: number;
  seasonYear: number;
  stage: string;
  playerName: string;
  teamName: string;
  morale: number;
}

// ── 초기값 ─────────────────────────────────────────────────────────────────

const INITIAL_MAILBOX: MessageItem[] = [
  {
    id: 'msg-000',
    category: 'coach',
    sender: '투수 코치 오지경',
    subject: '불펜 추가 세션 제안',
    preview: '오늘 저녁 불펜 30구 추가 세션을 진행할지 선택해 주세요.',
    body: '오늘 저녁에 추가 불펜 세션(30구)을 제안합니다.\n\n선택에 따라 오늘 컨디션과 내일 훈련 효율에 영향을 줍니다.\n- 훈련한다: 컨디션 -4, 커맨드 경험치 +1\n- 훈련하지 않는다: 컨디션 +2, 커맨드 경험치 변화 없음',
    createdAt: '오늘 08:40',
    readAt: null,
    decision: {
      prompt: '추가 불펜 30구 세션을 진행하시겠습니까?',
      options: [
        { id: 'do_train',   label: '훈련한다',       effect: '컨디션 -4, 커맨드 경험치 +1' },
        { id: 'skip_train', label: '훈련하지 않는다', effect: '컨디션 +2, 커맨드 경험치 변화 없음' },
      ],
      selectedOptionId: null,
    },
  },
  {
    id: 'msg-001',
    category: 'coach',
    sender: '투수 코치 오지경',
    subject: '릴리스 포인트 체크 요청',
    preview: '오늘 불펜 세션 전 하체 드라이브-릴리스 타이밍을 다시 맞추자.',
    body: '오늘 불펜 세션에서 릴리스 포인트가 3구간에서 조금 흔들렸습니다.\n\n하체 드라이브 이후 상체가 먼저 열리는 구간만 잡으면 커맨드가 더 안정됩니다.',
    createdAt: '오늘 09:20',
    readAt: null,
  },
  {
    id: 'msg-002',
    category: 'manager',
    sender: '감독 임우현',
    subject: '주말 리그 선발 확정',
    preview: '토요일 1차전 선발로 준비하고 금요일은 투구 수를 제한한다.',
    body: '토요일 주말 리그 1차전 선발로 확정합니다.\n\n금요일 청백전은 투구 수 25개 제한으로 진행하고, 경기 전날 컨디션 체크 리포트를 올려 주세요.',
    createdAt: '어제 18:05',
    readAt: null,
  },
  {
    id: 'msg-003',
    category: 'system',
    sender: '시스템',
    subject: '훈련 루틴 결과 반영',
    preview: '불펜 루틴 숙련도 상승에 따라 커맨드가 +1 반영되었습니다.',
    body: '훈련 루틴 분석 결과:\n- 불펜 루틴 숙련도 상승\n- 커맨드 +1 반영\n- 피로도 +2 반영',
    createdAt: '어제 13:42',
    readAt: '어제 14:01',
  },
  {
    id: 'msg-004',
    category: 'news',
    sender: '리그 뉴스',
    subject: '주말 리그 매치업 발표',
    preview: '서울 이노베이션 고 vs 부산 마린 고 대진이 확정되었습니다.',
    body: '이번 주말 리그 주요 매치업이 확정되었습니다.\n\n서울 이노베이션 고는 부산 마린 고와 원정 2연전을 치릅니다.',
    createdAt: '2일 전 20:10',
    readAt: null,
  },
];

function buildInitialState(): GameStoreState {
  return {
    day: 1,
    seasonYear: 2026,
    stage: mockCareerSchool.currentStage,
    dayLabel: mockMainSnapshot.dayLabel,
    player: {
      ...mockCareerProfile,
      morale: mockMainSnapshot.morale,
    },
    school: { ...mockCareerSchool },
    mailbox: INITIAL_MAILBOX,
    trainingPlan: {
      primaryProgramId: 'bullpen_cmd',
      secondaryProgramId: 'video_analysis',
      recoveryProgramId: 'recovery_pool',
    },
    logs: [...mockMainSnapshot.logs],
    upcoming: [...mockMainSnapshot.upcoming],
  };
}

// ── 스토어 팩토리 ───────────────────────────────────────────────────────────

function createGameStore() {
  const { subscribe, set, update } = writable<GameStoreState>(buildInitialState());

  return {
    subscribe,

    // 세이브 파일에서 불러온 데이터로 전체 상태 교체
    hydrate(saved: Partial<GameStoreState>) {
      update(s => ({ ...s, ...saved }));
    },

    // 메시지 읽음 처리
    markMessageRead(id: string) {
      update(s => ({
        ...s,
        mailbox: s.mailbox.map(m =>
          m.id === id && m.readAt === null ? { ...m, readAt: '방금' } : m
        ),
      }));
    },

    // 메시지 의사결정 선택
    resolveDecision(messageId: string, optionId: string) {
      update(s => ({
        ...s,
        mailbox: s.mailbox.map(m => {
          if (m.id !== messageId || !m.decision) return m;
          return {
            ...m,
            readAt: m.readAt ?? '방금',
            decision: { ...m.decision, selectedOptionId: optionId },
          };
        }),
      }));
    },

    // 훈련 계획 업데이트
    setTrainingPlan(plan: Partial<TrainingPlanState>) {
      update(s => ({ ...s, trainingPlan: { ...s.trainingPlan, ...plan } }));
    },

    // day:advance IPC 결과 반영
    applyDayResult(snapshot: CoreGameState, newLogs: string[]) {
      update(s => ({
        ...s,
        day: snapshot.day,
        morale: snapshot.morale,
        dayLabel: computeDayLabel(snapshot.day, snapshot.seasonYear),
        player: { ...s.player, morale: snapshot.morale },
        logs: [...newLogs, ...s.logs].slice(0, 30),
      }));
    },

    // 현재 상태 → core IPC용 최소 형태로 추출
    toCoreState(): CoreGameState {
      const s = get({ subscribe });
      return {
        day: s.day,
        seasonYear: s.seasonYear,
        stage: s.stage,
        playerName: s.player.name,
        teamName: s.player.team,
        morale: s.player.morale,
      };
    },
  };
}

// 간단한 날짜 레이블 계산 (day 1 = 1학년 3월 1주차 기준)
function computeDayLabel(day: number, _year: number): string {
  const monthNames = ['3월','4월','5월','6월','7월','8월','9월','10월','11월','12월','1월','2월'];
  const week = Math.ceil((((day - 1) % 28) + 1) / 7);
  const monthIdx = Math.floor((day - 1) / 28) % 12;
  const grade = Math.floor((day - 1) / 336) + 1;
  return `${grade}학년 ${monthNames[monthIdx]} ${week}주차`;
}

export const gameStore = createGameStore();

// 자주 쓰는 파생값
export const unreadCount = derived(gameStore, $g =>
  $g.mailbox.filter(m => m.readAt === null).length
);

export const showAcademicsTab = derived(gameStore, $g =>
  $g.school.currentStage === 'highschool' || $g.school.currentStage === 'university'
);
