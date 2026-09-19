# Phase 2 - Bundle and Runtime Optimization

Goal:
Reduce initial execution cost.

Analyze:
- remaining main chunk
- React dependencies
- charts
- tables
- icons
- i18n
- utilities

Tasks:
- identify unused imports
- lazy load safe heavy modules
- remove duplicate packages
- optimize dependency graph

Do not:
- remove required libraries
- change UI behavior

Measure:
before/after bundle
FCP
DOMContentLoaded
runtime errors