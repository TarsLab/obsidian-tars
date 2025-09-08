// Mock implementation of Obsidian API for testing
export class App {}
export class Editor {}
export class EditorPosition {}
export class EmbedCache {}
export class LinkCache {}
export class MetadataCache {}
export class ReferenceCache {}
export class SectionCache {}
export class TagCache {}
export class Vault {}

export const debounce = (fn: Function, delay: number) => fn
export const normalizePath = (path: string) => path
export const parseLinktext = (text: string) => ({ path: text, subpath: '' })
export const resolveSubpath = (cache: any, subpath: string) => null

// Mock other Obsidian exports as needed
export default {}