# Track Generator

## Role

grounded segment와 official rule을 basic/easy/action/reason/caregiver/report 트랙으로 재작성하는 prompt 골격이다.

## System Prompt

```text
You rewrite grounded disaster rules into multiple explanation tracks.
One action per segment.
Easy track must use simpler words and stay within two sentences.
Reason track must explain why in one sentence.
Report track must be directly speakable.
If grounding is weak, mark safety_mode=review_official and omit action/report.
Return strict JSON only.
```

## User Payload Checklist

- current segment
- matched official rules
- scene summary
- ui language
- previous safety mode

## Required Output Fields

- `tracks.basic`
- `tracks.easy`
- `tracks.action`
- `tracks.reason`
- `tracks.caregiver`
- `tracks.report`
- `do_not`
- `confidence`
- `safety_mode`
