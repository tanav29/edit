#!/bin/bash
cd /home/thetanav/c/p/edit

bun --bun next dev &
NEXT_PID=$!

for i in {1..20}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200"; then
    break
  fi
  sleep 1
done

trap "kill $NEXT_PID 2>/dev/null; exit" INT TERM

/usr/bin/electron39 . \
  --no-sandbox \
  --disable-gpu \
  --disable-software-rasterizer \
  --disable-dev-shm-usage \
  --disable-gpu-sandbox \
  --disable-gpu-compositing \
  --disable-accelerated-video-decode \
  --use-gl=swiftshader

kill $NEXT_PID 2>/dev/null