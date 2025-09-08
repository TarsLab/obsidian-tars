# MCP (Model Context Protocol) Integration

The Obsidian TARS plugin now supports MCP (Model Context Protocol) integration, allowing you to enhance AI text generation with external data sources and tools triggered by tags.

## Overview

MCP integration enables the plugin to:
- Connect to external MCP servers running in Docker containers
- Automatically invoke tools based on tags in your notes
- Include external data in AI generation context
- Enhance responses with real-time information

## Setup

### 1. Enable MCP Integration

1. Open Obsidian Settings
2. Navigate to TARS plugin settings
3. Enable "MCP Integration"
4. Configure your MCP servers

### 2. Configure MCP Servers

Add MCP servers in the plugin settings:

```json
{
  "id": "weather-server",
  "name": "Weather Data Server",
  "enabled": true,
  "transport": {
    "type": "http",
    "host": "localhost",
    "port": 3001
  },
  "credentials": {
    "apiKey": "your-api-key"
  }
}
```

### 3. Set Up Tag-Tool Mappings

Configure which tools should be triggered by specific tags:

```json
{
  "tagPattern": "weather*",
  "serverIds": ["weather-server"],
  "toolNames": ["get_current_weather", "get_forecast"],
  "parameters": {
    "location": "${tag}",
    "units": "metric"
  }
}
```

## Usage

### Basic Usage

1. Add tags to your notes (e.g., `#weather-london`, `#stock-AAPL`)
2. Use an assistant tag to trigger AI generation
3. The plugin will automatically:
   - Detect relevant tags
   - Invoke corresponding MCP tools
   - Include tool results in the AI context
   - Generate enhanced responses

### Example

```markdown
# Weather Report

#weather-london #forecast

#Claude: What's the current weather and forecast for London?
```

When you trigger the Claude assistant tag, the plugin will:
1. Detect the `weather-london` and `forecast` tags
2. Call the weather MCP server's tools
3. Include current weather data in the AI context
4. Generate a response with real-time weather information

## MCP Server Examples

### Weather Server

A simple MCP server that provides weather data:

```python
# weather_server.py
from mcp import Server
import requests

server = Server("weather-server")

@server.tool("get_current_weather")
def get_current_weather(location: str) -> dict:
    # Call weather API
    response = requests.get(f"https://api.weather.com/current/{location}")
    return response.json()

@server.tool("get_forecast")
def get_forecast(location: str, days: int = 5) -> dict:
    # Call forecast API
    response = requests.get(f"https://api.weather.com/forecast/{location}?days={days}")
    return response.json()

if __name__ == "__main__":
    server.run(port=3001)
```

### Docker Setup

Run MCP servers in Docker containers:

```dockerfile
# Dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY weather_server.py .
EXPOSE 3001

CMD ["python", "weather_server.py"]
```

```bash
# Build and run
docker build -t weather-mcp-server .
docker run -p 3001:3001 weather-mcp-server
```

## Configuration Options

### Server Configuration

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique server identifier |
| `name` | string | Human-readable server name |
| `enabled` | boolean | Whether the server is active |
| `transport.type` | string | Connection type (`http`, `websocket`) |
| `transport.host` | string | Server hostname |
| `transport.port` | number | Server port |
| `credentials` | object | Authentication credentials |

### Tag-Tool Mapping

| Field | Type | Description |
|-------|------|-------------|
| `tagPattern` | string | Tag pattern to match (supports wildcards) |
| `serverIds` | string[] | List of server IDs to use |
| `toolNames` | string[] | List of tool names to invoke |
| `parameters` | object | Default parameters for tools |

### Parameter Substitution

Use placeholders in parameters:
- `${tag}` - The matched tag name
- `${content}` - Current note content
- `${selection}` - Selected text

## Advanced Features

### Health Monitoring

The plugin automatically monitors MCP server health and provides feedback:
- Connection status indicators
- Automatic reconnection attempts
- Error notifications

### Error Handling

Robust error handling ensures the plugin continues working even when MCP servers are unavailable:
- Graceful fallback when servers are down
- Detailed error messages
- Partial results when some tools fail

### Performance Optimization

- Parallel tool execution
- Connection pooling
- Caching of tool results
- Timeout management

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check if MCP server is running
   - Verify host and port configuration
   - Check firewall settings

2. **Tool Not Found**
   - Verify tool names in mapping configuration
   - Check MCP server tool registration
   - Review server logs

3. **Authentication Errors**
   - Verify API keys and credentials
   - Check credential format
   - Ensure proper permissions

### Debug Mode

Enable debug logging in plugin settings to see detailed MCP operation logs:
- Connection attempts
- Tool invocations
- Response processing
- Error details

## Security Considerations

- Store sensitive credentials securely
- Use HTTPS for production MCP servers
- Validate tool parameters
- Implement proper authentication
- Monitor server access logs

## Examples and Templates

See the `/examples` directory for:
- Sample MCP server implementations
- Docker compose configurations
- Common tag-tool mapping patterns
- Integration examples

## Contributing

To contribute MCP server examples or improvements:
1. Fork the repository
2. Create your feature branch
3. Add tests and documentation
4. Submit a pull request

## Support

For MCP integration support:
- Check the troubleshooting guide
- Review server logs
- Open an issue with detailed error information
- Join the community discussions