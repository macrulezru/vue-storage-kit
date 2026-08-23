// Verifies that every path referenced by package.json's main/module/exports
// actually exists after a build, and that the package resolves through both
// ESM `import` and CJS `require`. Run as part of `prepublishOnly` so a
// packaging regression (wrong extension, missing entry, etc.) fails the
// publish instead of shipping a broken package.
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

// Resolve everything relative to the package root (cwd this script is run
// from via `npm run`), not relative to this script's own location.
const root = pathToFileURL(`${process.cwd()}/`)
const require = createRequire(root)
const pkg = require('./package.json')

let failed = false

function checkPath(label, relPath) {
  if (!existsSync(new URL(relPath, root))) {
    console.error(`✗ ${label} -> ${relPath} does not exist`)
    failed = true
    return false
  }
  console.log(`✓ ${label} -> ${relPath}`)
  return true
}

checkPath('main', pkg.main)
checkPath('module', pkg.module)
checkPath('types', pkg.types)

for (const [subpath, condition] of Object.entries(pkg.exports)) {
  if (typeof condition === 'string') {
    checkPath(`exports["${subpath}"]`, condition)
    continue
  }
  for (const [cond, relPath] of Object.entries(condition)) {
    checkPath(`exports["${subpath}"].${cond}`, relPath)
  }
}

if (failed) {
  console.error('\nPackaging check failed: package.json references files missing from dist/.')
  process.exit(1)
}

// Resolve the root entry through both module systems.
try {
  const esm = await import(new URL(pkg.exports['.'].import, root))
  console.log(`✓ ESM import resolved (${Object.keys(esm).length} exports)`)
} catch (e) {
  console.error('✗ ESM import of root entry failed:', e.message)
  failed = true
}

try {
  const cjs = require(fileURLToPath(new URL(pkg.exports['.'].require, root)))
  console.log(`✓ CJS require resolved (${Object.keys(cjs).length} exports)`)
} catch (e) {
  console.error('✗ CJS require of root entry failed:', e.message)
  failed = true
}

try {
  const nuxtModule = await import(new URL(pkg.exports['./nuxt'], root))
  if (typeof nuxtModule.default !== 'function') {
    throw new Error('default export is not a function')
  }
  console.log('✓ Nuxt module entry resolved')
} catch (e) {
  console.error('✗ ESM import of ./nuxt entry failed:', e.message)
  failed = true
}

if (failed) process.exit(1)
console.log('\nPackaging check passed.')
