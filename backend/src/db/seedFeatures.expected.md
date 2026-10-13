# Expected genealogy for the 12-batch trace demo

This is the hand-counted reference for `seedFeatures.js`. It is kept separate
from the seed implementation so a reviewer can compare the generated lineage
with an independently written expected result.

## Batches by level

| Level | Batch codes | Count |
| --- | --- | ---: |
| Harvest root | `BATCH-TRACE-DEMO-2026-ROOT` | 1 |
| Split children (L1) | `...-L1-1`, `...-L1-2`, `...-L1-3` | 3 |
| Processed/merged (L2) | `...-L2-1`, `...-L2-2`, `...-L2-3`, `...-L2-4` | 4 |
| Current lots (L3) | `...-L3-1`, `...-L3-2`, `...-L3-3`, `...-L3-4` | 4 |
| **Total** |  | **12** |

`...` stands for the shared prefix `BATCH-TRACE-DEMO-2026`.

## Hand-counted lineage

The root has 500 kg. Its three children receive 150 kg, 150 kg, and 200 kg;
their total is 500 kg. The next level records these source relationships:

| L2 batch | Source L1 batches | Quantity | Distinct harvest roots |
| --- | --- | ---: | ---: |
| `...-L2-1` | `...-L1-1` | 100 kg | 1 (`...-ROOT`) |
| `...-L2-2` | `...-L1-1`, `...-L1-2` | 150 kg | 1 (`...-ROOT`) |
| `...-L2-3` | `...-L1-2`, `...-L1-3` | 150 kg | 1 (`...-ROOT`) |
| `...-L2-4` | `...-L1-3` | 100 kg | 1 (`...-ROOT`) |

Each L3 batch has the corresponding L2 batch as its parent/source:

| Current L3 batch | Immediate L2 source | L1 ancestors by hand | Distinct harvest roots | Number of source-to-root paths |
| --- | --- | --- | ---: | ---: |
| `...-L3-1` | `...-L2-1` | `...-L1-1` | 1 (`...-ROOT`) | 1 |
| `...-L3-2` | `...-L2-2` | `...-L1-1`, `...-L1-2` | 1 (`...-ROOT`) | 2 |
| `...-L3-3` | `...-L2-3` | `...-L1-2`, `...-L1-3` | 1 (`...-ROOT`) | 2 |
| `...-L3-4` | `...-L2-4` | `...-L1-3` | 1 (`...-ROOT`) | 1 |

Across all four current lots, the expected distinct-root count is four
root-to-current-lot relationships, each resolving to the same single harvest
root. The total number of source-to-root paths is `1 + 2 + 2 + 1 = 6`.

## Expected assertions for a seed/genealogy check

- Exactly 12 demo batches exist after the feature seed is first applied.
- Every L3 batch resolves to `...-ROOT` as its only distinct harvest root.
- L3 ancestor counts are respectively 2, 3, 3, and 2 when counting the
  immediate L2 batch and distinct L1 batches (the root is reported separately
  as the harvest root).
- The L2 source-edge counts are respectively 1, 2, 2, and 1.
- Reapplying the seed creates no additional demo batches.
