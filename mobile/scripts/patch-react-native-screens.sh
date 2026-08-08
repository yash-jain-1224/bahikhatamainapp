#!/bin/bash
# Patch react-native-screens codegen specs for RN 0.79 compatibility
# The issue: RN 0.79 codegen does not support `import type { CodegenTypes as CT }` namespace pattern
# Fix: Replace CT.X with directly imported X types from react-native

FABRIC_DIR="node_modules/react-native-screens/src/fabric"

if [ ! -d "$FABRIC_DIR" ]; then
  echo "react-native-screens fabric dir not found, skipping patch"
  exit 0
fi

echo "[patch] Patching react-native-screens codegen specs for RN 0.79 compatibility..."

# Find all .ts files that use CodegenTypes as CT
find "$FABRIC_DIR" -name "*.ts" -type f | while read -r file; do
  if grep -q "CodegenTypes as CT" "$file"; then
    echo "[patch] Patching $file"
    
    # Collect all CT.X usages to know which types to import
    CT_TYPES=$(grep -oE 'CT\.[A-Za-z]+' "$file" | sed 's/CT\.//' | sort -u | tr '\n' ', ' | sed 's/,$//')
    
    # Replace the import line: extract existing non-CT imports
    # Pattern: import type { CodegenTypes as CT, ViewProps, ColorValue } from 'react-native';
    # or multiline: import type {\n  CodegenTypes as CT,\n  ViewProps,...\n} from 'react-native';
    
    # Use perl for multiline-safe replacement
    # Step 1: Replace CT.WithDefault with WithDefault, CT.Float with Float, etc.
    sed -i '' 's/CT\.WithDefault/WithDefault/g' "$file"
    sed -i '' 's/CT\.Float/Float/g' "$file"
    sed -i '' 's/CT\.Int32/Int32/g' "$file"
    sed -i '' 's/CT\.Double/Double/g' "$file"
    sed -i '' 's/CT\.DirectEventHandler/DirectEventHandler/g' "$file"
    sed -i '' 's/CT\.BubblingEventHandler/BubblingEventHandler/g' "$file"
    sed -i '' 's/CT\.UnsafeObject/UnsafeObject/g' "$file"
    sed -i '' 's/CT\.UnsafeMixed/UnsafeMixed/g' "$file"
    sed -i '' 's/CT\.EventEmitter/EventEmitter/g' "$file"
    
    # Step 2: Replace "CodegenTypes as CT, " or "CodegenTypes as CT" in import with the actual types
    # We need to figure out which types are used and add them
    USED_TYPES=""
    grep -q "WithDefault" "$file" && USED_TYPES="$USED_TYPES WithDefault,"
    grep -q "Float[^a-zA-Z]" "$file" && grep -q "Float" "$file" && {
      # Only add Float if it's used as a type, not in a word
      echo "$file" | grep -q "" && USED_TYPES="$USED_TYPES Float,"
    }
    grep -q "Int32" "$file" && USED_TYPES="$USED_TYPES Int32,"
    grep -q "Double[^a-zA-Z]" "$file" && USED_TYPES="$USED_TYPES Double,"
    grep -q "DirectEventHandler" "$file" && USED_TYPES="$USED_TYPES DirectEventHandler,"
    grep -q "BubblingEventHandler" "$file" && USED_TYPES="$USED_TYPES BubblingEventHandler,"
    grep -q "UnsafeObject" "$file" && USED_TYPES="$USED_TYPES UnsafeObject,"
    grep -q "UnsafeMixed" "$file" && USED_TYPES="$USED_TYPES UnsafeMixed,"
    grep -q "EventEmitter" "$file" && USED_TYPES="$USED_TYPES EventEmitter,"
    
    # Remove trailing comma and leading space
    USED_TYPES=$(echo "$USED_TYPES" | sed 's/^ //' | sed 's/,$//')
    
    # Replace "CodegenTypes as CT, " with actual types
    sed -i '' "s/CodegenTypes as CT, /$USED_TYPES, /g" "$file"
    sed -i '' "s/CodegenTypes as CT/$USED_TYPES/g" "$file"
    
    # Also handle the multiline case where CodegenTypes as CT is on its own line
    sed -i '' "/^  CodegenTypes as CT,$/d" "$file"
  fi
done

echo "[patch] Done patching react-native-screens"
