// One bytecode program, two machines.
//
// The comparison is only meaningful if both engines run the same instructions,
// so the AST is compiled once and handed to both. What differs is purely the
// scheduling: the backtracking VM explores one path at a time and unwinds on
// failure, while the Thompson simulation advances every reachable instruction
// in lockstep and never visits the same (instruction, position) pair twice.
//
// That single difference is the whole of ReDoS.

import * as CS from './charset.js';

export const OP = {
  CHAR: 'char',
  SPLIT: 'split',
  JMP: 'jmp',
  MATCH: 'match',
  ASSERT: 'assert',
  SAVE: 'save',
  PROGRESS: 'progress',
};

// ---------------------------------------------------------------- compiling

class Program {
  constructor() {
    this.code = [];
    this.loopSlots = 0;
    this.saveSlots = 0;
  }

  emit(instr) {
    this.code.push(instr);
    return this.code.length - 1;
  }

  get here() { return this.code.length; }
}

function emitNode(p, node) {
  switch (node.type) {
    case 'Empty':
      return;
    case 'Char':
      p.emit({ op: OP.CHAR, set: node.set, label: node.display, astId: node.id });
      return;
    case 'Anchor':
      p.emit({ op: OP.ASSERT, kind: node.kind, astId: node.id });
      return;
    case 'Concat':
      for (const part of node.parts) emitNode(p, part);
      return;
    case 'Group': {
      if (!node.capturing) { emitNode(p, node.node); return; }
      const slot = (node.index - 1) * 2;
      p.saveSlots = Math.max(p.saveSlots, slot + 2);
      p.emit({ op: OP.SAVE, slot, astId: node.id });
      emitNode(p, node.node);
      p.emit({ op: OP.SAVE, slot: slot + 1, astId: node.id });
      return;
    }
    case 'Alt': {
      // Chain of splits, last option needs no split of its own.
      const jumps = [];
      for (let i = 0; i < node.options.length; i++) {
        const last = i === node.options.length - 1;
        if (last) {
          emitNode(p, node.options[i]);
        } else {
          const sp = p.emit({ op: OP.SPLIT, x: 0, y: 0, astId: node.id });
          p.code[sp].x = p.here;
          emitNode(p, node.options[i]);
          jumps.push(p.emit({ op: OP.JMP, x: 0, astId: node.id }));
          p.code[sp].y = p.here;
        }
      }
      for (const j of jumps) p.code[j].x = p.here;
      return;
    }
    case 'Repeat':
      emitRepeat(p, node);
      return;
    default:
      throw new Error(`Cannot compile ${node.type}`);
  }
}

// A star or plus whose body can match the empty string would loop forever in
// the backtracker. The PROGRESS instruction records the position at loop entry
// and fails the iteration if the body consumed nothing, which is how real
// engines avoid hanging on `(a*)*`.
function emitStar(p, node, inner, greedy) {
  const slot = p.loopSlots++;
  const top = p.here;
  const sp = p.emit({ op: OP.SPLIT, x: 0, y: 0, astId: node.id });
  const body = p.here;
  p.emit({ op: OP.PROGRESS, slot, mode: 'mark', astId: node.id });
  emitNode(p, inner);
  p.emit({ op: OP.PROGRESS, slot, mode: 'check', astId: node.id });
  p.emit({ op: OP.JMP, x: top, astId: node.id });
  const after = p.here;
  p.code[sp].x = greedy ? body : after;
  p.code[sp].y = greedy ? after : body;
}

function emitPlus(p, node, inner, greedy) {
  const slot = p.loopSlots++;
  const body = p.here;
  p.emit({ op: OP.PROGRESS, slot, mode: 'mark', astId: node.id });
  emitNode(p, inner);
  p.emit({ op: OP.PROGRESS, slot, mode: 'check', astId: node.id });
  const sp = p.emit({ op: OP.SPLIT, x: 0, y: 0, astId: node.id });
  const after = p.here;
  p.code[sp].x = greedy ? body : after;
  p.code[sp].y = greedy ? after : body;
}

function emitOpt(p, node, inner, greedy) {
  const sp = p.emit({ op: OP.SPLIT, x: 0, y: 0, astId: node.id });
  const body = p.here;
  emitNode(p, inner);
  const after = p.here;
  p.code[sp].x = greedy ? body : after;
  p.code[sp].y = greedy ? after : body;
}

