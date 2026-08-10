/** Construit une trame SSE (`event: X\ndata: {...}\n\n`) — `08-architecture.md` §6.1. */
export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store",
  Connection: "keep-alive",
} as const;
