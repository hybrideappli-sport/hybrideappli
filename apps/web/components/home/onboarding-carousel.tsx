"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * `OnboardingCarousel` — écran d'accueil de la route `/`, jamais designé dans Pencil
 * (cf. état des lieux design : les 4 écrans d'auth et l'accueil n'ont aucune maquette).
 * Référence visuelle : les écrans d'onboarding GOWOD — photo plein écran, dégradé, texte
 * éditorial en bas, contrôles fixes.
 *
 * Deux couches superposées :
 *  - une couche DÉFILANTE (scroll-snap horizontal) qui porte photo + dégradés + texte, un
 *    élément par discipline ;
 *  - une couche FIXE qui porte le logo, les points, le CTA et le lien de connexion.
 *
 * Les contrôles sont rendus UNE SEULE FOIS plutôt qu'une fois par diapositive : visuellement
 * identique (ils ne bougent pas au défilement), mais le DOM ne contient pas trois CTA
 * « Créer mon compte » concurrents, ce qui serait hostile au lecteur d'écran.
 */

/** Hauteur réservée à la couche de contrôles. Sert à la fois de marge basse au texte des
 *  diapositives et de socle au bloc fixe — les deux valeurs DOIVENT rester synchronisées,
 *  d'où la variable unique. */
const CONTROLS_BLOCK = "13.5rem"; // points (8) + CTA (56) + lien (44) + gouttières

/** Dégradés mesurés sur les photos réelles, pas réglés à l'œil : la bande du logo montait à
 *  L = 0,94 sur la natation (ciel blanc pur), celle du titre à L = 0,31 sur le vélo.
 *  Ces valeurs amènent le blanc à 5,5:1 minimum sur le logo et 9,4:1 sur le titre. */
const TOP_SCRIM =
  "linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.56) 14%, rgba(0,0,0,0.14) 32%, rgba(0,0,0,0) 48%)";
const BOTTOM_SCRIM =
  "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 28%, rgba(0,0,0,0.26) 45%, rgba(0,0,0,0.52) 60%, rgba(0,0,0,0.74) 75%, rgba(0,0,0,0.89) 88%, rgba(0,0,0,0.94) 100%)";

type Slide = { src: string; alt: string; title: string; body: string };

const SLIDES: readonly Slide[] = [
  {
    src: "/assets/onboarding/01-velo.webp",
    alt: "Cycliste seul sur une route de montagne au petit matin.",
    title: "Un seul coach pour tous tes sports.",
    body: "Course, vélo, natation, muscu — Hybride construit un plan qui tient compte de tout, pas d'une discipline à la fois.",
  },
  {
    src: "/assets/onboarding/02-natation.webp",
    alt: "Nageur en combinaison entrant dans un lac de montagne.",
    title: "Ton plan s'adapte à ta semaine.",
    body: "Une séance sautée, une douleur, un imprévu : le coach recalcule au lieu de te laisser décrocher.",
  },
  {
    src: "/assets/onboarding/03-course.webp",
    alt: "Coureurs en pleine foulée, saisis en filé.",
    title: "Tes données, au même endroit.",
    body: "Strava, ta muscu, ta nutrition. Tout se rassemble pour donner un score hybride qui a du sens.",
  },
] as const;

export function OnboardingCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActive((current) => (current === index ? current : Math.min(SLIDES.length - 1, Math.max(0, index))));
  }, []);

  const goTo = useCallback((index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }, []);

  return (
    <div className="relative isolate h-[100dvh] w-full overflow-hidden bg-background">
      {/* ---------- couche défilante ---------- */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Présentation de Hybride Club"
        data-testid="onboarding-carousel"
      >
        {SLIDES.map((slide, index) => (
          <section
            key={slide.src}
            className="relative flex h-full w-full shrink-0 snap-center snap-always flex-col justify-end"
            aria-roledescription="diapositive"
            aria-label={`${index + 1} sur ${SLIDES.length}`}
            data-testid={`onboarding-slide-${index + 1}`}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              priority={index === 0}
              sizes="100vw"
              className="-z-10 object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: TOP_SCRIM }} />
            <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: BOTTOM_SCRIM }} />

            <div className="flex flex-col gap-3 px-6" style={{ paddingBottom: CONTROLS_BLOCK }}>
              <h2 className="font-serif text-title text-foreground">{slide.title}</h2>
              <p className="text-body text-foreground-muted">{slide.body}</p>
            </div>
          </section>
        ))}
      </div>

      {/* ---------- couche fixe : logo ---------- */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.75rem)" }}
      >
        <Image
          src="/assets/brand/logo-mark-white.png"
          alt="Hybride Club"
          width={44}
          height={44}
          priority
          className="h-11 w-11"
        />
      </div>

      {/* ---------- couche fixe : contrôles ---------- */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-6 px-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
      >
        <div className="flex items-center gap-2" role="group" aria-label="Choisir une diapositive">
          {SLIDES.map((slide, index) => {
            const current = index === active;
            return (
              <button
                key={slide.src}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Diapositive ${index + 1} sur ${SLIDES.length}`}
                aria-current={current ? "true" : undefined}
                className="flex h-11 w-6 items-center justify-center"
                data-testid={`onboarding-dot-${index + 1}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 rounded-full transition-all ${current ? "w-6 bg-accent" : "w-2 bg-white/40"}`}
                />
              </button>
            );
          })}
        </div>

        {/* `whitespace-nowrap` du variant `Button` fait déborder un libellé long de son
            conteneur (constaté sur `/compte`) : ici le libellé est court ET le bouton dispose
            d'une vraie gouttière de 24 px de chaque côté, jamais collé au bord de l'écran. */}
        <Button asChild className="w-full">
          <Link href="/inscription" data-testid="onboarding-signup">
            Créer mon compte
          </Link>
        </Button>

        <Link
          href="/connexion"
          className="flex min-h-11 items-center text-body-strong font-semibold text-foreground underline-offset-4 hover:underline"
          data-testid="onboarding-login"
        >
          Se connecter
        </Link>
      </div>
    </div>
  );
}
