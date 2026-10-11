export interface SegmentNameCandidate {
  row: number;
  /** Coluna da célula do nome (1-based), para achar a imagem do item ao lado. */
  col?: number;
  name: string;
}

export function resolveSegmentNamesForMissingIds(
  segments: string[],
  candidates: SegmentNameCandidate[],
  startRow: number
): Array<string | null> {
  return resolveSegmentCandidatesForMissingIds(segments, candidates, startRow).map((c) => c?.name ?? null);
}

/** Igual a resolveSegmentNamesForMissingIds, devolvendo também a célula do nome. */
export function resolveSegmentCandidatesForMissingIds(
  segments: string[],
  candidates: SegmentNameCandidate[],
  _startRow: number
): Array<SegmentNameCandidate | null> {
  const resolved = Array<SegmentNameCandidate | null>(segments.length).fill(null);
  let candidateIndex = 0;

  for (let index = 0; index < segments.length; index++) {
    const candidate = candidates[candidateIndex];
    if (!candidate) break;

    // Assign candidate name to segments that need an ID:
    // - "*N" segments (amount needs ID prefix)
    // - bare-number segments like "10" alongside "*N" siblings (rich-text
    //   often hides the leading "*" of the first amount in a separator run)
    const seg = segments[index];
    if (seg.startsWith("*") || /^\d+$/.test(seg)) {
      resolved[index] = candidate;
    }

    candidateIndex++;
  }

  return resolved;
}
