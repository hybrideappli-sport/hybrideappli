"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { OnboardingMessageView, OnboardingStep } from "@hybride/domain";

import { ChatBubble } from "@/components/onboarding/chat-bubble";
import { CoachTypingIndicator } from "@/components/onboarding/coach-typing-indicator";
import { AnswerInput } from "@/components/onboarding/answer-input";

type LocalMessage = { id: string; role: "coach" | "user"; content: string; isReformulation: boolean };

function toLocalMessage(message: OnboardingMessageView): LocalMessage {
  return { id: message.id, role: message.role === "user" ? "user" : "coach", content: message.content, isReformulation: message.isReformulation };
}

/** Parseur SSE minimal : `event: X\ndata: {...}\n\n` (voir `apps/web/lib/api/sse.ts`, le producteur). */
function parseSseChunk(chunk: string): Array<{ event: string; data: unknown }> {
  const frames: Array<{ event: string; data: unknown }> = [];
  for (const block of chunk.split("\n\n")) {
    if (!block.trim()) continue;
    const eventLine = block.split("\n").find((l) => l.startsWith("event: "));
    const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
    if (!eventLine || !dataLine) continue;
    try {
      frames.push({ event: eventLine.slice("event: ".length), data: JSON.parse(dataLine.slice("data: ".length)) });
    } catch {
      // trame malformée — ignorée, pas d'échec du chat pour un incident réseau ponctuel
    }
  }
  return frames;
}

export function CoachChat() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // React StrictMode (dev) monte cet effet deux fois (montage → nettoyage → remontage) : DEUX
  // `POST /api/v1/onboarding/session` peuvent donc partir avant qu'aucun n'ait committé. C'est
  // volontairement TOLÉRÉ ici plutôt que déduplifié côté client (un garde `useRef` naïf casse le
  // pattern `cancelled` ci-dessous : son nettoyage du PREMIER montage marque `cancelled = true`
  // sur la fermeture unique alors utilisée par le SECOND montage, qui ne relance jamais `start()`
  // — plus aucun appel ne peut alors jamais poser `pending = false`, écran de chat bloqué en
  // « le coach écrit » indéfiniment). La sûreté de la course est garantie côté base
  // (`onboarding_sessions_one_in_progress`, contrainte d'unicité + relecture sur 23505 dans la
  // route) : les deux appels convergent vers la MÊME session, seul le second `setSessionId` (dont
  // le `cancelled` local vaut `false`) fait effet.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const response = await fetch("/api/v1/onboarding/session", { method: "POST" });
        if (!response.ok) throw new Error("Impossible de démarrer la conversation avec le coach.");
        const data: { sessionId: string; step: OnboardingStep; messages: OnboardingMessageView[] } = await response.json();
        if (cancelled) return;
        setSessionId(data.sessionId);
        setMessages(data.messages.map(toLocalMessage));
        if (data.step === "disclaimer" || data.step === "health_consent" || data.step === "review") {
          router.push(data.step === "review" ? "/onboarding/recap" : `/onboarding/${data.step === "disclaimer" ? "disclaimer" : "consentement"}`);
          return;
        }
      } catch {
        if (!cancelled) setError("Impossible de démarrer la conversation. Réessaie dans quelques instants.");
      } finally {
        if (!cancelled) setPending(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function handleSend(content: string) {
    if (!sessionId) return;
    setError(null);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content, isReformulation: false }]);
    setPending(true);

    try {
      const response = await fetch(`/api/v1/onboarding/session/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Le coach n'a pas pu répondre. Réessaie.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";
      let isReformulation = false;
      let nextStep: OnboardingStep | null = null;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = parseSseChunk(buffer);
        buffer = "";
        for (const frame of frames) {
          if (frame.event === "token") reply = (frame.data as { content: string }).content;
          if (frame.event === "draft_patch") isReformulation = (frame.data as { isReformulation: boolean }).isReformulation;
          if (frame.event === "next_step") nextStep = (frame.data as { step: OnboardingStep }).step;
        }
      }

      setMessages((prev) => [...prev, { id: `coach-${Date.now()}`, role: "coach", content: reply, isReformulation }]);

      if (nextStep === "disclaimer") {
        router.push("/onboarding/disclaimer");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le coach n'a pas pu répondre. Réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-lg bg-surface">
      <div className="bg-surface-sunken px-4 py-3">
        <h1 className="text-heading font-semibold text-foreground">Ton coach IA</h1>
        <p className="text-caption text-foreground-subtle">Quelques questions pour construire ton premier plan.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <ChatBubble key={message.id} role={message.role} content={message.content} isReformulation={message.isReformulation} />
        ))}
        {pending ? <CoachTypingIndicator /> : null}
        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <AnswerInput onSubmit={handleSend} disabled={pending || !sessionId} />
    </div>
  );
}
