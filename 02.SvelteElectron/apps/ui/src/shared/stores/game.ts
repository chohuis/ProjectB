import { derived, get, writable } from "svelte/store";
import type { CareerSchoolState, CareerStage, PitcherStats } from "../../app/mockCareer";
import { mockCareerProfile, mockCareerSchool } from "../../app/mockCareer";
import { mockMainSnapshot } from "../../app/mockMain";
import type { MessageItem } from "../types/main";

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
  pitcherStats: PitcherStats;
}

export interface TrainingPlanState {
  primaryProgramId: string | null;
  secondaryProgramId: string | null;
  recoveryProgramId: string | null;
}

export interface GameStoreState {
  day: number;
  seasonYear: number;
  stage: CareerStage;
  dayLabel: string;
  player: PlayerState;
  school: CareerSchoolState;
  mailbox: MessageItem[];
  trainingPlan: TrainingPlanState;
  logs: string[];
  upcoming: string[];
}

export interface CoreGameState {
  day: number;
  seasonYear: number;
  stage: string;
  playerName: string;
  teamName: string;
  morale: number;
}

const INITIAL_MAILBOX: MessageItem[] = [
  {
    id: "msg-000",
    category: "coach",
    sender: "투수 코치 오지경",
    subject: "불펜 추가 세션 제안",
    preview: "오늘 저녁 불펜 30구 추가 세션 진행 여부를 선택해 주세요.",
    body:
      "오늘 저녁 추가 불펜 세션(30구)을 제안합니다.\n\n" +
      "선택에 따라 오늘 컨디션과 내일 훈련 효율이 달라집니다.\n" +
      "- 훈련한다: 컨디션 -4, 커맨드 경험치 +1\n" +
      "- 훈련하지 않는다: 컨디션 +2, 변화 없음",
    createdAt: "오늘 08:40",
    readAt: null,
    decision: {
      prompt: "추가 불펜 30구 세션을 진행하시겠습니까?",
      options: [
        { id: "do_train", label: "훈련한다", effect: "컨디션 -4, 커맨드 경험치 +1" },
        { id: "skip_train", label: "훈련하지 않는다", effect: "컨디션 +2, 변화 없음" }
      ],
      selectedOptionId: null
    }
  },
  {
    id: "msg-001",
    category: "coach",
    sender: "투수 코치 오지경",
    subject: "릴리스 라인 체크 요청",
    preview: "오늘 불펜 세션 후 하체 슬라이드-릴리스 타이밍을 다시 맞춰 봅시다.",
    body:
      "오늘 불펜 세션에서 릴리스 라인이 3구간에서 조금 흔들렸습니다.\n\n" +
      "하체 슬라이드 이후 상체가 먼저 열리는 구간만 줄이면 커맨드가 더 안정됩니다.",
    createdAt: "오늘 09:20",
    readAt: null
  },
  {
    id: "msg-002",
    category: "manager",
    sender: "감독 임우현",
    subject: "주말 리그 선발 확정",
    preview: "토요일 1차전 선발로 준비하고 금요일은 투구 수를 제한합니다.",
    body:
      "토요일 주말 리그 1차전 선발로 확정되었습니다.\n\n" +
      "금요일 최종 점검은 투구 수 25구 제한으로 진행해 주세요.",
    createdAt: "어제 18:05",
    readAt: null
  },
  {
    id: "msg-003",
    category: "system",
    sender: "시스템",
    subject: "훈련 루틴 결과 반영",
    preview: "불펜 루틴 숙련도 상승에 따라 커맨드 +1이 반영되었습니다.",
    body:
      "훈련 루틴 분석 결과:\n- 불펜 루틴 숙련도 상승\n- 커맨드 +1 반영\n- 피로도 +2 반영",
    createdAt: "어제 13:42",
    readAt: "어제 14:01"
  },
  {
    id: "msg-004",
    category: "news",
    sender: "리그 뉴스",
    subject: "주말 리그 매치업 발표",
    preview: "서울 이노베이션 고 vs 부산 마린 고 2연전이 확정되었습니다.",
    body:
      "이번 주말 리그 주요 매치업이 확정되었습니다.\n\n" +
      "서울 이노베이션 고는 부산 마린 고와 원정 2연전을 치릅니다.",
    createdAt: "2일 전 20:10",
    readAt: null
  }
];

