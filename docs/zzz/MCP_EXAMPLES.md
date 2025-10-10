# MCP Tool Examples

This document contains real-world examples of using MCP tools in Obsidian notes.

## Example 1: Project Management

### Store Project Information

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "obsidian-tars"
    entityType: "project"
    observations: 
      - "Obsidian plugin for AI chat"
      - "Supports multiple AI providers"
      - "Integrated MCP protocol"
      - "Built with TypeScript"
```
````

### Add Team Members

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "developer-alice"
    entityType: "person"
    observations: ["Lead developer", "Specializes in TypeScript"]
  - name: "designer-bob"
    entityType: "person"
    observations: ["UI/UX designer", "Creates mockups"]
```
````

### Link Team to Project

````markdown
```Memory Server
tool: create_relations
relations:
  - from: "developer-alice"
    to: "obsidian-tars"
    relationType: "works-on"
  - from: "designer-bob"
    to: "obsidian-tars"
    relationType: "designs-for"
```
````

### Query Project Status

````markdown
```Memory Server
tool: search_nodes
query: obsidian-tars
```
````

---

## Example 2: Meeting Notes

### Store Meeting

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "meeting-2025-01-15-sprint-planning"
    entityType: "meeting"
    observations:
      - "Discussed Q1 roadmap"
      - "Decided on MCP integration priority"
      - "Assigned tasks to team members"
```
````

### Add Action Items

````markdown
```Memory Server
tool: add_observations
entityName: meeting-2025-01-15-sprint-planning
contents:
  - "ACTION: Alice - Implement tool calling"
  - "ACTION: Bob - Design settings UI"
  - "DECISION: Use Docker for MCP servers"
```
````

### Link to Project

````markdown
```Memory Server
tool: create_relations
relations:
  - from: "meeting-2025-01-15-sprint-planning"
    to: "obsidian-tars"
    relationType: "about"
```
````

---

## Example 3: Learning Journal

### Store Learning Resources

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "course-typescript-advanced"
    entityType: "resource"
    observations:
      - "Online course on advanced TypeScript"
      - "Duration: 10 hours"
      - "Covers generics, decorators, and async patterns"
  - name: "book-clean-architecture"
    entityType: "resource"
    observations:
      - "Book by Robert Martin"
      - "About software architecture principles"
```
````

### Track Progress

````markdown
```Memory Server
tool: add_observations
entityName: course-typescript-advanced
contents:
  - "2025-01-10: Completed modules 1-3"
  - "2025-01-12: Learned about mapped types"
  - "2025-01-15: Built a generic utility class"
```
````

### Connect Topics

````markdown
```Memory Server
tool: create_relations
relations:
  - from: "course-typescript-advanced"
    to: "obsidian-tars"
    relationType: "applies-to"
    observations: ["Using TypeScript features in plugin"]
```
````

---

## Example 4: Research Notes

### Store Research Paper

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "paper-attention-is-all-you-need"
    entityType: "paper"
    observations:
      - "Transformer architecture paper"
      - "Published in 2017"
      - "Introduced self-attention mechanism"
      - "Foundation for modern LLMs"
```
````

### Add Key Insights

````markdown
```Memory Server
tool: add_observations
entityName: paper-attention-is-all-you-need
contents:
  - "KEY INSIGHT: Self-attention allows parallel processing"
  - "KEY INSIGHT: Positional encoding preserves sequence order"
  - "QUOTE: 'Attention is all you need'"
  - "APPLICATION: Used in GPT, BERT, and modern transformers"
```
````

### Link Related Papers

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "paper-bert"
    entityType: "paper"
    observations: ["BERT model paper", "Bidirectional transformers"]
```

````markdown
```Memory Server
tool: create_relations
relations:
  - from: "paper-bert"
    to: "paper-attention-is-all-you-need"
    relationType: "builds-on"
```
````

---

## Example 5: Daily Notes Integration

### Morning Review

````markdown
# Daily Note - 2025-01-15

## Tasks for Today
- [ ] Review PRs
- [ ] Fix bug #123
- [ ] Team meeting at 2pm

<!-- Store in knowledge graph -->
```Memory Server
tool: create_entities
entities:
  - name: "daily-2025-01-15"
    entityType: "daily-note"
    observations:
      - "Planned to review PRs"
      - "Bug fix needed for issue #123"
      - "Team meeting scheduled"
```
````

### Evening Reflection

