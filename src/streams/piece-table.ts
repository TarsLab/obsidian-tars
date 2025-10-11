// ──────────────────────────────────────────────
// Simple Piece Table Buffer Implementation

import type { TextBuffer } from './types'

// ──────────────────────────────────────────────
type Piece = { source: 'original' | 'added'; start: number; length: number }

export class SimplePieceTable implements TextBuffer {
	private original: string
	private added: string
	private pieces: Piece[]

	constructor(initial = '') {
		this.original = initial
		this.added = ''
		this.pieces = [{ source: 'original', start: 0, length: initial.length }]
	}

	insert(offset: number, text: string): void {
		if (!text) return

		let pos = 0
		let i = 0

		for (; i < this.pieces.length; i++) {
			const piece = this.pieces[i]
			if (pos + piece.length >= offset) break
			pos += piece.length
		}

		const piece = this.pieces[i]
		const innerOffset = offset - pos
		const newPiece: Piece = { source: 'added', start: this.added.length, length: text.length }
		this.added += text

		const newPieces: Piece[] = []

		if (piece) {
			if (innerOffset > 0) newPieces.push({ source: piece.source, start: piece.start, length: innerOffset })
			newPieces.push(newPiece)
			if (innerOffset < piece.length)
				newPieces.push({
					source: piece.source,
					start: piece.start + innerOffset,
					length: piece.length - innerOffset
				})
			this.pieces.splice(i, 1, ...newPieces)
		} else {
			this.pieces.push(newPiece)
		}
	}

	delete(offset: number, length: number): void {
		if (length <= 0) return

		let pos = 0
		const newPieces: typeof this.pieces = []

		for (const piece of this.pieces) {
			const end = pos + piece.length
			if (end <= offset || pos >= offset + length) {
				newPieces.push(piece)
			} else {
				const left = Math.max(0, offset - pos)
				const right = Math.max(0, end - (offset + length))
				if (left > 0) newPieces.push({ source: piece.source, start: piece.start, length: left })
				if (right > 0)
					newPieces.push({
						source: piece.source,
						start: piece.start + piece.length - right,
						length: right
					})
			}
			pos = end
		}

		this.pieces = newPieces
	}

	getText(): string {
		return this.pieces
			.map((p) =>
				p.source === 'original' ? this.original.substr(p.start, p.length) : this.added.substr(p.start, p.length)
			)
			.join('')
	}

	length(): number {
		return this.pieces.reduce((acc, p) => acc + p.length, 0)
	}
}
