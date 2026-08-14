import { isTerminalJobStage, type JobSnapshot } from "./types";

export interface CodexDesktopProgress {
  current: number | null;
  total: number | null;
  percent: number | null;
  bytesPerSecond: number | null;
}

export interface DownloadSpeedSample {
  jobId: string;
  completedBytes: number;
  updatedAtMs: number;
}

export interface DownloadSpeedMeasurement {
  jobId: string;
  sequence: number;
  bytesPerSecond: number;
}

export interface DownloadSpeedSnapshotIdentity {
  jobId: string;
  sequence: number;
}

export interface DownloadSpeedState {
  snapshot: DownloadSpeedSnapshotIdentity | null;
  sample: DownloadSpeedSample | null;
  measurement: DownloadSpeedMeasurement | null;
}

export function createDownloadSpeedState(): DownloadSpeedState {
  return { snapshot: null, sample: null, measurement: null };
}

/**
 * Accepts only a later snapshot for the same job. Distinct job IDs are ordered
 * by backend-issued start time so a delayed event for an older terminal job
 * cannot overwrite a newly started installation.
 */
export function shouldAcceptJobSnapshot(
  current: JobSnapshot | null | undefined,
  incoming: JobSnapshot,
): boolean {
  if (!current) return true;

  if (current.jobId === incoming.jobId) {
    return incoming.sequence > current.sequence;
  }

  const currentStartedAt = Date.parse(current.startedAt);
  const incomingStartedAt = Date.parse(incoming.startedAt);
  if (Number.isFinite(currentStartedAt) && Number.isFinite(incomingStartedAt)) {
    if (incomingStartedAt !== currentStartedAt) {
      return incomingStartedAt > currentStartedAt;
    }
  }

  return (
    isTerminalJobStage(current.stage) && !isTerminalJobStage(incoming.stage)
  );
}

/**
 * Records one already-accepted snapshot. Only adjacent, increasing byte/time
 * samples from the same download job produce a renderer-only speed value.
 */
export function updateDownloadSpeedState(
  current: DownloadSpeedState,
  job: JobSnapshot | null | undefined,
): DownloadSpeedState {
  const identity = job ? { jobId: job.jobId, sequence: job.sequence } : null;
  if (
    identity &&
    current.snapshot &&
    identity.jobId === current.snapshot.jobId &&
    identity.sequence === current.snapshot.sequence
  ) {
    return current;
  }

  const completedBytes = job?.progress?.completedBytes;
  const updatedAtMs = job ? Date.parse(job.updatedAt) : Number.NaN;
  if (
    job?.stage !== "downloading" ||
    job.progress?.phase !== "download" ||
    completedBytes == null ||
    !Number.isFinite(completedBytes) ||
    completedBytes < 0 ||
    !Number.isFinite(updatedAtMs)
  ) {
    return { snapshot: identity, sample: null, measurement: null };
  }

  const sample = { jobId: job.jobId, completedBytes, updatedAtMs };
  if (!current.sample || current.sample.jobId !== sample.jobId) {
    return { snapshot: identity, sample, measurement: null };
  }

  const elapsedMs = sample.updatedAtMs - current.sample.updatedAtMs;
  const completedDelta = sample.completedBytes - current.sample.completedBytes;
  if (elapsedMs <= 0 || completedDelta <= 0) {
    return { snapshot: identity, sample, measurement: null };
  }

  const bytesPerSecond = (completedDelta * 1000) / elapsedMs;
  return {
    snapshot: identity,
    sample,
    measurement:
      Number.isFinite(bytesPerSecond) && bytesPerSecond >= 0
        ? { jobId: job.jobId, sequence: job.sequence, bytesPerSecond }
        : null,
  };
}

export function selectDownloadBytesPerSecond(
  state: DownloadSpeedState,
  job: JobSnapshot | null | undefined,
): number | null {
  return job?.stage === "downloading" &&
    job.progress?.phase === "download" &&
    state.measurement?.jobId === job.jobId &&
    state.measurement.sequence === job.sequence
    ? state.measurement.bytesPerSecond
    : null;
}

export function projectInstallerProgress(
  job: JobSnapshot | null | undefined,
  downloadSpeed: DownloadSpeedState,
): CodexDesktopProgress | undefined {
  if (!job?.progress) return undefined;
  return {
    current: job.progress.completedBytes,
    total: job.progress.totalBytes,
    percent: job.progress.percent,
    bytesPerSecond: selectDownloadBytesPerSecond(downloadSpeed, job),
  };
}
