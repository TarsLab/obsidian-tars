import { PluginSettings } from 'src/settings'
import { TagRole, toNewChatMark, toSpeakMark } from 'src/suggest'

export interface TagCmdMeta {
	id: string
	name: string
	tag: string
	role: TagRole
}

const toCommandId = (type: TagRole, tag: string) => `${type}#${tag}`
const splitCommandId = (commandId: string) => {
	const [type, tag] = commandId.split('#')
	return { type, tag }
}

export const getTagCmdIdsFromSettings = (settings: PluginSettings) => {
	const newChatTagCmdIds = settings.newChatTags.map((tag) => toCommandId('newChat', tag))
	const systemTagCmdIds = settings.systemTags.map((tag) => toCommandId('system', tag))
	const userTagCmdIds = settings.userTags.map((tag) => toCommandId('user', tag))
	const asstTagCmdIds = settings.providers.map((tag) => toCommandId('assistant', tag.tag))
	return [...newChatTagCmdIds, ...systemTagCmdIds, ...userTagCmdIds, ...asstTagCmdIds]
}

export const getMeta = (commandId: string): TagCmdMeta => {
	const { type, tag } = splitCommandId(commandId)
	return {
		id: commandId,
		name: toCommandName(type as TagRole, tag),
		tag,
		role: type as TagRole
	}
}

const toCommandName = (type: TagRole, tag: string) => (type === 'newChat' ? toNewChatMark(tag) : toSpeakMark(tag))
