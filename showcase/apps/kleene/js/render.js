// SVG rendering for the automata and the parse tree.
//
// SVG rather than canvas because every node and edge carries a label that must
// stay crisp while panning and zooming, and because hover and click targets
// come for free.

import { layout, NODE_R } from './layout.js';
import { astChildren, astLabel } from './parser.js';
import * as CS from './charset.js';

const NS = 'http://www.w3.org/2000/svg';

export function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function defs() {
  const mk = (id, cls) => el('marker', {
    id,
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 6,
    markerHeight: 6,
    orient: 'auto-start-reverse',
  }, [el('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: cls })]);
  return el('defs', {}, [
    mk('arrow', 'arrowhead'),
    mk('arrow-hot', 'arrowhead hot'),
    mk('arrow-dim', 'arrowhead dim'),
  ]);
}

// ------------------------------------------------------------- automaton

export function renderAutomaton(host, spec) {
  const {
    nodes, edges, start, highlight = new Set(), activeEdges = new Set(),
    emptyMessage = 'nothing to draw',
  } = spec;

  host.replaceChildren();
  if (!nodes.length) {
    host.append(Object.assign(document.createElement('p'), {
      className: 'empty', textContent: emptyMessage,
    }));
    return null;
  }

  const g = layout(nodes, edges, { start });
  // Room on the left for the start arrow, and below for back-edge bows.
  const minX = -34;
  const extraY = 70;
  const svg = el('svg', {
    class: 'automaton',
    viewBox: `${minX} -20 ${g.width - minX + 20} ${g.height + extraY}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
  });
  svg.append(defs());

  const edgeLayer = el('g', { class: 'edges' });
  const nodeLayer = el('g', { class: 'nodes' });

  for (const e of g.edges) {
    const hot = activeEdges.has(e.key);
    const cls = `edge ${e.kind}${hot ? ' hot' : ''}${e.dim ? ' dim' : ''}`;
    const marker = hot ? 'arrow-hot' : (e.dim ? 'arrow-dim' : 'arrow');
    edgeLayer.append(el('path', {
      d: e.path, class: cls, 'marker-end': `url(#${marker})`, fill: 'none',
    }));
    if (e.label) {
      const text = el('text', {
        x: e.label.x, y: e.label.y, class: `edge-label${hot ? ' hot' : ''}${e.dim ? ' dim' : ''}`,
        'text-anchor': 'middle',
      }, [e.text ?? '']);
      // A backing rect keeps the label readable where it crosses an edge.
      const pad = 3;
      const w = (e.text ?? '').length * 6.2 + pad * 2;
      edgeLayer.append(el('rect', {
        x: e.label.x - w / 2, y: e.label.y - 9, width: w, height: 14,
        class: 'label-bg', rx: 3,
      }));
      edgeLayer.append(text);
    }
  }

  const startNode = g.nodes.find((n) => n.id === start);
  if (startNode) {
    edgeLayer.append(el('path', {
      d: `M ${startNode.x - NODE_R - 26} ${startNode.y} L ${startNode.x - NODE_R - 3} ${startNode.y}`,
      class: 'edge start-arrow', 'marker-end': 'url(#arrow)', fill: 'none',
    }));
  }

  for (const n of g.nodes) {
    const classes = ['state'];
    if (n.accepting) classes.push('accepting');
    if (n.isTrap) classes.push('trap');
    if (highlight.has(n.id)) classes.push('hot');
    const group = el('g', { class: classes.join(' '), 'data-state': n.id, tabindex: 0 });
    if (n.accepting) group.append(el('circle', { cx: n.x, cy: n.y, r: NODE_R + 4, class: 'ring' }));
    group.append(el('circle', { cx: n.x, cy: n.y, r: NODE_R, class: 'disc' }));
    group.append(el('text', {
      x: n.x, y: n.y + 4, 'text-anchor': 'middle', class: 'state-label',
    }, [n.label ?? String(n.id)]));
    if (n.title) group.append(el('title', {}, [n.title]));
    nodeLayer.append(group);
  }

  svg.append(edgeLayer, nodeLayer);
  host.append(svg);
  attachPanZoom(svg, { minX, minY: -20, w: g.width - minX + 20, h: g.height + extraY });
  return svg;
}

// Pan by drag, zoom by wheel, both by rewriting the viewBox so text stays sharp.
function attachPanZoom(svg, base) {
  const view = { ...base };
  const apply = () => svg.setAttribute('viewBox', `${view.minX} ${view.minY} ${view.w} ${view.h}`);
  let dragging = null;

  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    dragging = { x: ev.clientX, y: ev.clientY, minX: view.minX, minY: view.minY };
    svg.setPointerCapture(ev.pointerId);
    svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    const scale = view.w / rect.width;
    view.minX = dragging.minX - (ev.clientX - dragging.x) * scale;
    view.minY = dragging.minY - (ev.clientY - dragging.y) * scale;
    apply();
  });
  const stop = (ev) => {
    if (!dragging) return;
    dragging = null;
    svg.releasePointerCapture?.(ev.pointerId);
    svg.classList.remove('dragging');
  };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const rect = svg.getBoundingClientRect();
    const fx = (ev.clientX - rect.left) / rect.width;
    const fy = (ev.clientY - rect.top) / rect.height;
    const k = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
    const nw = Math.min(base.w * 6, Math.max(base.w * 0.15, view.w * k));
    const nh = nw * (view.h / view.w);
    view.minX += (view.w - nw) * fx;
    view.minY += (view.h - nh) * fy;
    view.w = nw;
    view.h = nh;
    apply();
  }, { passive: false });

  svg.reset = () => { Object.assign(view, base); apply(); };
  apply();
}

