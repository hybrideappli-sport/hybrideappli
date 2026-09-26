"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { CreateSessionLogResponse } from "@hybride/domain";

import { AnswerInput } from "@/components/onboarding/answer-input";
import { ChatBubble } from "@/components/onboarding/chat-bubble";
import { CoachTypingIndicator } from "@/components/onboarding/coach-typing-indicator";
import { Button } from "@/components/ui/button";
import { debriefOpening, describeChoice, type ClosedQuestion, type ClosedQuestionField, type DebriefChoice } from "@/lib/debrief/closed-questions";
import type { DebriefTurnResponse } from "@/lib/debrief/types";
import { cn } from "@/lib/utils";

import { AdjustmentFeedback } from "./adjustment-feedback";
import { DailyLogForm } from "./daily-log-form";

type Message = { id: string; role: "coach" | "user"; content: string; isReformulation: boolean };

export interface DebriefChatProps {
  plannedSessionId: string;
  loggedDate: string;
  sessionLabel: string | null;
  initialMessages: Message[];
  initialClosedQuestion: ClosedQuestion | null;
  initialSessionLogId: string | null;
}

/** Charte §4.4 — chips de réponse ; le domaine douleur passe en orange, jamais en violet. */
const CHIP_BASE =
  "flex h-11 min-w-11 items-center justify-center rounded-full px-5 text-body-strong font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:text-foreground-subtle";
const CHIP_UNSELECTED = "bg-transparent text-foreground-muted hover:bg-surface-raised hover:text-foreground";
const PAIN_FIELDS: ClosedQuestionField[] = ["pain", "painZone"];

/**
 * `DebriefChat` — le débrief de la séance planifiée du jour, en conversation (US-05, Lot L3,
 * ADR-019). Remplace le formulaire sur ce seul cas ; le formulaire reste accessible à tout moment,
 * et prend le relais si le coach ne répond pas.
 *
 * Aucun appel au modèle au montage : le message d'ouverture est affiché localement (le même texte
 * est persisté par le serveur au premier échange). Le premier appel LLM n'a lieu qu'au premier
 * message de l'utilisateur.
 */
