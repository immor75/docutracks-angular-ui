import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input } from '@angular/core';
import {
  Alert02Icon,
  CheckListIcon,
  DialpadSquare01Icon,
  Notification02Icon,
  Settings03Icon,
  SquareArrowLeftDoubleIcon,
  SquareArrowRightDoubleIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  ArrowRightDoubleIcon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
  Calendar03Icon,
  Cancel01Icon,
  Clock04Icon,
  File01Icon,
  FilterHorizontalIcon,
  Folder01Icon,
  FolderOpenIcon,
  InformationCircleIcon,
  Link01Icon,
  LinkSquare02Icon,
  Logout01Icon,
  Menu01Icon,
  Refresh01Icon,
  Search01Icon,
  Share08Icon,
  UserIcon,
  UserMultipleIcon,
  Archive02Icon,
  ArrowTurnBackwardIcon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Exchange01Icon,
  MoreHorizontalIcon,
  PrinterIcon,
  SentIcon,
  Tick02Icon,
  UserAdd01Icon,
  UserCheck01Icon,
  Undo02Icon,
  PlusSignIcon,
  PencilEdit02Icon,
  Download04Icon,
  Upload04Icon,
  Location01Icon,
  Tag01Icon,
  ArrowLeft02Icon,
  Attachment01Icon,
  JusticeScale01Icon,
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  Home01Icon,
  Flag02Icon,
  Comment01Icon,
  ColumnsThreeCogIcon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  ArrowLeftRightIcon,
  Mail01Icon,
  MailOpen01Icon,
  Xls02Icon,
  FileZipIcon,
} from '@hugeicons/core-free-icons';

/**
 * Hugeicons (same set as FolderUI), but only the icons this app uses. Named imports are
 * tree-shaken, so the bundle carries a few KB instead of the 4.5 MB `import *` in docu-ui.
 */
const ICONS = {
  expand: ArrowExpand01Icon,
  shrink: ArrowShrink01Icon,
  plus: PlusSignIcon,
  edit: PencilEdit02Icon,
  download: Download04Icon,
  upload: Upload04Icon,
  location: Location01Icon,
  tag: Tag01Icon,
  back: ArrowLeft02Icon,
  attachment: Attachment01Icon,
  justice: JusticeScale01Icon,
  archive: Archive02Icon,
  return: ArrowTurnBackwardIcon,
  done: CheckmarkCircle02Icon,
  copy: Copy01Icon,
  trash: Delete02Icon,
  exchange: Exchange01Icon,
  more: MoreHorizontalIcon,
  print: PrinterIcon,
  send: SentIcon,
  check: Tick02Icon,
  'user-add': UserAdd01Icon,
  'user-check': UserCheck01Icon,
  undo: Undo02Icon,
  alert: Alert02Icon,
  'chevron-down': ArrowDown01Icon,
  'chevron-left': ArrowLeft01Icon,
  'chevron-right': ArrowRight01Icon,
  'chevron-up': ArrowUp01Icon,
  'first-page': ArrowLeftDoubleIcon,
  'last-page': ArrowRightDoubleIcon,
  sort: ArrowUpDownIcon,
  calendar: Calendar03Icon,
  close: Cancel01Icon,
  clock: Clock04Icon,
  file: File01Icon,
  filter: FilterHorizontalIcon,
  folder: Folder01Icon,
  'folder-open': FolderOpenIcon,
  info: InformationCircleIcon,
  link: Link01Icon,
  external: LinkSquare02Icon,
  logout: Logout01Icon,
  menu: Menu01Icon,
  refresh: Refresh01Icon,
  search: Search01Icon,
  share: Share08Icon,
  user: UserIcon,
  users: UserMultipleIcon,
  home: Home01Icon,
  flag: Flag02Icon,
  comment: Comment01Icon,
  columns: ColumnsThreeCogIcon,
  incoming: ArrowDown02Icon,
  outgoing: ArrowUp02Icon,
  draft: PencilEdit02Icon,
  internal: ArrowLeftRightIcon,
  mail: Mail01Icon,
  'mail-open': MailOpen01Icon,
  xls: Xls02Icon,
  zip: FileZipIcon,
  apps: DialpadSquare01Icon,
  tasks: CheckListIcon,
  bell: Notification02Icon,
  settings: Settings03Icon,
  'nav-collapse': SquareArrowLeftDoubleIcon,
  'nav-expand': SquareArrowRightDoubleIcon,
} as const;

export type IconName = keyof typeof ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** camelCase → kebab-case for SVG presentation attributes (strokeWidth → stroke-width). */
const attrName = (k: string) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

@Component({
  selector: 'app-icon',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', class: 'icon' },
  styles: `
    :host { display: inline-flex; flex: none; line-height: 0; }
    :host ::ng-deep svg { width: 100%; height: 100%; }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      const size = this.size();
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('focusable', 'false');
      for (const [tag, attrs] of ICONS[this.name()] as unknown as [string, Record<string, string>][]) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) if (k !== 'key') el.setAttribute(attrName(k), String(v));
        svg.appendChild(el);
      }
      this.host.style.width = this.host.style.height = `${size}px`;
      this.host.replaceChildren(svg);
    });
  }
}
