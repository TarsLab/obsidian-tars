import { TFile } from 'obsidian'
import { describe, expect, it } from 'vitest'
import {
	conversationSections,
	conversationTags,
	extractConversation,
	extractConversationsTextOnly,
	extractTaggedBlocks,
	getMsgPositionByLine,
	RunEnv
} from '../../src/editor'
import { FIXTURES } from './fixtures'
import { parseDoc } from './markdown'

/**
 * The tag parser, which is what turns a note into the messages a provider is
 * sent. Every fixture goes through `conversationTags`/`conversationSections`
 * first, exactly as `buildRunEnv` does, so what is under test is the whole path
 * from a note's metadata to a conversation.
 */

const OPTIONS = {
	newChatTags: ['NewChat', '新对话'],
	userTags: ['User', '我'],
	assistantTags: ['DeepSeek', 'Claude'],
	systemTags: ['System', '系统'],
	enableInternalLink: false,
	enableInternalLinkForAssistantMsg: false,
	enableDefaultSystemMsg: false,
	defaultSystemMsg: '',
	enableStreamLog: false
}

/** A vault of `path -> text`, enough for the internal-link cases. */
const envFor = (
	text: string,
	options: Partial<typeof OPTIONS> = {},
	vaultFiles: Record<string, string> = {}
): RunEnv => {
	const doc = parseDoc(text)
	const fileFor = (path: string) => ({ path, basename: path.replace(/\.md$/, '') }) as TFile
	return {
		appMeta: {
			getFirstLinkpathDest: (linkpath: string) => {
				const path = linkpath.endsWith('.md') ? linkpath : linkpath + '.md'
				return path in vaultFiles ? fileFor(path) : null
			},
			getFileCache: () => ({ sections: [], headings: [] })
		},
		vault: {
			cachedRead: (file: TFile) => Promise.resolve(vaultFiles[file.path])
		},
		fileText: text,
		filePath: 'note.md',
		tags: conversationTags(doc.tags, doc.sections),
		sections: conversationSections(doc.sections),
		links: doc.links,
		embeds: doc.embeds,
		options: { ...OPTIONS, ...options },
		saveAttachment: () => Promise.resolve(),
		resolveEmbed: () => Promise.resolve(new ArrayBuffer(0)),
		createPlainText: () => Promise.resolve()
	} as unknown as RunEnv
}

const conversationOf = (text: string, options?: Partial<typeof OPTIONS>, files?: Record<string, string>) =>
	extractConversation(envFor(text, options, files), 0, text.length)

const roleAndContent = (messages: { role: string; content: string }[]) =>
	messages.map((m) => [m.role, m.content] as const)

describe('extractTaggedBlocks', () => {
	it('gives every tag its role', () => {
		const text = FIXTURES.system
		const blocks = extractTaggedBlocks(envFor(text), 0, text.length)
		expect(blocks.map((b) => b.role)).toEqual(['system', 'user', 'assistant'])
	})

	it('matches tags without regard to case', () => {
		const text = '#DEEPSEEK : 大写也该触发\n'
		const blocks = extractTaggedBlocks(envFor(text), 0, text.length)
		expect(blocks.map((b) => b.role)).toEqual(['assistant'])
	})

	it('ignores a tag that names no role', () => {
		const text = '#我 : 带 #项目 标签的一句话\n\n#DeepSeek : 好的。\n'
		const blocks = extractTaggedBlocks(envFor(text), 0, text.length)
		// #项目 neither becomes a message nor splits the one it sits in.
		expect(blocks.map((b) => b.role)).toEqual(['user', 'assistant'])
	})

	// The `+2` in extractTaggedBlocks counts the " :" after the tag but not the
	// space after the colon, so a content range opens one character early. Every
	// message is trimmed afterwards and none of them shows it; `getMsgPositionByLine`
	// is not, and its selection carries the space (see below). Pinned as it stands
	// rather than corrected here — closing it moves what the "select message at
	// cursor" command hands back.
	it('opens the content range on the space that follows the colon', () => {
		const text = FIXTURES.simple
		const blocks = extractTaggedBlocks(envFor(text), 0, text.length)
		expect(text.slice(blocks[0].contentRange[0], blocks[0].contentRange[1])).toBe(' 1+1=?\n')
	})
})

