"""Re-apply the Svelte symbol-extraction patch to graphify (PyPI: graphifyy).

graphify feeds raw .svelte files to the JS tree-sitter grammar, which makes the
whole SFC one top-level ERROR node -- every symbol in the <script> block is lost
and only the file node survives (the "syntax errors ... first error at line 1"
warning, issue #2551). extract_vue already solves this with _vue_mask_non_script,
which is generic; this wires extract_svelte to the same path.

pip install -U graphifyy overwrites site-packages, so install.sh re-runs this on
every install. After a manual upgrade, re-run it by hand:
    python patches/graphify-svelte-symbols.py

Idempotent. Measured on steve-desktop + O.G.R.E: +1186 nodes, +2664 edges.
Symptom of a lost patch: the #2551 warning returns on .svelte files.
"""
import sys
from pathlib import Path

import graphify

TARGET = Path(graphify.__file__).parent / "extract.py"

OLD = '''    Tree-sitter only sees the <script> block. Svelte template syntax like
    {#await import('./X.svelte')} lives in the markup layer and is invisible
    to the JS parser, so a regex pass covers those dynamic imports.
    """
    result = _extract_generic(path, _JS_CONFIG)
    try:
        import re as _re
        src = path.read_text(encoding="utf-8", errors="replace")'''

NEW = '''    Masks the non-<script> regions and parses the script with the grammar its
    ``lang`` implies, mirroring :func:`extract_vue` -- feeding the raw SFC to the
    JS grammar makes the whole file one top-level ERROR node, so every symbol in
    the script block is lost and only the file node survives.

    Svelte template syntax like {#await import('./X.svelte')} lives in the markup
    layer and is blanked by the mask, so a regex pass covers those dynamic imports.
    """
    try:
        src_text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {"nodes": [], "edges": []}

    masked, lang = _vue_mask_non_script(src_text)
    if lang == "tsx":
        config = _TSX_CONFIG
    elif lang in ("js", "jsx"):
        config = _JS_CONFIG
    else:  # "ts" or unspecified -- TS grammar is a superset of JS
        config = _TS_CONFIG

    result = _extract_generic(path, config, source_override=masked.encode("utf-8"))
    try:
        import re as _re
        src = src_text'''

src = TARGET.read_text(encoding="utf-8")
# Sentinel, not `NEW in src`: prose punctuation may differ between an editor-applied
# patch and this file's ASCII copy, but the call itself is exact either way.
if "_vue_mask_non_script(src_text)" in src:
    print(f"already patched: {TARGET}")
    sys.exit(0)
if OLD not in src:
    sys.exit(
        f"anchor not found in {TARGET} -- graphify changed extract_svelte upstream. "
        "Check whether the fix landed before re-patching."
    )
TARGET.with_suffix(".py.pre-svelte-patch").write_text(src, encoding="utf-8")
TARGET.write_text(src.replace(OLD, NEW, 1), encoding="utf-8")
print(f"patched: {TARGET}")
