/**
 * MCP Server Integration Errors
 * Custom error classes for MCP server operations
 */

export class MCPError extends Error {
	public readonly code: string
	public readonly details?: unknown
	public readonly timestamp: number

	constructor(message: string, code: string, details?: unknown) {
		super(message)
		this.name = this.constructor.name
		this.code = code
		this.details = details
		this.timestamp = Date.now()
	}
}

export class ConnectionError extends MCPError {
	constructor(message: string, details?: unknown) {
		super(message, 'CONNECTION_ERROR', details)
	}
}

export class ToolNotFoundError extends MCPError {
	constructor(toolName: string, serverName: string) {
		super(`Tool '${toolName}' not found on server '${serverName}'`, 'TOOL_NOT_FOUND', { toolName, serverName })
	}
}

export class ValidationError extends MCPError {
	constructor(message: string, details?: unknown) {
		super(message, 'VALIDATION_ERROR', details)
	}
}

export class TimeoutError extends MCPError {
	constructor(timeoutMs: number, operation: string) {
		super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', { timeoutMs, operation })
	}
}

export class ExecutionLimitError extends MCPError {
	constructor(
		limitType: 'concurrent' | 'session',
		current: number,
		limit: number,
		context: Record<string, unknown> = {}
	) {
		const normalizedLimit = limit < 0 ? '∞' : `${limit}`
		const limitLabel = `${limitType.charAt(0).toUpperCase() + limitType.slice(1)} limit reached: ${current}/${normalizedLimit}`
		super(limitLabel, 'EXECUTION_LIMIT_ERROR', { limitType, current, limit, ...context })
	}
}

export class DockerError extends MCPError {
	constructor(message: string, containerId?: string, details?: unknown) {
		super(message, 'DOCKER_ERROR', {
			containerId,
			...(typeof details === 'object' && details !== null ? details : { details })
		})
	}
}

export class ServerNotAvailableError extends MCPError {
	constructor(serverName: string, reason: string) {
		super(`Server '${serverName}' is not available: ${reason}`, 'SERVER_NOT_AVAILABLE', { serverName, reason })
	}
}

export class ToolExecutionError extends MCPError {
	constructor(toolName: string, serverName: string, originalError: Error) {
		super(
			`Tool '${toolName}' execution failed on server '${serverName}': ${originalError.message}`,
			'TOOL_EXECUTION_ERROR',
			{
				toolName,
				serverName,
				originalError: originalError.message
			}
		)
	}
}

export class YAMLParseError extends MCPError {
	constructor(lineNumber?: number, details?: unknown) {
		const message = lineNumber ? `YAML parsing failed at line ${lineNumber}` : 'YAML parsing failed'
		super(message, 'YAML_PARSE_ERROR', {
			lineNumber,
			...(typeof details === 'object' && details !== null ? details : { details })
		})
	}
}

// Error type guards
export function isMCPError(error: unknown): error is MCPError {
	return error instanceof Error && 'code' in error && 'timestamp' in error
}

export function isConnectionError(error: unknown): error is ConnectionError {
	return isMCPError(error) && error.code === 'CONNECTION_ERROR'
}

export function isTimeoutError(error: unknown): error is TimeoutError {
	return isMCPError(error) && error.code === 'TIMEOUT_ERROR'
}

export function isExecutionLimitError(error: unknown): error is ExecutionLimitError {
	return isMCPError(error) && error.code === 'EXECUTION_LIMIT_ERROR'
}
