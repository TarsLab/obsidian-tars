<h4 align="center">
    <p>
        <b>English</b> |
        <a href="https://github.com/TarsLab/obsidian-tars/blob/main/README.md">中文</a>
    </p>
</h4>

# Introduction

Tars is an Obsidian plugin that supports text generation based on tag suggestions, using services like Claude, OpenAI, Gemini, Ollama, Kimi, Doubao, Qwen, Zhipu, 🔥DeepSeek, QianFan & more. The name Tars comes from the robot Tars in the movie "Interstellar".

## Features

- Text generation AI assistant triggered by tags

![Text generation triggered by tag](docs/images/write%20a%20story%20with%20Kimi.gif)

> ⚠️ **Note**: Do not add "#" in front. It is triggered by entering the "tag", not entering "#tag". In the above picture, the input is "kimi", not "#kimi".

- Support for internal links

![Internal link support](docs/images/writer%20prompt.png)

- Export conversations to JSONL dataset, supports [ms-swift (Scalable lightWeight Infrastructure for Fine-Tuning)](https://github.com/modelscope/swift)

## AI providers

- [Azure OpenAI](https://azure.microsoft.com)
- [Claude](https://claude.ai)
- [DeepSeek](https://www.deepseek.com)
- [Doubao](https://www.volcengine.com/product/doubao)
- [Gemini](https://gemini.google.com)
- [Kimi](https://www.moonshot.cn)
- [Ollama](https://www.ollama.com)
- [OpenAI](https://platform.openai.com/api-keys)
- [Qianfan](https://qianfan.cloud.baidu.com)
- [Qwen](https://dashscope.console.aliyun.com)
- [SiliconFlow](https://siliconflow.cn)
- [Zhipu](https://open.bigmodel.cn/)

If the AI provider you want is not in the list above, you can propose a specific plan in the issue.

### Assistant features

- Azure: Supports o1, deepseek-r1, gpt-4o, etc.
- 🔥DeepSeek: The reasoning model deepseek-reasoner's CoT is output in callout format
- 🔥SiliconFlow: Supports many models such as DeepSeek V3/R1
- Zhipu: Web search option

## How to use

Add an AI assistant in the settings page, set the API key, and then use the corresponding tag in the editor to trigger the AI assistant. Trigger through a conversation form, with user messages first, then trigger the AI assistant to answer questions.

```text
#User : 1+1=?（user message）
(blank line)
#Claude :（trigger）
```

If you are not satisfied with the AI assistant's answer and want to retry. Use the plugin command "Select the message at the cursor", select and delete the AI assistant's response content, modify your question, and trigger the AI assistant again.

If the model type you want is not in the AI assistant in the settings page, or the server address needs to be customized, you can configure it in the "Override input parameters" in the settings, input JSON format, for example `{"model":"your model", "baseURL": "your url"}`.

## Conversations syntax

A paragraph cannot contain multiple messages. Messages should be separated by blank lines.

![Conversations syntax](docs/images/syntax.png)

- The conversation messages will send to the configured AI assistant.
- Callout sections will be ignored. You can write content in the callout without sending it to the AI assistant. Callout is not markdown syntax, it is an obsidian extension syntax.
- Start a new conversation with `NewChat` tag.

## Recommended

For better appearance, it is recommended to use the [colored tags plugin](https://github.com/pfrankov/obsidian-colored-tags).

![Colored tags plugin](docs/images/coloredTags.png)

- Tag setting suggestion. Change the default tag to the abbreviation of the model used or the abbreviation of the usage scenario.