function emitRepeat(p, node) {
  const { min, max, node: inner, lazy } = node;
  const greedy = !lazy;

  if (min === 0 && max === Infinity) return emitStar(p, node, inner, greedy);
  if (min === 1 && max === Infinity) return emitPlus(p, node, inner, greedy);
  if (min === 0 && max === 1) return emitOpt(p, node, inner, greedy);
  if (max === 0) return;

  for (let i = 0; i < min; i++) emitNode(p, inner);
  if (max === Infinity) { emitStar(p, node, inner, greedy); return; }

  // (max - min) nested optionals, so stopping early is legal at every step.
  const splits = [];
  for (let i = 0; i < max - min; i++) {
    const sp = p.emit({ op: OP.SPLIT, x: 0, y: 0, astId: node.id });
    p.code[sp].x = greedy ? p.here : 0;
    splits.push(sp);
    emitNode(p, inner);
  }
  const after = p.here;
  for (const sp of splits) {
    if (greedy) p.code[sp].y = after;
    else { p.code[sp].y = p.code[sp].x; p.code[sp].x = after; }
  }
}

export function compileProgram(ast) {
  const p = new Program();
  emitNode(p, ast);
  p.emit({ op: OP.MATCH });
  return { code: p.code, loopSlots: p.loopSlots, saveSlots: p.saveSlots };
}

export function disassemble(program) {
  return program.code.map((ins, i) => {
    switch (ins.op) {
      case OP.CHAR: return `${i}  char ${CS.label(ins.set, { maxParts: 2 })}`;
      case OP.SPLIT: return `${i}  split ${ins.x}, ${ins.y}`;
      case OP.JMP: return `${i}  jmp ${ins.x}`;
      case OP.MATCH: return `${i}  match`;
      case OP.ASSERT: return `${i}  assert ${ins.kind === 'start' ? '^' : '$'}`;
      case OP.SAVE: return `${i}  save ${ins.slot}`;
      case OP.PROGRESS: return `${i}  ${ins.mode === 'mark' ? 'mark' : 'check'} loop${ins.slot}`;
      default: return `${i}  ?`;
    }
  });
}

// ------------------------------------------------------- backtracking engine

export const DEFAULT_BUDGET = 2_000_000;

export class BacktrackVM {
  constructor(program, input, { budget = DEFAULT_BUDGET } = {}) {
    this.program = program;
    this.chars = Array.from(input).map((c) => c.codePointAt(0));
    this.budget = budget;
    this.reset();
  }

  reset() {
    const regCount = this.program.saveSlots + this.program.loopSlots;
    this.pc = 0;
    this.sp = 0;
    this.regs = new Int32Array(regCount).fill(-1);
    this.stack = [];
    this.steps = 0;
    this.maxStackDepth = 0;
    this.status = 'running'; // running | matched | failed | budget
    this.lastAction = null;
  }

  backtrack() {
    if (this.stack.length === 0) { this.status = 'failed'; return; }
    const frame = this.stack.pop();
    this.pc = frame.pc;
    this.sp = frame.sp;
    this.regs = frame.regs;
  }

