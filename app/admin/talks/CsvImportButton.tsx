'use client'

import { useState, useRef } from 'react'

interface CsvImportProps {
  columns: { key: string; label: string }[]
  onImport: (rows: Record<string, string>[]) => void
  sampleCsv: string
}

export function CsvImportButton({ columns, onImport, sampleCsv }: CsvImportProps) {
  const [preview, setPreview] = useState<string[][] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsv(reader.result as string)
      setPreview(rows)
    }
    reader.readAsText(file, 'UTF-8')
    // reset so same file can be re-selected
    if (fileRef.current) fileRef.current.value = ''
  }

  function confirm() {
    if (!preview || preview.length < 2) return
    const [header, ...dataRows] = preview
    const keyMap = new Map<string, string>()
    for (const col of columns) {
      const idx = header.findIndex((h) => h.trim() === col.key)
      if (idx >= 0) keyMap.set(col.key, header[idx])
    }
    const result = dataRows.map((row) => {
      const obj: Record<string, string> = {}
      for (const col of columns) {
        const idx = header.findIndex((h) => h.trim() === col.key)
        obj[col.key] = idx >= 0 ? (row[idx] ?? '') : ''
      }
      return obj
    })
    onImport(result)
    setPreview(null)
  }

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
        <div className="csv-preview-overlay" onClick={() => setPreview(null)}>
          <div className="csv-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="csv-preview-header">
              <h3>预览导入数据 ({preview.length - 1} 条)</h3>
              <button className="talks-admin-action-btn" onClick={() => setPreview(null)}>取消</button>
            </div>
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
            <div className="csv-preview-actions">
              <details style={{ marginBottom: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '0.35rem' }}>CSV格式说明</summary>
                <pre style={{ background: 'var(--bg-muted)', padding: '0.5rem 0.75rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.75rem' }}>{sampleCsv}</pre>
              </details>
              <button className="talks-admin-save-btn" onClick={confirm}>确认导入 {preview.length - 1} 条</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
