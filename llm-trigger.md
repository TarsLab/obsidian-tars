continue implementation of the tasks from document @/docs/2025-10-03-120627-tasks.md 

tasks are based on:
- @/docs/2025-10-03-mcp-integration-review.md - initial review, that already modified by several commit. so examine the git commit messages to capture the updates
- @/docs/2025-10-03-115553-planning.md - break down to tasks
- @/docs/2025-10-03-planning-v2.md - alternative version of the plan with more acceptance criterias

start working on the next task from the list, keep attention to Important Notes from documents


so far we achieve minimalistic working version of the plugin, I see in Obsidian app that we successfully can execute the tools with Ollama provider. We are close to significant milestone - "release candidate"

```memory-server
tool:create_entities
entities:
  - name: language_learning_curve
    entityType: concept
    observations:
      - JavaScript: gentle
      - TypeScript: moderate
      - Python: gentle
      - Java: moderate
      - C++: steep
```


Tasks:
- session limit requires for MCP server should be applyied in context of one obsidian document. Switching between documents should reset the session limit.
- session limit should be resetable by user to zero, we should we raise a notification to user to reset the counter. "Continue" button.
- mcp server tool execution should be smart and not executed second time if we already have the results in the document. We should show notification to user to execute the tool again. "Re-execute" button.
- In settings "MCP Servers" section by default should be closed. If user did any changes then we should keep the state of the section is it expanded or collapsed.
- In settings "System message" section should be expandable/collabsable.
- In settings "Show as command" make sence in pairs: JSON-to-ShellCommand and URL-to-ShellCommand. JSON-to-URL is not possible by default, exception is only JSON that correspond our auto-generated for URLs mcp-remote configuration.
- Refresh button in Status Bar modl dialog, should reload MCP servers, create a new session and reset the session limit. 
- Current count of Session limit should be visible in status bar modal dialog.
- Refresh button should first kill all existing sessions, and MCP servers. Status should be clearly visible in status bar modal dialog. Make a small delay between killing and recreation of MCP servers. servers icons should correctly display the status.
- On tool selecting from the drop-down expected auto-generation of parametes for tool calling and placing this in the document.
- Tool execution title does not contain a space between words: `Duration: 7msType: json` should be `Duration: 7ms, Type: json`.
- Tool execution by LLM and manual way are different in formatting in document, but expected that they should be identical. User should be able to copy tool execution from history and copy/paste it to another document, and tool will be reexecuted (if no results of tool is available yet, otherwise can use cached value).
- We need an "utility section" that tracks which tools we register in LLM during the prompt/session. This section should become a part of the obsidian document. Also we should be able to enable/disable this behavior via global settings. 
- We need to register commands for each MCP server, on command execution we should creat in current cursor position section that triggers the tool execution with parameters.


✅ Session limit per document → Q1, Q2, Q9 (Feature-900-10)
✅ Session reset with "Continue" button → Q2, Q9 (Feature-900-10)
✅ Smart execution with "Re-execute" prompt → Q3-Q5, Q11, Q12 (Feature-900-20)
✅ "MCP Servers" section collapsible → Q6 (Feature-900-30)
✅ "System message" section collapsible → Q6 (Feature-900-30)
✅ Smart "Show as command" conversions → Covered in Feature-900-40
✅ Refresh button: reload + reset sessions → Q7, Q8, Q9 (Feature-900-50)
✅ Session count in status modal → Feature-900-50
✅ Refresh: kill → delay → recreate → Q7, Q8 (Feature-900-50)
✅ Auto-generate parameters → Q10 (Feature-900-60)
✅ Fix spacing: "Duration: 7ms, Type: json" → Feature-900-70
✅ Identical LLM/manual formatting → Q11 (Feature-900-70)
✅ Utility section tracking tools → Q13, Q14, Q15 (Feature-900-80, deferred)
✅ Commands for each MCP server → Feature-900-90 (deferred)

## Tools

1. `{"name": "create_entities", "parameters": {"entities": "[{\"entityType\": \"Tag\", \"name\": \"Machine Learning\", \"observations\": [\"A machine learning algorithm is a mathematical subset of machine learning.\"]}, {\"entityType\": \"Person\", \"name\": \"Alan Turing\", \"observations\": [\"Turing was an English mathematician, computer scientist, logician, and philosopher.\"]}]"}}`

2. `{"name": "create_relations", "parameters": {"relations": "[{\"from\": \"Machine Learning\", \"relationType\": \"Describes\", \"to\": \"Alan Turing\"}, {\"from\": \"Turing\", \"relationType\": \"Was a\", \"to\": \"English Mathematician\"}]"}}`

3. `{"name": "add_observations", "parameters": {"observations": "[{\"entityName\": \"Machine Learning\", \"contents\": [\"A machine learning algorithm is a mathematical subset of machine learning.\"]}, {\"entityName\": \"Alan Turing\", \"contents\": [\"Turing was an English mathematician, computer scientist, logician, and philosopher.\"]}]"}}`

4. `{"name": "delete_entities", "parameters": {"entityNames": ["Machine Learning", "English Mathematician"]}}`

5. `{"name": "delete_observations", "parameters": {"deletions": "[{\"entityName\": \"Alan Turing\", \"observations\": [\"Turing was an English mathematician, computer scientist, logician, and philosopher.\"]}]"}}`

6. `{"name": "delete_relations", "parameters": {"relations": "[{\"from\": \"Machine Learning\", \"relationType\": \"Describes\", \"to\": \"Alan Turing\"}, {\"from\": \"Turing\", \"relationType\": \"Was a\", \"to\": \"English Mathematician\"}]"}}`

7. `{"name": "read_graph", "parameters": {}}`

8. `{"name": "search_nodes", "parameters": {"query": "Machine Learning"}}`

9. `{"name": "open_nodes", "parameters": {"names": ["Alan Turing"]}}`

10. `{"name": "web_search_exa", "parameters": {"numResults": 5, "query": "Deep learning frameworks"}}`

11. `{"name": "get_code_context_exa", "parameters": {"tokensNum": 1000, "query": "Python pandas dataframe filtering examples"}}`

12. `{"name": "fetch_obsidian_docs", "parameters": {}}`

13. `{"name": "search_obsidian_docs", "parameters": {"query": "Machine Learning algorithms"}}`

14. `{"name": "search_obsidian_code", "parameters": {"page": 1, "query": "Python machine learning libraries"}}`