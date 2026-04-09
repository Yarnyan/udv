import type { AgentDefinition } from "./types";

export const DEFAULT_AGENTS: AgentDefinition[] = [
  {
    id: "planner",
    name: "Planner",
    role: "planner",
    color: "indigo",
    description: "Декомпозиция задачи, постановка подзадач, маршрутизация.",
  },
  {
    id: "research",
    name: "Researcher",
    role: "researcher",
    color: "emerald",
    description: "Сбор требований, поиск вариантов, формулировка идей.",
  },
  {
    id: "build",
    name: "Builder",
    role: "builder",
    color: "amber",
    description: "Сборка решения из результатов, формирование черновика.",
  },
  {
    id: "review",
    name: "Reviewer",
    role: "reviewer",
    color: "rose",
    description: "Критический взгляд, улучшения, финализация.",
  },
];
