# Results

One folder per live run. Each holds:
- `decisions.jsonl`: one line per message and run. It has what the workflow answered (`result`), the score (`score`) and the estimated cost (`cost_usd`).
- `summary.md`: the same, as a table.
- `compact-export*.json` (some folders): the raw rows as they were copied out of the browser tab where the runs happened. Each copy was checked against a hash taken in the browser, and `decisions.jsonl` was built from it.

| Folder | What ran |
|---|---|
| `v1/2026-11-22T18-36-27Z` | v1, 20 traps × 3 |
| `v2/2026-11-22T18-46-28Z` | v2, 20 traps × 3 |
| `v1/probes-2026-11-22T18-49-58Z` | v1, 5 probes × 3 |
| `v2/probes-2026-11-22T18-50-34Z` | v2, 5 probes × 3 (the compact export holds both v1 and v2 rows) |

Two things to know:
- In v1, `raw_text` is empty when the model's raw output parsed to exactly the decision shown. A `raw_text_note` says so. It was not stored word for word, and it was not rebuilt.
- Timestamps in `sent_at` are simulated (one day per run, one minute per trap) so the duplicate check only fires for T15.
