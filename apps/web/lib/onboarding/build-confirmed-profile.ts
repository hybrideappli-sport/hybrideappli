import { ConfirmedProfileSchema, type ConfirmedProfile, type ProfileDraft } from "@hybride/domain";

/**
 * Transforme le brouillon accumulé pendant le chat (`ProfileDraft`, tout optionnel) en profil
 * confirmé strict (AC1). Purement une mise en forme : c'est la validation Zod ci-dessous qui
 * décide si le profil est complet, jamais une supposition côté UI.
 */
export function buildConfirmedProfile(draft: ProfileDraft): { success: true; profile: ConfirmedProfile } | { success: false; message: string } {
  const parsed = ConfirmedProfileSchema.safeParse({
    birthDate: draft.birthDate ?? null,
    sexAtBirth: draft.sexAtBirth ?? null,
    heightCm: draft.heightCm ?? null,
    experienceLevel: draft.experienceLevel ?? "beginner",
    trainingYears: draft.trainingYears ?? null,
    declaredWeeklySessions: draft.declaredWeeklySessions ?? null,
    declaredWeeklyHours: draft.declaredWeeklyHours ?? null,
    trainingHistory: draft.trainingHistory ?? {},
    nutritionHabits: draft.nutritionHabits ?? {},
    dietaryConstraints: draft.dietaryConstraints ?? [],
    sports: draft.sports ?? [],
    availability: draft.availability ?? [],
    objective: draft.objective ?? { kind: "general_fitness", label: "", targetDate: null, targetMetric: {} },
    riskFlags: draft.riskFlags ?? [],
  });

  if (!parsed.success) {
    return {
      success: false,
      message:
        "Ton profil est incomplet : " +
        parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ") +
        ". Retourne au chat pour compléter ces informations.",
    };
  }

  return { success: true, profile: parsed.data };
}
