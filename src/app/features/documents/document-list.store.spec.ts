import { describe, expect, it } from 'vitest';
import { DocumentRow, SearchDocumentsRequest } from '../../core/documents-models';
import { exportRequest, withFlags } from './document-list.store';

const row = { Id: 1, IsUnread: true, IsReadByUser: false, IsImportant: false } as DocumentRow;

describe('withFlags', () => {
  it('reading clears «unread» of the copy too', () => {
    expect(withFlags(row, { IsRead: true })).toMatchObject({ IsReadByUser: true, IsUnread: false, IsImportant: false });
  });
  it('«unread» again only concerns the user', () => {
    const read = { ...row, IsUnread: false, IsReadByUser: true };
    expect(withFlags(read, { IsRead: false })).toMatchObject({ IsReadByUser: false, IsUnread: false });
  });
  it('σημαντικό leaves the read marks alone', () => {
    expect(withFlags(row, { IsImportant: true })).toMatchObject({ IsImportant: true, IsReadByUser: false, IsUnread: true });
  });
});

describe('exportRequest', () => {
  const list: SearchDocumentsRequest = {
    GroupId: 2,
    FolderKey: '1.11.GroupOwned',
    Period: { Range: 6 },
    Sort: { Column: 'IssueDate', Direction: 'desc' },
    PageNumber: 3,
    PageSize: 50,
  };
  it('the selection wins over the query', () => {
    expect(exportRequest(list, [5, 7], false)).toEqual({ GroupId: 2, DocumentIds: [5, 7] });
  });
  it('without a selection: the whole query, without paging', () => {
    expect(exportRequest(list, null, true)).toEqual({
      GroupId: 2,
      Query: { FolderKey: '1.11.GroupOwned', Period: { Range: 6 }, Sort: { Column: 'IssueDate', Direction: 'desc' } },
      WithFiles: true,
    });
  });
});
