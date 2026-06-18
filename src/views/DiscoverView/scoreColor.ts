interface ScoreColor {
  solid: string
  bg: string
  border: string
  text: string
}

export function scoreColor(score: number): ScoreColor {
  if (score < 2) return { solid: '#dc2626', bg: 'rgba(220,38,38,0.07)',   border: 'rgba(220,38,38,0.28)',   text: '#991b1b' }
  if (score < 4) return { solid: '#ea580c', bg: 'rgba(234,88,12,0.07)',   border: 'rgba(234,88,12,0.28)',   text: '#9a3412' }
  if (score < 6) return { solid: '#ca8a04', bg: 'rgba(202,138,4,0.07)',   border: 'rgba(202,138,4,0.28)',   text: '#854d0e' }
  if (score < 8) return { solid: '#65a30d', bg: 'rgba(101,163,13,0.07)',  border: 'rgba(101,163,13,0.28)',  text: '#3f6212' }
  return           { solid: '#059669', bg: 'rgba(5,150,105,0.07)',    border: 'rgba(5,150,105,0.28)',   text: '#065f46' }
}
