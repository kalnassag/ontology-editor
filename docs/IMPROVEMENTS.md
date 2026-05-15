# Ontorite — Improvement Specs

Technical requirements for all issues identified in the May 2026 audit.
Ordered within each section by implementation priority.

---

## Table of Contents

**Engineering**
1. [E1 — Memoize `getPropertiesByDomain`](#e1--memoize-getpropertiesbydomain)
2. [E2 — Fix `getActiveOntology` selector](#e2--fix-getactiveontology-selector)
3. [E3 — Cap undo history stack](#e3--cap-undo-history-stack)
4. [E4 — Replace `alert()` with inline error](#e4--replace-alert-with-inline-error)
5. [E5 — Remove production `console.log` calls](#e5--remove-production-consolelog-calls)
6. [E6 — Wire `Ctrl+S` to save/export](#e6--wire-ctrls-to-saveexport)
7. [E7 — Add React error boundary](#e7--add-react-error-boundary)
8. [E8 — Split `PropertyForm` into sub-components](#e8--split-propertyform-into-sub-components)
9. [E9 — Warn before deleting a class with properties](#e9--warn-before-deleting-a-class-with-properties)

**UX**
10. [U1 — Confirm before deleting an ontology](#u1--confirm-before-deleting-an-ontology)
11. [U2 — Undo toast after destructive actions](#u2--undo-toast-after-destructive-actions)
12. [U3 — Undo/redo buttons in the toolbar](#u3--undoredo-buttons-in-the-toolbar)
13. [U4 — Auto-running validation with toolbar badge](#u4--auto-running-validation-with-toolbar-badge)
14. [U5 — Fix pills picker at scale](#u5--fix-pills-picker-at-scale)
15. [U6 — Clarify class browser vs. main panel purpose](#u6--clarify-class-browser-vs-main-panel-purpose)
16. [U7 — Move import warnings to main panel](#u7--move-import-warnings-to-main-panel)
17. [U8 — Unassigned properties count badge in toolbar](#u8--unassigned-properties-count-badge-in-toolbar)
18. [U9 — Keyboard shortcut help overlay](#u9--keyboard-shortcut-help-overlay)
19. [U10 — Scroll property form into view on open](#u10--scroll-property-form-into-view-on-open)

---

## E1 — Memoize `getPropertiesByDomain`

### Problem
`getPropertiesByDomain()` is defined in the Zustand store as a plain function getter.
Every `ClassCard` calls `useStore((s) => s.getPropertiesByDomain())` independently.
Because the selector returns a new `Map` on every invocation, Zustand cannot detect
referential equality — all ClassCards rerender on any store change, and each one
rebuilds the full Map. With 80 classes, that is 80 full Map builds per render cycle.

### Requirements
- Move the `getPropertiesByDomain` computation out of the store getter and into a
  `useMemo` hook at the `App` level, computed once per active ontology change.
- The memoized value should depend only on `activeOntology.properties` and
  `activeOntology.classes`. Use a stable identity check (e.g. compare
  `activeOntology?.updatedAt` or use a shallow-equal selector).
- Pass the resulting `Map<string, OntologyProperty[]>` down to each `ClassCard` as
  a prop, or expose it via a dedicated context so ClassCards don't subscribe to the
  full store.
- Remove `getPropertiesByDomain` from the `EditorState` interface and store
  definition in `src/lib/store.ts` once nothing references it there.
- `getUnassignedProperties` has the same issue — apply the same fix.

### Files affected
- `src/lib/store.ts` — remove `getPropertiesByDomain`, `getUnassignedProperties`
- `src/components/layout/App.tsx` — add `useMemo` for the domain map and
  unassigned list; pass as props or context
- `src/components/core/ClassCard.tsx` — accept `properties` as a prop instead of
  calling the store getter
- `src/components/core/UnassignedProperties.tsx` — accept `properties` as a prop

### Acceptance criteria
- Profiling (React DevTools) shows ClassCard renders triggered only when the active
  ontology changes, not on unrelated store mutations (e.g. theme toggle).
- No functional regression in property display.

---

## E2 — Fix `getActiveOntology` selector

### Problem
Multiple components use `useStore((s) => s.getActiveOntology())`. The selector
returns the result of a function call — Zustand uses `Object.is` to compare
previous and next selector results, so the returned ontology object reference is
always "new" unless Zustand happens to return the same object from `find()`.
In practice this causes unnecessary rerenders on every store change, even unrelated ones.

### Requirements
- Replace every usage of `useStore((s) => s.getActiveOntology())` with the inline
  selector: `useStore((s) => s.ontologies.find(o => o.id === s.activeOntologyId))`.
  This is a stable selection because Zustand will compare the returned reference
  (the ontology object) and skip rerenders when it hasn't changed.
- Remove the `getActiveOntology` method from `EditorState` and the store
  implementation. Its only benefit was ergonomics; the direct selector is equally
  readable.
- Components that only need a slice of the active ontology (e.g. only `classes`,
  only `metadata`) should select that slice directly rather than the full ontology
  object, to further narrow rerender scope.

### Files affected
- `src/lib/store.ts` — remove `getActiveOntology` from interface and implementation
- All components currently calling `getActiveOntology()` — grep for the string to
  find them all: `App.tsx`, `ClassCard.tsx`, `PropertyRow.tsx`, `PropertyForm.tsx`,
  `ClassForm.tsx`, `OntologyDiff.tsx`

### Acceptance criteria
- No component subscribing only to `activeOntology.metadata` rerenders when a
  property is added to that ontology.

---

## E3 — Cap undo history stack

### Problem
`_history: Ontology[][]` in the store stores complete deep copies of the entire
`ontologies` array for every tracked mutation. There is no upper bound. A user
making 200 small edits to a large ontology accumulates 200 full copies in memory.

### Requirements
- Introduce a constant `MAX_HISTORY_DEPTH = 50` in `store.ts`.
- When pushing a new snapshot onto `_history`, slice the array if it exceeds the
  cap: `_history: [...s._history, s.ontologies].slice(-MAX_HISTORY_DEPTH)`.
- Apply the same cap symmetrically when pushing to `_future` during undo.
- No UI change required — this is a pure store-level guard.

### Files affected
- `src/lib/store.ts` — three locations: `undo()`, `redo()`, and every place that
  pushes to `_history` (search for `[...s._history`).

### Acceptance criteria
- `_history.length` never exceeds 50 in any test scenario.
- Undo/redo still works correctly for the 50 most recent operations.

---

## E4 — Replace `alert()` with inline error

### Problem
`OntologyList.tsx:101` calls `alert()` when the `FileReader` fallback import fails.
This breaks UX consistency (native browser dialog vs. the app's own UI), is
non-dismissable without clicking, and is untestable.

### Requirements
- Add an `importError` local state string to `OntologyList` (analogous to
  the existing `urlError` state used for URL import failures).
- On `reader.onerror` and on the catch in `reader.onload`, set `importError` to
  a user-readable message instead of calling `alert()`.
- Render `importError` as a styled inline error element directly below the action
  bar, using the same visual treatment as `urlError` (red text, `text-2xs`).
- Auto-clear `importError` when the user clicks Import again.
- Remove the `alert()` call entirely.

### Files affected
- `src/components/layout/OntologyList.tsx`

### Acceptance criteria
- Simulating a failed import (e.g. passing malformed data) shows an inline error
  message with no browser alert dialog.

---

## E5 — Remove production `console.log` calls

### Problem
The following `console.log` calls will appear in end-users' browser consoles:
- `store.ts` — `[file-save] auto-saved to` on every auto-save
- `OntologyList.tsx` — `[import] success with file handle` and
  `[import] success (no file handle)` on every import
- `OntologyList.tsx` — `[import] error during import` (this one should stay as
  `console.error` for debugging, but remove the `console.log` variant)

### Requirements
- Wrap all `console.log` calls that exist purely for developer tracing behind an
  environment guard: `if (import.meta.env.DEV) console.log(...)`.
- `console.error` calls are acceptable in production for genuine error paths
  (e.g. `reader.onerror`).
- Do not remove the auto-save indicator entirely — the `lastFileSaveTime` state
  already powers a UI indicator; the console log is redundant.

### Files affected
- `src/lib/store.ts`
- `src/components/layout/OntologyList.tsx`

### Acceptance criteria
- Running `npm run build && npm run preview` and performing an import + edit cycle
  produces no `console.log` output in the browser console.

---

## E6 — Wire `Ctrl+S` to save/export

### Problem
CLAUDE.md specifies `Ctrl+S` as a keyboard shortcut for export. The `saveToFile()`
action exists on the store and is already used by the manual "Save" button in the
toolbar. The keyboard shortcut is not wired up.

### Requirements
- In the global keyboard handler in `App.tsx` (the `useEffect` that handles
  `Ctrl+Z`, `Ctrl+Y`, `Ctrl+N`), add a branch for `e.key === "s"`:
  ```
  } else if (e.key === "s") {
    e.preventDefault();
    saveToFile();
  }
  ```
- `saveToFile()` already handles both the "overwrite original file" path (when a
  file handle exists) and the "Save As" picker path (when no handle exists), so no
  additional logic is needed.
- Add `Ctrl+S` to the keyboard shortcut help overlay (see U9).

### Files affected
- `src/components/layout/App.tsx` — keyboard handler `useEffect`

### Acceptance criteria
- Pressing `Ctrl+S` on an ontology with a file handle overwrites the file silently.
- Pressing `Ctrl+S` on an ontology without a file handle opens the Save As picker.
- Pressing `Ctrl+S` when no ontology is active does nothing.

---

## E7 — Add React error boundary

### Problem
An unhandled error in any component causes the entire app to render a blank white
screen. Users lose context and have no path to recovery.

### Requirements
- Create `src/components/layout/ErrorBoundary.tsx` as a React class component
  implementing `componentDidCatch` and `getDerivedStateFromError`.
- The fallback UI should show:
  - A brief message: "Something went wrong."
  - The error message (from `error.message`) in a monospace block for debugging.
  - A "Reload" button that calls `window.location.reload()`.
  - A note: "Your ontologies are saved in IndexedDB and will be restored on reload."
- Wrap the entire `<App />` in `main.tsx` with `<ErrorBoundary>`.
- Do not wrap individual cards or rows — one top-level boundary is sufficient.

### Files affected
- `src/components/layout/ErrorBoundary.tsx` — new file
- `src/main.tsx` — wrap `<App />` with `<ErrorBoundary>`

### Acceptance criteria
- Throwing an error from any component renders the fallback UI, not a blank screen.
- Clicking "Reload" returns to the normal app with existing ontologies intact.

---

## E8 — Split `PropertyForm` into sub-components

### Problem
`src/components/forms/PropertyForm.tsx` is 549 lines, nearly double the 300-line
limit in CLAUDE.md. It is difficult to navigate and test in isolation.

### Requirements
Extract the following self-contained sections into their own components,
each accepting props from `PropertyForm` and calling back with state changes:

| New component | Extracted section | Approx. lines |
|---|---|---|
| `RangeEditor.tsx` | Object/Datatype/Annotation range sub-UI | ~130 lines |
| `CardinalityEditor.tsx` | Exact/Min/Max cardinality inputs | ~45 lines |
| `SubPropertyPicker.tsx` | Pills/Dropdown subPropertyOf selector | ~80 lines |

- Each extracted component lives in `src/components/forms/`.
- `PropertyForm.tsx` imports them and passes the relevant state slice + setter.
- The extraction must be a pure refactor — no behaviour change, no new props on
  `PropertyForm` itself, no visible UI change.
- After extraction, `PropertyForm.tsx` should be under 250 lines.

### Files affected
- `src/components/forms/PropertyForm.tsx` — reduced
- `src/components/forms/RangeEditor.tsx` — new
- `src/components/forms/CardinalityEditor.tsx` — new
- `src/components/forms/SubPropertyPicker.tsx` — new

### Acceptance criteria
- All extracted components render identically to the current behaviour for all
  three property types.
- `PropertyForm.tsx` is under 250 lines.

---

## E9 — Warn before deleting a class with properties

### Problem
`deleteClass(id)` in `ClassCard.tsx` fires on a single click with no warning.
If the class has domain properties, they are silently moved to Unassigned — this
is surprising and can feel like data loss.

### Requirements
- In `ClassCard`, before calling `deleteClass`, check how many properties are
  assigned to this class (available from the same `properties` array already in scope).
- If `properties.length > 0`, show an inline confirmation prompt inside the card:
  ```
  Delete "ClassName"? Its 4 properties will become unassigned.  [Delete]  [Cancel]
  ```
- Use local component state (`pendingDelete: boolean`) to control this. No modal.
- If `properties.length === 0`, delete immediately (no friction for empty classes).
- The [Delete] button in the prompt calls `deleteClass(cls.id)` and closes the prompt.
- The [Cancel] button resets `pendingDelete` to false.

### Files affected
- `src/components/core/ClassCard.tsx`

### Acceptance criteria
- Clicking delete on a class with 0 properties deletes immediately.
- Clicking delete on a class with 1+ properties shows the inline prompt.
- Confirming in the prompt deletes the class and moves its properties to Unassigned.
- Cancelling leaves the class unchanged.

---

## U1 — Confirm before deleting an ontology

### Problem
The trash icon in `OntologyList.tsx` calls `deleteOntology(onto.id)` immediately
on click via `e.stopPropagation(); deleteOntology(onto.id)`. There is no undo for
this action. Losing an entire ontology with no confirmation is the highest-severity
UX failure in the app.

### Requirements
- Add `pendingDeleteId: string | null` local state to `OntologyList`.
- When the trash icon is clicked, set `pendingDeleteId = onto.id` instead of
  calling `deleteOntology` immediately.
- Render a small confirmation UI inline within the ontology list item when
  `pendingDeleteId === onto.id`:
  ```
  Delete "[label]"?  [Yes, delete]  [Cancel]
  ```
- `[Yes, delete]` calls `deleteOntology(onto.id)` and resets `pendingDeleteId`.
- `[Cancel]` resets `pendingDeleteId` to null.
- Clicking anywhere else in the list (switching active ontology) also resets
  `pendingDeleteId`.
- Only one confirmation can be pending at a time — clicking delete on another
  ontology moves `pendingDeleteId` to the new one.

### Files affected
- `src/components/layout/OntologyList.tsx`

### Acceptance criteria
- Clicking the trash icon does not immediately delete the ontology.
- The confirmation UI appears inline in the list item.
- Confirming deletes; cancelling does not.
- Switching to another ontology while a confirmation is showing cancels the pending
  delete.

---

## U2 — Undo toast after destructive actions

### Problem
`deleteClass` and `deleteProperty` take effect immediately with no feedback.
Users unaware of `Ctrl+Z` feel they have lost data. A brief "undo" affordance
surfaces the recovery path without adding a confirmation dialog to every delete.

### Requirements
- Create a lightweight `Toast` component in `src/components/layout/Toast.tsx`
  (or reuse one if it already exists) that renders a fixed overlay pill at the
  bottom-center of the screen.
- Add a `toast: { message: string; actionLabel: string; onAction: () => void } | null`
  field to App-level state (not the store — this is purely UI state).
- After `deleteClass` or `deleteProperty` succeeds, set the toast to:
  `{ message: '"ClassName" deleted', actionLabel: 'Undo', onAction: undo }`
- Auto-dismiss the toast after 4 seconds. If the user clicks Undo, dismiss
  immediately and call `undo()`.
- A new destructive action while a toast is showing replaces the old toast.
- Do not show this toast in response to undo/redo itself.

### Files affected
- `src/components/layout/Toast.tsx` — new or extend existing
- `src/components/layout/App.tsx` — toast state + trigger after delete actions
- `src/components/core/ClassCard.tsx` — call a passed-down `onDelete` callback
  instead of calling `deleteClass` directly (so App can intercept)
- `src/components/core/PropertyRow.tsx` — same pattern

### Acceptance criteria
- Deleting a class or property shows the toast for 4 seconds.
- Clicking Undo in the toast reverses the deletion.
- After 4 seconds, the toast disappears and undo via toast is no longer possible
  (Ctrl+Z still works).

---

## U3 — Undo/redo buttons in the toolbar

### Problem
There is no visible affordance for undo/redo. Users who don't know `Ctrl+Z` works
have no way to discover it, and users who do know it would benefit from greyed-out
buttons as visual confirmation of the stack state.

### Requirements
- Add two icon buttons to the top bar in `App.tsx`, between the ontology title
  and the search input:
  - Undo: `Undo2` icon from Lucide (or `RotateCcw`), disabled when `!canUndo()`
  - Redo: `Redo2` icon from Lucide (or `RotateCw`), disabled when `!canRedo()`
- Disabled state: `opacity-40 cursor-not-allowed`, no hover effect.
- Active state: same hover style as other toolbar icon buttons.
- Tooltips: "Undo (Ctrl+Z)" and "Redo (Ctrl+Y)".
- These buttons should only appear when an ontology is active (same condition as
  the rest of the toolbar).

### Files affected
- `src/components/layout/App.tsx`

### Acceptance criteria
- Buttons are greyed out with the correct cursor on empty stack.
- Clicking Undo/Redo has the same effect as the keyboard shortcut.
- Tooltip text includes the keyboard shortcut.

---

## U4 — Auto-running validation with toolbar badge

### Problem
The Validate button in the toolbar must be clicked manually to see issues.
Users making edits won't notice accumulating validation errors unless they
actively invoke the panel.

### Requirements
- Move the `validate(activeOntology)` call from the manual button handler into a
  `useMemo` hook in `App.tsx` that recomputes whenever `activeOntology` changes.
  The validation function is pure and fast (O(n) on classes + properties), so
  running it on every ontology change is acceptable.
- Replace the current "Validate" button with a badge button:
  - When `issues.length === 0`: show the ShieldCheck icon, no badge.
  - When errors exist: show the AlertCircle icon + a red dot with the error count.
  - When only warnings: show the AlertTriangle icon + an amber dot with the count.
- Clicking the button still toggles the `showValidation` panel.
- Remove the `validate()` call from the manual click handler since validation is
  now always current.

### Files affected
- `src/components/layout/App.tsx`

### Acceptance criteria
- Adding a class with no label immediately causes the warning badge to appear in
  the toolbar without clicking Validate.
- Fixing the issue makes the badge disappear.
- The validation panel still opens/closes on click.

---

## U5 — Fix pills picker at scale

### Problem
The subClassOf / disjointWith / subPropertyOf pills picker renders one button per
class/property in the ontology. At 60+ entities, the form becomes unwieldy. The
mode toggle labels ("Pills"/"Dropdown") are implementation terminology.

### Requirements
- Rename the toggle options from "Pills"/"Dropdown" to "Compact"/"List" throughout
  `ClassForm.tsx` and `PropertyForm.tsx`. The underlying state variable name can
  stay the same.
- Add an auto-switch threshold: if the options array has more than 20 items, default
  `classPickerMode` / `propPickerMode` to `"dropdown"` instead of `"pills"`. Apply
  this as the initial state value, not as a forced override.
- Persist the user's last chosen picker mode to `localStorage` under the key
  `ontoritePickerMode` so the preference is remembered across form opens.
- When in pills mode with more than 20 options, show a note below the pills:
  `"Switch to List mode for easier navigation"` with a button that switches to
  dropdown mode.

### Files affected
- `src/components/forms/ClassForm.tsx`
- `src/components/forms/PropertyForm.tsx`

### Acceptance criteria
- Ontologies with <20 classes default to Compact mode.
- Ontologies with 20+ classes default to List mode.
- The user's mode preference persists across page reloads.
- Labels read "Compact" and "List" everywhere, not "Pills" and "Dropdown".

---

## U6 — Clarify class browser vs. main panel purpose

### Problem
The class browser sidebar and the main classes panel both display classes. Users
do not understand the distinction — the browser is for navigation; the main panel
is for editing.

### Requirements
- Change the class browser panel header from whatever it currently shows to
  "Jump to class" (rendered in the same `text-2xs font-semibold uppercase
  tracking-wide text-th-fg-3` style used elsewhere).
- Add a one-line subtitle beneath the header in the class browser:
  `"Double-click to navigate"` in `text-2xs text-th-fg-4`.
- These two changes alone disambiguate the panels without restructuring them.

### Files affected
- `src/components/layout/ClassBrowserPanel.tsx`

### Acceptance criteria
- The class browser panel header reads "Jump to class" with the subtitle visible.
- No other layout or behaviour changes.

---

## U7 — Move import warnings to main panel

### Problem
Import warnings (parse errors, blank node counts) are displayed inside the
`OntologyList` sidebar component, which is 192px wide. The messages contain
line numbers and technical detail that are unreadable at that width.

### Requirements
- Remove the `importWarnings` display section from `OntologyList.tsx` entirely.
- In `App.tsx`, subscribe to `importWarnings` from the store and render a
  dismissible warning banner in the main panel area when there are warnings.
- The banner should:
  - Appear at the top of the main panel (above the class list), not in the sidebar.
  - Use the same amber-toned style currently used in `OntologyList` but at full
    main-panel width.
  - List each warning as a `<li>` with `text-xs` (one step up from the current
    `text-2xs`).
  - Have an `×` dismiss button that calls `clearImportWarnings()`.
  - Auto-dismiss after 30 seconds so it doesn't permanently occupy space.
- `clearImportWarnings` is already on the store — no store changes needed.

### Files affected
- `src/components/layout/OntologyList.tsx` — remove warnings display
- `src/components/layout/App.tsx` — add warnings banner

### Acceptance criteria
- Importing a file with parse errors shows the warning banner in the main panel
  at full width.
- The banner is dismissed by the × button or automatically after 30 seconds.
- The sidebar no longer shows import warnings.

---

## U8 — Unassigned properties count badge in toolbar

### Problem
The "Unassigned properties" section is at the bottom of the class list. Users
with long ontologies don't scroll down to notice it. Properties silently living
in an unassigned state is the core failure mode this tool is designed to prevent.

### Requirements
- In `App.tsx`, compute the unassigned property count (already derivable from
  the same data used for `UnassignedProperties.tsx`).
- Add a badge to the top bar (visible only when count > 0):
  ```
  ⚠ 3 unassigned
  ```
  Styled as amber text, `text-2xs`, next to the other toolbar controls.
- Clicking the badge should scroll the `UnassignedProperties` section into view.
  Use a `ref` on the `UnassignedProperties` component and call
  `ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })`.
- The badge disappears when the count reaches 0.

### Files affected
- `src/components/layout/App.tsx`
- `src/components/core/UnassignedProperties.tsx` — accept a `ref` via
  `forwardRef`

### Acceptance criteria
- Importing an ontology with unassigned properties immediately shows the badge.
- Clicking the badge scrolls to the Unassigned section.
- Assigning the last unassigned property makes the badge disappear.

---

## U9 — Keyboard shortcut help overlay

### Problem
All keyboard shortcuts (`Ctrl+N`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+V`, `Ctrl+S`) are
invisible to users. Discoverability is zero without reading documentation.

### Requirements
- Add a `?` icon button to the top-right corner of the App header
  (Lucide `HelpCircle`, same size and style as the theme toggle).
- Clicking it opens a small overlay panel (not a modal blocking the whole UI —
  position it as a floating card anchored to the button, dismissible by clicking
  outside or pressing Escape).
- The overlay lists all active keyboard shortcuts in a two-column table:

  | Shortcut | Action |
  |---|---|
  | Ctrl+N | New class |
  | Ctrl+Z | Undo |
  | Ctrl+Y | Redo |
  | Ctrl+V | Paste |
  | Ctrl+S | Save to file |
  | Escape | Cancel / close form |

- On Mac, display `⌘` instead of `Ctrl`. Detect via
  `navigator.platform.includes("Mac")` or `navigator.userAgent`.
- The overlay is purely local UI state — no store involvement.

### Files affected
- `src/components/layout/App.tsx` — or extract to
  `src/components/layout/KeyboardHelp.tsx`

### Acceptance criteria
- Clicking `?` opens the overlay.
- Clicking outside or pressing Escape closes it.
- Mac users see `⌘`, Windows/Linux users see `Ctrl`.

---

## U10 — Scroll property form into view on open

### Problem
When a `ClassCard` has many properties and the user clicks "Add property", the
form renders at the bottom of the card and may appear off-screen. The user has to
manually scroll down to reach it.

### Requirements
- In `ClassCard.tsx`, add a `useRef<HTMLDivElement>(null)` on the wrapper div that
  wraps the `<PropertyForm>` when `addingProperty` is true.
- In a `useEffect` that fires when `addingProperty` transitions to `true`, call:
  ```
  formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  ```
- Use `block: "nearest"` (not `"center"`) so that cards near the top of the list
  are not scrolled down unnecessarily.
- The same pattern already works for the class highlight in `App.tsx` — follow
  the same approach.

### Files affected
- `src/components/core/ClassCard.tsx`

### Acceptance criteria
- Opening "Add property" on a card that is partially below the viewport scrolls
  the form into view.
- Opening "Add property" on a card that is fully visible does not scroll.

---

*Document created 2026-05-15. Revisit after any significant refactor that touches the store or component structure.*
