import React from 'react'
import { Home, Download, Heart } from 'lucide-react'
import ServiceIcon from '../ServiceIcon'

export default function RouteIcon({ iconKey }) {
  if (iconKey === 'downloads') return <Download size={14} />
  if (iconKey === 'support') return <Heart size={14} />
  if (iconKey === 'youtube') return <ServiceIcon serviceKey="youtube" size={14} />
  if (iconKey === 'reddit') return <ServiceIcon serviceKey="reddit" size={14} />
  if (iconKey === 'x') return <ServiceIcon serviceKey="x" size={14} />
  if (iconKey === 'generic') return <ServiceIcon serviceKey="generic" size={14} />
  return <Home size={14} />
}
