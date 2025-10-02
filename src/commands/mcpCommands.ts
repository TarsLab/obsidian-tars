/**
 * MCP-specific commands for tool execution control and history
 */

import { type Command, Notice } from 'obsidian'
import type { ToolExecutor } from '../mcp/executor'
import type { ExecutionHistoryEntry } from '../mcp/types'

/**
 * Command to stop all active MCP tool executions
 */
export function stopExecutionsCommand(executor: ToolExecutor): Command {
	return {
		id: 'mcp-stop-executions',
		name: 'MCP: Stop Executions',
		callback: () => {
			executor.stop()
			new Notice('MCP tool execution stopped')
		}
	}
}

/**
 * Command to show MCP execution history in a modal
 */
export function showExecutionHistoryCommand(executor: ToolExecutor): Command {
	return {
		id: 'mcp-show-history',
		name: 'MCP: Show Execution History',
		callback: () => {
			const history = executor.getHistory()

			if (history.length === 0) {
				new Notice('No MCP execution history')
				return
			}

			// Format history for display
			const historyText = history
				.map((entry: ExecutionHistoryEntry, index: number) => {
					const timestamp = new Date(entry.timestamp).toLocaleString()
					const status = entry.status === 'success' ? '✓' : '✗'
					return `${index + 1}. ${status} ${entry.serverName}/${entry.toolName} - ${entry.duration}ms (${timestamp})`
				})
				.join('\n')

			new Notice(`MCP Execution History:\n${historyText}`, 10000)
		}
	}
}

/**
 * Command to reset MCP session limits
 */
export function resetSessionLimitsCommand(executor: ToolExecutor): Command {
	return {
		id: 'mcp-reset-limits',
		name: 'MCP: Reset Session Limits',
		callback: () => {
			executor.reset()
			new Notice('MCP session limits reset')
		}
	}
}

/**
 * Export all MCP commands
 */
export function getMCPCommands(executor: ToolExecutor): Command[] {
	return [stopExecutionsCommand(executor), showExecutionHistoryCommand(executor), resetSessionLimitsCommand(executor)]
}
