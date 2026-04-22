<script lang="ts">
  import { mockMainSnapshot } from "../../app/mockMain";
  import type { MainTabId, MessageItem } from "../../shared/types/main";
  import SidebarNav from "../../features/navigation/ui/SidebarNav.svelte";
  import TopHeader from "../../features/main-layout/ui/TopHeader.svelte";
  import HomeDashboard from "../../features/dashboard/ui/HomeDashboard.svelte";
  import RightPanel from "../../features/main-layout/ui/RightPanel.svelte";
  import StatusPage from "../status/StatusPage.svelte";
  import RosterPage from "../roster/RosterPage.svelte";
  import SchedulePage from "../schedule/SchedulePage.svelte";
  import TrainingPage from "../training/TrainingPage.svelte";
  import FinancePage from "../finance/FinancePage.svelte";
  import TestMatchPage from "../test/TestMatchPage.svelte";
  import RecordsPage from "../records/RecordsPage.svelte";
  import MessagesPage from "../messages/MessagesPage.svelte";
  import TeamPage from "../team/TeamPage.svelte";

  let currentTab: MainTabId = "home";
  let mailbox: MessageItem[] = [
    {
      id: "msg-000",
      category: "coach",
      sender: "투수 코치 오지경",
      subject: "불펜 추가 세션 제안",
      preview: "오늘 저녁 불펜 30구 추가 세션을 진행할지 선택해 주세요.",
      body:
        "오늘 저녁에 추가 불펜 세션(30구)을 제안합니다.\n\n선택에 따라 오늘 컨디션과 내일 훈련 효율에 영향을 줍니다.\n- 훈련한다: 컨디션 -4, 커맨드 경험치 +1\n- 훈련하지 않는다: 컨디션 +2, 커맨드 경험치 변화 없음",
      createdAt: "오늘 08:40",
      readAt: null,
      decision: {
        prompt: "추가 불펜 30구 세션을 진행하시겠습니까?",
        options: [
          { id: "do_train", label: "훈련한다", effect: "컨디션 -4, 커맨드 경험치 +1" },
          {
            id: "skip_train",
            label: "훈련하지 않는다",
            effect: "컨디션 +2, 커맨드 경험치 변화 없음"
          }
        ],
        selectedOptionId: null
      }
    },
    {
      id: "msg-001",
      category: "coach",
      sender: "투수 코치 오지경",
      subject: "릴리스 포인트 체크 요청",
      preview: "오늘 불펜 세션 전 하체 드라이브-릴리스 타이밍을 다시 맞추자.",
      body:
        "오늘 불펜 세션에서 릴리스 포인트가 3구간에서 조금 흔들렸습니다.\n\n하체 드라이브 이후 상체가 먼저 열리는 구간만 잡으면 커맨드가 더 안정됩니다. 세션 시작 전에 10구는 낮은 코스만 반복해 주세요.",
      createdAt: "오늘 09:20",
      readAt: null
    },
    {
      id: "msg-002",
      category: "manager",
      sender: "감독 임우현",
      subject: "주말 리그 선발 확정",
      preview: "토요일 1차전 선발로 준비하고 금요일은 투구 수를 제한한다.",
      body:
        "토요일 주말 리그 1차전 선발로 확정합니다.\n\n금요일 청백전은 투구 수 25개 제한으로 진행하고, 경기 전날 컨디션 체크 리포트를 올려 주세요.",
      createdAt: "어제 18:05",
      readAt: null
    },
    {
      id: "msg-003",
      category: "system",
      sender: "시스템",
      subject: "훈련 루틴 결과 반영",
      preview: "불펜 루틴 숙련도 상승에 따라 커맨드가 +1 반영되었습니다.",
      body:
        "훈련 루틴 분석 결과:\n- 불펜 루틴 숙련도 상승\n- 커맨드 +1 반영\n- 피로도 +2 반영\n\n상세 내역은 상태 페이지 최근 변동 로그에서 확인할 수 있습니다.",
      createdAt: "어제 13:42",
      readAt: "어제 14:01"
    },
    {
      id: "msg-004",
      category: "news",
      sender: "리그 뉴스",
      subject: "주말 리그 매치업 발표",
      preview: "서울 이노베이션 고 vs 부산 마린 고 대진이 확정되었습니다.",
      body:
        "이번 주말 리그 주요 매치업이 확정되었습니다.\n\n서울 이노베이션 고는 부산 마린 고와 원정 2연전을 치릅니다. 상대 팀 선발 로테이션이 함께 공개되었습니다.",
      createdAt: "2일 전 20:10",
      readAt: null
    }
  ];

  $: unreadMessageCount = mailbox.filter((message) => message.readAt === null).length;

  function closeMatchEngine() {
    currentTab = "home";
  }

  function markMessageAsRead(messageId: string) {
    mailbox = mailbox.map((message) =>
      message.id === messageId && message.readAt === null
        ? { ...message, readAt: "방금" }
        : message
    );
  }

  function resolveMessageDecision(messageId: string, optionId: string) {
    mailbox = mailbox.map((message) => {
      if (message.id !== messageId || !message.decision) return message;
      return {
        ...message,
        readAt: "방금",
        decision: {
          ...message.decision,
          selectedOptionId: optionId
        }
      };
    });
  }
</script>

{#if currentTab === "test"}
  <TestMatchPage onExit={closeMatchEngine} />
{:else}
  <div class="layout">
    <TopHeader
      dayLabel={mockMainSnapshot.dayLabel}
      teamName={mockMainSnapshot.teamName}
      playerName={mockMainSnapshot.playerName}
    />

    <div class="body">
      <SidebarNav
        {currentTab}
        unreadMessageCount={unreadMessageCount}
        onSelectTab={(tab) => (currentTab = tab)}
      />

      <main>
        <div class="tab-content">
          {#if currentTab === "home"}
            <HomeDashboard
              morale={mockMainSnapshot.morale}
              fatigue={mockMainSnapshot.fatigue}
              upcoming={mockMainSnapshot.upcoming}
            />
          {:else if currentTab === "status"}
            <StatusPage />
          {:else if currentTab === "roster"}
            <RosterPage />
          {:else if currentTab === "schedule"}
            <SchedulePage />
          {:else if currentTab === "training"}
            <TrainingPage />
          {:else if currentTab === "finance"}
            <FinancePage />
          {:else if currentTab === "records"}
            <RecordsPage />
          {:else if currentTab === "messages"}
            <MessagesPage
              messages={mailbox}
              onReadMessage={markMessageAsRead}
              onResolveDecision={resolveMessageDecision}
            />
          {:else if currentTab === "team"}
            <TeamPage />
          {:else}
            <section class="placeholder">{currentTab} 화면 준비 중</section>
          {/if}
        </div>
      </main>

      <RightPanel logs={mockMainSnapshot.logs} />
    </div>
  </div>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
    height: 100%;
    overflow: hidden;
  }

  .body {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr) 220px;
    gap: 10px;
    align-items: stretch;
    min-height: 0;
    overflow: hidden;
  }

  main {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .tab-content {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .tab-content > :global(*) {
    min-height: 0;
  }

  .placeholder {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 14px;
    height: 100%;
  }

  @media (max-width: 1280px) {
    .body {
      grid-template-columns: 154px minmax(0, 1fr) 196px;
    }
  }
</style>
