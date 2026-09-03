// Tiny bus so the chat can drive the site without prop-drilling through the
// router. Only used for control-token actions, which are already validated
// against the frontend allowlist before they get here.

let pendingProject = null;

// Ask the Work page to open a specific project. Fires an event for the case
// where Work is already mounted, and parks the id for the case where it is
// about to mount (route transitions take ~500ms).
export function requestProject(id) {
  pendingProject = id;
  window.dispatchEvent(new CustomEvent('site:open-project', { detail: { id } }));
}

// Read-and-clear. Called by the Work page on mount.
export function takePendingProject() {
  const id = pendingProject;
  pendingProject = null;
  return id;
}
