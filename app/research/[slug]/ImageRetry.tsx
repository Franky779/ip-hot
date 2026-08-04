'use client'

import { useEffect } from 'react'

/**
 * Watches for broken images in research reports and retries loading them.
 * Browsers limit concurrent connections per domain (6-8), so pages with
 * 62 images inevitably have some timeout. Retrying with a staggered delay
 * lets them succeed on subsequent attempts.
 */
export function ImageRetry() {
  useEffect(() => {
    const RETRY_DELAY_MS = 2000
    const MAX_RETRIES = 3
    let retryTimers: ReturnType<typeof setTimeout>[] = []

    const retryImage = (img: HTMLImageElement, attempt: number) => {
      if (attempt > MAX_RETRIES) return
      const originalSrc = img.getAttribute('data-original-src') || img.src
      if (!img.getAttribute('data-original-src')) {
        img.setAttribute('data-original-src', originalSrc)
      }
      // Stagger retries to avoid thundering herd
      const delay = RETRY_DELAY_MS * attempt + Math.random() * 1000
      const timer = setTimeout(() => {
        const fresh = new Image()
        fresh.onload = () => {
          img.src = originalSrc
          img.classList.remove('research-img-retrying')
        }
        fresh.onerror = () => {
          if (attempt < MAX_RETRIES) retryImage(img, attempt + 1)
          else img.classList.remove('research-img-retrying')
        }
        fresh.src = originalSrc + (originalSrc.includes('?') ? '&' : '?') + '_retry=' + attempt
        img.classList.add('research-img-retrying')
      }, delay)
      retryTimers.push(timer)
    }

    const handleError = (e: Event) => {
      const img = e.target as HTMLImageElement
      if (img.tagName !== 'IMG') return
      retryImage(img, 1)
    }

    // Use capture phase to catch errors on dynamically loaded images
    document.addEventListener('error', handleError, true)

    return () => {
      document.removeEventListener('error', handleError, true)
      retryTimers.forEach(clearTimeout)
    }
  }, [])

  return null
}
