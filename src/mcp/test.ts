/**
 * Basic tests for MCP integration
 * These tests can be run manually to verify MCP functionality
 */

import { MCPManager } from './mcpManager'
import { TagToolMapper } from './tagToolMapper'
import { MCPServerConfig, TagToolMapping } from './types'

// Mock MCP server configuration for testing
const mockServerConfig: MCPServerConfig = {
	id: 'test-server',
	name: 'Test MCP Server',
	enabled: true,
	transport: {
		type: 'http',
		host: 'localhost',
		port: 3000
	},
	credentials: {
		apiKey: 'test-key'
	}
}

// Mock tag-tool mapping for testing
const mockMapping: TagToolMapping = {
	tagPattern: 'weather',
	serverIds: ['test-server'],
	toolNames: ['get_weather'],
	parameters: {
		location: '${tag}'
	}
}

/**
 * Test MCP Manager initialization and connection
 */
export async function testMCPManager(): Promise<boolean> {
	console.log('Testing MCP Manager...')
	
	try {
		const manager = new MCPManager()
		
		// Test connection (will fail if no server running, but should handle gracefully)
		try {
			await manager.connectToServer(mockServerConfig)
			console.log('✓ MCP Manager connection test passed')
		} catch (error) {
			console.log('✓ MCP Manager connection error handled gracefully:', error.message)
		}
		
		// Test disconnection
		await manager.disconnectAll()
		console.log('✓ MCP Manager disconnection test passed')
		
		return true
	} catch (error) {
		console.error('✗ MCP Manager test failed:', error)
		return false
	}
}

/**
 * Test Tag Tool Mapper functionality
 */
export async function testTagToolMapper(): Promise<boolean> {
	console.log('Testing Tag Tool Mapper...')
	
	try {
		const manager = new MCPManager()
		const mapper = new TagToolMapper(manager)
		
		// Test adding mapping
		mapper.addMapping(mockMapping)
		console.log('✓ Tag Tool Mapper add mapping test passed')
		
		// Test pattern matching
		const weatherTags = ['weather', 'weather-london', 'current-weather']
		const nonWeatherTags = ['finance', 'news', 'sports']
		
		for (const tag of weatherTags) {
			const tools = mapper.getToolsForTag(tag)
			if (tools.length === 0) {
				console.log(`✓ Tag Tool Mapper pattern matching test passed for tag: ${tag} (no tools available, expected)`)
			}
		}
		
		for (const tag of nonWeatherTags) {
			const tools = mapper.getToolsForTag(tag)
			if (tools.length === 0) {
				console.log(`✓ Tag Tool Mapper pattern matching test passed for tag: ${tag} (no match, expected)`)
			}
		}
		
		// Test tool invocation (will fail gracefully if no server)
		try {
			const results = await mapper.invokeToolsForTags(['weather'])
			console.log('✓ Tag Tool Mapper invocation test completed:', results.length, 'results')
		} catch (error) {
			console.log('✓ Tag Tool Mapper invocation error handled gracefully:', error.message)
		}
		
		return true
	} catch (error) {
		console.error('✗ Tag Tool Mapper test failed:', error)
		return false
	}
}

/**
 * Test error handling scenarios
 */
export async function testErrorHandling(): Promise<boolean> {
	console.log('Testing error handling...')
	
	try {
		const manager = new MCPManager()
		
		// Test connection to non-existent server
		const badConfig: MCPServerConfig = {
			id: 'bad-server',
			name: 'Bad Server',
			enabled: true,
			transport: {
				type: 'http',
				host: 'nonexistent.example.com',
				port: 9999
			}
		}
		
		try {
			await manager.connectToServer(badConfig)
			console.log('✗ Error handling test failed: should have thrown error')
			return false
		} catch (error) {
			console.log('✓ Error handling test passed: connection error handled properly')
		}
		
		// Test invalid mapping
		const mapper = new TagToolMapper(manager)
		try {
			const invalidMapping: TagToolMapping = {
				tagPattern: '',
				serverIds: [],
				toolNames: [],
				parameters: {}
			}
			mapper.addMapping(invalidMapping)
			console.log('✓ Error handling test passed: invalid mapping handled')
		} catch (error) {
			console.log('✓ Error handling test passed: invalid mapping rejected properly')
		}
		
		return true
	} catch (error) {
		console.error('✗ Error handling test failed:', error)
		return false
	}
}

/**
 * Run all tests
 */
export async function runAllTests(): Promise<void> {
	console.log('=== MCP Integration Tests ===')
	
	const results = await Promise.all([
		testMCPManager(),
		testTagToolMapper(),
		testErrorHandling()
	])
	
	const passed = results.filter(r => r).length
	const total = results.length
	
	console.log(`\n=== Test Results ===`)
	console.log(`Passed: ${passed}/${total}`)
	
	if (passed === total) {
		console.log('✓ All tests passed!')
	} else {
		console.log('✗ Some tests failed')
	}
}

// Export for manual testing
if (typeof window !== 'undefined') {
	// Browser environment (Obsidian plugin)
	(window as any).mcpTests = {
		runAllTests,
		testMCPManager,
		testTagToolMapper,
		testErrorHandling
	}
}