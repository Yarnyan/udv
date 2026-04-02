import { id } from "../lib/id";
import type {
  AgentDefinition,
  AgentId,
  AgentMessage,
  RunSnapshot,
  WorkspaceEvent,
  WorkspaceTask,
} from "./types";

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

function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function splitIntoSubtasks(userInput: string) {
  const base = normalizeWhitespace(userInput);
  if (!base) return [];

  const sentences = base
    .split(/(?<=[.!?])\s+/)
    .map((x) => normalizeWhitespace(x))
    .filter(Boolean);

  const keywords = [
    { k: /ui|интерфейс|ux|дизайн/i, t: "Продумать интерфейс и визуализацию" },
    {
      k: /архитектур|структур|модул/i,
      t: "Сформировать архитектуру взаимодействия агентов",
    },
    { k: /лог|событ|таймлайн|визуал/i, t: "Сделать ленту событий и сообщения" },
    {
      k: /запуск|локальн|vite|react/i,
      t: "Настроить локальный запуск и сборку",
    },
    { k: /тест|провер/i, t: "Добавить самопроверку и финальную полировку" },
  ];

  const found = keywords.filter((x) => x.k.test(base)).map((x) => x.t);

  const items =
    sentences.length >= 2
      ? sentences.slice(0, 6).map((s, i) => `Разобрать пункт ${i + 1}: ${s}`)
      : found.length
        ? found
        : [
            "Проанализировать задачу и критерии",
            "Собрать подзадачи и роли агентов",
            "Сформировать результат и рекомендации",
          ];

  return Array.from(new Set(items)).slice(0, 6);
}

function agentName(agents: AgentDefinition[], id_: AgentId) {
  return agents.find((a) => a.id === id_)?.name ?? id_;
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
  };
}