// 초기 게임 상태를 한 곳에서 구성해 스토어 생성 시 재사용한다.
function buildInitialState(): GameStoreState {
  return {
    day: 1,
    seasonYear: 2026,
    stage: mockCareerSchool.currentStage,
    dayLabel: mockMainSnapshot.dayLabel,
    player: {
      ...mockCareerProfile,
      morale: mockMainSnapshot.morale
    },
    school: { ...mockCareerSchool },
    mailbox: INITIAL_MAILBOX,
    trainingPlan: {
      primaryProgramId: "bullpen_cmd",
      secondaryProgramId: "video_analysis",
      recoveryProgramId: "recovery_pool"
    },
    logs: [...mockMainSnapshot.logs],
    upcoming: [...mockMainSnapshot.upcoming]
  };
}

// 게임 진행 전반(메시지/훈련계획/로그)을 관리하는 메인 스토어
function createGameStore() {
  const { subscribe, update } = writable<GameStoreState>(buildInitialState());

  return {
    subscribe,

    // 저장된 상태를 현재 스토어에 병합 복원
    hydrate(saved: Partial<GameStoreState>) {
      update((state) => ({ ...state, ...saved }));
    },

    // 특정 메시지를 읽음 처리
    markMessageRead(id: string) {
      update((state) => ({
        ...state,
        mailbox: state.mailbox.map((msg) =>
          msg.id === id && msg.readAt === null ? { ...msg, readAt: "방금" } : msg
        )
      }));
    },

    // 선택지가 있는 메시지의 응답 결과를 기록
    resolveDecision(messageId: string, optionId: string) {
      update((state) => ({
        ...state,
        mailbox: state.mailbox.map((msg) => {
          if (msg.id !== messageId || !msg.decision) return msg;
          return {
            ...msg,
            readAt: msg.readAt ?? "방금",
            decision: { ...msg.decision, selectedOptionId: optionId }
          };
        })
      }));
    },

    // 주간 훈련 계획 일부만 부분 업데이트
    setTrainingPlan(plan: Partial<TrainingPlanState>) {
      update((state) => ({ ...state, trainingPlan: { ...state.trainingPlan, ...plan } }));
    },

    // 하루 진행 결과(스냅샷/로그)를 스토어에 반영
    applyDayResult(snapshot: CoreGameState, newLogs: string[]) {
      update((state) => ({
        ...state,
        day: snapshot.day,
        dayLabel: computeDayLabel(snapshot.day, snapshot.seasonYear),
        player: { ...state.player, morale: snapshot.morale },
        logs: [...newLogs, ...state.logs].slice(0, 30)
      }));
    },

    // IPC 전달용 최소 코어 상태 직렬화
    toCoreState(): CoreGameState {
      const state = get({ subscribe });
      return {
        day: state.day,
        seasonYear: state.seasonYear,
        stage: state.stage,
        playerName: state.player.name,
        teamName: state.player.team,
        morale: state.player.morale
      };
    }
  };
}

// day 인덱스를 화면 표시용 학년/월/주 라벨로 변환
function computeDayLabel(day: number, _year: number): string {
  const monthNames = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월", "1월", "2월"];
  const week = Math.ceil((((day - 1) % 28) + 1) / 7);
  const monthIdx = Math.floor((day - 1) / 28) % 12;
  const grade = Math.floor((day - 1) / 336) + 1;
  return `${grade}학년 ${monthNames[monthIdx]} ${week}주차`;
}

export const gameStore = createGameStore();

export const unreadCount = derived(gameStore, ($state) =>
  $state.mailbox.filter((message) => message.readAt === null).length
);

export const showAcademicsTab = derived(
  gameStore,
  ($state) => $state.school.currentStage === "highschool" || $state.school.currentStage === "university"
);