  // One instruction. Returns false once the machine has stopped.
  step() {
    if (this.status !== 'running') return false;
    if (this.steps >= this.budget) { this.status = 'budget'; return false; }
    this.steps++;

    const ins = this.program.code[this.pc];
    switch (ins.op) {
      case OP.CHAR: {
        const cp = this.chars[this.sp];
        if (cp !== undefined && CS.contains(ins.set, cp)) {
          this.lastAction = { kind: 'consume', at: this.sp, astId: ins.astId };
          this.sp++;
          this.pc++;
        } else {
          this.lastAction = { kind: 'reject', at: this.sp, astId: ins.astId };
          this.backtrack();
        }
        break;
      }
      case OP.SPLIT:
        this.stack.push({ pc: ins.y, sp: this.sp, regs: this.regs.slice() });
        this.maxStackDepth = Math.max(this.maxStackDepth, this.stack.length);
        this.lastAction = { kind: 'split', at: this.sp, astId: ins.astId };
        this.pc = ins.x;
        break;
      case OP.JMP:
        this.lastAction = { kind: 'jump', at: this.sp, astId: ins.astId };
        this.pc = ins.x;
        break;
      case OP.SAVE:
        this.regs[ins.slot] = this.sp;
        this.pc++;
        break;
      case OP.PROGRESS:
        if (ins.mode === 'mark') {
          this.regs[this.program.saveSlots + ins.slot] = this.sp;
          this.pc++;
        } else if (this.regs[this.program.saveSlots + ins.slot] === this.sp) {
          // The body matched empty; taking the loop again would not terminate.
          this.lastAction = { kind: 'reject', at: this.sp, astId: ins.astId };
          this.backtrack();
        } else {
          this.pc++;
        }
        break;
      case OP.ASSERT: {
        const ok = ins.kind === 'start' ? this.sp === 0 : this.sp === this.chars.length;
        this.lastAction = { kind: ok ? 'assert' : 'reject', at: this.sp, astId: ins.astId };
        if (ok) this.pc++;
        else this.backtrack();
        break;
      }
      case OP.MATCH:
        // Whole-string semantics: reaching MATCH early is not a match.
        if (this.sp === this.chars.length) {
          this.status = 'matched';
          this.lastAction = { kind: 'match', at: this.sp };
        } else {
          this.lastAction = { kind: 'reject', at: this.sp };
          this.backtrack();
        }
        break;
      default:
        throw new Error(`Unknown opcode ${ins.op}`);
    }
    return this.status === 'running';
  }

  run() {
    while (this.step());
    return this.result();
  }

  // Run at most `n` instructions, so a pathological pattern can be animated
  // rather than freezing the page.
  runSlice(n) {
    for (let i = 0; i < n && this.step(); i++);
    return this.status;
  }

  result() {
    return {
      engine: 'backtracking',
      matched: this.status === 'matched',
      exhausted: this.status === 'budget',
      steps: this.steps,
      maxStackDepth: this.maxStackDepth,
    };
  }
}

// ---------------------------------------------------- Thompson simulation

// Advances every reachable instruction in lockstep. The `seen` set is the
// whole trick: an instruction is added at most once per input position, so the
// work is bounded by (program length x input length) no matter what the
// pattern looks like.
export function runThompson(program, input, { budget = DEFAULT_BUDGET } = {}) {
  const chars = Array.from(input).map((c) => c.codePointAt(0));
  const n = program.code.length;
  let steps = 0;
  let maxThreads = 0;
  let overBudget = false;

  const seen = new Int32Array(n).fill(-1);
  let generation = 0;

  const addThread = (list, pc, sp) => {
    const stack = [pc];
    while (stack.length) {
      const at = stack.pop();
      if (seen[at] === generation) continue;
      seen[at] = generation;
      steps++;
      if (steps > budget) { overBudget = true; return; }

      const ins = program.code[at];
      switch (ins.op) {
        case OP.SPLIT:
          // Pushed in reverse so x is explored first, matching the VM's order.
          stack.push(ins.y, ins.x);
          break;
        case OP.JMP:
          stack.push(ins.x);
          break;
        case OP.SAVE:
          stack.push(at + 1);
          break;
        case OP.PROGRESS:
          // The seen set already makes a zero-consumption cycle impossible, so
          // the empty-loop guard is unnecessary here.
          stack.push(at + 1);
          break;
        case OP.ASSERT: {
          const ok = ins.kind === 'start' ? sp === 0 : sp === chars.length;
          if (ok) stack.push(at + 1);
          break;
        }
        default:
          list.push(at); // CHAR or MATCH: waits for the next input character
      }
    }
  };

  let current = [];
  addThread(current, 0, 0);
  maxThreads = Math.max(maxThreads, current.length);

  let matched = false;
  for (let sp = 0; sp <= chars.length && !overBudget; sp++) {
    const cp = chars[sp];
    const next = [];
    generation++;
    for (const pc of current) {
      const ins = program.code[pc];
      if (ins.op === OP.MATCH) {
        if (sp === chars.length) matched = true;
      } else if (ins.op === OP.CHAR && cp !== undefined && CS.contains(ins.set, cp)) {
        addThread(next, pc + 1, sp + 1);
      }
    }
    current = next;
    maxThreads = Math.max(maxThreads, current.length);
    if (current.length === 0) break;
  }

  return {
    engine: 'thompson',
    matched,
    exhausted: overBudget,
    steps,
    maxThreads,
  };
}
