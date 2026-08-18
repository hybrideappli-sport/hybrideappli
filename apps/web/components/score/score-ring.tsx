/**
 * `ScoreRing` — `S-score-ring` (`09-design-feature2-notes.md` §4.2). 180×180, violet plat sans
 * dégradé. `role="img"` + `aria-label` complet ; sous `prefers-reduced-motion`, aucune animation de
 * remplissage (pas de `transition`/`animate-*` sur le tracé — valeur finale directement).
 */
const RADIUS = 84;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreRing({ score, delta }: { score: number | null; delta: { value: number; since: string } | null }) {
  const filled = score !== null;
  const dash = filled ? (CIRCUMFERENCE * score) / 100 : 0;

  const deltaPhrase = delta ? `, ${delta.value >= 0 ? "en hausse" : "en baisse"} de ${Math.abs(delta.value)} points depuis la semaine dernière` : "";
  const ariaLabel = filled ? `Score hybride : ${score} sur 100${deltaPhrase}.` : "Score hybride non disponible, calibration en cours.";

  return (
    <div className="relative flex size-[180px] items-center justify-center" role="img" aria-label={ariaLabel} data-testid="score-ring">
      <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden="true">
        <circle cx="90" cy="90" r={RADIUS} fill="none" stroke="var(--border-strong)" strokeWidth="12" />
        {filled ? (
          <circle
            cx="90"
            cy="90"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="12"
            strokeLinecap="round"
            transform="rotate(-90 90 90)"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
          />
        ) : null}
      </svg>
      <div className="absolute flex flex-col items-center">
        {filled ? (
          <>
            <span className="text-score font-bold text-foreground">{score}</span>
            <span className="text-small text-foreground-subtle">/ 100</span>
          </>
        ) : (
          <span className="text-score font-bold text-foreground-subtle" aria-hidden="true">
            —
          </span>
        )}
        <span className="mt-1 text-label text-foreground-subtle">SCORE HYBRIDE</span>
      </div>
    </div>
  );
}
