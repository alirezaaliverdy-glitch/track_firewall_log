# Current Project Status

## Product

Firewall Log Analyzer / AI Security Orchestrator.

## Current Stage

MVP / prototype moving toward Mini-SOAR.

## Completed So Far

- React/Vite frontend
- Fastify/TypeScript backend
- Prisma/PostgreSQL schema
- Login/auth page
- Main app UI polish
- Animated main app background
- Action Center redesign
- Device registry
- Security event store
- Detection engine foundation
- Incident builder foundation
- AI Security Assistant
- ActionPlan / PolicyGuard / Audit foundation
- MikroTik controlled execution foundation
- Project config and production safety cleanup
- Central AI brain with permissive universal action planning
- Linux read-only security snapshot and live telemetry foundation
- Linux telemetry device alias selection and configured SSH management-port handling
- One-click Linux live monitoring with real-time findings and proposal-only fix actions
- Multi-vendor Full Analysis and Hardening profiles for MikroTik, Linux, FortiGate, pfSense, Cisco, and generic devices
- Compact, vendor-aware AI Evidence Packs with bounded events, findings, incidents, actions, secret filtering, and raw-log exclusion by default
- Central Security Orchestrator prompt and structured analysis/action output contracts across in-app AI provider calls
- Vendor-aware telemetry profile registry for 12 platforms and a normalized persisted Finding engine
- Shared snapshot/live aggregation, noise suppression, stable fingerprints, live finding SSE, and proposal-only finding remediation
- Persian-first backend Command Catalog foundation with six vendors, Persian search/filter UI, ActionPlan handoff, and proposal-only AI fallback
- Strict command-catalog lifecycle with startup validation, real execution-template registry, pre-creation parameter validation, device/vendor filtering, and explicit implemented/manual/planned/unsupported states

## Protected Behavior

These must not be changed unless explicitly requested:

- `ACTION_EXECUTION_MODE=quick_controlled`
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`
- Existing MikroTik quick execution flow
- Action creation should be permissive
- Execution should remain controlled and audited

## Current Strengths

- ActionPlan architecture exists
- Vendor connector architecture exists
- MikroTik support is strongest
- The product catalog currently exposes 14 connector-backed commands: 8 Linux and 6 MikroTik; other prepared operations are explicit manual-only or planned items
- Full Analysis is grouped by vendor/device and reports collected data, missing telemetry, findings, and proposed actions
- AI Chat sends the provider a compact Evidence Pack instead of the full legacy security context and exposes lightweight context metadata
- Vendor hardening findings can create review-only ActionPlans without automatic execution
- UI is becoming premium and usable
- Backend has meaningful security models

## Current Weaknesses

- Event Intelligence Core is not yet mature
- Non-Linux vendor collectors/parsers still need to feed their scaffolded profiles into the shared Finding Engine
- Detection Engine needs correlation/rule DSL
- Verification and rollback are incomplete
- Linux telemetry needs broader distro and production-host testing
- FortiGate support needs deeper real-world testing
- Reporting is not complete

## Next Planned Tasks

- Event Intelligence Core
- Task 13: Detection Engine 2.0
- Task 14: Action Verification and Rollback
- Task 15: Report Generator

The next product-catalog iteration should promote manual/planned items only after real connector handlers and verification paths exist, and continue Persian localization without changing controlled execution.

## Last Updated

2026-07-04
