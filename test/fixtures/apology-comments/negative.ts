// Validate before persisting so malformed records never enter storage.
export const accepted = validate(input);
