// Site Profile Extraction Script
// Runs inside page.evaluate() via Playwriter.
// Usage: const profile = await state.page.evaluate(<this-function>)

(function extractSiteProfile() {
  // --- Helpers ---

  function getSelector(el) {
    const candidates = [];

    // Rank 1: data-testid (most stable)
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-cy');
    if (testId) candidates.push({ type: 'data-testid', value: `[data-testid="${testId}"]`, score: 95 });

    // Rank 2: ID (stable if not auto-generated)
    const id = el.id;
    if (id && !/^\d|^[a-f0-9-]{20,}|^:r/i.test(id)) {
      candidates.push({ type: 'id', value: `#${CSS.escape(id)}`, score: 90 });
    }

    // Rank 3: ARIA role + name
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const ariaLabel = el.getAttribute('aria-label');
    const name = ariaLabel || el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 50);
    if (name) {
      candidates.push({
        type: 'role-name',
        value: `role=${mapRole(el)}[name="${name.replace(/"/g, '\\"')}"]`,
        score: 80
      });
    }

    // Rank 4: name attribute
    const nameAttr = el.getAttribute('name');
    if (nameAttr) {
      candidates.push({ type: 'name', value: `${el.tagName.toLowerCase()}[name="${nameAttr}"]`, score: 70 });
    }

    // Rank 5: type + placeholder combo for inputs
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const type = el.getAttribute('type') || 'text';
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) {
        candidates.push({ type: 'placeholder', value: `${el.tagName.toLowerCase()}[placeholder="${placeholder}"]`, score: 65 });
      }
    }

    // Rank 6: class-based (least stable)
    const classes = el.className;
    if (typeof classes === 'string' && classes.trim()) {
      const meaningful = classes.split(/\s+/).filter(c => !/^[a-z]{1,2}-|^css-|^_|^\d/.test(c)).slice(0, 2);
      if (meaningful.length) {
        candidates.push({ type: 'class', value: '.' + meaningful.join('.'), score: 40 });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return {
      best: candidates[0]?.value || el.tagName.toLowerCase(),
      candidates: candidates.slice(0, 3)
    };
  }

  function mapRole(el) {
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type');
    const role = el.getAttribute('role');
    if (role) return role;
    if (tag === 'button' || (tag === 'input' && type === 'submit')) return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'img') return 'img';
    return tag;
  }

  function getVisibleText(el) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 77) + '...' : text;
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getContext(el) {
    const ctx = {};
    // Nearest landmark
    const landmark = el.closest('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], main, nav, header, footer, aside, form, section, article');
    if (landmark) {
      ctx.landmark = landmark.getAttribute('role') || landmark.tagName.toLowerCase();
      const landmarkLabel = landmark.getAttribute('aria-label');
      if (landmarkLabel) ctx.landmarkLabel = landmarkLabel;
    }
    // Nearest form
    const form = el.closest('form');
    if (form) {
      ctx.form = form.getAttribute('name') || form.getAttribute('id') || form.getAttribute('aria-label') || 'unnamed-form';
    }
    // Nearest heading
    const section = el.closest('section, article, div[role="region"], fieldset');
    if (section) {
      const heading = section.querySelector('h1, h2, h3, h4, h5, h6, legend');
      if (heading) ctx.nearestHeading = getVisibleText(heading);
    }
    return ctx;
  }

  // --- Extraction ---

  const profile = {
    interactive: { buttons: [], links: [], inputs: [], selects: [], checkboxes: [], radios: [], forms: [] },
    landmarks: {},
    headings: [],
    images: []
  };

  // Buttons
  document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]').forEach(el => {
    if (!isVisible(el)) return;
    const sel = getSelector(el);
    profile.interactive.buttons.push({
      text: getVisibleText(el) || el.getAttribute('aria-label') || el.getAttribute('value') || '',
      selector: sel.best,
      candidates: sel.candidates,
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      context: getContext(el)
    });
  });

  // Links
  document.querySelectorAll('a[href]:not([role="button"])').forEach(el => {
    if (!isVisible(el)) return;
    const sel = getSelector(el);
    profile.interactive.links.push({
      text: getVisibleText(el) || el.getAttribute('aria-label') || '',
      selector: sel.best,
      candidates: sel.candidates,
      href: el.getAttribute('href'),
      context: getContext(el)
    });
  });

  // Text inputs
  document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea').forEach(el => {
    if (!isVisible(el)) return;
    const sel = getSelector(el);
    const label = el.getAttribute('aria-label')
      || el.getAttribute('placeholder')
      || document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
      || '';
    profile.interactive.inputs.push({
      label: label,
      type: el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
      selector: sel.best,
      candidates: sel.candidates,
      required: el.required || el.getAttribute('aria-required') === 'true',
      context: getContext(el)
    });
  });

  // Selects
  document.querySelectorAll('select').forEach(el => {
    if (!isVisible(el)) return;
    const sel = getSelector(el);
    const options = Array.from(el.options).map(o => ({ value: o.value, text: o.textContent?.trim() }));
    profile.interactive.selects.push({
      label: el.getAttribute('aria-label') || document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || '',
      selector: sel.best,
      candidates: sel.candidates,
      options: options.slice(0, 20),
      context: getContext(el)
    });
  });

  // Checkboxes
  document.querySelectorAll('input[type="checkbox"], [role="checkbox"]').forEach(el => {
    if (!isVisible(el)) return;
    const sel = getSelector(el);
    profile.interactive.checkboxes.push({
      label: el.getAttribute('aria-label') || document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || '',
      selector: sel.best,
      candidates: sel.candidates,
      checked: el.checked,
      context: getContext(el)
    });
  });

  // Radios
  document.querySelectorAll('input[type="radio"], [role="radio"]').forEach(el => {
    if (!isVisible(el)) return;
    const sel = getSelector(el);
    profile.interactive.radios.push({
      label: el.getAttribute('aria-label') || document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || '',
      name: el.getAttribute('name'),
      value: el.value,
      selector: sel.best,
      candidates: sel.candidates,
      context: getContext(el)
    });
  });

  // Forms
  document.querySelectorAll('form').forEach(el => {
    if (!isVisible(el)) return;
    const sel = getSelector(el);
    const fields = Array.from(el.querySelectorAll('input:not([type="hidden"]), textarea, select')).filter(isVisible);
    profile.interactive.forms.push({
      name: el.getAttribute('name') || el.getAttribute('id') || el.getAttribute('aria-label') || '',
      selector: sel.best,
      action: el.getAttribute('action') || '',
      method: (el.getAttribute('method') || 'GET').toUpperCase(),
      fieldCount: fields.length
    });
  });

  // Landmarks
  const landmarkSelectors = {
    banner: 'header, [role="banner"]',
    navigation: 'nav, [role="navigation"]',
    main: 'main, [role="main"]',
    complementary: 'aside, [role="complementary"]',
    contentinfo: 'footer, [role="contentinfo"]',
    search: '[role="search"]',
    form: '[role="form"]'
  };
  Object.entries(landmarkSelectors).forEach(([name, sel]) => {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      profile.landmarks[name] = Array.from(els).map(el => {
        const s = getSelector(el);
        return {
          selector: s.best,
          label: el.getAttribute('aria-label') || ''
        };
      });
    }
  });

  // Headings (for page structure context)
  document.querySelectorAll('h1, h2, h3').forEach(el => {
    if (!isVisible(el)) return;
    profile.headings.push({
      level: parseInt(el.tagName[1]),
      text: getVisibleText(el)
    });
  });

  // Summary
  profile.summary = {
    buttons: profile.interactive.buttons.length,
    links: profile.interactive.links.length,
    inputs: profile.interactive.inputs.length,
    selects: profile.interactive.selects.length,
    checkboxes: profile.interactive.checkboxes.length,
    radios: profile.interactive.radios.length,
    forms: profile.interactive.forms.length,
    landmarks: Object.keys(profile.landmarks).length,
    headings: profile.headings.length
  };

  return profile;
})();
