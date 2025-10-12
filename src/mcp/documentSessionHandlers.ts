import type { App, EventRef, TFile, WorkspaceLeaf } from 'obsidian'
import type { ToolExecutor } from './executor'

export function registerDocumentSessionHandlers(
	app: App,
	executor: ToolExecutor,
	register: (ref: EventRef) => void
): void {
	const handleActiveLeafChange = (leaf: WorkspaceLeaf | null) => {
		if (!leaf) {
			return
		}

		const viewType = leaf.view?.getViewType?.()
		if (viewType !== 'markdown') {
			return
		}

		const file = app.workspace.getActiveFile()
		if (file) {
			executor.switchDocument(file.path)
		}
	}

	const activeLeafRef = app.workspace.on('active-leaf-change', handleActiveLeafChange)
	register(activeLeafRef)

	const handleFileDelete = (file: TFile | { path: string; extension?: string }) => {
		if (!file || typeof file.path !== 'string') {
			return
		}

		if (typeof (file as TFile).extension === 'string') {
			executor.clearDocumentSession(file.path)
		}
	}

	const deleteRef = app.vault.on('delete', handleFileDelete)
	register(deleteRef)

	const initialFile = app.workspace.getActiveFile()
	if (initialFile) {
		executor.switchDocument(initialFile.path)
	}
}
