//Solution copied from obsidian-kanban: https://github.com/mgmeyers/obsidian-kanban/blob/main/src/lang/helpers.ts

import { createLogger } from '../logger'
import en from './locale/en'
import zhCN from './locale/zh-cn'
import zhTW from './locale/zh-tw'

const logger = createLogger('lang:helper')

const localeMap: { [k: string]: Partial<typeof en> } = { en, 'zh-TW': zhTW, zh: zhCN }

const lang = window.localStorage.getItem('language')
const locale = localeMap[lang || 'en']

export function t(str: keyof typeof en): string {
	if (!locale) {
		logger.error('locale not found', { lang })
	}

	return locale?.[str] || en[str]
}
