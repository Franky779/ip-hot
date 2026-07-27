import { MAX_IMAGE_DATA_URL_LENGTH } from './site-pages'

const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_IMAGE_EDGE = 1920

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法读取，请更换文件'))
    image.src = source
  })
}

function encodeCanvas(canvas: HTMLCanvasElement): string {
  for (let quality = 0.88; quality >= 0.48; quality -= 0.08) {
    const dataUrl = canvas.toDataURL('image/webp', quality)
    if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) return dataUrl
  }
  throw new Error('图片处理后仍超过 2 MB，请先缩小图片')
}

function drawImage(image: HTMLImageElement, rotation: -90 | 0 | 90): string {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  const rotated = rotation !== 0
  canvas.width = rotated ? height : width
  canvas.height = rotated ? width : height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法处理图片')
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(rotation * Math.PI / 180)
  context.drawImage(image, -width / 2, -height / 2, width, height)
  return encodeCanvas(canvas)
}

export async function prepareAboutImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('仅支持 PNG、JPEG 或 WebP 图片')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('原始图片不能超过 15 MB')
  const source = URL.createObjectURL(file)
  try {
    return drawImage(await loadImage(source), 0)
  } finally {
    URL.revokeObjectURL(source)
  }
}

export async function rotateAboutImage(dataUrl: string, direction: -1 | 1): Promise<string> {
  return drawImage(await loadImage(dataUrl), direction === -1 ? -90 : 90)
}
