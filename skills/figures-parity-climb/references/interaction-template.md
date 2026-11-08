# Interaction inventory — <figure>

Fill this in for the figure a round is about. The capability ledger is the
scored list; this is the reasoning that keeps the weights honest. One screen,
no prose.

| axis | reference | ours | gap |
|---|---|---|---|
| **Input** | typed rows, pasted table, clicked points, dragged sliders | typed params, `Kind::Data`, handles | what a teacher cannot enter |
| **Element editing** | each row/point/series has its own label, style, visibility | per-element params? which ones? | what cannot be changed alone |
| **Versions** | Student / Question / Answer key, gear for exactly what shows | `show_answers`, Student + key export | missing version or missing contents |
| **Direct manipulation** | click to add, drag labels/vertices, delete, undo | handles (`interact.rs`), label drags (`labels.rs`) | what needs a handle |
| **Data shape** | table with add/remove row and column, blanks, totals | `Data`, `List`, `Long`, fixed count | what the model cannot represent |
| **Output** | PNG/SVG, print figure, share link, presets | SVG/PNG/PDF/DOCX, share link, examples | deliberate differences only |

Verdict: **generator** or **editor**. Pick the `class` weights from that
verdict, not from how easy the edit is.

Next capability: `<id>` — `<one sentence: what a teacher can then do>`.
Evidence: `<param/handle>`.
