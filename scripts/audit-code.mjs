import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const root = process.cwd()
const paths = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n')
const sources = [...new Set(paths)].filter(p => /^(src|server\/src)\/.*\.(tsx?|css|sql)$/.test(p) && fs.existsSync(p)).sort()
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noUnusedLocals: true, noUnusedParameters: true })
const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => [6133, 6192, 6196, 6138].includes(d.code))
const graph = new Map()
const inventory = sources.map(file => {
  const raw = fs.readFileSync(file, 'utf8')
  const imports = []
  if (/\.tsx?$/.test(file)) {
    const source = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true)
    const walk = node => {
      let spec
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) spec = node.moduleSpecifier
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) spec = node.arguments[0]
      if (spec && ts.isStringLiteral(spec) && spec.text.startsWith('.')) {
        const target = ts.resolveModuleName(spec.text, path.resolve(file), parsed.options, ts.sys).resolvedModule?.resolvedFileName
        if (target && !target.includes('node_modules')) imports.push(path.relative(root, target))
      }
      ts.forEachChild(node, walk)
    }
    walk(source)
  }
  graph.set(file, imports)
  return { file, lines: raw.split('\n').length, bytes: Buffer.byteLength(raw), imports: [...new Set(imports)],
    fetch: (raw.match(/\bfetch\(/g) || []).length,
    htmlSinks: (raw.match(/innerHTML|dangerouslySetInnerHTML|srcDoc/g) || []).length,
    storage: (raw.match(/localStorage|indexedDB/g) || []).length }
})
const reachable = new Set()
function visit(file) { if (reachable.has(file)) return; reachable.add(file); for (const child of graph.get(file) || []) visit(child) }
visit('src/main.tsx'); visit('server/src/index.ts')
const unused = diagnostics.map(d => {
  const at = d.file.getLineAndCharacterOfPosition(d.start)
  return { file: path.relative(root, d.file.fileName), line: at.line + 1, message: ts.flattenDiagnosticMessageText(d.messageText, ' ') }
})
const report = { generatedAt: new Date().toISOString(), sourceFiles: sources.length, lines: inventory.reduce((n,x)=>n+x.lines,0),
  unreachableModules: sources.filter(f=> /\.tsx?$/.test(f) && !f.endsWith('.d.ts') && !reachable.has(f)), unused, inventory }
fs.mkdirSync('docs/audit', { recursive: true })
fs.writeFileSync('docs/audit/code-inventory.json', JSON.stringify(report, null, 2)+'\n')
console.log(JSON.stringify({ files: report.sourceFiles, lines: report.lines, unreachable: report.unreachableModules, unused: unused.length,
  largest: [...inventory].sort((a,b)=>b.lines-a.lines).slice(0,10).map(({file,lines})=>({file,lines})) }, null, 2))
