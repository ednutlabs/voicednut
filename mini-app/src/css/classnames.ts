// bot/mini-app/src/css/classnames.ts
export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

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