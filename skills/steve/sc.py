# sc.py — SafeColleges / Vector Solutions training driver helpers.
#
# Load INSIDE a browser-harness heredoc so it inherits the pre-imported
# browser-harness helpers (js, iframe_target, new_tab, current_tab, ...):
#
#     browser-harness <<'PY'
#     exec(open(r"C:\Users\shuff\.claude\skills\steve\sc.py").read())
#     print(state())
#     PY
#
# Architecture this encodes (verified live):
#   * /training/home                       -> assignment list (a[href*="/training/launch/"])
#   * /training/launch/{course_work|course_version}/{ID}  -> course detail + TOC (a.TOC_item)
#   * /training/player/{SECTION_ID}/{CW_ID}?continue_course=1 -> the player
#       - VIDEO sections: <video> (blob/MSE) lives in the PARENT doc.
#         In-video knowledge checks render in a CROSS-ORIGIN IFRAME
#         (host contains "trainingcdn.com", an AngularJS + SurveyJS "slip" player).
#       - ASSESSMENT sections: questions render in the PARENT doc (no iframe).
#   * Options everywhere are <label class="question_btn">. Submit button text
#     "Submit Answer" is disabled until a selection is made. Feedback text is
#     "Correct!" / "Incorrect". Wrong assessment answers reveal the correct
#     option with a colored border ("Correct answers are indicated by borders").

import time, json, re

IFRAME_HOST = "trainingcdn.com"   # cross-origin slip player that hosts in-video questions


# ---------------------------------------------------------------- internals
def _frame():
    """Target id of the in-video question iframe IF it currently holds a question, else None."""
    tid = iframe_target(IFRAME_HOST)
    if not tid:
        return None
    try:
        n = js("document.querySelectorAll('label.question_btn').length", target_id=tid)
        return tid if n and int(n) > 0 else None
    except Exception:
        return None


def _ctx():
    """(target_id_or_None) for whichever context currently owns the question UI."""
    return _frame()


def base():
    """Origin of the current SafeColleges tab, e.g. https://butte-keenan.safecolleges.com."""
    u = current_tab().get("url", "")
    m = re.match(r"(https?://[^/]+)", u)
    if not m or "safecolleges.com" not in m.group(1):
        raise RuntimeError("Not on a SafeColleges tab. new_tab() to the training site first.")
    return m.group(1)


def logged_in():
    u = current_tab().get("url", "")
    return "safecolleges.com" in u and "/login" not in u


# ---------------------------------------------------------------- readers
def assignments():
    """List assigned courses from /training/home -> [{title, action, href}]."""
    code = r"""
    (() => {
      const m={};
      [...document.querySelectorAll('a[href*="/training/launch/"]')].forEach(a=>{
        const t=(a.innerText||'').replace(/\s+/g,' ').trim(), h=a.href;
        if(!m[h]) m[h]={href:h,title:'',action:''};
        if(/^(continue|start|resume|review|launch)$/i.test(t)) m[h].action=t;
        else if(t) m[h].title=t;
      });
      return Object.values(m);
    })()"""
    return js(code)


def sections():
    """Course-detail TOC -> [{name, status, href}]. status e.g. Completed / Passed / ''."""
    code = r"""
    (() => [...document.querySelectorAll('a.TOC_item')].map(a=>{
      const t=(a.innerText||'').replace(/\s+/g,' ').trim();
      const st=(t.match(/\b(Completed|Passed|Failed|In Progress)\b/i)||[])[1]||'';
      return {name:t, status:st, href:a.href};
    }))()"""
    return js(code)


