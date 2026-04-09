import { useMemo } from "react";
import ReactFlow, {
  Background,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";

import type {
  AgentDefinition,
  AgentId,
  AgentMessage,
} from "../../agents/types";

type Props = {
  agents: AgentDefinition[];
  messages: AgentMessage[];
};

const BROADCAST_ID = "broadcast" as const;

function isAgentId(x: AgentMessage["from"] | AgentMessage["to"]): x is AgentId {
  return x === "planner" || x === "research" || x === "build" || x === "review";
}

function nodeColor(role: AgentDefinition["role"]) {
  switch (role) {
    case "planner":
      return "#6366f1";
    case "researcher":
      return "#10b981";
    case "builder":
      return "#f59e0b";
    case "reviewer":
      return "#f43f5e";
    default:
      return "#a1a1aa";
  }
}

function shortKind(kind: AgentMessage["kind"]) {
  switch (kind) {
    case "user_task":
      return "task";
    case "subtask":
      return "sub";
    case "bid_request":
      return "bid?";
    case "bid":
      return "bid";
    case "assignment":
      return "asgn";
    case "decision":
      return "dec";
    case "plan":
      return "plan";
    case "result":
      return "res";
    case "review_notes":
      return "rev";
    case "final_answer":
      return "final";
    case "log":
    default:
      return "log";
  }
}

export default function AgentsFlow({ agents, messages }: Props) {
  const nodes = useMemo<Node[]>(() => {
    const byId = new Map(agents.map((a) => [a.id, a]));

    const layout: { id: AgentId; x: number; y: number }[] = [
      { id: "planner", x: 60, y: 50 },
      { id: "research", x: 60, y: 360 },
      { id: "build", x: 540, y: 360 },
      { id: "review", x: 540, y: 50 },
    ];

    const agentNodes = layout
      .map(({ id, x, y }) => {
        const a = byId.get(id);
        if (!a) return null;
        const isLeft = id === "planner" || id === "research";
        const isTop = id === "planner" || id === "review";
        return {
          id: a.id,
          position: { x, y },
          data: { label: `${a.name}\n${a.role}` },
          sourcePosition: isLeft ? Position.Right : Position.Left,
          targetPosition: isLeft ? Position.Right : Position.Left,
          style: {
            borderRadius: 12,
            border: `1px solid ${nodeColor(a.role)}`,
            background: "rgba(9, 9, 11, 0.8)",
            color: "#fafafa",
            width: 240,
            whiteSpace: "pre-line",
            padding: 12,
          },
          ...(isTop ? { dragHandle: undefined } : {}),
        } satisfies Node;
      })
      .filter(Boolean) as Node[];

    const broadcastNode: Node = {
      id: BROADCAST_ID,
      position: { x: 320, y: 205 },
      data: { label: "Broadcast\n(всё)" },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: {
        borderRadius: 12,
        border: "1px dashed rgba(161,161,170,0.7)",
        background: "rgba(9, 9, 11, 0.55)",
        color: "rgba(244,244,245,0.9)",
        width: 160,
        whiteSpace: "pre-line",
        padding: 10,
      },
    };

    return [...agentNodes, broadcastNode];
  }, [agents]);

  const edges = useMemo<Edge[]>(() => {
    const pairs = new Map<
      string,
      { from: string; to: string; count: number; lastAt: number; kind: string }
    >();

    const now = Date.now();

    const add = (from: string, to: string, kind: string, at: number) => {
      const key = `${from}=>${to}`;
      const prev = pairs.get(key);
      if (!prev) {
        pairs.set(key, { from, to, count: 1, lastAt: at, kind });
        return;
      }
      pairs.set(key, {
        ...prev,
        count: prev.count + 1,
        lastAt: Math.max(prev.lastAt, at),
        kind,
      });
    };

    for (const m of messages) {
      if (!isAgentId(m.from)) continue;

      if (m.to === "all") {
        add(m.from, BROADCAST_ID, m.kind, m.at);
        for (const a of agents) {
          if (a.id !== m.from) add(BROADCAST_ID, a.id, m.kind, m.at);
        }
        continue;
      }

      if (!isAgentId(m.to)) continue;
      add(m.from, m.to, m.kind, m.at);
    }

    const edgeList: Edge[] = [];
    for (const p of pairs.values()) {
      const isHot = now - p.lastAt <= 2000;
      const kindShort = shortKind(p.kind as AgentMessage["kind"]);
      edgeList.push({
        id: `e_${p.from}_${p.to}`,
        source: p.from,
        target: p.to,
        type: "bezier",
        animated: isHot,
        label: `${kindShort} ${p.count}`,
        style: {
          stroke: isHot ? "#a5b4fc" : "rgba(161,161,170,0.7)",
          strokeWidth: isHot ? 2.5 : 1.5,
        },
        labelStyle: {
          fill: "rgba(244,244,245,0.95)",
          fontSize: 12,
          fontWeight: 600,
        },
        labelShowBg: true,
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 6,
        labelBgStyle: {
          fill: "rgba(9, 9, 11, 0.85)",
          stroke: "rgba(63, 63, 70, 0.9)",
          strokeWidth: 1,
        },
      });
    }

    return edgeList;
  }, [agents, messages]);

  return (
    <div className="h-[520px] w-full overflow-hidden rounded-lg bg-zinc-950 ring-1 ring-zinc-800">
      <ReactFlow
        className="!bg-zinc-950"
        style={{ background: "#09090b" }}
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="rgba(63,63,70,0.5)" />
      </ReactFlow>
    </div>
  );
}
