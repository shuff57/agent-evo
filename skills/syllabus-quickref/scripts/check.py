#!/usr/bin/env python3
"""Audit a syllabus quick reference against the syllabus it came from.

Usage:
    python check.py QUICKREF.md --source SOURCE.txt [--columns 2]

The whole risk of this task is quiet invention: a late-work percentage that was
never in the syllabus, an office hour that got rounded, a policy softened into
something the teacher never wrote. A teacher cannot catch that by reading
the pretty output; it looks right. So every fact-shaped token in the rewrite is
traced back to the source here, mechanically.

Exit code 1 if any FAIL. Warnings alone exit 0.
"""
import argparse
import re
import sys

WORD_NUM = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14",
    "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18",
    "nineteen": "19", "twenty": "20", "thirty": "30", "forty": "40",
    "fifty": "50", "sixty": "60", "seventy": "70", "eighty": "80",
    "ninety": "90", "hundred": "100",
}

MONTHS = ("january february march april may june july august september "
          "october november december").split()

# Phrases that mean the legal register survived the rewrite. Each one is a
# sentence a 7th grader would skip, which is the same as not being told.
JARGON = [
    r"\bpursuant to\b", r"\bshall be\b", r"\bherein\b", r"\bthereof\b",
    r"\bin accordance with\b", r"\bis subject to\b", r"\breserves the right\b",
    r"\bnotwithstanding\b", r"\bwithout limitation\b", r"\bas set forth\b",
    r"\bapplicable law\b", r"\bboard policy\b", r"\bed(ucation)? code\b",
    r"\btitle ix\b", r"\bsection 504\b", r"\bferpa\b", r"\bada\b",
    r"\bnon-?discriminat", r"\bequal opportunity\b", r"\bgrievance\b",
    r"\bthe instructor\b", r"\bstudents are expected to\b",
    r"\bit is the responsibility of\b", r"\bat the discretion of\b",
    r"\bany and all\b", r"\bmay result in disciplinary\b",
    r"\bcommon core state standards?\b", r"\bcurriculum framework\b",
    r"\bmission statement\b", r"\bphilosophy of (the )?(course|class)\b",
]

SECTIONS = {   # heading keyword -> why a parent needs it
    "contact":  "how to reach the teacher",
    "grade":    "how the grade is figured",
    "late":     "what happens to late or missing work",
    "absen":    "what to do after an absence",   # matches absent and absence
}


def norm(s):
    s = s.lower()
    # Word-bounded: without it, "percentage" becomes "%age" and the number in
    # front of it reads as a percentage claim that the syllabus never made.
    s = re.sub(r"\bper ?cent\b", "%", s)
    s = re.sub(r"[‐-―]", "-", s)          # unicode dashes
    s = re.sub(r"[‘’]", "'", s)
    return s


TOKEN = re.compile(r"\d+(?:\.\d+)?|%|[a-z]+")

# A number is a claim when a unit sits next to it, as in "3 days" or "45%". A number
# next to an ordinary word is usually a name or an address ("Algebra 2",
# "Room 214") and only needs to exist somewhere in the syllabus. Checking units
# is what separates an invented penalty from a course number.
UNITS = {"%", "day", "wee", "min", "hou", "poi", "att", "ret", "tar", "abs",
         "pro", "que", "pag", "cre", "cha", "tim", "dol", "tri", "per"}


def stem(tok):
    return tok if tok == "%" else tok[:3]


def contexts(text, lookahead):
    """-> ({number: stems that follow it}, {every number present}).

    Deliberately ignores line breaks: a syllabus pulled out of a PDF wraps
    wherever the column ended, so "3:45 / PM in Room 214" would otherwise look
    like a number with no context at all.
    """
    toks = TOKEN.findall(norm(text))
    ctx, bare = {}, set()
    for i, t in enumerate(toks):
        if not t[0].isdigit():
            continue
        bare.add(t)
        ctx.setdefault(t, set()).update(stem(x) for x in toks[i + 1:i + 1 + lookahead])
    for word, digit in WORD_NUM.items():           # "three (3) school days" -> 3
        for m in re.finditer(r"\b%s\b(.{0,40})" % word, norm(text), re.S):
            bare.add(digit)
            ctx.setdefault(digit, set()).update(
                stem(x) for x in TOKEN.findall(m.group(1))[:lookahead])
    for i, m in enumerate(MONTHS, 1):              # "August 25" -> 8
        if re.search(r"\b%s" % m[:3], norm(text)):
            bare.add(str(i))
    return ctx, bare


