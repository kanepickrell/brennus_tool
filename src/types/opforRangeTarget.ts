/**
 * Range Design target types.
 *
 * These types describe target infrastructure nodes that the operator lays down
 * on the canvas BEFORE building the attack. A target is a pure data container:
 * it has outputs only, no trigger chain, no script emission of its own except
 * as a block of suite-level ${TARGET_*} variables at the top of the generated
 * .robot file.
 *
 * These live in a separate file from opfor.ts for two reasons:
 *   1. opfor.ts is already long and covers the opforNode + library module shape
 *   2. Range targets are orthogonal to opforNodes in the node type hierarchy.
 *
 * The expectation is that opfor.ts re-exports these so existing imports keep
 * working. See the bottom of opfor.ts for the re-export block to add.
 */

/**
 * The kinds of infrastructure we model in v1.
 *
 * Adding a new kind is a three-step change:
 *   1. Add the literal here.
 *   2. Add a template to RANGE_TARGET_TEMPLATES in src/data/rangeTargets.ts.
 *   3. Add an icon/color entry to the same file.
 */
export type RangeTargetKind =
  | 'windows-host'
  | 'ad-domain-controller'
  | 'network-device'
  | 'web-server'
  | 'mail-server';

/**
 * How a sensitive field is emitted into the generated .robot script.
 *
 *   'plain' — emit as `${TARGET_NAME_FIELD}` with the literal value inline.
 *            Fine for lab ranges where the .robot file doesn't leave the box.
 *
 *   'env'   — emit as `%{TARGET_NAME_FIELD}` so Robot Framework reads the value
 *            from the runtime environment. The .robot file is safe to commit
 *            or share; the operator exports the env var before running.
 *
 * Non-sensitive fields ignore this entirely and always emit as 'plain'.
 */
export type RangeTargetEmitMode = 'plain' | 'env';

export interface RangeTargetField {
  /** Short identifier, lowercased and underscored. e.g. 'ip', 'hostname', 'dc_role' */
  id: string;
  /** Human label shown in the inspector and on the card preview. e.g. 'IP Address' */
  label: string;
  /** Input widget hint. 'password' masks the value in the UI. */
  type: 'string' | 'number' | 'password' | 'select';
  /** Current value. Empty string = unset. */
  value: string;
  /** Placeholder shown in the inspector input when value is empty. */
  placeholder?: string;
  /**
   * Category tokens this field autopopulates on downstream commands.
   *
   * When the PropertiesPanel is deciding which target fields to suggest for a
   * given command parameter, it takes the first token of the param's default
   * variable reference (e.g. `${TARGET_IP}` -> 'TARGET_IP', or arguably just
   * 'TARGET' depending on the resolver; see resolveVariableReference for the
   * exact rule) and looks for a field whose suggestsFor array contains that
   * token.
   *
   * Fields without suggestsFor get no source handle and show up in the
   * inspector but are not offered as connection suggestions. Use this for
   * notes-style fields like 'description' or 'last_patched'.
   */
  suggestsFor?: string[];
  /** For type === 'select', the allowed values. Ignored otherwise. */
  options?: string[];
  /**
   * Marks the field as credential-like. The UI masks the value and the
   * generator respects emitMode. Unset defaults to false.
   */
  sensitive?: boolean;
  /**
   * How to emit this field into the generated .robot. Only consulted for
   * sensitive fields. Unset defaults to 'plain'.
   */
  emitMode?: RangeTargetEmitMode;
}

export interface RangeTargetData {
  /** Stable across rerenders. Used as part of the emitted variable name. */
  targetId: string;
  /** One of the five kinds; determines default fields on creation. */
  kind: RangeTargetKind;
  /**
   * Operator-assigned human name. Becomes part of the generated variable name
   * after slugging: "WIN-DC01" -> `${TARGET_WIN_DC01_IP}`.
   *
   * Name collisions across targets are the operator's responsibility; we do
   * not enforce uniqueness here. If two targets share a name, both will emit
   * the same variable names and the second will overwrite the first in the
   * Robot variable table. TODO: surface a collision warning in the palette.
   */
  name: string;
  /** Emoji or single-glyph icon shown on the card badge. */
  icon: string;
  /** All fields, keyed by field.id. Ordering preserved in inspector via Object.values. */
  fields: Record<string, RangeTargetField>;
  /** Free-form operator notes; not emitted into the script. */
  notes?: string;
}

/**
 * Discriminated union for the drag-and-drop payload out of NodePalette.
 *
 * The palette used to setData JSON of the bare opfor node definition. We now
 * wrap that so WorkflowBuilder's onDrop can branch on the node type without
 * parsing shape heuristics.
 *
 * Consumers: src/components/workflow/NodePalette.tsx (producer),
 *            src/components/workflow/WorkflowBuilder.tsx (consumer).
 */
export type CanvasDragPayload =
  | { __dragType: 'opforNode'; payload: unknown } // existing OpforNodeDefinition
  | { __dragType: 'rangeTarget'; payload: RangeTargetDragPayload };

export interface RangeTargetDragPayload {
  kind: RangeTargetKind;
}