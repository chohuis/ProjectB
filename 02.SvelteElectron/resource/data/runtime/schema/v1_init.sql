CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  sender_ref TEXT NOT NULL,
  created_at_day INTEGER NOT NULL,
  read_at_day INTEGER,
  decision_status TEXT NOT NULL,
  selected_option_id TEXT
);

CREATE TABLE IF NOT EXISTS messenger_contacts (
  contact_id TEXT PRIMARY KEY,
  is_unlocked INTEGER NOT NULL,
  unlocked_at_day INTEGER,
  affinity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messenger_threads (
  thread_id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  last_read_at_day INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messenger_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at_day INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS training_daily_plan (
  day INTEGER PRIMARY KEY,
  primary_program_id TEXT NOT NULL,
  secondary_program_id TEXT
);

CREATE TABLE IF NOT EXISTS training_weekly_ratio (
  week_key TEXT PRIMARY KEY,
  command_ratio INTEGER NOT NULL,
  velocity_ratio INTEGER NOT NULL,
  stamina_ratio INTEGER NOT NULL,
  mental_ratio INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS training_pitch_progress (
  pitch_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  progress INTEGER NOT NULL
);
