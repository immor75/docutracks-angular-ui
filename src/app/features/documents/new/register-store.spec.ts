import { describe, expect, it } from 'vitest';
import { RegisterForm } from '../../../core/documents-models';
import { checkRequired, initialValues, isEmpty, isHidden, valuesToSend } from './register-store';

const form = {
  NewType: 1,
  DocumentType: 1,
  Title: 'Εισερχόμενο',
  Tabs: [{ Key: 'basic', Label: 'Βασικά' }, { Key: 'protocol', Label: 'Πρωτόκολλο' }],
  AllowBrief: true,
  BriefDefault: false,
  Fields: [
    { Key: 'Title', Kind: 'text', Label: 'Θέμα', Tab: 'basic', Brief: true, Required: true, RequiredMessage: 'Υποχρεωτικό' },
    { Key: 'Summary', Kind: 'text', Label: 'Περίληψη', Tab: 'basic' },
    { Key: 'Book', Kind: 'select', Label: 'Βιβλίο', Tab: 'protocol', Brief: true, Options: [{ Id: 1, Label: 'Βασικό' }], Value: 1 },
    { Key: 'Receipt', Kind: 'checkbox', Label: 'Αποδεικτικό', Tab: 'protocol' },
    { Key: 'Sender', Kind: 'contacts', Label: 'Αποστολέας', Tab: 'protocol', Brief: true, Required: true, Multi: false, AllowNew: true },
    { Key: 'By', Kind: 'display', Label: 'Καταχωριστής', Tab: 'protocol', Value: 'Admina' },
  ],
} as RegisterForm;

describe('register form helpers', () => {
  it('starts from the defaults the server sends', () => {
    expect(initialValues(form)).toEqual({ Book: 1, Receipt: false });
  });
  it('empty means what the server counts as empty', () => {
    expect([isEmpty('  '), isEmpty([]), isEmpty(null), isEmpty(0), isEmpty(false)]).toEqual([true, true, true, false, false]);
  });
  it('required fields, with the tab to go to', () => {
    expect(checkRequired(form.Fields, { Title: ' ', Sender: [] })).toEqual([
      { key: 'Title', tab: 'basic', message: 'Υποχρεωτικό' },
      { key: 'Sender', tab: 'protocol', message: 'Συμπληρώστε το πεδίο «Αποστολέας».' },
    ]);
  });
  it('brief registration sends only its fields, never display ones or empty values', () => {
    const values = { Title: 'Θέμα', Summary: 'κείμενο', Book: 1, Receipt: true, Sender: [{ Id: null, Name: 'Α.Ε.' }], By: 'x' };
    expect(Object.keys(valuesToSend(form.Fields, values, true))).toEqual(['Title', 'Book', 'Sender']);
    expect(Object.keys(valuesToSend(form.Fields, { ...values, Summary: '' }, false))).toEqual(['Title', 'Book', 'Receipt', 'Sender']);
  });
  it('a field hidden by another is neither required nor sent («Από Πρότυπο»)', () => {
    const fields = [
      { Key: 'FromTemplate', Kind: 'checkbox', Label: 'Από Πρότυπο', Tab: 'basic' },
      { Key: 'MainFile', Kind: 'files', Label: 'Κυρίως', Tab: 'basic', Role: 'main', Multi: false, Required: true, HiddenIf: { Key: 'FromTemplate', Value: true } },
    ] as RegisterForm['Fields'];
    const file = [{ TempId: 't', Name: 'a.pdf', Size: 1, IsPdf: true }];
    expect(isHidden(fields[1], { FromTemplate: true })).toBe(true);
    expect(checkRequired(fields, { FromTemplate: true })).toEqual([]);
    expect(checkRequired(fields, { FromTemplate: false }).map((i) => i.key)).toEqual(['MainFile']);
    expect(Object.keys(valuesToSend(fields, { FromTemplate: true, MainFile: file }, false))).toEqual(['FromTemplate']);
  });
});
