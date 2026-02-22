'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import styles from './family-tree.module.css';

interface PersonNode {
  id: string;
  name: string;
  gender?: string;
  birthDate?: string;
  birthDateQualifier?: string;
  deathDate?: string;
  deathDateQualifier?: string;
}

interface MarriageInfo {
  marriageDate?: string;
  divorceDate?: string;
}

interface FamilyTreeProps {
  personName: string;
  personId: string;
  personGender: string;
  personBirthDate?: string;
  personBirthDateQualifier?: string;
  personDeathDate?: string;
  personDeathDateQualifier?: string;
  parents: PersonNode[];
  children: PersonNode[];
  spouses: PersonNode[];
  marriages?: Record<string, MarriageInfo>;
  otherParent?: Record<string, string>;
  spouseParents?: Record<string, PersonNode[]>;
  parentMarriages?: Record<string, MarriageInfo>;
}

const NODE_W = 160;
const NODE_H = 56;
const H_GAP = 20;
const V_GAP = 64;
const MARRIAGE_W = 80;
const MARRIAGE_W_EMPTY = 28;
const MARRIAGE_H = 28;
const MARRIAGE_GAP = 8;
const BYPASS_H = 40;
const MB_OFFSET_Y = 4;

interface LayoutNode extends PersonNode {
  x: number;
  y: number;
  isFocal?: boolean;
}

interface LayoutMarriageBox {
  x: number;
  y: number;
  w: number;
  label: string;
}

interface LayoutEdge {
  d: string;
}

interface ParentGroup {
  childId: string;
  parents: PersonNode[];
}

function genderOrder(g?: string): number {
  if (g === 'MALE') return 0;
  if (g === 'FEMALE') return 1;
  return 2;
}

function genderClass(g?: string): string {
  if (g === 'MALE') return styles.nodeMale;
  if (g === 'FEMALE') return styles.nodeFemale;
  return '';
}

function yearOf(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  return dateStr.slice(0, 4);
}

function abbreviateName(fullName: string, maxLen = 20): string {
  if (fullName.length <= maxLen) return fullName;
  const parts = fullName.split(' ');
  if (parts.length <= 2) return fullName;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middles = parts.slice(1, -1).map((m) => m[0] + '.').join(' ');
  return `${first} ${middles} ${last}`;
}

const QUALIFIER_SYMBOL: Record<string, string> = {
  ABT: '~',
  BEF: '<',
  AFT: '>',
  EST: '~',
  CAL: '~',
};

const QUALIFIER_WORD: Record<string, string> = {
  ABT: 'about ',
  BEF: 'before ',
  AFT: 'after ',
  EST: 'about ',
  CAL: 'about ',
};

function qualifiedYear(dateStr?: string, qualifier?: string): string | undefined {
  const y = yearOf(dateStr);
  if (!y) return undefined;
  const sym = qualifier ? QUALIFIER_SYMBOL[qualifier] || '' : '';
  return `${sym}${y}`;
}

function qualifiedYearWords(dateStr?: string, qualifier?: string): string | undefined {
  const y = yearOf(dateStr);
  if (!y) return undefined;
  const word = qualifier ? QUALIFIER_WORD[qualifier] || '' : '';
  return `${word}${y}`;
}

function lifespan(node: { birthDate?: string; birthDateQualifier?: string; deathDate?: string; deathDateQualifier?: string }): string | undefined {
  const b = qualifiedYear(node.birthDate, node.birthDateQualifier);
  const d = qualifiedYear(node.deathDate, node.deathDateQualifier);
  if (b && d) return `${b} to ${d}`;
  if (b) return `Born ${qualifiedYearWords(node.birthDate, node.birthDateQualifier)}`;
  if (d) return `Died ${qualifiedYearWords(node.deathDate, node.deathDateQualifier)}`;
  return undefined;
}

function marriageLabelAndWidth(info?: MarriageInfo): { label: string; w: number } {
  const m = yearOf(info?.marriageDate);
  const d = yearOf(info?.divorceDate);
  let label = '';
  if (m && d) label = `Married ${m} · div. ${d}`;
  else if (m) label = `Married ${m}`;
  else if (d) label = `div. ${d}`;
  return { label, w: label ? Math.max(MARRIAGE_W, label.length * 7) : MARRIAGE_W_EMPTY };
}

/** Vertical bezier curve from (x1,y1) down to (x2,y2) */
function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

