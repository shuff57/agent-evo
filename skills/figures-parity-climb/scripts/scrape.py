#!/usr/bin/env python3
"""Scrape the four teacher.dev figure sites into a machine-readable spec.

Why this exists: a parity climb has to start from the live reference, not from a
hand-written list that drifts. This script records what each reference page
actually offers (the control text and the "What you can set" bullets), plus a
hash of the HTML it read, so a later score can prove what it was scored against.

No third-party packages. Python 3.9+.

    python3 scrape.py --out .figures-parity/scrape
    python3 scrape.py --sites math --only transformations
    python3 scrape.py --out NEW --compare OLD/spec.json     # scrape, then say what changed
    python3 scrape.py --spec NEW/spec.json --compare OLD/spec.json   # compare only, no fetch
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Iterable

from lib import page_text_hash

SITES = {
    "math": "https://www.mathfigures.com",
    "physics": "https://www.physicsfigures.com",
    "chemistry": "https://www.chemistryfigures.com",
    "biology": "https://www.biologyfigures.com",
}

# Pages that are not figures.
NOT_FIGURES = {
    "", "about", "privacy", "reuse", "linking", "examples", "contact", "request",
    "favicon.svg", "logo.svg", "sitemap.xml", "robots.txt",
}

UA = "vershion-figure-parity/1.0 (+https://vershion.lefthanddev.com)"


def get(url: str, timeout: float = 25.0) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    last: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
            return raw.decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"GET {url}: {last}")


def text_lines(html: str) -> list[str]:
    """Visible text as stripped lines. Drops scripts, styles, svg and comments."""
    h = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    h = re.sub(r"<(script|style|noscript|svg|template)\b.*?</\1>", "", h, flags=re.S | re.I)
    h = re.sub(r"<br\s*/?>", "\n", h, flags=re.I)
    h = re.sub(r"</(p|div|li|h[1-6]|tr|section|article|label|button|option|td|th)>", "\n", h, flags=re.I)
    h = re.sub(r"<[^>]+>", "\n", h)
    h = unescape(h).replace("\u00a0", " ").replace("\u200b", "")
    out: list[str] = []
    for line in h.splitlines():
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            out.append(line)
    return out


def page_title(html: str, lines: list[str]) -> str:
    m = re.search(r"<title>(.*?)</title>", html, flags=re.S | re.I)
    if m:
        return unescape(re.sub(r"\s+", " ", m.group(1))).strip()
    return lines[0] if lines else ""


def section(lines: list[str], start: str, stop: Iterable[str]) -> list[str]:
    try:
        i = next(k for k, line in enumerate(lines) if line.strip().lower() == start.lower())
    except StopIteration:
        return []
    stops = {s.lower() for s in stop}
    out = []
    for line in lines[i + 1:]:
        low = line.strip().lower()
        if low in stops or any(low.startswith(s) for s in stops):
            break
        out.append(line)
    return out


def controls_region(lines: list[str], title: str) -> list[str]:
    """The control card text, between the opening of the editor and the prose."""
    stop = ["what you can set", "copying, printing and sharing", "frequently asked questions", "save preset"]
    if any(l.strip().lower() == "start from an example" for l in lines):
        return section(lines, "Start from an example", stop)
    # Pages without an example block (the two editors): start after the second title.
    low = [l.strip().lower() for l in lines]
    t = title.split("|")[0].strip().lower()
    hits = [i for i, l in enumerate(low) if l == t]
    if len(hits) >= 2:
        out = []
        for line in lines[hits[1] + 1:]:
            if line.strip().lower() in stop or line.strip().lower().startswith("copying, printing"):
                break
            out.append(line)
        return out
    return lines


def prose_capabilities(lines: list[str]) -> list[str]:
    """Editor pages have no "What you can set"; take the descriptive sentences instead."""
    paras: list[str] = []
    buf: list[str] = []
    for line in lines:
        low = line.strip().lower()
        if len(line) >= 30 and "·" not in line and "| Math Figures" not in line and not low.startswith(("math figures", "physics figures", "chemistry figures", "biology figures")):
            buf.append(line.strip())
        elif buf:
            paras.append(" ".join(buf))
            buf = []
    if buf:
        paras.append(" ".join(buf))
    out: list[str] = []
    for para in paras:
        for sentence in re.split(r"(?<=[.!?])\s+", para):
            sentence = sentence.strip()
            if len(sentence) >= 35:
                out.append(sentence)
    # a piece palette is a capability of its own on the composite editor
    low = [l.strip() for l in lines]
    palette = [x for x in ("Rectangle", "Triangle", "Semicircle", "Circle", "L-shape", "House", "Arch") if x in low]
    if len(palette) >= 3:
        out.append("Piece palette and presets: " + ", ".join(palette))
    seen = set()
    return [x for x in out if not (x in seen or seen.add(x))][:10]

def figure_links(home: str, html: str) -> list[str]:
    out = set()
    for m in re.finditer(r'href="(/[^"#?]*)"', html):
        slug = m.group(1).strip("/")
        if not slug or "/" in slug or slug in NOT_FIGURES:
            continue
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug):
            continue
        out.add(slug)
    return sorted(out)


def examples(lines: list[str], slug: str) -> list[str]:
    out = []
    for line in lines:
        if "/examples/" in line or re.search(rf"/{re.escape(slug)}/examples/", line):
            out.append(line)
    return sorted(set(out))


FLAG_WORDS = {
    "click": ["click"],
    "drag": ["drag"],
    "type": ["type ", "typed"],
    "paste": ["paste"],
    "add": ["add "],
    "remove": ["remove", "empty a row", "empty a column"],
    "rows": ["add a row", "another row", "empty a row", "add a column", "another column", "add data set", "add another", "add a piece", "add an isotope"],
    "student": ["student"],
    "question": ["question"],
    "answer_key": ["answer key"],
    "color": ["color", "colour"],
    "black_and_white": ["black and white", "black-and-white"],
    "unit": ["unit"],
    "round": ["round to", "rounded", "rounding"],
    "axis": ["axis", "axes"],
    "grid": ["gridline"],
    "title": ["title"],
    "key": [" key"],
    "shading": ["shade", "shading"],
    "preset": ["save preset", "presets"],
    "example": ["start from an example", "example"],
    "print": ["print"],
    "share": ["share link"],
    "download": ["download"],
    "direct_manipulation": ["click", "drag"],
}


def flags_for(text: str) -> dict[str, bool]:
    low = text.lower()
    return {name: any(w in low for w in words) for name, words in FLAG_WORDS.items()}


def parse_page(site: str, slug: str, html: str) -> dict:
    lines = text_lines(html)
    title = page_title(html, lines)
    can_set = section(lines, "What you can set", ["Copying, printing and sharing", "Frequently asked questions"])
    controls = controls_region(lines, title)
    prose = prose_capabilities(controls)
    if not can_set:
        can_set = prose[:8]
    page = {
        "site": site,
        "slug": slug,
        "url": f"{SITES[site]}/{slug}",
        "title": title,
        "html_sha256": hashlib.sha256(html.encode("utf-8")).hexdigest(),
        "text_sha256": "",
        "can_set": can_set,
        "prose": prose,
        "controls_text": "\n".join(controls),
        "flags": flags_for("\n".join(controls + can_set)),
        "examples": examples(lines, slug),
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    page["text_sha256"] = page_text_hash(page)
    return page


def compare(old: dict, new: dict) -> list[str]:
    """What changed between two scrapes: figures added or removed on a site, and pages whose
    extracted text changed (with the bullets added and removed). A non-empty result means the
    reference moved and a frozen baseline is no longer comparable."""
    lines: list[str] = []
    for site in sorted(set(old.get("sites", {})) | set(new.get("sites", {}))):
        o = old.get("sites", {}).get(site, {}).get("pages", {})
        n = new.get("sites", {}).get(site, {}).get("pages", {})
        added, removed = sorted(set(n) - set(o)), sorted(set(o) - set(n))
        for slug in added:
            lines.append(f"- **new figure** `{site}/{slug}` — {n[slug].get('title', '')}")
        for slug in removed:
            lines.append(f"- **removed** `{site}/{slug}`")
        for slug in sorted(set(o) & set(n)):
            a, b = o[slug], n[slug]
            if "error" in a or "error" in b:
                if ("error" in a) != ("error" in b):
                    lines.append(f"- `{site}/{slug}`: fetch error {'cleared' if 'error' in a else 'appeared'}")
                continue
            if page_text_hash(a) == page_text_hash(b):
                continue
            gone = [x for x in a.get("can_set", []) if x not in b.get("can_set", [])]
            came = [x for x in b.get("can_set", []) if x not in a.get("can_set", [])]
            lines.append(f"- **changed** `{site}/{slug}`" + ("" if gone or came else " (control text only)"))
            lines += [f"  - removed: {x}" for x in gone]
            lines += [f"  - added: {x}" for x in came]
    return lines


def write_compare(old_path: Path, new: dict, out_dir: Path) -> None:
    old = json.loads(old_path.read_text(encoding="utf-8"))
    lines = compare(old, new)
    body = ["# Reference changes", "", f"Old: `{old_path}` ({old.get('generated_at', '?')}) · new: {new.get('generated_at', '?')}", ""]
    body += lines or ["No change: every page's extracted text matches."]
    (out_dir / "compare.md").write_text("\n".join(body) + "\n", encoding="utf-8")
    print("\n".join(body))


def fetch_home(site: str) -> str:
    return get(SITES[site] + "/")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".figures-parity/scrape")
    ap.add_argument("--sites", nargs="*", default=list(SITES), choices=list(SITES))
    ap.add_argument("--only", nargs="*", help="limit to these slugs")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--compare", help="a previous spec.json; write compare.md listing what changed")
    ap.add_argument("--spec", help="with --compare: an existing spec.json to compare instead of fetching")
    args = ap.parse_args()

    if args.spec:
        if not args.compare:
            ap.error("--spec is only for --compare")
        spec_path = Path(args.spec)
        write_compare(Path(args.compare), json.loads(spec_path.read_text(encoding="utf-8")), spec_path.parent)
        return 0

    out = Path(args.out)
    (out / "raw").mkdir(parents=True, exist_ok=True)
    (out / "text").mkdir(parents=True, exist_ok=True)

    index: dict[str, dict] = {}
    for site in args.sites:
        home = fetch_home(site)
        (out / "raw" / f"{site}-home.html").write_text(home, encoding="utf-8")
        slugs = figure_links(SITES[site], home)
        if args.only:
            want = set(args.only)
            slugs = [s for s in slugs if s in want]
        print(f"{site}: {len(slugs)} figures", file=sys.stderr)
        index[site] = {"home": SITES[site], "slugs": slugs, "pages": {}}

    jobs = [(site, slug) for site, d in index.items() for slug in d["slugs"]]

    def one(job: tuple[str, str]) -> tuple[str, str, str | None, str]:
        site, slug = job
        try:
            return site, slug, get(f"{SITES[site]}/{slug}"), ""
        except Exception as e:  # keep the run going; the error lands in spec.json
            return site, slug, None, str(e)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for site, slug, html, err in pool.map(one, jobs):
            if html is None:
                index[site]["pages"][slug] = {"site": site, "slug": slug, "error": err}
                continue
            (out / "raw" / site / f"{slug}.html").parent.mkdir(parents=True, exist_ok=True)
            (out / "raw" / site / f"{slug}.html").write_text(html, encoding="utf-8")
            page = parse_page(site, slug, html)
            (out / "text" / site / f"{slug}.txt").parent.mkdir(parents=True, exist_ok=True)
            (out / "text" / site / f"{slug}.txt").write_text(
                f"# {page['title']}\n{page['url']}\n\n## Controls\n{page['controls_text']}\n\n## What you can set\n"
                + "\n".join(f"- {x}" for x in page["can_set"]),
                encoding="utf-8",
            )
            index[site]["pages"][slug] = page
            print(f"  {site}/{slug}", file=sys.stderr)

    spec = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sites": index,
    }
    (out / "spec.json").write_text(json.dumps(spec, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out / 'spec.json'}", file=sys.stderr)
    errors = [f"{site}/{slug}" for site, d in index.items() for slug, pg in d["pages"].items() if "error" in pg]
    if errors:
        print(f"FETCH ERRORS ({len(errors)}): {', '.join(errors)}", file=sys.stderr)
    if args.compare:
        write_compare(Path(args.compare), spec, out)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
