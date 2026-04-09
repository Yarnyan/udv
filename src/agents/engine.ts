import { id } from "../lib/id";
import type {
  AgentAction,
  AgentContext,
  AgentDefinition,
  AgentId,
  AgentImpl,
  AgentMessage,
  RunSnapshot,
  WorkspaceEvent,
  WorkspaceTask,
} from "./types";
import { createPlannerAgent } from "./impl/planner";
import { createWorkerAgent } from "./impl/worker";
import { createBuilderAggregatorAgent } from "./impl/builder";
import { createReviewerAgent } from "./impl/reviewer";

export type WorkspaceRunController = {
  stop: () => void;
  getSnapshot: () => RunSnapshot;
};

type EngineOpts = {
  agents: AgentDefinition[];
  onEvent: (e: WorkspaceEvent) => void;
  minDelayMs?: number;
  maxDelayMs?: number;
};

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function mkMessage(
  args: Omit<AgentMessage, "id" | "at"> & { at?: number },
): AgentMessage {
  return {
    id: id("msg"),
    at: args.at ?? Date.now(),
    from: args.from,
    to: args.to,
    kind: args.kind,
    title: args.title,
    body: args.body,
    relatedTaskId: args.relatedTaskId,
    meta: args.meta,
  };
}

function mkTask(
  args: Omit<WorkspaceTask, "createdAt"> & { createdAt?: number },
): WorkspaceTask {
  return {
    ...args,
    createdAt: args.createdAt ?? Date.now(),
    status: args.status ?? "queued",
  };
}

function isAgentId(x: AgentMessage["to"] | AgentMessage["from"]): x is AgentId {
  return x === "planner" || x === "research" || x === "build" || x === "review";
}

