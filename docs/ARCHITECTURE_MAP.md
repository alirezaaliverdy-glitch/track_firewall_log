# Architecture Map

## High-Level Flow

User / Upload / Device Context

-> Backend processing

-> SecurityEvent

-> Detection/Incident

-> AI Assistant

-> ActionIntent

-> ActionPlan

-> PolicyGuard

-> Connector

-> AuditLog

## Backend Main Areas

- `backend/src/config/env.ts`: runtime configuration and safety validation
- `backend/prisma/schema.prisma`: database models
- `backend/src/services/providers`: AI providers
- `backend/src/ai/context`: AI context builder
- `backend/src/ai/prompts`: centralized prompt location
- `backend/src/actions` and action-plan services: action planning and lifecycle
- PolicyGuard services: execution safety checks
- `backend/src/connectors`: vendor execution/read connectors
- Device services/routes: device registry and credentials
- Incident/event services/routes: detection and security event storage
- Assessment/hardening services: security analysis and recommendations
- `backend/src/telemetry/linux`: read-only Linux snapshots, posture analysis, bounded stream sessions, and live signal parsing
- `backend/src/routes/linux-telemetry.ts`: authenticated snapshot, options, analysis, stream control, and SSE APIs

## Frontend Main Areas

- App shell and routing
- Auth/Login
- Dashboard
- Action Center
- AI Security Assistant
- Device management
- Security events/incidents
- Linux device telemetry
- UI components and animated background

## Core Product Rule

Action creation is permissive.

Execution is controlled.

## Action Flow

User request

-> AI/deterministic intent

-> catalog or generic action fallback

-> ActionPlan

-> UI review

-> user executes

-> PolicyGuard

-> connector

-> audit result

## AI Flow

User message

-> compact vendor-aware Evidence Pack (bounded events/findings/incidents/actions; secrets and raw logs excluded by default)

-> central system prompt

-> structured response

-> ActionIntent or explanation

-> ActionPlan if operational

## Connector Flow

Device credential reference

-> connector registry

-> vendor planner

-> controlled dry run / preflight

-> PolicyGuard and user confirmation

-> connector execution

-> verification, rollback metadata, and audit result

## Linux Telemetry Flow

Linux SSH device and existing credential reference

-> fixed read-only command allowlist

-> root / non-interactive sudo / limited privilege detection

-> partial structured `DeviceSnapshot`

-> Linux posture analyzer

-> compact AI context summary

Live selected source

-> bounded SSH stream

-> lightweight suspicious signal parser

-> SSE viewer and suspicious `SecurityEvent` persistence
