import { normalizePath } from 'obsidian'
import { APP_FOLDER } from 'src/settings'
import { CreatePlainText, SendRequest } from '.'

interface TextWithTime {
	readonly text: string
	readonly time: number
}

interface ResponseWithTime {
	readonly lastMsg: string
	readonly createdAt: string
	readonly texts: TextWithTime[]
}

export const withStreamLogging = (originalFunc: SendRequest, createPlainText: CreatePlainText): SendRequest => {
	return async function* (messages, controller, resolveEmbedAsBinary, saveAttachment) {
		const startTime = Date.now()
		const texts: TextWithTime[] = []
		try {
			for await (const text of originalFunc(messages, controller, resolveEmbedAsBinary, saveAttachment)) {
				const currentTime = Date.now()
				texts.push({ text, time: currentTime - startTime })
				yield text
			}
		} finally {
			const lastMsg = messages[messages.length - 1]
			// eslint-disable-next-line no-control-regex
			const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F\u007F-\u009F]/g
			const brief = lastMsg.content.slice(0, 20).replace(ILLEGAL_FILENAME_CHARS, '').trim() || 'untitled'

			const filePath = normalizePath(`${APP_FOLDER}/${formatDate(new Date())}-${brief}.json`)
			const response: ResponseWithTime = {
				lastMsg: messages[messages.length - 1].content.trim(),
				createdAt: new Date().toISOString(),
				texts
			}
			await createPlainText(filePath, JSON.stringify(response, null, 2))
			console.debug('Response logged to:', filePath)
		}
	}
}

const formatDate = (date: Date): string => {
	const pad = (num: number) => num.toString().padStart(2, '0')

	const year = date.getFullYear().toString().slice(-2) // Get last two digits of the year
	const month = pad(date.getMonth() + 1)
	const day = pad(date.getDate())
	const hours = pad(date.getHours())
	const minutes = pad(date.getMinutes())

	return `${year}${month}${day}-${hours}${minutes}`
}
