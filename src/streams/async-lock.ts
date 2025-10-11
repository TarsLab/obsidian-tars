// ──────────────────────────────────────────────
// Lock Implementations

import type { AsyncLock } from './types'

// ──────────────────────────────────────────────
export class SimpleAsyncLock implements AsyncLock {
	private _pending: (() => void)[] = []
	private _locked = false

	async acquire(): Promise<() => void> {
		if (!this._locked) {
			this._locked = true
			return () => this._release()
		}
		return new Promise((resolve) => {
			this._pending.push(() => {
				this._locked = true
				resolve(() => this._release())
			})
		})
	}

	private _release() {
		const next = this._pending.shift()
		if (next) next()
		else this._locked = false
	}

	async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
		const release = await this.acquire()
		try {
			return await fn()
		} finally {
			release()
		}
	}
}

export class LockMap {
	private locks = new Map<string, AsyncLock>()
	constructor(private factory = () => new SimpleAsyncLock()) {}

	get(key: string): AsyncLock {
		let lock = this.locks.get(key)
		if (!lock) {
			lock = this.factory()
			this.locks.set(key, lock)
		}
		return lock
	}
}
