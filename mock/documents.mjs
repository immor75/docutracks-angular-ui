// Mock of the documents API v2 (έγγραφα), filled in phase by phase together with the contracts
// in the plan «Πλάνο υλοποίησης Documents UI». Empty until phase 2 (list).

/** Undoes every write action (tests start from the same documents). */
export function resetDocuments() {}

/** Handles a documents request; returns false when the path is not a documents endpoint. */
export function handleDocuments() {
  return false;
}
