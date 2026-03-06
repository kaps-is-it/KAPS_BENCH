export type BenchmarkProgressUpdate = {
  label: string;
  message: string;
  step: number;
  totalSteps: number;
  progress: number;
};
