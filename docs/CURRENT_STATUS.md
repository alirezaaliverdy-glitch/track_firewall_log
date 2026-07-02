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
- UI is becoming premium and usable
- Backend has meaningful security models

## Current Weaknesses

- Event Intelligence Core is not yet mature
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

## Last Updated

2026-07-02
