import type { MCPServerManager } from '../managerMCPUse'

export async function buildToolServerMapping(manager: MCPServerManager): Promise<Map<string, string>> {
	const mapping = new Map<string, string>()
	const servers = manager.listServers()

	for (const server of servers) {
		if (!server.enabled) continue

		const client = manager.getClient(server.id)
		if (!client) continue

		try {
			const tools = await client.listTools()
			for (const tool of tools) {
				if (!mapping.has(tool.name)) {
					mapping.set(tool.name, server.id)
				}
			}
		} catch (error) {
			console.error(`Failed to list tools for ${server.name}:`, error)
		}
	}

	return mapping
}
