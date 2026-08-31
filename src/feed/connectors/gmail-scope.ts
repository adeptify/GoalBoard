export const GMAIL_SCOPE_PRESETS = [
  {
    value: "in:inbox is:unread",
    label: "未读收件箱",
    description: "只读取仍在收件箱且未读的邮件",
    requiredLabels: ["INBOX", "UNREAD"],
  },
  {
    value: "in:inbox",
    label: "全部收件箱",
    description: "读取收件箱中的最近邮件，包括已读邮件",
    requiredLabels: ["INBOX"],
  },
  {
    value: "is:starred",
    label: "星标邮件",
    description: "只读取 Gmail 中已加星标的邮件",
    requiredLabels: ["STARRED"],
  },
  {
    value: "is:important",
    label: "重要邮件",
    description: "只读取 Gmail 标记为重要的邮件",
    requiredLabels: ["IMPORTANT"],
  },
] as const;

export type GmailScope = typeof GMAIL_SCOPE_PRESETS[number]["value"];

export const GMAIL_DEFAULT_SCOPE: GmailScope = "in:inbox is:unread";

export function parseGmailScope(value: unknown): GmailScope | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  const preset = GMAIL_SCOPE_PRESETS.find((entry) => entry.value === normalized);
  return preset?.value ?? null;
}

export function normalizeGmailScope(value: unknown): GmailScope {
  return parseGmailScope(value) ?? GMAIL_DEFAULT_SCOPE;
}

export function gmailScopeMatchesLabels(
  scope: GmailScope,
  labelIds: readonly string[],
): boolean {
  const labels = new Set(labelIds.map((label) => label.toUpperCase()));
  const preset = GMAIL_SCOPE_PRESETS.find((entry) => entry.value === scope);
  return Boolean(preset?.requiredLabels.every((label) => labels.has(label)));
}
