/**
 * Utility Section Formatter
 *
 * Produces the [!llm] callout that summarizes provider/model information and
 * the list of MCP tools registered for the current prompt.
 */

export interface UtilitySectionServer {
	readonly serverName: string
	readonly toolNames: string[]
}

export interface UtilitySectionInfo {
	readonly providerName: string
	readonly modelName: string
	readonly servers: UtilitySectionServer[]
}

const normalizeText = (value: string | undefined | null, fallback: string): string => {
	if (!value) return fallback
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : fallback
}

/**
 * Format the utility section callout that gets written into the document.
 */
export const formatUtilitySectionCallout = (info: UtilitySectionInfo): string => {
	const provider = normalizeText(info.providerName, 'Unknown')
	const model = normalizeText(info.modelName, 'unknown')

	const serverSummaries = (info.servers || [])
		.map((server) => {
			const name = normalizeText(server.serverName, 'Server')
			const tools = (server.toolNames || [])
				.map((tool) => tool.trim())
				.filter((tool) => tool.length > 0)
			const toolList = tools.length > 0 ? tools.join(', ') : 'none'
			return `${name}:(${toolList})`
		})
		.filter((summary) => summary.length > 0)

	const toolsSummary = serverSummaries.length > 0 ? serverSummaries.join(', ') : 'none'

	return `\n> [!llm] ${provider} model: ${model}\n> Tools: ${toolsSummary}\n\n`
}

export default formatUtilitySectionCallout
