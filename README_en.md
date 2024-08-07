<h4 align="center">
    <p>
        <b>English</b> |
        <a href="README.md">中文</a>
    </p>
</h4>

# Introduction

Tars is an Obsidian plugin that supports text generation by Kimi, Doubao, Ali Qianwen, Baidu Qianfan, Zhipu, and other Chinese large language models (LLMs) based on tag suggestions. The name Tars comes from the robot Tars in the movie "Interstellar".

## Features

- Text generation AI assistant triggered by tags

![Text generation triggered by tag](docs/images/write%20a%20story%20with%20Kimi.gif)

- Support for internal links

![Internal link support](docs/images/writer%20prompt.png)

- Export conversations to JSONL dataset, supports [ms-swift (Scalable lightWeight Infrastructure for Fine-Tuning)](https://github.com/modelscope/swift)

## AI providers

- [Kimi](https://www.moonshot.cn)
- [Doubao](https://www.volcengine.com/product/doubao)
- [OpenAI](https://platform.openai.com/api-keys)
- [Qianfan](https://qianfan.cloud.baidu.com)
- [Qwen](https://dashscope.console.aliyun.com)
- [Zhipu](https://open.bigmodel.cn/)
- [DeepSeek](https://www.deepseek.com)

If the AI provider you want is not in the list above, you can propose a specific plan in the issue.

## How to use

Add an AI assistant in the settings page, set the API key, and then use the corresponding tag in the editor to trigger the AI assistant.

If the model type you want is not in the AI assistant on the settings page, you can configure it in the "Override input parameters" in the settings, input JSON format, for example `{"model":"your desired model"}`.

## Conversations syntax

A paragraph cannot contain multiple messages. Messages should be separated by blank lines.

![Conversations syntax](docs/images/syntax.png)

- The conversation messages will send to the configured AI assistant.
- Blockquote and callout sections are ignored. You can make annotations without sending them to the AI assistant.
- Start a new conversation with `new conversation tag`.

## Recommended

For better appearance, it is recommended to use the [colored tags plugin](https://github.com/pfrankov/obsidian-colored-tags).

![Colored tags plugin](docs/images/coloredTags.png)
