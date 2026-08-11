/**
 * `DeterministicMockLlmProvider` — le fournisseur qui tourne dans TOUTE la suite de tests
 * automatisée (unitaire, intégration, E2E) et en environnement `test` : ZÉRO appel réseau, sortie
 * strictement déterministe pour une entrée donnée (`08-architecture.md` §9, table des
 * environnements : « mock déterministe par défaut » en local/CI).
 *
 * Le script ci-dessous couvre les 7 étapes conversationnelles de l'onboarding
 * (`ONBOARDING_CHAT_STEPS`, `@hybride/domain`) : pour un `step` donné, `userMessage` est traité
 * comme LA réponse à la question de cette étape ; la sortie extrait un patch de profil ET pose la
 * question de l'étape suivante. Deux étapes ont un vocabulaire fermé et peuvent donc déclencher
 * une reformulation (`level`, `sports`) — c'est le comportement exercé par
 * `onboarding-misunderstood.spec.ts`.
 */

import type {
  ConversationTurnInput,
  ConversationTurnOutput,
  ExplanationOutput,
  ExplanationRequest,
  LlmProvider,
} from "./llm-provider";
import { renderTemplateExplanation } from "./template-explanation";

const QUESTIONS: Record<string, string> = {
  intro: "Bonjour, je suis ton coach. Quel est ton objectif principal, et pour quelle date si tu en as une en tête ?",
  goal: "Quel est ton objectif principal, et pour quelle date si tu en as une en tête ?",
  level: "Quel est ton niveau aujourd'hui : débutant, intermédiaire ou avancé ?",
  history: "Combien de séances et d'heures par semaine t'entraînes-tu en ce moment ?",
  sports: "Quel(s) sport(s) pratiques-tu ? (séparés par une virgule si plusieurs)",
  availability: "Combien de minutes peux-tu consacrer par séance, en général ?",
  nutrition: "As-tu des habitudes ou contraintes alimentaires particulières ?",
  risk_filter:
    "Dernière question importante : es-tu mineur, enceinte, as-tu une pathologie déclarée ou des antécédents de troubles du comportement alimentaire ?",
};

const NEXT_QUESTION: Record<string, string> = {
  goal: QUESTIONS.level!,
  level: QUESTIONS.history!,
  history: QUESTIONS.sports!,
  sports: QUESTIONS.availability!,
  availability: QUESTIONS.nutrition!,
  nutrition: QUESTIONS.risk_filter!,
  risk_filter:
    "Merci, c'est noté. On passe maintenant à deux étapes importantes : l'avertissement du coach IA, puis le consentement pour tes données de santé.",
};

const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/;
const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface StepOutcome {
  reply: string;
  extraction: Record<string, unknown> | null;
  isReformulation: boolean;
  suggestNextStep: boolean;
}

const WEEKLY_HOURS_PATTERN = /(\d+(?:[.,]\d+)?)\s*h(?:eures?)?(?:\s*\/?\s*semaine)?/i;

function handleGoal(message: string): StepOutcome {
  const dateMatch = message.match(DATE_PATTERN);
  // AC2 (négociation d'objectif) — reconnaît un volume hebdomadaire visé explicite (ex. « 40h par
  // semaine ») quand le message le mentionne, seul champ lu par `evaluateObjectiveFeasibility`
  // (Lot L2, `packages/rules-engine/src/objective-feasibility.ts`). Sans lui, la fiche AC2 est
  // structurellement indéclenchable via le chat mock — nécessaire à `onboarding-negotiation.spec.ts`.
  const hoursMatch = message.match(WEEKLY_HOURS_PATTERN);
  const targetWeeklyHours = hoursMatch ? Number.parseFloat(hoursMatch[1]!.replace(",", ".")) : null;

  return {
    reply: NEXT_QUESTION.goal!,
    extraction: {
      objective: {
        kind: "general_fitness",
        label: message.trim().slice(0, 200) || "Objectif à préciser",
        targetDate: dateMatch ? dateMatch[0] : null,
        targetMetric: targetWeeklyHours !== null ? { targetWeeklyHours } : {},
      },
    },
    isReformulation: false,
    suggestNextStep: true,
  };
}

function handleLevel(message: string): StepOutcome {
  const lower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let level: "beginner" | "intermediate" | "advanced" | null = null;
  if (lower.includes("debutant") || lower.includes("beginner")) level = "beginner";
  else if (lower.includes("intermediaire") || lower.includes("intermediate")) level = "intermediate";
  else if (lower.includes("avance") || lower.includes("advanced")) level = "advanced";

  if (!level) {
    return {
      reply: "Je n'ai pas bien compris ton niveau : réponds par « débutant », « intermédiaire » ou « avancé ».",
      extraction: null,
      isReformulation: true,
      suggestNextStep: false,
    };
  }

  return {
    reply: NEXT_QUESTION.level!,
    extraction: { experienceLevel: level },
    isReformulation: false,
    suggestNextStep: true,
  };
}

