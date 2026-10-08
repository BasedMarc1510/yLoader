import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { probeMedia, validateEdit, buildEditArgs, runEdit } from './processing.js'
import { createTimelineVisuals } from './visuals.js'

export function registerMediaEditor(app, { db, downloadsDir, getFfmpeg, getFfprobe }) {
  let busy = false
  let visualsBusy = false
  const getRow = id => new Promise((resolve, reject) => {
    db.get('SELECT * FROM downloads WHERE id = ?', [id], (err, row) => err ? reject(err) : resolve(row))
  })
  async function source(req) {
    if (!/^\d+$/.test(req.params.id)) throw new Error('NOT_FOUND')
    const row = await getRow(req.params.id)
    if (!row || !['video', 'audio'].includes(row.download_type)) throw new Error('NOT_FOUND')
    // Paths come exclusively from completed downloads, never from request input.
    const input = row.local_path || path.join(downloadsDir, path.basename(row.filename || ''))
    if (!fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error('NOT_FOUND')
    fs.utimesSync(input, new Date(), new Date())
    return { row, input }
  }
  function failure(res, error) {
    if (res.destroyed || res.headersSent) return
    const code = error.code === 'ENOENT' ? 'TOOLS_MISSING' : ['NOT_FOUND', 'INVALID_OPTIONS', 'BUSY', 'TOOLS_MISSING'].includes(error.message)
      ? error.message : 'PROCESSING_FAILED'
    const status = { NOT_FOUND: 404, INVALID_OPTIONS: 400, BUSY: 409, TOOLS_MISSING: 503 }[code] || 500
    res.status(status).json({ code })
  }
  app.get('/api/downloads/:id/media', async (req, res) => {
    try {
      if (!getFfmpeg() || !getFfprobe()) throw new Error('TOOLS_MISSING')
      const { input } = await source(req)
      res.json(await probeMedia(getFfprobe(), input))
    } catch (err) { failure(res, err) }
  })
  app.get('/api/downloads/:id/preview', async (req, res) => {
    try {
      const { input } = await source(req)
      res.sendFile(path.resolve(input), err => { if (err) failure(res, err) })
    } catch (err) { failure(res, err) }
  })
  app.get('/api/downloads/:id/timeline', async (req, res) => {
    if (visualsBusy) return failure(res, new Error('BUSY'))
    visualsBusy = true
    const controller = new AbortController()
    const cancel = () => { if (!res.writableEnded) controller.abort() }
    res.on('close', cancel)
    try {
      if (!getFfmpeg() || !getFfprobe()) throw new Error('TOOLS_MISSING')
      const { input } = await source(req)
      const media = await probeMedia(getFfprobe(), input)
      if (controller.signal.aborted) throw new Error('ABORTED')
      res.json(await createTimelineVisuals(getFfmpeg(), input, media, controller.signal))
    } catch (err) { failure(res, err) }
    finally { visualsBusy = false; res.off('close', cancel) }
  })
  app.get('/api/downloads/:id/file', async (req, res) => {
    try {
      const { input, row } = await source(req)
      res.download(path.resolve(input), row.filename, err => { if (err) failure(res, err) })
    } catch (err) { failure(res, err) }
  })
  app.post('/api/downloads/:id/edit', async (req, res) => {
    if (busy) return failure(res, new Error('BUSY'))
    busy = true
    let output = ''
    const controller = new AbortController()
    const cancel = () => { if (!res.writableEnded) controller.abort() }
    res.on('close', cancel)
    try {
      if (!getFfmpeg() || !getFfprobe()) throw new Error('TOOLS_MISSING')
      const { input, row } = await source(req)
      const media = await probeMedia(getFfprobe(), input)
      if (controller.signal.aborted) throw new Error('PROCESSING_FAILED')
      const edit = validateEdit(req.body || {}, media)
      const extension = edit.audioOnly ? '.m4a' : '.mp4'
      const filename = `${path.parse(row.filename).name.slice(0, 100)}-edit-${crypto.randomBytes(6).toString('hex')}${extension}`
      output = path.join(path.dirname(input), filename)
      await runEdit(getFfmpeg(), buildEditArgs(input, output, edit, media), controller.signal)
      if (controller.signal.aborted) throw new Error('PROCESSING_FAILED')
      const id = await new Promise((resolve, reject) => {
        db.run(`INSERT INTO downloads (video_id, title, duration, timestamp, download_type, format_id, filename, service, source_url, thumbnail_url, local_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.video_id, row.title, edit.end - edit.start, new Date().toISOString(), edit.audioOnly ? 'audio' : 'video',
          extension.slice(1), filename, row.service, row.source_url, row.thumbnail_url, output],
        function (err) { err ? reject(err) : resolve(this.lastID) })
      })
      output = ''
      res.json({ id, filename, duration: edit.end - edit.start })
    } catch (err) {
      if (output) {
        try { fs.rmSync(output, { force: true }) }
        catch { console.warn('Could not remove an incomplete editor export') }
      }
      failure(res, err)
    } finally {
      busy = false
      res.off('close', cancel)
    }
  })
}
