# Trace schema

The current export schema is version 2. Version 1 imports are migrated locally and never overwrite their source file.

## Trace envelope

Required fields:

- `schemaVersion`: currently `2`.
- `traceId`: unique ID generated when recording starts.
- `status`: must be `complete` for import or export.
- `timeline`: ordered event array.

The envelope may also contain page and selected-element metadata, framework ownership, quality diagnostics, source-map results, and privacy-safe raw observations.

## Timeline event

Every event includes:

- `id`: stable within the trace.
- `kind`: interaction, handler, request, response, network-failure, async, worker, websocket, mutation, exception, or navigation.
- `atMs`: milliseconds relative to the interaction.
- `title` and optional `detail`.
- `confidence` and `confidenceLabel`.
- `parentId`: related parent event when directly available.
- `relationType`: semantic relationship or `observed-after-interaction` when causality is not established.
- `captureMethod`: browser/content/hook mechanism that produced the evidence.
- `privacyClassification`: the category of retained information.

## Compatibility

Schema version 1 is accepted by the import validator and upgraded to version 2 in memory. Unknown future versions are rejected. Consumers must ignore unknown fields and must not infer causality from array order or timing alone.
