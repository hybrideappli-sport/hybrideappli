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
  DebriefTurnInput,
  LlmProvider,
  SportReferentialEntry,
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

/**
 * Résout un libellé saisi par l'utilisateur vers un code EXISTANT du référentiel, en repliant sur
 * la slugification seulement si rien ne correspond.
 *
 * Le mock reproduit ainsi la contrainte posée au vrai fournisseur par le prompt système : c'est
 * lui que les tests e2e exercent, et c'est lui qui produisait `course_a_pied` — doublon de
 * `running` — donc un plan calculé sur une `family` « mixed » au lieu d'« endurance ».
 */
function resolveSportCode(label: string, referential: SportReferentialEntry[] | undefined): string {
  const slug = slugify(label);
  if (!referential?.length) return slug;

  const normalized = slugify(label);
  const exact = referential.find((entry) => entry.code === normalized || slugify(entry.labelFr) === normalized);
  if (exact) return exact.code;

  // Correspondance partielle : « course » trouve « Course à pied », « muscu » trouve « Musculation ».
  const partial = referential.find((entry) => {
    const labelSlug = slugify(entry.labelFr);
    return labelSlug.startsWith(normalized) || normalized.startsWith(labelSlug) || labelSlug.includes(normalized);
  });
  return partial?.code ?? slug;
}

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

function handleSports(
  message: string,
  profileDraft: Record<string, unknown>,
  referential: SportReferentialEntry[] | undefined,
): StepOutcome {
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
        sportCode: resolveSportCode(label, referential),
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

function runStep(
  step: string,
  message: string,
  profileDraft: Record<string, unknown>,
  referential: SportReferentialEntry[] | undefined,
): StepOutcome {
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
      return handleSports(message, profileDraft, referential);
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

// ---------------------------------------------------------------------------
// Débrief post-séance (US-05, Lot L1, ADR-019)
// ---------------------------------------------------------------------------

/** Mots-clés → codes de zone. Volontairement PARTIEL : une zone non couverte fait émettre le slug
 *  brut, ce qui reproduit le mode d'échec réel d'un modèle (un `genou_droit` là où le contrat
 *  attend `knee`) et donne aux tests un cas d'extraction rejetée qui n'est pas artificiel. */
const ZONE_KEYWORDS: Record<string, string> = {
  genou: "knee",
  cheville: "ankle",
  pied: "foot",
  hanche: "hip",
  dos: "lower_back",
  epaule: "shoulder",
  coude: "elbow",
  poignet: "wrist",
  nuque: "neck",
  cuisse: "thigh",
  mollet: "calf",
};

function deaccent(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractDebrief(message: string): Record<string, unknown> | null {
  const m = deaccent(message);
  const patch: Record<string, unknown> = {};

  if (/pas fait|pas pu|rate|annule/.test(m)) patch["completion"] = "not_done";
  else if (/moitie|partiel|ecourte|raccourci/.test(m)) patch["completion"] = "partial";
  else if (/fait|termine|fini|ok|nickel/.test(m)) patch["completion"] = "done";

  if (/aucune douleur|pas de douleur|pas mal|rien a signaler|ras/.test(m)) patch["pain"] = "none";
  else if (/gene|tiraillement|leger/.test(m)) patch["pain"] = "light";
  else if (/douleur|mal\b|ca fait mal/.test(m)) patch["pain"] = "pain";

  if (patch["pain"] === "light" || patch["pain"] === "pain") {
    for (const [mot, code] of Object.entries(ZONE_KEYWORDS)) {
      if (m.includes(mot)) {
        // Zone reconnue → code du contrat. Zone inconnue → slug brut, rejeté en aval.
        patch["painZone"] = /droit|gauche/.test(m) ? `${mot}_${/droit/.test(m) ? "droit" : "gauche"}` : code;
        break;
      }
    }
    if (/au repos|meme au repos|la nuit/.test(m)) patch["painAtRest"] = true;
  }

  const rpe = /rpe\s*(\d{1,2})|difficulte\s*(?:de\s*)?(\d{1,2})|(\d{1,2})\s*sur\s*10/.exec(m);
  if (rpe) patch["rpe"] = Number.parseInt(rpe[1] ?? rpe[2] ?? rpe[3] ?? "", 10);

  const fr = /forme\s*(?:de\s*)?(\d)|(\d)\s*sur\s*5|fraicheur\s*(\d)/.exec(m);
  if (fr) patch["freshness"] = Number.parseInt(fr[1] ?? fr[2] ?? fr[3] ?? "", 10);

  return Object.keys(patch).length > 0 ? patch : null;
}

const DEBRIEF_QUESTION: Record<string, string> = {
  completion: "Tu as pu faire ta séance ?",
  pain: "Une douleur ou une gêne pendant l'effort ?",
  painZone: "C'était où exactement ?",
  sportCode: "C'était quelle discipline ?",
  actualDurationMin: "Ça a duré combien de temps ?",
};

function handleDebrief(input: DebriefTurnInput): StepOutcome {
  const extraction = extractDebrief(input.userMessage);

  // Rien de reconnu alors qu'il restait à obtenir : le coach reformule plutôt que d'inventer.
  if (!extraction && input.missingMandatory.length > 0) {
    const cible = input.missingMandatory[0]!;
    return {
      reply: `Je n'ai pas bien compris. ${DEBRIEF_QUESTION[cible] ?? "Tu peux reformuler ?"}`,
      extraction: null,
      isReformulation: true,
      suggestNextStep: false,
    };
  }

  // Ce qu'il restera à obtenir APRÈS ce patch — le mock ne rejoue pas la logique du domaine, il
  // se contente de retirer ce qu'il vient d'extraire.
  const restant = input.missingMandatory.filter((champ) => extraction?.[champ] === undefined);

  if (restant.length > 0) {
    return { reply: DEBRIEF_QUESTION[restant[0]!] ?? "Dis-m'en un peu plus.", extraction, isReformulation: false, suggestNextStep: false };
  }
  // Même raisonnement que pour les obligatoires : ce qui reste APRÈS ce patch. Juger sur l'état
  // d'avant ferait reposer la question alors que l'utilisateur vient d'y répondre.
  const desireRestant = input.missingDesired.filter((champ) => extraction?.[champ] === undefined);
  if (desireRestant.length > 0) {
    // Les deux recherchés en UN seul tour, jamais deux relances (ADR-019 §6).
    return { reply: "C'était dur ? Et tu te sens comment ?", extraction, isReformulation: false, suggestNextStep: false };
  }
  return { reply: "Noté, merci. Je m'occupe du reste.", extraction, isReformulation: false, suggestNextStep: true };
}

export class DeterministicMockLlmProvider implements LlmProvider {
  readonly name = "mock-deterministic";

  converseOnboarding(input: ConversationTurnInput): Promise<ConversationTurnOutput> {
    const outcome = runStep(input.step, input.userMessage, input.profileDraft, input.sportReferential);
    return Promise.resolve(outcome);
  }

  converseDebrief(input: DebriefTurnInput): Promise<ConversationTurnOutput> {
    return Promise.resolve(handleDebrief(input));
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
