export interface SegmentNameCandidate {
  row: number;
  name: string;
}

export function resolveSegmentNamesForMissingIds(
  segments: string[],
  candidates: SegmentNameCandidate[],
  _startRow: number
): Array<string | null> {
  const resolved = Array<string | null>(segments.length).fill(null);
  let candidateIndex = 0;

  for (let index = 0; index < segments.length; index++) {
    const candidate = candidates[candidateIndex];
    if (!candidate) break;

    if (segments[index].startsWith("*")) {
      resolved[index] = candidate.name;
    }

    candidateIndex++;
  }

  return resolved;
}