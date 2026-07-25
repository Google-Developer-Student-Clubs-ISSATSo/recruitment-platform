import {
  ArrowLeft,
  ArrowRight,
  Armchair,
  Award,
  BadgeCheck,
  BarChart3,
  BellRing,
  Bookmark,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Clock,
  Code,
  Columns3,
  DoorOpen,
  EllipsisVertical,
  ExternalLink,
  Eye,
  FileText,
  FilePen,
  FileUp,
  Filter,
  GraduationCap,
  Heart,
  Hourglass,
  Info,
  Key,
  LayoutDashboard,
  Link2,
  ListChecks,
  ListFilter,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  MailCheck,
  MailPlus,
  Megaphone,
  Menu,
  MessagesSquare,
  MinusCircle,
  Pencil,
  Plus,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ScrollText,
  Send,
  Settings,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Undo2,
  User,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  Video,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The app's single icon system, backed by lucide-react.
 *
 * This used to render a Material Symbols *ligature* — the literal string
 * "arrow_forward" inside a <span class="material-symbols-outlined">, relying on
 * the font to fuse those characters into one glyph. That font could never load:
 * the stylesheet came from fonts.googleapis.com and the font file from
 * fonts.gstatic.com, and next.config.ts's CSP allows neither
 * (`style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`). With no
 * @font-face ever arriving, every icon in the app rendered as its own name in
 * plain text.
 *
 * Switching to lucide removes the external dependency altogether rather than
 * widening the CSP for it, and matches how icons were already used in the theme
 * toggle, the notification bell and the permissions table.
 *
 * The keys stay Material-Symbols-style names so the ~90 call sites and the config
 * objects that feed them (sidebar nav, quick links, activity descriptions) did
 * not need to change. `IconName` is the union of those keys, so a name with no
 * icon behind it is a TYPE ERROR — which is what stops this class of bug from
 * coming back silently.
 */
const ICONS = {
  add: Plus,
  add_circle: PlusCircle,
  admin_panel_settings: ShieldCheck,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  bar_chart: BarChart3,
  bookmark: Bookmark,
  campaign: Megaphone,
  cancel: XCircle,
  check: Check,
  check_circle: CheckCircle2,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  close: X,
  code: Code,
  dashboard: LayoutDashboard,
  delete: Trash2,
  description: FileText,
  do_not_disturb_on: MinusCircle,
  edit: Pencil,
  edit_note: FilePen,
  emoji_events: Award,
  error: CircleAlert,
  event: Calendar,
  event_available: CalendarCheck,
  event_seat: Armchair,
  expand_less: ChevronUp,
  expand_more: ChevronDown,
  fact_check: ClipboardCheck,
  favorite: Heart,
  filter_alt: Filter,
  filter_list: ListFilter,
  forum: MessagesSquare,
  forward_to_inbox: MailPlus,
  group: Users,
  // Deliberately distinct from `group`: this one labels committee-level totals
  // (capacity, per-committee stats), so it reads as "a body of people".
  groups: UsersRound,
  help: CircleHelp,
  how_to_reg: UserCheck,
  info: Info,
  key: Key,
  keyboard_arrow_down: ChevronDown,
  keyboard_arrow_up: ChevronUp,
  link: Link2,
  lock: Lock,
  lock_open: LockOpen,
  logout: LogOut,
  mail: Mail,
  meeting_room: DoorOpen,
  menu: Menu,
  more_vert: EllipsisVertical,
  notifications_active: BellRing,
  open_in_new: ExternalLink,
  outgoing_mail: MailCheck,
  pending: Hourglass,
  person: User,
  person_add: UserPlus,
  radio_button_unchecked: Circle,
  receipt_long: ScrollText,
  refresh: RefreshCw,
  restart_alt: RotateCcw,
  rule: ListChecks,
  schedule: Clock,
  school: GraduationCap,
  search: Search,
  security: Shield,
  send: Send,
  settings: Settings,
  shield: ShieldAlert,
  task_alt: BadgeCheck,
  trending_up: TrendingUp,
  trophy: Trophy,
  tune: Settings2,
  undo: Undo2,
  upload_file: FileUp,
  verified: ShieldCheck,
  video_chat: Video,
  view_column: Columns3,
  visibility: Eye,
  warning: TriangleAlert,
} as const satisfies Record<string, LucideIcon>;

/** Every icon the app can render. Anything else fails to compile. */
export type IconName = keyof typeof ICONS;

/**
 * Presentational icon. No hooks → usable from both server and client components.
 *
 * `size="1em"` is the load-bearing detail: it makes the SVG scale with font-size,
 * so the `text-[18px]` / `text-[20px]` / `text-[22px]` classes already present on
 * every call site keep controlling the icon exactly as they did when these were
 * glyphs, and the visual weight the design was tuned for carries over unchanged.
 * lucide strokes with `currentColor`, so the existing text-colour classes keep
 * working the same way too.
 */
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  const Glyph: LucideIcon | undefined = ICONS[name];
  // Unreachable through the type, but a few call sites read the name out of a
  // config object; rendering nothing beats reverting to visible raw text.
  if (!Glyph) return null;

  return (
    <Glyph
      aria-hidden
      size="1em"
      // shrink-0 because a glyph never shrank inside a flex row either, and
      // align-middle preserves the old `vertical-align: middle` base rule for
      // icons sitting inline with text.
      className={cn("inline-block shrink-0 align-middle", className)}
    />
  );
}
