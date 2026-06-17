# Discover View List Layout Redesign

**Date:** 2026-06-17  
**Status:** Design approved

## Overview

Rearrange the Discover View from a 2-column grid layout to a single-column scrollable list, emphasizing hypothesis titles with inline radar charts showing score dimensions.

## Layout

### Current State
- 2-column grid of hypothesis cards
- Header with filter chips (All/ADVANCE/BORDERLINE) and sort selector
- Each card displays full hypothesis details

### New Design
- Single-column scrollable list
- No header controls (filters and sorting removed)
- Each list item: horizontal layout with title on left, score + radar chart on right

## List Item Structure

Each list item displays:

**Left side:**
- Hypothesis title (larger, prominent text)

**Right side:**
- Score value (numeric)
- Mini radar chart (SVG) showing 4 dimensions:
  - Novelty
  - Scientific Plausibility
  - Potential Impact
  - Commercial Potential

The radar chart is dimensionally consistent across all items for easy visual comparison.

## Content & Data

- Display all hypotheses in the list (no filtering)
- No sorting mechanism
- Maintain the 4-dimensional scoring system from the existing component
- List scrolls vertically to accommodate all hypotheses

## Responsive Behavior

- On small screens (< 600px): Stack text above radar chart if needed, or maintain horizontal layout with smaller radar
- Radar chart scales proportionally with available space

## Technical Notes

- Remove filter chips and sort select from header
- Replace grid layout with flex-based list container
- Integrate radar chart rendering for each item (likely using D3 or canvas)
- Maintain existing hypothesis data structure from DataService

## Out of Scope

- Modifying hypothesis data model
- Changing the 4 score dimensions
- Adding new filtering/sorting features
- Hypothesis card details/expansion view
