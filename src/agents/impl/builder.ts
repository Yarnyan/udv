import { id } from "../../lib/id";
import type { AgentAction, AgentContext, AgentImpl } from "../types";
import { clamp01, normalizeWhitespace } from "./utils";

export function createBuilderAggregatorAgent(): AgentImpl {
  const results: { taskId: string; from: string; text: string }[] = [];
  let expected = 0;
  let buildTaskId: string | null = null;

  const score = (text: string) => {
    const s = normalizeWhitespace(text).toLowerCase();
    let v = 0.5;
    const reasons: string[] = [];
    const bump = (d: number, r: string) => {
      v += d;
      reasons.push(r);
    };
    if (
      /(сделай|реализ|код|компонент|ui|интерфейс|визуал|react|flow|n8n)/i.test(
        s,
      )
    )
      bump(0.25, "похоже на внедрение/код");
    if (/(сборк|интеграц|рефактор|итог)/i.test(s))
      bump(0.15, "нужно собрать/интегрировать");
    v = clamp01(v + (Math.random() - 0.5) * 0.06);
    return {
      score: v,
      reason: reasons.length ? reasons.join(", ") : "универсальная подзадача",
    };
  };

  const tryAssemble = async (ctx: AgentContext): Promise<AgentAction[]> => {
    if (!buildTaskId) return [{ type: "noop" }];
    if (expected > 0 && results.length < expected) return [{ type: "noop" }];
    if (results.length === 0) return [{ type: "noop" }];

    const draft =
      "Черновик сборки:\n\n" +
      results
        .map(
          (r, i) =>
            `#${i + 1} (${r.taskId.slice(-6)}) от ${r.from}:\n${r.text}`,
        )
        .join("\n\n") +
      "\n\nСводка:\n- Декомпозиция -> bids -> decision -> assignment -> results -> review -> final.\n";

    return [
      {
        type: "update_task",
        id: buildTaskId,
        patch: { status: "done", finishedAt: ctx.now(), result: draft },
      },
      {
        type: "send",
        message: {
          from: "build",
          to: "review",
          kind: "result",
          title: "Черновик ответа",
          body: draft,
          relatedTaskId: buildTaskId,
          meta: { resultsCount: results.length, expected },
        },
      },
    ];
  };

  return {
    id: "build",
    onMessage: async (ctx, msg) => {
      if (msg.kind === "bid_request") {
        const { score: s, reason } = score(msg.body);
        return [
          {
            type: "send",
            message: {
              from: "build",
              to: "planner",
              kind: "bid",
              title: "Ставка (bid)",
              body: `score=${s.toFixed(2)} — ${reason}`,
              relatedTaskId: msg.relatedTaskId,
              meta: { score: s, reason },
            },
          },
        ];
      }

      if (msg.kind === "assignment" && msg.relatedTaskId) {
        const taskId = msg.relatedTaskId;
        const subtask = msg.body;

        const actions: AgentAction[] = [
          {
            type: "send",
            message: {
              from: "build",
              to: "all",
              kind: "log",
              title: "В работе",
              body: `Builder взял подзадачу: "${subtask}"`,
              relatedTaskId: taskId,
            },
          },
        ];

        await ctx.sleep(420 + Math.floor(Math.random() * 520));
        await ctx.sleep(420 + Math.floor(Math.random() * 520));

        const result = [
          `Подзадача: ${subtask}`,
          "",
          "Решение (mock):",
          "- Реализовать визуализацию графа (React Flow) и инспектор событий",
          "- Поддержать маршрутизацию через bid(score+reason)",
          "- Сборка финального ответа через Reviewer",
        ].join("\n");

        actions.push({
          type: "update_task",
          id: taskId,
          patch: { status: "done", finishedAt: ctx.now(), result },
        });

        actions.push({
          type: "send",
          message: {
            from: "build",
            to: "planner",
            kind: "result",
            title: "Результат подзадачи",
            body: result,
            relatedTaskId: taskId,
          },
        });

        return actions;
      }

      if (msg.kind === "plan" && msg.from === "planner") {
        expected = msg.body
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean).length;

        buildTaskId = id("task");
        return [
          {
            type: "create_task",
            task: {
              id: buildTaskId,
              title: "Сборка ответа",
              description: "Собрать результаты подзадач в единый черновик.",
              assignedTo: "build",
              status: "in_progress",
              startedAt: ctx.now(),
            },
          },
          {
            type: "send",
            message: {
              from: "build",
              to: "all",
              kind: "log",
              title: "Builder",
              body: `Жду результаты подзадач (${expected} шт.), затем соберу черновик.`,
              relatedTaskId: buildTaskId,
              meta: { expected },
            },
          },
        ];
      }

      if (msg.kind === "result" && msg.relatedTaskId) {
        results.push({
          taskId: msg.relatedTaskId,
          from:
            typeof msg.meta?.originFrom === "string"
              ? String(msg.meta.originFrom)
              : msg.from,
          text: msg.body,
        });
        return tryAssemble(ctx);
      }

      return [{ type: "noop" }];
    },
  };
}
