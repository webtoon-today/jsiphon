# jsiphon Examples

Run these examples to see jsiphon in action with mocked streaming data.

## Prerequisites

```bash
npm install
npx tsx examples/<example-file>.ts
```

## Examples

| File | Description |
|------|-------------|
| `01-basic-streaming.ts` | Basic usage - parse incomplete JSON as it streams |
| `02-delta-tracking.ts` | Use delta to append only new characters to UI |
| `03-ambiguity-tracking.ts` | Know when fields are "done" to trigger actions |
| `04-structured-llm-output.ts` | Parse structured LLM responses while streaming |
| `05-nested-objects.ts` | Handle deeply nested JSON structures |
| `06-fetch-simulation.ts` | Realistic fetch() pattern for LLM APIs |

## Quick Start

```bash
# Run the basic example
npx tsx examples/01-basic-streaming.ts

# Run all examples
for f in examples/*.ts; do echo "=== $f ==="; npx tsx "$f"; echo; done
```
