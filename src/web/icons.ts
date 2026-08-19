import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  Ban,
  BookOpen,
  Boxes,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  CirclePlay,
  CircleX,
  ClipboardCheck,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  FileCode2,
  FileInput,
  FileOutput,
  Filter,
  Fingerprint,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  History,
  Info,
  Layers3,
  Link2,
  ListChecks,
  LockKeyhole,
  PanelRight,
  Plus,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Target,
  UserRound,
  UsersRound,
  Workflow,
  X,
  type IconNode,
} from "lucide";

const ICONS = {
  activity: Activity,
  alert: AlertTriangle,
  archive: Archive,
  arrow: ArrowRight,
  accepted: BadgeCheck,
  blocked: CircleX,
  book: BookOpen,
  brand: Boxes,
  code: Braces,
  check: Check,
  completed: CheckCircle2,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  claim: Fingerprint,
  clipboard: ClipboardCheck,
  clock: Clock3,
  copy: Copy,
  database: Database,
  external: ExternalLink,
  evidence: FileCheck2,
  file: FileCode2,
  filter: Filter,
  folder: Folder,
  history: History,
  impact: Layers3,
  info: Info,
  input: FileInput,
  link: Link2,
  list: ListChecks,
  lock: LockKeyhole,
  more: Ellipsis,
  output: FileOutput,
  panel: PanelRight,
  plus: Plus,
  play: Play,
  question: CircleHelp,
  ready: CirclePlay,
  refresh: RefreshCw,
  rejected: Ban,
  review: UsersRound,
  risk: AlertTriangle,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  target: Target,
  terminal: SquareTerminal,
  tree: GitBranch,
  user: UserRound,
  waiting: Clock3,
  workflow: Workflow,
  x: X,
} satisfies Record<string, IconNode>;

export type GoalBoardIcon = keyof typeof ICONS;

function escapeAttribute(value: string | number | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderNode([tag, attributes]: IconNode[number]): string {
  const attrs = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");
  return `<${tag}${attrs ? ` ${attrs}` : ""}></${tag}>`;
}

export function renderIconSprite(): string {
  const symbols = Object.entries(ICONS)
    .map(
      ([name, node]) =>
        `<symbol id="icon-${name}" viewBox="0 0 24 24">${node.map(renderNode).join("")}</symbol>`,
    )
    .join("");
  return `<svg class="icon-sprite" aria-hidden="true">${symbols}</svg>`;
}

export function icon(name: GoalBoardIcon, className = ""): string {
  return `<svg${className ? ` class="${escapeAttribute(className)}"` : ""} aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}
