interface ScoreColor {
  solid: string
  bg: string
  border: string
  text: string
}

export function scoreColor(score: number): ScoreColor {
  if (score < 4) return { solid: '#dc2626', bg: 'rgba(220,38,38,0.07)',  border: 'rgba(220,38,38,0.28)',  text: '#991b1b' }
  if (score < 6) return { solid: '#d97706', bg: 'rgba(217,119,6,0.07)',  border: 'rgba(217,119,6,0.28)',  text: '#92400e' }
  if (score < 8) return { solid: '#2563eb', bg: 'rgba(37,99,235,0.07)',  border: 'rgba(37,99,235,0.28)',  text: '#1e3a8a' }
  return           { solid: '#059669', bg: 'rgba(5,150,105,0.07)',   border: 'rgba(5,150,105,0.28)',   text: '#065f46' }
}
