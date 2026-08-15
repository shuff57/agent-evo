#!/usr/bin/env python3
"""Render a syllabus quick reference into the formats a class actually needs.

Usage:
    python render.py QUICKREF.md [--html OUT.html] [--docx OUT.docx] [--columns 2]

Reads a deliberately small slice of Markdown -- h1, h2, bullets, pipe tables,
**bold**, > note -- because the quick reference should not need anything more
expressive than that. If a rewrite needs a feature this does not support, the
rewrite is too complicated for a one-pager.

No third-party Markdown dependency on purpose: this runs on a school laptop
with whatever Python happens to be installed.
"""
import argparse
import html
import re

CSS = """
@page { size: letter; margin: 0.45in; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.35 "Segoe UI", Calibri, system-ui, sans-serif;
       color: #14181f; margin: 0; padding: 0.45in; max-width: 8.5in; }
h1 { font-size: 19pt; margin: 0 0 2pt; letter-spacing: -.01em; }
.sub { font-size: 10pt; color: #4a5568; margin: 0 0 10pt;
       padding-bottom: 7pt; border-bottom: 2.5px solid #14181f; }
.cols { column-count: __COLS__; column-gap: 22pt; }
section { break-inside: avoid; margin: 0 0 11pt; }
h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .07em;
     color: #1a4d8f; margin: 0 0 4pt; padding-bottom: 2pt;
     border-bottom: 1px solid #d3dae4; }
p { margin: 0 0 4pt; }
ul { margin: 0; padding-left: 15pt; }
li { margin-bottom: 2.5pt; }
table { border-collapse: collapse; width: 100%; margin: 1pt 0 3pt; font-size: 10pt; }
th { text-align: left; font-size: 8.5pt; text-transform: uppercase;
     letter-spacing: .05em; color: #4a5568; border-bottom: 1px solid #a9b4c2;
     padding: 2pt 5pt 2pt 0; }
td { padding: 2pt 5pt 2pt 0; border-bottom: 1px solid #eceff3; }
strong { font-weight: 650; }
.note { column-span: all; margin-top: 8pt; padding-top: 6pt;
        border-top: 1px solid #d3dae4; font-size: 9pt; color: #4a5568; }
@media print { body { padding: 0; } .note { page-break-inside: avoid; } }
"""


def inline(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\">])(https?://[^\s<)]+)", r'<a href="\1">\1</a>', s)
    return s


def parse(md):
    """-> (title, subtitle, [(heading, [blocks])], [notes]).

    A block is ('ul', [items]) | ('table', [rows]) | ('p', text).
    """
    title, sub, notes, sections = "", "", [], []
    cur = None
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.strip()
        i += 1
        if not line:
            continue
        if line.startswith("# "):
            title = line[2:].strip()
            for j in range(i, len(lines)):          # first non-blank line after the
                nxt = lines[j].strip()              # title is the who/where/when strip
                if not nxt:
                    continue
                if not nxt.startswith(("#", "-", "*", "|", ">")):
                    sub, i = nxt, j + 1
                break
            continue
        if line.startswith("## "):
            cur = (line[3:].strip(), [])
            sections.append(cur)
            continue
        if line.startswith(">"):
            notes.append(line.lstrip("> ").strip())
            continue
        if cur is None:
            cur = ("", [])
            sections.append(cur)
        if line.startswith(("- ", "* ")):
            if cur[1] and cur[1][-1][0] == "ul":
                cur[1][-1][1].append(line[2:].strip())
            else:
                cur[1].append(("ul", [line[2:].strip()]))
        elif line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                continue                                  # separator row
            if cur[1] and cur[1][-1][0] == "table":
                cur[1][-1][1].append(cells)
            else:
                cur[1].append(("table", [cells]))
        else:
            cur[1].append(("p", line))
    return title, sub, sections, notes


