#!/bin/bash
# Batch analyze all TATAMI images
ANALYSIS_DIR="/Users/leo/Developer/street-metrics/analysis/TATAMI"
IMAGE_DIR="/Users/leo/Developer/street-metrics/images/TATAMI"
SERVER="http://localhost:3121"

total=$(ls "$IMAGE_DIR"/*.jpg | wc -l | tr -d ' ')
done=0
skipped=0
failed=0

for img in "$IMAGE_DIR"/*.jpg; do
    filename=$(basename "$img")
    jsonfile="${filename%.jpg}.json"

    # Skip if already analyzed
    if [ -f "$ANALYSIS_DIR/$jsonfile" ]; then
        skipped=$((skipped + 1))
        done=$((done + 1))
        echo "[$done/$total] SKIP $filename (already analyzed)"
        continue
    fi

    done=$((done + 1))
    echo -n "[$done/$total] Analyzing $filename... "

    response=$(curl -s -X POST "$SERVER/analyze/TATAMI" \
        -H "Content-Type: application/json" \
        -d "{\"image\": \"$filename\"}")

    success=$(echo "$response" | grep -o '"success":true')
    if [ -n "$success" ]; then
        echo "OK"
    else
        error=$(echo "$response" | grep -o '"error":"[^"]*"')
        echo "FAIL $error"
        failed=$((failed + 1))
    fi
done

echo ""
echo "Done! Total: $total, Skipped: $skipped, Failed: $failed"
