import type { AgentDefinition, AgentMessage } from "../../agents/types";

type Props = {
  msg: AgentMessage;
  agents: AgentDefinition[];
};

export default function MessageRow({ msg, agents }: Props) {
  const fromLabel =
    msg.from === "user"
      ? "User"
      : msg.from === "system"
        ? "System"
        : (agents.find((a) => a.id === msg.from)?.name ?? msg.from);
  const toLabel =
    msg.to === "all"
      ? "all"
      : (agents.find((a) => a.id === msg.to)?.name ?? msg.to);

  const kindColor =
    msg.kind === "final_answer"
      ? "text-indigo-200"
      : msg.kind === "review_notes"
        ? "text-rose-200"
        : msg.kind === "plan"
          ? "text-emerald-200"
          : msg.kind === "result"
            ? "text-amber-200"
            : "text-zinc-200";

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span className="rounded bg-zinc-900 px-2 py-1 ring-1 ring-zinc-800">
            {new Date(msg.at).toLocaleString("ru-RU")}
          </span>
          <span>
            <span className="text-zinc-200">{fromLabel}</span> →
            <span className="text-zinc-200">{toLabel}</span>
          </span>
          <span
            className={`rounded bg-zinc-900 px-2 py-1 font-medium ring-1 ring-zinc-800 ${kindColor}`}
          >
            {msg.kind}
          </span>
          {msg.relatedTaskId ? (
            <span className="text-zinc-500">
              task: {msg.relatedTaskId.slice(-6)}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-zinc-500">{msg.title}</div>
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-100">
        {msg.body}
      </div>
    </div>
  );
}
