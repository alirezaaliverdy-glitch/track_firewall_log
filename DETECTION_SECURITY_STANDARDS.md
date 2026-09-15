# Detection and Security Data Standards

## Rule principles

Every rule must be:

- structured;
- versioned;
- testable;
- mapped to telemetry;
- mapped to ATT&CK when relevant;
- explicit about false positives;
- localized;
- auditable.

## Quality metrics

Track:

- telemetry availability;
- parser compatibility;
- positive/negative fixture results;
- false-positive ratio;
- duplicate overlap;
- freshness;
- no-signal rules;
- noisy rules;
- ATT&CK coverage;
- field mapping quality;
- last test date.

## Event normalization

Every vendor mapper records:

- source;
- mapper version;
- mapped fields;
- unmapped fields;
- confidence;
- raw reference.

## Persian findings

Curated:
- rule title
- rule description
- false-positive guidance
- standard response

Dynamic:
- asset context
- evidence
- impact
- recommended investigation

UI must distinguish curated, deterministic-template and AI-generated content.

## Rule testing

Support:

- schema validation;
- positive fixture;
- negative fixture;
- field availability;
- simulation;
- regression;
- version diff;
- performance bounds.

## ATT&CK mapping

Record:

- tactic;
- technique/sub-technique;
- evidence;
- confidence;
- source rule;
- required data component/telemetry.

## Import gate

Imported rules remain disabled until:

- schema valid;
- fields mapped;
- fixtures pass;
- severity reviewed;
- false positives reviewed;
- ATT&CK mapping reviewed;
- owner approval.
