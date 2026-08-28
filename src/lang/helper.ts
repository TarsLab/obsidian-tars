//Solution copied from obsidian-kanban: https://github.com/mgmeyers/obsidian-kanban/blob/main/src/lang/helpers.ts

import { getLanguage } from 'obsidian'

import en from './locale/en'
import zhCN from './locale/zh-cn'
import zhTW from './locale/zh-tw'

const localeMap: { [k: string]: Partial<typeof en> } = { en, 'zh-TW': zhTW, zh: zhCN }

const lang = getLanguage()
const locale = localeMap[lang]

/** Every string the plugin can show. Anything holding one for later is typed by it. */
export type LocaleKey = keyof typeof en

export function t(str: LocaleKey): string {
	if (!locale) {
		console.error('Error: locale not found', lang)
	}

	return (locale && locale[str]) || en[str]
}
