import { cn } from "@/lib/utils";

export type ChatBubbleRole = "coach" | "user";

type ChatBubbleProps = {
  role: ChatBubbleRole;
  content: string;
  /** État d'erreur avec reformulation (`04-flow.md`) — le coach signale qu'il n'a pas compris. */
  isReformulation?: boolean;
};

export function ChatBubble({ role, content, isReformulation = false }: ChatBubbleProps) {
  const isCoach = role === "coach";
  return (
    <div className={cn("flex w-full", isCoach ? "justify-start" : "justify-end")}>
      <div
        data-testid="chat-bubble"
        data-role={role}
        data-reformulation={isReformulation}
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-body",
          isCoach
            ? "rounded-bl-[4px] bg-surface text-foreground"
            : "rounded-br-[4px] bg-accent text-on-accent",
        )}
      >
        {isReformulation ? (
          <p className="text-label mb-1 text-warning" role="status">
            Je n&apos;ai pas bien compris
          </p>
        ) : null}
        {content}
      </div>
    </div>
  );
}
