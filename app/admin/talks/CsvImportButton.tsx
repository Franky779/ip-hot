'use client'

import { useState, useRef } from 'react'

interface CsvImportProps {
  columns: { key: string; label: string }[]
  onImport: (rows: Record<string, string>[]) => Promise<void>
  sampleCsv: string
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean)
  for (const line of lines) {
    const cols: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuote) {
        if (ch === '"') {
          if (line[i + 1] === '"') { current += '"'; i++ }
          else inQuote = false
        } else current += ch
      } else {
        if (ch === '"') inQuote = true
        else if (ch === ',') { cols.push(current.trim()); current = '' }
        else current += ch
      }
    }
    cols.push(current.trim())
    rows.push(cols)
  }
  return rows
}

export function CsvImportButton({ columns, onImport, sampleCsv }: CsvImportProps) {
  const [preview, setPreview] = useState<string[][] | null>(null)
  const [progress, setProgress] = useState(0)
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function close() {
    setPreview(null)
    setProgress(0)
    setImporting(false)
    setDone(false)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsv(reader.result as string)
      setPreview(rows)
      setProgress(0)
      setImporting(false)
      setDone(false)
    }
    reader.readAsText(file, 'UTF-8')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function confirm() {
    if (!preview || preview.length < 2 || importing) return
    const [header, ...dataRows] = preview
    const total = dataRows.length

    const result = dataRows.map((row) => {
      const obj: Record<string, string> = {}
      for (const col of columns) {
        const idx = header.findIndex((h) => h.trim() === col.key)
        obj[col.key] = idx >= 0 ? (row[idx] ?? '') : ''
      }
      return obj
    })

    setImporting(true)
    setProgress(0)

    // 动画进度：每个间隔随机推进一点，模拟真实上传感
    let current = 0
    const tick = () => {
      if (current >= 92) return
      const step = Math.max(1, Math.round((92 - current) * (Math.random() * 0.3 + 0.05)))
      current = Math.min(92, current + step)
      setProgress(current)
    }
    const timer = setInterval(tick, 180)

    try {
      await onImport(result)
    } finally {
      clearInterval(timer)
    }

    setProgress(100)
    setDone(true)
  }

  const count = preview ? preview.length - 1 : 0

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        className="talks-admin-action-btn"
        style={{ whiteSpace: 'nowrap' }}
        title="上传CSV文件批量导入"
        onClick={() => fileRef.current?.click()}
      >
        📥 批量导入
      </button>

      {preview && (
        <div className="csv-preview-overlay" onClick={() => { if (!importing) close() }}>
          <div className="csv-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="csv-preview-header">
              <h3>{done ? '导入完成' : importing ? '正在导入…' : `预览导入数据 (${count} 条)`}</h3>
              <button className="talks-admin-action-btn" onClick={close} disabled={importing}>取消</button>
            </div>

            {(importing || done) && (
              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bg-muted)',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%', borderRadius: '4px',
                      background: done ? '#2d8a4e' : 'var(--accent, #2563eb)',
                      width: `${progress}%`,
                      transition: 'width 0.25s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, minWidth: '2.8rem', textAlign: 'right', color: done ? '#2d8a4e' : 'var(--text)' }}>
                    {progress}%
                  </span>
                </div>
                {importing && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    正在保存 {count} 条数据…
                  </p>
                )}
                {done && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#2d8a4e' }}>
                    全部导入完成，共 {count} 条
                  </p>
                )}
              </div>
            )}

            {!importing && !done && (
              <div className="csv-preview-table-wrap">
                <table className="csv-preview-table">
                  <thead>
                    <tr>
                      {preview[0]?.map((h, i) => <th key={i}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(1, 11).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => <td key={j}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 11 && <p className="csv-preview-more">… 还有 {preview.length - 11} 条</p>}
              </div>
            )}

            <div className="csv-preview-actions">
              {!done && (
                <details style={{ marginBottom: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  <summary style={{ cursor: 'pointer', marginBottom: '0.35rem' }}>CSV格式说明</summary>
                  <pre style={{ background: 'var(--bg-muted)', padding: '0.5rem 0.75rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.75rem' }}>{sampleCsv}</pre>
                </details>
              )}
              {done ? (
                <button className="talks-admin-save-btn" onClick={close} style={{ background: '#2d8a4e' }}>
                  关闭
                </button>
              ) : (
                <button className="talks-admin-save-btn" onClick={confirm} disabled={importing}>
                  确认导入 {count} 条
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
