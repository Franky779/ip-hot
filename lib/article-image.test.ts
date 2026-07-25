import assert from 'node:assert/strict'
import test from 'node:test'

import { extractFeedImage, extractFeedMedia, extractHtmlImage, normalizeImageUrl } from './article-image.ts'

test('normalizes safe image URLs and rejects unsafe schemes', () => {
  assert.equal(
    normalizeImageUrl('//cdn.example.com/cover.jpg', 'https://example.com/feed.xml'),
    'https://cdn.example.com/cover.jpg',
  )
  assert.equal(
    normalizeImageUrl('/images/cover.jpg', 'https://example.com/feed.xml'),
    'https://example.com/images/cover.jpg',
  )
  assert.equal(
    normalizeImageUrl('http://cdn.example.com/cover.jpg'),
    'https://cdn.example.com/cover.jpg',
  )
  assert.equal(normalizeImageUrl('data:image/png;base64,abc'), null)
  assert.equal(normalizeImageUrl('javascript:alert(1)'), null)
})

test('extracts image enclosures and ignores non-image enclosures', () => {
  assert.equal(
    extractFeedImage({ enclosure: { url: 'https://cdn.example.com/cover.webp', type: 'image/webp' } }),
    'https://cdn.example.com/cover.webp',
  )
  assert.equal(
    extractFeedImage({ enclosure: { url: 'https://cdn.example.com/audio.mp3', type: 'audio/mpeg' } }),
    null,
  )
})

test('extracts media namespace images before embedded content images', () => {
  const item = {
    mediaContent: [{ $: { url: 'https://cdn.example.com/media.jpg' } }],
    contentEncoded: '<p><img src="https://cdn.example.com/content.jpg"></p>',
  }

  assert.equal(extractFeedImage(item), 'https://cdn.example.com/media.jpg')
})

test('extracts lazy-loaded and relative images from HTML', () => {
  const html = '<p><img src="data:image/gif;base64,placeholder" data-src="/news/cover.jpg"></p>'

  assert.equal(
    extractHtmlImage(html, 'https://example.com/articles/1'),
    'https://example.com/news/cover.jpg',
  )
  assert.equal(
    extractFeedImage({ link: 'https://example.com/articles/1', content: html }),
    'https://example.com/news/cover.jpg',
  )
})

test('detects video enclosures and keeps their thumbnail as the image', () => {
  const media = extractFeedMedia({
    enclosure: { url: 'https://cdn.example.com/trailer.mp4', type: 'video/mp4' },
    mediaThumbnail: [{ $: { url: 'https://cdn.example.com/poster.jpg' } }],
  })

  assert.deepEqual(media, {
    imageUrl: 'https://cdn.example.com/poster.jpg',
    isVideo: true,
  })
})

test('does not mistake media video URLs for images', () => {
  const media = extractFeedMedia({
    mediaContent: [{
      $: { url: 'https://cdn.example.com/trailer.mp4', type: 'video/mp4' },
      'media:thumbnail': [{ $: { url: 'https://cdn.example.com/nested-poster.jpg' } }],
    }],
  })

  assert.deepEqual(media, {
    imageUrl: 'https://cdn.example.com/nested-poster.jpg',
    isVideo: true,
  })
})

test('detects embedded videos and uses a video poster without treating the video src as an image', () => {
  const media = extractFeedMedia({
    link: 'https://example.com/articles/1',
    content: '<video src="/videos/trailer.mp4" poster="/images/poster.webp"></video>',
  })

  assert.deepEqual(media, {
    imageUrl: 'https://example.com/images/poster.webp',
    isVideo: true,
  })
  assert.equal(
    extractHtmlImage('<video src="https://cdn.example.com/trailer.mp4"></video>'),
    null,
  )
})
