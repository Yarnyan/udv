import { id } from "../../lib/id";
import type {
  AgentAction,
  AgentImpl,
  AgentMessage,
  AgentContext,
  AgentId,
} from "../types";
import { agentName, splitIntoSubtasks } from "./utils";

type Bid = {
  from: AgentId;
  score: number;
  reason: string;
};

type Pending = {
  taskId: string;
  title: string;
  bids: Bid[];
  requestedAt: number;
};

export function createPlannerAgent(): AgentImpl {
  const pendingByTaskId = new Map<string, Pending>();
  const completedResults = new Set<string>();

  const maybeDecide = (ctx: AgentContext, taskId: string): AgentAction[] => {
    const p = pendingByTaskId.get(taskId);
    if (!p) return [];

    const timedOut = ctx.now() - p.requestedAt > 1800;
    if (p.bids.length < 2 && !timedOut) return [];

    const best = p.bids.slice().sort((a, b) => b.score - a.score)[0];
    if (!best) return [];

    pendingByTaskId.delete(taskId);

    const decisionBody =
      `Выбор исполнителя для "${p.title}":\n` +
      p.bids
        .map(
          (b) =>
            `- ${agentName(ctx.agents, b.from)}: score=${b.score.toFixed(2)} — ${b.reason}`,
        )
        .join("\n") +
      `\n\nИтого: назначаю ${agentName(ctx.agents, best.from)}.`;

    return [
      {
        type: "update_task",
        id: taskId,
        patch: {
          assignedTo: best.from,
          status: "in_progress",
          startedAt: ctx.now(),
        },
      },
      {
        type: "send",
        message: {
          from: "planner",
          to: "all",
          kind: "decision",
          title: "Маршрутизация подзадачи",
          body: decisionBody,
          relatedTaskId: taskId,
          meta: { bids: p.bids, chosen: best.from },
        },
      },
      {
        type: "send",
        message: {
          from: "planner",
          to: best.from,
          kind: "assignment",
          title: "Подзадача назначена",
          body: p.title,
          relatedTaskId: taskId,
        },
      },
    ];
  };

  const onUserTask = async (
    ctx: AgentContext,
    msg: AgentMessage,
  ): Promise<AgentAction[]> => {
    const actions: AgentAction[] = [];

    const planTaskId = id("task");
    actions.push({
      type: "create_task",
      task: {
        id: planTaskId,
        title: "Планирование",
        description:
          "Разбить задачу на подзадачи и инициировать маршрутизацию.",
        assignedTo: "planner",
        status: "in_progress",
        startedAt: ctx.now(),
      },
    });

    const subtasks = splitIntoSubtasks(msg.body);
    const planBody = subtasks.map((s, i) => `${i + 1}. ${s}`).join("\n");

    actions.push({
      type: "send",
      message: {
        from: "planner",
        to: "all",
        kind: "plan",
        title: "План подзадач",
        body: planBody || "Не удалось выделить подзадачи.",
      },
    });

    for (const title of subtasks) {
      const taskId = id("task");
      actions.push({
        type: "create_task",
        task: {
          id: taskId,
          title: `Подзадача: ${title}`,
          description: "Ожидает выбора исполнителя и выполнения.",
          assignedTo: "planner",
          status: "queued",
        },
      });

      pendingByTaskId.set(taskId, {
        taskId,
        title,
        bids: [],
        requestedAt: ctx.now(),
      });

      for (const to of ["research", "build"] as const) {
        actions.push({
          type: "send",
          message: {
            from: "planner",
            to,
            kind: "bid_request",
            title: "Оцени подзадачу (bid)",
            body: title,
            relatedTaskId: taskId,
          },
        });
      }
    }

    actions.push({
      type: "send",
      message: {
        from: "planner",
        to: "all",
        kind: "log",
        title: "Планировщик",
        body: "Подзадачи созданы. Запросил ставки (bid) у исполнителей для маршрутизации.",
      },
    });

    actions.push({
      type: "update_task",
      id: planTaskId,
      patch: {
        status: "done",
        finishedAt: ctx.now(),
        result: planBody || "Не удалось выделить подзадачи.",
      },
    });

    return actions;
  };

  const onBid = async (
    ctx: AgentContext,
    msg: AgentMessage,
  ): Promise<AgentAction[]> => {
    const taskId = msg.relatedTaskId;
    if (!taskId) return [{ type: "noop" }];

    const p = pendingByTaskId.get(taskId);
    if (!p) return [{ type: "noop" }];

    const score =
      typeof msg.meta?.score === "number" ? msg.meta.score : Number.NaN;
    const reason =
      typeof msg.meta?.reason === "string" ? msg.meta.reason : "no reason";
    if (!Number.isFinite(score)) return [{ type: "noop" }];

    if (p.bids.some((b) => b.from === msg.from)) return [{ type: "noop" }];

    p.bids.push({ from: msg.from as AgentId, score, reason });
    pendingByTaskId.set(taskId, p);

    return maybeDecide(ctx, taskId);
  };

  const onTick = async (ctx: AgentContext): Promise<AgentAction[]> => {
    const actions: AgentAction[] = [];
    for (const [taskId] of pendingByTaskId) {
      actions.push(...maybeDecide(ctx, taskId));
    }
    return actions;
  };

  return {
    id: "planner",
    onMessage: async (ctx, msg) => {
      if (msg.kind === "user_task") return onUserTask(ctx, msg);
      if (msg.kind === "bid") return onBid(ctx, msg);
      if (msg.kind === "log" && msg.title === "__tick__") return onTick(ctx);
      if (
        msg.kind === "result" &&
        (msg.from === "research" || msg.from === "build")
      ) {
        const actions: AgentAction[] = [];
        if (msg.relatedTaskId) completedResults.add(msg.relatedTaskId);

        actions.push({
          type: "send",
          message: {
            from: "planner",
            to: "build",
            kind: "result",
            title: "Forward: результат подзадачи",
            body: msg.body,
            relatedTaskId: msg.relatedTaskId,
            meta: { originFrom: msg.from, kind: msg.kind },
          },
        });

        actions.push({
          type: "send",
          message: {
            from: "planner",
            to: "all",
            kind: "log",
            title: "Собираю результаты",
            body: `Получен результат от ${msg.from}. Пересылаю в Builder для сборки черновика.`,
            relatedTaskId: msg.relatedTaskId,
          },
        });

        return actions;
      }
      return [{ type: "noop" }];
    },
  };
}
