import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ChatMessage } from "../providers/types";
import type { PermissionMode } from "../config/types";
import {
  appendLine,
  ensureDir,
  exists,
  readJson,
  readText,
  removeDir,
  sha256,
  writeJson,
  writeText,
} from "../util/fs";
import { projectCheckpointsDir, projectSessionsDir } from "../config/paths";

export type SessionEventType =
  | "session_start"
  | "message"
  | "mode"
  | "model"
  | "usage"
  | "checkpoint"
  | "rewind"
  | "branch"
  | "note"
  | "compact"
  | "session_end";

export interface SessionEvent {
  seq: number;
  ts: string;
  type: SessionEventType;
  data: Record<string, unknown>;
}

export interface SessionMeta {
  id: string;
  title: string;
  cwd: string;
  model: string;
  mode: PermissionMode;
  agentMode?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface CheckpointManifest {
  id: string;
  label: string;
  ts: string;
  files: Array<{ path: string; existed: boolean; blob?: string; hash?: string; size?: number }>;
}

export class Session {
  messages: ChatMessage[] = [];
  events: SessionEvent[] = [];
  meta: SessionMeta;
  touchedFiles = new Set<string>();

  private constructor(
    readonly cwd: string,
    meta: SessionMeta,
    events: SessionEvent[],
  ) {
    this.meta = meta;
    this.events = events;
    this.rebuild();
  }

  get id(): string {
    return this.meta.id;
  }

  get dir(): string {
    return path.join(projectSessionsDir(this.cwd), this.id);
  }

  get eventsPath(): string {
    return path.join(this.dir, "events.jsonl");
  }

  get metaPath(): string {
    return path.join(this.dir, "meta.json");
  }

  static create(cwd: string, options: { model: string; mode: PermissionMode; title?: string; agentMode?: string }): Session {
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
    const now = new Date().toISOString();
    const meta: SessionMeta = {
      id,
      title: options.title ?? "untitled",
      cwd,
      model: options.model,
      mode: options.mode,
      agentMode: options.agentMode ?? "build",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };
    const dir = path.join(projectSessionsDir(cwd), id);
    ensureDir(dir);
    writeJson(path.join(dir, "meta.json"), meta);
    const session = new Session(cwd, meta, []);
    session.appendEvent("session_start", { model: options.model, mode: options.mode });
    session.updateIndex();
    return session;
  }

  static load(cwd: string, id: string): Session {
    const dir = path.join(projectSessionsDir(cwd), id);
    if (!exists(path.join(dir, "meta.json"))) throw new Error(`Session not found: ${id}`);
    const meta = readJson<SessionMeta>(path.join(dir, "meta.json"), {} as SessionMeta);
    const events = readEvents(path.join(dir, "events.jsonl"));
    return new Session(cwd, meta, events);
  }

