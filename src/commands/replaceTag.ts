import { App, Command, Modal, Notice, Setting } from 'obsidian'
import { t } from 'src/lang/helper'

export const replaceCmdId = 'replace-tag'

export const replaceCmd = (app: App): Command => ({
	id: replaceCmdId,
	name: t('Replace speaker with tag'),
	callback: async () => {
		const activeFile = app.workspace.getActiveFile()
		if (!activeFile) {
			return
		}
		const fileText = await app.vault.cachedRead(activeFile)
		const twoMostFrequentSpeakers = findTwoMostFrequentSpeakers(fileText)
		if (twoMostFrequentSpeakers.length < 1) {
			new Notice(t('No speaker found'))
			return
		}
		console.debug('twoMostFrequentSpeakers', twoMostFrequentSpeakers)
		const recommendedTags = twoMostFrequentSpeakers.map((speaker) => ({
			original: speaker.name,
			count: speaker.count,
			newTag: convertToTag(speaker.name)
		}))
		new ReplaceTagModal(app, recommendedTags, async (recommendedTags) => {
			await app.vault.process(activeFile, (fileText) => replace(fileText, recommendedTags))
		}).open()
	}
})

const convertToTag = (speaker: string) => {
	if (speaker.trim().startsWith('#')) {
		return speaker
	}
	// Tags can't contain blank spaces. To separate two or more words, use a hyphen (-) , #kebab-case
	return '#' + speaker.trim().replace(/\s(?!:)/g, '-') // Replace spaces in the middle with a hyphen (-)
}

class ReplaceTagModal extends Modal {
	onSubmit: (tags: ReplaceTag[]) => void
	recommendTags: ReplaceTag[]
	constructor(app: App, recommendTags: ReplaceTag[], onSubmit: (tags: ReplaceTag[]) => void) {
		super(app)
		this.recommendTags = recommendTags
		this.onSubmit = onSubmit
	}

	onOpen() {
		const { contentEl } = this
		contentEl.createEl('h2', { text: t('Replace speaker with tag') })
		contentEl.createEl('p', {
			text: t('Replace the names of the two most frequently occurring speakers with tag format.')
		})
		for (const tag of this.recommendTags) {
			new Setting(contentEl).setName(tag.original + ` (${tag.count})`).addText((text) =>
				text
					.setPlaceholder(tag.newTag)
					.setValue(tag.newTag)
					.onChange(async (value) => {
						tag.newTag = value
					})
			)
		}

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText(t('Replace'))
				.setCta()
				.onClick(async () => {
					this.close()
					await this.onSubmit(this.recommendTags)
				})
		)
	}
}

interface ReplaceTag {
	original: string
	count: number
	newTag: string
}

const countOccurrences = (array: string[]) =>
	array.reduce(
		(acc, curr) => {
			acc[curr] = (acc[curr] || 0) + 1
			return acc
		},
		{} as { [key: string]: number }
	) // Add index signature to the accumulator object

const findTwoMostFrequentSpeakers = (fileText: string) => {
	// range from \u4e00 to \u9fa5, covering most common Chinese characters
	const lines = fileText.split('\n')
	const matchResults = lines
		.map((line) => line.match(/^([\u4e00-\u9fa5a-zA-Z0-9# ]+)([:|：]) /g))
		.flatMap((match) => match || [])
	console.debug('allMatches', matchResults)
	const matchCounts = countOccurrences(matchResults)

	// sort occurrences
	const sortedMatchFrequencies = Object.entries(matchCounts).sort((arr1, arr2) => arr2[1] - arr1[1])
	console.debug('sortedMatchFrequencies', sortedMatchFrequencies)
	// Select the two most frequent speakers
	const [mostFrequent, secondMostFrequent] = sortedMatchFrequencies.slice(0, 2)
	if (!mostFrequent || !secondMostFrequent) {
		return []
	}
	return [
		{
			name: mostFrequent[0],
			count: mostFrequent[1]
		},
		{
			name: secondMostFrequent[0],
			count: secondMostFrequent[1]
		}
	]
}

const replace = (fileText: string, tags: ReplaceTag[]) => {
	tags.forEach(({ original, newTag }) => {
		fileText = fileText
			.replace(new RegExp(`^${original}`, 'g'), `${newTag}`)
			.replace(new RegExp(`\n${original}`, 'g'), `\n${newTag}`)
	})
	return fileText
}
