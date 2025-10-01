# Feature Specification: MCP Server Integration for LLM Tool Execution

**Feature Branch**: `001-integrate-mcp-servers`  
**Created**: 2025-10-01  
**Status**: Draft  
**Input**: User description: "Integrate MCP servers into plugin, so the LLM has access to the MCP servers tools and can execute them for different purposes. All MCP servers should be hosted via docker. Expected minimalistic settings UI, that allows registration of multiple MCP servers and enable/disable them. Each MCP server should be associated with a specific document section. From user side expected markdown code sections in style: ```{mcp_server_name} tool: {tool_name} {extra parameters in yaml style} ```. During processing our plugin will execute MCP server tool and resolve it to content. Also expected that LLM can request MCP server tool execution."

---

## User Scenarios & Testing

### Primary User Story

As an Obsidian user writing documents with AI assistance, I want to extend the AI's capabilities by connecting it to external tools through MCP (Model Context Protocol) servers, so that the AI can access real-time data, execute commands, and interact with external systems without leaving my Obsidian workspace.

**Example Use Case**: While writing a technical document, I want the AI to fetch current weather data, query a database, or execute a code analysis tool. I configure these capabilities once through MCP servers, then simply reference them in my document using special code blocks. The AI can either respond to my explicit tool requests or autonomously decide to use tools when answering my questions.

### Acceptance Scenarios

1. **Given** I have registered an MCP server in the plugin settings, **When** I insert a code block with the server name and tool specification in my document, **Then** the plugin executes the tool and replaces the code block content with the tool's output

2. **Given** I have multiple MCP servers configured, **When** I interact with an AI assistant in the document, **Then** the AI can autonomously request tool execution from any enabled MCP server to enhance its responses

3. **Given** I have an MCP server that is currently disabled, **When** I reference its tools in a code block or the AI attempts to use it, **Then** the system gracefully skips execution and notifies me that the server is disabled

4. **Given** I have configured an MCP server with connection parameters, **When** I save the document with tool requests, **Then** the plugin maintains the tool specifications but only executes them when the document is actively processed

5. **Given** an AI assistant suggests using an MCP tool, **When** the tool executes successfully, **Then** the results are injected into the conversation context and the AI can reference them in its response

6. **Given** I have document sections that should use different MCP servers, **When** I associate each section with a specific server, **Then** tool requests in each section only execute against their designated server

### Edge Cases

- What happens when an MCP server is unavailable or times out during tool execution?
- How does the system handle tool execution errors (invalid parameters, permission denied, server crash)?
- What happens when the same tool is requested multiple times in rapid succession?
- How does the system prevent infinite loops (AI requests tool A, which triggers tool B, which triggers tool A)?
- What happens when an MCP server configuration changes while a document is being processed?
- How are tool execution results cached or persisted across document edits?
- What happens when a user manually edits the output of a previously executed tool block?
- How does the system handle concurrent tool executions from multiple document sections?
- What happens when a code block references a non-existent tool or server?
- How are tool execution permissions and security boundaries enforced?

## Requirements

### Functional Requirements

#### MCP Server Management
- **FR-001**: System MUST allow users to register multiple MCP servers through the plugin settings interface
- **FR-002**: System MUST persist MCP server configurations (name, connection parameters, enabled status, deployment type) across Obsidian sessions
- **FR-003**: System MUST provide enable/disable toggle for each registered MCP server without removing its configuration
- **FR-004**: System MUST validate MCP server connectivity before marking it as active
- **FR-005**: System MUST display connection status (connected, disconnected, error) for each configured server
- **FR-036**: System MUST manage full lifecycle (start/stop/health monitoring) for Docker-hosted MCP servers via Docker API
- **FR-037**: System MUST verify connection health for remote (cloud-hosted) SSE servers without managing their lifecycle
- **FR-038**: System MUST distinguish between managed (Docker stdio/SSE) and external (remote SSE) server deployment types in configuration
- **FR-039**: System MUST automatically disable servers that fail startup or health checks repeatedly (3 failed cycles with exponential backoff: 1s, 5s, 15s)
- **FR-040**: System MUST notify users via Obsidian Notice when servers are auto-disabled due to repeated failures