export function DebriefChat({ plannedSessionId, loggedDate, sessionLabel, initialMessages, initialClosedQuestion, initialSessionLogId }: DebriefChatProps) {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages.length > 0 ? initialMessages : [{ id: "opening", role: "coach", content: debriefOpening(sessionLabel), isReformulation: false }],
  );
  const [closedQuestion, setClosedQuestion] = useState<ClosedQuestion | null>(initialClosedQuestion);
  const [sessionLogId, setSessionLogId] = useState<string | null>(initialSessionLogId);
  const [lastWrite, setLastWrite] = useState<{ result: CreateSessionLogResponse; painZone: DebriefTurnResponse["painZone"] } | null>(null);
  const [closed, setClosed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Repli sur le formulaire : à la demande de l'utilisateur, ou quand le coach ne répond pas.
  const [fallback, setFallback] = useState<null | "chosen" | "llm-unavailable">(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pending, closedQuestion]);

  async function send(body: { content: string } | { choice: DebriefChoice }, userText: string) {
    setError(null);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: userText, isReformulation: false }]);
    setClosedQuestion(null);
    setPending(true);

    try {
      const response = await fetch(`/api/v1/debrief/${plannedSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Coach indisponible (fournisseur en échec) ou débrief refusé par le paywall : le formulaire
      // prend le relais. Jamais d'écran bloqué sur un échange qui ne peut plus avancer.
      if (response.status === 503 || response.status === 402) {
        setFallback("llm-unavailable");
        return;
      }
      const data = (await response.json().catch(() => null)) as DebriefTurnResponse | { error?: { message?: string } } | null;
      if (!response.ok || !data || !("reply" in data)) {
        throw new Error((data as { error?: { message?: string } } | null)?.error?.message ?? "Le coach n'a pas pu répondre. Réessaie.");
      }

      setMessages((prev) => [...prev, { id: `coach-${Date.now()}`, role: "coach", content: data.reply, isReformulation: data.isReformulation }]);
      setClosedQuestion(data.closedQuestion);
      setSessionLogId(data.sessionLogId);
      if (data.logWrite) setLastWrite({ result: data.logWrite.result, painZone: data.painZone });
      if (data.canClose || data.reachedTurnLimit) setClosed(true);
    } catch (err) {
      // Une panne réseau vaut une panne du coach : sans réponse, le formulaire est le seul chemin.
      if (err instanceof TypeError) {
        setFallback("llm-unavailable");
        return;
      }
      setError(err instanceof Error ? err.message : "Le coach n'a pas pu répondre. Réessaie.");
    } finally {
      setPending(false);
    }
  }

  if (fallback) {
    return (
      <div className="flex flex-col gap-3" data-testid="debrief-fallback">
        {fallback === "llm-unavailable" ? (
          <p role="status" className="rounded-lg bg-surface-raised p-4 text-body text-foreground-muted">
            Le coach ne peut pas répondre pour le moment.
            {sessionLogId ? " Ta séance est déjà enregistrée." : " Tu peux saisir ta séance ici."}
          </p>
        ) : null}
        {/* Un log déjà écrit par la conversation ne doit jamais être doublé par un second POST : on
            renvoie vers la correction de CE log plutôt que vers le formulaire de saisie. */}
        {sessionLogId ? (
          <Link href={`/aujourdhui?log=${sessionLogId}`} className="text-body-strong font-semibold text-accent underline-offset-4 hover:underline">
            Compléter ma saisie →
          </Link>
        ) : (
          <DailyLogForm mode="planned" plannedSessionId={plannedSessionId} loggedDate={loggedDate} />
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3" data-testid="debrief-chat" aria-label="Débrief de ta séance avec le coach">
      <div className="flex flex-col gap-3 rounded-lg bg-surface-sunken p-4">
        <p className="text-label text-accent-text">Débrief avec le coach</p>
        <div className="flex flex-col gap-3" aria-live="polite">
          {messages.map((message) => (
            <ChatBubble key={message.id} role={message.role} content={message.content} isReformulation={message.isReformulation} />
          ))}
          {pending ? <CoachTypingIndicator /> : null}
        </div>

        {closedQuestion && !pending ? <ClosedQuestionPicker question={closedQuestion} onAnswer={(choice) => void send({ choice }, describeChoice(choice))} /> : null}

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {lastWrite ? <AdjustmentFeedback result={lastWrite.result} painZone={lastWrite.painZone} /> : null}

      {closed ? null : <AnswerInput onSubmit={(content) => void send({ content }, content)} disabled={pending} />}

      {sessionLogId ? null : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setFallback("chosen")} data-testid="debrief-use-form">
          Je préfère le formulaire
        </Button>
      )}
    </section>
  );
}

/**
 * Question fermée (ADR-019 §6). Un seul groupe obligatoire : un chip est une réponse, envoyée tout
 * de suite. Plusieurs groupes (`rpe` + `freshness`, demandés ensemble) : on choisit, puis on envoie
 * — ou on passe, puisque ces deux-là ne bloquent jamais.
 */
function ClosedQuestionPicker({ question, onAnswer }: { question: ClosedQuestion; onAnswer: (choice: DebriefChoice) => void }) {
  const [selection, setSelection] = useState<Partial<Record<ClosedQuestionField, string | number>>>({});
  const immediate = question.groups.length === 1 && !question.skippable;

  function choose(field: ClosedQuestionField, value: string | number) {
    if (immediate) {
      onAnswer({ [field]: value } as DebriefChoice);
      return;
    }
    setSelection((prev) => ({ ...prev, [field]: value }));
  }

  const selectedEntries = Object.entries(selection) as [ClosedQuestionField, string | number][];

  return (
    <div className="flex flex-col gap-4" data-testid="debrief-closed-question">
      {question.groups.map((group) => {
        const legendId = `debrief-${group.field}-legend`;
        const painDomain = PAIN_FIELDS.includes(group.field);
        return (
          <div key={group.field} className="flex flex-col gap-2">
            <p id={legendId} className="text-small text-foreground-muted">
              {group.legend}
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={legendId}>
              {group.options.map((option) => {
                const selected = selection[group.field] === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => choose(group.field, option.value)}
                    className={cn(CHIP_BASE, selected ? (painDomain ? "bg-warning text-on-accent" : "bg-accent text-on-accent") : CHIP_UNSELECTED)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {immediate ? null : (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={selectedEntries.length === 0}
            onClick={() => onAnswer(Object.fromEntries(selectedEntries) as DebriefChoice)}
          >
            Envoyer
          </Button>
          {question.skippable ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onAnswer({ skip: true })}>
              Passer
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
