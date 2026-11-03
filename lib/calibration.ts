import { impliedProbability } from "@/lib/payout";
import type { SelectionSnapshot } from "@/lib/domain";

export interface CalibrationBand {
  label: string;
  count: number;
  hits: number;
  averageImplied: number;
  hitRate: number;
}

const EDGES: { label: string; low: number; high: number }[] = [
  { label: "Under 40%", low: 0, high: 0.4 },
  { label: "40–50%", low: 0.4, high: 0.5 },
  { label: "50–55%", low: 0.5, high: 0.55 },
  { label: "55–60%", low: 0.55, high: 0.6 },
  { label: "60–70%", low: 0.6, high: 0.7 },
  { label: "70% and up", low: 0.7, high: 1.01 },
];

export function calibrateSnapshots(snapshots: SelectionSnapshot[]): {
  graded: number;
  bands: CalibrationBand[];
  summary: string;
} {
  const rows = snapshots.flatMap((snapshot) => {
    if (snapshot.settlement.method !== "manual") return [];
    if (snapshot.settlement.status !== "won" && snapshot.settlement.status !== "lost") return [];
    const implied = impliedProbability(snapshot.oddsAmerican);
    if (implied == null) return [];
    return [{ implied, hit: snapshot.settlement.status === "won" }];
  });
  const bands = EDGES.flatMap((edge) => {
    const group = rows.filter((row) => row.implied >= edge.low && row.implied < edge.high);
    if (group.length === 0) return [];
    const hits = group.filter((row) => row.hit).length;
    const averageImplied = group.reduce((sum, row) => sum + row.implied, 0) / group.length;
    return [
      {
        label: edge.label,
        count: group.length,
        hits,
        averageImplied,
        hitRate: hits / group.length,
      },
    ];
  });
  if (rows.length === 0) {
    return {
      graded: 0,
      bands: [],
      summary: "Grade wins and losses on the snapshots below. Each band compares those results with the chance the captured price implied.",
    };
  }
  return {
    graded: rows.length,
    bands,
    summary: `${rows.length} graded pick${rows.length === 1 ? "" : "s"}. A band is calibrated when the hit rate sits near the chance the prices implied.`,
  };
}
