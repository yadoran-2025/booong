# New Lessons View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an all-subjects new-lessons view reachable from the dashboard hero, update hero copy, and present makers as uppercase blocks labeled `MADE BY`.

**Architecture:** Keep `index.html` as the only entry point. Read `view=new` from the URL, render a lightweight all-subjects resource view from the existing catalog, and reuse `renderResourceCard`, filtering, and tracking behavior. The home hero's right-hand slip becomes a regular link to that view.

**Tech Stack:** Existing vanilla ES modules, template-string rendering, BOOONG CSS tokens, existing dashboard test/check/smoke scripts, in-app browser verification.

## Global Constraints

- Show all resources whose normalized `isNew` flag is true, regardless of school or subject.
- Reuse the existing dashboard data loader and resource card/preview markup.
- Do not add a new HTML entry point, data schema, dependency, or design-system source file.
- Use the exact copy `오늘 수업, 이런 건 어떠세요?` and `MADE BY`.
- Preserve keyboard focus visibility, external-link behavior, tracking attributes, and responsive layout.

---

### Task 1: Add the all-subjects new-lessons route

**Files:**
- Modify: `js/ui/dashboard.js:18-140,160-240,270-290`
- Test: existing `scripts/test-dashboard-data.mjs`, browser route verification

**Interfaces:**
- Consumes: `config.catalog.resources`, existing `renderResourceCard`, `renderTopbar`, `renderFooter`.
- Produces: `renderNewLessonsView(root, config)` and a home hero link targeting `index.html?view=new`.

- [ ] **Step 1: Read the route flag without changing the existing profile flow**

Use `new URLSearchParams(window.location.search).get("view") === "new"` after the catalog loads. Keep teacher onboarding for the normal home route; the new view does not need a profile because it spans every subject.

- [ ] **Step 2: Render the new view from existing catalog resources**

Filter with `resource.isNew`, preserve catalog order, and render the existing resource cards. Include a page heading, a `index.html` home link, the existing topbar/footer, and a clear empty state when the filtered list is empty.

- [ ] **Step 3: Update the home hero copy and route card**

Change the emphasized hero line to `이런 건 어떠세요?`. Replace the subject slip with an accessible anchor that says `새로 들어온 수업`, points to `index.html?view=new`, and keeps the existing visual slip treatment.

### Task 2: Restyle maker metadata and the new view composition

**Files:**
- Modify: `js/ui/dashboard.js:270-290`
- Modify: `css/dashboard.css:129-320,840-860`
- Test: browser visual and keyboard-focus verification

**Interfaces:**
- Consumes: normalized `item.makers` array.
- Produces: `.bundle-card__makers` with `MADE BY` and one `.bundle-card__maker` block per maker; new-view layout classes.

- [ ] **Step 1: Render maker chips with explicit accessible text**

Render `MADE BY` followed by each maker in its own span. Apply uppercase in CSS so stored names remain unchanged for search and analytics.

```html
<div class="bundle-card__makers" aria-label="제작자">
  <span class="bundle-card__makers-label">MADE BY</span>
  <span class="bundle-card__maker">CHOI</span>
</div>
```

- [ ] **Step 2: Add the new-view layout using existing tokens**

Use the existing page shell, a compact intro header, a responsive `.bundle-list`, and the existing `.curation-library__empty` pattern. Keep the hero slip as a focusable link on the home route and add a visible `홈으로` link on the new route.

- [ ] **Step 3: Preserve responsive and reduced-motion behavior**

Keep the existing mobile one-column card rule. Ensure maker chips wrap and the route card remains a usable touch target at the mobile breakpoint. Do not add raw brand colors or new dependencies.

### Task 3: Verify behavior and hand off

**Files:**
- Modify: none unless verification exposes a defect
- Test: `npm test`, `npm run check`, `npm run smoke`, in-app browser

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: verified home route, new route, empty state, maker chips, and unchanged existing unit navigation.

- [ ] **Step 1: Run repository checks**

```bash
git diff --check
npm test
npm run check
npm run smoke
```

- [ ] **Step 2: Verify the home link and new route in the browser**

Confirm the hero reads `오늘 수업, 이런 건 어떠세요?`, the slip links to `index.html?view=new`, and the new route shows only `NEW` resources from multiple subjects.

- [ ] **Step 3: Verify maker blocks and empty state**

Confirm each maker is uppercase inside an individual block preceded by `MADE BY`. Confirm the no-new-resources state includes a home link. Check desktop, mobile-width layout, and keyboard focus.
