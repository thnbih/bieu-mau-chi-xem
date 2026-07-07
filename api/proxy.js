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

    const contentType = targetResponse.headers.get('content-type')
    if (contentType) {
      res.setHeader('content-type', contentType)
    }

    const contentLength = targetResponse.headers.get('content-length')
    if (contentLength) {
      res.setHeader('content-length', contentLength)
    }

    res.status(targetResponse.status)
    res.send(Buffer.from(await targetResponse.arrayBuffer()))
  } catch (error) {
    res.status(502).json({
      message: error instanceof Error ? error.message : 'Proxy fetch failed',
    })
  }
}
