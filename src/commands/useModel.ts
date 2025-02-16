import { App, Notice, Menu, MarkdownView } from "obsidian"
import { t } from "src/lang/helper"
import { PluginSettings } from "src/settings"
import { buildRunEnv, fetchConversation, insertText } from "src/editor"
import { generateWithModel } from "src/suggest"

export const useModelCmd = (app: App, settings: PluginSettings) => ({
    id: 'answer-with-selected-model',
    name: t('Answer with Selected Model'), 
    callback: async () => {
        const activeView = app.workspace.getActiveViewOfType(MarkdownView)
        if (!activeView) {
            new Notice(t('Please open a file'))
            return
        }

        const editor = activeView.editor
        const cursor = editor.getCursor()
        
        // 获取可用的模型列表
        const modelTags = settings.providers.map(p => p.tag)
        if (modelTags.length === 0) {
            new Notice(t('No available models'))
            return
        }

        // 创建模型选择菜单
        const menu = new Menu()
        for (const tag of modelTags) {
            menu.addItem((item) => {
                item.setTitle(tag)
                    .onClick(async () => {
                        // TODO: 判断是否可以回答
                        insertText(editor, `#${tag} : `)
                        try {
                            const env = await buildRunEnv(app, settings)
                            const conversation = await fetchConversation(env, 0, editor.posToOffset(cursor))
                            const messages = conversation.map((c) => ({ 
                                role: c.role, 
                                content: c.content 
                            }))

                            console.debug('messages', messages)
                            console.debug('generate text: ')

                            await generateWithModel(editor, messages, tag, settings)
                        } catch (error) {
                            console.error('Failed to generate:', error)
                        }
                    })
            })
        }
        
        // 计算居中位置
        const windowWidth = window.innerWidth
        const windowHeight = window.innerHeight
        const menuWidth = 180
        const menuHeight = modelTags.length * 28

        const x = (windowWidth - menuWidth) / 2
        const y = (windowHeight - menuHeight) / 2

        // 显示菜单
        menu.showAtPosition({ x, y })
    }
})