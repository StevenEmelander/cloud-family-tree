import type { GedcomLine, GedcomNode, GedcomTree } from './types';

/**
 * Parse a single GEDCOM line into its components.
 * Format: level [xref] tag [value]
 * Examples:
 *   "0 @I1@ INDI"        → { level: 0, xref: "@I1@", tag: "INDI" }
 *   "1 NAME John /Smith/" → { level: 1, tag: "NAME", value: "John /Smith/" }
 *   "2 DATE 15 MAR 1960"  → { level: 2, tag: "DATE", value: "15 MAR 1960" }
 */
export function parseLine(line: string): GedcomLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Match: level (optional xref) tag (optional value)
  const match = trimmed.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
  if (!match) return null;

  return {
    level: Number.parseInt(match[1] as string, 10),
    xref: match[2] || undefined,
    tag: match[3] as string,
    value: match[4] || undefined,
  };
}

/**
 * Parse GEDCOM text into a flat array of lines.
 */
export function parseLines(content: string): GedcomLine[] {
  const lines: GedcomLine[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const parsed = parseLine(raw);
    if (parsed) lines.push(parsed);
  }
  return lines;
}

/**
 * Build a hierarchical tree from flat GEDCOM lines.
 * Uses level numbers to determine parent-child relationships.
 * Handles CONT tags for multi-line text values.
 */
export function buildTree(lines: GedcomLine[]): GedcomNode[] {
  const roots: GedcomNode[] = [];
  const stack: GedcomNode[] = [];

  for (const line of lines) {
    const node: GedcomNode = {
      level: line.level,
      xref: line.xref,
      tag: line.tag,
      value: line.value,
      children: [],
    };

    // Handle CONT: append to parent's value with newline
    if (line.tag === 'CONT') {
      const parent = stack.length > 0 ? stack[stack.length - 1] : undefined;
      if (parent) {
        parent.value = (parent.value ?? '') + '\n' + (line.value ?? '');
        continue;
      }
    }

    // Pop stack until we find the parent (one level up)
    while (stack.length > 0 && (stack[stack.length - 1] as GedcomNode).level >= line.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      (stack[stack.length - 1] as GedcomNode).children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

/**
 * Parse a complete GEDCOM document into a structured tree.
 */
export function parseGedcom(content: string): GedcomTree {
  const lines = parseLines(content);
  const roots = buildTree(lines);

  let header: GedcomNode | null = null;
  const records: GedcomNode[] = [];

  for (const root of roots) {
    if (root.tag === 'HEAD') {
      header = root;
    } else if (root.tag !== 'TRLR') {
      records.push(root);
    }
  }

  return { header, records };
}

// ── Helper functions for querying the tree ──

/** Find all children with a given tag */
export function findChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.tag === tag);
}

/** Find the first child with a given tag */
export function findChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

/** Get the value of the first child with a given tag */
export function childValue(node: GedcomNode, tag: string): string | undefined {
  return findChild(node, tag)?.value;
}

/** Filter records by tag (e.g. "INDI", "FAM", "SOUR", "OBJE") */
export function getRecordsByTag(tree: GedcomTree, tag: string): GedcomNode[] {
  return tree.records.filter((r) => r.tag === tag);
}
