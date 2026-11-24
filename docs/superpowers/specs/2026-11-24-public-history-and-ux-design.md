# Public history and prediction UX design

## Goal

Open historical election data to every visitor, make the dense prediction workflow easier and more accessible, improve nationwide council-map readability, and reduce the initial JavaScript/CSS payload without changing the current data-trust explanation.

## Design

- Historical data is a normal public workspace. Its code, historical logo archive, and dedicated stylesheet load only when the visitor first opens the history tab. A visible loading state prevents double activation and reports load failures.
- The candidate-directory summary keeps coverage counts but omits the stale verification date. The source and trust explanation remains unchanged.
- Small helper text uses a darker green with at least WCAG AA contrast and a 12 px minimum where the current text is smaller.
- Floating dialogs use a non-interactive drag container, a separate keyboard move button, semantic resize buttons, `aria-labelledby`, and initial focus on the dialog title.
- Nationwide council prediction uses a two-level county/district selector so the district control never contains all 221 options at once. The nationwide map gets more usable display height.
- Multi-seat prediction adds candidate search, party and status filters, selected-first ordering, and a live selected/visible count. The tools do not automatically recommend or select candidates.

## Compatibility and failure behavior

- Existing map, prediction, export, and historical APIs remain unchanged.
- History assets load in their existing dependency order and only once.
- If lazy loading fails, the tab remains usable for retry and exposes a concise error message.
- Existing predictions and selected district remain intact when filters or county grouping change.
