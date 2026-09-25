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

import { BODY_ZONES, COMPLETION_STATUSES, PAIN_LEVELS } from "@hybride/domain";

import type {
  ConversationTurnInput,
  DebriefTurnInput,
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
- "suggestNextStep" vaut true si tu estimes avoir assez d'information pour cette étape.
- Si le champ "sportReferential" est fourni, tout "sportCode" que tu produis DOIT être copié tel quel depuis la colonne "code" de ce référentiel. Tu ne crées JAMAIS un code à partir des mots de l'utilisateur : « course à pied » doit donner "running", pas "course_a_pied". Choisis le code dont le libellé correspond le mieux à ce que décrit l'utilisateur.
- Uniquement si AUCUNE entrée du référentiel ne correspond raisonnablement (sport rare et réellement absent), tu peux proposer un nouveau code en minuscules sans accent, mots séparés par des underscores.`;

/**
 * Prompt du débrief post-séance (US-05, Lot L1, ADR-019 §5).
 *
 * Les énumérations sont ÉCRITES DANS LE PROMPT, dérivées des constantes du domaine plutôt que
 * recopiées à la main — une valeur ajoutée à `BODY_ZONES` apparaît ici sans intervention. Sans
 * cette liste, le modèle produit `genou_droit` là où le contrat attend `knee`, et le protocole
 * douleur ne se déclenche jamais. C'est exactement l'incident `course_a_pied` du 2026-09-18,
 * transposé à une donnée de santé.
 */
const DEBRIEF_SYSTEM_PROMPT = `Tu es le coach IA d'Hybride Club. Tu débriefes UNE séance qui vient d'avoir lieu.
Règles absolues :
- Tu ne calcules JAMAIS de charge, de volume ni d'intensité : un moteur à règles séparé s'en charge.
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte hors JSON, au format :
{"reply": string, "isReformulation": boolean, "extraction": object|null, "suggestNextStep": boolean}
- "extraction" ne contient QUE des champs de cette liste, et RIEN d'autre. Tout champ inventé fait rejeter l'extraction entière :
  completion   : ${COMPLETION_STATUSES.join(" | ")}
  pain         : ${PAIN_LEVELS.join(" | ")}
  painZone     : ${BODY_ZONES.join(" | ")}
  painAtRest   : true | false
  rpe          : entier de 1 à 10
  freshness    : entier de 1 à 5
  actualDurationMin : entier de 0 à 1440
  sportCode, sessionType, comment, notDoneReason
- Ces valeurs sont des CODES à recopier tels quels depuis les listes ci-dessus. Jamais de traduction, jamais d'invention : « j'ai mal au genou » donne "knee", pas "genou".
- Le champ "missingMandatory" de l'entrée dit ce qu'il te reste à obtenir. Demande-le, une chose à la fois, sans lire une liste à l'utilisateur.
- "missingDesired" (rpe, freshness) : demande-les UNE SEULE FOIS, les deux ensemble, en une phrase naturelle. S'ils ne viennent pas, n'insiste plus.
- Si tu n'es pas SÛR d'une valeur, ne l'extrais pas et repose la question autrement ("isReformulation": true). Une valeur inventée est pire qu'une valeur absente.
- N'explique jamais à quoi servent ces informations, et ne mentionne ni charge, ni ajustement, ni plan.
- "suggestNextStep" vaut true quand tu estimes le débrief terminé.
- Ton bref et concret, deux phrases maximum.`;

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
            ...(input.sportReferential?.length
              ? { sportReferential: input.sportReferential.map((s) => ({ code: s.code, label: s.labelFr })) }
              : {}),
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

  async converseDebrief(input: DebriefTurnInput): Promise<ConversationTurnOutput> {
    const response = await this.client.chat.complete({
      model: this.model,
      temperature: 0.3,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: DEBRIEF_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            session: input.session,
            draft: input.draft,
            missingMandatory: input.missingMandatory,
            missingDesired: input.missingDesired,
            history: input.history,
            userMessage: input.userMessage,
          }),
        },
      ],
    });

    const parsed = parseJsonObject(extractJsonContent(response.choices?.[0]?.message.content));
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
