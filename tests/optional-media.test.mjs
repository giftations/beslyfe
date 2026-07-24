import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const read = (path) => fs.readFileSync(path, 'utf8')
const commonSource = read('beslyfe-social.js')
const studioSource = read('studio.js')
const messageSource = read('messages.js')
const groupSource = read('groups.js')
const librarySource = read('library.js')
const feedSource = read('feed.js')
const profileEditSource = read('profile-edit.html')
const socialApiSource = read('netlify/functions/social.mjs')

function loadCommon({ fetchImpl, urlApi, canvasFactory } = {}) {
  let imageLoads = 0
  class TestFileReader {
    readAsDataURL(file) {
      this.result = `data:${file.type || 'application/octet-stream'};base64,${file.testBase64 || 'dGVzdA=='}`
      this.onload()
    }
  }
  class TestImage {
    constructor() {
      this.naturalWidth = 16
      this.naturalHeight = 16
    }
    set src(value) {
      this._src = value
      imageLoads += 1
      this.onload()
    }
  }
  const urls = urlApi || {
    createObjectURL() { return 'blob:test-image' },
    revokeObjectURL() {},
  }
  const context = {
    window: { URL: urls },
    document: {
      body: { classList: { toggle() {} } },
      dispatchEvent() {},
      createElement() {
        if (canvasFactory) return canvasFactory()
        throw new Error('Canvas should not be needed by this fixture')
      },
    },
    localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
    CustomEvent: function CustomEvent() {},
    FileReader: TestFileReader,
    Image: TestImage,
    URL: urls,
    fetch: fetchImpl || (() => Promise.reject(new Error('Unexpected fetch'))),
    console,
    setTimeout,
    clearTimeout,
  }
  vm.createContext(context)
  vm.runInContext(commonSource, context, { filename: 'beslyfe-social.js' })
  return { social: context.window.BeslyfeSocial, imageLoads: () => imageLoads }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

test('shared media preparation distinguishes videos from images', async () => {
  const loaded = loadCommon()
  const social = loaded.social

  assert.equal(social.mediaKindForFile({ name: 'clip.mp4', type: 'video/mp4' }), 'video')
  assert.equal(social.mediaKindForFile({ name: 'clip.MOV', type: '' }), 'video')
  assert.equal(social.mediaKindForFile({ name: 'photo.webp', type: 'image/webp' }), 'image')
  assert.equal(social.mediaKindForFile({ name: 'photo.JPG', type: '' }), 'image')
  assert.equal(social.mediaKindForFile({ name: 'notes.txt', type: 'text/plain' }), '')

  const video = await social.prepareMediaForUpload({ name: 'clip.mp4', type: 'video/mp4' })
  assert.equal(video.contentType, 'video/mp4')
  assert.equal(loaded.imageLoads(), 0, 'video must never enter the image decoder')

  const mimeLessJpeg = await social.prepareMediaForUpload({ name: 'photo.JPG', type: '', size: 100 })
  const mimeLessPng = await social.prepareMediaForUpload({ name: 'photo.PNG', type: '', size: 100 })
  assert.equal(mimeLessJpeg.contentType, '')
  assert.equal(mimeLessPng.contentType, '')
  assert.equal(loaded.imageLoads(), 2)
})

test('MIME-less images keep filename inference when canvas is unavailable', async () => {
  const { social } = loadCommon({
    canvasFactory: () => ({
      getContext() { return null },
      toDataURL() { return '' },
    }),
  })
  const prepared = await social.prepareMediaForUpload({
    name: 'large.PNG',
    type: '',
    size: 3 * 1024 * 1024,
  })
  assert.equal(prepared.contentType, '')
  assert.equal(prepared.filename, 'large.PNG')
})

test('large videos use bounded chunks and never request an image', async () => {
  const calls = []
  const fileSize = 5 * 1024 * 1024
  const file = {
    name: 'reel.mp4',
    type: 'video/mp4',
    size: fileSize,
    slice(start, end) { return { start, end, size: end - start } },
  }
  const { social, imageLoads } = loadCommon({
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (options.method === 'PUT') return jsonResponse({ ok: true })
      const body = JSON.parse(options.body)
      if (body.action === 'initUpload') {
        return jsonResponse({
          uploadId: 'upload_1',
          chunkSize: 2 * 1024 * 1024,
          totalChunks: 3,
        }, 201)
      }
      if (body.action === 'finishUpload') {
        return jsonResponse({ ok: true, kind: 'video', url: '/media/reel' })
      }
      throw new Error('Unexpected upload action')
    },
  })

  const result = await social.uploadMediaFile(file)
  assert.equal(result.kind, 'video')
  assert.equal(result.url, '/media/reel')
  assert.equal(imageLoads(), 0)

  const puts = calls.filter((call) => call.options.method === 'PUT')
  assert.equal(puts.length, 3)
  assert.equal(puts[0].options.headers['Content-Range'], `bytes 0-${2 * 1024 * 1024 - 1}/${fileSize}`)
  assert.equal(puts[2].options.headers['Content-Range'], `bytes ${4 * 1024 * 1024}-${fileSize - 1}/${fileSize}`)
  assert.ok(puts.every((call) => call.options.body.size <= 2 * 1024 * 1024))
})

