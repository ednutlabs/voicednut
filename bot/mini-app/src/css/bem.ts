import { classNames, isRecord } from '@/css/classnames.js';

export type BemModifierValue = string | Record<string, boolean>;
export type BemModifier = BemModifierValue | BemModifierValue[];

/**
 * Applies mods to the specified element.
 * @param element - element name.
 * @param mod - mod to apply.
 */
function applyMods(element: string, mod: BemModifier | BemModifier[]): string {
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

/**
 * Computes final classname for the specified element.
 * @param element - element name.
 * @param mods - mod to apply.
 */
export type BlockFn = (...mods: BemModifier[]) => string;
export type ElemFn = (elem: string, ...mods: BemModifier[]) => string;

function computeClassnames(element: string, mods: BemModifier[]): string {
  return classNames(element, ...mods.map(mod => applyMods(element, mod)));
}

/**
 * @returns A tuple, containing two functions. The first one generates classnames list for the
 * block, the second one generates classnames for its elements.
 * @param block - BEM block name.
 */
export function bem(block: string): [BlockFn, ElemFn] {
  return [
    (...mods: BemModifier[]) => computeClassnames(block, mods),
    (elem: string, ...mods: BemModifier[]) => computeClassnames(`${block}__${elem}`, mods),
  ];
}