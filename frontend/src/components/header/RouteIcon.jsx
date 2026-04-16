import React from 'react'
import { Home, Search, Download, Heart } from 'lucide-react'
import ServiceIcon from '../ServiceIcon'
import { normalizeServiceKey } from '../../utils/metadata'

export default function RouteIcon({ iconKey }) {
  if (iconKey === 'search') return <Search size={14} />
  if (iconKey === 'downloads') return <Download size={14} />
  if (iconKey === 'support') return <Heart size={14} />

  const serviceKey = normalizeServiceKey(iconKey)
  if (serviceKey) return <ServiceIcon serviceKey={serviceKey} size={14} />

  return <Home size={14} />
}
