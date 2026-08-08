#!/usr/bin/env node
/**
 * Patch react-native-screens codegen specs for RN 0.79 compatibility.
 * 
 * Problem: react-native-screens 4.24.0 uses `import type { CodegenTypes as CT }` 
 * and then references types as CT.WithDefault, CT.Float, etc. RN 0.79's codegen 
 * parser cannot resolve types accessed through namespace aliases.
 * 
 * Fix: Replace `CodegenTypes as CT` with direct type imports and replace all 
 * `CT.X` references with just `X`.
 */

const fs = require('fs');
const path = require('path');

const FABRIC_DIR = path.join(__dirname, '..', 'node_modules', 'react-native-screens', 'src', 'fabric');

if (!fs.existsSync(FABRIC_DIR)) {
  console.log('[patch] react-native-screens fabric dir not found, skipping');
  process.exit(0);
}

// All known CodegenTypes exports
const CODEGEN_TYPES = [
  'WithDefault',
  'Float',
  'Int32',
  'Double',
  'DirectEventHandler',
  'BubblingEventHandler',
  'UnsafeObject',
  'UnsafeMixed',
  'EventEmitter',
];

function findTsFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('CodegenTypes as CT')) {
    return false;
  }
  
  const relPath = path.relative(path.join(__dirname, '..'), filePath);
  console.log(`[patch] Patching ${relPath}`);
  
  // Step 1: Find which CT.X types are used
  const usedTypes = new Set();
  for (const typeName of CODEGEN_TYPES) {
    const regex = new RegExp(`CT\\.${typeName}\\b`, 'g');
    if (regex.test(content)) {
      usedTypes.add(typeName);
    }
  }
  
  // Step 2: Replace all CT.X with X
  for (const typeName of CODEGEN_TYPES) {
    const regex = new RegExp(`CT\\.${typeName}\\b`, 'g');
    content = content.replace(regex, typeName);
  }
  
  // Step 3: Replace the import statement
  // Handle single-line: import type { CodegenTypes as CT, ViewProps, ColorValue } from 'react-native';
  // Handle multi-line imports too
  
  const usedTypesStr = Array.from(usedTypes).join(', ');
  
  // Single-line pattern
  content = content.replace(
    /import type \{([^}]*?)CodegenTypes as CT,?\s*([^}]*?)\} from 'react-native';/g,
    (match, before, after) => {
      let types = [];
      // Parse existing types (before and after CodegenTypes as CT)
      const existing = (before + after)
        .split(',')
        .map(t => t.trim())
        .filter(t => t && t !== 'CodegenTypes as CT');
      
      types.push(...existing);
      types.push(...usedTypes);
      
      // Deduplicate
      const unique = [...new Set(types)];
      return `import type { ${unique.join(', ')} } from 'react-native';`;
    }
  );
  
  // Multi-line pattern: handle cases where CodegenTypes as CT is on its own line
  // e.g.:
  // import type {
  //   CodegenTypes as CT,
  //   ViewProps,
  // } from 'react-native';
  content = content.replace(
    /import type \{([\s\S]*?)CodegenTypes as CT,?([\s\S]*?)\} from 'react-native';/g,
    (match, before, after) => {
      let types = [];
      const existing = (before + after)
        .split(',')
        .map(t => t.trim())
        .filter(t => t && t !== 'CodegenTypes as CT' && t !== '');
      
      types.push(...existing);
      types.push(...usedTypes);
      
      const unique = [...new Set(types)];
      return `import type { ${unique.join(', ')} } from 'react-native';`;
    }
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

console.log('[patch] Patching react-native-screens codegen specs for RN 0.79...');

const files = findTsFiles(FABRIC_DIR);
let patched = 0;

for (const file of files) {
  if (patchFile(file)) {
    patched++;
  }
}

console.log(`[patch] Done! Patched ${patched} files.`);
