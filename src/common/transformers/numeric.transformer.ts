import { ValueTransformer } from 'typeorm';

/**
 * `numeric` columns come back from pg as strings. This keeps them numbers
 * on the entity side so arithmetic (stock math) never turns into "10" + 5.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : parseFloat(value),
};