export function createWorkspaceRun(
  userInput: string,
  opts: EngineOpts,
): WorkspaceRunController {
  const { agents, onEvent, minDelayMs = 200, maxDelayMs = 650 } = opts;
  const ac = new AbortController();
  const signal = ac.signal;

  const snapshot: RunSnapshot = {
    isRunning: true,
    userInput,
    startedAt: Date.now(),
    tasks: [],
    messages: [],
    events: [],
  };

  const emit = (e: WorkspaceEvent) => {
    snapshot.events.push(e);
    onEvent(e);
  };

  const createTask = (task: WorkspaceTask) => {
    snapshot.tasks.push(task);
    emit({ type: "task_created", at: Date.now(), task });
  };

  const updateTask = (id_: string, patch: Partial<WorkspaceTask>) => {
    const idx = snapshot.tasks.findIndex((t) => t.id === id_);
    if (idx === -1) return;
    const next = { ...snapshot.tasks[idx], ...patch };
    snapshot.tasks[idx] = next;
    emit({ type: "task_updated", at: Date.now(), task: next });
  };

  const inbox = new Map<AgentId, AgentMessage[]>();
  for (const a of agents) inbox.set(a.id, []);

  const enqueue = (m: AgentMessage) => {
    if (m.to === "all") {
      for (const a of agents) {
        if (a.id === m.from) continue;
        inbox.get(a.id)?.push(m);
      }
      return;
    }
    if (isAgentId(m.to)) inbox.get(m.to)?.push(m);
  };

  const pushMsg = (m: AgentMessage) => {
    snapshot.messages.push(m);
    emit({ type: "message", at: m.at, message: m });
    enqueue(m);
  };

  const enqueueInternal = (agent: AgentId, msg: AgentMessage) => {
    inbox.get(agent)?.push(msg);
  };

  const applyAction = async (a: AgentAction) => {
    switch (a.type) {
      case "noop":
        return;
      case "send": {
        const m = mkMessage(a.message);
        pushMsg(m);
        return;
      }
      case "create_task": {
        createTask(mkTask(a.task as WorkspaceTask));
        return;
      }
      case "update_task": {
        updateTask(a.id, a.patch);
        return;
      }
      case "final": {
        snapshot.finalAnswer = a.answer;
        emit({ type: "final", at: Date.now(), answer: a.answer });
        return;
      }
      default: {
        const _exhaustive: never = a;
        return _exhaustive;
      }
    }
  };

  const ctx: AgentContext = {
    signal,
    now: () => Date.now(),
    sleep: (ms) => sleep(ms, signal),
    agents,
    getTasks: () => snapshot.tasks,
  };

  const impls: AgentImpl[] = [
    createPlannerAgent(),
    createWorkerAgent("research"),
    createBuilderAggregatorAgent(),
    createReviewerAgent(),
  ];
  const implById = new Map<AgentId, AgentImpl>(impls.map((a) => [a.id, a]));

  const jitter = async () => {
    await sleep(randInt(minDelayMs, maxDelayMs), signal);
  };

  const order: AgentId[] = ["planner", "research", "build", "review"];
  let rr = 0;

  const pickFromQueue = (q: AgentMessage[]) => {
    const idx = q.findIndex((m) => m.meta?.internal !== true);
    if (idx >= 0) return q.splice(idx, 1)[0]!;
    return q.shift() ?? null;
  };

  const nextMessage = (): { agent: AgentId; msg: AgentMessage } | null => {
    for (let i = 0; i < order.length; i++) {
      const agent = order[(rr + i) % order.length]!;
      const q = inbox.get(agent);
      if (!q || q.length === 0) continue;
      const msg = pickFromQueue(q);
      if (!msg) continue;
      rr = (rr + i + 1) % order.length;
      return { agent, msg };
    }
    return null;
  };

  const run = async () => {
    emit({ type: "run_started", at: snapshot.startedAt!, userInput });
    pushMsg(
      mkMessage({
        from: "user",
        to: "planner",
        kind: "user_task",
        title: "Задача от пользователя",
        body: userInput,
      }),
    );

    const tick = async () => {
      while (!signal.aborted && snapshot.isRunning) {
        try {
          await sleep(350, signal);
        } catch (err) {
          if (isAbortError(err)) return;
          throw err;
        }
        enqueueInternal(
          "planner",
          mkMessage({
            from: "system",
            to: "planner",
            kind: "log",
            title: "__tick__",
            body: "",
            meta: { internal: true },
          }),
        );
      }
    };
    void tick().catch(() => {});

    while (!signal.aborted) {
      const next = nextMessage();
      if (!next) {
        if (snapshot.finalAnswer) break;
        try {
          await sleep(80, signal);
        } catch (err) {
          if (isAbortError(err)) break;
          throw err;
        }
        continue;
      }

      try {
        await jitter();
      } catch (err) {
        if (isAbortError(err)) break;
        throw err;
      }

      const impl = implById.get(next.agent);
      if (!impl) continue;

      try {
        const actions = await impl.onMessage(ctx, next.msg);
        for (const a of actions) await applyAction(a);
      } catch (err) {
        if (isAbortError(err)) break;
        throw err;
      }
    }

    snapshot.isRunning = false;
    snapshot.stoppedAt = Date.now();
    emit({
      type: "run_stopped",
      at: snapshot.stoppedAt,
      reason: signal.aborted ? "cancelled" : "completed",
    });
  };

  void run().catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") {
      snapshot.isRunning = false;
      snapshot.stoppedAt = Date.now();
      emit({
        type: "run_stopped",
        at: snapshot.stoppedAt,
        reason: "cancelled",
      });
      return;
    }

    pushMsg(
      mkMessage({
        from: "system",
        to: "all",
        kind: "log",
        title: "Ошибка runtime",
        body:
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : "Unknown error",
      }),
    );
    snapshot.isRunning = false;
    snapshot.stoppedAt = Date.now();
    emit({ type: "run_stopped", at: snapshot.stoppedAt, reason: "completed" });
  });

  return {
    stop: () => ac.abort(),
    getSnapshot: () => snapshot,
  };
}