_PARENT_READER = r"""
(() => {
  if(!document.body) return JSON.stringify({mode:'loading'});
  const bt=document.body.innerText||'';
  // First-run disclaimer / accept gate
  if (document.querySelector('button') &&
      [...document.querySelectorAll('button')].some(b=>/^accept$/i.test((b.innerText||'').trim())) &&
      /Disclaimer|Accept button|Terms|Copyright/i.test(bt))
    return JSON.stringify({mode:'disclaimer'});
  // Result screen
  if (/Your Score/i.test(bt) && /Minimum score to pass/i.test(bt)) {
    const s=(bt.match(/Your Score\s*([0-9]+)\s*%/i)||[])[1];
    const mn=(bt.match(/Minimum score to pass:?\s*([0-9]+)\s*%/i)||[])[1];
    return JSON.stringify({mode:'result', score:+s, min:+mn, passed:(+s)>=(+mn)});
  }
  // Anti-skip guard tripped (seeking/fast-forward detected) -> section must be replayed
  if (/Please Retry Course|spend more time completing|without using the Fast Forward/i.test(bt))
    return JSON.stringify({mode:'retry_required'});
  // Course fully complete
  if (/successfully completed this Course/i.test(bt))
    return JSON.stringify({mode:'course_done'});
  // Section complete chooser
  if (/finished this section|Congratulations/i.test(bt)) {
    const btns=[...document.querySelectorAll('button,a')].filter(e=>e.offsetParent)
      .map(e=>(e.innerText||'').replace(/\s+/g,' ').trim()).filter(Boolean);
    return JSON.stringify({mode:'section_done', buttons:btns});
  }
  // Assessment question (parent doc)
  const qm=bt.match(/QUESTION\s+\d+\s+OF\s+\d+/i);
  const opts=[...document.querySelectorAll('label.question_btn')]
    .map(e=>(e.innerText||'').replace(/\s+/g,' ').trim());
  if (qm && opts.length){
    const i=bt.indexOf(qm[0]); const rest=bt.slice(i+qm[0].length);
    const j=rest.search(/CHOOSE AN OPTION|SELECT THE BEST|CHOOSE ALL/i);
    const text=(j>=0?rest.slice(0,j):rest).replace(/\s+/g,' ').trim();
    const fb=(bt.match(/\b(Correct!|Incorrect)\b/i)||[])[1]||null;
    const next=[...document.querySelectorAll('button,a')]
      .some(e=>/next question|^finish|continue/i.test((e.innerText||'').trim()));
    return JSON.stringify({mode:'assessment', q:qm[0], text, options:opts,
      multi:/CHOOSE ALL/i.test(rest), feedback:fb, can_advance:next});
  }
  // Video
  const v=document.querySelector('video');
  if (v) return JSON.stringify({mode:'video', cur:v.currentTime, dur:v.duration,
                                paused:v.paused, ended:v.ended});
  // Course detail / TOC
  const toc=[...document.querySelectorAll('a.TOC_item')].length;
  if (toc) return JSON.stringify({mode:'course'});
  // My Assignments home
  if (/\/training\/home/.test(location.href) ||
      document.querySelector('a[href*="/training/launch/"]'))
    return JSON.stringify({mode:'home'});
  return JSON.stringify({mode:'unknown', title:document.title, url:location.href});
})()
"""

_QUESTION_READER = r"""
(() => {
  const bt=(document.body&&document.body.innerText)||'';
  const opts=[...document.querySelectorAll('label.question_btn')]
    .map(e=>(e.innerText||'').replace(/\s+/g,' ').trim());
  let text=bt;
  const j=bt.search(/SELECT THE BEST|CHOOSE AN OPTION|CHOOSE ALL/i);
  if(j>=0) text=bt.slice(0,j);
  text=text.replace(/\s+/g,' ').trim();
  const fb=(bt.match(/\b(Correct!|Incorrect)\b/i)||[])[1]||null;
  const cont=[...document.querySelectorAll('button,a')]
    .some(e=>/^continue/i.test((e.innerText||'').trim()));
  return JSON.stringify({mode:'question', text, options:opts,
                         multi:/CHOOSE ALL/i.test(bt), feedback:fb, has_continue:cont});
})()
"""


def state():
    """Single source of truth for 'what screen am I on'. Returns a dict with a 'mode' key:
      question     -> in-video knowledge check (cross-origin iframe). keys: text, options, feedback, has_continue, multi
      assessment   -> graded quiz question (parent doc).            keys: q, text, options, feedback, can_advance, multi
      video        -> video playing/paused.                          keys: cur, dur, paused, ended
      section_done -> 'finished this section' chooser.               keys: buttons
      result       -> assessment score screen.                       keys: score, min, passed
      course_done  -> course fully complete.
      course       -> course-detail / TOC page.
      unknown      -> anything else.                                 keys: title, url
    'in_frame' is True when the active question lives in the iframe."""
    try:
        tid = _frame()
        if tid:
            s = json.loads(js(_QUESTION_READER, target_id=tid))
            s["in_frame"] = True
            return s
        s = json.loads(js(_PARENT_READER))
        s["in_frame"] = False
        return s
    except Exception as e:
        return {"mode": "loading", "error": str(e)[:120]}  # mid-navigation; caller re-polls


