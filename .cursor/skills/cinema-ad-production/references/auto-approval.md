# Auto-approval rules

Mid-pipeline human gates are **removed**. Only the upfront budget gate remains.

## When orchestrator advances without human input

Proceed to next phase/round when **any** of:

1. `blocking_count === 0` after scrutiny merge
2. `round === 3` with director `signed_off_with_compromises`
3. Visual scrutiny returns `approve: true`
4. Round 3 visual scrutiny with logged failures — director signs off with compromises

## Never wait for Dallas mid-pipeline

- Production Bible is an **internal artifact**, not an approval gate
- Phase E starts automatically after bible is written
- Director merge + auto sign-off when scrutiny passes

## Fast-path exception

Only skip iteration rounds when Dallas explicitly says `fast-path` in the **same thread** after budget approval. Log deviation in iteration log.

## Director forced sign-off (round 3)

```json
{
  "status": "signed_off_with_compromises",
  "compromises": ["PROP_honey_jar: wax seal simplified after round 3"]
}
```