  static list(cwd: string): SessionMeta[] {
    const indexFile = path.join(projectSessionsDir(cwd), "index.json");
    const index = readJson<SessionMeta[]>(indexFile, []);
    return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  static latest(cwd: string): Session | undefined {
    const first = Session.list(cwd)[0];
    if (!first) return undefined;
    return Session.load(cwd, first.id);
  }

  private rebuild(): void {
    this.messages = [];
    for (const event of this.events) {
      if (event.type === "message") {
        this.messages.push(event.data.message as ChatMessage);
      } else if (event.type === "mode") {
        if (event.data.mode === "ask" || event.data.mode === "auto" || event.data.mode === "full") {
          this.meta.mode = event.data.mode;
        }
        if (typeof event.data.agentMode === "string") {
          this.meta.agentMode = event.data.agentMode;
        }
      } else if (event.type === "model") {
        this.meta.model = event.data.model as string;
      }
    }
  }

  appendEvent(type: SessionEventType, data: Record<string, unknown>): SessionEvent {
    const event: SessionEvent = {
      seq: this.events.length + 1,
      ts: new Date().toISOString(),
      type,
      data,
    };
    ensureDir(this.dir);
    appendLine(this.eventsPath, JSON.stringify(event));
    this.events.push(event);
    this.meta.updatedAt = event.ts;
    writeJson(this.metaPath, this.meta);
    this.updateIndex();
    return event;
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.meta.messageCount = this.messages.length;
    if (message.role === "user" && this.meta.title === "untitled") {
      this.meta.title = message.content.replace(/\s+/g, " ").slice(0, 80);
      writeJson(this.metaPath, this.meta);
    }
    this.appendEvent("message", { message });
  }

  setMode(mode: PermissionMode): void {
    this.meta.mode = mode;
    this.appendEvent("mode", { mode });
  }

  setModel(model: string): void {
    this.meta.model = model;
    this.appendEvent("model", { model });
  }

  note(text: string): void {
    this.appendEvent("note", { text });
  }

  touch(file: string): void {
    this.touchedFiles.add(path.resolve(this.cwd, file));
  }

  createCheckpoint(label: string, files: string[]): string {
    const id = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
    const dir = path.join(projectCheckpointsDir(this.cwd), id);
    ensureDir(path.join(dir, "blobs"));
    const manifest: CheckpointManifest = { id, label, ts: new Date().toISOString(), files: [] };
    for (const file of [...new Set(files)]) {
      const abs = path.resolve(this.cwd, file);
      const rel = path.relative(this.cwd, abs);
      try {
        const stat = fs.statSync(abs);
        if (!stat.isFile()) continue;
        if (stat.size > 5 * 1024 * 1024) continue;
        const buffer = fs.readFileSync(abs);
        if (buffer.includes(0)) continue;
        const hash = sha256(buffer.toString("utf8"));
        writeText(path.join(dir, "blobs", hash), buffer.toString("utf8"));
        manifest.files.push({ path: rel, existed: true, blob: hash, hash, size: stat.size });
      } catch {
        manifest.files.push({ path: rel, existed: false });
      }
    }
    writeJson(path.join(dir, "manifest.json"), manifest);
    this.appendEvent("checkpoint", { id, label, files: manifest.files.map((file) => file.path) });
    return id;
  }

  listCheckpoints(): CheckpointManifest[] {
    const root = projectCheckpointsDir(this.cwd);
    if (!exists(root)) return [];
    const out: CheckpointManifest[] = [];
    for (const name of fs.readdirSync(root)) {
      const manifest = readJson<CheckpointManifest | null>(path.join(root, name, "manifest.json"), null);
      if (manifest) out.push(manifest);
    }
    return out.sort((a, b) => a.ts.localeCompare(b.ts));
  }

  restoreCheckpoint(id: string): number {
    const dir = path.join(projectCheckpointsDir(this.cwd), id);
    const manifest = readJson<CheckpointManifest | null>(path.join(dir, "manifest.json"), null);
    if (!manifest) throw new Error(`Checkpoint not found: ${id}`);
    let restored = 0;
    for (const file of manifest.files) {
      const abs = path.resolve(this.cwd, file.path);
      if (file.existed && file.blob) {
        writeText(abs, readText(path.join(dir, "blobs", file.blob)));
        restored++;
      } else {
        fs.rmSync(abs, { force: true });
      }
    }
    this.appendEvent("rewind", { checkpointId: id, restored });
    return restored;
  }

  undoLast(): { id: string; restored: number } | undefined {
    const checkpoints = this.listCheckpoints();
    if (checkpoints.length === 0) return undefined;
    const last = checkpoints[checkpoints.length - 1];
    const restored = this.restoreCheckpoint(last.id);
    removeDir(path.join(projectCheckpointsDir(this.cwd), last.id));
    return { id: last.id, restored };
  }

  branch(title?: string): Session {
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
    const meta: SessionMeta = {
      ...this.meta,
      id,
      title: title ?? `${this.meta.title} (branch)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const dir = path.join(projectSessionsDir(this.cwd), id);
    ensureDir(dir);
    writeJson(path.join(dir, "meta.json"), meta);
    const branch = new Session(this.cwd, meta, []);
    for (const event of this.events) branch.appendEvent(event.type, event.data);
    branch.appendEvent("branch", { from: this.id });
    return branch;
  }

  updateIndex(): void {
    const indexFile = path.join(projectSessionsDir(this.cwd), "index.json");
    const index = readJson<SessionMeta[]>(indexFile, []);
    const next = index.filter((entry) => entry.id !== this.meta.id);
    next.push(this.meta);
    writeJson(indexFile, next);
  }
}

function readEvents(file: string): SessionEvent[] {
  if (!exists(file)) return [];
  const lines = readText(file)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const events: SessionEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as SessionEvent);
    } catch {
      // skip malformed
    }
  }
  return events;
}