test('supported images that remain above the direct limit use resumable chunks', async () => {
  const calls = []
  const fileSize = 4 * 1024 * 1024
  const file = {
    name: 'poster.svg',
    type: 'image/svg+xml',
    size: fileSize,
    testBase64: 'A'.repeat(Math.ceil((fileSize * 4) / 3)),
    slice(start, end) { return { start, end, size: end - start } },
  }
  const { social } = loadCommon({
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (options.method === 'PUT') return jsonResponse({ ok: true })
      const body = JSON.parse(options.body)
      if (body.action === 'initUpload') {
        return jsonResponse({
          uploadId: 'upload_image_1',
          chunkSize: 2 * 1024 * 1024,
          totalChunks: 2,
        }, 201)
      }
      if (body.action === 'finishUpload') {
        return jsonResponse({ ok: true, kind: 'image', url: '/media/poster' })
      }
      throw new Error('Unexpected upload action')
    },
  })

  const result = await social.uploadMediaFile(file)
  assert.equal(result.kind, 'image')
  assert.equal(calls.filter((call) => call.options.method === 'PUT').length, 2)
})

test('large-media previews use revocable object URLs instead of Base64 copies', async () => {
  const revoked = []
  const { social } = loadCommon({
    urlApi: {
      createObjectURL() { return 'blob:preview-1' },
      revokeObjectURL(url) { revoked.push(url) },
    },
  })
  const preview = await social.createMediaPreview({ name: 'large.mp4', type: 'video/mp4' })
  assert.equal(preview.preview, 'blob:preview-1')
  assert.equal(preview.previewObjectUrl, true)
  social.releaseMediaPreview(preview)
  assert.deepEqual(revoked, ['blob:preview-1'])
})

test('every mixed-media surface uses the shared uploader', () => {
  for (const [name, source] of [
    ['Studio', studioSource],
    ['messages', messageSource],
    ['groups', groupSource],
    ['library', librarySource],
  ]) {
    assert.match(source, /S\.uploadMediaFile/, `${name} uses the shared media uploader`)
    assert.doesNotMatch(source, /S\.prepareImageForUpload/, `${name} never invokes the image-only helper`)
    new vm.Script(source, { filename: `${name}.js` })
  }
  for (const [name, source] of [
    ['Studio', studioSource],
    ['messages', messageSource],
    ['groups', groupSource],
  ]) {
    assert.match(source, /S\.createMediaPreview/, `${name} uses bounded object-URL previews`)
    assert.match(source, /S\.releaseMediaPreview/, `${name} releases object-URL previews`)
    assert.doesNotMatch(source, /readAsDataURL/, `${name} does not Base64-copy large previews`)
  }
})

test('posts and stories allow text without media while reels still require video', () => {
  assert.match(studioSource, /mode === 'reel' && \(!state\.media \|\| state\.media\.kind !== 'video'\)/)
  assert.match(studioSource, /mode !== 'reel' && !caption && !state\.media/)
  assert.doesNotMatch(studioSource, /mode === 'story' && !state\.media/)

  assert.match(socialApiSource, /if \(!text && !imageUrl && !videoUrl\)/)
  assert.match(socialApiSource, /postType === 'reel' && !videoUrl/)
  assert.doesNotMatch(socialApiSource, /postType === 'post' && !imageUrl/)
  assert.match(feedSource, /choose an optional photo/)
  assert.match(profileEditSource, /Profile Photo[\s\S]*\(optional\)/)
})

test('async sends snapshot their destination and reuse successful media uploads', () => {
  assert.match(studioSource, /var draftMode = mode/)
  assert.match(studioSource, /setBusy\(true\)/)
  assert.match(studioSource, /!overlay\.isConnected \|\| fileInput\.files\[0\] !== f/)
  assert.match(studioSource, /draftMedia\.file = null/)
  assert.match(studioSource, /draftMedia\.url = d\.url/)

  assert.match(messageSource, /var targetPartnerId = partner\.id/)
  assert.match(messageSource, /var submittedMedia = pendingMedia/)
  assert.match(messageSource, /submittedMedia\.url\s*\?\s*Promise\.resolve/)
  assert.match(messageSource, /document\.getElementById\('dmForm'\) === form/)
  assert.match(messageSource, /currentPartner === partner[\s\S]*document\.getElementById\('dmFile'\) === fileInput/)
  assert.match(messageSource, /var requestedPartnerId = openWith/)
  assert.match(messageSource, /if \(sending\) return/)

  assert.match(groupSource, /var targetGroupId = openGroupId/)
  assert.match(groupSource, /var submittedMedia = groupMedia/)
  assert.match(groupSource, /groupId: targetGroupId/)
  assert.match(groupSource, /chatEl\.querySelector\('#gcForm'\) === f/)
  assert.match(groupSource, /openGroupId === g\.id[\s\S]*chatEl\.querySelector\('#gcFile'\) === fileInput/)
  assert.match(groupSource, /var requestedGroupId = openGroupId/)
  assert.match(groupSource, /if \(sending\) return/)
})
