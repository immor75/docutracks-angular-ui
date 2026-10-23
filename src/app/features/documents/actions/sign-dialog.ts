import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DocumentsApi } from '../../../core/documents-api';
import { SignForm } from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { CLASSIC } from '../../../core/paths';
import { Session } from '../../../core/session';
import { Icon } from '../../../ui/icon';
import { DocActionRunner, SIGN } from './doc-action-runner';

/**
 * «Υπογραφή» for one or many documents (UiSign, UiMassDigitalSign): remote signature with
 * username, password and OTP, or, for drafts, a signature without a digital one. USB tokens
 * need the browser add-on and stay in the classic UI for now. The password and the OTP live
 * only in this dialog and are cleared when it closes.
 */
@Component({
  selector: 'app-sign-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sign-dialog.html',
  styleUrl: './doc-action-dialog.css',
  host: { '(click)': 'backdropClick($event)' },
})
export class SignDialog {
  protected readonly runner = inject(DocActionRunner);
  private readonly api = inject(DocumentsApi);
  private readonly session = inject(Session);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly errorMessage = errorMessage;
  protected readonly open = computed(() => {
    const o = this.runner.current();
    return o && o.code === SIGN ? o : null;
  });
  protected readonly targets = computed(() => this.open()?.targets ?? []);
  protected readonly subject = computed(() => {
    const t = this.targets();
    return t.length === 1 ? `«${t[0].title || 'Α/Α ' + t[0].id}»` : `${t.length} επιλεγμένα έγγραφα`;
  });

  protected readonly form = rxResource({
    params: () => {
      const o = this.open();
      const groupId = this.session.groupId();
      return o && groupId ? { seq: o.seq, groupId, ids: o.targets.map((t) => t.id) } : undefined;
    },
    stream: ({ params }) => this.api.signForm(params.groupId, params.ids),
  });
  protected readonly f = computed<SignForm | null>(() => (this.form.hasValue() ? this.form.value() : null));

  /* ---------- form state (reset with every new form) ---------- */

  /** Sign digitally; drafts may also be signed without (NonDigitalSignature). */
  protected readonly digital = linkedSignal(() => !!this.f());
  protected readonly tokenId = linkedSignal(() => this.f()?.DefaultTokenId ?? this.f()?.Tokens[0]?.Id ?? null);
  protected readonly token = computed(() => this.f()?.Tokens.find((t) => t.Id === this.tokenId()) ?? null);
  protected readonly username = linkedSignal<SignForm | null, string>({ source: this.f, computation: () => '' });
  protected readonly password = linkedSignal<SignForm | null, string>({ source: this.f, computation: () => '' });
  protected readonly otp = linkedSignal<SignForm | null, string>({ source: this.f, computation: () => '' });
  protected readonly comment = linkedSignal<SignForm | null, string>({ source: this.f, computation: () => '' });
  protected readonly append = linkedSignal(() => this.f()?.AppendSignature?.Default ?? false);
  protected readonly finalSigner = linkedSignal(() => this.f()?.SignAsFinalSigner?.Default ?? false);
  protected readonly userImage = linkedSignal(() => this.f()?.UseUserImage?.Default ?? false);
  protected readonly otpMessage = linkedSignal<SignForm | null, { text: string; error: boolean } | null>({
    source: this.f,
    computation: () => null,
  });
  protected readonly otpBusy = signal(false);
  protected readonly invalid = linkedSignal<SignForm | null, Record<string, string>>({ source: this.f, computation: () => ({}) });

  /** A USB token is picked: it signs through the add-on, so the form sends the user to the classic UI. */
  protected readonly usb = computed(() => this.digital() && !!this.token() && !this.token()!.IsRemote);
  protected readonly classicHref = computed(() => {
    const t = this.targets();
    return t.length === 1 ? CLASSIC.documentAction(this.session.groupId(), SIGN, t[0].id) : null;
  });

  protected readonly busy = this.runner.busy;
  protected readonly failures = this.runner.failures;

  constructor() {
    effect(() => {
      const d = this.dialog()?.nativeElement;
      if (!d) return;
      if (this.open() && !d.open) d.showModal();
      if (!this.open() && d.open) d.close();
    });
    // Secrets do not outlive the dialog.
    effect(() => {
      if (!this.open()) {
        this.password.set('');
        this.otp.set('');
      }
    });
  }

  protected async requestOtp(): Promise<void> {
    const groupId = this.session.groupId();
    const token = this.token();
    if (!groupId || !token || this.otpBusy()) return;
    if (!this.username().trim() || !this.password()) {
      this.otpMessage.set({ text: 'Συμπληρώστε όνομα χρήστη και κωδικό για να λάβετε OTP.', error: true });
      return;
    }
    this.otpBusy.set(true);
    try {
      const r = await firstValueFrom(
        this.api.signOtp({ GroupId: groupId, TokenId: token.Id, Username: this.username().trim(), Password: this.password() }),
      );
      this.otpMessage.set({ text: r.Message, error: false });
    } catch (e) {
      this.otpMessage.set({ text: errorMessage(e), error: true });
    }
    this.otpBusy.set(false);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const form = this.f();
    if (!form || form.Classic || this.usb() || this.busy()) return;
    const errors: Record<string, string> = {};
    const remote = this.digital() && !!this.token()?.IsRemote;
    if (this.digital() && !this.token()) errors['token'] = 'Επιλέξτε τρόπο υπογραφής.';
    if (remote) {
      if (!this.username().trim()) errors['username'] = 'Συμπληρώστε το όνομα χρήστη.';
      if (!this.password()) errors['password'] = 'Συμπληρώστε τον κωδικό.';
      const len = this.token()?.OtpLength;
      if (!this.otp().trim()) errors['otp'] = 'Συμπληρώστε τον κωδικό OTP.';
      else if (len && this.otp().trim().length !== len) errors['otp'] = `Ο κωδικός OTP έχει ${len} ψηφία.`;
    }
    this.invalid.set(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      queueMicrotask(() => this.dialog()?.nativeElement.querySelector<HTMLElement>(`[data-field="${first}"] :is(input, select)`)?.focus());
      return;
    }
    void this.runner
      .execute(form.Title, (groupId, _code, ids) =>
        this.api.sign({
          GroupId: groupId,
          DocumentIds: ids,
          Digital: this.digital(),
          ...(remote ? { TokenId: this.tokenId(), Username: this.username().trim(), Password: this.password(), Otp: this.otp().trim() } : {}),
          Comment: this.comment().trim(),
          ...(form.AppendSignature ? { AppendSignature: this.append() } : {}),
          ...(form.SignAsFinalSigner ? { SignAsFinalSigner: this.finalSigner() } : {}),
          ...(form.UseUserImage ? { UseUserImage: this.userImage() } : {}),
        }),
      )
      .then(() => this.otp.set('')); // an OTP is good for one try
  }

  protected setToken(value: string): void {
    this.tokenId.set(Number(value));
    this.otpMessage.set(null);
  }

  protected clearError(key: string): void {
    if (this.invalid()[key]) this.invalid.update((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
  }

  protected cancel(event?: Event): void {
    event?.preventDefault();
    this.runner.close();
  }

  protected backdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.cancel();
  }
}
