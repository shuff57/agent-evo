# HTML Body Conversion Reference

## Conversion Rules

### Section Structure
- `# Title` → Start page (first section)
- `## Section Title` → New slide: `<section class="page-section">`

### Math Conversion
- Keep `$...$` and `$$...$$` as-is for MathJax detection
- Alternatively use `\(...\)` and `\[...\]`

### CSS Class Mapping
- Context Pauses → `<div class="context-pause">`
- Insight Notes → `<div class="insight-note">`
- Definitions → `<div class="definition"><div class="definition-title">Definition X.Y.Z: Term</div>...`
- Examples → `<div class="example"><div class="example-title">Example X.Y.Z</div>...`
- Problems → `<div class="problem" id="problem-X-Y-N">`
- Solutions → `<details class="solution"><summary>Solution</summary><div class="solution-content">...</div></details>`

### Navigation
- H2 sections need `id` attributes for TOC links
- Example divs need `id="example-X-Y-Z"`
- Problem divs need `id="problem-X-Y-N"`

### Security
- NO polyfill.io references (compromised CDN)
- MathJax loaded from cdn.jsdelivr.net