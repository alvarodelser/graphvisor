import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from '../src/components/SearchBar/SearchBar'

describe('SearchBar', () => {
  it('shows both sections and picks a result', () => {
    const pick = vi.fn()
    const all = vi.fn()
    render(
      <SearchBar placeholder="Search" query="autoph" onQueryChange={() => {}} sections={[
        { title: 'Titles', kind: 'lexical', items: [{ key: 'd1', primary: 'Autophagy flux', onPick: pick }],
          action: { label: 'Select all 1', onClick: all } },
        { title: 'Arguments', kind: 'semantic', loading: true, items: [] },
      ]} />,
    )
    fireEvent.focus(screen.getByLabelText('Search'))
    expect(screen.getByText('by words')).toBeInTheDocument()
    expect(screen.getByText('Searching…')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Autophagy flux'))
    expect(pick).toHaveBeenCalled()
    expect(screen.queryByText('Titles')).toBeNull()   // closed after picking
  })

  it('stays closed below the minimum query length', () => {
    render(<SearchBar placeholder="Search" query="a" onQueryChange={() => {}} sections={[
      { title: 'Titles', kind: 'lexical', items: [] }]} />)
    fireEvent.focus(screen.getByLabelText('Search'))
    expect(screen.queryByText('Titles')).toBeNull()
  })
})
