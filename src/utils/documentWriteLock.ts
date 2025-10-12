import { Mutex } from 'async-mutex'

export class DocumentWriteLock {
	private mutex = new Mutex()

	async runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
		return this.mutex.runExclusive(fn)
	}
}

export const runWithLock = async <T>(lock: DocumentWriteLock | undefined, fn: () => T | Promise<T>): Promise<T> => {
	if (!lock) {
		return await Promise.resolve(fn())
	}
	return await lock.runExclusive(fn)
}
