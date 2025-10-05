import Debug from 'debug'

const ROOT_NAMESPACE = 'tars'

type LogHandler = (...args: any[]) => void

const rootLogger = Debug(ROOT_NAMESPACE)

export interface Logger {
	debug: LogHandler
	info: LogHandler
	warn: LogHandler
	error: LogHandler
}

export const createLogger = (namespace?: string): Logger => {
	const base = namespace ? rootLogger.extend(namespace) : rootLogger
	return {
		debug: base.extend('debug'),
		info: base.extend('info'),
		warn: (...args: any[]) => {
			const logger = base.extend('warn')
			;(logger as any)(...args)
			console.warn(...args)
		},
		error: (...args: any[]) => {
			const logger = base.extend('error')
			;(logger as any)(...args)
			console.error(...args)
		}
	}
}
