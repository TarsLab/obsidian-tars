//Solution copied from obsidian-kanban: https://github.com/mgmeyers/obsidian-kanban/blob/main/src/lang/helpers.ts

import en from './locale/en'
import zhCN from './locale/zh-cn'
import zhTW from './locale/zh-tw'

const localeMap: { [k: string]: Partial<typeof en> } = { en, 'zh-TW': zhTW, zh: zhCN }

const lang = window.localStorage.getItem('language')
const locale = localeMap[lang || 'en']

export function t(str: keyof typeof en): string {
	if (!locale) {
		console.error('Error: locale not found', lang)
	}

	return (locale && locale[str]) || en[str]
}
