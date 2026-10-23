import { describe, expect, it } from 'vitest';
import { massActions } from './mass-actions';

const A = (Code: string, Enabled: boolean, Mass = true, Reason?: string) => ({ Code, Name: Code, Enabled, Mass, Reason });
const titles = new Map([[1, 'Ένα'], [2, 'Δύο'], [3, 'Τρία']]);

describe('massActions', () => {
  const docs = [
    { DocumentId: 1, Actions: [A('UiArchive', true), A('UiAssign', true), A('UiEdit', true, false)] },
    { DocumentId: 2, Actions: [A('UiArchive', false, true, 'Ήδη αρχειοθετημένο.'), A('UiAssign', true)] },
    { DocumentId: 3, Actions: [A('UiArchive', true)] },
  ];
  const list = massActions(docs, titles, (c) => c !== 'UiAssign');

  it('only actions marked Mass', () => {
    expect(list.map((m) => m.code)).toEqual(['UiArchive', 'UiAssign']);
  });
  it('runs on the documents that can, lists the rest with the reason', () => {
    const archive = list.find((m) => m.code === 'UiArchive')!;
    expect(archive.targets.map((t) => t.id)).toEqual([1, 3]);
    expect(archive.excluded).toEqual([{ target: { id: 2, title: 'Δύο' }, message: 'Ήδη αρχειοθετημένο.' }]);
  });
  it('a document without the action is excluded too', () => {
    const assign = list.find((m) => m.code === 'UiAssign')!;
    expect(assign.excluded.map((x) => x.target.id)).toEqual([3]);
    expect(assign.inApp).toBe(false);
  });
});
