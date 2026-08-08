#!/bin/bash
# Start all Bahi Khata Pro services + frontend
cd "$(dirname "$0")"

exec npx concurrently \
  --names "GW,AUTH,BIZ,PUR,SAL,INV,LED,SUB,BIL,NOT,ADM,PRF,REF,EXP,WA,FE" \
  --prefix-colors "bgBlue,bgGreen,bgMagenta,bgCyan,bgYellow,bgRed,bgWhite,blue,green,magenta,cyan,yellow,red,bgYellow,bgCyan,bgGreen" \
  "npm:dev:gateway" \
  "npm:dev:auth" \
  "npm:dev:business" \
  "npm:dev:purchase" \
  "npm:dev:sales" \
  "npm:dev:inventory" \
  "npm:dev:ledger" \
  "npm:dev:subscription" \
  "npm:dev:billing" \
  "npm:dev:notification" \
  "npm:dev:admin" \
  "npm:dev:profile" \
  "npm:dev:referral" \
  "npm:dev:expense" \
  "npm:dev:whatsapp-ai" \
  "npm:dev:frontend"
