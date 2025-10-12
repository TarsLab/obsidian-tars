// ──────────────────────────────────────────────
// Lock Implementations

import { Mutex } from 'async-mutex'
import type { AsyncLock } from './types'

// ──────────────────────────────────────────────
export class SimpleAsyncLock implements AsyncLock {
	private mutex = new Mutex()

	async acquire(): Promise<() => void> {
		return await this.mutex.acquire()
	}

	async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
		return this.mutex.runExclusive(fn)
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
