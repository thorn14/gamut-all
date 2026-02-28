// ── Fixed dimension types ────────────────────────────────────────────────────

export type FontSizeClass = '12px' | '14px' | '16px' | '20px' | '24px' | '32px';
export type StackClass = string;
export type VisionMode = 'default' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'achromatopsia';
export type StepSelectionStrategy = 'closest' | 'mirror-closest';

export const ALL_FONT_SIZES: FontSizeClass[] = ['12px', '14px', '16px', '20px', '24px', '32px'];
// Default stack names — used as fallback when config.stacks is not provided.
// Users may define any stack names they choose.
export const DEFAULT_STACK_NAMES: StackClass[] = ['root', 'card', 'popover', 'tooltip', 'modal', 'overlay'];
// Backward-compatible alias used across registry/rule-generation paths.
export const ALL_STACKS: StackClass[] = DEFAULT_STACK_NAMES;
export const ALL_VISION_MODES: VisionMode[] = ['default', 'deuteranopia', 'protanopia', 'tritanopia', 'achromatopsia'];

// ── Variant key ──────────────────────────────────────────────────────────────

export type VariantKey = `${string}__${FontSizeClass}__${string}__${StackClass}__${VisionMode}`;

// ── Input types ──────────────────────────────────────────────────────────────

export interface TokenInput {
  $schema?: string;
  config?: {
    wcagTarget?: 'AA' | 'AAA';
    complianceEngine?: 'wcag21' | 'apca';
    onUnresolvedOverride?: 'error' | 'warn';
    defaultTheme?: string;
    stepSelectionStrategy?: StepSelectionStrategy;
    stacks?: Partial<Record<StackClass, number>>;
  };
  primitives: Record<string, string[]>;
  themes: Record<string, ThemeInput>;
  surfaces?: Record<string, SurfaceInput>;
  semantics: Record<string, SemanticInput>;
}

export interface ThemeInput {
  ramp: string;
  step: number;
  fallback?: string[];
  aliases?: string[];
  tone?: Record<string, {
    ramp?: string;
    step?: number;
    fallback?: string[];
    aliases?: string[];
  }>;
}

export interface SurfaceInput {
  ramp: string;
  step: number;
}

export type SemanticInput = {
  ramp: string;
  defaultStep: number;
  overrides?: ContextOverrideInput[];
  tone?: Record<string, {
    ramp?: string;
    defaultStep?: number;
    overrides?: ContextOverrideInput[];
  }>;
  interactions?: Record<string, { step: number; overrides?: ContextOverrideInput[] }>;
  vision?: Record<string, {
    ramp?: string;
    defaultStep?: number;
    overrides?: ContextOverrideInput[];
  }>;
};

export interface ContextOverrideInput {
  bg?: string | string[];
  fontSize?: string | string[];
  stack?: string | string[];
  step: number;
}

// ── Processed/internal types ─────────────────────────────────────────────────

export interface ProcessedInput {
  ramps: Map<string, ProcessedRamp>;
  themes: Map<string, ProcessedTheme>;
  surfaces: Map<string, ProcessedSurface>;
  semantics: Map<string, ProcessedSemantic>;
  stacks: Map<StackClass, number>;
  config: Required<Omit<NonNullable<TokenInput['config']>, 'stacks'>>;
}

export interface ProcessedRamp {
  name: string;
  steps: ProcessedStep[];
  stepCount: number;
}

export interface ProcessedStep {
  index: number;
  hex: string;
  oklch: { l: number; c: number; h: number };
  relativeLuminance: number;
}

export interface StackSurface {
  step: number;
  hex: string;
  relativeLuminance: number;
}

export interface ProcessedTheme {
  name: string;
  ramp: string;
  step: number;
  hex: string;
  relativeLuminance: number;
  fallback: string[];
  aliases: string[];
  elevationDirection: 'lighter' | 'darker';
  surfaces: Map<StackClass, StackSurface>;
}

export interface ProcessedSurface {
  name: string;
  ramp: string;
  step: number;
  hex: string;
  relativeLuminance: number;
}

export interface ProcessedSemantic {
  name: string;
  ramp: ProcessedRamp;
  defaultStep: number;
  overrides: ContextOverrideInput[];
  interactions: Record<string, { step: number; overrides: ContextOverrideInput[] }>;
  vision: Record<string, { ramp: ProcessedRamp; defaultStep: number; overrides: ContextOverrideInput[] }>;
}

export interface ContextRule {
  bg: string;
  fontSize: FontSizeClass;
  stack: StackClass;
  step: number;
}

// ── Registry types ───────────────────────────────────────────────────────────

export interface ResolvedVariant {
  ramp: string;
  step: number;
  hex: string;
  compliance: ComplianceEvaluation;
}

export interface TokenRegistry {
  ramps: Map<string, ProcessedRamp>;
  themes: Map<string, ProcessedTheme>;
  themeFallbacks: Record<string, string[]>;
  surfaces: Map<string, ProcessedSurface>;
  variantMap: Map<VariantKey, ResolvedVariant>;
  defaults: Record<string, string>;
  meta: {
    generatedAt: string;
    totalVariants: number;
    tokenCount: number;
    complianceEngine: string;
    wcagTarget: 'AA' | 'AAA';
    inputHash: string;
  };
}

export interface DesignContext {
  fontSize: FontSizeClass;
  bgClass: string;
  stackDepth: StackClass;
  visionMode: VisionMode;
}

// ── Compliance types ─────────────────────────────────────────────────────────

export type ComplianceContext = {
  fontSizePx: number;
  fontWeight: number;
  target: 'text';
  level: 'AA' | 'AAA';
};

export type ComplianceEvaluation = {
  pass: boolean;
  metric: string;
  value: number;
  required?: number;
  polarity?: 'dark-on-light' | 'light-on-dark';
};

export interface ComplianceEngine {
  id: string;
  evaluate(fgHex: string, bgHex: string, context: ComplianceContext): ComplianceEvaluation;
  preferredDirection?(bgHex: string): 'lighter' | 'darker' | 'either';
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}
