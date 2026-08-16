#!/usr/bin/env python3
"""Lay the same quick reference out as a folded trifold pamphlet.

Usage:
    python pamphlet.py QUICKREF.md [-o OUT.html]

Same Markdown, same checked facts, different object. A one-pager is for the
fridge and the binder; a pamphlet is what you hand to two hundred people at
back-to-school night, and it earns the extra fold by having a cover that says
what it is and a back panel a parent can read without unfolding anything.

Printing: landscape letter, double sided, flipped on the SHORT edge. Fold the
right third in, then the left third over it. The on-screen banner repeats this
and does not print.

Panel geometry, derived by folding the sheet rather than trusting a template.
With the right third folded in and the left third folded over it, the outward
faces land like this:

    outside sheet, left to right:  front cover | back cover | inside flap
    inside sheet,  left to right:  panel 1 | panel 2 | panel 3

The last section in the file becomes the back panel, which faces outward when
folded, so put the material a parent should get without unfolding anything last.
Everything before it flows across the flap and the three inside panels in the
order written, so section order stays the author's decision.
"""
import argparse
import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render import parse, inline          # one parser, one Markdown dialect

PANELS = 3                                 # inside panels available for sections
CHARS_PER_LINE = 34                        # measured against the rendered 11pt panel column

CSS = """
@page { size: 11in 8.5in; margin: 0; }
:root {
  --wedgwood: #4e6e8e; --wedgwood-deep: #3d5a80;
  --parchment: #f5f4ed; --ivory: #faf9f5; --warm-sand: #e8e6dc;
  --ink: #141413; --charcoal: #3d3d3a; --olive: #504e49; --stone: #6b6a64;
  --border-cream: #f0eee6; --border-warm: #e8e6dc; --ring-warm: #d1cfc5;
  --serif: "Source Serif 4", "Source Serif Pro", Charter, Georgia, "Times New Roman", serif;
  --sans: Inter, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: #d8d6cc; font: 11pt/1.55 var(--sans); color: var(--ink);
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.howto { max-width: 11in; margin: 14px auto 6px; padding: 10px 14px;
         background: var(--ivory); border: 1px solid var(--ring-warm);
         font-size: 10pt; color: var(--olive); }
.howto strong { color: var(--ink); font-weight: 600; }
.sheet { width: 11in; height: 8.5in; margin: 0 auto 14px; background: var(--parchment);
         display: grid; grid-template-columns: repeat(3, 1fr); position: relative; }
.panel { padding: 0.5in 0.38in; overflow: hidden; position: relative; }
.panel + .panel { border-left: 1px dashed var(--ring-warm); }   /* fold guide */

/* ---- cover ---------------------------------------------------------- */
.cover { display: flex; flex-direction: column; }
.eyebrow { font: 500 8pt/1.4 var(--sans); text-transform: uppercase;
           letter-spacing: 1.2px; color: var(--wedgwood); }
.cover h1 { font: 500 34pt/1.06 var(--serif); margin: 24pt 0 0; letter-spacing: -0.7px; }
.cover .rule { height: 2px; background: var(--wedgwood); width: 54pt; margin: 14pt 0; }
.cover .who { font-size: 10pt; color: var(--olive); }
.cover .foot { margin-top: auto; padding-top: 10pt; border-top: 1px solid var(--border-warm);
               font-size: 8.5pt; color: var(--stone); }

/* ---- sections ------------------------------------------------------- */
.panel section { margin: 0 0 20pt; break-inside: avoid; }
.panel h2 { font: 500 15pt/1.2 var(--serif); margin: 0 0 7pt; padding-bottom: 4pt;
            border-bottom: 1px solid var(--border-warm); }
.panel h2 .num { font: 500 9.5pt/1.4 var(--serif); color: var(--wedgwood);
                 margin-right: 6pt; }
ul { margin: 0; padding: 0; list-style: none; }
li { position: relative; padding-left: 13pt; margin-bottom: 5pt; color: var(--charcoal); }
li::before { content: "\\2013"; position: absolute; left: 0; color: var(--wedgwood); }
p { margin: 0 0 4pt; color: var(--charcoal); }
strong { font-weight: 600; color: var(--ink); }

/* ---- weight bar: a percentage table read at a glance ----------------- */
.bar { display: flex; height: 30pt; margin: 4pt 0 7pt; border: 1px solid var(--ring-warm); }
.seg { display: flex; align-items: center; justify-content: center;
       font: 600 9pt/1 var(--sans); font-variant-numeric: tabular-nums; }
.seg.lead { background: var(--wedgwood); color: var(--parchment); }
.seg.mid  { background: var(--warm-sand); color: var(--charcoal); }
.seg.rest { background: var(--ivory); color: var(--charcoal); }
.legend { font-size: 10pt; color: var(--charcoal); }
.legend div { display: flex; align-items: baseline; gap: 5pt; margin-bottom: 2pt; }
.legend i { width: 7pt; height: 7pt; flex: none; }
.legend .pct { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--ink);
               font-weight: 600; }
.scale { margin-top: 7pt; padding-top: 6pt; border-top: 1px solid var(--border-cream);
         font-size: 10.5pt; color: var(--charcoal); font-variant-numeric: tabular-nums; }

/* A running foot anchored to the bottom of every panel. Panels rarely fill to
   the same depth, and without a line to close them the shorter ones read as
   cut off rather than as deliberate margin. */
.panel { display: flex; flex-direction: column; }
.foot-run { margin-top: auto; padding-top: 9pt; border-top: 1px solid var(--border-cream);
            font: 500 8pt/1.4 var(--sans); text-transform: uppercase;
            letter-spacing: 1.2px; color: var(--stone); display: flex; }
.foot-run span { margin-left: auto; color: var(--wedgwood); }

/* ---- back panel ------------------------------------------------------ */
.back { display: flex; flex-direction: column; }
.back .note { margin-top: auto; padding-top: 9pt; border-top: 1px solid var(--border-warm);
              font-size: 8.5pt; color: var(--stone); }
@media print { body { background: none; } .howto { display: none; }
               .sheet { margin: 0; page-break-after: always; }
               .panel + .panel { border-left: none; } }
"""


