export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  const targetUrl = req.query?.url
  if (typeof targetUrl !== 'string' || !targetUrl) {
    res.status(400).json({ message: 'Missing url query parameter.' })
    return
  }

  try {
    const headers = {}
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization
    }

    const targetResponse = await fetch(targetUrl, {
      method: 'GET',
      headers,
    })

    const contentType = targetResponse.headers.get('content-type') || ''
    const responseBytes = new Uint8Array(await targetResponse.arrayBuffer())
    const responsePreview = new TextDecoder('utf-8')
      .decode(responseBytes)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)

    if (contentType) {
      res.setHeader('content-type', contentType)
    }

    res.status(targetResponse.status)
    if (!targetResponse.ok) {
      res.json({
        message: `Upstream returned HTTP ${targetResponse.status}`,
        contentType,
        preview: responsePreview,
      })
      return
    }

    const contentLength = targetResponse.headers.get('content-length')
    if (contentLength) {
      res.setHeader('content-length', contentLength)
    }

    res.send(Buffer.from(responseBytes))
  } catch (error) {
    res.status(502).json({
      message: error instanceof Error ? error.message : 'Proxy fetch failed',
    })
  }
}
