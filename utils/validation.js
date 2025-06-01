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

export function validateWorkoutModificationInput(data) {
  const { program_id, workout_id, day, sets, reps, weight_value } = data;

  if (!program_id || !workout_id || !day) {
    return { valid: false, message: 'Missing required identifiers: program_id, workout_id, or day.' };
  }

  const fieldsChanged = [sets, reps, weight_value].some(
    val => typeof val === 'number' && !isNaN(val)
  );

  if (!fieldsChanged) {
    return {
      valid: false,
      message: 'At least one of sets, reps, or weight_value must be changed from its original value.'
    };
  }

  return { valid: true };
}
