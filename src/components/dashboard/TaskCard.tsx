import type { AgentDefinition, WorkspaceTask } from "../../agents/types";

type Props = {
  task: WorkspaceTask;
  agents: AgentDefinition[];
};

export default function TaskCard({ task, agents }: Props) {
  const who =
    agents.find((a) => a.id === task.assignedTo)?.name ?? task.assignedTo;
  const badge =
    task.status === "done"
      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
      : task.status === "in_progress"
        ? "bg-amber-500/15 text-amber-200 ring-amber-500/30"
        : task.status === "failed"
          ? "bg-rose-500/15 text-rose-200 ring-rose-500/30"
          : "bg-zinc-500/15 text-zinc-200 ring-zinc-500/30";

  return (
    <div className="rounded-lg bg-zinc-950/60 p-3 ring-1 ring-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-100">{task.title}</div>
          <div className="mt-1 text-xs text-zinc-400">
            {who} · {new Date(task.createdAt).toLocaleString("ru-RU")}
          </div>
        </div>
        <div
          className={`shrink-0 rounded-full px-2 py-1 text-xs ring-1 ${badge}`}
        >
          {task.status}
        </div>
      </div>
      <div className="mt-2 text-xs leading-5 text-zinc-300">
        {task.description}
      </div>
      {task.result ? (
        <div className="mt-2 whitespace-pre-wrap rounded-md bg-zinc-950 p-2 text-xs text-zinc-200 ring-1 ring-zinc-800">
          {task.result}
        </div>
      ) : null}
      {task.error ? (
        <div className="mt-2 whitespace-pre-wrap rounded-md bg-rose-950/40 p-2 text-xs text-rose-200 ring-1 ring-rose-900">
          {task.error}
        </div>
      ) : null}
    </div>
  );
}
