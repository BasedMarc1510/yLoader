/**
 * Smart parser for video titles to extract metadata (title, artist, album)
 */

/**
 * Parse a video title and extract artist, title, and album information
 * Handles common patterns like:
 * - "Artist - Title"
 * - "Artist feat. Artist2 - Title"
 * - "Artist & Artist2 - Title"
 * - "Title (Official Video)"
 * - "Artist - Title (prod. by Producer)"
 * - "Artist - Album - Title"
 * 
 * @param {string} videoTitle - The raw video title
 * @returns {{title: string, artist: string, album: string}} Parsed metadata
 */
export function parseVideoTitle(videoTitle) {
  if (!videoTitle || typeof videoTitle !== 'string') {
    return { title: '', artist: '', album: '' }
  }

  let title = videoTitle.trim()
  let artist = ''
  let album = ''

  // Remove common suffixes like (Official Video), [Official Audio], etc.
  const suffixPatterns = [
    /\s*\(official\s+(video|audio|music\s+video|mv|lyric\s+video)\)/gi,
    /\s*\[official\s+(video|audio|music\s+video|mv|lyric\s+video)\]/gi,
    /\s*\|\s*official\s+(video|audio|music\s+video)/gi,
    /\s*-\s*official\s+(video|audio|music\s+video)/gi,
  ]
  
  suffixPatterns.forEach(pattern => {
    title = title.replace(pattern, '')
  })

  // Remove producer credits like (prod. by Someone) or (produced by Someone)
  title = title.replace(/\s*\(prod(?:uced)?\s*\.?\s*by\s+[^)]+\)/gi, '')

  // Try to extract artist and title using common separator patterns
  // Pattern 1: "Artist - Title" or "Artist1 & Artist2 - Title" or "Artist feat. Someone - Title"
  const dashPattern = /^([^-]+?)\s*[-–—]\s*(.+)$/
  const dashMatch = title.match(dashPattern)
  
  if (dashMatch) {
    const leftPart = dashMatch[1].trim()
    const rightPart = dashMatch[2].trim()
    
    // Check if there's another dash in rightPart (could be Artist - Album - Title)
    const secondDashMatch = rightPart.match(/^([^-]+?)\s*[-–—]\s*(.+)$/)
    
    if (secondDashMatch) {
      // Pattern: "Artist - Album - Title"
      artist = leftPart
      album = secondDashMatch[1].trim()
      title = secondDashMatch[2].trim()
    } else {
      // Pattern: "Artist - Title"
      artist = leftPart
      title = rightPart
    }
  }

  // Clean up artist name (remove featuring, feat, ft, etc. and everything after)
  // But keep the featuring artists in the artist field
  if (artist) {
    // Keep the full artist string including featuring artists
    artist = artist.trim()
  }

  // Clean up title (remove any remaining parentheses with extra info)
  title = title.replace(/\s*\([^)]*\bfeat\b[^)]*\)/gi, '') // Remove (feat. ...) from title
  title = title.replace(/\s*\[[^\]]*\bfeat\b[^\]]*\]/gi, '') // Remove [feat. ...] from title
  
  // Final cleanup - trim whitespace
  title = title.trim()
  artist = artist.trim()
  album = album.trim()

  return { title, artist, album }
}

/**
 * Examples:
 * 
 * parseVideoTitle("Bonez MC & RAF Camora feat. Gzuz & Maxwell - Kontrollieren (prod. by Beataura & RAF Camora)")
 * => { title: "Kontrollieren", artist: "Bonez MC & RAF Camora feat. Gzuz & Maxwell", album: "" }
 * 
 * parseVideoTitle("Ed Sheeran - Shape of You (Official Video)")
 * => { title: "Shape of You", artist: "Ed Sheeran", album: "" }
 * 
 * parseVideoTitle("The Beatles - Abbey Road - Come Together")
 * => { title: "Come Together", artist: "The Beatles", album: "Abbey Road" }
 * 
 * parseVideoTitle("Just a regular video title without any pattern")
 * => { title: "Just a regular video title without any pattern", artist: "", album: "" }
 */
