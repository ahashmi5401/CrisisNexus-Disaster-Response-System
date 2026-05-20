# Final Production Stabilization Plan

## Scope
- crisis_nexus_ngo/ Next.js NGO dashboard
- crisis_nexus/ Flutter citizen app

## Goals
- Remove lint/analyzer failures that block production readiness.
- Fix unsafe async patterns, weak typing, and runtime-stability risks.
- Preserve all existing workflows, UI, Firestore schema, AI pipeline, and navigation.

## Planned Fix Areas
### NGO dashboard
- Replace unsafe `any` usage with typed models.
- Fix `AuthGuard` state handling to avoid effect-triggered state churn.
- Tighten auth/profile typing in `AuthProvider`.
- Add strict typing to alert panel data.
- Remove unused imports and obvious React cleanup issues in app pages.
- Validate map and crisis data before rendering markers and computed values.

### Flutter app
- Remove deprecated API usage and unused imports in aid/response screens.
- Add mounted checks before using `BuildContext` after async gaps.
- Make Firebase init failure handling safer in `main.dart`.
- Reduce analyzer warnings in the most problematic screens without changing UX.

## Validation
- Run `npm run lint` in `crisis_nexus_ngo/`.
- Run `npm run build` in `crisis_nexus_ngo/`.
- Run `flutter analyze` in `crisis_nexus/`.

## Deliverables
- Updated source files with production-safety fixes.
- `artifacts/final_production_stabilization_report.md` with before/after counts and verification output.
