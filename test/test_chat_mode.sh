#!/bin/bash

# Test the updated backend with mode=chat
curl -X POST http://localhost:8091/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello, who are you?",
    "character": "Melquíades", 
    "mode": "chat"
  }'
