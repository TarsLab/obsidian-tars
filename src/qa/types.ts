export interface PromptTemplate {
	readonly title: string | null
	readonly template: string
}

export const BASIC_PROMPT_TEMPLATE: PromptTemplate = {
	title: null,
	template: '{{s}}'
}

export const HARD_LINE_BREAK = '  \n' // 两个空格加换行符, hard line break in markdown
