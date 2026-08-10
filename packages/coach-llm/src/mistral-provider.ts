/**
 * `MistralLlmProvider` — adaptateur concret pour Mistral AI (ADR-010 : entité UE, DPA natif
 * RGPD, pas d'entraînement sur les données API — voir ADR-010 « Questions ouvertes… tranché le
 * 2026-08-06 »). Unique point du monorepo qui appelle réellement le réseau pour la conversation
 * et la rédaction d'explications ; jamais exécuté par la suite de tests automatisée (voir
 * `no-engine-import.test.ts` et la note sur le mock déterministe dans `mock-provider.ts`).
 *
 * Minimisation (ADR-010 §4) : aucun identifiant direct n'est jamais transmis. L'appelant doit
 * fournir un `correlationId` éphémère (pas un `user_id`) et des `DecisionTrace` déjà réduites
 * (`LlmTraceInput`, sans `user_id`/`id` de base). Ce fichier ne fait aucune vérification
 * supplémentaire sur ce point : c'est un contrat de frontière, tenu par l'appelant
 * (`apps/web/lib/orchestration/*`).
 */

import { Mistral } from "@mistralai/mistralai";

import type {
  ConversationTurnInput,
  ConversationTurnOutput,
  ExplanationOutput,
  ExplanationRequest,
  LlmProvider,
} from "./llm-provider";

export interface MistralLlmProviderOptions {
  apiKey: string;
  /** `mistral-small-latest` par défaut : suffisant pour une conversation guidée + reformulation de traces déjà calculées. */
  model?: string;
}

const DEFAULT_MODEL = "mistral-small-latest";

const CONVERSATION_SYSTEM_PROMPT = `Tu es le coach IA d'Hybride Club, un assistant d'onboarding sportif.
Règles absolues :
- Tu ne calcules JAMAIS de volume, charge, intensité, ni de valeur chiffrée de plan : cette responsabilité appartient exclusivement à un moteur à règles séparé.
- Tu ne reçois et ne dois jamais réclamer d'identifiant direct (nom, e-mail).
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte hors JSON, au format :
{"reply": string, "isReformulation": boolean, "extraction": object|null, "suggestNextStep": boolean}
- "extraction" est un patch partiel du profil structuré en cours de construction pour l'étape courante, ou null si rien n'a pu être extrait.
- "isReformulation" vaut true si tu n'as pas compris la réponse de l'utilisateur et que tu reformules ta question.
- "suggestNextStep" vaut true si tu estimes avoir assez d'information pour cette étape.`;

const EXPLANATION_SYSTEM_PROMPT = `Tu rédiges une explication courte puis longue à partir de décisions DÉJÀ calculées par un moteur à règles (fourni ci-dessous sous forme de traces).
Règles absolues :
- Tu n'inventes JAMAIS un chiffre : tout nombre que tu écris doit être recopié EXACTEMENT d'une valeur présente dans les traces fournies (aucun arrondi, aucune conversion, aucun calcul).
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte hors JSON, au format : {"shortText": string, "longText": string}.
- "shortText" cite la donnée précise qui justifie la recommandation (pas de justification générique). "longText" développe le raisonnement complet.`;

function extractJsonContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((chunk) => (typeof chunk === "object" && chunk !== null && "text" in chunk ? String((chunk as { text: unknown }).text) : ""))
      .join("");
  }
  throw new Error("MistralLlmProvider: réponse sans contenu textuel exploitable.");
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MistralLlmProvider: réponse JSON invalide (objet attendu).");
  }
  return parsed as Record<string, unknown>;
}

export class MistralLlmProvider implements LlmProvider {
  readonly name: string;
  private readonly client: Mistral;
  private readonly model: string;

  constructor(options: MistralLlmProviderOptions) {
    this.client = new Mistral({ apiKey: options.apiKey, server: "eu" });
    this.model = options.model ?? DEFAULT_MODEL;
    this.name = `mistral:${this.model}`;
  }

  async converseOnboarding(input: ConversationTurnInput): Promise<ConversationTurnOutput> {
    const response = await this.client.chat.complete({
      model: this.model,
      temperature: 0.3,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: CONVERSATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            step: input.step,
            history: input.history,
            profileDraft: input.profileDraft,
            userMessage: input.userMessage,
          }),
        },
      ],
    });

    const raw = extractJsonContent(response.choices?.[0]?.message.content);
    const parsed = parseJsonObject(raw);

    return {
      reply: typeof parsed["reply"] === "string" ? parsed["reply"] : "",
      isReformulation: parsed["isReformulation"] === true,
      extraction:
        typeof parsed["extraction"] === "object" && parsed["extraction"] !== null
          ? (parsed["extraction"] as Record<string, unknown>)
          : null,
      suggestNextStep: parsed["suggestNextStep"] === true,
    };
  }

  async renderExplanation(input: ExplanationRequest): Promise<ExplanationOutput> {
    const response = await this.client.chat.complete({
      model: this.model,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: EXPLANATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            subjectType: input.subjectType,
            traces: input.traces,
            correlationId: input.correlationId,
          }),
        },
      ],
    });

    const raw = extractJsonContent(response.choices?.[0]?.message.content);
    const parsed = parseJsonObject(raw);

    return {
      shortText: typeof parsed["shortText"] === "string" ? parsed["shortText"] : "",
      longText: typeof parsed["longText"] === "string" ? parsed["longText"] : "",
    };
  }
}