export function createWorkspaceRun(
  userInput: string,
  opts: EngineOpts,
): WorkspaceRunController {
  const { agents, onEvent, minDelayMs = 300, maxDelayMs = 1100 } = opts;
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

  const pushMsg = (m: AgentMessage) => {
    snapshot.messages.push(m);
    emit({ type: "message", at: m.at, message: m });
  };

  const createTask = (
    t: Omit<WorkspaceTask, "createdAt" | "status"> & {
      status?: WorkspaceTask["status"];
    },
  ) => {
    const task: WorkspaceTask = {
      ...t,
      createdAt: Date.now(),
      status: t.status ?? "queued",
    };
    snapshot.tasks.push(task);
    emit({ type: "task_created", at: Date.now(), task });
    return task;
  };

  const updateTask = (id_: string, patch: Partial<WorkspaceTask>) => {
    const idx = snapshot.tasks.findIndex((t) => t.id === id_);
    if (idx === -1) return;
    const next = { ...snapshot.tasks[idx], ...patch };
    snapshot.tasks[idx] = next;
    emit({ type: "task_updated", at: Date.now(), task: next });
  };

  const jitter = async () => {
    await sleep(randInt(minDelayMs, maxDelayMs), signal);
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
        at: Date.now(),
      }),
    );

    await jitter();

    const planTask = createTask({
      id: id("task"),
      title: "Планирование",
      description: "Разбить задачу на подзадачи и назначить исполнителей.",
      assignedTo: "planner",
    });

    updateTask(planTask.id, { status: "in_progress", startedAt: Date.now() });
    pushMsg(
      mkMessage({
        from: "planner",
        to: "all",
        kind: "log",
        title: "Планировщик начал работу",
        body: `Анализирую задачу и формирую план. Агент: ${agentName(agents, "planner")}.`,
      }),
    );

    await jitter();

    const subtasks = splitIntoSubtasks(userInput);
    const planBody =
      subtasks.length === 0
        ? "Не удалось выделить подзадачи: пустой ввод."
        : subtasks.map((s, i) => `${i + 1}. ${s}`).join("\n");

    pushMsg(
      mkMessage({
        from: "planner",
        to: "all",
        kind: "plan",
        title: "План подзадач",
        body: planBody,
        relatedTaskId: planTask.id,
      }),
    );

    updateTask(planTask.id, {
      status: "done",
      finishedAt: Date.now(),
      result: planBody,
    });

    if (subtasks.length === 0) {
      const answer =
        "Похоже, задача пустая. Введите текст задачи, и агенты начнут работу.";
      snapshot.finalAnswer = answer;
      emit({ type: "final", at: Date.now(), answer });
      snapshot.isRunning = false;
      snapshot.stoppedAt = Date.now();
      emit({
        type: "run_stopped",
        at: snapshot.stoppedAt,
        reason: "completed",
      });
      return;
    }

    await jitter();

    const createdSubtasks = subtasks.map((title, i) => {
      const assignedTo: AgentId = i % 2 === 0 ? "research" : "build";
      const t = createTask({
        id: id("task"),
        title: `Подзадача: ${title}`,
        description: "Выполнить часть работы и вернуть результат.",
        assignedTo,
      });
      pushMsg(
        mkMessage({
          from: "planner",
          to: assignedTo,
          kind: "subtask",
          title: `Назначена подзадача → ${agentName(agents, assignedTo)}`,
          body: title,
          relatedTaskId: t.id,
        }),
      );
      return t;
    });

    const subResults: { taskId: string; by: AgentId; text: string }[] = [];

    for (const t of createdSubtasks) {
      updateTask(t.id, { status: "in_progress", startedAt: Date.now() });
      pushMsg(
        mkMessage({
          from: t.assignedTo,
          to: "all",
          kind: "log",
          title: "В работе",
          body: `${agentName(agents, t.assignedTo)} выполняет: "${t.title.replace(/^Подзадача:\s*/, "")}"`,
          relatedTaskId: t.id,
        }),
      );

      await jitter();
      await jitter();

      const resultText =
        t.assignedTo === "research"
          ? [
              "Ключевые требования: React + TypeScript, локальный запуск, лёгкий runtime.",
              "Важно показать: разбиение на подзадачи, обмен сообщениями, сборка результата.",
              "Визуализация: таймлайн событий, статусы задач, сообщения между агентами.",
            ].join("\n")
          : [
              "Решение: симуляция агентов с очередью задач и событиями (event log).",
              "UI: ввод задачи, кнопки старт/стоп, панель агентов, список задач с прогрессом, лента сообщений, итоговый ответ.",
              "Технически: асинхронный движок + AbortController для остановки.",
            ].join("\n");

      const result = normalizeWhitespace(resultText).replace(/\. /g, ".\n");
      subResults.push({ taskId: t.id, by: t.assignedTo, text: result });

      updateTask(t.id, { status: "done", finishedAt: Date.now(), result });
      pushMsg(
        mkMessage({
          from: t.assignedTo,
          to: "planner",
          kind: "result",
          title: `Результат подзадачи → ${agentName(agents, "planner")}`,
          body: result,
          relatedTaskId: t.id,
        }),
      );

      await jitter();
    }

    const buildTask = createTask({
      id: id("task"),
      title: "Сборка ответа",
      description: "Собрать результаты подзадач в единый ответ.",
      assignedTo: "build",
    });

    updateTask(buildTask.id, { status: "in_progress", startedAt: Date.now() });
    console.log(Date.now());
    pushMsg(
      mkMessage({
        from: "planner",
        to: "build",
        kind: "subtask",
        title: `Собери черновик ответа → ${agentName(agents, "build")}`,
        body: "Собери единый итог по результатам подзадач.",
        relatedTaskId: buildTask.id,
      }),
    );

    await jitter();
    await jitter();

    const draft =
      "Итог (черновик):\n" +
      subResults
        .map((r) => `- От ${agentName(agents, r.by)}:\n${r.text}`)
        .join("\n\n") +
      "\n\nАрхитектура взаимодействия:\n- Planner → создаёт план и задачи\n- Research/Build → выполняют подзадачи\n- Reviewer → проверяет качество и формирует финальный ответ\n- Event Bus → единая лента событий/сообщений\n";

    updateTask(buildTask.id, {
      status: "done",
      finishedAt: Date.now(),
      result: draft,
    });
    pushMsg(
      mkMessage({
        from: "build",
        to: "review",
        kind: "result",
        title: `Черновик ответа → ${agentName(agents, "review")}`,
        body: draft,
        relatedTaskId: buildTask.id,
      }),
    );

    await jitter();

    const reviewTask = createTask({
      id: id("task"),
      title: "Ревью и финализация",
      description: "Проверить черновик, улучшить и выдать финальный ответ.",
      assignedTo: "review",
    });

    updateTask(reviewTask.id, { status: "in_progress", startedAt: Date.now() });
    pushMsg(
      mkMessage({
        from: "review",
        to: "all",
        kind: "log",
        title: "Ревью начато",
        body: "Проверяю целостность, понятность и соответствие требованиям.",
        relatedTaskId: reviewTask.id,
      }),
    );

    await jitter();

    const notes = [
      "Добавить в UI: фильтры по агентам/типам событий, авто-скролл лога.",
      "Сделать кнопки: Demo задача, Очистить, Стоп.",
      "Показать прогресс: сколько задач done/total, статус текущего шага.",
    ].join("\n");

    pushMsg(
      mkMessage({
        from: "review",
        to: "build",
        kind: "review_notes",
        title: "Замечания ревьюера",
        body: notes,
        relatedTaskId: reviewTask.id,
      }),
    );

    await jitter();

    const finalAnswer =
      "Готово: симуляция AI Agents Workspace.\n\n" +
      "Что внутри:\n" +
      "- Несколько агентов с ролями (planner/researcher/builder/reviewer)\n" +
      "- Разбиение задачи на подзадачи и назначение исполнителей\n" +
      "- Обмен сообщениями между агентами\n" +
      "- Таймлайн событий, список задач со статусами, итоговый результат\n" +
      "- Остановка выполнения через AbortController\n\n" +
      "Как это работает:\n" +
      "Planner получает ввод, создаёт план и подзадачи → Research/Build выполняют с задержками и возвращают результаты → Build собирает черновик → Reviewer добавляет замечания и формирует финальный ответ.\n";

    updateTask(reviewTask.id, {
      status: "done",
      finishedAt: Date.now(),
      result: notes,
    });

    snapshot.finalAnswer = finalAnswer;
    emit({ type: "final", at: Date.now(), answer: finalAnswer });
    pushMsg(
      mkMessage({
        from: "review",
        to: "all",
        kind: "final_answer",
        title: "Финальный ответ",
        body: finalAnswer,
      }),
    );

    snapshot.isRunning = false;
    snapshot.stoppedAt = Date.now();
    emit({ type: "run_stopped", at: snapshot.stoppedAt, reason: "completed" });
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

    const at = Date.now();
    const message = mkMessage({
      from: "system",
      to: "all",
      kind: "log",
      title: "Ошибка движка",
      body:
        err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error",
      at,
    });
    pushMsg(message);
    snapshot.isRunning = false;
    snapshot.stoppedAt = Date.now();
    emit({ type: "run_stopped", at: snapshot.stoppedAt, reason: "completed" });
  });

  return {
    stop: () => ac.abort(),
    getSnapshot: () => snapshot,
  };
}
