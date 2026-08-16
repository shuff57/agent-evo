#!/usr/bin/env python3
"""Inline SVG figures for the quick reference.

Every figure here is *derived from the Markdown*, never hand drawn. That is the
whole design rule: a diagram with a number in it that the checker cannot trace
back to the syllabus is the same invented fact as a made-up late policy, only
harder to notice because it looks like a picture rather than a claim. So the
weight bar reads the grading table and a flow reads a `flow` block. Nothing is typed into a figure by hand.

Colors come through as CSS custom properties, which inline SVG inherits from the
page, so the figures track the bookSHelf theme without repeating its hex values.
"""
import re

CHAR_W = 4.9          # average glyph advance at the figure's 8.5px text size
FIG_W = 300.0         # viewBox width; figures scale to the column
BOX_W = FIG_W         # flow boxes span the column, so text wraps less and the
                      # figure does not sit in a third of dead space


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if len(trial) * CHAR_W > width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def weight_bar(rows):
    """Grading table -> one proportional bar plus a legend.

    Three weights in a table are three numbers to compare, and the comparison is
    the point. A student who sees that one category is three quarters of the bar
    has taken in the most consequential fact on the page without reading it.

    Returns None when the table is not a set of weights, so an ordinary table
    still renders as a table.
    """
    data = []
    for label, *rest in rows[1:]:
        m = re.search(r"(\d+(?:\.\d+)?)\s*%", " ".join(rest))
        if not m:
            return None
        data.append((re.sub(r"\*\*", "", label), float(m.group(1))))
    if len(data) < 2 or abs(sum(v for _, v in data) - 100) > 0.51:
        return None

    order = sorted(range(len(data)), key=lambda i: -data[i][1])
    # Third and beyond use border-cream, which sits just *darker* than the
    # parchment page. Ivory is lighter than the page, so a small segment in
    # it reads as a blank gap in the bar rather than a share of the grade.
    tone = {order[0]: "var(--wedgwood)", order[1]: "var(--warm-sand)"}
    REST = "var(--border-cream)"
    W, BAR = FIG_W, 22.0
    parts, x = [], 0.0
    for i, (label, val) in enumerate(data):
        w = W * val / 100.0
        fill = tone.get(i, REST)
        parts.append('<rect x="%.2f" y="0" width="%.2f" height="%g" fill="%s"/>'
                     % (x, w, BAR, fill))
        if w > 34:                       # only label a segment wide enough to hold it
            parts.append('<text x="%.2f" y="%g" text-anchor="middle" font-size="9" '
                         'font-weight="600" fill="%s">%g%%</text>'
                         % (x + w / 2, BAR / 2 + 3.2,
                            "var(--parchment)" if i == order[0] else "var(--ink)", val))
        x += w
    parts.append('<rect x="0" y="0" width="%g" height="%g" fill="none" '
                 'stroke="var(--ring-warm)"/>' % (W, BAR))

    y = BAR + 13
    for i, (label, val) in enumerate(data):
        parts.append('<rect x="0" y="%g" width="7" height="7" fill="%s" '
                     'stroke="var(--ring-warm)" stroke-width="0.5"/>'
                     % (y - 6.5, tone.get(i, REST)))
        parts.append('<text x="12" y="%g" font-size="8.5" fill="var(--charcoal)">%s</text>'
                     % (y, esc(label)))
        parts.append('<text x="%g" y="%g" font-size="8.5" font-weight="600" '
                     'text-anchor="end" fill="var(--ink)">%g%%</text>' % (W, y, val))
        y += 11.5
    return svg(W, y - 4, parts)


def flow(steps):
    """A `flow` block -> stacked boxes joined by arrows.

    Rules that are a sequence read badly as prose and well as a chain: two
    semester percentages, averaged, becoming one letter is three boxes and two
    arrows, and nobody has to hold the order in their head while reading.
    """
    if len(steps) < 2:
        return None
    W = FIG_W
    parts, y = [], 0.0
    for i, step in enumerate(steps):
        lines = wrap(re.sub(r"\*\*", "", step), BOX_W - 14)
        h = 9 + 11 * len(lines)
        last = i == len(steps) - 1
        parts.append('<rect x="0" y="%.2f" width="%g" height="%.2f" rx="2" '
                     'fill="%s" stroke="var(--ring-warm)"/>'
                     % (y, BOX_W, h, "var(--wedgwood)" if last else "var(--ivory)"))
        ty = y + 13
        for ln in lines:
            parts.append('<text x="7" y="%.2f" font-size="8.5" fill="%s">%s</text>'
                         % (ty, "var(--parchment)" if last else "var(--charcoal)", esc(ln)))
            ty += 11
        y += h
        if not last:
            parts.append('<path d="M%g %.2f v9" stroke="var(--wedgwood)" fill="none"/>'
                         % (BOX_W / 2, y))
            parts.append('<path d="M%g %.2f l-3 -4 h6 z" fill="var(--wedgwood)"/>'
                         % (BOX_W / 2, y + 9.5))
            y += 11
    return svg(W, y, parts)


def svg(w, h, parts):
    # No width/height attributes: CSS sizes the figure, and height="auto" is not
    # a valid SVG attribute value (browsers log it and fall back).
    return ('<svg class="fig" viewBox="0 0 %g %.2f" preserveAspectRatio="xMinYMin meet" '
            'role="img" xmlns="http://www.w3.org/2000/svg" '
            'font-family="Inter, system-ui, sans-serif">%s</svg>'
            % (w, h, "".join(parts)))
