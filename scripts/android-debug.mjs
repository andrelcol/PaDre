import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const javaHome =
  process.env.JAVA_HOME && process.env.JAVA_HOME.length > 0
    ? process.env.JAVA_HOME
    : '/usr/lib/jvm/java-21-openjdk-amd64'

const gradle = spawnSync('./gradlew', ['assembleDebug'], {
  cwd: path.join(root, 'android'),
  env: { ...process.env, JAVA_HOME: javaHome },
  stdio: 'inherit',
})

if (gradle.status !== 0) {
  process.exit(gradle.status ?? 1)
}

const apk = path.join(
  root,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk',
)
const outputDir = path.join(root, 'artifacts', 'android')
const output = path.join(outputDir, 'padre-debug.apk')
await mkdir(outputDir, { recursive: true })
await copyFile(apk, output)
const info = await stat(output)
const note = [
  `file: ${output}`,
  `bytes: ${info.size}`,
  `built_at: ${new Date().toISOString()}`,
  'application_id: com.padre.sportsclub.dev',
  'version_name: 0.1.0-dev',
  'build_type: debug',
  '',
].join('\n')
await writeFile(path.join(outputDir, 'build-info.txt'), note)
console.log(note)
