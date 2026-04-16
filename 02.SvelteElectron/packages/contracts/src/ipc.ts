export const IPC_CHANNELS = {
  gameGetSnapshot: "game:getSnapshot",
  gameAdvanceDay: "game:advanceDay"
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

