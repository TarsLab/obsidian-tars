<h4 align="center">
    <p>
        <b>English</b> |
        <a href="README_zh.md">中文</a>
    </p>
</h4>

# Introduction

Tars is an Obsidian plugin that uses Kimi and other Chinese LLMs for text generation based on tag suggestions. The name Tars comes from the robot Tars in Interstellar.

## Features

- Text generation AI assistant triggered by tags

![Text generation triggered by tag](docs/images/write%20a%20story%20with%20Kimi.gif)

- Support for internal links

![Internal link support](docs/images/writer%20prompt.png)

- Export conversations to jsonl dataset, supports [ms-swift (Scalable lightWeight Infrastructure for Fine-Tuning)](https://github.com/modelscope/swift)

## How to use

Add an AI assistant in the settings page, set the API key, and then use the corresponding tag in the editor to trigger the AI assistant.

## Conversations syntax

A paragraph cannot contain multiple messages. Messages should be separated by blank lines.

![Conversations syntax](docs/images/syntax.png)

## Recommended

For better appearance, it is recommended to use the [colored tags plugin](https://github.com/pfrankov/obsidian-colored-tags).

![Colored tags plugin](docs/images/coloredTags.png)
