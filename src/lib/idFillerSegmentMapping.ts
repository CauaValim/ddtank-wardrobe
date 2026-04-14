export interface SegmentNameCandidate {
  row: number;
  name: string;
}

function findCandidateIndex(
  candidates: SegmentNameCandidate[],
  used: Set<number>,
  predicate: (candidate: SegmentNameCandidate) => boolean
): number {
  return candidates.findIndex((candidate, index) => !used.has(index) && predicate(candidate));
}

export function resolveSegmentNamesForMissingIds(
  segments: string[],
  candidates: SegmentNameCandidate[],
  startRow: number
): Array<string | null> {
  const resolved = Array<string | null>(segments.length).fill(null);
  const used = new Set<number>();

  for (let index = 0; index < segments.length; index++) {
    if (!segments[index].startsWith("*")) continue;

    const preferredRow = startRow + index;
    let candidateIndex = findCandidateIndex(
      candidates,
      used,
      (candidate) => candidate.row === preferredRow
    );

    if (candidateIndex === -1) {
      candidateIndex = findCandidateIndex(
        candidates,
        used,
        (candidate) => candidate.row > preferredRow
      );
    }

    if (candidateIndex === -1) {
      candidateIndex = findCandidateIndex(candidates, used, () => true);
    }

    if (candidateIndex === -1) continue;

    resolved[index] = candidates[candidateIndex].name;
    used.add(candidateIndex);
  }

  return resolved;
}