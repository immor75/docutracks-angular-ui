import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of, switchMap, timer } from 'rxjs';
import { PersonValue, RegSignatureChainField } from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { RegisterApi } from '../../../core/register-api';
import { Session } from '../../../core/session';
import { RegisterStore } from './register-store';

/**
 * The signatures the draft will get, in order: what the user chose and the intermediate
 * προσυπογραφές the server computes from the organisation («υπολογίζονται αυτόματα»).
 * Recomputed 300 ms after the choices change.
 */
@Component({
  selector: 'app-signature-chain',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!hasFinals()) {
      <p class="muted">Επιλέξτε τελικό υπογράφοντα για να δείτε τη σειρά των υπογραφών.</p>
    } @else if (chain.error()) {
      <p class="field-err" role="alert">Η σειρά των υπογραφών δεν υπολογίστηκε. {{ errorMessage(chain.error()) }}</p>
    } @else if (chain.hasValue() && chain.value(); as c) {
      <ol class="steps" [attr.aria-busy]="chain.isLoading()">
        @for (s of c.Steps; track s.Order) {
          <li [class.auto]="s.Auto">
            <span class="kind">{{ s.Kind }}</span>
            <span class="who">{{ s.Group }}{{ s.User ? ' · ' + s.User : '' }}</span>
            @if (s.Auto) {
              <span class="badge">αυτόματα</span>
            }
          </li>
        }
      </ol>
      @for (w of c.Warnings ?? []; track $index) {
        <p class="warn">{{ w }}</p>
      }
    } @else {
      <span class="skel" style="height: 60px"></span>
    }
  `,
  styles: `
    :host { display: grid; gap: var(--s-2); }
    .steps { display: grid; gap: var(--s-1); margin: 0; padding: 0 0 0 var(--s-5); }
    .steps li { padding: var(--s-1) 0; font-size: var(--fs-small); }
    .kind { font-weight: 600; margin-right: var(--s-2); }
    .who { color: var(--body); }
    .auto .kind { color: var(--secondary); }
    .badge { margin-left: var(--s-2); padding: 0 6px; border-radius: var(--r-pill); background: var(--shade-2); color: var(--secondary-dark); font-size: var(--fs-tiny); }
    .muted { margin: 0; color: var(--secondary); font-size: var(--fs-small); }
    .warn { margin: 0; padding: var(--s-1) var(--s-2); border-radius: var(--r-md); background: var(--notice-bg); color: var(--notice-dark); font-size: var(--fs-small); }
    .field-err { margin: 0; color: var(--notice-dark); font-size: var(--fs-small); }
  `,
})
export class SignatureChain {
  private readonly store = inject(RegisterStore);
  private readonly api = inject(RegisterApi);
  private readonly session = inject(Session);

  readonly field = input.required<RegSignatureChainField>();
  protected readonly errorMessage = errorMessage;

  private readonly people = (key: string | null | undefined): PersonValue[] =>
    key ? ((this.store.values()[key] ?? []) as PersonValue[]) : [];

  private readonly request = computed(() => {
    const from = this.field().From;
    return {
      Finals: this.people(from.Finals),
      Extra: this.people(from.Extra),
      CoAuthors: this.people(from.CoAuthors),
      Ratifiers: this.people(from.Ratifiers),
    };
  });
  protected readonly hasFinals = computed(() => this.request().Finals.length > 0);

  protected readonly chain = rxResource({
    params: () => (this.hasFinals() ? { ...this.request(), key: JSON.stringify(this.request()) } : undefined),
    stream: ({ params }) => {
      const groupId = this.session.groupId();
      if (!params || !groupId) return of(null);
      const { key: _key, ...req } = params;
      void _key;
      return timer(300).pipe(switchMap(() => this.api.signatureChain({ GroupId: groupId, ...req })));
    },
  });
}
