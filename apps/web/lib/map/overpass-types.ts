/**
 * Formes de la réponse JSON d'Overpass (ADR-018 §5.5) — donnée EXTERNE, non versionnée par nous :
 * validée défensivement par Zod avant tout traitement. Module PUR (aucune URL, aucun `fetch`),
 * partagé par `overpass-client.ts` (`server-only`, qui l'utilise pour valider ce qu'il reçoit) et
 * `trail-feature.ts` (pur, qui transforme ce qui a été validé) — évite tout import de type à
 * travers la frontière `server-only`.
 */
import { z } from "zod";

const OverpassGeometryPointSchema = z.object({ lat: z.number(), lon: z.number() }).nullable();

const OverpassTagsSchema = z.record(z.string(), z.string()).optional();

const OverpassWaySchema = z.object({
  type: z.literal("way"),
  id: z.number(),
  tags: OverpassTagsSchema,
  geometry: z.array(OverpassGeometryPointSchema).optional(),
});

const OverpassRelationMemberSchema = z.object({
  type: z.string(),
  ref: z.number(),
  role: z.string().optional(),
  geometry: z.array(OverpassGeometryPointSchema).optional(),
});

const OverpassRelationSchema = z.object({
  type: z.literal("relation"),
  id: z.number(),
  tags: OverpassTagsSchema,
  members: z.array(OverpassRelationMemberSchema).optional(),
});

// Les nœuds isolés (`type: "node"`, membres de relation résolus par Overpass) sont acceptés mais
// n'apportent aucune géométrie de tracé exploitable — filtrés explicitement après parsing.
const OverpassNodeSchema = z.object({ type: z.literal("node") }).passthrough();

export const OverpassElementSchema = z.union([OverpassWaySchema, OverpassRelationSchema, OverpassNodeSchema]);

export const OverpassResponseSchema = z.object({
  elements: z.array(OverpassElementSchema),
});

export type OverpassWay = z.infer<typeof OverpassWaySchema>;
export type OverpassRelation = z.infer<typeof OverpassRelationSchema>;
export type OverpassRawElement = OverpassWay | OverpassRelation;

export function isWayOrRelation(element: z.infer<typeof OverpassElementSchema>): element is OverpassRawElement {
  return element.type === "way" || element.type === "relation";
}
