/**
 * Type definitions for env-loader
 */

export interface EnvProvider {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  has(key: string): boolean;
}

export class ProcessEnvProvider implements EnvProvider {
  get(key: string): string | undefined {
    return process.env[key as any];
  }

  set(key: string, value: string): void {
    process.env[key as any] = value;
  }

  has(key: string): boolean {
    return key in process.env;
  }
}

export type ParseOperation = "set" | "append" | "prepend" | "default";

export interface ParsedVar {
  key: string;
  value: string;
  operation: ParseOperation;
}

export interface ParseResult {
  vars: ParsedVar[];
  errors: string[];
}

export interface InterpolationWarning {
  varName: string;
  originalValue: string;
}

export interface EnvChangesResult {
  toSet: Map<string, string>;
  skipped: { key: string; reason: "protected" | "exists" }[];
  warnings: InterpolationWarning[];
}