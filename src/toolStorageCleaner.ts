import { Vault } from 'obsidian'
import { TOOLS_DIRECTORY } from './settings'

// 验证日期格式
export const isValidDate = (dateStr: string): boolean => {
	return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr))
}

// 清理过期文件
export const cleanupExpiredFiles = async (vault: Vault, retentionDays: number = 30): Promise<void> => {
	try {
		const cutoffDate = new Date()
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
		const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

		if (!(await vault.adapter.exists(TOOLS_DIRECTORY))) {
			return
		}

		const files = await vault.adapter.list(TOOLS_DIRECTORY)
		let cleanedCount = 0

		for (const file of files.files) {
			if (file.endsWith('.jsonl')) {
				const dateStr = file.replace('.jsonl', '')

				if (isValidDate(dateStr) && dateStr < cutoffDateStr) {
					await vault.adapter.remove(`${TOOLS_DIRECTORY}/${file}`)
					cleanedCount++
					console.log(`Cleaned up expired tool result file: ${file}`)
				}
			}
		}

		if (cleanedCount > 0) {
			console.log(`Tool storage cleanup completed: ${cleanedCount} files removed`)
		}
	} catch (error) {
		console.error('Tool storage cleanup failed:', error)
	}
}

// 获取存储统计信息
export const getStorageStats = async (
	vault: Vault
): Promise<{ totalFiles: number; totalSizeKB: number; oldestFile: string }> => {
	if (!(await vault.adapter.exists(TOOLS_DIRECTORY))) {
		return { totalFiles: 0, totalSizeKB: 0, oldestFile: '' }
	}

	const files = await vault.adapter.list(TOOLS_DIRECTORY)
	let totalSizeKB = 0
	let oldestFile = ''
	let totalFiles = 0

	for (const file of files.files) {
		if (file.endsWith('.jsonl')) {
			totalFiles++

			const stat = await vault.adapter.stat(`${TOOLS_DIRECTORY}/${file}`)
			if (stat) {
				totalSizeKB += Math.round(stat.size / 1024)
			}

			const dateStr = file.replace('.jsonl', '')
			if (isValidDate(dateStr)) {
				if (!oldestFile || dateStr < oldestFile.replace('.jsonl', '')) {
					oldestFile = file
				}
			}
		}
	}
	return { totalFiles, totalSizeKB, oldestFile }
}

// 启动时自动清理
export const startupCleanup = (vault: Vault, retentionDays: number): void => {
	// 延迟执行，避免影响启动性能
	setTimeout(() => {
		cleanupExpiredFiles(vault, retentionDays)
	}, 5000)
}
