import { describe, expect, it } from 'vitest';
import { CLASSIC, openDocumentId, openFolderId, sectionOf } from './paths';

describe('paths', () => {
  it('finds the open folder only on the detail URL', () => {
    expect(openFolderId('/folders/42')).toBe(42);
    expect(openFolderId('/folders/42?t=3&p=2')).toBe(42);
    expect(openFolderId('/folders/42/edit?back=x')).toBeNull();
    expect(openFolderId('/folders?t=3')).toBeNull();
    expect(openFolderId('/42')).toBeNull();
  });

  it('maps a URL to its section', () => {
    expect(sectionOf('/folders/42?t=1')).toBe('/folders');
    expect(sectionOf('/documents')).toBe('/documents');
    expect(sectionOf('/')).toBe('/');
  });

  it('finds the open document only on the detail URL', () => {
    expect(openDocumentId('/documents/102300?f=1.11.GroupOwned')).toBe(102300);
    expect(openDocumentId('/documents?f=1')).toBeNull();
    expect(openDocumentId('/folders/12')).toBeNull();
  });

  it('builds classic action URLs as UIViewDoc does', () => {
    expect(CLASSIC.documentAction(2, 'UiArchive', 5)).toBe('/el/Document/2/UiArchive/5?pActionCode=UiViewDoc');
    expect(CLASSIC.documentAction(2, 'UiEdit', 5)).toBe('/el/Document/2/UiEdit/5');
  });
});
