import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { config as zodConfig } from 'zod/v4/core'

import { AGENT_CONNECT_CONTINUATION_PATCH } from '@ai-sdk/open-responses'
import {
  beginOpenClawAuthorization,
  completeOpenClawAuthorization,
  createAiSdkApplicationTools,
  createAiSdkOpenResponsesGenerationOptions,
  createAiSdkOpenResponsesModel,
  createAiSdkOpenResponsesPrepareStep,
  createOpenClawAccessTokenGetter,
  createOpenClawConversationClient,
  discoverOpenClawProvider,
  getOpenClawConnectionProviderUrl,
  normalizeOpenClawProviderUrl,
  OpenClawConversationUnavailableError,
  parseOpenClawConnection,
  parseOpenClawAuthorizationTransaction,
  refreshOpenClawConnection,
  revokeOpenClawConnection,
  selectAiSdkOpenResponsesCheckpoint,
  serializeOpenClawAuthorizationTransaction,
  serializeOpenClawConnection,
} from '@open-agent-connect/web'

const expected = {
  '@ai-sdk/open-responses': '2.0.39',
  '@open-agent-connect/web': '0.0.5',
  ai: '7.0.93',
  'patch-package': '8.0.1',
  zod: '4.4.3',
}

for (const [name, version] of Object.entries(expected)) {
  const packageJson = JSON.parse(
    await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8'),
  )
  if (packageJson.version !== version) {
    throw new Error(`Expected ${name}@${version}, found ${packageJson.version}`)
  }
}

const sdkPackage = JSON.parse(await readFile(
  new URL('../node_modules/@open-agent-connect/web/package.json', import.meta.url), 'utf8',
))
if (!sdkPackage.sideEffects?.includes('./dist/zod-jitless.js') ||
    sdkPackage.dependencies.zod !== expected.zod || zodConfig().jitless !== true) {
  throw new Error('The shared Zod jitless bootstrap or bundler side-effect declaration is missing')
}

const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const lockedSdk = lockfile.packages?.['node_modules/@open-agent-connect/web']
const expectedSdkResolution = {
  resolved: 'https://registry.npmjs.org/@open-agent-connect/web/-/web-0.0.5.tgz',
  integrity: 'sha512-CeVflg552UJgRG6f3nyAtPKI0lKXDvVq40H6GbQLC6C2gT2Kq8STyGg8LQcHXRIzmhyoRZ7XH95sugoAjKkV/w==',
}
if (lockedSdk?.resolved !== expectedSdkResolution.resolved ||
    lockedSdk?.integrity !== expectedSdkResolution.integrity) {
  throw new Error('The lockfile does not select the reviewed published Web SDK 0.0.5 artifact')
}

const artifacts = [
  [
    '../patches/@ai-sdk+open-responses+2.0.39.patch',
    '99f31168f18f59f13cbc0b60ec85c0bdd302213716980ddfbac63e5e1abce571',
  ],
]

for (const [path, expectedHash] of artifacts) {
  const contents = await readFile(new URL(path, import.meta.url))
  const actualHash = createHash('sha256').update(contents).digest('hex')
  if (actualHash !== expectedHash) {
    throw new Error(`Unexpected SHA-256 for ${path}: ${actualHash}`)
  }
}

if (AGENT_CONNECT_CONTINUATION_PATCH !== '2.0.39.1') {
  throw new Error('The reviewed Open Responses continuation patch is not installed')
}

const openClawAuthorizationExports = {
  createOpenClawConversationClient,
  getOpenClawConnectionProviderUrl,
  normalizeOpenClawProviderUrl,
  OpenClawConversationUnavailableError,
  parseOpenClawConnection,
  serializeOpenClawConnection,
  beginOpenClawAuthorization,
  completeOpenClawAuthorization,
  createOpenClawAccessTokenGetter,
  discoverOpenClawProvider,
  parseOpenClawAuthorizationTransaction,
  refreshOpenClawConnection,
  revokeOpenClawConnection,
  serializeOpenClawAuthorizationTransaction,
}
for (const [name, exported] of Object.entries(openClawAuthorizationExports)) {
  if (typeof exported !== 'function') {
    throw new Error(`The public SDK root does not export ${name}`)
  }
}

const prepareStep = createAiSdkOpenResponsesPrepareStep('response-previous')
const prepared = await prepareStep({ steps: [] })
if (prepared?.providerOptions?.['agent-connect']?.previousResponseId !== 'response-previous') {
  throw new Error('The public continuation helper did not preserve the provider checkpoint')
}

const generationOptions = createAiSdkOpenResponsesGenerationOptions()
if (generationOptions.maxRetries !== 0 || typeof generationOptions.prepareStep !== 'function') {
  throw new Error('The public generation helper did not disable ambiguous request retries')
}

const model = createAiSdkOpenResponsesModel({
  endpoint: 'http://127.0.0.1:1/v1/responses',
  model: 'packaging-check',
  getAccessToken: () => 'unused-packaging-check-token',
})
if (typeof model !== 'object' || model === null) {
  throw new Error('The public model helper did not create an AI SDK language model')
}

const tools = createAiSdkApplicationTools([], { connectionId: 'packaging-check' })
if (Object.keys(tools).length !== 0) {
  throw new Error('The public application-tool helper returned unexpected tools')
}

const checkpoint = selectAiSdkOpenResponsesCheckpoint(undefined, {
  finishReason: 'stop',
  response: { id: 'response-terminal' },
  text: 'done',
})
if (checkpoint !== 'response-terminal') {
  throw new Error('The public checkpoint helper did not select a successful terminal response')
}

console.log('AI SDK packaging verified (published @open-agent-connect/web@0.0.5)')
