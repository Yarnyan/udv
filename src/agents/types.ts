export type AgentRole = "planner" | "researcher" | "builder" | "reviewer";

export type AgentId = "planner" | "research" | "build" | "review";

export type TaskStatus = "queued" | "in_progress" | "done" | "failed";

export type WorkspaceTask = {
  id: string;
  title: string;
  description: string;
  assignedTo: AgentId;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: string;
  error?: string;
};

export type MessageKind =
  | "user_task"
  | "plan"
  | "subtask"
  | "bid_request"
  | "bid"
  | "assignment"
  | "decision"
  | "result"
  | "review_notes"
  | "final_answer"
  | "log";

export type AgentMessage = {
  id: string;
  at: number;
  from: AgentId | "user" | "system";
  to: AgentId | "all";
  kind: MessageKind;
  title: string;
  body: string;
  relatedTaskId?: string;
  meta?: Record<string, unknown>;
};

export type WorkspaceEvent =
  | { type: "run_started"; at: number; userInput: string }
  | { type: "run_stopped"; at: number; reason: "completed" | "cancelled" }
  | { type: "task_created"; at: number; task: WorkspaceTask }
  | { type: "task_updated"; at: number; task: WorkspaceTask }
  | { type: "message"; at: number; message: AgentMessage }
  | { type: "final"; at: number; answer: string };

export type AgentDefinition = {
  id: AgentId;
  name: string;
  role: AgentRole;
  color: string;
  description: string;
};

export type RunSnapshot = {
  isRunning: boolean;
  userInput: string;
  startedAt?: number;
  stoppedAt?: number;
  finalAnswer?: string;
  tasks: WorkspaceTask[];
  messages: AgentMessage[];
  events: WorkspaceEvent[];
};

export type AgentAction =
  | { type: "send"; message: Omit<AgentMessage, "id" | "at"> & { at?: number } }
  | {
      type: "create_task";
      task: Omit<WorkspaceTask, "createdAt"> & { createdAt?: number };
    }
  | { type: "update_task"; id: string; patch: Partial<WorkspaceTask> }
  | { type: "final"; answer: string }
  | { type: "noop" };

export type AgentContext = {
  signal: AbortSignal;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  agents: AgentDefinition[];
  getTasks: () => WorkspaceTask[];
};

export type AgentImpl = {
  id: AgentId;
  onMessage: (ctx: AgentContext, msg: AgentMessage) => Promise<AgentAction[]>;
};
