"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const fs_1 = require("../util/fs");
const paths_1 = require("../config/paths");
class Session {
    cwd;
    messages = [];
    events = [];
    meta;
    touchedFiles = new Set();
    constructor(cwd, meta, events) {
        this.cwd = cwd;
        this.meta = meta;
        this.events = events;
        this.rebuild();
    }
    get id() {
        return this.meta.id;
    }
    get dir() {
        return node_path_1.default.join((0, paths_1.projectSessionsDir)(this.cwd), this.id);
    }
    get eventsPath() {
        return node_path_1.default.join(this.dir, "events.jsonl");
    }
    get metaPath() {
        return node_path_1.default.join(this.dir, "meta.json");
    }
    static create(cwd, options) {
        const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${node_crypto_1.default.randomBytes(3).toString("hex")}`;
        const now = new Date().toISOString();
        const meta = {
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
        const dir = node_path_1.default.join((0, paths_1.projectSessionsDir)(cwd), id);
        (0, fs_1.ensureDir)(dir);
        (0, fs_1.writeJson)(node_path_1.default.join(dir, "meta.json"), meta);
        const session = new Session(cwd, meta, []);
        session.appendEvent("session_start", { model: options.model, mode: options.mode });
        session.updateIndex();
        return session;
    }
    static load(cwd, id) {
        const dir = node_path_1.default.join((0, paths_1.projectSessionsDir)(cwd), id);
        if (!(0, fs_1.exists)(node_path_1.default.join(dir, "meta.json")))
            throw new Error(`Session not found: ${id}`);
        const meta = (0, fs_1.readJson)(node_path_1.default.join(dir, "meta.json"), {});
        const events = readEvents(node_path_1.default.join(dir, "events.jsonl"));
        return new Session(cwd, meta, events);
    }
    static list(cwd) {
        const indexFile = node_path_1.default.join((0, paths_1.projectSessionsDir)(cwd), "index.json");
        const index = (0, fs_1.readJson)(indexFile, []);
        return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    static latest(cwd) {
        const first = Session.list(cwd)[0];
        if (!first)
            return undefined;
        return Session.load(cwd, first.id);
    }
    rebuild() {
        this.messages = [];
        for (const event of this.events) {
            if (event.type === "message") {
                this.messages.push(event.data.message);
            }
            else if (event.type === "mode") {
                if (event.data.mode === "ask" || event.data.mode === "auto" || event.data.mode === "full") {
                    this.meta.mode = event.data.mode;
                }
                if (typeof event.data.agentMode === "string") {
                    this.meta.agentMode = event.data.agentMode;
                }
            }
            else if (event.type === "model") {
                this.meta.model = event.data.model;
            }
        }
    }
    appendEvent(type, data) {
        const event = {
            seq: this.events.length + 1,
            ts: new Date().toISOString(),
            type,
            data,
        };
        (0, fs_1.ensureDir)(this.dir);
        (0, fs_1.appendLine)(this.eventsPath, JSON.stringify(event));
        this.events.push(event);
        this.meta.updatedAt = event.ts;
        (0, fs_1.writeJson)(this.metaPath, this.meta);
        this.updateIndex();
        return event;
    }
    addMessage(message) {
        this.messages.push(message);
        this.meta.messageCount = this.messages.length;
        if (message.role === "user" && this.meta.title === "untitled") {
            this.meta.title = message.content.replace(/\s+/g, " ").slice(0, 80);
            (0, fs_1.writeJson)(this.metaPath, this.meta);
        }
        this.appendEvent("message", { message });
    }
    setMode(mode) {
        this.meta.mode = mode;
        this.appendEvent("mode", { mode });
    }
    setModel(model) {
        this.meta.model = model;
        this.appendEvent("model", { model });
    }
    note(text) {
        this.appendEvent("note", { text });
    }
    touch(file) {
        this.touchedFiles.add(node_path_1.default.resolve(this.cwd, file));
    }
    createCheckpoint(label, files) {
        const id = `${Date.now()}-${node_crypto_1.default.randomBytes(2).toString("hex")}`;
        const dir = node_path_1.default.join((0, paths_1.projectCheckpointsDir)(this.cwd), id);
        (0, fs_1.ensureDir)(node_path_1.default.join(dir, "blobs"));
        const manifest = { id, label, ts: new Date().toISOString(), files: [] };
        for (const file of [...new Set(files)]) {
            const abs = node_path_1.default.resolve(this.cwd, file);
            const rel = node_path_1.default.relative(this.cwd, abs);
            try {
                const stat = node_fs_1.default.statSync(abs);
                if (!stat.isFile())
                    continue;
                if (stat.size > 5 * 1024 * 1024)
                    continue;
                const buffer = node_fs_1.default.readFileSync(abs);
                if (buffer.includes(0))
                    continue;
                const hash = (0, fs_1.sha256)(buffer.toString("utf8"));
                (0, fs_1.writeText)(node_path_1.default.join(dir, "blobs", hash), buffer.toString("utf8"));
                manifest.files.push({ path: rel, existed: true, blob: hash, hash, size: stat.size });
            }
            catch {
                manifest.files.push({ path: rel, existed: false });
            }
        }
        (0, fs_1.writeJson)(node_path_1.default.join(dir, "manifest.json"), manifest);
        this.appendEvent("checkpoint", { id, label, files: manifest.files.map((file) => file.path) });
        return id;
    }
    listCheckpoints() {
        const root = (0, paths_1.projectCheckpointsDir)(this.cwd);
        if (!(0, fs_1.exists)(root))
            return [];
        const out = [];
        for (const name of node_fs_1.default.readdirSync(root)) {
            const manifest = (0, fs_1.readJson)(node_path_1.default.join(root, name, "manifest.json"), null);
            if (manifest)
                out.push(manifest);
        }
        return out.sort((a, b) => a.ts.localeCompare(b.ts));
    }
    restoreCheckpoint(id) {
        const dir = node_path_1.default.join((0, paths_1.projectCheckpointsDir)(this.cwd), id);
        const manifest = (0, fs_1.readJson)(node_path_1.default.join(dir, "manifest.json"), null);
        if (!manifest)
            throw new Error(`Checkpoint not found: ${id}`);
        let restored = 0;
        for (const file of manifest.files) {
            const abs = node_path_1.default.resolve(this.cwd, file.path);
            if (file.existed && file.blob) {
                (0, fs_1.writeText)(abs, (0, fs_1.readText)(node_path_1.default.join(dir, "blobs", file.blob)));
                restored++;
            }
            else {
                node_fs_1.default.rmSync(abs, { force: true });
            }
        }
        this.appendEvent("rewind", { checkpointId: id, restored });
        return restored;
    }
    undoLast() {
        const checkpoints = this.listCheckpoints();
        if (checkpoints.length === 0)
            return undefined;
        const last = checkpoints[checkpoints.length - 1];
        const restored = this.restoreCheckpoint(last.id);
        (0, fs_1.removeDir)(node_path_1.default.join((0, paths_1.projectCheckpointsDir)(this.cwd), last.id));
        return { id: last.id, restored };
    }
    branch(title) {
        const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${node_crypto_1.default.randomBytes(3).toString("hex")}`;
        const meta = {
            ...this.meta,
            id,
            title: title ?? `${this.meta.title} (branch)`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const dir = node_path_1.default.join((0, paths_1.projectSessionsDir)(this.cwd), id);
        (0, fs_1.ensureDir)(dir);
        (0, fs_1.writeJson)(node_path_1.default.join(dir, "meta.json"), meta);
        const branch = new Session(this.cwd, meta, []);
        for (const event of this.events)
            branch.appendEvent(event.type, event.data);
        branch.appendEvent("branch", { from: this.id });
        return branch;
    }
    updateIndex() {
        const indexFile = node_path_1.default.join((0, paths_1.projectSessionsDir)(this.cwd), "index.json");
        const index = (0, fs_1.readJson)(indexFile, []);
        const next = index.filter((entry) => entry.id !== this.meta.id);
        next.push(this.meta);
        (0, fs_1.writeJson)(indexFile, next);
    }
}
exports.Session = Session;
function readEvents(file) {
    if (!(0, fs_1.exists)(file))
        return [];
    const lines = (0, fs_1.readText)(file)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const events = [];
    for (const line of lines) {
        try {
            events.push(JSON.parse(line));
        }
        catch {
            // skip malformed
        }
    }
    return events;
}
//# sourceMappingURL=session.js.map