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

## Frontend Main Areas

- App shell and routing
- Auth/Login
- Dashboard
- Action Center
- AI Security Assistant
- Device management
- Security events/incidents
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

-> security context

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
