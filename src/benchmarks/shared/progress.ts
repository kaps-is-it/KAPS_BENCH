export type BenchmarkLiveScore = {
  id: string;
  label: string;
  score: number | null;
  status: "live" | "complete" | "pending";
};

export type BenchmarkTelemetryMetric = {
  label: string;
  value: string;
};

export type BenchmarkActivityEntry = {
  id: string;
  label: string;
  detail: string;
  value: number;
  normalized: number;
};

export type BenchmarkTelemetry = {
  title: string;
  summary: string;
  liveScores: BenchmarkLiveScore[];
  metrics: BenchmarkTelemetryMetric[];
  activity: BenchmarkActivityEntry[];
  projection?: {
    projectedScore: number | null;
  };
};

export type BenchmarkProgressUpdate = {
  label: string;
  message: string;
  step: number;
  totalSteps: number;
  progress: number;
  telemetry?: BenchmarkTelemetry;
};
