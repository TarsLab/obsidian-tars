/**
 * Document session handler registration tests
 *
 * Ensures plugin registers workspace/vault listeners that keep the
 * ToolExecutor scoped to the active Obsidian document.
 */

import type { App, EventRef, TFile, WorkspaceLeaf } from 'obsidian'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecutor } from '../../src/mcp'
import { registerDocumentSessionHandlers } from '../../src/mcp/documentSessionHandlers'

describe('registerDocumentSessionHandlers', () => {
	let mockExecutor: ToolExecutor
	let mockRegister: ReturnType<typeof vi.fn>
	let app: App
	let currentFile: TFile | null
	let leafCallback: ((leaf: WorkspaceLeaf | null) => void) | undefined
	let deleteCallback: ((file: TFile | { path: string; extension?: string }) => void) | undefined

	beforeEach(() => {
		currentFile = {
			path: 'initial.md',
			name: 'initial.md',
			extension: 'md'
		} as unknown as TFile

		mockExecutor = {
			switchDocument: vi.fn(),
			clearDocumentSession: vi.fn(),
			resetSessionCount: vi.fn(),
			getTotalSessionCount: vi.fn()
		} as unknown as ToolExecutor

		mockRegister = vi.fn()

		leafCallback = undefined
		deleteCallback = undefined

		const workspaceOn = vi.fn((event: string, callback: (leaf: WorkspaceLeaf | null) => void) => {
			if (event === 'active-leaf-change') {
				leafCallback = callback
			}

			return { event } as unknown as EventRef
		})

		const vaultOn = vi.fn((event: string, callback: (file: TFile | { path: string; extension?: string }) => void) => {
			if (event === 'delete') {
				deleteCallback = callback
			}

			return { event } as unknown as EventRef
		})

		app = {
			workspace: {
				on: workspaceOn,
				getActiveFile: () => currentFile
			},
			vault: {
				on: vaultOn
			}
		} as unknown as App
	})

	it('registers handlers and immediately scopes to active document', () => {
		registerDocumentSessionHandlers(app, mockExecutor, mockRegister)

		expect(mockRegister).toHaveBeenCalledTimes(2)
		expect(mockExecutor.switchDocument).toHaveBeenCalledWith('initial.md')
	})

	it('updates executor context when markdown leaf becomes active', () => {
		registerDocumentSessionHandlers(app, mockExecutor, mockRegister)

		expect(leafCallback).toBeDefined()
		currentFile = {
			path: 'second.md',
			name: 'second.md',
			extension: 'md'
		} as unknown as TFile

		leafCallback?.({
			view: {
				getViewType: () => 'markdown'
			}
		} as unknown as WorkspaceLeaf)

		expect(mockExecutor.switchDocument).toHaveBeenLastCalledWith('second.md')
	})

	it('ignores non-markdown leaf changes', () => {
		registerDocumentSessionHandlers(app, mockExecutor, mockRegister)

		expect(leafCallback).toBeDefined()

		leafCallback?.({
			view: {
				getViewType: () => 'canvas'
			}
		} as unknown as WorkspaceLeaf)

		expect(mockExecutor.switchDocument).toHaveBeenCalledTimes(1)
	})

	it('clears document session when file deleted', () => {
		registerDocumentSessionHandlers(app, mockExecutor, mockRegister)

		expect(deleteCallback).toBeDefined()

		deleteCallback?.({
			path: 'remove.md',
			extension: 'md'
		})

		expect(mockExecutor.clearDocumentSession).toHaveBeenCalledWith('remove.md')
	})

	it('ignores delete events without file metadata', () => {
		registerDocumentSessionHandlers(app, mockExecutor, mockRegister)

		deleteCallback?.({ path: 'folder/', extension: undefined })

		expect(mockExecutor.clearDocumentSession).not.toHaveBeenCalledWith('folder/')
	})
})