````markdown
## What I Learned Today

Today I implemented MCP tool integration and learned about
native tool calling in Ollama.

<!-- Add to knowledge graph -->
```Memory Server
tool: add_observations
entityName: daily-2025-01-15
contents:
  - "COMPLETED: Implemented MCP tool integration"
  - "LEARNED: Ollama supports native tool calling in llama3.2"
  - "LEARNED: Tools must be in specific format for each provider"
  - "REFLECTION: Need to document user-facing API better"
```
````

---

## Example 6: AI Conversation with Tools

### Setup: AI with Memory

**Conversation 1:**
```markdown
#Ollama : Hi! I'm working on a new Obsidian plugin called "tars". 
It's for AI chat integration. Remember this for later!
```

**AI automatically executes:**
```
[Tool: create_entities]
Parameters:
  - name: "plugin-tars"
  - entityType: "project"
  - observations: ["Obsidian plugin", "AI chat integration"]

Response: "Got it! I've stored that you're working on the 'tars' 
plugin for AI chat in Obsidian. I'll remember this."
```

**Conversation 2 (Later):**
```markdown
#Ollama : What was that plugin I mentioned earlier?
```

**AI automatically executes:**
```
[Tool: search_nodes]
Query: "plugin"

[Tool: read_graph]

Response: "You mentioned the 'tars' plugin - it's an Obsidian 
plugin for AI chat integration."
```

---

## Example 7: Book Notes

### Store Book Information

````markdown
# Book: The Pragmatic Programmer

## Metadata

```Memory Server
tool: create_entities
entities:
  - name: "book-pragmatic-programmer"
    entityType: "book"
    observations:
      - "Authors: Andrew Hunt and David Thomas"
      - "Published: 1999 (Updated: 2019)"
      - "Genre: Software Engineering"
      - "Pages: 352"
```
````

### Chapter Notes

````markdown
## Chapter 3: The Basic Tools

Key takeaways:
- Master your editor
- Use version control
- Automate everything

```Memory Server
tool: add_observations
entityName: book-pragmatic-programmer
contents:
  - "CHAPTER 3: Master your development tools"
  - "TIP 17: Use a single editor well"
  - "TIP 18: Always use version control"
  - "QUOTE: 'DRY - Don't Repeat Yourself'"
```
````

### Connect to Current Work

````markdown
```Memory Server
tool: create_relations
relations:
  - from: "book-pragmatic-programmer"
    to: "obsidian-tars"
    relationType: "influences"
    observations: ["Applying DRY principle in codebase"]
```
````

---

## Example 8: Maintenance Tasks

### List All Projects

````markdown
```Memory Server
tool: read_graph
```
````

### Search for Specific Topic

````markdown
```Memory Server
tool: search_nodes
query: typescript
```
````

### Clean Up Old Entries

````markdown
```Memory Server
tool: delete_entities
entityNames:
  - "temp-note-123"
  - "draft-obsolete"
  - "test-entity"
```
````

### Delete Specific Observations

````markdown
```Memory Server
tool: delete_observations
entityName: obsidian-tars
observations:
  - "Old incorrect information"
  - "Outdated status"
```
````

---

## Tips for Effective Use

### 1. Consistent Naming

**Good:**
```
meeting-2025-01-15-team-sync
project-obsidian-tars
paper-attention-is-all-you-need
```

**Avoid:**
```
meeting1
myproject
paper
```

### 2. Use Entity Types

Organize with clear types:
- `project`, `person`, `meeting`, `task`
- `book`, `paper`, `course`, `resource`
- `daily-note`, `weekly-review`

### 3. Add Rich Observations

**Good:**
```yaml
observations:
  - "STATUS: In progress (70% complete)"
  - "BLOCKER: Waiting for API access"
  - "NEXT: Implement error handling"
```

**Basic:**
```yaml
observations:
  - "In progress"
```

### 4. Use Relations Wisely

Connect related entities:
```yaml
relations:
  - from: "developer-alice"
    to: "task-implement-mcp"
    relationType: "assigned-to"
```

---

## Summary

These examples show how to:

✅ Store and organize project information  
✅ Track meetings and action items  
✅ Maintain learning journals  
✅ Connect research papers  
✅ Integrate with daily notes  
✅ Enable AI autonomous memory  
✅ Document books and resources  
✅ Maintain and clean up data  

**Start with simple examples and gradually build your knowledge graph!**
