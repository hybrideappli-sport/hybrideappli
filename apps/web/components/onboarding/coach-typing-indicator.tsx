"use client";

/** État « le coach écrit sa réponse » (`04-flow.md`, notes UX fiche §6). */
export function CoachTypingIndicator() {
  return (
    <div data-testid="coach-typing-indicator" className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-center gap-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
        <span className="sr-only">Le coach écrit sa réponse…</span>
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
      </div>
    </div>
  );
}