/** Curve from (x1,y1) going down, arriving horizontally at (x2,y2) */
function curveToSide(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1} ${y1} Q ${x1} ${y2}, ${x2} ${y2}`;
}

export default function FamilyTree({
  personName,
  personId,
  personGender,
  personBirthDate,
  personBirthDateQualifier,
  personDeathDate,
  personDeathDateQualifier,
  parents,
  children,
  spouses,
  marriages = {},
  otherParent = {},
  spouseParents = {},
  parentMarriages = {},
}: FamilyTreeProps) {
  const { nodes, marriageBoxes, edges, width, height, focalX, focalY } = useMemo(() => {
    const layoutNodes: LayoutNode[] = [];
    const layoutMarriageBoxes: LayoutMarriageBox[] = [];
    const layoutEdges: LayoutEdge[] = [];

    const sortedParents = [...parents].sort((a, b) => genderOrder(a.gender) - genderOrder(b.gender));
    const sortedChildren = [...children].sort((a, b) => {
      if (a.birthDate && b.birthDate) return a.birthDate.localeCompare(b.birthDate);
      if (a.birthDate) return -1;
      if (b.birthDate) return 1;
      return a.name.localeCompare(b.name);
    });

    // Sort spouses by marriage date; fallback to youngest children first
    const focalNode: PersonNode = { id: personId, name: personName, gender: personGender, birthDate: personBirthDate, birthDateQualifier: personBirthDateQualifier, deathDate: personDeathDate, deathDateQualifier: personDeathDateQualifier };

    const latestChildBirth = (spouseId: string): string =>
      children
        .filter((c) => otherParent[c.id] === spouseId)
        .reduce((latest, c) => (c.birthDate && c.birthDate > latest ? c.birthDate : latest), '');

    const sortedSpouses = [...spouses].sort((a, b) => {
      const mA = marriages[a.id]?.marriageDate;
      const mB = marriages[b.id]?.marriageDate;
      if (mA && mB) return mA.localeCompare(mB);
      if (mA) return -1;
      if (mB) return 1;
      const youngestA = latestChildBirth(a.id);
      const youngestB = latestChildBirth(b.id);
      if (youngestA && youngestB) return youngestB.localeCompare(youngestA);
      if (youngestA) return -1;
      if (youngestB) return 1;
      return a.name.localeCompare(b.name);
    });

    // Middle row: focal + up to 2 adjacent spouses; extras placed with bypass lines
    let middleRow: PersonNode[];
    let extraSpouses: PersonNode[] = [];
    if (sortedSpouses.length <= 1) {
      middleRow = [focalNode, ...sortedSpouses].sort((a, b) => genderOrder(a.gender) - genderOrder(b.gender));
    } else {
      const left = sortedSpouses.slice(0, 1);
      const right = sortedSpouses.slice(1, 2);
      extraSpouses = sortedSpouses.slice(2);
      middleRow = [...left, focalNode, ...right];
    }

    // Build parent groups for focal + all spouses
    const allMiddle = [...middleRow, ...extraSpouses];
    const hasAnyParents = sortedParents.length > 0 || Object.values(spouseParents).some((p) => p.length > 0);

    const parentGroups: ParentGroup[] = [];
    for (const node of allMiddle) {
      if (node.id === personId && sortedParents.length > 0) {
        parentGroups.push({ childId: personId, parents: sortedParents });
      } else if (node.id !== personId) {
        const sp = (spouseParents[node.id] || []).sort((a, b) => genderOrder(a.gender) - genderOrder(b.gender));
        if (sp.length > 0) {
          parentGroups.push({ childId: node.id, parents: sp });
        }
      }
    }

    // --- Width calculations ---

    let middleRowWidth = middleRow.length * NODE_W + (middleRow.length - 1) * H_GAP;
    for (const es of extraSpouses) {
      middleRowWidth += H_GAP * 3 + marriageLabelAndWidth(marriages[es.id]).w + MARRIAGE_GAP * 2 + NODE_W;
    }

    const childrenRowWidth = sortedChildren.length > 0
      ? sortedChildren.length * NODE_W + (sortedChildren.length - 1) * H_GAP
      : 0;

    let parentRowWidth = 0;
    for (const group of parentGroups) {
      const n = group.parents.length;
      parentRowWidth += n * NODE_W + (n > 1 ? (n - 1) * H_GAP : 0);
    }
    if (parentGroups.length > 1) parentRowWidth += (parentGroups.length - 1) * H_GAP * 2;

    const totalWidth = Math.max(middleRowWidth, childrenRowWidth, parentRowWidth, NODE_W) + H_GAP * 2;

    // --- Y positions ---

    const hasChildren = sortedChildren.length > 0;
    const bypassH = extraSpouses.length > 0 ? BYPASS_H : 0;
    const parentY = hasAnyParents ? H_GAP : 0;
    const focalY = hasAnyParents ? parentY + NODE_H + V_GAP : H_GAP;
    const childY = hasChildren ? focalY + NODE_H + V_GAP + bypassH : 0;
    const totalHeight = (hasChildren ? childY + NODE_H : focalY + NODE_H + bypassH) + H_GAP;
    const centerX = totalWidth / 2;
    const midRowY = focalY + NODE_H / 2;

    // --- Place middle row (focal + 2 adjacent spouses) ---

    const middleStartX = centerX - middleRowWidth / 2;
    let focalX = 0;
    const nodePositions: Record<string, number> = {};
    const marriageBoxBySpouse: Record<string, { cx: number; bottomY: number }> = {};

    let curX = middleStartX;
    middleRow.forEach((node, i) => {
      const nx = curX;
      layoutNodes.push({ ...node, x: nx, y: focalY, isFocal: node.id === personId });
      nodePositions[node.id] = nx;
      if (node.id === personId) focalX = nx;
      curX += NODE_W;

      if (i < middleRow.length - 1) {
        const nextNode = middleRow[i + 1]!;
        const spouseId = node.id === personId ? nextNode.id : node.id;
        const { label, w } = marriageLabelAndWidth(marriages[spouseId]);
        const gapMidX = curX + H_GAP / 2;
        const mbY = focalY + NODE_H + MB_OFFSET_Y;

        // Curved lines from each spouse's bottom center to marriage box sides
        const nextNodeCX = curX + H_GAP + NODE_W / 2;
        const mbCY = mbY + MARRIAGE_H / 2;
        layoutEdges.push({ d: curveToSide(nx + NODE_W / 2, focalY + NODE_H, gapMidX - w / 2, mbCY) });
        layoutEdges.push({ d: curveToSide(nextNodeCX, focalY + NODE_H, gapMidX + w / 2, mbCY) });

        layoutMarriageBoxes.push({ x: gapMidX - w / 2, y: mbY, w, label });
        marriageBoxBySpouse[spouseId] = { cx: gapMidX, bottomY: mbY + MARRIAGE_H };

        curX += H_GAP;
      }
    });

    // --- Place extra spouses with bypass curves ---

    const focalCX = focalX + NODE_W / 2;
    const focalBottom = focalY + NODE_H;
    for (const spouse of extraSpouses) {
      curX += H_GAP * 3;
      const bx = curX;
      const by = focalY + (NODE_H - MARRIAGE_H) / 2;
      const { label, w } = marriageLabelAndWidth(marriages[spouse.id]);
      layoutMarriageBoxes.push({ x: bx, y: by, w, label });

      const sx = bx + w + MARRIAGE_GAP;
      layoutNodes.push({ ...spouse, x: sx, y: focalY });
      nodePositions[spouse.id] = sx;

      layoutEdges.push({ d: `M ${bx + w} ${midRowY} L ${sx} ${midRowY}` });
      // Route bypass below the marriage boxes
      const bypassDipY = focalBottom + MB_OFFSET_Y + MARRIAGE_H + bypassH;
      layoutEdges.push({
        d: `M ${focalCX} ${focalBottom} C ${focalCX} ${bypassDipY}, ${bx} ${bypassDipY}, ${bx} ${midRowY}`,
      });

      marriageBoxBySpouse[spouse.id] = { cx: bx + w / 2, bottomY: by + MARRIAGE_H };
      curX = sx + NODE_W;
    }

    // --- Place parents with marriage boxes ---

    const parentBottom = parentY + NODE_H;
    if (parentGroups.length > 0) {
      let curPX = centerX - parentRowWidth / 2;

      for (const group of parentGroups) {
        const targetX = nodePositions[group.childId];
        const targetCX = targetX !== undefined ? targetX + NODE_W / 2 : centerX;
        const { label: pLabel, w: pW } = marriageLabelAndWidth(parentMarriages[group.childId]);

        if (group.parents.length >= 2) {
          const [p1, p2] = group.parents;
          const p1x = curPX;
          const p2x = p1x + NODE_W + H_GAP;
          const gapMidX = p1x + NODE_W + H_GAP / 2;
          const mbY = parentY + NODE_H + MB_OFFSET_Y;

          layoutNodes.push({ ...p1, x: p1x, y: parentY });
          layoutNodes.push({ ...p2, x: p2x, y: parentY });

          // Curved lines from each parent's bottom center to marriage box sides
          const pMbCY = mbY + MARRIAGE_H / 2;
          layoutEdges.push({ d: curveToSide(p1x + NODE_W / 2, parentY + NODE_H, gapMidX - pW / 2, pMbCY) });
          layoutEdges.push({ d: curveToSide(p2x + NODE_W / 2, parentY + NODE_H, gapMidX + pW / 2, pMbCY) });
          layoutMarriageBoxes.push({ x: gapMidX - pW / 2, y: mbY, w: pW, label: pLabel });

          layoutEdges.push({ d: bezier(gapMidX, mbY + MARRIAGE_H, targetCX, focalY) });

          for (let k = 2; k < group.parents.length; k++) {
            const px = p2x + (k - 1) * (NODE_W + H_GAP);
            layoutNodes.push({ ...group.parents[k], x: px, y: parentY });
            layoutEdges.push({ d: bezier(px + NODE_W / 2, parentBottom, targetCX, focalY) });
          }

          curPX = p2x + NODE_W + H_GAP * 2;
        } else {
          const p = group.parents[0];
          layoutNodes.push({ ...p, x: curPX, y: parentY });
          layoutEdges.push({ d: bezier(curPX + NODE_W / 2, parentBottom, targetCX, focalY) });
          curPX += NODE_W + H_GAP * 2;
        }
      }
    }

    // --- Place children with curves from their parent marriage box ---

    if (hasChildren) {
      const startX = centerX - childrenRowWidth / 2;
      sortedChildren.forEach((child, i) => {
        const cx = startX + i * (NODE_W + H_GAP);
        layoutNodes.push({ ...child, x: cx, y: childY });

        const spouseId = otherParent[child.id];
        const mb = spouseId ? marriageBoxBySpouse[spouseId] : undefined;
        const fromX = mb?.cx ?? focalX + NODE_W / 2;
        const fromY = mb?.bottomY ?? focalY + NODE_H;

        layoutEdges.push({ d: bezier(fromX, fromY, cx + NODE_W / 2, childY) });
      });
    }

    return { nodes: layoutNodes, marriageBoxes: layoutMarriageBoxes, edges: layoutEdges, width: totalWidth, height: totalHeight, focalX, focalY };
  }, [personName, personId, personGender, personBirthDate, personBirthDateQualifier, personDeathDate, personDeathDateQualifier, parents, children, spouses, marriages, otherParent, spouseParents, parentMarriages]);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.scrollLeft = focalX + NODE_W / 2 - wrapper.clientWidth / 2;
    wrapper.scrollTop = focalY + NODE_H / 2 - wrapper.clientHeight / 2;
  }, [focalX, focalY]);

  if (parents.length === 0 && children.length === 0 && spouses.length === 0) {
    return <p className={styles.empty}>No family connections found for this person.</p>;
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.inner} style={{ width, height }}>
        <svg className={styles.svg} width={width} height={height}>
          {edges.map((e, i) => (
            <path key={`e-${i}`} d={e.d} className={styles.edgeLine} />
          ))}
        </svg>
        {nodes.map((n) => (
          <Link
            key={n.id}
            href={`/people/${n.id}?tab=tree`}
            className={`${styles.node} ${n.isFocal ? styles.nodeFocal : ''} ${genderClass(n.gender)}`}
            style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
          >
            <span className={styles.nodeName}>{abbreviateName(n.name)}</span>
            <span className={styles.nodeLabel}>
              {lifespan(n) || ''}
            </span>
          </Link>
        ))}
        {marriageBoxes.map((mb, i) => (
          <div
            key={`mb-${i}`}
            className={styles.marriageBox}
            style={{ left: mb.x, top: mb.y, width: mb.w, height: MARRIAGE_H }}
          >
            {mb.label}
          </div>
        ))}
      </div>
    </div>
  );
}
