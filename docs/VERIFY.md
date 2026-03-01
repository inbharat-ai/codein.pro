# ✅ VERIFY - Complete Verification Commands

**Purpose**: Exact commands to verify Code-In functionality  
**Environment**: Windows PowerShell / Linux/Mac Bash  
**Last Updated**: February 27, 2026

---

## 🚀 QUICK START VERIFICATION

### 1. Prerequisites Check

```powershell
# Check Node.js version (requires 20.19+)
node --version

# Check Python version (requires 3.8+)
python --version

# Check npm installed
npm --version

# Check Git
git --version
```

**Expected Output**:

```
v20.19.0 (or higher)
Python 3.8.0 (or higher)
10.5.0 (or higher)
git version 2.40.0 (or higher)
```

---

### 2. Install Dependencies

```powershell
# Navigate to project root
cd "C:\Users\reetu\Desktop\Bharta Code"

# Install root dependencies
npm install

# Install agent package dependencies
cd packages/agent
npm install

# Install extension dependencies
cd ../extension
npm install

# Return to root
cd ../..
```

**Expected Output**: No errors, all packages installed

---

### 3. Start Agent Server

```powershell
# Terminal 1: Start Agent
cd packages/agent
npm start
```

**Expected Output**:

```
CodIn Agent listening on http://127.0.0.1:43120
[CodIn Agent] All subsystems loaded
```

**Verification**:

```powershell
# Terminal 2: Check server is running
netstat -ano | Select-String "43120"

# Or test health endpoint
curl http://localhost:43120/health
```

**Expected Response**:

```json
{
  "status": "ok",
  "agent": "CodIn Agent",
  "version": "0.1.0"
}
```

---

## 🧪 FUNCTIONAL TESTING

### API Endpoint Tests

#### 1. Health Check

```powershell
curl http://localhost:43120/health
```

**Expected**: `{ "status": "ok", ... }`

#### 2. Models List

```powershell
curl http://localhost:43120/models
```

**Expected**: `{ "models": [...], "active": {...} }`

#### 3. Translation (if i18n loaded)

```powershell
curl -X POST http://localhost:43120/i18n/translate `
  -H "Content-Type: application/json" `
  -d '{"text":"Hello","source":"en","target":"hi"}'
```

**Expected**: `{ "translated": "नमस्ते", ... }`

#### 4. Language Detection

```powershell
curl -X POST http://localhost:43120/i18n/detect-language `
  -H "Content-Type: application/json" `
  -d '{"text":"नमस्ते"}'
```

**Expected**: `{ "language": "hi", ... }`

#### 5. Web Research

```powershell
curl -X POST http://localhost:43120/api/research/web-search `
  -H "Content-Type: application/json" `
  -d '{"query":"Node.js","limit":3}'
```

**Expected**: `{ "results": [{"title":...,"url":...}, ...] }`

#### 6. Agent Activity Log

```powershell
curl http://localhost:43120/agent/activity?limit=10
```

**Expected**: `{ "entries": [...] }`

---

## 🔐 SECURITY TESTING

### 1. Input Validation

**Test: Empty Body Rejection**

```powershell
curl -X POST http://localhost:43120/models/download -H "Content-Type: application/json" -d '{}'
```

**Expected**: `400 Bad Request` with validation errors

**Test: Invalid URL**

```powershell
curl -X POST http://localhost:43120/models/download `
  -H "Content-Type: application/json" `
  -d '{"id":"test","name":"test","url":"not-a-url"}'
```

**Expected**: `400 Bad Request` with "Invalid URL" error

**Test: Path Traversal**

```powershell
curl -X POST http://localhost:43120/runtime/models/import `
  -H "Content-Type: application/json" `
  -d '{"filePath":"../../etc/passwd","name":"malicious","type":"code"}'
```

**Expected**: `400 Bad Request` (path validation should reject)

### 2. Authentication (After JWT Integration)

**Test: No Token**

```powershell
curl -X POST http://localhost:43120/models/download `
  -H "Content-Type: application/json" `
  -d '{"id":"qwen","name":"Qwen","url":"https://example.com/model.gguf"}'
```

**Expected**: `401 Unauthorized` (if endpoint is protected)

**Test: Invalid Token**

```powershell
curl -X POST http://localhost:43120/models/download `
  -H "Authorization: Bearer invalid-token" `
  -H "Content-Type: application/json" `
  -d '{"id":"qwen","name":"Qwen","url":"https://example.com/model.gguf"}'
```

**Expected**: `401 Unauthorized`

**Test: Valid Token**

```powershell
# First, login to get token
$response = curl -X POST http://localhost:43120/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"test","password":"test"}' | ConvertFrom-Json

$token = $response.accessToken