// --------------------------------------------------------------- NFA view

export function nfaGraphSpec(nfa, { highlightAst = null } = {}) {
  const highlight = new Set();
  const nodes = nfa.states.map((s) => {
    if (highlightAst !== null && s.astId === highlightAst) highlight.add(s.id);
    return {
      id: s.id,
      label: String(s.id),
      accepting: s.id === nfa.accept,
      isTrap: false,
      title: s.id === nfa.start ? 'start state' : (s.id === nfa.accept ? 'accept state' : ''),
    };
  });
  const edges = nfa.states.flatMap((s, i) => s.edges.map((e, j) => ({
    from: s.id,
    to: e.to,
    key: `${s.id}-${j}`,
    text: e.set === null ? 'ε' : CS.label(e.set, { maxParts: 2 }),
    epsilon: e.set === null,
    dim: e.set === null,
  })));
  return { nodes, edges, start: nfa.start, highlight };
}

// --------------------------------------------------------------- DFA view

export function dfaGraphSpec(dfa, groupedEdges, { hideTrap = true, activeState = null } = {}) {
  const nodes = dfa.states
    .filter((s) => !(hideTrap && s.isTrap))
    .map((s) => ({
      id: s.id,
      label: String(s.id),
      accepting: s.accepting,
      isTrap: s.isTrap,
      title: [
        s.id === dfa.start ? 'start' : null,
        s.accepting ? 'accepting' : null,
        s.merged ? `merged NFA-DFA states {${s.merged.join(', ')}}` : null,
        s.nfaStates ? `NFA subset {${s.nfaStates.join(', ')}}` : null,
      ].filter(Boolean).join(' · '),
    }));
  const edges = groupedEdges.map((e, i) => ({
    from: e.from, to: e.to, key: `d${i}`, text: e.label,
  }));
  const highlight = new Set(activeState === null ? [] : [activeState]);
  return { nodes, edges, start: dfa.start, highlight };
}

// ------------------------------------------------------------- parse tree

export function renderAst(host, ast, { selected = null, onSelect = null } = {}) {
  host.replaceChildren();
  const NODE_W = 96;
  const NODE_H = 30;
  const H_GAP = 16;
  const V_GAP = 54;

  // Leaves get sequential slots; every parent centres over its children.
  let cursor = 0;
  const placed = [];
  const walk = (node, depth) => {
    const kids = astChildren(node);
    const entry = { node, depth, x: 0, y: depth * V_GAP + NODE_H / 2 + 10, kids: [] };
    if (kids.length === 0) {
      entry.x = cursor * (NODE_W + H_GAP) + NODE_W / 2;
      cursor++;
    } else {
      for (const k of kids) entry.kids.push(walk(k, depth + 1));
      const first = entry.kids[0];
      const last = entry.kids[entry.kids.length - 1];
      entry.x = (first.x + last.x) / 2;
    }
    placed.push(entry);
    return entry;
  };
  const root = walk(ast, 0);

  const width = Math.max(cursor * (NODE_W + H_GAP), NODE_W) + 20;
  const depth = Math.max(...placed.map((p) => p.depth)) + 1;
  const height = depth * V_GAP + 24;

  const svg = el('svg', {
    class: 'ast',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'xMidYMin meet',
    style: `max-height:${height}px`,
  });

  const links = el('g', { class: 'ast-links' });
  for (const p of placed) {
    for (const k of p.kids) {
      links.append(el('path', {
        d: `M ${p.x} ${p.y + NODE_H / 2} C ${p.x} ${p.y + V_GAP / 2}, ${k.x} ${k.y - V_GAP / 2}, ${k.x} ${k.y - NODE_H / 2}`,
        class: 'ast-link', fill: 'none',
      }));
    }
  }
  svg.append(links);

  for (const p of placed) {
    const kind = p.node.type.toLowerCase();
    const g = el('g', {
      class: `ast-node ${kind}${selected === p.node.id ? ' selected' : ''}`,
      'data-ast': p.node.id,
      tabindex: 0,
    });
    g.append(el('rect', {
      x: p.x - NODE_W / 2, y: p.y - NODE_H / 2, width: NODE_W, height: NODE_H, rx: 6,
    }));
    const text = astLabel(p.node);
    g.append(el('text', {
      x: p.x, y: p.y + 4, 'text-anchor': 'middle',
    }, [text.length > 13 ? `${text.slice(0, 12)}…` : text]));
    g.append(el('title', {}, [`${p.node.type} — ${text}`]));
    if (onSelect) {
      g.addEventListener('click', () => onSelect(p.node));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(p.node); }
      });
    }
    svg.append(g);
  }

  host.append(svg);
  return svg;
}