def trace_numbers(qr, src):
    """Numbers asserted by the rewrite that the syllabus does not support."""
    s_ctx, s_bare = contexts(src, 4)
    bad = []
    for line in norm(qr).splitlines():
        clean = re.sub(r"^\s*[-*|#>]+\s*", "", line).strip()
        toks = TOKEN.findall(clean)
        for i, t in enumerate(toks):
            if not t[0].isdigit():
                continue
            units = [x for x in toks[i + 1:i + 3] if stem(x) in UNITS]
            if units:
                if not {stem(u) for u in units} & s_ctx.get(t, set()):
                    bad.append(("%s %s" % (t, units[0]), clean))
            elif t not in s_bare:
                bad.append((t, clean))
    return bad


def sentences(text):
    body = "\n".join(l for l in text.splitlines() if not l.strip().startswith("#"))
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n", body) if s.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("quickref")
    ap.add_argument("--source", required=True)
    ap.add_argument("--columns", type=int, default=2,
                    help="page layout the rewrite targets; sets the word budget")
    a = ap.parse_args()

    qr = open(a.quickref, encoding="utf-8").read()
    src = open(a.source, encoding="utf-8").read()
    fails, warns = [], []

    # 1. Number fidelity, the check that actually catches invention.
    unmatched = trace_numbers(qr, src)
    if unmatched:
        fails.append("%d number(s) in the quick reference are not in the syllabus:"
                     % len(unmatched))
        for n, ctx in unmatched[:15]:
            fails.append('    %-12s in: "%s"' % (n, ctx[:66]))
        fails.append("    Trace each one to a line in the syllabus or cut it. "
                     "Rewording is fine; new facts are not.")

    # 2. Contact details must be copied, never reconstructed from memory.
    s_low = norm(src)
    for pat, label in ((r"[\w.+-]+@[\w.-]+\.\w+", "email"),
                       (r"https?://[^\s)\]]+", "link")):
        for hit in set(re.findall(pat, norm(qr))):
            if hit.rstrip("/.,") not in s_low:
                fails.append("%s %r does not appear in the syllabus" % (label, hit))

    # 3. Grade weights should still add up. Only percentages inside the table
    #    count, because a "-10% per day" penalty in prose is not a weight.
    weights = [float(x) for line in qr.splitlines() if line.lstrip().startswith("|")
               for x in re.findall(r"(\d+(?:\.\d+)?)\s*%", line)]
    if len(weights) >= 2 and abs(sum(weights) - 100) > 0.51:
        warns.append("grade table percentages add to %g, not 100. A category was "
                     "dropped or mistyped (found: %s)" % (sum(weights), weights))

    # 4. Legal register survived.
    for pat in JARGON:
        m = re.search(pat, qr, re.I)
        if m:
            fails.append('legal phrasing left in: "%s". Say it the way you would out loud'
                         % m.group(0))

    # 5. House voice: no em or en dashes, no manufactured enthusiasm.
    for ch, name in (("—", "em dash"), ("–", "en dash")):
        if ch in qr:
            fails.append("%s in the text. Use a period, a comma, or a colon "
                         "instead; the colon is the one that carries a reveal." % name)
    if "!" in qr:
        warns.append("exclamation point. Warmth the teacher did not write reads "
                     "as someone else's voice on their handout.")

    # 6. Readable at a glance.
    for s in sentences(qr):
        n = len(s.split())
        if n > 25:
            warns.append('%d-word sentence, split it: "%s..."' % (n, s[:60]))

    # 7. Fits on the page it claims to fit on.
    # Measured on real drafts rather than guessed: a 353-word page fills 966px of
    # the 970px of printable height a letter sheet has left after its margins.
    # A single column holds noticeably less despite using the full width, since
    # long lines waste the end of every wrapped bullet.
    budget = 350 if a.columns >= 2 else 255
    words = len(re.sub(r"[|#*_-]", " ", qr).split())
    if words > budget:
        warns.append("%d words against the ~%d that fit one %d-column page. Cut, do not shrink the font"
                     % (words, budget, a.columns))

    # 8. Missing sections are a question for the teacher, not a gap to fill in.
    heads = norm("\n".join(l for l in qr.splitlines() if l.strip().startswith("#")))
    body = norm(qr)
    for key, why in SECTIONS.items():
        if key not in heads and key not in body:
            warns.append("nothing about %s. If the syllabus does not say, ask the "
                         "teacher rather than writing a reasonable-sounding rule" % why)

    for f in fails:
        print("[FAIL] " + f if not f.startswith("    ") else f)
    for w in warns:
        print("[WARN] " + w)
    if not fails and not warns:
        print("[OK] traced clean: every number, email and link is in the syllabus, "
              "no legal phrasing left, fits the page.")
    elif not fails:
        print("[OK] no invented facts. Warnings above are judgement calls.")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
