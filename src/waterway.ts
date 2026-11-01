export const WATERWAY_QUERY_PARAM = "waterway";

export type Waterway = "sea" | "river";

export const resolveWaterway = (value: unknown): Waterway => value === "river" ? "river" : "sea";
