import type { RobotsRule, RobotsRules } from "@llms-txt/core";

/** Sitemap lines are global to the file, not scoped to a user-agent group. */
export function parseRobotsTxt(text: string, userAgent: string) {
  const groups = new Map<string, RobotsGroup>();
  const sitemaps: string[] = [];
  let agents: string[] = [];
  let inAgentBlock = false;

  for (const line of text.split(/\r?\n/)) {
    const directive = parseDirective(line);
    if (!directive) continue;
    const [field, value] = directive;
    if (field === "user-agent") {
      if (!inAgentBlock) agents = [];
      inAgentBlock = true;
      agents.push(value.toLowerCase());
      continue;
    }
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    inAgentBlock = false;
    for (const agent of agents) {
      applyDirective(groupFor(groups, agent), field, value);
    }
  }

  const group = selectGroup(groups, userAgent);
  const parsed: Omit<RobotsRules, "fetchedAt"> = {
    rules: group?.rules ?? [],
    sitemaps: [...new Set(sitemaps)],
  };
  if (group?.crawlDelay !== undefined) parsed.crawlDelay = group.crawlDelay;
  return parsed;
}

/** No rules means the whole site is allowed, as a missing robots.txt does. */
export function isAllowed(robots: RobotsRules | undefined, path: string) {
  if (!robots || robots.rules.length === 0) return true;
  let best: RobotsRule | undefined;
  let bestLength = -1;
  for (const rule of robots.rules) {
    if (!matchesPattern(rule.path, path)) continue;
    if (rule.path.length > bestLength) {
      best = rule;
      bestLength = rule.path.length;
    } else if (rule.path.length === bestLength && rule.allow) {
      best = rule;
    }
  }
  return best?.allow ?? true;
}

export function crawlDelaySeconds(robots: RobotsRules | undefined) {
  const delay = robots?.crawlDelay;
  return delay !== undefined && Number.isFinite(delay) && delay > 0 ? delay : 0;
}

interface RobotsGroup {
  rules: RobotsRule[];
  crawlDelay?: number;
}

function parseDirective(line: string) {
  const withoutComment = line.split("#")[0] ?? "";
  const colon = withoutComment.indexOf(":");
  if (colon === -1) return null;
  const field = withoutComment.slice(0, colon).trim().toLowerCase();
  const value = withoutComment.slice(colon + 1).trim();
  return field ? ([field, value] as const) : null;
}

function groupFor(groups: Map<string, RobotsGroup>, agent: string) {
  let group = groups.get(agent);
  if (!group) {
    group = { rules: [] };
    groups.set(agent, group);
  }
  return group;
}

function applyDirective(group: RobotsGroup, field: string, value: string) {
  if (field === "disallow") {
    // An empty Disallow is the explicit "allow everything" of the format.
    if (value) group.rules.push({ path: value, allow: false });
    return;
  }
  if (field === "allow") {
    if (value) group.rules.push({ path: value, allow: true });
    return;
  }
  if (field === "crawl-delay") {
    const delay = Number.parseFloat(value);
    if (Number.isFinite(delay)) group.crawlDelay = delay;
  }
}

function selectGroup(groups: Map<string, RobotsGroup>, userAgent: string) {
  const needle = userAgent.toLowerCase();
  let match: RobotsGroup | undefined;
  let matchLength = 0;
  for (const [name, group] of groups) {
    if (name === "*" || !needle.includes(name)) continue;
    if (name.length > matchLength) {
      match = group;
      matchLength = name.length;
    }
  }
  return match ?? groups.get("*");
}

/** Supports the two wildcards every major crawler honours: `*` and `$`. */
function matchesPattern(pattern: string, path: string) {
  if (!pattern.includes("*") && !pattern.endsWith("$")) {
    return path.startsWith(pattern);
  }
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}
