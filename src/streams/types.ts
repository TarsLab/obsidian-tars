// ──────────────────────────────────────────────
// Interfaces

// ──────────────────────────────────────────────
export interface AsyncLock {
	runExclusive<T>(fn: () => Promise<T> | T): Promise<T>
}

export interface TextBuffer {
	insert(offset: number, text: string): void
	delete(offset: number, length: number): void
	getText(): string
	length(): number
}

// ──────────────────────────────────────────────
// Anchors and Ranges
// ──────────────────────────────────────────────

export interface Anchor {
	id: string
	position: number
}

export class Range implements Record<symbol, unknown> {
	readonly start: Anchor
	readonly end: Anchor;
	[key: symbol]: unknown

	constructor(start: Anchor, end: Anchor, extras: Record<string, unknown> = {}) {
		if (start.position > end.position) throw new Error('Range start must be <= end position')

		this.start = start
		this.end = end

		Object.entries(extras).forEach(([key, value]) => {
			this[Symbol(key)] = value
		})
	}

	get length(): number {
		return this.end.position - this.start.position
	}
}

export interface TextChange {
	actor: string
	anchor: string
	text: string
	timestamp: number
}
