import type {
  AgentAction,
  AgentContext,
  AgentImpl,
  AgentMessage,
  AgentId,
} from "../types";
import { clamp01, normalizeWhitespace } from "./utils";

type WorkerKind = "research" | "build";

function scoreSubtask(kind: WorkerKind, text: string) {
  const s = normalizeWhitespace(text).toLowerCase();
  let score = 0.45;
  const reasons: string[] = [];

  const bump = (v: number, r: string) => {
    score += v;
    reasons.push(r);
  };

  if (kind === "research") {
    if (/(требован|критери|плюс|сравн|иде|концепт)/i.test(s))
      bump(0.25, "похоже на исследование/требования");
    if (/(архитектур|модел|оркестр|агент)/i.test(s))
      bump(0.15, "есть архитектурные ключевые слова");
    if (/(ui|интерфейс|визуал)/i.test(s))
      bump(0.05, "могу предложить варианты визуализации");
  } else {
    if (/(сделай|реализ|код|компонент|ui|интерфейс|визуал|react|flow)/i.test(s))
      bump(0.25, "похоже на внедрение/код");
    if (/(таймлайн|граф|react flow|n8n)/i.test(s))
      bump(0.2, "про визуализацию графа");
    if (/(сборк|интеграц|рефактор)/i.test(s))
      bump(0.1, "нужно собрать/склеить части");
  }

  score = clamp01(score + (Math.random() - 0.5) * 0.06);
  const reason = reasons.length
    ? reasons.join(", ")
    : "универсальная подзадача";
  return { score, reason };
}

function resultTemplate(kind: WorkerKind, subtask: string) {
  if (kind === "research") {
    return [
      `Подзадача: ${subtask}`,
      "",
      "Наблюдения:",
      "- Важно показать причинно-следственные решения (почему задача ушла этому агенту).",
      "- Для убедительности нужна event-driven модель: inbox/outbox + действия агентов.",
      "- Визуально лучше всего: граф сообщений (React Flow) + инспектор выбранного ребра/сообщения.",
      "",
      "Риски:",
      "- Если логика остаётся в одном сценарии — впечатление 'скрипта'.",
    ].join("\n");
  }

  return [
    `Подзадача: ${subtask}`,
    "",
    "Решение (mock-реализация):",
    "- Внести интерфейс AgentImpl.onMessage(ctx, msg) -> actions[]",
    "- Runtime доставляет сообщения, применяет actions, ведёт лог событий",
    "- Для маршрутизации использовать bid(score+reason) от воркеров",
    "",
    "UI:",
    "- Показывать decision trace (bids + выбранный агент)",
  ].join("\n");
}

export function createWorkerAgent(id: WorkerKind): AgentImpl {
  const agentId: AgentId = id;

  const onBidRequest = async (
    _ctx: AgentContext,
    msg: AgentMessage,
  ): Promise<AgentAction[]> => {
    const subtask = msg.body;
    const { score, reason } = scoreSubtask(id, subtask);

    return [
      {
        type: "send",
        message: {
          from: agentId,
          to: "planner",
          kind: "bid",
          title: "Ставка (bid)",
          body: `score=${score.toFixed(2)} — ${reason}`,
          relatedTaskId: msg.relatedTaskId,
          meta: { score, reason },
        },
      },
    ];
  };

  const onAssignment = async (
    ctx: AgentContext,
    msg: AgentMessage,
  ): Promise<AgentAction[]> => {
    const taskId = msg.relatedTaskId;
    const subtask = msg.body;
    if (!taskId) return [{ type: "noop" }];

    const actions: AgentAction[] = [];
    actions.push({
      type: "send",
      message: {
        from: agentId,
        to: "all",
        kind: "log",
        title: "В работе",
        body: `${id === "research" ? "Researcher" : "Builder"} взял подзадачу: "${subtask}"`,
        relatedTaskId: taskId,
      },
    });

    await ctx.sleep(450 + Math.floor(Math.random() * 500));
    await ctx.sleep(450 + Math.floor(Math.random() * 500));

    const result = resultTemplate(id, subtask);

    actions.push({
      type: "update_task",
      id: taskId,
      patch: { status: "done", finishedAt: ctx.now(), result },
    });

    actions.push({
      type: "send",
      message: {
        from: agentId,
        to: "planner",
        kind: "result",
        title: "Результат подзадачи",
        body: result,
        relatedTaskId: taskId,
      },
    });

    return actions;
  };

  return {
    id: agentId,
    onMessage: async (ctx, msg) => {
      if (msg.kind === "bid_request") return onBidRequest(ctx, msg);
      if (msg.kind === "assignment") return onAssignment(ctx, msg);
      return [{ type: "noop" }];
    },
  };
}
