# Test the updated backend with mode=chat
Invoke-RestMethod -Uri "http://localhost:8091/api/ai/generate" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{
    "prompt": "Hello, who are you?",
    "character": "Melquíades", 
    "mode": "chat"
  }'