def to_html(md, columns):
    title, sub, sections, notes = parse(md)
    out = [CSS.replace("__COLS__", str(columns))]
    body = ['<h1>%s</h1>' % inline(title)]
    if sub:
        body.append('<p class="sub">%s</p>' % inline(sub))
    body.append('<div class="cols">')
    for head, blocks in sections:
        body.append("<section>")
        if head:
            body.append("<h2>%s</h2>" % inline(head))
        for kind, payload in blocks:
            if kind == "ul":
                body.append("<ul>%s</ul>" %
                            "".join("<li>%s</li>" % inline(x) for x in payload))
            elif kind == "table":
                head_row, *rest = payload
                body.append("<table><tr>%s</tr>%s</table>" % (
                    "".join("<th>%s</th>" % inline(c) for c in head_row),
                    "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r)
                            for r in rest)))
            else:
                body.append("<p>%s</p>" % inline(payload))
        body.append("</section>")
    body.append("</div>")
    for n in notes:
        body.append('<p class="note">%s</p>' % inline(n))
    return ("<!doctype html><html><head><meta charset=\"utf-8\">"
            "<title>%s</title><style>%s</style></head><body>%s</body></html>"
            % (html.escape(title), out[0], "".join(body)))


def to_docx(md, path):
    from docx import Document
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    title, sub, sections, notes = parse(md)
    doc = Document()
    for s in doc.sections:
        s.top_margin = s.bottom_margin = Inches(0.5)
        s.left_margin = s.right_margin = Inches(0.6)
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(3)

    def plain(text):
        """Render **bold** spans into a fresh paragraph and return it."""
        p = doc.add_paragraph()
        for k, part in enumerate(re.split(r"\*\*(.+?)\*\*", text)):
            if part:
                p.add_run(part).bold = bool(k % 2)
        return p

    h = doc.add_paragraph()
    r = h.add_run(title)
    r.bold, r.font.size = True, Pt(19)
    h.paragraph_format.space_after = Pt(1)
    if sub:
        p = doc.add_paragraph()
        r = p.add_run(sub)
        r.font.size, r.font.color.rgb = Pt(10), RGBColor(0x4A, 0x55, 0x68)
        p.paragraph_format.space_after = Pt(8)

    for head, blocks in sections:
        if head:
            p = doc.add_paragraph()
            r = p.add_run(head.upper())
            r.bold, r.font.size = True, Pt(9.5)
            r.font.color.rgb = RGBColor(0x1A, 0x4D, 0x8F)
            p.paragraph_format.space_before, p.paragraph_format.space_after = Pt(7), Pt(2)
        for kind, payload in blocks:
            if kind == "ul":
                for item in payload:
                    p = plain(item)
                    p.style = doc.styles["List Bullet"]
                    p.paragraph_format.space_after = Pt(1)
            elif kind == "table":
                head_row, *rest = payload
                t = doc.add_table(rows=1, cols=len(head_row))
                t.style = "Light Grid Accent 1"
                for c, txt in zip(t.rows[0].cells, head_row):
                    c.text = ""
                    run = c.paragraphs[0].add_run(txt)
                    run.bold, run.font.size = True, Pt(9.5)
                for row in rest:
                    cells = t.add_row().cells
                    for c, txt in zip(cells, row):
                        c.text = ""
                        c.paragraphs[0].add_run(re.sub(r"\*\*", "", txt)).font.size = Pt(10)
            else:
                plain(payload)

    for n in notes:
        p = plain(n)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(8)
        for run in p.runs:
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0x4A, 0x55, 0x68)
    doc.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("quickref")
    ap.add_argument("--html")
    ap.add_argument("--docx")
    ap.add_argument("--columns", type=int, default=2)
    a = ap.parse_args()
    md = open(a.quickref, encoding="utf-8").read()
    if not a.html and not a.docx:
        a.html = a.quickref.rsplit(".", 1)[0] + ".html"
    if a.html:
        open(a.html, "w", encoding="utf-8").write(to_html(md, a.columns))
        print("[OK] wrote " + a.html)
    if a.docx:
        to_docx(md, a.docx)
        print("[OK] wrote " + a.docx)


if __name__ == "__main__":
    main()
