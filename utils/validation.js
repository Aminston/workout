// src/utils/validation.js

/**
 * Checks if a given value is valid against a specified enum list.
 * @param {*} value - The value to validate (may be undefined).
 * @param {{ key: string }[]} enumList - Array of objects with `key` properties.
 * @returns {boolean} True if value is undefined or matches one of the enum keys.
 */
export function isEnumValid(value, enumList) {
  return value === undefined || enumList.some(opt => opt.key === value);
}
