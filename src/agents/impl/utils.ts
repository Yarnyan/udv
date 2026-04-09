import type { AgentDefinition, AgentId } from "../types";

export function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function agentName(agents: AgentDefinition[], id: AgentId) {
  return agents.find((a) => a.id === id)?.name ?? id;
}

export function splitIntoSubtasks(userInput: string) {
  const base = normalizeWhitespace(userInput);
  if (!base) return [];

  const sentences = base
    .split(/(?<=[.!?])\s+/)
    .map((x) => normalizeWhitespace(x))
    .filter(Boolean);

  const keywords = [
    { k: /ui|интерфейс|ux|дизайн/i, t: "Продумать интерфейс и визуализацию" },
    { k: /архитектур|структур|модул/i, t: "Сформировать архитектуру взаимодействия агентов" },
    { k: /лог|событ|таймлайн|визуал/i, t: "Сделать ленту событий и сообщения" },
    { k: /запуск|локальн|vite|react/i, t: "Настроить локальный запуск и сборку" },
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

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

