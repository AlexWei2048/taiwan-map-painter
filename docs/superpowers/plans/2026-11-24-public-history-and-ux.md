# Public history and prediction UX implementation plan

> Execute with strict red-green-refactor cycles and run the full Node test suite before deployment.

## Task 1: Public, lazy-loaded historical data

- Add behavior tests for public activation, one-time ordered asset loading, retryable failure, and absence of history-only assets from the initial document.
- Implement a small history loader and route the history tab through it.
- Remove the access gate from the initial page and lazy-load the historical logo archive and history stylesheet/scripts.

## Task 2: Candidate summary and readable helper text

- Add regression checks for a date-free candidate summary and readable small-text tokens.
- Remove only the verification-date phrase.
- Add focused contrast and minimum-size overrides without changing the trust/source copy.

## Task 3: Accessible floating dialogs

- Add DOM behavior tests for a non-interactive drag bar, separate move button, semantic resize controls, labelled dialogs, and title focus.
- Refactor dialog enhancement code while retaining pointer drag, keyboard move/resize, close, and reset behavior.

## Task 4: Council navigation and map size

- Add behavior tests for a two-level nationwide council selector and a larger nationwide council canvas.
- Add a county picker that filters the existing district picker without changing the map's nationwide state.
- Increase the nationwide council canvas height while retaining responsive limits.

## Task 5: Multi-seat prediction tools

- Add behavior tests for search, party/status filtering, selected-first ordering, and live counts.
- Implement neutral filtering/sorting controls and preserve all existing quota validation and save behavior.

## Task 6: Verify and deploy

- Run syntax checks and the full Node suite.
- Perform focused browser smoke checks locally where available.
- Commit the changes, push `main`, wait for GitHub Pages, and verify the public site with a cache-busting URL.
