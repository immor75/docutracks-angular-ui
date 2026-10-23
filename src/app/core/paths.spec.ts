import { describe, expect, it } from 'vitest';
import { openFolderId, sectionOf } from './paths';

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
});
