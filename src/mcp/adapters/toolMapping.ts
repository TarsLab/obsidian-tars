import type { MCPServerManager } from '../managerMCPUse'
import type { ToolServerInfo } from '../types'

export async function buildToolServerMapping(manager: MCPServerManager): Promise<Map<string, ToolServerInfo>> {
	const mapping = new Map<string, ToolServerInfo>()
	const servers = manager.listServers()

	for (const server of servers) {
		if (!server.enabled) continue

		const client = manager.getClient(server.id)
		if (!client) continue

		try {
			const tools = await client.listTools()
			for (const tool of tools) {
				if (!mapping.has(tool.name)) {
					mapping.set(tool.name, {
						id: server.id,
						name: server.name
					})
				}
			}
		} catch (error) {
			console.error(`Failed to list tools for ${server.name}:`, error)
		}
	}

	return mapping
}
