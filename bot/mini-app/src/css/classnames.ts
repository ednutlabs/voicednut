export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Function which joins passed values with space following these rules:
 * 1. If value is non-empty string, it will be added to output.
 * 2. If value is object, only those keys will be added, which values are truthy.
 * 3. If value is array, classNames will be called with this value spread.
 * 4. All other values are ignored.
 *
 * You can find this function to similar one from the package {@link https://www.npmjs.com/package/classnames|classnames}.
 * @param values - values array.
 * @returns Final class name.
 */
export type ClassNamesValue = string | Record<string, boolean> | ClassNamesValue[] | undefined | null | boolean;

export function classNames(...values: ClassNamesValue[]): string {
  return values
    .map((value) => {
      if (typeof value === 'string') {
        return value;
      }

      if (isRecord(value)) {
        return Object.entries(value)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(' ');
      }

      if (Array.isArray(value)) {
        return classNames(...value);
      }

      return '';
    })
    .filter(Boolean)
    .join(' ');
}

export type ClassNameRecord = Record<string, ClassNamesValue>;

/**
 * Merges multiple class name objects into a single object.
 * Each key in the resulting object will contain the merged class names
 * from all objects for that key.
 */
export function mergeClassNames(...partials: ClassNameRecord[]): ClassNameRecord {
  return partials.reduce<ClassNameRecord>((acc, partial) => {
    if (!isRecord(partial)) {
      return acc;
    }
    
    Object.entries(partial).forEach(([key, value]) => {
      const className = classNames(acc[key], value);
      if (className) {
        acc[key] = className;
      }
    });
    
    return acc;
  }, {});
}