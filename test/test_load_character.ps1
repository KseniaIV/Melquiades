Invoke-RestMethod -Uri "http://localhost:5000/run/predict" -Method Post -ContentType "application/json" -Body '{"data": ["Melquíades", "", ""], "fn_index": 38}'
