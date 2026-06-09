# 차근차근 AI 도우미 A1 Poster

Screenshot-free A1 competition poster focused on target scale, structural exclusion, and the four-agent generation/validation pipeline.

## Final Outputs

- `poster-a1-digital.pdf`: A1 digital poster, 594 x 841 mm.
- `poster-a1-print-bleed.pdf`: print poster with 3 mm bleed, 600 x 847 mm.
- `poster-a1-300ppi.png`: high-resolution PNG, 7016 x 9933 px.
- `poster-preview-screen.png`: quick review preview.
- `poster.html` / `poster.css`: editable source.
- `source-notes.md`: source and tool notes.
- `asset-manifest.json`: generated output manifest.

## Included Message Blocks

- Target scale: 13.59%, about 6.97 million people, and about 780,000 students.
- Structural exclusion: legal threshold gap, 11 national bills with zero passage, and limits of ordinance-centered local support.
- Product shift: public safety video/URL to one scene, one action, one teach-back question.
- Four agents: video analysis, disaster-safety review, easy-language conversion, and QA/repair loop.

## Build

```bash
node outputs/a1-poster-design-20260603/scripts/render-poster.mjs
```