function handleHistory(message: string): StepOutcome {
  const numbers = (message.match(NUMBER_PATTERN) ?? []).map((n) => Number.parseFloat(n.replace(",", ".")));
  return {
    reply: NEXT_QUESTION.history!,
    extraction: {
      declaredWeeklySessions: numbers[0] !== undefined ? Math.round(numbers[0]) : null,
      declaredWeeklyHours: numbers[1] !== undefined ? numbers[1] : null,
      trainingHistory: { summary: message.trim() },
    },
    isReformulation: false,
    suggestNextStep: true,
  };
}

function handleSports(message: string, profileDraft: Record<string, unknown>): StepOutcome {
  const labels = message
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (labels.length === 0) {
    return {
      reply:
        "Je n'ai pas identifié de sport dans ta réponse : peux-tu m'indiquer au moins une discipline (ex. course à pied, musculation) ?",
      extraction: null,
      isReformulation: true,
      suggestNextStep: false,
    };
  }

  const fallbackLevel = typeof profileDraft["experienceLevel"] === "string" ? profileDraft["experienceLevel"] : "intermediate";

  return {
    reply: NEXT_QUESTION.sports!,
    extraction: {
      sports: labels.map((label, index) => ({
        sportCode: slugify(label),
        level: fallbackLevel,
        weeklySessionsDeclared: null,
        yearsPractice: null,
        isPrimary: index === 0,
        priority: index + 1,
      })),
    },
    isReformulation: false,
    suggestNextStep: true,
  };
}

function handleAvailability(message: string): StepOutcome {
  const numbers = (message.match(NUMBER_PATTERN) ?? []).map((n) => Number.parseFloat(n.replace(",", ".")));
  const maxMinutes = numbers[0] !== undefined ? Math.round(numbers[0]) : null;

  return {
    reply: NEXT_QUESTION.availability!,
    extraction: {
      availability: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        slot: "unspecified",
        maxMinutes,
        isAvailable: true,
      })),
    },
    isReformulation: false,
    suggestNextStep: true,
  };
}

function handleNutrition(message: string): StepOutcome {
  const lower = message.toLowerCase();
  const dietaryConstraints: string[] = [];
  if (lower.includes("vegan")) dietaryConstraints.push("vegan");
  else if (lower.includes("vegetarien") || lower.includes("végétarien")) dietaryConstraints.push("vegetarian");
  if (lower.includes("sans gluten")) dietaryConstraints.push("gluten_free");
  if (lower.includes("sans lactose")) dietaryConstraints.push("lactose_free");

  return {
    reply: NEXT_QUESTION.nutrition!,
    extraction: { nutritionHabits: { summary: message.trim() }, dietaryConstraints },
    isReformulation: false,
    suggestNextStep: true,
  };
}

function handleRiskFilter(message: string): StepOutcome {
  const lower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const riskFlags: Array<{ flagType: string }> = [];
  if (lower.includes("mineur")) riskFlags.push({ flagType: "minor" });
  if (lower.includes("enceinte") || lower.includes("grossesse")) riskFlags.push({ flagType: "pregnancy" });
  if (lower.includes("pathologie") || lower.includes("blessure")) riskFlags.push({ flagType: "pathology" });
  if (lower.includes("tca") || lower.includes("trouble alimentaire") || lower.includes("anorexie") || lower.includes("boulimie")) {
    riskFlags.push({ flagType: "eating_disorder_history" });
  }

  return {
    reply: NEXT_QUESTION.risk_filter!,
    extraction: { riskFlags },
    isReformulation: false,
    suggestNextStep: true,
  };
}

function runStep(step: string, message: string, profileDraft: Record<string, unknown>): StepOutcome {
  switch (step) {
    case "intro":
      return { reply: QUESTIONS.goal!, extraction: null, isReformulation: false, suggestNextStep: true };
    case "goal":
      return handleGoal(message);
    case "level":
      return handleLevel(message);
    case "history":
      return handleHistory(message);
    case "sports":
      return handleSports(message, profileDraft);
    case "availability":
      return handleAvailability(message);
    case "nutrition":
      return handleNutrition(message);
    case "risk_filter":
      return handleRiskFilter(message);
    default:
      return {
        reply: "Merci, continuons.",
        extraction: null,
        isReformulation: false,
        suggestNextStep: true,
      };
  }
}

export class DeterministicMockLlmProvider implements LlmProvider {
  readonly name = "mock-deterministic";

  converseOnboarding(input: ConversationTurnInput): Promise<ConversationTurnOutput> {
    const outcome = runStep(input.step, input.userMessage, input.profileDraft);
    return Promise.resolve(outcome);
  }

  renderExplanation(input: ExplanationRequest): Promise<ExplanationOutput> {
    // Reformulation volontairement DIFFÉRENTE du template mot pour mot (pour distinguer les deux
    // chemins dans les tests) mais construite UNIQUEMENT à partir des valeurs des traces : elle
    // passe donc toujours le contrôle d'intégrité numérique par construction.
    const { shortText, longText } = renderTemplateExplanation(input);
    return Promise.resolve({
      shortText: `Coach : ${shortText}`,
      longText: `${longText}\n\n(Explication générée par le mock déterministe — aucun appel réseau.)`,
    });
  }
}
