import "./style/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createWorkspaceRun } from "./agents/engine";
import { DEFAULT_AGENTS } from "./agents/presets";
import type { AgentDefinition, RunSnapshot } from "./agents/types";
import TaskCard from "./components/dashboard/TaskCard";
import MessageRow from "./components/dashboard/MessageRow";

function App() {
  const agents = useMemo<AgentDefinition[]>(() => DEFAULT_AGENTS, []);

  const [input, setInput] = useState(
    "Сделай веб-приложение на React+TS, которое показывает взаимодействие нескольких AI-агентов: планировщик разбивает задачу на подзадачи, исполнители обрабатывают, ревьюер проверяет, всё визуализируется в ленте событий.",
  );

  const [snapshot, setSnapshot] = useState<RunSnapshot>({
    isRunning: false,
    userInput: "",
    tasks: [],
    messages: [],
    events: [],
  });

  const controllerRef = useRef<ReturnType<typeof createWorkspaceRun> | null>(
    null,
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const stop = () => {
    controllerRef.current?.stop();
    controllerRef.current = null;
  };

  const clear = () => {
    stop();
    setSnapshot({
      isRunning: false,
      userInput: "",
      tasks: [],
      messages: [],
      events: [],
    });
  };

  const start = () => {
    stop();
    const run = createWorkspaceRun(input, {
      agents,
      onEvent: () => {
        const next = controllerRef.current?.getSnapshot();
        if (next) setSnapshot({ ...next });
      },
    });
    controllerRef.current = run;
    setSnapshot({ ...run.getSnapshot() });
  };

  useEffect(() => {
    if (!snapshot.isRunning) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [snapshot.isRunning, snapshot.events.length]);

  useEffect(() => {
    return () => stop();
  }, []);

  const taskStats = useMemo(() => {
    const total = snapshot.tasks.length;
    const done = snapshot.tasks.filter((t) => t.status === "done").length;
    const inProgress = snapshot.tasks.filter(
      (t) => t.status === "in_progress",
    ).length;
    const queued = snapshot.tasks.filter((t) => t.status === "queued").length;
    const failed = snapshot.tasks.filter((t) => t.status === "failed").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, queued, failed, pct };
  }, [snapshot.tasks]);

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col items-end gap-2">
              <div className="text-xs text-zinc-400">
                Прогресс:
                <span className="text-zinc-200">{taskStats.pct}%</span>
                <span className="text-zinc-500">
                  ({taskStats.done}/{taskStats.total})
                </span>
              </div>
              <div className="h-2 w-48 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full bg-indigo-500"
                  style={{ width: `${taskStats.pct}%` }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={start}
                  disabled={snapshot.isRunning || !input.trim()}
                  className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Старт
                </button>
                <button
                  onClick={stop}
                  disabled={!snapshot.isRunning}
                  className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Стоп
                </button>
                <button
                  onClick={clear}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 ring-1 ring-zinc-800 hover:bg-zinc-900/70"
                >
                  Очистить
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl bg-zinc-900/40 p-4 ring-1 ring-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200">Задача</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Ввод пользователя. Нажмите “Старт”, чтобы запустить симуляцию.
            </p>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={8}
              className="mt-3 w-full resize-none rounded-lg bg-zinc-950 p-3 text-sm text-zinc-100 ring-1 ring-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Опишите задачу…"
            />
            <div className="mt-3 flex items-center justify-end">
              <button
                onClick={() =>
                  setInput(
                    "Сгенерируй концепт приложения: агентов 4 (Planner/Researcher/Builder/Reviewer), нужны задачи, сообщения, таймлайн событий, итоговый ответ. Сделай лёгкую архитектуру и красивый интерфейс.",
                  )
                }
                className="rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 ring-1 ring-zinc-800 hover:bg-zinc-950/60"
              >
                Demo-задача
              </button>
            </div>
          </section>

          <section className="rounded-xl bg-zinc-900/40 p-4 ring-1 ring-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200">Агенты</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Роли фиксированы, логика — mock/симуляция с задержками.
            </p>
            <div className="mt-3 space-y-3">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg bg-zinc-950/60 p-3 ring-1 ring-zinc-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-zinc-100">
                      {a.name}
                    </div>
                    <div className="text-xs text-zinc-400">{a.role}</div>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-zinc-300">
                    {a.description}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-zinc-900/40 p-4 ring-1 ring-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200">Итог</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Финальный результат формирует Reviewer.
            </p>
            <div className="mt-3 min-h-40 whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-sm text-zinc-100 ring-1 ring-zinc-800">
              {snapshot.finalAnswer ?? "Пока пусто. Запустите симуляцию."}
            </div>
          </section>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl bg-zinc-900/40 p-4 ring-1 ring-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-200">Задачи</h2>
            </div>
            <div className="mt-3 space-y-2">
              {snapshot.tasks.length === 0 ? (
                <div className="rounded-lg bg-zinc-950/60 p-3 text-sm text-zinc-400 ring-1 ring-zinc-800">
                  Задачи появятся после старта.
                </div>
              ) : (
                snapshot.tasks
                  .slice()
                  .reverse()
                  .map((t) => <TaskCard key={t.id} task={t} agents={agents} />)
              )}
            </div>
          </section>

          <section className="rounded-xl bg-zinc-900/40 p-4 ring-1 ring-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-200">
                Лента событий
              </h2>
              <div className="text-xs text-zinc-400">
                {snapshot.events.length} событий
              </div>
            </div>
            <div className="mt-3 h-[520px] overflow-auto rounded-lg bg-zinc-950 ring-1 ring-zinc-800">
              <div className="divide-y divide-zinc-900">
                {snapshot.messages.length === 0 ? (
                  <div className="p-3 text-sm text-zinc-400">
                    События появятся после старта.
                  </div>
                ) : (
                  snapshot.messages.map((m) => (
                    <MessageRow key={m.id} msg={m} agents={agents} />
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;
