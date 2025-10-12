declare module 'style-mod' {
	export interface StyleSpec {
		[selector: string]: string | StyleSpec | null | undefined
	}

	export class StyleModule {
		constructor(spec: StyleSpec)
		mount(root: HTMLElement): void
		destroy(): void
	}

	export default StyleModule
}
