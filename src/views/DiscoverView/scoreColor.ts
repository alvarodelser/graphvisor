interface ScoreColor {
  solid: string
  bg: string
  border: string
  text: string
}

export function scoreColor(score: number): ScoreColor {
  if (score <= 2) return { solid: '#dc2626', bg: 'rgba(220,38,38,0.07)',   border: 'rgba(220,38,38,0.28)',   text: '#991b1b' }
  if (score < 4)  return { solid: '#ea580c', bg: 'rgba(234,88,12,0.07)',   border: 'rgba(234,88,12,0.28)',   text: '#9a3412' }
  if (score < 6)  return { solid: '#ca8a04', bg: 'rgba(202,138,4,0.07)',   border: 'rgba(202,138,4,0.28)',   text: '#854d0e' }
  if (score < 8)  return { solid: '#7fb800', bg: 'rgba(127,184,0,0.07)',   border: 'rgba(127,184,0,0.28)',   text: '#4d7000' }
  return           { solid: '#16a34a', bg: 'rgba(22,163,74,0.07)',    border: 'rgba(22,163,74,0.28)',   text: '#14532d' }
}
