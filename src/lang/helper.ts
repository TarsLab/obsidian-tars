//Solution copied from obsidian-kanban: https://github.com/mgmeyers/obsidian-kanban/blob/main/src/lang/helpers.ts

import en from './locale/en'

const localeMap: { [k: string]: Partial<typeof en> } = { en }

export function getLocale(locale: string): Partial<typeof en> {
	return localeMap[locale] || localeMap['en']
}
