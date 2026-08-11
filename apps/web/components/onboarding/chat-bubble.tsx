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
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
          isCoach
            ? isReformulation
              ? "border border-orange-300 bg-orange-50 text-orange-900"
              : "bg-white border border-neutral-200 text-neutral-900"
            : "bg-orange-400 text-white",
        )}
      >
        {isReformulation ? (
          <p className="mb-1 text-xs font-medium text-orange-600" role="status">
            Je n&apos;ai pas bien compris, je reformule :
          </p>
        ) : null}
        {content}
      </div>
    </div>
  );
}
