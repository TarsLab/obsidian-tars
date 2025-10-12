/**
 * Vitest setup file for mocking external dependencies
 */

import { vi } from 'vitest'

// Mock the entire obsidian module
vi.mock('obsidian', () => ({
	App: vi.fn(),
	Plugin: vi.fn(),
	Setting: vi.fn().mockImplementation(() => ({
		settingEl: { style: {} },
		setName: vi.fn().mockReturnThis(),
		setDesc: vi.fn().mockReturnThis(),
		addText: vi.fn().mockImplementation((callback) => {
			const textComponent = {
				setPlaceholder: vi.fn().mockReturnThis(),
				setValue: vi.fn().mockReturnThis(),
				onChange: vi.fn().mockReturnThis(),
				inputEl: { style: {} }
			}
			if (callback) callback(textComponent)
			return textComponent
		}),
		addButton: vi.fn().mockImplementation((callback) => {
			const buttonComponent = {
				setButtonText: vi.fn().mockReturnThis(),
				setClass: vi.fn().mockReturnThis(),
				setTooltip: vi.fn().mockReturnThis(),
				setWarning: vi.fn().mockReturnThis(),
				onClick: vi.fn().mockReturnThis(),
				setDisabled: vi.fn().mockReturnThis(),
				buttonEl: { textContent: '' }
			}
			if (callback) callback(buttonComponent)
			return buttonComponent
		}),
		addToggle: vi.fn().mockImplementation((callback) => {
			const toggleComponent = {
				setValue: vi.fn().mockReturnThis(),
				onChange: vi.fn().mockReturnThis()
			}
			if (callback) callback(toggleComponent)
			return toggleComponent
		})
	})),
	Notice: vi.fn(),
	setIcon: vi.fn(),
	Modal: vi.fn(),
	EditorSuggest: vi.fn(),
	PluginSettingTab: vi.fn()
}))

// Mock mcp-use since it's an external dependency
vi.mock('mcp-use', () => ({
	MCPClient: {
		fromDict: vi.fn().mockReturnValue({
			createSession: vi.fn().mockResolvedValue({
				connector: {
					tools: [{ name: 'test_tool', description: 'A test tool' }]
				},
				disconnect: vi.fn().mockResolvedValue(undefined)
			})
		})
	}
}))

// Mock DOM elements for testing
Object.defineProperty(window, 'HTMLElement', {
	value: class HTMLElement {
		style: any = {}
		textContent = ''
		innerHTML = ''

		createEl(_tagName: string, attrs?: any) {
			const el = new HTMLElement()
			if (attrs?.text) el.textContent = attrs.text
			if (attrs?.cls) (el as any).className = attrs.cls
			return el
		}

		createDiv(attrs?: any) {
			return this.createEl('div', attrs)
		}

		querySelector(selector: string) {
			// Simple mock implementation
			if (selector === 'input[type="text"]') {
				return { value: '', dispatchEvent: vi.fn() }
			}
			if (selector === 'textarea') {
				return { value: '', dispatchEvent: vi.fn() }
			}
			if (selector === 'input[type="checkbox"]') {
				return { checked: false, dispatchEvent: vi.fn() }
			}
			if (selector.includes('button')) {
				return { textContent: '', click: vi.fn() }
			}
			return null
		}

		querySelectorAll(_selector: string) {
			return []
		}

		setAttribute(name: string, value: string) {
			;(this as any)[name] = value
		}

		getAttribute(name: string) {
			return (this as any)[name]
		}

		addEventListener(event: string, handler: Function) {
			// Store handlers for testing
			if (!(this as any)._eventListeners) {
				;(this as any)._eventListeners = {}
			}
			if (!(this as any)._eventListeners[event]) {
				;(this as any)._eventListeners[event] = []
			}
			;(this as any)._eventListeners[event].push(handler)
		}

		dispatchEvent(event: Event) {
			const listeners = (this as any)._eventListeners?.[event.type] || []
			listeners.forEach((handler: Function) => handler(event))
		}

		empty() {
			this.innerHTML = ''
			this.textContent = ''
		}

		remove() {
			// Mock remove
		}

		insertBefore(_newEl: HTMLElement, _refEll: HTMLElement) {
			// Mock insert
		}
	}
})

Object.defineProperty(document, 'createElement', {
	value: (_tagName: string) => new (window as any).HTMLElement()
})

Object.defineProperty(navigator, 'clipboard', {
	value: {
		writeText: vi.fn().mockResolvedValue(undefined)
	}
})
