/**
 * Message d'orientation professionnel de santé — AC3 (profil à risque, `pathology`/`minor`),
 * même principe que `pain-referral-messages.ts` : texte FIXE, jamais rendu par le LLM ni par le
 * template générique, pour ne jamais dépendre d'un fournisseur externe sur un message à portée
 * légale/éthique (fiche §5).
 *
 * Correction post-revue (finding B6) : `resolveRiskRestrictions()` (`packages/rules-engine`)
 * produit `requiresMedicalClearance` pour `pathology`/`minor`, tracé en base
 * (`decision_traces`) mais jamais lu par aucun code applicatif avant cette correction — AC3
 * n'était donc satisfait qu'à l'écrit (audit), jamais côté utilisateur. Choix d'implémentation le
 * plus simple respectant l'esprit d'AC3 : lire directement les `risk_flags` actifs de l'utilisateur
 * (même source que `resolveRiskRestrictions()`) et afficher ce message, avec le même statut que le
 * protocole douleur — jamais derrière le paywall (ADR-008 §5).
 */
export const MEDICAL_CLEARANCE_NOTICE_MESSAGE =
  "Ton profil déclaré nécessite un avis médical avant de suivre les recommandations du coach IA (pathologie déclarée ou profil mineur) — " +
  "le coach IA n'est pas un professionnel de santé. Consulte un professionnel de santé avant de démarrer ou de poursuivre ce plan.";
