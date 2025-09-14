// bot/mini-app/src/css/bem.ts
import { classNames, isRecord } from '@/css/classnames';

export type BemModifierValue = string | Record<string, boolean>;
export type BemModifier = BemModifierValue | BemModifierValue[];

function applyMods(element: string, mod: BemModifier): string {
  if (Array.isArray(mod)) {
    return classNames(...mod.map(m => applyMods(element, m)));
  }
  if (isRecord(mod)) {
    return classNames(
      ...Object.entries(mod)
        .filter(([, v]) => v)
        .map(([key]) => `${element}--${key}`)
    );
  }
  return `${element}--${mod}`;
}

export type BlockFn = (...mods: BemModifier[]) => string;
export type ElemFn = (elem: string, ...mods: BemModifier[]) => string;

function computeClassnames(element: string, mods: BemModifier[]): string {
  return classNames(element, ...mods.map(mod => applyMods(element, mod)));
}

export function bem(block: string): [BlockFn, ElemFn] {
  return [
    (...mods: BemModifier[]) => computeClassnames(block, mods),
    (elem: string, ...mods: BemModifier[]) => computeClassnames(`${block}__${elem}`, mods),
  ];
}