# ---------------------------------------------------------------- actions
def _focus():
    """Bring the player tab to the foreground. Background tabs THROTTLE <video> playback to
    ~0.3x; foregrounding restores real-time 1x (and never counts as seeking)."""
    try:
        cdp("Page.bringToFront")
    except Exception:
        pass


def play_video():
    """Foreground the tab, mute + play the parent-doc video. Returns {cur,dur} or 'NOVIDEO'."""
    _focus()
    return js("(()=>{const v=document.querySelector('video');"
              "if(!v)return 'NOVIDEO';v.muted=true;if(v.paused)v.play();"
              "return JSON.stringify({cur:v.currentTime,dur:v.duration});})()")


def answer(option):
    """Select option(s) and click Submit Answer. `option` is a string (substring,
    case-insensitive) or a list of strings for CHOOSE-ALL. Works in iframe or parent.
    Returns 'SUBMITTED' | 'NOSUBMIT' | 'NOTFOUND:...'."""
    tid = _ctx()
    wants = option if isinstance(option, (list, tuple)) else [option]
    payload = json.dumps([str(w).lower().strip() for w in wants])
    sel = r"""
    (() => {
      const wants=%s;
      const labels=[...document.querySelectorAll('label.question_btn')];
      const norm=e=>(e.innerText||'').replace(/\s+/g,' ').trim().toLowerCase();
      const miss=[];
      for(const w of wants){
        let l=labels.find(e=>norm(e)===w) || labels.find(e=>norm(e).includes(w));
        if(!l){ miss.push(w); continue; }
        l.click();
      }
      if(miss.length) return 'NOTFOUND:'+miss.join('||')+' :: have: '+labels.map(norm).join(' | ');
      return 'OK';
    })()""" % payload
    r = js(sel, target_id=tid)
    if str(r).startswith("NOTFOUND"):
        return r
    time.sleep(0.5)
    sub = r"""
    (() => {const b=[...document.querySelectorAll('button,a,input')]
      .find(e=>/submit answer/i.test(e.innerText||e.value||'') && !e.disabled);
      if(!b) return 'NOSUBMIT'; b.click(); return 'SUBMITTED';})()"""
    return js(sub, target_id=tid)


def click(text_regex):
    """Click the first visible button/link whose text matches `text_regex` (case-insensitive),
    trying the question iframe first then the parent. Returns 'CLICKED:<text>' | 'NOTFOUND'.
    Use for Continue / Next Question / Finish / Take Assessment / Course Details."""
    code = r"""
    (() => {const rx=new RegExp(%s,'i');
      const b=[...document.querySelectorAll('button,a')].filter(e=>e.offsetParent)
        .find(e=>rx.test((e.innerText||'').replace(/\s+/g,' ').trim()));
      if(!b) return 'NOTFOUND'; b.click();
      return 'CLICKED:'+(b.innerText||'').replace(/\s+/g,' ').trim();})()""" % json.dumps(text_regex)
    tid = _ctx()
    if tid:
        r = js(code, target_id=tid)
        if r != "NOTFOUND":
            return r
    return js(code)


def revealed_correct():
    """After an Incorrect assessment submit, the correct option is shown with a colored
    border. Return its text (best-effort) or None. Screenshot is the reliable fallback."""
    code = r"""
    (() => {const ls=[...document.querySelectorAll('label.question_btn')];
      const hit=ls.find(l=>{const s=getComputedStyle(l);
        const w=parseFloat(s.borderTopWidth)||0;
        return w>=2 && !/rgba?\(0,\s*0,\s*0/.test(s.borderTopColor);});
      return hit?(hit.innerText||'').replace(/\s+/g,' ').trim():null;})()"""
    return js(code)


