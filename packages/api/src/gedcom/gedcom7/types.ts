/** A single parsed GEDCOM line */
export interface GedcomLine {
  level: number;
  xref?: string; // e.g. @I1@
  tag: string; // e.g. INDI, NAME, DATE
  value?: string;
}

/** A hierarchical node in the parsed GEDCOM tree */
export interface GedcomNode {
  level: number;
  xref?: string;
  tag: string;
  value?: string;
  children: GedcomNode[];
}

/** The full parsed GEDCOM document */
export interface GedcomTree {
  header: GedcomNode | null;
  records: GedcomNode[];
}
