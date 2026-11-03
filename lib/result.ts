export interface DataOk<T> {
  status: "ok" | "stale";
  data: T;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  source: string;
  fictional: boolean;
  stale: boolean;
  message: string | null;
  warnings: string[];
}

export interface DataUnavailable {
  status: "unavailable";
  source: string;
  message: string;
  fictional: false;
}

export type DataResult<T> = DataOk<T> | DataUnavailable;

export function okResult<T>(input: {
  data: T;
  fetchedAt: string;
  sourceUpdatedAt?: string | null;
  source: string;
  fictional: boolean;
  stale?: boolean;
  message?: string | null;
  warnings?: string[];
}): DataOk<T> {
  return {
    status: input.stale ? "stale" : "ok",
    data: input.data,
    fetchedAt: input.fetchedAt,
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    source: input.source,
    fictional: input.fictional,
    stale: Boolean(input.stale),
    message: input.message ?? null,
    warnings: input.warnings ?? [],
  };
}

export function unavailable(source: string, message: string): DataUnavailable {
  return { status: "unavailable", source, message, fictional: false };
}