# ---------------------------------------------------------------- self-healing
INTERACTIVE = {"question", "assessment", "section_done", "result",
               "course_done", "retry_required", "disclaimer", "home"}


def preflight():
    """First-run dependency check. The ONLY hard dependency is the global `browser-harness`
    skill (already loaded if this code is running) — no superpowers/other skills needed.
    Lists anything missing so the user can install it. Returns {ok, missing}."""
    missing = []
    for fn in ("js", "iframe_target", "new_tab", "current_tab",
               "capture_screenshot", "ensure_real_tab", "wait_for_load"):
        if fn not in globals():
            missing.append("browser-harness helper '%s'" % fn)
    if not missing:
        print("preflight OK — browser-harness present; no other skills required.")
        return {"ok": True, "missing": []}
    print("MISSING DEPENDENCIES (install before running):")
    for m in missing:
        print("  -", m)
    print("Repair the global 'browser-harness' skill (~/Developer/browser-harness/SKILL.md).")
    return {"ok": False, "missing": missing}


def watch(timeout=540, gap=6):
    """Block while a video plays in REAL TIME, re-asserting play if it pauses, until an
    interactive state appears or `timeout` s elapse. NEVER seeks (seeking trips the
    'Please Retry Course' anti-skip guard). Returns the state dict. Keep timeout <= ~570 so
    it fits the harness 10-min Bash ceiling; if it returns mode 'video', the clip is longer
    than one window — just call watch() again."""
    end = time.time() + timeout
    _focus()
    while time.time() < end:
        if not logged_in():
            return {"mode": "login_wall"}
        st = state()
        m = st.get("mode")
        if m == "video":
            if not st.get("ended") and st.get("paused"):
                play_video()
            time.sleep(gap)
            continue
        if m in INTERACTIVE:
            return st
        time.sleep(gap)              # 'unknown' = mid-animation transition, keep waiting
    return state()


def step():
    """Perform ONE self-healing transition from the current state and return the new state.
    Handles every NON-answering screen (accept disclaimer, enter next section, click
    Continue/Next/Finish, pick the section-done button, recover the retry guard, play video).
    When mode is 'question'/'assessment' and still UNANSWERED (no feedback yet), it does
    nothing and returns as-is — the agent must read the text and call answer()."""
    st = state()
    m = st.get("mode")
    if m == "disclaimer":
        click(r"^accept$")
    elif m == "retry_required":
        click(r"course details")
    elif m == "section_done":
        for rx in (r"next section", r"take assessment", r"^continue", r"course details"):
            if str(click(rx)).startswith("CLICKED"):
                break
    elif m == "result":
        if st.get("passed"):
            click(r"^finish")
    elif m in ("question", "assessment"):
        if st.get("feedback"):                      # already answered -> advance
            for rx in (r"^continue", r"next question", r"^finish"):
                if str(click(rx)).startswith("CLICKED"):
                    break
        else:
            return st                               # needs an answer; hand back to agent
    elif m == "course":
        secs = sections()
        nxt = next((s for s in secs if not s["status"]), None) or (secs[0] if secs else None)
        if nxt:
            goto_url(nxt["href"])
    elif m == "video":
        play_video()
    time.sleep(1.5)
    return state()


def verify(expected_modes, tries=8, gap=1.5, recover=True):
    """Poll state() until mode is in expected_modes (a str or set/list). Returns the dict.
    On timeout raises RuntimeError after a screenshot, so the agent can eyeball + recover.
    This is the heartbeat of the self-healing loop: act -> verify -> branch."""
    want = {expected_modes} if isinstance(expected_modes, str) else set(expected_modes)
    last = None
    for _ in range(tries):
        if recover and not logged_in():
            raise RuntimeError("LOGIN_WALL: redirected to login — stop and ask the user to sign in.")
        if recover:
            try:
                ensure_real_tab()
            except Exception:
                pass
        last = state()
        if last.get("mode") in want:
            return last
        time.sleep(gap)
    capture_screenshot()
    raise RuntimeError("verify timeout: wanted %s, last=%s" % (sorted(want), json.dumps(last)[:300]))