describe('extractConversation', () => {
	it('reads an exchange in order', async () => {
		expect(roleAndContent(await conversationOf(FIXTURES.simple))).toEqual([
			['user', '1+1=?'],
			['assistant', '等于 2。'],
			['user', '为什么?']
		])
	})

	it('keeps every paragraph of a message that spans several', async () => {
		expect(roleAndContent(await conversationOf(FIXTURES.multiParagraph))).toEqual([
			['user', '第一段。\n\n第二段，同一条消息。'],
			['assistant', '好的。']
		])
	})

	it('starts at the last new-chat tag', async () => {
		expect(roleAndContent(await conversationOf(FIXTURES.newChat))).toEqual([
			['user', '第二个问题'],
			['assistant', '第二个回答']
		])
	})

	it('leaves out what is written in a callout', async () => {
		const messages = await conversationOf(FIXTURES.callout)
		expect(roleAndContent(messages)).toEqual([
			['user', '讲讲勾股定理'],
			['assistant', '直角三角形两条直角边的平方和等于斜边的平方。']
		])
		// The callout holds a #我 of its own; had it been read, it would have
		// become a third message and pushed the assistant's answer out of turn.
		expect(messages.every((m) => !m.content.includes('不该发出去'))).toBe(true)
	})

	it('does not take a tag inside a code block for a message', async () => {
		const messages = await conversationOf(FIXTURES.code)
		expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
		expect(messages[0].content).toContain('#DeepSeek 不是标签')
	})

	it('attaches an embed to the message it was written in', async () => {
		const messages = await conversationOf(FIXTURES.embed)
		expect(messages[0].embeds?.map((e) => e.link)).toEqual(['试卷.png'])
		expect(messages[1].embeds).toBeUndefined()
	})
})

describe('internal links', () => {
	const files = { '笔记.md': '笔记的正文。' }

	it('leaves the link as written when the setting is off', async () => {
		const messages = await conversationOf(FIXTURES.link, { enableInternalLink: false }, files)
		expect(messages[0].content).toBe('请总结 [[笔记]] 的内容')
	})

	it('replaces the link with the note it points at when the setting is on', async () => {
		const messages = await conversationOf(FIXTURES.link, { enableInternalLink: true }, files)
		expect(messages[0].content).toBe('请总结 笔记的正文。 的内容')
	})

	it('follows links in an assistant message only when told to', async () => {
		const text = '#我 : 见 [[笔记]]\n\n#DeepSeek : 也见 [[笔记]]\n'
		const both = { enableInternalLink: true, enableInternalLinkForAssistantMsg: true }
		expect((await conversationOf(text, { ...both, enableInternalLinkForAssistantMsg: false }, files))[1].content).toBe(
			'也见 [[笔记]]'
		)
		expect((await conversationOf(text, both, files))[1].content).toBe('也见 笔记的正文。')
	})
})

describe('extractConversationsTextOnly', () => {
	it('splits the note into one conversation per new-chat tag', async () => {
		const conversations = await extractConversationsTextOnly(envFor(FIXTURES.newChat))
		expect(conversations.map((c) => c.map((m) => m.content))).toEqual([
			['第一个问题', '第一个回答'],
			['第二个问题', '第二个回答']
		])
	})
})

describe('getMsgPositionByLine', () => {
	it('returns the range of the message the line falls in', () => {
		const text = FIXTURES.simple
		const env = envFor(text)
		const [start, end] = getMsgPositionByLine(env, 2) // the assistant's line
		// Leading space: the same off-by-one as the content range above, and here
		// nothing trims it away — the selection this hands back includes it.
		expect(text.slice(start, end)).toBe(' 等于 2。')
	})

	it('reports no message above the first tag', () => {
		const text = '前言\n\n#我 : 问题\n'
		expect(getMsgPositionByLine(envFor(text), 0)).toEqual([-1, -1])
	})
})