# Then use token
curl -X POST http://localhost:43120/models/download `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"id":"qwen","name":"Qwen","url":"https://example.com/model.gguf"}'
```

**Expected**: `200 OK` with download started

### 3. Permission System

**Test: Permission Denied**

```powershell
# Assuming user has no 'downloadModel' permission
curl -X POST http://localhost:43120/models/download `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"id":"qwen","name":"Qwen","url":"https://example.com/model.gguf"}'
```

**Expected**: `403 Forbidden` with "Permission denied"

---

## 🌐 MULTILINGUAL TESTING

### Test All 18 Languages

```powershell
# Hindi
curl -X POST http://localhost:43120/i18n/detect-language -H "Content-Type: application/json" -d '{"text":"नमस्ते"}'
# Expected: {"language":"hi"}

# Bengali
curl -X POST http://localhost:43120/i18n/detect-language -H "Content-Type: application/json" -d '{"text":"হ্যালো"}'
# Expected: {"language":"bn"}

# Tamil
curl -X POST http://localhost:43120/i18n/detect-language -H "Content-Type: application/json" -d '{"text":"வணக்கம்"}'
# Expected: {"language":"ta"}

# Telugu
curl -X POST http://localhost:43120/i18n/detect-language -H "Content-Type: application/json" -d '{"text":"హలో"}'
# Expected: {"language":"te"}

# (Test remaining 14 languages similarly)
```

### Translation Round-Trip Test

```powershell
# Translate English → Hindi
$hiResponse = curl -X POST http://localhost:43120/i18n/translate `
  -H "Content-Type: application/json" `
  -d '{"text":"Hello World","source":"en","target":"hi"}' | ConvertFrom-Json

# Translate Hindi → English
$enResponse = curl -X POST http://localhost:43120/i18n/translate `
  -H "Content-Type: application/json" `
  -d "{\"text\":\"$($hiResponse.translated)\",\"source\":\"hi\",\"target\":\"en\"}" | ConvertFrom-Json

# Should be similar to original
Write-Host "Original: Hello World"
Write-Host "Round-trip: $($enResponse.translated)"
```

**Expected**: Similar output (may not be exact)

---

## 🤖 AGENTS & MCP TESTING

### Agent Task Execution

```powershell
# Create agent task
curl -X POST http://localhost:43120/agent/tasks/start `
  -H "Content-Type: application/json" `
  -d '{
    "title": "Search for Node.js tutorials",
    "steps": [
      {"type": "web-search", "query": "Node.js tutorial", "limit": 3}
    ]
  }'
```

**Expected**: `{ "id": "task-...", "status": "queued", ... }`

### MCP Tool Call (After Security Fix)

```powershell
# List available MCP servers
curl http://localhost:43120/mcp/servers

# Connect to MCP server
curl -X POST http://localhost:43120/mcp/servers/myserver/connect

# Call MCP tool
curl -X POST http://localhost:43120/mcp/tools/call `
  -H "Content-Type: application/json" `
  -d '{"toolName":"search","args":{"query":"test"}}'
```

**Expected**: Tool execution result

---

## ⚡ PERFORMANCE TESTING

### Cache Hit Rate

```powershell
# First request (cache miss)
Measure-Command {
  curl -X POST http://localhost:43120/i18n/translate `
    -H "Content-Type: application/json" `
    -d '{"text":"Hello","source":"en","target":"hi"}' | Out-Null
}

# Second request (cache hit)
Measure-Command {
  curl -X POST http://localhost:43120/i18n/translate `
    -H "Content-Type: application/json" `
    -d '{"text":"Hello","source":"en","target":"hi"}' | Out-Null
}
```

**Expected**: Second request should be 50-100x faster

### Cache Statistics

```powershell
curl http://localhost:43120/cache/stats
```

**Expected**: `{ "hits": 10, "misses": 5, "hitRate": 0.67, ... }`

---

## 📊 MONITORING & LOGGING

### Agent Activity

```powershell
# Get recent activity
curl http://localhost:43120/agent/activity?limit=50

# Get audit logs (if endpoint exists)
curl http://localhost:43120/audit/query?startTime=0&limit=100
```

### Log File Locations

```powershell
# Agent activity log
cat ~/.codin/logs/agent_activity.jsonl | Select-Object -Last 10

# MCP tool calls
cat ~/.codin/logs/mcp_tool_calls.jsonl | Select-Object -Last 10

# Audit logs
cat ~/.codin/logs/audit-logs/*.jsonl | Select-Object -Last 10
```

---

## 🧪 AUTOMATED TESTING

### Run Unit Tests

```powershell
# In packages/agent directory
cd packages/agent

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- test/security/validation.test.js
```

**Expected**: All tests pass, coverage >80%

### Run Integration Tests

```powershell
# Start server first
npm start &

# Run integration tests
npm run test:integration
```

### Run Security Tests