def height(section):
    """Rough render height of a section, in line units, for balancing panels."""
    head, blocks = section
    units = 3 if head else 0
    for kind, payload in blocks:
        if kind == "ul":
            units += sum(max(1, -(-len(x) // CHARS_PER_LINE)) for x in payload)
        elif kind == "table":
            units += len(payload) + 2
        else:
            units += max(1, -(-len(payload) // CHARS_PER_LINE))
    return units + 1.5


def pack(sections, panels):
    """Split the sections into consecutive panels so the fullest panel is as
    empty as possible.

    Section order stays the author's decision; only the break points are chosen
    here. Greedy filling looked fine and was not: it breaks as soon as a panel
    passes the average, which strands the last panel and leaves one panel half
    empty next to another that is packed. Panel counts are small, so search the
    break points exactly instead of approximating them.
    """
    hs = [height(s) for s in sections]
    n = len(hs)
    if n <= panels:                                  # one section per panel
        return [[s] for s in sections] + [[]] * (panels - n)

    def feasible(cap):
        used, groups = 0.0, 1
        for h in hs:
            if used + h > cap and groups < panels:
                groups, used = groups + 1, h
            else:
                used += h
        return groups <= panels and used <= cap

    lo, hi = max(hs), sum(hs)
    for _ in range(60):                              # binary search on the cap
        mid = (lo + hi) / 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid
    cap, out, cur, used = hi, [], [], 0.0
    for s, h in zip(sections, hs):
        if cur and used + h > cap and len(out) < panels - 1:
            out.append(cur)
            cur, used = [], 0.0
        cur.append(s)
        used += h
    out.append(cur)
    while len(out) < panels:
        out.append([])
    return out


def weight_bar(rows):
    """A table whose second column is percentages becomes a proportional bar.

    Three categories in a table are three numbers to compare, and the comparison
    is the point: a student who sees that individual tests are three quarters of
    the bar has learned the most important thing on the page without reading it.
    """
    data = []
    for label, *rest in rows[1:]:
        m = re.search(r"(\d+(?:\.\d+)?)\s*%", " ".join(rest))
        if not m:
            return None
        data.append((label, float(m.group(1))))
    if len(data) < 2 or abs(sum(v for _, v in data) - 100) > 0.51:
        return None
    ranked = sorted(data, key=lambda d: -d[1])
    tone = {ranked[0][0]: "lead", ranked[1][0]: "mid"}
    fill = {"lead": "var(--wedgwood)", "mid": "var(--warm-sand)", "rest": "var(--ivory)"}
    segs, legend = [], []
    for label, val in data:
        cls = tone.get(label, "rest")
        segs.append('<div class="seg %s" style="width:%.4f%%">%g%%</div>'
                    % (cls, val, val))
        legend.append('<div><i style="background:%s"></i>%s<span class="pct">%g%%</span></div>'
                      % (fill[cls], inline(label), val))
    return ('<div class="bar">%s</div><div class="legend">%s</div>'
            % ("".join(segs), "".join(legend)))


def render_blocks(blocks):
    out = []
    for kind, payload in blocks:
        if kind == "ul":
            out.append("<ul>%s</ul>" % "".join("<li>%s</li>" % inline(x) for x in payload))
        elif kind == "table":
            bar = weight_bar(payload)
            if bar:
                out.append(bar)
            else:
                head_row, *rest = payload
                out.append("<table><tr>%s</tr>%s</table>" % (
                    "".join("<th>%s</th>" % inline(c) for c in head_row),
                    "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r)
                            for r in rest)))
        else:
            cls = ' class="scale"' if payload.lower().startswith("scale") else ""
            out.append("<p%s>%s</p>" % (cls, inline(payload)))
    return "".join(out)


def sections_html(sections, numbers):
    """Render sections with explicit numbers, so the sequence survives being
    split across panels and sheets."""
    body = []
    for (head, blocks), n in zip(sections, numbers):
        body.append("<section>")
        if head:
            body.append('<h2><span class="num">%02d</span>%s</h2>' % (n, inline(head)))
        body.append(render_blocks(blocks))
        body.append("</section>")
    return "".join(body)


def build(md):
    title, sub, sections, notes = parse(md)
    # The back panel faces outward when folded, so the last section should be
    # the one a parent can use without unfolding anything. Everything else is
    # balanced across the flap and the three inside panels together: the flap is
    # a full panel, and treating it as a spare shelf leaves it half empty while
    # an inside panel takes three sections.
    back = sections[-1:]
    groups = pack(sections[:-1], PANELS + 1)
    flap, inside = groups[0], groups[1:]

    numbering = {id(s): i for i, s in enumerate(sections, 1)}
    short = re.split(r"[:.]", title)[0].strip()          # course name, minus the label

    def render(group, label):
        return ('<div class="panel">%s<div class="foot-run">%s<span>%s</span></div></div>'
                % (sections_html(group, [numbering[id(s)] for s in group]),
                   inline(short), inline(label)))

    # The eyebrow already says Quick Reference, so the cover title is the course
    # name alone rather than the same words twice.
    cover = ('<div class="panel cover"><div class="eyebrow">Quick Reference</div>'
             '<h1>%s</h1><div class="rule"></div><div class="who">%s</div>'
             '<div class="foot">The short version. The full syllabus has the '
             'complete policies.</div></div>' % (inline(short), inline(sub)))
    # The back faces outward on the folded pamphlet, so it repeats who this is
    # from. A back cover that does not identify the class is a loose sheet.
    back_panel = ('<div class="panel back">%s<div class="note"><strong>%s</strong><br>%s'
                  '<br><br>%s</div></div>'
                  % (sections_html(back, [numbering[id(back[0])]]),
                     inline(short), inline(sub),
                     inline(notes[0]) if notes else ""))
    flap_html = render(flap, "Start here")
    inside_html = [render(g, "%d of %d" % (i, PANELS))
                   for i, g in enumerate(inside, 1)]

    howto = ('<div class="howto"><strong>Printing.</strong> Landscape letter, '
             'double sided, flipped on the <strong>short edge</strong>. Fold the '
             'right third in, then the left third over it. Sheet one is the '
             'outside (cover, back, flap), sheet two is the inside spread. '
             'This banner does not print.</div>')
    sheets = ('<div class="sheet">%s%s%s</div><div class="sheet">%s</div>'
              % (cover, back_panel, flap_html, "".join(inside_html)))
    return ('<!doctype html><html><head><meta charset="utf-8"><title>%s</title>'
            '<style>%s</style></head><body>%s%s</body></html>'
            % (html.escape(title), CSS, howto, sheets))


SINGLE_CSS = """
/* One sheet, one side. The same content as the duplex version has to live in
   three panels instead of six, which is the same area as the portrait one-pager
   and therefore the same type size, not the roomier handout size. */
body { font-size: 10pt; }
.panel { padding: 0.42in 0.32in; }
.panel section { margin: 0 0 13pt; }
.panel h2 { font-size: 13pt; margin: 0 0 5pt; }
li { margin-bottom: 3pt; }
.bar { height: 26pt; }
.legend { font-size: 9pt; }
.scale { font-size: 9.5pt; }
.masthead { margin: 0 0 14pt; padding-bottom: 9pt;
            border-bottom: 2px solid var(--wedgwood); }
.masthead .eyebrow { margin-bottom: 5pt; }
.masthead h1 { font: 500 19pt/1.08 var(--serif); margin: 0 0 5pt;
               letter-spacing: -0.3px; }
.masthead .who { font-size: 9pt; color: var(--olive); }
.foot-run { padding-top: 7pt; font-size: 7.5pt; }
"""

MASTHEAD = ("__masthead__", [])          # placeholder so packing reserves its space


def build_single(md):
    """Three panels on one side of one sheet, folded in a Z so a panel faces out.

    A trifold that folds the right third in and the left over it hides both
    printed faces when the sheet is printed on one side only, so the thing you
    hand someone is blank. An accordion fold does not: the first panel stays
    outward. That is the whole reason this mode folds differently.
    """
    title, sub, sections, notes = parse(md)
    short = re.split(r"[:.]", title)[0].strip()
    numbering = {id(s): i for i, s in enumerate(sections, 1)}

    groups = pack([MASTHEAD] + sections, PANELS)
    masthead = ('<div class="masthead"><div class="eyebrow">Quick Reference</div>'
                '<h1>%s</h1><div class="who">%s</div></div>'
                % (inline(short), inline(sub)))
    panels = []
    for i, group in enumerate(groups, 1):
        real = [s for s in group if s is not MASTHEAD]
        head = masthead if any(s is MASTHEAD for s in group) else ""
        foot = ('<div class="foot-run">%s<span>%s</span></div>'
                % (inline(short), "%d of %d" % (i, PANELS)))
        panels.append('<div class="panel">%s%s%s</div>'
                      % (head, sections_html(real, [numbering[id(s)] for s in real]), foot))

    howto = ('<div class="howto"><strong>Printing.</strong> One sheet, one side, '
             'landscape letter. Fold it in a <strong>Z</strong>, first panel '
             'forward and last panel back, so the first panel faces out and the '
             'rest opens like a concertina. This banner does not print.</div>')
    return ('<!doctype html><html><head><meta charset="utf-8"><title>%s</title>'
            '<style>%s%s</style></head><body>%s<div class="sheet">%s</div></body></html>'
            % (html.escape(title), CSS, SINGLE_CSS, howto, "".join(panels)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("quickref")
    ap.add_argument("-o", "--out")
    ap.add_argument("--single", action="store_true",
                    help="three panels on one side of one sheet, folded in a Z. "
                         "Fits the same content at one-pager density and costs "
                         "half the paper, at the price of the cover panel.")
    a = ap.parse_args()
    md = open(a.quickref, encoding="utf-8").read()
    out = a.out or a.quickref.rsplit(".", 1)[0] + "-pamphlet.html"
    open(out, "w", encoding="utf-8").write(build_single(md) if a.single else build(md))
    print("[OK] wrote %s (%s)"
          % (out, "single sided, Z fold" if a.single else "trifold, two sides"))


if __name__ == "__main__":
    main()
