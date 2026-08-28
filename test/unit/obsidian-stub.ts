/**
 * Stands in for the `obsidian` module, which only exists inside the app.
 *
 * The plugin's own modules import it at load time, so a unit test cannot reach
 * any of them without one of these. Only what the parser actually calls is
 * modelled; everything else is present so that importing a module does not
 * fail, and will throw loudly rather than quietly answer wrong if a test starts
 * depending on it.
 */

export class Notice {
	constructor(public message: string) {}
	setMessage() {
		return this
	}
	hide() {}
}

/** Obsidian's normalizes slashes; the parser only ever passes it plain paths. */
export const normalizePath = (path: string) =>
	path
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/|\/$/g, '')

/**
 * Splits a link into its file and its subpath.
 *
 * Faithful for links without a `#`, which is the whole of what the tests use.
 * Obsidian also decodes escapes and normalises the path; a test that needs
 * either should stop using this stub rather than trust it.
 */
export const parseLinktext = (link: string) => {
	const hash = link.indexOf('#')
	return hash === -1 ? { path: link, subpath: '' } : { path: link.slice(0, hash), subpath: link.slice(hash) }
}

export const resolveSubpath = () => {
	throw new Error('resolveSubpath is not modelled: a test needing subpath links must drive the real app')
}

/** The plugin debounces one editor callback at module load; nothing under test calls it. */
export const debounce = <T extends unknown[]>(fn: (...args: T) => unknown) => {
	const debounced = (...args: T) => fn(...args)
	debounced.cancel = () => debounced
	debounced.run = () => undefined
	return debounced
}

export const getLanguage = () => 'en'

export const requestUrl = () => {
	throw new Error('requestUrl is not modelled: a test needing the network must drive the real app')
}

export const base64ToArrayBuffer = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer

export const Platform = { isMobile: false, isDesktop: true }

class Stub {}
export const Plugin = Stub
export const PluginSettingTab = Stub
export const Modal = Stub
export const FuzzySuggestModal = Stub
export const Setting = Stub
export const SliderComponent = Stub
