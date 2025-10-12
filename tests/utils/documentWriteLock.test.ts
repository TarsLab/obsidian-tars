import { describe, expect, it } from 'vitest'

import { DocumentWriteLock } from '../../src/utils/documentWriteLock'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('DocumentWriteLock', () => {
	it('executes queued tasks sequentially', async () => {
		const lock = new DocumentWriteLock()
		const order: number[] = []

		await Promise.all([
			lock.runExclusive(async () => {
				order.push(1)
				await delay(20)
				order.push(2)
			}),
			lock.runExclusive(async () => {
				order.push(3)
				await delay(5)
				order.push(4)
			})
		])

		expect(order).toEqual([1, 2, 3, 4])
	})
})
