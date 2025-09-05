import { App, TFile, TFolder } from 'obsidian'

/**
 * Resolves file paths relative to the currently active file's context in Obsidian vault.
 *
 * Path Resolution Logic:
 * 1. Uses the active file's parent directory as the base context
 * 2. Handles special path formats:
 *    - "." → Returns the parent directory of active file
 *    - "./filename" → Resolves relative to parent directory (removes ./ and prepends parent path)
 *    - "filename" (no slash) → If not in root, prepends parent directory path
 *    - "folder/filename" → Uses as-is (absolute path within vault)
 *
 * Examples (assuming active file is at "docs/notes/current.md"):
 * - "." → "docs/notes"
 * - "./test.md" → "docs/notes/test.md"
 * - "test.md" → "docs/notes/test.md"
 * - "other/file.md" → "other/file.md"
 *
 * @param app - Obsidian App instance for accessing workspace and vault
 * @param path - Input path to resolve (can be relative or absolute)
 * @returns Resolved absolute path within the vault
 * @throws Error if no active file is available for context
 */
export const resolveAbstractPath = (app: App, path: string): string => {
	const activeFile = app.workspace.getActiveFile()
	if (!activeFile) throw new Error('No active file')

	const isRoot = activeFile.parent?.isRoot()
	const parentPath = activeFile.parent?.path || app.vault.getRoot().path

	// Handle special paths
	if (path === '.') {
		return parentPath
	}

	// Handle relative paths, obsidian vault doesn't support relative format
	if (path.startsWith('./')) {
		return isRoot ? path.slice(1) : parentPath + path.slice(1)
	}

	// If path is just a filename and not in root, prioritize parent directory
	if (!path.includes('/') && !isRoot) {
		path = parentPath + '/' + path
	}

	return path
}

/**
 * Automatically appends .md extension to file paths that don't have any file extension.
 */
export const resolveFilePath = (abstractPath: string): string => {
	// Check if path has no file extension (no dot in the filename part)
	const lastSlashIndex = abstractPath.lastIndexOf('/')
	const filename = lastSlashIndex === -1 ? abstractPath : abstractPath.substring(lastSlashIndex + 1)

	if (!filename.includes('.')) {
		return `${abstractPath}.md`
	}
	return abstractPath
}

/**
 * Resolves a path to its corresponding file or folder object in the Obsidian vault.
 *
 * Resolution Strategy:
 * 1. First resolves the input path using active file context (resolveAbstractPath)
 * 2. Attempts to find the file/folder using the resolved path directly
 * 3. If not found and path has no extension, tries adding .md extension
 * 4. Returns the found TFile/TFolder object or an error message
 *
 * Auto-resolution Features:
 * - Handles relative paths (./filename) and simple filenames
 * - Automatically tries .md extension for extensionless files
 * - Supports both files and directories
 * - Provides detailed error information
 *
 * @param app - Obsidian App instance for vault access
 * @param path - Input path (can be relative, absolute, or simple filename)
 * @returns Object containing either found file/folder or error message
 */
export const findFileOrFolder = (app: App, path: string): { file?: TFile; folder?: TFolder; error?: string } => {
	try {
		const basePath = resolveAbstractPath(app, path)

		let found = app.vault.getAbstractFileByPath(basePath)
		if (found) {
			if (found instanceof TFile) return { file: found }
			if (found instanceof TFolder) return { folder: found }
		}

		const filePath = resolveFilePath(basePath)
		if (filePath !== basePath) {
			found = app.vault.getAbstractFileByPath(filePath)
			if (found) {
				console.debug(`Auto-resolved ${path} to ${filePath}`)
				if (found instanceof TFile) return { file: found }
				if (found instanceof TFolder) return { folder: found }
			}
		}

		return { error: `File or directory not found: ${path}` }
	} catch (error) {
		return { error: `Failed to access path: ${error.message}` }
	}
}

export const findFile = (app: App, path: string): { file?: TFile; finalPath?: string; error?: string } => {
	try {
		const basePath = resolveAbstractPath(app, path)
		const finalPath = resolveFilePath(basePath)
		const file = app.vault.getFileByPath(finalPath)
		return file ? { file, finalPath } : { error: `File not found: ${path}` }
	} catch (error) {
		return { error: `Failed to access path: ${error.message}` }
	}
}
