/**
 * The notes the parser tests are written against.
 *
 * Kept apart from the tests so the same text can be fed to a running Obsidian
 * and its real metadata compared with `parseDoc`'s — the check that the fixture
 * builder models the app rather than the tests' hopes. See docs/manual-testing.md.
 */
export const FIXTURES: Record<string, string> = {
	simple: `#我 : 1+1=?

#DeepSeek : 等于 2。

#我 : 为什么?
`,
	system: `#系统 : 你是一个数学老师。

#我 : 1+1=?

#DeepSeek : 等于 2。
`,
	callout: `#我 : 讲讲勾股定理

> [!note]
> #我 : 这一句不该发出去

#DeepSeek : 直角三角形两条直角边的平方和等于斜边的平方。
`,
	newChat: `#我 : 第一个问题

#DeepSeek : 第一个回答

#新对话

#我 : 第二个问题

#DeepSeek : 第二个回答
`,
	code: `#我 : 这段代码是什么意思?

\`\`\`python
# 注释里的 #DeepSeek 不是标签
print(1)
\`\`\`

#DeepSeek : 它打印 1。
`,
	multiParagraph: `#我 : 第一段。

第二段，同一条消息。

#DeepSeek : 好的。
`,
	embed: `#我 : 这张图里是什么? ![[试卷.png]]

#DeepSeek : 一道应用题。
`,
	link: `#我 : 请总结 [[笔记]] 的内容

#DeepSeek : 好的。
`
}
