import React from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react'

export default function SeverityIcon({ severity, size = 18 }) {
  switch (severity) {
    case 'error':
      return <AlertCircle size={size} color="#e53935" />
    case 'warning':
      return <AlertTriangle size={size} color="#fb8c00" />
    case 'success':
      return <CheckCircle size={size} color="#43a047" />
    default:
      return <Info size={size} color="#0288d1" />
  }
}
