/**
 * Détection heuristique d'une mention de donnée de santé dans un message libre de l'onboarding
 * (ADR-010 §3) : `onboarding_messages.contains_health_data` — n'entraîne AUCUNE extraction
 * structurée avant consentement, seulement un marquage du message conversationnel pour aligner sa
 * rétention sur celle des données de santé. Volontairement large (faux positifs acceptables : le
 * coût d'un marquage superflu est nul, celui d'un oubli ne l'est pas).
 */
const HEALTH_KEYWORDS = [
  "douleur",
  "blessure",
  "blesse",
  "grossesse",
  "enceinte",
  "cardiaque",
  "medical",
  "médical",
  "medicament",
  "médicament",
  "trouble alimentaire",
  "anorexie",
  "boulimie",
  "tca",
  "pathologie",
  "diabete",
  "diabète",
  "asthme",
  "sommeil",
  "frequence cardiaque",
  "fréquence cardiaque",
  "poids",
  "mineur",
];

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function detectHealthDataMention(message: string): boolean {
  const normalized = normalize(message);
  return HEALTH_KEYWORDS.some((keyword) => normalized.includes(normalize(keyword)));
}