```powershell
# Run security test suite
npm run test:security
```

**Expected**: No vulnerabilities found

---

## 🏗️ BUILD & DEPLOYMENT

### Build Extension

```powershell
cd packages/extension
npm run esbuild
```

**Expected**: No errors, `out/` directory created

### Build Agent (if TypeScript)

```powershell
cd packages/agent
npm run build
```

### Lint Check

```powershell
npm run lint
```

**Expected**: No lint errors

### Type Check

```powershell
npm run typecheck
```

**Expected**: No type errors

---

## 🐳 DOCKER TESTING

### Build Docker Image

```bash
docker build -t codin-agent .
```

### Run Docker Container

```bash
docker run -p 43120:43120 -v ~/.codin:/root/.codin codin-agent
```

### Verify Docker Container

```bash
curl http://localhost:43120/health
```

---

## 📝 CI/CD VERIFICATION

### GitHub Actions (Local Simulation)

```powershell
# Install act (GitHub Actions local runner)
# https://github.com/nektos/act

# Run CI workflow locally
act -j test
```

### Check CI Status (After Push)

```powershell
# View latest workflow run
gh run list --limit 1

# View workflow logs
gh run view --log
```

---

## 🔍 REGRESSION TESTING

### Endpoint Checklist

Run this script to test all 58 endpoints:

```powershell
# test-all-endpoints.ps1

$endpoints = @(
    @{Method="GET"; Path="/health"; ExpectCode=200},
    @{Method="GET"; Path="/models"; ExpectCode=200},
    @{Method="POST"; Path="/models/download"; Body='{"id":"t","name":"t","url":"http://x.com/t.gguf"}'; ExpectCode=400},
    # ... add all 58 endpoints
)

foreach ($endpoint in $endpoints) {
    Write-Host "Testing $($endpoint.Method) $($endpoint.Path)..."

    $params = @{
        Uri = "http://localhost:43120$($endpoint.Path)"
        Method = $endpoint.Method
    }

    if ($endpoint.Body) {
        $params.ContentType = "application/json"
        $params.Body = $endpoint.Body
    }

    try {
        $response = Invoke-WebRequest @params -UseBasicParsing
        if ($response.StatusCode -eq $endpoint.ExpectCode) {
            Write-Host "  ✅ PASS" -ForegroundColor Green
        } else {
            Write-Host "  ❌ FAIL (got $($response.StatusCode))" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

---

## 🎯 SUCCESS CRITERIA

### Minimum Requirements for 9/10 Rating

- ✅ All 58 endpoints respond correctly
- ✅ Zero security vulnerabilities (validation, auth, permissions)
- ✅ Test coverage >80%
- ✅ All 18 languages working
- ✅ Cache hit rate >50% for repeat queries
- ✅ Agent tasks execute successfully
- ✅ MCP tools work (or gracefully fail offline)
- ✅ CI/CD pipeline passes
- ✅ No lint/type errors
- ✅ Documentation complete

### Performance Benchmarks

| Operation              | Target  | Command                                                  |
| ---------------------- | ------- | -------------------------------------------------------- |
| Health check           | <10ms   | `Measure-Command { curl http://localhost:43120/health }` |
| Translation (cached)   | <5ms    | (After cache warm-up)                                    |
| Translation (uncached) | <2000ms | (First time)                                             |
| Web search             | <3000ms | (Network dependent)                                      |
| Language detection     | <100ms  |                                                          |

---

## 🔧 TROUBLESHOOTING

### Server Won't Start

```powershell
# Check if port is already in use
netstat -ano | Select-String "43120"

# Kill process if needed
Stop-Process -Id <PID> -Force

# Check logs
cat ~/.codin/logs/agent_activity.jsonl | Select-Object -Last 20
```

### Tests Failing

```powershell
# Clear cache and reinstall
rm -r node_modules
rm package-lock.json
npm install

# Run tests in verbose mode
npm test -- --verbose
```

### Endpoint Returns 500

```powershell
# Check server logs
# Look in terminal where npm start was run

# Check error logs
cat ~/.codin/logs/errors.log
```

---

## 📞 VERIFICATION CHECKLIST

Before declaring "9/10" complete, verify:

- [ ] All prerequisites installed
- [ ] Agent server starts without errors
- [ ] Health endpoint returns 200
- [ ] All 58 endpoints validated
- [ ] JWT authentication working
- [ ] Permission system fail-closed
- [ ] Cache wired and working
- [ ] All 18 languages tested
- [ ] Agent tasks execute
- [ ] MCP tools safe (or disabled)
- [ ] Unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] Security tests pass
- [ ] No lint errors
- [ ] No type errors
- [ ] CI/CD pipeline green
- [ ] Docker build succeeds
- [ ] Performance benchmarks met
- [ ] Documentation updated

---

**End of Verification Guide**
