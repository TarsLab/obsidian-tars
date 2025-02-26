import { App, Editor, EditorSelection } from 'obsidian'
import { t } from 'src/lang/helper'

export const getEditorSelection = (editor: Editor): EditorSelection => {
	const selections = editor.listSelections()
	if (selections.length === 0) {
		throw new Error('No selection')
	} else if (selections.length > 1) {
		throw new Error('Multiple selections')
	}
	const selection = selections[0]
	return selection
}

export const refineSelection = (app: App, editor: Editor): EditorSelection => {
	const selection = getEditorSelection(editor)
	console.debug('anchor', selection.anchor)
	console.debug('head', selection.head)

	const sections = getSections(app)
	if (!sections) {
		console.debug('No sections')
		throw new Error('No sections')
	}

	const anchorOffset = editor.posToOffset(selection.anchor)
	const headOffset = editor.posToOffset(selection.head)

	const [frontOffset, backOffset] = anchorOffset < headOffset ? [anchorOffset, headOffset] : [headOffset, anchorOffset]

	const overlappingSections = sections.filter(
		(s) => frontOffset <= s.position.end.offset && s.position.start.offset <= backOffset
	)

	if (overlappingSections.length === 0) {
		console.debug('No overlapping sections')
		const cursor = editor.getCursor()
		// select the whole line
		return {
			anchor: {
				line: cursor.line,
				ch: 0
			},
			head: {
				line: cursor.line,
				ch: editor.getLine(cursor.line).length
			}
		}
	}
	return {
		anchor: {
			line: overlappingSections[0].position.start.line,
			ch: overlappingSections[0].position.start.col
		},
		head: {
			line: overlappingSections[overlappingSections.length - 1].position.end.line,
			ch: overlappingSections[overlappingSections.length - 1].position.end.col
		}
	}
}

const getSections = (app: App) => {
	const activeFile = app.workspace.getActiveFile()
	if (!activeFile) {
		throw new Error('No active file')
	}
	const fileMeta = app.metadataCache.getFileCache(activeFile)
	if (!fileMeta) {
		throw new Error(t('Waiting for metadata to be ready. Please try again.'))
	}
	return fileMeta.sections
}
