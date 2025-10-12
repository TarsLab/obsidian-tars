/**
 * TextEditStream: Generic, concurrent, anchor-aware text editing stream.
 * ---------------------------------------------------------------
 *
 * ## Requirements:
 * - Represents text as a stream supporting efficient insert, delete, and replace operations.
 * - Allows creation of invisible in-memory Anchors (points) that move automatically as text changes.
 * - Supports Ranges (two Anchors) for span-based modifications (replace/delete segments).
 * - Enables multiple asynchronous actors (LLM, server, user/editor) to safely edit the same text concurrently.
 * - Locks are managed per-anchor or per-range to allow parallel operations without race conditions.
 * - Provides bounded history with snapshot compaction for long sessions.
 * - Stream-compatible: can pipe/read/write like any Node.js Duplex stream.
 * - Designed for Electron/Obsidian environments (no worker threads, purely async event loop).
 * - Lock implementation is abstracted and replaceable (SimpleAsyncLock by default).
 * - Internal buffer implemented as a lightweight, dependency-free SimplePieceTable.
 *
 * ## Responsibilities:
 * - Manage internal text buffer for fast text manipulation.
 * - Track Anchors and Ranges; auto-adjust positions as text changes.
 * - Serialize concurrent edits using LockMap (keyed locks per anchor/range).
 * - Support atomic operations: insertRelative(), replaceRange(), deleteRange().
 * - Emit change/snapshot events for reactive systems or persistence.
 * - Provide serialization (getText, toJSON) for saving state.
 */

import { Duplex } from 'node:stream'
import { LockMap } from './async-lock'
import { SimplePieceTable } from './piece-table'
import type { Anchor, Range, TextBuffer, TextChange } from './types'

// ──────────────────────────────────────────────
// TextEditStream Implementation
// ──────────────────────────────────────────────
export class TextEditStream extends Duplex {
	private readonly buffer: TextBuffer
	private readonly anchors: Anchor[] = []
	private readonly lockMap: LockMap

	private history: TextChange[] = []
	private readonly maxHistory = 500

	constructor(initial = '', lockMap = new LockMap()) {
		super({ decodeStrings: false })
		this.buffer = new SimplePieceTable(initial)
		this.lockMap = lockMap
	}

	// ─── Anchor Management ──────────────────────
	addAnchor(id: string, position: number) {
		const anchor = { id, position }
		this.anchors.push(anchor)
		return anchor
	}

	findAnchor(id: string): Anchor {
		const a = this.anchors.find((a) => a.id === id)
		if (!a) throw new Error(`Anchor ${id} not found`)
		return a
	}

	shiftAnchors(from: number, delta: number) {
		this.anchors.forEach((a) => {
			if (a.position >= from) a.position += delta
		})
	}

	// ─── Core Editing Operations ─────────────────
	async applyChange(actor: string, anchorId: string, text: string, offset?: number | ((anchor: Anchor) => number)) {
		const lock = this.lockMap.get(anchorId)
		await lock.runExclusive(async () => {
			const anchor = this.findAnchor(anchorId)
			const resolvedOffset = this.resolveOffset(anchor, offset)
			this.buffer.insert(resolvedOffset, text)

			const delta = text.length
			this.shiftAnchors(resolvedOffset, delta)

			this.history.push({ actor, anchor: anchorId, text, timestamp: Date.now() })
			if (this.history.length > this.maxHistory) this.snapshot()
			this.emit('change', { actor, anchorId, text })
		})
	}

	private resolveOffset(anchor: Anchor, offset?: number | ((anchor: Anchor) => number)) {
		let resolved: number
		if (typeof offset === 'function') resolved = offset(anchor)
		else if (typeof offset === 'number') resolved = offset
		else resolved = anchor.position
		const length = this.buffer.length()
		if (resolved < 0) return 0
		if (resolved > length) return length
		return resolved
	}

	async replaceRange(actor: string, range: Range, text: string) {
		const lock = this.lockMap.get(`${range.start.id}:${range.end.id}`)
		await lock.runExclusive(async () => {
			const start = range.start.position
			const end = range.end.position
			const len = end - start

			if (len > 0) this.buffer.delete(start, len)
			this.buffer.insert(start, text)

			const delta = text.length - len
			this.shiftAnchors(end, delta)

			this.history.push({ actor, anchor: `${range.start.id}->${range.end.id}`, text, timestamp: Date.now() })
			this.emit('change', { actor, range, text })
		})
	}

	async deleteRange(actor: string, range: Range) {
		await this.replaceRange(actor, range, '')
	}

	insertRelative(actor: string, anchorId: string, text: string, position: 'before' | 'after' = 'after') {
		return this.applyChange(actor, anchorId, text, (anchor) =>
			position === 'before' ? anchor.position : anchor.position + 1
		)
	}

	// ─── Maintenance and Serialization ───────────
	private snapshot() {
		const text = this.buffer.getText()
		this.history = []
		this.emit('snapshot', { length: text.length })
	}

	getText(): string {
		return this.buffer.getText()
	}

	_read() {
		this.push(this.getText())
		this.push(null)
	}
	_write(chunk: string, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
		this.buffer.insert(this.buffer.length(), chunk)
		cb()
	}

	toJSON() {
		return { text: this.getText(), anchors: this.anchors }
	}
}
