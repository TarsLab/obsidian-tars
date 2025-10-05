import type { MCPServerManager } from '../managerMCPUse'
import type { ToolServerInfo } from '../types'

export async function buildToolServerMapping(manager: MCPServerManager): Promise<Map<string, ToolServerInfo>> {
	const cache = manager.getToolDiscoveryCache()
	return cache.getToolMapping()
}