#### Code Block Tool Invocation
- **FR-006**: System MUST recognize markdown code blocks with MCP server name as the language identifier (e.g., ` ```servername `)
- **FR-007**: System MUST parse tool invocation syntax within code blocks: `tool: {tool_name}` followed by YAML-style parameters
- **FR-008**: System MUST execute the specified tool on the designated MCP server when processing the document
- **FR-009**: System MUST replace or append tool execution results within or after the code block
- **FR-010**: System MUST preserve original tool request syntax for re-execution capability
- **FR-011**: System MUST indicate execution status (pending, success, error) visually within the document

#### Document Section Association
- **FR-012**: System MUST allow users to associate specific document sections (headings, blocks, or ranges) with designated MCP servers
- **FR-013**: System MUST restrict tool execution within a section to only the associated MCP server
- **FR-014**: System MUST inherit MCP server association from parent sections when not explicitly specified
- **FR-015**: System MUST provide clear visual indicators showing which MCP server is active for each document section

#### LLM-Initiated Tool Execution
- **FR-016**: System MUST expose available MCP tools to the AI assistant as part of its context
- **FR-017**: System MUST allow the AI assistant to request tool execution by specifying server name, tool name, and parameters
- **FR-018**: System MUST execute AI-requested tools asynchronously and stream results back to the conversation
- **FR-019**: System MUST inject tool execution results into the AI's context before it generates its final response
- **FR-020**: System MUST log all AI-initiated tool executions for user transparency and debugging

#### Error Handling & User Feedback
- **FR-021**: System MUST display user-friendly error messages when MCP server connection fails
- **FR-022**: System MUST display user-friendly error messages when tool execution fails (invalid parameters, tool not found, timeout)
- **FR-023**: System MUST provide fallback behavior when a tool is unavailable (skip execution, use cached result, or notify user)
- **FR-024**: System MUST prevent document corruption if tool execution fails mid-process
- **FR-025**: System MUST respect Obsidian's notice system for non-blocking user notifications

#### Settings UI Requirements
- **FR-026**: Settings UI MUST be minimalistic with only essential configuration fields per MCP server
- **FR-027**: Settings UI MUST support adding, editing, and removing MCP server configurations
- **FR-028**: Settings UI MUST display server status and last connection attempt timestamp
- **FR-029**: Settings UI MUST provide a "Test Connection" action for each server
- **FR-030**: Settings UI MUST validate required fields (server name, connection endpoint) before saving

#### Security & Performance
- **FR-031**: System MUST support configurable global timeout for tool execution with default value of 30 seconds (applies to all MCP servers)
- **FR-032**: System MUST enforce global concurrent execution limit (configurable, default 25 concurrent executions, -1 for unlimited) and track total tool executions per session with user ability to stop execution
- **FR-033**: System MUST support stdio and SSE transport protocols for MCP server communication without authentication requirements (trust local network model)
- **FR-034**: System MUST allow unrestricted tool execution, with security controlled by user via enable/disable of individual MCP servers
- **FR-035**: System MUST execute tools without caching results, ensuring data freshness on every invocation
- **FR-041**: System MUST implement exponential backoff retry strategy (1s, 5s, 15s intervals) for failed server connections or tool executions before auto-disabling
- **FR-042**: System MUST gracefully handle Docker port conflicts (e.g., port already occupied) and report specific error to user via Notice

### Key Entities

- **MCP Server Configuration**: Represents a registered MCP server with attributes including unique name, connection endpoint, transport protocol (stdio/SSE), deployment type (managed Docker/external remote), enabled/disabled status, Docker configuration (if managed), retry count, last failure timestamp, and association rules for document sections

- **Tool Invocation Request**: Represents a single tool execution request with attributes including target server name, tool name, input parameters (YAML-formatted), requesting context (user code block or AI assistant), execution status, retry attempts, and result output

- **Document Section Binding**: Represents the association between a document section (identified by heading, block ID, or line range) and a designated MCP server, with inheritance rules for nested sections

- **Tool Execution Result**: Represents the output from a tool execution with attributes including timestamp, success/failure status, returned data, error messages, execution duration, and retry history

- **AI Tool Context**: Represents the available tools exposed to the AI assistant for a given conversation, filtered by enabled servers and current document section associations

- **Server Health Status**: Represents the health monitoring state of an MCP server with attributes including connection state, last successful ping, failure count, retry backoff state, and auto-disable flag

---

## Assumptions & Dependencies

### Assumptions
1. All MCP servers are accessible via network connections from the user's Obsidian installation
2. MCP servers follow the Model Context Protocol specification for tool exposure and execution
3. Users have basic understanding of YAML syntax for tool parameters
4. Tool execution results are representable as text or can be serialized to text
5. Document processing occurs when AI assistants are actively generating responses or when explicitly triggered by user actions

### Dependencies
1. **External**: Docker Engine API for managing Docker-hosted MCP servers (start/stop/health)
2. **External**: Remote MCP server infrastructure (cloud-hosted SSE servers, user-managed)
3. **Internal**: Existing Tars plugin architecture (provider system, settings persistence, editor integration)
4. **Internal**: Obsidian plugin API for document parsing and manipulation
5. **Internal**: AI provider integration for injecting tool context and results
6. **Internal**: Obsidian Notice API for user notifications on server failures

### Known Constraints
- MCP servers must be hosted separately (not embedded in Obsidian plugin)
- Tool execution is asynchronous and may introduce latency in AI responses
- Document structure (sections, code blocks) must be parseable by Obsidian's metadata cache
- Tool results must be displayable within Obsidian's markdown rendering capabilities

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain ✅ **All clarifications resolved**
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

### Tars Plugin Specific
- [x] Obsidian plugin compatibility considered (code block parsing, settings UI, notice system)
- [x] Tag-based interaction model implications addressed (AI-initiated tool execution integrated with conversation flow)
- [x] Multimodal content requirements specified (tool results injected as text/structured data)
- [x] Provider-specific behavior documented (tool context exposure mechanism, result injection)

### Specification Quality
- [x] 10 edge cases identified for testing
- [x] 6 acceptance scenarios with Given/When/Then format
- [x] 42 functional requirements (all clarified)
- [x] 6 key entities with clear relationships
- [x] User story describes business value

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted (MCP servers, tool execution, Docker hosting, code block syntax, AI integration)
- [x] Ambiguities marked (5 security/performance clarifications needed)
- [x] User scenarios defined (6 acceptance scenarios + 10 edge cases)
- [x] Requirements generated (35 functional requirements across 6 categories)
- [x] Entities identified (5 key entities with relationships)
- [x] Review checklist passed ✅ **All requirements clarified**

---

## Clarification Decisions (2025-10-01)

### Performance & Security (Initial Round)
**FR-031 - Timeout**: 30 seconds global default (configurable)
**FR-032 - Concurrency**: 25 concurrent executions global default (configurable, -1 = unlimited), with session tracking and user stop capability
**FR-033 - Authentication**: No authentication, support stdio and SSE protocols
**FR-034 - Sandboxing**: No restrictions, user controls security via enable/disable
**FR-035 - Caching**: No caching, always execute fresh

### Lifecycle Management (Follow-up Round)
**FR-036-040 - Server Lifecycle**: Plugin manages full lifecycle for Docker-hosted servers (stdio and SSE); remote SSE servers are externally managed with health verification only
**FR-039 - Failure Handling**: Auto-disable after 3 failed retry cycles using exponential backoff (1s, 5s, 15s); gracefully handle Docker port conflicts
**FR-040 - User Notifications**: Use Obsidian Notice to alert users of server failures and auto-disable events
**FR-041-042 - Recovery Strategy**: Exponential backoff with specific error reporting (e.g., port conflicts)

## Next Steps

1. ✅ **Clarifications Complete**: All 5 requirements resolved
2. **Ready for Planning**: Proceed to `/plan` workflow to generate implementation plan
3. **Technical Decisions Deferred**: Implementation approach (stdio/SSE communication, code block processor, MCP SDK integration) will be determined in planning phase

---
