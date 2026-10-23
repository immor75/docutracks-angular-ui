/**
 * Top-level sections of the app. Υποθέσεις live under `/folders`, έγγραφα under
 * `/documents`; `/` is the user's dashboard.
 */
export const FOLDERS = '/folders';
export const DOCUMENTS = '/documents';

/** Id of the folder open in the side panel, from `/folders/<id>?…` (not `/folders/<id>/edit`). */
export function openFolderId(url: string): number | null {
  const m = /^\/folders\/(\d+)(?:[?#]|$)/.exec(url);
  return m ? Number(m[1]) : null;
}

/** Section of a URL, used to keep the user in place when the group changes. */
export function sectionOf(url: string): string {
  if (url.startsWith(FOLDERS)) return FOLDERS;
  if (url.startsWith(DOCUMENTS)) return DOCUMENTS;
  return '/';
}

/** The existing (classic) UI, for what this app does not do yet. */
export const CLASSIC = {
  folders: '/apps/folder',
  documents: (groupId: number | null) => (groupId ? `/el/List/${groupId}` : '/el/List'),
  newDocument: (groupId: number | null) => `/el/Document/${groupId ?? 0}/UiNew/UiNewSelection`,
};
