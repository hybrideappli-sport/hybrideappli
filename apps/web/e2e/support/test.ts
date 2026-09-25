import { test as base, expect } from "@playwright/test";

/**
 * `test` étendu — journalisation automatique des erreurs de la page. À importer À LA PLACE de
 * `@playwright/test` dans toutes les specs de ce dossier.
 *
 * Motivation, née d'une panne réelle (lot L3 de la carte, ADR-018) : `map.addLayer()` levait
 * quatorze fois dans un effet React, ce qui déstabilisait tout le cycle de vie de la carte. Le
 * symptôme observable par le test était un élément absent du DOM — un message qui n'oriente vers
 * aucune cause. La cause exacte, elle, était écrite en toutes lettres dans la console du
 * navigateur (« Only one zoom-based "step" or "interpolate" subexpression may be used in an
 * expression »), mais RIEN ne la remontait : la trace Playwright ne capture ni `console` ni
 * `pageerror`, et le rapport `list` n'en dit rien. Le diagnostic a coûté plusieurs heures et
 * quatre hypothèses fausses, là où la première ligne de console donnait la réponse.
 *
 * Ce fixture est `auto: true` : il s'applique sans que la spec ait à le demander, parce qu'une
 * protection qu'il faut penser à activer est une protection qui manque le jour où elle sert.
 *
 * Choix délibéré : les erreurs collectées ne FONT PAS échouer le test par défaut. Une console
 * bruyante est fréquente en développement, et transformer chaque avertissement en échec rendrait
 * la suite ingérable — donc ignorée. Elles sont écrites sur la sortie standard (donc visibles
 * dans le rapport `list`, à côté de l'échec qu'elles expliquent) et attachées au rapport. Pour
 * durcir ponctuellement — une CI de non-régression, ou la chasse à une panne précise :
 * `E2E_FAIL_ON_PAGE_ERROR=1`, qui fait échouer tout test ayant produit une exception non
 * rattrapée (`pageerror`) ; les `console.error` restent informatifs même dans ce mode, étant
 * souvent émis par des bibliothèques tierces sans conséquence.
 */
export const test = base.extend<{ pageErrorLogger: void }>({
  pageErrorLogger: [
    async ({ page }, use, testInfo) => {
      const entries: string[] = [];

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        entries.push(`[console.error] ${message.text()}`);
      });

      page.on("pageerror", (error) => {
        entries.push(`[pageerror] ${error.message}\n${error.stack ?? ""}`);
      });

      await use();

      if (entries.length === 0) return;

      // Sur la sortie standard : c'est le seul canal que l'on lit vraiment quand un test échoue.
      console.log(`\n--- Erreurs de page pendant « ${testInfo.title} » (${entries.length}) ---`);
      for (const entry of entries) console.log(entry);
      console.log("--- fin des erreurs de page ---\n");

      await testInfo.attach("page-errors.log", { body: entries.join("\n\n"), contentType: "text/plain" });

      const uncaught = entries.filter((entry) => entry.startsWith("[pageerror]"));
      if (process.env.E2E_FAIL_ON_PAGE_ERROR === "1" && uncaught.length > 0) {
        throw new Error(`${uncaught.length} exception(s) non rattrapée(s) dans la page (E2E_FAIL_ON_PAGE_ERROR=1) :\n${uncaught.join("\n\n")}`);
      }
    },
    { auto: true },
  ],
});

export { expect };
