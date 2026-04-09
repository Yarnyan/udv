import type {
  AgentAction,
  AgentContext,
  AgentImpl,
  AgentMessage,
} from "../types";

export function createReviewerAgent(): AgentImpl {
  let draft: string | null = null;

  const onBuildDraft = async (
    ctx: AgentContext,
    msg: AgentMessage,
  ): Promise<AgentAction[]> => {
    draft = msg.body;

    const notes = [
      "Ревью:",
      "- Добавить визуальную причинность: bids/decision в явном виде.",
      "- Вынести логику по агентам (onMessage) — убрать ощущение 'сценария'.",
      "- В UI дать инспектор выбранного ребра/сообщения.",
    ].join("\n");

    await ctx.sleep(350 + Math.floor(Math.random() * 450));

    return [
      {
        type: "send",
        message: {
          from: "review",
          to: "build",
          kind: "review_notes",
          title: "Замечания ревьюера",
          body: notes,
          relatedTaskId: msg.relatedTaskId,
        },
      },
      {
        type: "send",
        message: {
          from: "review",
          to: "all",
          kind: "final_answer",
          title: "Финальный ответ",
          body:
            "Итог:\n" +
            "- Система агентов стала event-driven: у каждого агента inbox, он реагирует на сообщения и возвращает actions.\n" +
            "- Маршрутизация подзадач делается через bid(score+reason) от исполнителей, планировщик выбирает победителя и объясняет решение.\n" +
            "- Визуализация: React Flow граф сообщений + лента событий и карточки задач.\n\n" +
            (draft ? `Черновик билдера:\n${draft}` : ""),
        },
      },
      {
        type: "final",
        answer:
          "Готово: агенты взаимодействуют через сообщения, а решения по маршрутизации прозрачны (bid/decision). Смотрите граф (React Flow) и ленту событий.",
      },
    ];
  };

  return {
    id: "review",
    onMessage: async (ctx, msg) => {
      if (msg.kind === "result" && msg.from === "build")
        return onBuildDraft(ctx, msg);
      return [{ type: "noop" }];
    },
  };
}
