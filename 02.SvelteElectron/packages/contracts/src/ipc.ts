export const IPC_CHANNELS = {
  gameGetSnapshot: "game:getSnapshot",
  gameAdvanceDay: "game:advanceDay",
  matchStart: "match:start",
  matchStep: "match:step",
  matchFinish: "match:finish"
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
