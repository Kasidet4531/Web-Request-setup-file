# 1. NestJS and PostgreSQL for Backend Service

We decided to use NestJS (TypeScript) with PostgreSQL for the backend service, rejecting the alternative of Rust Axum.

## Context

The specification proposed two primary choices for the Backend API Service: Rust Axum (for maximum performance and safety) and NestJS/TypeScript (for development speed and ease of onboarding). 

## Decision

We chose NestJS (TypeScript) with PostgreSQL because:
- **Low concurrent usage**: The system has a small user base of around 30 total users and a maximum of 5 concurrent users, meaning the ultra-high performance and low resource footprint of Rust is not a critical requirement.
- **Development velocity**: Using NestJS allows us to share TypeScript models and validations between the frontend and backend, speeding up the implementation of dynamic form schemas and canonical field mappings.
