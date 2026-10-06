export const COMPONENTS = ["trend", "momentum", "rsi", "volume", "news", "social", "fundamentals"] as const;
export type Component = typeof COMPONENTS[number];
export type Features = Record<Component, number>;
export interface ModelParameters {
  weights: Features;
  method: "linear" | "logistic";
  slope: number;
  intercept: number;
}

export const DEFAULT_MODEL: ModelParameters = {
  weights: { trend: 0.32, momentum: 0.23, rsi: 0.13, volume: 0.15, news: 0.10, social: 0.04, fundamentals: 0.02 },
  method: "linear", slope: 2, intercept: 0,
};

export function weightedScore(features: Features, model: ModelParameters): number {
  return COMPONENTS.reduce((sum, key) => sum + features[key] * model.weights[key], 0);
}

export function predict(features: Features, model: ModelParameters): number {
  const score = weightedScore(features, model);
  const p = model.method === "linear"
    ? (score + 1) / 2
    : 1 / (1 + Math.exp(-(model.slope * score + model.intercept)));
  return Math.max(0.001, Math.min(0.999, p));
}

export function featuresFromAnalysis(a: {
  trendScore: number; momentumScore: number; rsiScore: number; volumeScore: number;
  newsScore: number; socialScore: number; fundamentalsScore: number;
}): Features {
  return { trend: a.trendScore, momentum: a.momentumScore, rsi: a.rsiScore, volume: a.volumeScore,
    news: a.newsScore, social: a.socialScore, fundamentals: a.fundamentalsScore };
}
