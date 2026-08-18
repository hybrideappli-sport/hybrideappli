"use client";

/** État « le coach écrit sa réponse » (`04-flow.md`, notes UX fiche §6). */
export function CoachTypingIndicator() {
  return (
    <div data-testid="coach-typing-indicator" className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-center gap-1 rounded-lg rounded-bl-[4px] bg-surface px-4 py-3">
        <span className="sr-only">Le coach écrit sa réponse…</span>
        <span className="h-1.5 w-1.5 motion-safe:animate-bounce rounded-full bg-foreground-subtle [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 motion-safe:animate-bounce rounded-full bg-foreground-subtle [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 motion-safe:animate-bounce rounded-full bg-foreground-subtle" />
      </div>
    </div>
  );
}
